/**
 * SUÍTE DE CERTIFICAÇÃO FASE 9.6.7-F (PATCH FINAL DE SCOPED FINANCIALS E AUTH PIPELINE)
 * FPAC Store — Motor de Execução Comercial & Governança
 *
 * Verificações:
 * 1. SCOPED ORDER FINANCIALS (buildFinanciallyScopedOrder)
 * 2. SCOPED REFUND (getOrderRefundedAmount rateado)
 * 3. SCOPED SHIPPING FINANCES (getOrderShippingFinances rateado: charged, cost, subsidy)
 * 4. SCOPED OTHER VARIABLE COSTS (rateio proporcional)
 * 5. SCOPED PAID / GATEWAY
 * 6. FIXTURE FINANCEIRO COMPLETO (Item FORCE R$100 vs MARK R$200 com frete, desconto, gateway, refund, custos variáveis)
 * 7. ASSERTIONS OBRIGATÓRIAS (Scoped Net Revenue, Paid, Refund, Gateway, Shipping, Other Var, COGS, CM)
 * 8. ACTION = CANONICAL SCOPED ORDER (computeActionActualImpactCanonical vs motores canônicos)
 * 9. COMPLETE = RECALCULATE (Equivalência integral de actualImpact)
 * 10. AUTH PIPELINE REAL (adminApiLimiter -> authenticateAdmin -> controller via mini Express HTTP real)
 * 11. CONCURRENCY & ESTADO LÓGICO (10x Promise.all: deltas = 1 e status finais verificados)
 * 12. DATASETS MISTOS & FIRESTORE RULES
 */

import express, { Request, Response } from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';

import {
  setCommercialExecutionDb,
  createCommercialExecutionCycleController,
  activateCommercialExecutionCycleController,
  addCommercialActionToCycleController,
  readyCommercialActionController,
  startCommercialActionController,
  blockCommercialActionController,
  unblockCommercialActionController,
  completeCommercialActionController,
  recalculateCommercialExecutionCycleController,
  recalculateCommercialActionImpactController,
  getCommercialExecutionDashboardController,
  fetchCommercialDataset,
  computeActionActualImpactCanonical,
  buildFinanciallyScopedOrder
} from '../server/controllers/commercialExecution.controller.js';

import {
  calculateOrderProfitability,
  calculateProductProfitability,
  aggregateProfitabilityByLine
} from '../src/utils/profitability.js';

import {
  getOrderPaidAmount,
  getOrderTotal,
  getOrderRefundedAmount,
  getOrderGatewayFee,
  getOrderShippingFinances
} from '../src/utils/orderFinancial.js';

import {
  authenticateAdmin,
  setAuthTokenVerifierForTesting,
  setAuthDbForTesting,
  resetAuthForTesting
} from '../server/middleware/auth.middleware.js';

import { adminApiLimiter } from '../server/middleware/rateLimiter.js';

// ==========================================
// MOCK FIRESTORE & REQ/RES HARNESS
// ==========================================

class MockFirestore {
  data: Record<string, Record<string, any>> = {};

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
            data: () => this.data[name][docId] ? { ...this.data[name][docId] } : undefined
          }),
          set: async (val: any) => {
            this.data[name][docId] = { ...val };
          },
          update: async (val: any) => {
            this.data[name][docId] = { ...(this.data[name][docId] || {}), ...val };
          },
          delete: async () => {
            delete this.data[name][docId];
          }
        };
      },
      where: (field: string, op: string, val: any) => this.query(name, [{ field, op, val }]),
      get: async () => ({
        empty: Object.keys(this.data[name]).length === 0,
        docs: Object.keys(this.data[name]).map(k => ({
          id: k,
          data: () => ({ ...this.data[name][k] })
        }))
      })
    };
  }

  private query(name: string, filters: Array<{ field: string; op: string; val: any }>) {
    return {
      where: (field: string, op: string, val: any) => {
        return this.query(name, [...filters, { field, op, val }]);
      },
      orderBy: (field: string, direction?: string) => ({
        limit: (limitCount: number) => ({
          get: async () => this.executeFilteredGet(name, filters, field, direction, limitCount),
          startAfter: (cursorDoc: any) => ({
            get: async () => this.executeFilteredGet(name, filters, field, direction, limitCount, cursorDoc)
          })
        }),
        get: async () => this.executeFilteredGet(name, filters, field, direction)
      }),
      limit: (limitCount: number) => ({
        get: async () => this.executeFilteredGet(name, filters, undefined, undefined, limitCount)
      }),
      get: async () => this.executeFilteredGet(name, filters)
    };
  }

  private executeFilteredGet(
    name: string,
    filters: Array<{ field: string; op: string; val: any }>,
    orderField?: string,
    orderDirection?: string,
    limit?: number,
    cursor?: any
  ) {
    const normalizeVal = (val: any): any => {
      if (val === null || val === undefined) return val;
      if (typeof val?.toMillis === 'function') return val.toMillis();
      if (typeof val?.toDate === 'function') return val.toDate().getTime();
      if (val instanceof Date) return val.getTime();
      if (typeof val === 'object' && typeof val.seconds === 'number') return val.seconds * 1000;
      return val;
    };

    let items = Object.keys(this.data[name] || {}).map(k => ({
      id: k,
      ...this.data[name][k]
    }));

    for (const f of filters) {
      items = items.filter(item => {
        const v = item[f.field];
        const normV = normalizeVal(v);
        const normTarget = normalizeVal(f.val);
        if (f.op === '==') return normV === normTarget || v === f.val;
        if (f.op === '>=') return normV >= normTarget;
        if (f.op === '<=') return normV <= normTarget;
        if (f.op === '>') return normV > normTarget;
        if (f.op === '<') return normV < normTarget;
        return true;
      });
    }

    if (orderField) {
      items.sort((a, b) => {
        const valA = a[orderField] || '';
        const valB = b[orderField] || '';
        if (valA < valB) return orderDirection === 'desc' ? 1 : -1;
        if (valA > valB) return orderDirection === 'desc' ? -1 : 1;
        return 0;
      });
    }

    if (cursor) {
      const idx = items.findIndex(i => i.id === cursor.id);
      if (idx !== -1) {
        items = items.slice(idx + 1);
      }
    }

    if (limit && limit > 0) {
      items = items.slice(0, limit);
    }

    return {
      empty: items.length === 0,
      size: items.length,
      docs: items.map(it => ({
        id: it.id,
        data: () => it
      }))
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
  let statusCode = 200;
  let responseData: any = null;

  const req = {
    body,
    params,
    headers: { 'idempotency-key': 'default-key', ...headers },
    query,
    user: { uid: 'admin_test', email: 'admin@fpacstore.com.br', name: 'Admin Teste', role: 'admin' }
  } as unknown as Request;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
    getStatusCode: () => statusCode,
    getData: () => responseData
  } as unknown as Response & { getStatusCode: () => number; getData: () => any };

  return { req, res };
}

