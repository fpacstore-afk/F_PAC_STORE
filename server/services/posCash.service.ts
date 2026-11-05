import { FieldValue } from 'firebase-admin/firestore';
import { financialDateKey, validFinancialDay } from '../../shared/cashFlow.js';
import { getOrderPaidAmount, getOrderRefundedAmount } from '../../shared/orderFinancialCore.js';
import { getDb } from '../firebase.js';
import { PosError, posOrderId, type PosOperator } from './pos.service.js';

const drawerCollection = 'pos_cash_drawer';

export function validatePosCents(value: unknown, label: string, max = 10_000_000) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) {
    throw new PosError(400, 'Valor inválido para ' + label + '.');
  }
  return value;
}

export async function getPosCashDrawer() {
  const current = (await getDb().collection(drawerCollection).doc('current').get()).data();
  return { current: current || null };
}

export async function updatePosCashDrawer(action: unknown, body: any, operator: PosOperator) {
  if (action !== 'open' && action !== 'adjust' && action !== 'close') throw new PosError(400, 'Operação de caixa inválida.');
  const operationId = posOrderId(body?.requestId).slice('MANUAL-PDV-'.length);
  const cents = validatePosCents(body?.cents, 'caixa');
  const direction = body?.direction;
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 180) : '';
  if (action === 'adjust' && (!cents || !reason || !['in', 'out'].includes(direction))) {
    throw new PosError(400, 'Informe valor, tipo e motivo da movimentação.');
  }
  const sessionId = action === 'open' ? operationId : body?.sessionId;
  if (typeof sessionId !== 'string' || sessionId.length !== 36) throw new PosError(400, 'Identificação da sessão inválida.');
  const signature = JSON.stringify([action, cents, sessionId, action === 'adjust' ? direction : null, reason]);
  const db = getDb();
  const ref = db.collection(drawerCollection).doc('current');
  const eventRef = db.collection('pos_cash_events').doc(operationId);
  return db.runTransaction(async tx => {
    const [currentSnap, prior] = await Promise.all([tx.get(ref), tx.get(eventRef)]);
    const current = currentSnap.data();
    if (prior.exists) {
      if (prior.data()?.signature !== signature) throw new PosError(409, 'Esta tentativa já pertence a outra operação.');
      return { current: current || null };
    }
    const at = new Date().toISOString();
    const actor = operator.email || operator.uid;
    let next;
    if (action === 'open') {
      if (current?.state === 'open') throw new PosError(409, 'Já existe um caixa físico aberto.');
      next = { sessionId, state: 'open', openingCents: cents, expectedCents: cents, salesCents: 0, openedAt: at, openedBy: actor };
    } else {
      if (current?.state !== 'open' || current.sessionId !== sessionId) throw new PosError(409, 'O caixa mudou. Atualize a sessão.');
      if (action === 'adjust') {
        const expectedCents = current.expectedCents + (direction === 'in' ? cents : -cents);
        if (expectedCents < 0) throw new PosError(409, 'A retirada excede o dinheiro esperado no caixa.');
        next = { ...current, expectedCents };
      } else {
        next = { ...current, state: 'closed', countedCents: cents, differenceCents: cents - current.expectedCents, closedAt: at, closedBy: actor };
      }
    }
    tx.set(ref, next);
    tx.set(eventRef, { action, sessionId, cents, direction: action === 'adjust' ? direction : null, reason, operator: actor, at, signature,
      previousExpectedCents: current?.expectedCents ?? null, expectedCents: next.expectedCents,
      ...(action === 'close' ? { differenceCents: next.differenceCents } : {}) });
    return { current: next };
  });
}

export async function listPosCardSettlements() {
  const rows = await getDb().collection('orders').where('posCardSettlement.state', '==', 'awaiting').limit(100).get();
  return { pending: rows.docs.map(doc => {
    const order = doc.data();
    return {
      requestId: doc.id.slice('MANUAL-PDV-'.length), orderId: doc.id, saleDate: order.saleDate,
      method: order.paymentMethod, paidCents: Math.round(getOrderPaidAmount(order) * 100),
      refundedCents: Math.round(getOrderRefundedAmount(order) * 100)
    };
  }) };
}

export async function settlePosCard(requestId: unknown, body: any, operator: PosOperator) {
  const orderId = posOrderId(requestId);
  const depositCents = validatePosCents(body?.depositCents, 'crédito na conta', 2_000_000_000);
  const feeCents = validatePosCents(body?.feeCents, 'taxa da operadora', 2_000_000_000);
  const refundCents = validatePosCents(body?.refundCents, 'estorno descontado', 2_000_000_000);
  const reference = typeof body?.reference === 'string' ? body.reference.trim().slice(0, 120) : '';
  const date = body?.date;
  if (!reference || !validFinancialDay(date) || date > financialDateKey(new Date())!) throw new PosError(400, 'Informe a referência e a data efetiva do crédito.');
  const db = getDb();
  const ref = db.collection('orders').doc(orderId);
  const eventRef = db.collection('audit_logs').doc('pos_settlement_' + orderId);
  return db.runTransaction(async tx => {
    const order = (await tx.get(ref)).data();
    const old = order?.posCardSettlement;
    if (!old || order?.posState !== 'completed') throw new PosError(404, 'Venda de cartão do PDV não encontrada.');
    const signature = JSON.stringify([depositCents, feeCents, refundCents, date, reference]);
    if (old.state === 'settled') {
      if (old.signature !== signature) throw new PosError(409, 'Esta venda já tem uma conciliação. Confira o histórico.');
      return { orderId, settled: true };
    }
    if (date < order.saleDate || refundCents > Math.round(getOrderRefundedAmount(order) * 100) ||
        depositCents + feeCents + refundCents !== Math.round(getOrderPaidAmount(order) * 100)) {
      throw new PosError(409, 'O valor depositado, a taxa e os estornos descontados devem fechar com o valor pago.');
    }
    const at = new Date().toISOString();
    tx.update(ref, {
      posCardSettlement: { state: 'settled', date, depositCents, feeCents, refundCents, reference, signature, at, operator: operator.uid },
      'payment.gatewayFee': feeCents / 100,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(eventRef, {
      action: 'POS_CARD_SETTLED', resource: 'orders', resourceId: orderId, userId: operator.uid,
      userEmail: operator.email || '', timestamp: at, metadata: { date, depositCents, feeCents, refundCents, reference }
    });
    return { orderId, settled: true };
  });
}
