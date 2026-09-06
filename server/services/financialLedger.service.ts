import admin from "firebase-admin";
import crypto from "crypto";
import { getDb } from '../firebase.js';

export type FinancialEventType =
  | 'payment_created'
  | 'payment_approved'
  | 'partial_payment'
  | 'manual_payment'
  | 'refund'
  | 'partial_refund'
  | 'payment_cancelled'
  | 'payment_rejected'
  | 'manual_adjustment'
  | 'expense_created'
  | 'expense_voided'
  | 'investment_created'
  | 'investment_voided'
  | 'traffic_expense_created'
  | 'traffic_voided'
  | 'gateway_fee_adjusted'
  | 'shipping_cost_recorded'
  | 'payable_created'
  | 'payable_partial_payment'
  | 'payable_paid'
  | 'payable_voided'
  | 'supplier_created'
  | 'supplier_updated'
  | 'supplier_deactivated';

export interface FinancialEvent {
  id?: string;
  orderId?: string;
  type: FinancialEventType;
  amount: number;
  previousStatus?: string;
  newStatus?: string;
  previousPaidAmount?: number;
  newPaidAmount?: number;
  previousPendingAmount?: number;
  newPendingAmount?: number;
  previousRefundedAmount?: number;
  newRefundedAmount?: number;
  paymentMethod?: string;
  provider?: string;
  providerPaymentId?: string;
  actorId?: string;
  actorEmail?: string;
  reason?: string;
  category?: string;
  idempotencyKey?: string;
  createdAt?: string;
  recordedAt?: any;
}

/**
 * Deriva um ID determinístico SHA-256 estável para o documento do ledger a partir da chave de idempotência.
 */
export function deriveLedgerEventId(idempotencyKey: string): string {
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
    throw new Error('IDEMPOTENCY_KEY_REQUIRED');
  }
  return crypto.createHash('sha256').update(idempotencyKey.trim()).digest('hex');
}

function buildFinancialEventData(event: FinancialEvent, docId: string) {
  return {
    ...event,
    id: docId,
    amount: Number(event.amount) || 0,
    previousPaidAmount: Number(event.previousPaidAmount) || 0,
    newPaidAmount: Number(event.newPaidAmount) || 0,
    previousPendingAmount: Number(event.previousPendingAmount) || 0,
    newPendingAmount: Number(event.newPendingAmount) || 0,
    previousRefundedAmount: Number(event.previousRefundedAmount) || 0,
    newRefundedAmount: Number(event.newRefundedAmount) || 0,
    createdAt: event.createdAt || new Date().toISOString(),
    recordedAt: admin.firestore.FieldValue.serverTimestamp()
  };
}

/**
 * Registra um evento imutável no ledger financeiro (append-only).
 * Suporta chave de idempotência determinística e execução transacional.
 */
export async function recordFinancialEvent(
  event: FinancialEvent,
  customDb?: any,
  transaction?: admin.firestore.Transaction
): Promise<string> {
  const db = customDb || getDb();
  const docId = event.idempotencyKey ? deriveLedgerEventId(event.idempotencyKey) : undefined;
  const docRef = docId
    ? db.collection('financial_events').doc(docId)
    : db.collection('financial_events').doc();
  const eventData = buildFinancialEventData(event, docRef.id);

  if (transaction) {
    if (docId) {
      const existingSnap = await transaction.get(docRef);
      if ((existingSnap as any).exists) {
        return docRef.id;
      }
    }
    transaction.set(docRef, eventData);
  } else if (docId) {
    // FINANCEIRO 2.0: deterministic/idempotent events must be created under
    // one Firestore transaction. A standalone get() followed by set() allows
    // two concurrent writers to both observe "missing" and the second writer
    // to overwrite the first event, violating the append-only ledger contract.
    await db.runTransaction(async (tx: admin.firestore.Transaction) => {
      const existingSnap = await tx.get(docRef);
      if ((existingSnap as any).exists) {
        return;
      }
      tx.set(docRef, eventData);
    });
  } else {
    await docRef.set(eventData);
  }

  console.log(`💰 [LEDGER] Recorded event '${event.type}' for order #${event.orderId} (R$ ${event.amount}) [DocId: ${docRef.id}]`);
  return docRef.id;
}

/**
 * Retorna os eventos financeiros de um pedido específico ordenados cronologicamente.
 */
export async function getFinancialEventsForOrder(orderId: string): Promise<FinancialEvent[]> {
  const db = getDb();
  const snapshot = await db.collection('financial_events')
    .where('orderId', '==', orderId)
    .get();

  const events: FinancialEvent[] = [];
  snapshot.forEach(docSnap => {
    events.push(docSnap.data() as FinancialEvent);
  });

  return events.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
}

/**
 * Retorna a lista global do ledger financeiro com paginação.
 */
export async function getFinancialLedger(limitCount: number = 100): Promise<FinancialEvent[]> {
  const db = getDb();
  const snapshot = await db.collection('financial_events')
    .limit(limitCount)
    .get();

  const events: FinancialEvent[] = [];
  snapshot.forEach(docSnap => {
    events.push(docSnap.data() as FinancialEvent);
  });

  return events.sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime());
}