// ==========================================
// TEST SUITE RUNNER
// ==========================================

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${description}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${description}`);
    failCount++;
  }
}

export async function runTests() {
  console.log('=================================================================');
  console.log('🚀 INICIANDO CERTIFICAÇÃO FASE 9.6.7-F (SCOPED FINANCIALS & AUTH)');
  console.log('=================================================================');

  const catalogProducts = [
    { id: 'prod-force-tee', slug: 'camiseta-force', name: 'Camiseta FORCE Oversized', line: 'FORCE', price: 100, costPrice: 20, manufacturingCost: 20, stock: 100 },
    { id: 'prod-mark-pants', slug: 'calca-mark', name: 'Calça MARK Cargo', line: 'MARK', price: 200, costPrice: 50, manufacturingCost: 50, stock: 50 }
  ];

  // -------------------------------------------------------------------------
  // TESTE 1: Scoped Order Financials & Proportionality Assertions
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 1: Scoped Order Financials Rateio Rigoroso ---');
  {
    // Pedido misto com FORCE (100) e MARK (200). Bruto = 300.
    // Desconto de 30 -> Total = 270.
    // Pago = 270, Gateway Fee = 15, Reembolsado = 30.
    // Frete cobrado = 30, Frete custo real = 45 -> Subsídio = 15.
    // Outros custos variáveis = 12.
    // Share FORCE = 100 / 300 = 1/3.
    const mixedOrder = {
      id: 'order_mixed_fase967f',
      orderId: 'order_mixed_fase967f',
      createdAt: '2026-06-15T10:00:00.000Z',
      date: '2026-06-15',
      paymentStatus: 'approved',
      status: 'approved',
      pricing: {
        subtotal: 300,
        discount: 30,
        shipping: 30,
        shippingActualCost: 45,
        total: 270,
        otherVariableCosts: 12
      },
      payment: {
        status: 'approved',
        paidAmount: 270,
        refundedAmount: 30,
        gatewayFee: 15
      },
      shippingFinances: {
        shippingCharged: 30,
        shippingCost: 45,
        shippingActualCost: 45,
        shippingSubsidy: 15
      },
      otherVariableCosts: 12,
      items: [
        {
          id: 'item-force-1',
          productId: 'prod-force-tee',
          slug: 'camiseta-force',
          name: 'Camiseta FORCE Oversized',
          price: 100,
          quantity: 1,
          unitCostSnapshot: 20,
          totalCostSnapshot: 20,
          actionTrackingId: 'FORCE_ACTION_F_TRACK'
        },
        {
          id: 'item-mark-1',
          productId: 'prod-mark-pants',
          slug: 'calca-mark',
          name: 'Calça MARK Cargo',
          price: 200,
          quantity: 1,
          unitCostSnapshot: 50,
          totalCostSnapshot: 50
        }
      ]
    };

    const eligibleItems = [mixedOrder.items[0]]; // Apenas FORCE
    const share = 100 / 300; // 1/3

    const scopedOrder = buildFinanciallyScopedOrder(mixedOrder, eligibleItems, share);

    // 1. Paid
    const scopedPaid = getOrderPaidAmount(scopedOrder);
    assert(scopedPaid === 90, `SCOPED PAID: esperado 90 (270 * 1/3), obteve ${scopedPaid}`);

    // 2. Refund
    const scopedRefund = getOrderRefundedAmount(scopedOrder);
    assert(scopedRefund === 10, `SCOPED REFUND: esperado 10 (30 * 1/3), obteve ${scopedRefund}`);

    // 3. Gateway Fee
    const scopedGateway = getOrderGatewayFee(scopedOrder).fee;
    assert(scopedGateway === 5, `SCOPED GATEWAY: esperado 5 (15 * 1/3), obteve ${scopedGateway}`);

    // 4. Shipping Finances
    const scopedShipping = getOrderShippingFinances(scopedOrder);
    assert(scopedShipping.shippingCharged === 10, `SCOPED SHIPPING CHARGED: esperado 10 (30 * 1/3), obteve ${scopedShipping.shippingCharged}`);
    assert(scopedShipping.shippingActualCost === 15, `SCOPED SHIPPING ACTUAL: esperado 15 (45 * 1/3), obteve ${scopedShipping.shippingActualCost}`);
    assert(scopedShipping.shippingSubsidy === 5, `SCOPED SHIPPING SUBSIDY: esperado 5 (15 * 1/3), obteve ${scopedShipping.shippingSubsidy}`);

    // 5. Other Variable Costs
    const scopedOtherVar = Number(scopedOrder.otherVariableCosts || 0);
    assert(scopedOtherVar === 4, `SCOPED OTHER VARIABLE COSTS: esperado 4 (12 * 1/3), obteve ${scopedOtherVar}`);

    // 6. Rentabilidade do Scoped Order via calculateOrderProfitability
    const orderProf = calculateOrderProfitability(scopedOrder, catalogProducts);
    assert(orderProf.capturedRevenue === 90, `OrderProf capturedRevenue: esperado 90, obteve ${orderProf.capturedRevenue}`);
    assert(orderProf.refundedAmount === 10, `OrderProf refundedAmount: esperado 10, obteve ${orderProf.refundedAmount}`);
    assert(orderProf.netRevenue === 80, `SCOPED NET REVENUE: esperado 80 (90 - 10), obteve ${orderProf.netRevenue}`);
    assert(orderProf.cogs === 20, `SCOPED COGS: esperado 20 (apenas FORCE), obteve ${orderProf.cogs}`);
    assert(orderProf.gatewayFees === 5, `OrderProf gatewayFees: esperado 5, obteve ${orderProf.gatewayFees}`);
    assert(orderProf.shippingSubsidy === 5, `OrderProf shippingSubsidy: esperado 5, obteve ${orderProf.shippingSubsidy}`);
    assert(orderProf.otherVariableCosts === 4, `OrderProf otherVariableCosts: esperado 4, obteve ${orderProf.otherVariableCosts}`);
    
    // Total variable costs = 20 (cogs) + 5 (gw) + 5 (ship) + 4 (other) = 34
    // Contribution Margin = 80 - 34 = 46
    assert(orderProf.contributionMargin === 46, `SCOPED CONTRIBUTION MARGIN: esperado 46 (80 - 34), obteve ${orderProf.contributionMargin}`);

    // 7. Isolamento de Linha via calculateProductProfitability e aggregateProfitabilityByLine
    const prodsProf = calculateProductProfitability([scopedOrder], catalogProducts);
    const lineAggs = aggregateProfitabilityByLine(prodsProf, [orderProf]);

    const forceLine = lineAggs.find(l => l.lineName === 'FORCE');
    const markLine = lineAggs.find(l => l.lineName === 'MARK');

    assert(!!forceLine, 'Linha FORCE encontrada nas agregações de produto');
    assert(forceLine?.netRevenue === 80, `FORCE line netRevenue: esperado 80, obteve ${forceLine?.netRevenue}`);
    assert(forceLine?.cogs === 20, `FORCE line cogs: esperado 20, obteve ${forceLine?.cogs}`);
    assert(forceLine?.gatewayFees === 5, `FORCE line gatewayFees: esperado 5, obteve ${forceLine?.gatewayFees}`);
    assert(forceLine?.shippingSubsidy === 5, `FORCE line shippingSubsidy: esperado 5, obteve ${forceLine?.shippingSubsidy}`);
    assert(forceLine?.otherVariableCosts === 4, `FORCE line otherVariableCosts: esperado 4, obteve ${forceLine?.otherVariableCosts}`);
    assert(forceLine?.contributionMargin === 46, `FORCE line contributionMargin: esperado 46, obteve ${forceLine?.contributionMargin}`);
    assert(markLine?.unitsSold === 0 && markLine?.netRevenue === 0, 'Nenhum valor financeiro da parcela MARK contaminou o escopo da FORCE');
  }

  // -------------------------------------------------------------------------
  // TESTE 2: ACTION = CANONICAL SCOPED ORDER
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 2: ACTION = CANONICAL SCOPED ORDER (computeActionActualImpactCanonical) ---');
  {
    const mixedOrder = {
      id: 'order_mixed_fase967f',
      orderId: 'order_mixed_fase967f',
      createdAt: '2026-06-15T10:00:00.000Z',
      date: '2026-06-15',
      paymentStatus: 'approved',
      status: 'approved',
      pricing: {
        subtotal: 300,
        discount: 30,
        shipping: 30,
        shippingActualCost: 45,
        total: 270,
        otherVariableCosts: 12
      },
      payment: {
        status: 'approved',
        paidAmount: 270,
        refundedAmount: 30,
        gatewayFee: 15
      },
      shippingFinances: {
        shippingCharged: 30,
        shippingCost: 45,
        shippingActualCost: 45,
        shippingSubsidy: 15
      },
      otherVariableCosts: 12,
      items: [
        {
          id: 'item-force-1',
          productId: 'prod-force-tee',
          slug: 'camiseta-force',
          name: 'Camiseta FORCE Oversized',
          price: 100,
          quantity: 1,
          unitCostSnapshot: 20,
          totalCostSnapshot: 20,
          actionTrackingId: 'FORCE_ACTION_F_TRACK'
        },
        {
          id: 'item-mark-1',
          productId: 'prod-mark-pants',
          slug: 'calca-mark',
          name: 'Calça MARK Cargo',
          price: 200,
          quantity: 1,
          unitCostSnapshot: 50,
          totalCostSnapshot: 50
        }
      ]
    };

    const action = {
      id: 'act_force_test_f',
      title: 'Ação Promocional Linha FORCE',
      actionTrackingId: 'FORCE_ACTION_F_TRACK',
      productLine: 'FORCE',
      channel: 'instagram_ads',
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-30'
    } as any;

    const dataset = {
      orders: [mixedOrder],
      expenses: [],
      investments: [],
      traffic: [],
      products: catalogProducts
    };

    const actionImpact = computeActionActualImpactCanonical({
      action,
      dataset,
      startDate: '2026-06-01',
      endDate: '2026-06-30'
    });

    assert(actionImpact.revenue === 80, `ACTION = CANONICAL SCOPED ORDER: revenue esperado 80, obteve ${actionImpact.revenue}`);
    assert(actionImpact.units === 1, `Action units: esperado 1, obteve ${actionImpact.units}`);
    assert(actionImpact.orders === 1, `Action orders: esperado 1, obteve ${actionImpact.orders}`);
    assert(actionImpact.contributionMargin === 46, `Action CM: esperado 46, obteve ${actionImpact.contributionMargin}`);
    assert(actionImpact.impactAttribution === 'direct', `Action impactAttribution: esperado direct, obteve ${actionImpact.impactAttribution}`);
    assert(actionImpact.confidence === 'high', `Action confidence: esperado high, obteve ${actionImpact.confidence}`);
  }

  // -------------------------------------------------------------------------
  // TESTE 3: COMPLETE = RECALCULATE (Equivalência Integral)
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 3: COMPLETE = RECALCULATE Equivalência Integral ---');
  {
    const db = new MockFirestore();
    setCommercialExecutionDb(db);

    for (const p of catalogProducts) {
      await db.collection('products').doc(p.id).set(p);
    }

    const order1 = {
      id: 'ord_complete_recalc_1',
      orderId: 'ord_complete_recalc_1',
      createdAt: '2026-06-10T12:00:00.000Z',
      date: '2026-06-10',
      paymentStatus: 'approved',
      status: 'approved',
      pricing: { subtotal: 200, discount: 20, shipping: 20, shippingActualCost: 30, total: 180, otherVariableCosts: 8 },
      payment: { status: 'approved', paidAmount: 180, refundedAmount: 0, gatewayFee: 10 },
      shippingFinances: { shippingCharged: 20, shippingCost: 30, shippingActualCost: 30, shippingSubsidy: 10 },
      otherVariableCosts: 8,
      items: [
        {
          id: 'it-force-1',
          productId: 'prod-force-tee',
          slug: 'camiseta-force',
          name: 'Camiseta FORCE Oversized',
          price: 100,
          quantity: 2,
          unitCostSnapshot: 20,
          totalCostSnapshot: 40,
          actionTrackingId: 'TRACK_EQUIV_F'
        }
      ]
    };
    await db.collection('orders').doc(order1.id).set(order1);

    await db.collection('commercial_budgets').doc('budget_2026_06').set({
      id: 'budget_2026_06',
      title: 'Budget Junho 2026',
      year: 2026,
      month: 6,
      targetRevenue: 50000,
      targetOperatingProfit: 10000,
      targetContributionMargin: 20000,
      targetUnits: 500
    });

    const { req: reqCreate, res: resCreate } = createMockReqRes({
      title: 'Ciclo Teste Equivalência',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      budgetId: 'budget_2026_06'
    }, {}, { 'idempotency-key': 'key_cycle_equiv' });
    await createCommercialExecutionCycleController(reqCreate, resCreate);
    const cycleId = resCreate.getData().cycle.id;

    const { req: reqAct, res: resAct } = createMockReqRes({}, { id: cycleId }, { 'idempotency-key': 'key_act_equiv' });
    await activateCommercialExecutionCycleController(reqAct, resAct);

    const { req: reqAdd, res: resAdd } = createMockReqRes({
      title: 'Ação Equivalência FORCE',
      channel: 'meta_ads',
      productLine: 'FORCE',
      actionTrackingId: 'TRACK_EQUIV_F',
      targetRevenue: 1000,
      targetUnits: 10,
      targetContributionMargin: 400,
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-30'
    }, { id: cycleId }, { 'idempotency-key': 'key_add_equiv' });
    await addCommercialActionToCycleController(reqAdd, resAdd);
    const actionId = resAdd.getData().action.id;

    const { req: reqRdy, res: resRdy } = createMockReqRes({}, { id: cycleId, actionId }, { 'idempotency-key': 'key_rdy_equiv' });
    await readyCommercialActionController(reqRdy, resRdy);

    const { req: reqSt, res: resSt } = createMockReqRes({}, { id: cycleId, actionId }, { 'idempotency-key': 'key_st_equiv' });
    await startCommercialActionController(reqSt, resSt);

    // Complete Action
    const { req: reqComp, res: resComp } = createMockReqRes({ executionNotes: 'Concluído no prazo' }, { id: cycleId, actionId }, { 'idempotency-key': 'key_comp_equiv' });
    await completeCommercialActionController(reqComp, resComp);
    const completedAction = resComp.getData().action;
    const completeImpact = completedAction.actualImpact;

    // Recalculate Action
    const { req: reqRecalc, res: resRecalc } = createMockReqRes({}, { id: cycleId, actionId }, { 'idempotency-key': 'key_recalc_equiv' });
    await recalculateCommercialActionImpactController(reqRecalc, resRecalc);
    const recalculatedAction = resRecalc.getData().action;
    const recalcImpact = recalculatedAction.actualImpact;

    assert(completeImpact && recalcImpact, 'COMPLETE = RECALCULATE: ambos retornaram actualImpact');
    assert(completeImpact.revenue === recalcImpact.revenue, `COMPLETE = RECALCULATE Revenue (${completeImpact.revenue} == ${recalcImpact.revenue})`);
    assert(completeImpact.orders === recalcImpact.orders, `COMPLETE = RECALCULATE Orders (${completeImpact.orders} == ${recalcImpact.orders})`);
    assert(completeImpact.units === recalcImpact.units, `COMPLETE = RECALCULATE Units (${completeImpact.units} == ${recalcImpact.units})`);
    assert(completeImpact.averageTicket === recalcImpact.averageTicket, `COMPLETE = RECALCULATE AvgTicket (${completeImpact.averageTicket} == ${recalcImpact.averageTicket})`);
    assert(completeImpact.contributionMargin === recalcImpact.contributionMargin, `COMPLETE = RECALCULATE CM (${completeImpact.contributionMargin} == ${recalcImpact.contributionMargin})`);
    assert(completeImpact.operatingProfit === recalcImpact.operatingProfit, `COMPLETE = RECALCULATE OP (${completeImpact.operatingProfit} == ${recalcImpact.operatingProfit})`);
    assert(completeImpact.costCoveragePercent === recalcImpact.costCoveragePercent, `COMPLETE = RECALCULATE CostCoverage (${completeImpact.costCoveragePercent} == ${recalcImpact.costCoveragePercent})`);
    assert(completeImpact.impactAttribution === recalcImpact.impactAttribution, `COMPLETE = RECALCULATE ImpactAttribution (${completeImpact.impactAttribution} == ${recalcImpact.impactAttribution})`);
    assert(completeImpact.confidence === recalcImpact.confidence, `COMPLETE = RECALCULATE Confidence (${completeImpact.confidence} == ${recalcImpact.confidence})`);
    assert(completeImpact.calculationMethod === recalcImpact.calculationMethod, `COMPLETE = RECALCULATE CalculationMethod (${completeImpact.calculationMethod} == ${recalcImpact.calculationMethod})`);
    assert(completeImpact.comparisonWindowStart === recalcImpact.comparisonWindowStart, `COMPLETE = RECALCULATE WindowStart (${completeImpact.comparisonWindowStart} == ${recalcImpact.comparisonWindowStart})`);
    assert(completeImpact.comparisonWindowEnd === recalcImpact.comparisonWindowEnd, `COMPLETE = RECALCULATE WindowEnd (${completeImpact.comparisonWindowEnd} == ${recalcImpact.comparisonWindowEnd})`);
  }

  // -------------------------------------------------------------------------
  // TESTE 4: AUTH PIPELINE REAL (adminApiLimiter -> authenticateAdmin -> Controller)
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 4: AUTH PIPELINE REAL (Express HTTP Test) ---');
  {
    const authDb = new MockFirestore();
    setAuthDbForTesting(authDb);

    // Mock token verifier
    setAuthTokenVerifierForTesting(async (token: string) => {
      if (token === 'valid_admin_token') {
        return {
          uid: 'admin_user_uid',
          email: 'fpacstore@gmail.com',
          admin: true,
          aud: 'test',
          auth_time: 0,
          exp: 9999999999,
          firebase: { identities: {}, sign_in_provider: 'custom' },
          iat: 0,
          iss: 'test',
          sub: 'admin_user_uid'
        } as any;
      }
      if (token === 'valid_non_admin_token') {
        return {
          uid: 'client_user_uid',
          email: 'client@gmail.com',
          admin: false,
          aud: 'test',
          auth_time: 0,
          exp: 9999999999,
          firebase: { identities: {}, sign_in_provider: 'custom' },
          iat: 0,
          iss: 'test',
          sub: 'client_user_uid'
        } as any;
      }
      throw new Error('INVALID_OR_EXPIRED_TOKEN');
    });

    let controllerCallCount = 0;
    const testApp = express();
    testApp.use(express.json());

    testApp.get('/test-auth-pipeline', adminApiLimiter, authenticateAdmin, (req: Request, res: Response) => {
      controllerCallCount++;
      return res.status(200).json({ success: true, message: 'Admin authenticated', user: (req as any).user });
    });

    const server = http.createServer(testApp);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // A) ADMIN VÁLIDO -> 200, controllerSpy chamado 1x
      const resAdmin = await fetch(`${baseUrl}/test-auth-pipeline`, {
        headers: { Authorization: 'Bearer valid_admin_token' }
      });
      const dataAdmin = await resAdmin.json();
      assert(resAdmin.status === 200 && controllerCallCount === 1, `AUTH PIPELINE ADMIN: HTTP 200, controller chamado 1 vez (Status: ${resAdmin.status}, calls: ${controllerCallCount})`);

      // B) NON ADMIN -> 403, controllerSpy chamado 0x adicionais
      const resNonAdmin = await fetch(`${baseUrl}/test-auth-pipeline`, {
        headers: { Authorization: 'Bearer valid_non_admin_token' }
      });
      const dataNonAdmin = await resNonAdmin.json();
      assert(resNonAdmin.status === 403 && controllerCallCount === 1, `AUTH PIPELINE NON ADMIN: HTTP 403, controller NÃO executado (Status: ${resNonAdmin.status}, calls: ${controllerCallCount})`);

      // C) INVALID TOKEN -> 401, controllerSpy chamado 0x adicionais
      const resInvalid = await fetch(`${baseUrl}/test-auth-pipeline`, {
        headers: { Authorization: 'Bearer random_invalid_token' }
      });
      const dataInvalid = await resInvalid.json();
      assert(resInvalid.status === 401 && controllerCallCount === 1, `AUTH PIPELINE INVALID: HTTP 401, controller NÃO executado (Status: ${resInvalid.status}, calls: ${controllerCallCount})`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      resetAuthForTesting();
    }
  }

  // -------------------------------------------------------------------------
  // TESTE 5: CONCURRENCY 10X — ESTADO LÓGICO & DELTAS DE PERSISTÊNCIA
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 5: CONCURRENCY 10X — ESTADO LÓGICO & DELTAS ---');
  {
    const concDb = new MockFirestore();
    setCommercialExecutionDb(concDb);

    await concDb.collection('commercial_budgets').doc('budget_conc_f').set({
      id: 'budget_conc_f',
      title: 'Budget Teste Concorrência F',
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
    const createKey = 'conc-create-cycle-key-10x-f';
    const createPayload = {
      title: 'Ciclo Concorrência 10x F',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      budgetId: 'budget_conc_f'
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
    const createdCycleId = createResults[0].data.cycle.id;

    assert(createResults.every(r => r.status === 201 || r.status === 200), 'All 10 CREATE requests succeeded');
    const afterCreateCycles = Object.keys(concDb.getRawCollection('commercial_execution_cycles')).length;
    const afterCreateEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterCreateIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(afterCreateCycles - initialCyclesCount === 1, `CREATE logical mutation delta = 1 (was: ${afterCreateCycles - initialCyclesCount})`);
    assert(afterCreateEvents - initialEventsCount === 1, `CREATE event delta = 1 (was: ${afterCreateEvents - initialEventsCount})`);
    assert(afterCreateIdemp - initialIdempCount === 1, `CREATE idempotency record delta = 1 (was: ${afterCreateIdemp - initialIdempCount})`);

    // 2. ACTIVATE CYCLE (10x)
    const activateKey = 'conc-activate-cycle-key-10x-f';
    const beforeActivateEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const beforeActivateIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const activatePromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({}, { id: createdCycleId }, { 'idempotency-key': activateKey });
      return activateCommercialExecutionCycleController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });

    const activateResults = await Promise.all(activatePromises);
    assert(activateResults.every(r => r.status === 200), 'All 10 ACTIVATE requests succeeded (200)');
    const afterActivateEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterActivateIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(afterActivateEvents - beforeActivateEvents === 1, `ACTIVATE event delta = 1 (was: ${afterActivateEvents - beforeActivateEvents})`);
    assert(afterActivateIdemp - beforeActivateIdemp === 1, `ACTIVATE idempotency delta = 1 (was: ${afterActivateIdemp - beforeActivateIdemp})`);
    
    // Estado Lógico ACTIVATE
    const cycleDocAfterAct = concDb.getRawCollection('commercial_execution_cycles')[createdCycleId];
    assert(cycleDocAfterAct.status === 'active', `ACTIVATE STATE: cycle.status === 'active' (got: ${cycleDocAfterAct.status})`);

    // 3. ADD ACTION (10x)
    const addActionKey = 'conc-add-action-key-10x-f';
    const actionPayload = {
      title: 'Ação 10x Teste Concorrência',
      channel: 'instagram_ads',
      productLine: 'FORCE',
      actionTrackingId: 'TRACK_CONC_10X_F',
      targetRevenue: 5000,
      targetUnits: 50,
      targetContributionMargin: 2000,
      plannedStartDate: '2026-06-01',
      plannedEndDate: '2026-06-30'
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
    const addedActionId = addResults[0].data.action.id;

    assert(addResults.every(r => r.status === 201 || r.status === 200), 'All 10 ADD ACTION succeeded');
    const afterAddActions = Object.keys(concDb.getRawCollection('commercial_actions')).length;
    const afterAddEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterAddIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(afterAddActions - beforeAddActions === 1, `ADD ACTION logical delta = 1 (was: ${afterAddActions - beforeAddActions})`);
    assert(afterAddEvents - beforeAddEvents === 1, `ADD ACTION event delta = 1 (was: ${afterAddEvents - beforeAddEvents})`);
    assert(afterAddIdemp - beforeAddIdemp === 1, `ADD ACTION idempotency delta = 1 (was: ${afterAddIdemp - beforeAddIdemp})`);

    // 4. READY ACTION (10x)
    const readyKey = 'conc-ready-action-key-10x-f';
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
    assert(readyResults.every(r => r.status === 200), 'All 10 READY requests succeeded');
    const afterReadyEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterReadyIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(afterReadyEvents - beforeReadyEvents === 1, `READY event delta = 1 (was: ${afterReadyEvents - beforeReadyEvents})`);
    assert(afterReadyIdemp - beforeReadyIdemp === 1, `READY idempotency delta = 1 (was: ${afterReadyIdemp - beforeReadyIdemp})`);
    
    // Estado Lógico READY
    const actionAfterReady = concDb.getRawCollection('commercial_actions')[addedActionId];
    assert(actionAfterReady.executionStatus === 'ready', `READY STATE: action.executionStatus === 'ready' (got: ${actionAfterReady.executionStatus})`);

    // 5. START ACTION (10x)
    const startKey = 'conc-start-action-key-10x-f';
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
    assert(startResults.every(r => r.status === 200), 'All 10 START requests succeeded');
    const afterStartEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterStartIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(afterStartEvents - beforeStartEvents === 1, `START event delta = 1 (was: ${afterStartEvents - beforeStartEvents})`);
    assert(afterStartIdemp - beforeStartIdemp === 1, `START idempotency delta = 1 (was: ${afterStartIdemp - beforeStartIdemp})`);
    
    // Estado Lógico START
    const actionAfterStart = concDb.getRawCollection('commercial_actions')[addedActionId];
    assert(actionAfterStart.executionStatus === 'in_progress', `START STATE: action.executionStatus === 'in_progress' (got: ${actionAfterStart.executionStatus})`);

    // 6. BLOCK ACTION (10x)
    const blockKey = 'conc-block-action-key-10x-f';
    const beforeBlockEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const beforeBlockIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const blockPromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({ reason: 'Ajuste de criativos' }, { id: createdCycleId, actionId: addedActionId }, { 'idempotency-key': blockKey });
      return blockCommercialActionController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });

    const blockResults = await Promise.all(blockPromises);
    assert(blockResults.every(r => r.status === 200), 'All 10 BLOCK requests succeeded');
    const afterBlockEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterBlockIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(afterBlockEvents - beforeBlockEvents === 1, `BLOCK event delta = 1 (was: ${afterBlockEvents - beforeBlockEvents})`);
    assert(afterBlockIdemp - beforeBlockIdemp === 1, `BLOCK idempotency delta = 1 (was: ${afterBlockIdemp - beforeBlockIdemp})`);
    
    // Estado Lógico BLOCK
    const actionAfterBlock = concDb.getRawCollection('commercial_actions')[addedActionId];
    assert(actionAfterBlock.executionStatus === 'blocked', `BLOCK STATE: action.executionStatus === 'blocked' (got: ${actionAfterBlock.executionStatus})`);

    // Desbloquear para poder concluir (blocked -> in_progress)
    const { req: reqUnblock, res: resUnblock } = createMockReqRes({}, { id: createdCycleId, actionId: addedActionId }, { 'idempotency-key': 'unblock_key_f' });
    await unblockCommercialActionController(reqUnblock, resUnblock);

    // 7. COMPLETE ACTION (10x)
    const completeKey = 'conc-complete-action-key-10x-f';
    const beforeCompleteEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const beforeCompleteIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const completePromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({ executionNotes: 'Concluído com sucesso 10x' }, { id: createdCycleId, actionId: addedActionId }, { 'idempotency-key': completeKey });
      return completeCommercialActionController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });

    const completeResults = await Promise.all(completePromises);
    assert(completeResults.every(r => r.status === 200), 'All 10 COMPLETE requests succeeded');
    const afterCompleteEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterCompleteIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(afterCompleteEvents - beforeCompleteEvents === 1, `COMPLETE event delta = 1 (was: ${afterCompleteEvents - beforeCompleteEvents})`);
    assert(afterCompleteIdemp - beforeCompleteIdemp === 1, `COMPLETE idempotency delta = 1 (was: ${afterCompleteIdemp - beforeCompleteIdemp})`);
    
    // Estado Lógico COMPLETE
    const actionAfterComplete = concDb.getRawCollection('commercial_actions')[addedActionId];
    assert(actionAfterComplete.executionStatus === 'completed', `COMPLETE STATE: action.executionStatus === 'completed' (got: ${actionAfterComplete.executionStatus})`);

    // 8. RECALCULATE CYCLE (10x)
    const recalcCycleKey = 'conc-recalc-cycle-key-10x-f';
    const beforeRecalcEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const beforeRecalcIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    const recalcPromises = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({}, { id: createdCycleId }, { 'idempotency-key': recalcCycleKey });
      return recalculateCommercialExecutionCycleController(req, res).then(() => ({
        status: res.getStatusCode(),
        data: res.getData()
      }));
    });

    const recalcResults = await Promise.all(recalcPromises);
    assert(recalcResults.every(r => r.status === 200), 'All 10 RECALCULATE CYCLE succeeded');
    const afterRecalcEvents = Object.keys(concDb.getRawCollection('commercial_execution_events')).length;
    const afterRecalcIdemp = Object.keys(concDb.getRawCollection('idempotency_records')).length;

    assert(afterRecalcEvents - beforeRecalcEvents === 1, `RECALCULATE CYCLE event delta = 1 (was: ${afterRecalcEvents - beforeRecalcEvents})`);
    assert(afterRecalcIdemp - beforeRecalcIdemp === 1, `RECALCULATE CYCLE idempotency delta = 1 (was: ${afterRecalcIdemp - beforeRecalcIdemp})`);
  }

  // -------------------------------------------------------------------------
  // TESTE 6: FETCH DATASET MIXED FORMATS (ISO, Timestamp, Numeric Seconds)
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 6: fetchCommercialDataset Mixed Date Formats ---');
  {
    const mixedDb = new MockFirestore();
    const orders = [
      { id: 'o_iso_f', orderId: 'o_iso_f', createdAt: '2026-06-15T12:00:00.000Z', paymentStatus: 'approved', pricing: { total: 100 } },
      { id: 'o_ts_f', orderId: 'o_ts_f', createdAt: { toDate: () => new Date('2026-06-16T12:00:00.000Z') }, paymentStatus: 'approved', pricing: { total: 200 } },
      { id: 'o_sec_f', orderId: 'o_sec_f', createdAt: Math.floor(new Date('2026-06-17T12:00:00.000Z').getTime() / 1000), paymentStatus: 'approved', pricing: { total: 300 } },
      { id: 'o_out_f', orderId: 'o_out_f', createdAt: '2026-07-05T12:00:00.000Z', paymentStatus: 'approved', pricing: { total: 400 } }
    ];

    for (const o of orders) {
      await mixedDb.collection('orders').doc(o.id).set(o);
    }

    const ds = await fetchCommercialDataset(mixedDb, '2026-06-01', '2026-06-30');
    assert(ds.orders.length === 3, `fetchCommercialDataset retornou exatamente 3 pedidos válidos na janela (obteve: ${ds.orders.length})`);
    assert(ds.orders.some(o => o.id === 'o_iso_f'), 'Pedido com data ISO string recuperado');
    assert(ds.orders.some(o => o.id === 'o_ts_f'), 'Pedido com data Firestore Timestamp recuperado');
    assert(ds.orders.some(o => o.id === 'o_sec_f'), 'Pedido com data em Segundos Numéricos recuperado');
    assert(!ds.orders.some(o => o.id === 'o_out_f'), 'Pedido fora do intervalo corretamente excluído');
  }

  // -------------------------------------------------------------------------
  // TESTE 7: FIRESTORE RULES SOURCE ASSERTIONS
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE 7: Firestore Rules Source Assertions ---');
  {
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    const actionsBlocked = rulesContent.includes('match /commercial_actions/{actionId}') && 
      (rulesContent.includes('allow create, update, delete: if false;') || rulesContent.includes('allow write: if false;'));
    assert(actionsBlocked, 'commercial_actions client-side write is blocked (false)');

    const cyclesBlocked = rulesContent.includes('match /commercial_execution_cycles/{cycleId}') && 
      (rulesContent.includes('allow create, update, delete: if false;') || rulesContent.includes('allow write: if false;'));
    assert(cyclesBlocked, 'commercial_execution_cycles client-side write is blocked (false)');

    const eventsBlocked = rulesContent.includes('match /commercial_execution_events/{eventId}') && 
      (rulesContent.includes('allow create, update, delete: if false;') || rulesContent.includes('allow write: if false;'));
    assert(eventsBlocked, 'commercial_execution_events client-side write is blocked (false)');

    const locksBlocked = rulesContent.includes('match /commercial_action_recommendation_locks/{lockId}') && 
      (rulesContent.includes('allow read, create, update, delete: if false;') || rulesContent.includes('allow read, write: if false;'));
    assert(locksBlocked, 'commercial_action_recommendation_locks client-side read/write is completely blocked (false)');
  }

  console.log('=================================================================');
  console.log(`🏁 CERTIFICAÇÃO FASE 9.6.7-F: ${passCount} PASS, ${failCount} FAIL`);
  console.log('=================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('test_phase_9_6_7_f_final.ts')) {
  runTests().catch(err => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
  });
}
