/**
 * SUÍTE DE TESTES E PROVAS DE CERTIFICAÇÃO DA FASE 9.6.7-E
 * Fechamento Final de Attribution, Line Performance, Governança, Concorrência & Provas de Regras
 */

import fs from 'fs';
import path from 'path';
import {
  setCommercialExecutionDb,
  computeActionActualImpactCanonical,
  createCommercialExecutionCycleController,
  activateCommercialExecutionCycleController,
  addCommercialActionToCycleController,
  readyCommercialActionController,
  startCommercialActionController,
  blockCommercialActionController,
  completeCommercialActionController,
  recalculateCommercialExecutionCycleController,
  recalculateCommercialActionImpactController,
  getCommercialExecutionDashboardController
} from '../server/controllers/commercialExecution.controller.js';
import { fetchCommercialDataset } from '../server/utils/commercialDataset.js';
import {
  calculateOrderProfitability,
  calculateProductProfitability,
  aggregateProfitabilityByLine
} from '../src/utils/profitability.js';
import { calculateFinancialDRE } from '../src/utils/orderFinancial.js';
import { CommercialExecutionActionItem } from '../src/types/commercialExecution.js';

// In-Memory Mock Database com suporte a transações atômicas e queries
class MockFirestore {
  private data: Record<string, Record<string, any>> = {};

  collection(name: string) {
    if (!this.data[name]) this.data[name] = {};
    return {
      doc: (id?: string) => {
        const docId = id || ('doc_' + Math.random().toString(36).substring(2, 10));
        return {
          id: docId,
          get: async () => ({
            exists: !!this.data[name][docId],
            id: docId,
            data: () => this.data[name][docId] ? JSON.parse(JSON.stringify(this.data[name][docId])) : undefined
          }),
          set: async (val: any) => {
            this.data[name][docId] = JSON.parse(JSON.stringify(val));
          },
          update: async (val: any) => {
            this.data[name][docId] = { ...(this.data[name][docId] || {}), ...JSON.parse(JSON.stringify(val)) };
          },
          delete: async () => {
            delete this.data[name][docId];
          }
        };
      },
      where: (field: string, op: string, val: any) => this.query(name, [{ field, op, val }]),
      get: async () => ({
        empty: Object.keys(this.data[name]).length === 0,
        docs: Object.keys(this.data[name]).map(id => ({
          id,
          data: () => JSON.parse(JSON.stringify(this.data[name][id]))
        }))
      })
    };
  }

  private query(name: string, filters: { field: string; op: string; val: any }[]) {
    return {
      where: (field: string, op: string, val: any) => {
        return this.query(name, [...filters, { field, op, val }]);
      },
      orderBy: (field: string, dir: string) => this.query(name, filters),
      limit: (n: number) => ({
        get: async () => {
          const allDocs = Object.keys(this.data[name] || {}).map(id => ({
            id,
            ...this.data[name][id]
          }));
          const filtered = allDocs.filter(doc => {
            return filters.every(f => {
              const docVal = doc[f.field];
              if (f.op === '==') return docVal === f.val;
              if (f.op === '>=') {
                const cmpA = typeof f.val === 'object' && f.val?.seconds ? f.val.seconds : f.val;
                const cmpB = typeof docVal === 'object' && docVal?.seconds ? docVal.seconds : docVal;
                return cmpB >= cmpA;
              }
              if (f.op === '<=') {
                const cmpA = typeof f.val === 'object' && f.val?.seconds ? f.val.seconds : f.val;
                const cmpB = typeof docVal === 'object' && docVal?.seconds ? docVal.seconds : docVal;
                return cmpB <= cmpA;
              }
              return true;
            });
          });
          return {
            empty: filtered.length === 0,
            docs: filtered.slice(0, n).map(d => ({
              id: d.id,
              data: () => JSON.parse(JSON.stringify(d))
            }))
          };
        }
      }),
      get: async () => {
        const allDocs = Object.keys(this.data[name] || {}).map(id => ({
          id,
          ...this.data[name][id]
        }));
        const filtered = allDocs.filter(doc => {
          return filters.every(f => {
            const docVal = doc[f.field];
            if (f.op === '==') return docVal === f.val;
            if (f.op === '>=') {
              const cmpA = typeof f.val === 'object' && f.val?.seconds ? f.val.seconds : f.val;
              const cmpB = typeof docVal === 'object' && docVal?.seconds ? docVal.seconds : docVal;
              return cmpB >= cmpA;
            }
            if (f.op === '<=') {
              const cmpA = typeof f.val === 'object' && f.val?.seconds ? f.val.seconds : f.val;
              const cmpB = typeof docVal === 'object' && docVal?.seconds ? docVal.seconds : docVal;
              return cmpB <= cmpA;
            }
            return true;
          });
        });
        return {
          empty: filtered.length === 0,
          docs: filtered.map(d => ({
            id: d.id,
            data: () => JSON.parse(JSON.stringify(d))
          }))
        };
      }
    };
  }

