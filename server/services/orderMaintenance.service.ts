import crypto from 'crypto';
import admin from 'firebase-admin';
import { getDb } from '../firebase.js';

export const ORDER_MAINTENANCE_CONFIRMATION = 'FINALIZAR_PEDIDOS_E_EXCLUIR_TESTES';

interface MaintenanceOrder {
  id: string;
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
}

export interface OrderMaintenancePreview {
  totalOrders: number;
  testOrders: number;
  realOrders: number;
  realOrdersToFinalize: number;
  alreadyFinalized: number;
  linkedTestFinancialEvents: number;
  reviewCandidates: Array<{ id: string; customerName: string; reason: string }>;
  previewHash: string;
}

interface OrderMaintenancePlan extends OrderMaintenancePreview {
  testOrderDocs: MaintenanceOrder[];
  realOrdersToFinalizeDocs: MaintenanceOrder[];
  linkedFinancialEventDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  reviewCandidateDocs: MaintenanceOrder[];
}

function isStrictFinancialTestOrder(order: MaintenanceOrder): boolean {
  return /^test_order_fin_\d+$/.test(order.id)
    && String(order.data.customerName || '').trim() === 'Cliente Teste Financeiro'
    && String(order.data.customerEmail || '').trim().toLowerCase() === 'cliente@teste.com';
}

function isFinalized(order: MaintenanceOrder): boolean {
  const orderStatus = String(order.data.status || '').trim().toLowerCase();
  const productionStatus = String(
    order.data.production?.status || order.data.productionStatus || ''
  ).trim().toLowerCase();
  return orderStatus === 'completed' && productionStatus === 'completed';
}

async function buildPlan(): Promise<OrderMaintenancePlan> {
  const db = getDb();
  const ordersSnapshot = await db.collection('orders').get();
  const orders: MaintenanceOrder[] = ordersSnapshot.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    data: doc.data()
  }));

  const testOrderDocs = orders.filter(isStrictFinancialTestOrder);
  const reviewCandidateDocs = orders.filter((order) => (
    !isStrictFinancialTestOrder(order) && !order.data.createdAt
  ));
  const reviewCandidateIds = new Set(reviewCandidateDocs.map((order) => order.id));
  const realOrderDocs = orders.filter((order) => (
    !isStrictFinancialTestOrder(order) && !reviewCandidateIds.has(order.id)
  ));
  const realOrdersToFinalizeDocs = realOrderDocs.filter((order) => !isFinalized(order));
  const linkedFinancialEventDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

  const testOrderIds = testOrderDocs.map((order) => order.id);
  for (let index = 0; index < testOrderIds.length; index += 30) {
    const idChunk = testOrderIds.slice(index, index + 30);
    const events = await db.collection('financial_events')
      .where('orderId', 'in', idChunk)
      .get();
    linkedFinancialEventDocs.push(...events.docs);
  }

  const planIdentity = {
    testOrderIds: testOrderDocs.map((order) => order.id).sort(),
    realOrderIds: realOrdersToFinalizeDocs.map((order) => order.id).sort(),
    financialEventIds: linkedFinancialEventDocs.map((doc) => doc.id).sort(),
    reviewCandidateIds: reviewCandidateDocs.map((order) => order.id).sort()
  };
  const previewHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(planIdentity))
    .digest('hex');

  return {
    totalOrders: orders.length,
    testOrders: testOrderDocs.length,
    realOrders: realOrderDocs.length,
    realOrdersToFinalize: realOrdersToFinalizeDocs.length,
    alreadyFinalized: realOrderDocs.length - realOrdersToFinalizeDocs.length,
    linkedTestFinancialEvents: linkedFinancialEventDocs.length,
    reviewCandidates: reviewCandidateDocs.map((order) => ({
      id: order.id,
      customerName: String(order.data.customerName || order.data.customer?.name || 'Sem nome'),
      reason: 'Documento sem data de criação; não aparece na lista ordenada do painel.'
    })),
    previewHash,
    testOrderDocs,
    realOrdersToFinalizeDocs,
    linkedFinancialEventDocs,
    reviewCandidateDocs
  };
}

function toPreview(plan: OrderMaintenancePlan): OrderMaintenancePreview {
  return {
    totalOrders: plan.totalOrders,
    testOrders: plan.testOrders,
    realOrders: plan.realOrders,
    realOrdersToFinalize: plan.realOrdersToFinalize,
    alreadyFinalized: plan.alreadyFinalized,
    linkedTestFinancialEvents: plan.linkedTestFinancialEvents,
    reviewCandidates: plan.reviewCandidates,
    previewHash: plan.previewHash
  };
}

export async function previewOrderMaintenance(): Promise<OrderMaintenancePreview> {
  return toPreview(await buildPlan());
}

export async function executeOrderMaintenance(
  expectedPreviewHash: string,
  confirmation: string,
  operator: string
): Promise<OrderMaintenancePreview> {
  if (confirmation !== ORDER_MAINTENANCE_CONFIRMATION) {
    const error: any = new Error('Confirmação administrativa inválida.');
    error.code = 'MAINTENANCE_CONFIRMATION_REQUIRED';
    error.status = 400;
    throw error;
  }

  const plan = await buildPlan();
  if (!expectedPreviewHash || expectedPreviewHash !== plan.previewHash) {
    const error: any = new Error('Os pedidos mudaram desde a prévia. Atualize a conferência antes de executar.');
    error.code = 'MAINTENANCE_PREVIEW_STALE';
    error.status = 409;
    throw error;
  }

  if (plan.reviewCandidates.length > 0) {
    const error: any = new Error('Existem registros sem data de criação que precisam ser classificados antes da execução.');
    error.code = 'MAINTENANCE_REVIEW_REQUIRED';
    error.status = 409;
    throw error;
  }

  const timestamp = new Date().toISOString();
  const db = getDb();
  const writer = db.bulkWriter();

  for (const eventDoc of plan.linkedFinancialEventDocs) {
    writer.delete(eventDoc.ref);
  }
  for (const testOrder of plan.testOrderDocs) {
    writer.delete(testOrder.ref);
  }
  for (const order of plan.realOrdersToFinalizeDocs) {
    writer.update(order.ref, {
      status: 'completed',
      'production.status': 'completed',
      'production.currentStage': 'completed',
      'production.enteredAt': timestamp,
      'production.updatedAt': timestamp,
      productionStatus: 'completed',
      completedAt: order.data.completedAt || timestamp,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      administrativeCloseout: {
        completedAt: timestamp,
        operator,
        reason: 'Encerramento histórico solicitado pelo proprietário',
        preservedFinancialAndShippingState: true
      },
      history: admin.firestore.FieldValue.arrayUnion({
        type: 'administrative_closeout',
        status: 'completed',
        previousStatus: order.data.status || null,
        previousProductionStatus: order.data.production?.status || order.data.productionStatus || null,
        timestamp,
        message: 'Pedido histórico finalizado administrativamente sem alterar pagamento, frete ou estoque.',
        operator
      })
    });
  }

  await writer.close();

  return toPreview(plan);
}
