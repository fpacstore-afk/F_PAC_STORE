/**
 * HELPER DE CONSULTA DE DATASET COMERCIAL CANÔNICO
 * FASE 9.6.6 / 9.6.7 — FPAC Store
 *
 * Fornece busca de dados financeiros, pedidos, tráfego, investimentos e catálogo
 * SEM full-scan, utilizando dual range queries (ISO String + Timestamp) e deduplicação por doc ID.
 */

import { Timestamp } from 'firebase-admin/firestore';

export interface CommercialDataset {
  orders: any[];
  expenses: any[];
  traffic: any[];
  investments: any[];
  products: any[];
}

/**
 * Busca dataset comercial estritamente limitado ao intervalo de datas [startDateStr, endDateStr].
 * Suporta formatos de data ISO String e Firestore Timestamp com deduplicação.
 */
export async function fetchCommercialDataset(
  db: any,
  startDateStr: string,
  endDateStr: string
): Promise<CommercialDataset> {
  const startIsoString = startDateStr.includes('T') ? startDateStr : `${startDateStr}T00:00:00.000Z`;
  const endIsoString = endDateStr.includes('T') ? endDateStr : `${endDateStr}T23:59:59.999Z`;

  const startDateObj = new Date(startIsoString);
  const endDateObj = new Date(endIsoString);

  let startTimestamp: any;
  let endTimestamp: any;

  try {
    startTimestamp = Timestamp.fromDate(startDateObj);
    endTimestamp = Timestamp.fromDate(endDateObj);
  } catch {
    startTimestamp = {
      seconds: Math.floor(startDateObj.getTime() / 1000),
      nanoseconds: (startDateObj.getTime() % 1000) * 1000000,
      toDate: () => startDateObj,
      toMillis: () => startDateObj.getTime()
    };
    endTimestamp = {
      seconds: Math.floor(endDateObj.getTime() / 1000),
      nanoseconds: (endDateObj.getTime() % 1000) * 1000000,
      toDate: () => endDateObj,
      toMillis: () => endDateObj.getTime()
    };
  }

  const dateOnlyStart = startDateStr.split('T')[0];
  const dateOnlyEnd = endDateStr.split('T')[0];

  const startSeconds = Math.floor(startDateObj.getTime() / 1000);
  const endSeconds = Math.floor(endDateObj.getTime() / 1000);

  const [
    ordersStringSnap,
    ordersTimestampSnap,
    ordersSecondsSnap,
    cashflowSnap,
    trafficSnap,
    investmentsSnap,
    productsSnap
  ] = await Promise.all([
    db.collection('orders')
      .where('createdAt', '>=', startIsoString)
      .where('createdAt', '<=', endIsoString)
      .get(),
    db.collection('orders')
      .where('createdAt', '>=', startTimestamp)
      .where('createdAt', '<=', endTimestamp)
      .get(),
    db.collection('orders')
      .where('createdAt', '>=', startSeconds)
      .where('createdAt', '<=', endSeconds)
      .get(),
    db.collection('financial_cashflow')
      .where('date', '>=', dateOnlyStart)
      .where('date', '<=', dateOnlyEnd)
      .get(),
    db.collection('financial_traffic')
      .where('date', '>=', dateOnlyStart)
      .where('date', '<=', dateOnlyEnd)
      .get(),
    db.collection('financial_investments')
      .where('date', '>=', dateOnlyStart)
      .where('date', '<=', dateOnlyEnd)
      .get(),
    db.collection('products').get()
  ]);

  // Deduplicação dos pedidos por ID
  const ordersMap = new Map<string, any>();
  if (ordersStringSnap?.docs) {
    ordersStringSnap.docs.forEach((doc: any) => ordersMap.set(doc.id, { id: doc.id, ...doc.data() }));
  }
  if (ordersTimestampSnap?.docs) {
    ordersTimestampSnap.docs.forEach((doc: any) => ordersMap.set(doc.id, { id: doc.id, ...doc.data() }));
  }
  if (ordersSecondsSnap?.docs) {
    ordersSecondsSnap.docs.forEach((doc: any) => ordersMap.set(doc.id, { id: doc.id, ...doc.data() }));
  }
  const orders = Array.from(ordersMap.values());

  const expenses = cashflowSnap?.docs ? cashflowSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) : [];
  const traffic = trafficSnap?.docs ? trafficSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) : [];
  const investments = investmentsSnap?.docs ? investmentsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) : [];
  const products = productsSnap?.docs ? productsSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) : [];

  return { orders, expenses, traffic, investments, products };
}