  private txQueue: Promise<any> = Promise.resolve();

  async runTransaction(cb: (tx: any) => Promise<any>) {
    const run = async () => {
      const tx = {
        get: async (docRef: any) => docRef.get(),
        set: async (docRef: any, data: any) => docRef.set(data),
        update: async (docRef: any, data: any) => docRef.update(data),
        delete: async (docRef: any) => docRef.delete()
      };
      return cb(tx);
    };

    const res = this.txQueue.then(run, run);
    this.txQueue = res.catch(() => {});
    return res;
  }

  getRawCollection(name: string) {
    return this.data[name] || {};
  }
}

function createMockReqRes(body: any = {}, params: any = {}, headers: any = {}, query: any = {}) {
  const req: any = {
    body,
    params,
    headers: { 'idempotency-key': 'test-key', ...headers },
    query,
    user: { uid: 'admin_test', email: 'fpacstore@gmail.com', name: 'Admin Test' }
  };
  let statusCode = 200;
  let responseData: any = null;
  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData
  };
  return { req, res };
}

async function runTests() {
  console.log('=================================================================');
  console.log('🚀 INICIANDO CERTIFICAÇÃO FASE 9.6.7-E (FINAL PROOFS & ATTRIBUTION)');
  console.log('=================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  const catalogProducts = [
    { id: 'p_force_a', slug: 'force-a', line: 'FORCE', name: 'Camiseta FORCE A', price: 100, costPrice: 35 },
    { id: 'p_force_b', slug: 'force-b', line: 'FORCE', name: 'Camiseta FORCE B', price: 150, costPrice: 50 },
    { id: 'p_mark', slug: 'mark-a', line: 'MARK', name: 'Camiseta MARK', price: 200, costPrice: 70 },
    { id: 'p_prime', slug: 'prime-a', line: 'PRIME', name: 'Camiseta PRIME', price: 120, costPrice: 40 }
  ];

  // -------------------------------------------------------------------------
  // TESTE 1: ITEM-LEVEL DIRECT ATTRIBUTION vs ORDER-LEVEL TRACKING
  // -------------------------------------------------------------------------
  console.log('--- TESTE 1: Item-Level vs Order-Level Tracking Separation ---');
  {
    const orderItemLevelMatch = {
      id: 'ord_item_match',
      createdAt: '2026-06-05T12:00:00.000Z',
      paymentStatus: 'approved',
      pricing: { total: 450 },
      payment: { paidAmount: 450, gatewayFee: 15 },
      shipping: { shippingSubsidy: 10 },
      items: [
        { productId: 'p_force_a', slug: 'force-a', line: 'FORCE', price: 100, quantity: 1, actionTrackingId: 'TRACK_01' },
        { productId: 'p_force_b', slug: 'force-b', line: 'FORCE', price: 150, quantity: 1 }, // sem tracking
        { productId: 'p_mark', slug: 'mark-a', line: 'MARK', price: 200, quantity: 1 } // sem tracking
      ]
    };

    const actionItemTracking: CommercialExecutionActionItem = {
      id: 'act_item_track',
      executionCycleId: 'cycle_test',
      title: 'Ação Item Tracking',
      actionType: 'price_promotion',
      productLine: 'FORCE',
      executionStatus: 'in_progress',
      status: 'in_progress',
      actionTrackingId: 'TRACK_01',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-30'
    } as any;

    const dataset = {
      orders: [orderItemLevelMatch],
      expenses: [],
      investments: [],
      traffic: [],
      products: catalogProducts
    };

    const impact = computeActionActualImpactCanonical({
      action: actionItemTracking,
      dataset,
      startDate: '2026-06-01',
      endDate: '2026-06-30'
    });

    assert(impact.impactAttribution === 'direct', 'Item match produces direct impactAttribution');
    assert(impact.revenue === 100, `Item match isolates revenue to 100 (got: ${impact.revenue}) - NOT 250, NOT 450`);
    assert(impact.units === 1, `Item match isolates units to 1 (got: ${impact.units})`);
    assert(impact.orders === 1, 'Item match counts 1 eligible order');
  }

  // -------------------------------------------------------------------------
  // TESTE 2: FIXTURE SAME-LINE (FORCE A com tracking vs FORCE B sem tracking)
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 2: Fixture Same-Line (FORCE A vs FORCE B) ---');
  {
    const sameLineOrder = {
      id: 'ord_same_line',
      createdAt: '2026-06-10T10:00:00.000Z',
      paymentStatus: 'approved',
      pricing: { total: 450 },
      payment: { paidAmount: 450 },
      items: [
        { productId: 'p_force_a', slug: 'force-a', line: 'FORCE', price: 100, quantity: 1, actionTrackingId: 'TRACK_SAME_LINE' },
        { productId: 'p_force_b', slug: 'force-b', line: 'FORCE', price: 150, quantity: 1 },
        { productId: 'p_mark', slug: 'mark-a', line: 'MARK', price: 200, quantity: 1 }
      ]
    };

    const actionSameLine: CommercialExecutionActionItem = {
      id: 'act_same_line',
      executionCycleId: 'cycle_test',
      title: 'Ação Same Line FORCE',
      actionType: 'price_promotion',
      productLine: 'FORCE',
      executionStatus: 'in_progress',
      status: 'in_progress',
      actionTrackingId: 'TRACK_SAME_LINE',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-30'
    } as any;

    const dataset = {
      orders: [sameLineOrder],
      expenses: [],
      investments: [],
      traffic: [],
      products: catalogProducts
    };

    const impact = computeActionActualImpactCanonical({
      action: actionSameLine,
      dataset,
      startDate: '2026-06-01',
      endDate: '2026-06-30'
    });

    assert(impact.impactAttribution === 'direct', 'impactAttribution is direct');
    assert(impact.revenue === 100, `revenue is strictly 100 (got: ${impact.revenue})`);
    assert(impact.units === 1, `units is strictly 1 (got: ${impact.units})`);
  }

  // -------------------------------------------------------------------------
  // TESTE 3: ORDER-LEVEL TRACKING (Aplica a todos os itens da linha)
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 3: Order-Level Tracking (All Line Items) ---');
  {
    const orderWithOrderLevelCoupon = {
      id: 'ord_order_track',
      createdAt: '2026-06-12T10:00:00.000Z',
      couponCode: 'CUPOM_FORCE_GERAL',
      paymentStatus: 'approved',
      pricing: { total: 450 },
      payment: { paidAmount: 450 },
      items: [
        { productId: 'p_force_a', slug: 'force-a', line: 'FORCE', price: 100, quantity: 1 },
        { productId: 'p_force_b', slug: 'force-b', line: 'FORCE', price: 150, quantity: 1 },
        { productId: 'p_mark', slug: 'mark-a', line: 'MARK', price: 200, quantity: 1 }
      ]
    };

    const actionOrderLevel: CommercialExecutionActionItem = {
      id: 'act_order_level',
      executionCycleId: 'cycle_test',
      title: 'Ação Order Level Coupon',
      actionType: 'coupon_campaign',
      productLine: 'FORCE',
      executionStatus: 'in_progress',
      status: 'in_progress',
      actionTrackingId: 'CUPOM_FORCE_GERAL',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-30'
    } as any;

    const dataset = {
      orders: [orderWithOrderLevelCoupon],
      expenses: [],
      investments: [],
      traffic: [],
      products: catalogProducts
    };

    const impact = computeActionActualImpactCanonical({
      action: actionOrderLevel,
      dataset,
      startDate: '2026-06-01',
      endDate: '2026-06-30'
    });

    assert(impact.impactAttribution === 'direct', 'impactAttribution is direct for order-level tracking');
    assert(impact.revenue === 250, `revenue is 250 (all FORCE items) (got: ${impact.revenue}) - NOT 450 (MARK excluded)`);
    assert(impact.units === 2, `units is 2 (FORCE A + FORCE B) (got: ${impact.units})`);
  }

  // -------------------------------------------------------------------------
  // TESTE 4: DISCOUNT FIXTURE & CANONICAL ENGINE ALIGNMENT
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 4: Discount Fixture & Canonical Engine Alignment ---');
  {
    // Pedido com desconto de cupom: soma de itens = 200, mas valor pago = 180 (10% desconto)
    const discountedOrder = {
      id: 'ord_discounted',
      createdAt: '2026-06-15T14:00:00.000Z',
      actionTrackingId: 'TRACK_DISCOUNT',
      paymentStatus: 'approved',
      pricing: { total: 180, subtotal: 200, discount: 20 },
      payment: { paidAmount: 180, gatewayFee: 5.4 },
      items: [
        { productId: 'p_force_a', slug: 'force-a', line: 'FORCE', price: 100, quantity: 1, costPrice: 35 },
        { productId: 'p_force_a_2', slug: 'force-a', line: 'FORCE', price: 100, quantity: 1, costPrice: 35 }
      ]
    };

    const actionDiscount: CommercialExecutionActionItem = {
      id: 'act_discount',
      executionCycleId: 'cycle_test',
      title: 'Ação Desconto Cupom',
      actionType: 'coupon_campaign',
      productLine: 'FORCE',
      executionStatus: 'in_progress',
      status: 'in_progress',
      actionTrackingId: 'TRACK_DISCOUNT',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-30'
    } as any;

    const dataset = {
      orders: [discountedOrder],
      expenses: [],
      investments: [],
      traffic: [],
      products: catalogProducts
    };

    const impact = computeActionActualImpactCanonical({
      action: actionDiscount,
      dataset,
      startDate: '2026-06-01',
      endDate: '2026-06-30'
    });

    const canonicalOrderProf = calculateOrderProfitability(discountedOrder, catalogProducts);
    const canonicalProductProf = calculateProductProfitability([discountedOrder], catalogProducts);
    const canonicalLineAgg = aggregateProfitabilityByLine(canonicalProductProf, [canonicalOrderProf]);
    const forceAgg = canonicalLineAgg.find(l => l.lineName === 'FORCE');

    assert(impact.revenue === 180, `impact revenue matches net recognized revenue 180 (got: ${impact.revenue}) - NOT naive 200`);
    assert(forceAgg !== undefined && impact.revenue === forceAgg.netRevenue, 'impact revenue equals canonical lineAgg netRevenue');
    assert(forceAgg !== undefined && impact.contributionMargin === forceAgg.contributionMargin, `impact CM (${impact.contributionMargin}) equals canonical lineAgg CM (${forceAgg?.contributionMargin})`);
  }

  // -------------------------------------------------------------------------
  // TESTE 5: COMPLETE = RECALCULATE PROOF
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 5: COMPLETE = RECALCULATE Equivalence Proof ---');
  {
    const testDb = new MockFirestore();
    setCommercialExecutionDb(testDb);

    const cycleId = 'cycle_equiv_test';
    const actionId = 'act_equiv_test';

    const orderData = {
      id: 'ord_equiv_1',
      createdAt: '2026-06-20T12:00:00.000Z',
      actionTrackingId: 'TRACK_EQUIV',
      paymentStatus: 'approved',
      pricing: { total: 300 },
      payment: { paidAmount: 300, gatewayFee: 9 },
      items: [
        { productId: 'p_force_a', slug: 'force-a', line: 'FORCE', price: 100, quantity: 1, costPrice: 35 },
        { productId: 'p_force_b', slug: 'force-b', line: 'FORCE', price: 150, quantity: 1, costPrice: 50 }
      ]
    };

    await testDb.collection('orders').doc(orderData.id).set(orderData);
    for (const p of catalogProducts) {
      await testDb.collection('products').doc(p.id).set(p);
    }

    const cycleData = {
      id: cycleId,
      title: 'Ciclo Equivalência',
      status: 'active',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      budgetSnapshot: { revenue: 10000 }
    };
    await testDb.collection('commercial_execution_cycles').doc(cycleId).set(cycleData);

    const actionData: CommercialExecutionActionItem = {
      id: actionId,
      executionCycleId: cycleId,
      title: 'Ação Teste Equivalência',
      actionType: 'price_promotion',
      productLine: 'FORCE',
      executionStatus: 'in_progress',
      status: 'in_progress',
      actionTrackingId: 'TRACK_EQUIV',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-30',
      actualStartDate: '2026-06-01'
    } as any;
    await testDb.collection('commercial_actions').doc(actionId).set(actionData);

    // 1. Executar COMPLETE
    const { req: completeReq, res: completeRes } = createMockReqRes(
      { executionNotes: 'Concluído em teste' },
      { id: cycleId, actionId },
      { 'idempotency-key': 'comp-key-equiv-1' }
    );
    await completeCommercialActionController(completeReq, completeRes);
    const completeImpact = completeRes.getData()?.action?.actualImpact;

    // 2. Executar RECALCULATE IMPACT
    const { req: recalcReq, res: recalcRes } = createMockReqRes(
      {},
      { id: cycleId, actionId },
      { 'idempotency-key': 'recalc-key-equiv-1' }
    );
    await recalculateCommercialActionImpactController(recalcReq, recalcRes);
    const recalcImpact = recalcRes.getData()?.action?.actualImpact;

    assert(completeImpact !== undefined && recalcImpact !== undefined, 'Both complete and recalculate returned actualImpact');
    assert(completeImpact?.revenue === recalcImpact?.revenue, `Revenue equals (${completeImpact?.revenue} == ${recalcImpact?.revenue})`);
    assert(completeImpact?.units === recalcImpact?.units, `Units equals (${completeImpact?.units} == ${recalcImpact?.units})`);
    assert(completeImpact?.contributionMargin === recalcImpact?.contributionMargin, `CM equals (${completeImpact?.contributionMargin} == ${recalcImpact?.contributionMargin})`);
    assert(completeImpact?.impactAttribution === recalcImpact?.impactAttribution, `Attribution equals (${completeImpact?.impactAttribution} == ${recalcImpact?.impactAttribution})`);
    assert(completeImpact?.confidence === recalcImpact?.confidence, `Confidence equals (${completeImpact?.confidence} == ${recalcImpact?.confidence})`);
  }

  // -------------------------------------------------------------------------
  // TESTE 6: LEGACY SECONDS & MIXED DATASET REAL QUERY IN fetchCommercialDataset
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 6: fetchCommercialDataset Mixed Queries (ISO, Timestamp, Numeric Seconds) ---');
  {
    const mixedDb = new MockFirestore();
    const dateStart = '2026-06-01';
    const dateEnd = '2026-06-30';

    // 1. Pedido em formato ISO String
    const orderIso = {
      id: 'ord_format_iso',
      createdAt: '2026-06-05T12:00:00.000Z',
      pricing: { total: 100 }
    };
    await mixedDb.collection('orders').doc(orderIso.id).set(orderIso);

    // 2. Pedido em formato Timestamp Object
    const dateObj = new Date('2026-06-10T12:00:00.000Z');
    const orderTimestamp = {
      id: 'ord_format_timestamp',
      createdAt: {
        seconds: Math.floor(dateObj.getTime() / 1000),
        nanoseconds: 0
      },
      pricing: { total: 150 }
    };
    await mixedDb.collection('orders').doc(orderTimestamp.id).set(orderTimestamp);

    // 3. Pedido em formato Legacy Numeric Seconds
    const orderSeconds = {
      id: 'ord_format_seconds',
      createdAt: Math.floor(new Date('2026-06-15T12:00:00.000Z').getTime() / 1000),
      pricing: { total: 200 }
    };
    await mixedDb.collection('orders').doc(orderSeconds.id).set(orderSeconds);

    // 4. Pedido fora do range (não deve vir)
    const orderOutOfRange = {
      id: 'ord_out_of_range',
      createdAt: '2026-07-10T12:00:00.000Z',
      pricing: { total: 500 }
    };
    await mixedDb.collection('orders').doc(orderOutOfRange.id).set(orderOutOfRange);

    const ds = await fetchCommercialDataset(mixedDb, dateStart, dateEnd);

    assert(ds.orders.length === 3, `fetchCommercialDataset returned exactly 3 valid orders (got: ${ds.orders.length})`);
    const docIds = ds.orders.map(o => o.id);
    assert(docIds.includes('ord_format_iso'), 'Fetched ISO string order');
    assert(docIds.includes('ord_format_timestamp'), 'Fetched Firestore Timestamp order');
    assert(docIds.includes('ord_format_seconds'), 'Fetched Legacy Numeric Seconds order');
    assert(!docIds.includes('ord_out_of_range'), 'Out-of-range order excluded');
  }

  // -------------------------------------------------------------------------
  // TESTE 7: CONCURRENCY PERSISTENCE COUNTS (10x PROMISE.ALL POR OPERAÇÃO)
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 7: Concurrency Persistence Counts (10x Promise.all) ---');
  {
    const concDb = new MockFirestore();
    setCommercialExecutionDb(concDb);

    // Pre-seed budget for cycle creation
    await concDb.collection('commercial_budgets').doc('budget_conc_10x').set({
      id: 'budget_conc_10x',
      title: 'Budget Teste Concorrência',
      year: 2026,
      month: 6,
      targetRevenue: 50000,
      targetOperatingProfit: 10000,
      targetContributionMargin: 20000,
      targetUnits: 500
    });

    for (const p of catalogProducts) {
      await concDb.collection('products').doc(p.id).set(p);
    }

    // 1. CREATE CYCLE (10x)
    const createKey = 'conc-create-cycle-key-10x';
    const createPayload = {
      title: 'Ciclo Concorrente 10x',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      budgetId: 'budget_conc_10x'
    };

    const initialCyclesCount = Object.keys(concDb.getRawCollection('commercial_execution_cycles')).length;
    const initialEventsCount = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const initialIdempCount = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const createPromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes(createPayload, {}, { 'idempotency-key': createKey });
      return createCommercialExecutionCycleController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });

    const createResults = await Promise.all(createPromises);
    const createdCycleId = createResults[0].data?.cycle?.id;

    const postCreateCyclesCount = Object.keys(concDb.getRawCollection('commercial_execution_cycles')).length;
    const postCreateEventsCount = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const postCreateIdempCount = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(createResults.every(r => r.status === 201 || r.status === 200), 'All 10 CREATE requests succeeded');
    assert(postCreateCyclesCount - initialCyclesCount === 1, `CREATE logical mutation delta = 1 (was: ${postCreateCyclesCount - initialCyclesCount})`);
    assert(postCreateEventsCount - initialEventsCount === 1, `CREATE event delta = 1 (was: ${postCreateEventsCount - initialEventsCount})`);
    assert(postCreateIdempCount - initialIdempCount === 1, `CREATE idempotency record delta = 1 (was: ${postCreateIdempCount - initialIdempCount})`);

    // 2. ACTIVATE CYCLE (10x)
    const actKey = 'conc-activate-cycle-key-10x';
    const beforeActEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const beforeActIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const actPromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({}, { id: createdCycleId }, { 'idempotency-key': actKey });
      return activateCommercialExecutionCycleController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });
    const actResults = await Promise.all(actPromises);

    const afterActEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterActIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(actResults.every(r => r.status === 200), 'All 10 ACTIVATE requests succeeded (200)');
    assert(afterActEvents - beforeActEvents === 1, `ACTIVATE event delta = 1 (was: ${afterActEvents - beforeActEvents})`);
    assert(afterActIdemp - beforeActIdemp === 1, `ACTIVATE idempotency delta = 1 (was: ${afterActIdemp - beforeActIdemp})`);

    // 3. ADD ACTION (10x)
    const addActionKey = 'conc-add-action-key-10x';
    const actionPayload = {
      title: 'Ação Concorrente 10x',
      actionType: 'price_promotion',
      productLine: 'FORCE',
      plannedStartDate: '2026-06-05',
      plannedEndDate: '2026-06-25'
    };

    const beforeAddActions = Object.keys(concDb.getRawCollection('commercial_actions')).length;
    const beforeAddEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const beforeAddIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const addPromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes(actionPayload, { id: createdCycleId }, { 'idempotency-key': addActionKey });
      return addCommercialActionToCycleController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });
    const addResults = await Promise.all(addPromises);
    const addedActionId = addResults[0].data?.action?.id;

    const afterAddActions = Object.keys(concDb.getRawCollection('commercial_actions')).length;
    const afterAddEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterAddIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(addResults.every(r => r.status === 201 || r.status === 200), 'All 10 ADD ACTION succeeded');
    assert(afterAddActions - beforeAddActions === 1, `ADD ACTION logical delta = 1 (was: ${afterAddActions - beforeAddActions})`);
    assert(afterAddEvents - beforeAddEvents === 1, `ADD ACTION event delta = 1 (was: ${afterAddEvents - beforeAddEvents})`);
    assert(afterAddIdemp - beforeAddIdemp === 1, `ADD ACTION idempotency delta = 1 (was: ${afterAddIdemp - beforeAddIdemp})`);

    // 4. READY ACTION (10x)
    const readyKey = 'conc-ready-action-key-10x';
    const beforeReadyEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const beforeReadyIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const readyPromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({}, { id: createdCycleId, actionId: addedActionId }, { 'idempotency-key': readyKey });
      return readyCommercialActionController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });
    const readyResults = await Promise.all(readyPromises);

    const afterReadyEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterReadyIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(readyResults.every(r => r.status === 200), 'All 10 READY requests succeeded');
    assert(afterReadyEvents - beforeReadyEvents === 1, `READY event delta = 1 (was: ${afterReadyEvents - beforeReadyEvents})`);
    assert(afterReadyIdemp - beforeReadyIdemp === 1, `READY idempotency delta = 1 (was: ${afterReadyIdemp - beforeReadyIdemp})`);

    // 5. START ACTION (10x)
    const startKey = 'conc-start-action-key-10x';
    const beforeStartEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const beforeStartIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const startPromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({}, { id: createdCycleId, actionId: addedActionId }, { 'idempotency-key': startKey });
      return startCommercialActionController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });
    const startResults = await Promise.all(startPromises);

    const afterStartEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterStartIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(startResults.every(r => r.status === 200), 'All 10 START requests succeeded');
    assert(afterStartEvents - beforeStartEvents === 1, `START event delta = 1 (was: ${afterStartEvents - beforeStartEvents})`);
    assert(afterStartIdemp - beforeStartIdemp === 1, `START idempotency delta = 1 (was: ${afterStartIdemp - beforeStartIdemp})`);

    // 6. BLOCK ACTION (10x)
    const blockKey = 'conc-block-action-key-10x';
    const blockPayload = { blockingReason: 'Aguardando criativos' };
    const beforeBlockEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const beforeBlockIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const blockPromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes(blockPayload, { id: createdCycleId, actionId: addedActionId }, { 'idempotency-key': blockKey });
      return blockCommercialActionController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });
    const blockResults = await Promise.all(blockPromises);

    const afterBlockEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterBlockIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(blockResults.every(r => r.status === 200), 'All 10 BLOCK requests succeeded');
    assert(afterBlockEvents - beforeBlockEvents === 1, `BLOCK event delta = 1 (was: ${afterBlockEvents - beforeBlockEvents})`);
    assert(afterBlockIdemp - beforeBlockIdemp === 1, `BLOCK idempotency delta = 1 (was: ${afterBlockIdemp - beforeBlockIdemp})`);

    // Desbloquear para poder concluir
    const { req: unbReq, res: unbRes } = createMockReqRes({}, { id: createdCycleId, actionId: addedActionId }, { 'idempotency-key': 'unblock-key' });
    await (await import('../server/controllers/commercialExecution.controller.js')).unblockCommercialActionController(unbReq, unbRes);

    // 7. COMPLETE ACTION (10x)
    const completeKey = 'conc-complete-action-key-10x';
    const completePayload = { executionNotes: 'Concluído com sucesso' };
    const beforeCompEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const beforeCompIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const compPromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes(completePayload, { id: createdCycleId, actionId: addedActionId }, { 'idempotency-key': completeKey });
      return completeCommercialActionController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });
    const compResults = await Promise.all(compPromises);

    const afterCompEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterCompIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(compResults.every(r => r.status === 200), 'All 10 COMPLETE requests succeeded');
    assert(afterCompEvents - beforeCompEvents === 1, `COMPLETE event delta = 1 (was: ${afterCompEvents - beforeCompEvents})`);
    assert(afterCompIdemp - beforeCompIdemp === 1, `COMPLETE idempotency delta = 1 (was: ${afterCompIdemp - beforeCompIdemp})`);

    // 8. RECALCULATE CYCLE (10x)
    const recalcCycleKey = 'conc-recalc-cycle-key-10x';
    const beforeRecalcEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const beforeRecalcIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const recalcCyclePromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({}, { id: createdCycleId }, { 'idempotency-key': recalcCycleKey });
      return recalculateCommercialExecutionCycleController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });
    const recalcCycleResults = await Promise.all(recalcCyclePromises);

    const afterRecalcEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterRecalcIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(recalcCycleResults.every(r => r.status === 200), 'All 10 RECALCULATE CYCLE succeeded');
    assert(afterRecalcEvents - beforeRecalcEvents === 1, `RECALCULATE CYCLE event delta = 1 (was: ${afterRecalcEvents - beforeRecalcEvents})`);
    assert(afterRecalcIdemp - beforeRecalcIdemp === 1, `RECALCULATE CYCLE idempotency delta = 1 (was: ${afterRecalcIdemp - beforeRecalcIdemp})`);
  }

  // -------------------------------------------------------------------------
  // TESTE 8: AUTH STACK & ROUTE SECURITY ASSERTIONS
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 8: Auth Stack & Middleware Verification ---');
  {
    const serverFile = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

    assert(serverFile.includes('apiRouter.get("/admin/commercial/execution-cycles", adminApiLimiter, authenticateAdmin'), 'GET /admin/commercial/execution-cycles has adminApiLimiter & authenticateAdmin');
    assert(serverFile.includes('apiRouter.post("/admin/commercial/execution-cycles", adminApiLimiter, authenticateAdmin'), 'POST /admin/commercial/execution-cycles has adminApiLimiter & authenticateAdmin');
    assert(serverFile.includes('apiRouter.post("/admin/commercial/execution-cycles/:id/actions/:actionId/complete", adminApiLimiter, authenticateAdmin'), 'POST action complete has adminApiLimiter & authenticateAdmin');
    assert(serverFile.includes('apiRouter.post("/admin/commercial/execution-cycles/:id/recalculate", adminApiLimiter, authenticateAdmin'), 'POST cycle recalculate has adminApiLimiter & authenticateAdmin');
  }

  // -------------------------------------------------------------------------
  // TESTE 9: FIRESTORE SECURITY RULES SOURCE ASSERTIONS
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 9: Firestore Rules Source Assertions ---');
  {
    const rulesContent = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');

    assert(
      rulesContent.includes('match /commercial_actions/{actionId}') &&
      rulesContent.includes('allow create, update, delete: if false;'),
      'commercial_actions client-side write is blocked (false)'
    );

    assert(
      rulesContent.includes('match /commercial_execution_cycles/{cycleId}') &&
      rulesContent.includes('allow create, update, delete: if false;'),
      'commercial_execution_cycles client-side write is blocked (false)'
    );

    assert(
      rulesContent.includes('match /commercial_execution_events/{eventId}') &&
      rulesContent.includes('allow create, update, delete: if false;'),
      'commercial_execution_events client-side write is blocked (false)'
    );

    assert(
      rulesContent.includes('match /commercial_action_recommendation_locks/{lockId}') &&
      rulesContent.includes('allow read, create, update, delete: if false;'),
      'commercial_action_recommendation_locks client-side read/write is completely blocked (false)'
    );
  }

  console.log('\n=================================================================');
  console.log(`🏁 CERTIFICAÇÃO FASE 9.6.7-E: ${passed} PASS, ${failed} FAIL`);
  console.log('=================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
