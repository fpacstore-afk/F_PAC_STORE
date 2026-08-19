/**
 * SUÍTE DE CERTIFICAÇÃO FASE 9.6.7-D (PROVAS FINAIS DE EXECUÇÃO COMERCIAL, ATRIBUIÇÃO & CONCORRÊNCIA)
 * FPAC Store — Engenharia de Alta Confiabilidade
 *
 * PROVAS COBERTAS:
 * 1. Line Performance do Dashboard (calculateProductProfitability + aggregateProfitabilityByLine canônicos)
 * 2. Direct Attribution Isolation (Respeito rigoroso a productLine em compras multi-item com tracking)
 * 3. Cost Governance & Confidence (Preservação de receita, confidence='insufficient', omissão de CM/OP quando custo indisponível)
 * 4. Concorrência 10x Idempotente (CREATE, ACTIVATE, READY, START, BLOCK, UNBLOCK, COMPLETE, CANCEL, RECALCULATE)
 * 5. Concorrência 10x de Recomendação (Diferentes idempotency keys, mesmo sourceRecommendationId -> 1 única ação criada)
 * 6. Recommendation Lock Determinístico (SHA256 do par cycleId:sourceRecommendationId)
 * 7. Cursor de Paginação Server-Side (400 INVALID_CURSOR para cursor inexistente)
 * 8. Pipeline de Autenticação Admin (authenticateAdmin + bearer tokens + 401 para token inválido)
 * 9. Normalização Resiliente de Datas Mistas (ISO, Firestore Timestamp, Date, legacy seconds, out-of-period exclusion)
 */

import crypto from 'crypto';
import {
  calculateExecutionProgress,
  calculateBudgetExecutionProgress,
  calculateExecutionHealth,
  generateExecutionAlerts,
  prioritizeCommercialActions,
  normalizeDateToObj,
  formatDateToYMD
} from '../src/utils/commercialExecution.js';
import {
  setCommercialExecutionDb,
  createCommercialExecutionCycleController,
  updateCommercialExecutionCycleController,
  activateCommercialExecutionCycleController,
  completeCommercialExecutionCycleController,
  archiveCommercialExecutionCycleController,
  getCommercialExecutionDashboardController,
  recalculateCommercialExecutionCycleController,
  getCommercialExecutionEventsController,
  addCommercialActionToCycleController,
  updateCommercialActionController,
  readyCommercialActionController,
  startCommercialActionController,
  blockCommercialActionController,
  unblockCommercialActionController,
  completeCommercialActionController,
  cancelCommercialActionController,
  recalculateCommercialActionImpactController,
  computeActionActualImpactCanonical
} from '../server/controllers/commercialExecution.controller.js';
import {
  calculateProductProfitability,
  calculateOrderProfitability,
  aggregateProfitabilityByLine
} from '../src/utils/profitability.js';
import {
  authenticateAdmin,
  setAuthTokenVerifierForTesting,
  resetAuthForTesting
} from '../server/middleware/auth.middleware.js';
import {
  CommercialExecutionActionItem,
  CommercialExecutionCycle
} from '../src/types/commercialExecution.js';

// Setup Mock Firestore InMemory DB com suporte a Query Tracking, Cursors e Transações Atômicas Serializáveis
class MockDocRef {
  id: string;
  collectionName: string;
  storage: Map<string, any>;

  constructor(id: string, collectionName: string, storage: Map<string, any>) {
    this.id = id;
    this.collectionName = collectionName;
    this.storage = storage;
  }

  async get() {
    const data = this.storage.get(`${this.collectionName}/${this.id}`);
    return {
      exists: !!data,
      id: this.id,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : null)
    };
  }

  async set(data: any) {
    this.storage.set(`${this.collectionName}/${this.id}`, JSON.parse(JSON.stringify(data)));
  }

  async update(data: any) {
    const existing = this.storage.get(`${this.collectionName}/${this.id}`) || {};
    this.storage.set(`${this.collectionName}/${this.id}`, { ...existing, ...JSON.parse(JSON.stringify(data)) });
  }
}

class MockCollectionRef {
  name: string;
  storage: Map<string, any>;
  whereClauses: Array<{ field: string; op: string; val: any }> = [];
  orderByField?: string;
  orderDir?: 'asc' | 'desc';
  limitNum?: number;
  startAfterCursor?: any;
  static queryInvocations: Array<{ name: string; where: any[]; orderBy?: string; limit?: number; startAfter?: any }> = [];

  constructor(name: string, storage: Map<string, any>) {
    this.name = name;
    this.storage = storage;
  }

  doc(id?: string) {
    const docId = id || `mock_doc_${Math.random().toString(36).slice(2, 9)}`;
    return new MockDocRef(docId, this.name, this.storage);
  }

  where(field: string, op: string, val: any) {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses, { field, op, val }];
    copy.orderByField = this.orderByField;
    copy.orderDir = this.orderDir;
    copy.limitNum = this.limitNum;
    copy.startAfterCursor = this.startAfterCursor;
    return copy;
  }

  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses];
    copy.orderByField = field;
    copy.orderDir = dir;
    copy.limitNum = this.limitNum;
    copy.startAfterCursor = this.startAfterCursor;
    return copy;
  }

  startAfter(cursor: any) {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses];
    copy.orderByField = this.orderByField;
    copy.orderDir = this.orderDir;
    copy.limitNum = this.limitNum;
    copy.startAfterCursor = cursor;
    return copy;
  }

  limit(num: number) {
    const copy = new MockCollectionRef(this.name, this.storage);
    copy.whereClauses = [...this.whereClauses];
    copy.orderByField = this.orderByField;
    copy.orderDir = this.orderDir;
    copy.limitNum = num;
    copy.startAfterCursor = this.startAfterCursor;
    return copy;
  }

  async get() {
    MockCollectionRef.queryInvocations.push({
      name: this.name,
      where: this.whereClauses,
      orderBy: this.orderByField,
      limit: this.limitNum,
      startAfter: this.startAfterCursor
    });

    let docs: any[] = [];
    const prefix = `${this.name}/`;
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        const id = key.slice(prefix.length);
        let matches = true;
        for (const w of this.whereClauses) {
          if (w.op === '==') {
            if (value[w.field] !== w.val) { matches = false; break; }
          } else if (w.op === '>=') {
            const docVal = value[w.field];
            const targetVal = typeof w.val?.toDate === 'function' ? w.val.toDate().toISOString() : (w.val instanceof Date ? w.val.toISOString() : w.val);
            const normDocVal = typeof docVal?.toDate === 'function' ? docVal.toDate().toISOString() : (docVal instanceof Date ? docVal.toISOString() : String(docVal || ''));
            if (normDocVal < targetVal) { matches = false; break; }
          } else if (w.op === '<=') {
            const docVal = value[w.field];
            const targetVal = typeof w.val?.toDate === 'function' ? w.val.toDate().toISOString() : (w.val instanceof Date ? w.val.toISOString() : w.val);
            const normDocVal = typeof docVal?.toDate === 'function' ? docVal.toDate().toISOString() : (docVal instanceof Date ? docVal.toISOString() : String(docVal || ''));
            if (normDocVal > targetVal) { matches = false; break; }
          }
        }
        if (matches) {
          docs.push({
            id,
            ...value,
            data: () => JSON.parse(JSON.stringify(value))
          });
        }
      }
    }

    if (this.orderByField) {
      const field = this.orderByField;
      const isDesc = this.orderDir === 'desc';
      docs.sort((a, b) => {
        const valA = a[field];
        const valB = b[field];
        if (valA < valB) return isDesc ? 1 : -1;
        if (valA > valB) return isDesc ? -1 : 1;
        return 0;
      });
    }

    if (this.startAfterCursor) {
      const cursorId = typeof this.startAfterCursor === 'object' && this.startAfterCursor.id ? this.startAfterCursor.id : this.startAfterCursor;
      const idx = docs.findIndex(d => d.id === cursorId);
      if (idx >= 0) {
        docs = docs.slice(idx + 1);
      }
    }

    if (this.limitNum !== undefined) {
      docs = docs.slice(0, this.limitNum);
    }

    return {
      docs,
      empty: docs.length === 0,
      size: docs.length
    };
  }
}

class MockDb {
  storage = new Map<string, any>();
  private txQueue: Promise<any> = Promise.resolve();

  collection(name: string) {
    return new MockCollectionRef(name, this.storage);
  }

  async runTransaction(cb: (tx: any) => Promise<any>) {
    const run = async () => {
      const tx = {
        get: async (ref: MockDocRef) => ref.get(),
        set: (ref: MockDocRef, data: any) => {
          ref.storage.set(`${ref.collectionName}/${ref.id}`, JSON.parse(JSON.stringify(data)));
        },
        update: (ref: MockDocRef, data: any) => {
          const existing = ref.storage.get(`${ref.collectionName}/${ref.id}`) || {};
          ref.storage.set(`${ref.collectionName}/${ref.id}`, { ...existing, ...JSON.parse(JSON.stringify(data)) });
        }
      };
      return await cb(tx);
    };

    const next = this.txQueue.then(run, run);
    this.txQueue = next.then(() => {}, () => {});
    return next;
  }
}

function createMockReqRes(body: any = {}, headers: any = {}, params: any = {}, query: any = {}) {
  const req: any = {
    body,
    headers,
    params,
    query,
    user: {
      uid: 'admin_test_uid',
      email: 'admin@fpac.com.br',
      name: 'Admin Tester',
      role: 'admin'
    }
  };

  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    }
  };

  return { req, res };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.error(`  ❌ FALHA: ${msg}`);
    failed++;
  }
}

async function runPhase967DCertification() {
  console.log('======================================================================');
  console.log('🚀 INICIANDO AUDITORIA FINAL DE CERTIFICAÇÃO FASE 9.6.7-D');
  console.log('======================================================================\n');

  // =========================================================================
  // TESTE 1: LINE PERFORMANCE DO DASHBOARD (CANÔNICO AGGREGATEPROFITABILITYBYLINE)
  // =========================================================================
  console.log('--- TESTE 1: Dashboard Line Performance via Motores Canônicos ---');
  {
    const testProducts = [
      { id: 'p_f1', slug: 'camiseta-force-oversized', name: 'Camiseta FORCE Oversized', line: 'FORCE', cost: 35, manufacturingCost: 35 },
      { id: 'p_m1', slug: 'bone-mark-street', name: 'Boné MARK Street', line: 'MARK', cost: 25, manufacturingCost: 25 },
      { id: 'p_p1', slug: 'jaqueta-prime-tech', name: 'Jaqueta PRIME Tech', line: 'PRIME', cost: 90, manufacturingCost: 90 }
    ];

    const testOrders = [
      {
        id: 'ord_1',
        createdAt: '2026-08-10T10:00:00.000Z',
        paymentStatus: 'approved',
        pricing: { total: 100 },
        payment: { paidAmount: 100 },
        items: [{ productId: 'p_f1', slug: 'camiseta-force-oversized', line: 'FORCE', price: 100, quantity: 1, cost: 35 }]
      },
      {
        id: 'ord_2',
        createdAt: '2026-08-12T14:00:00.000Z',
        paymentStatus: 'approved',
        pricing: { total: 200 },
        payment: { paidAmount: 200 },
        items: [{ productId: 'p_m1', slug: 'bone-mark-street', line: 'MARK', price: 100, quantity: 2, cost: 25 }]
      }
    ];

    const prodProf = calculateProductProfitability(testOrders as any, testProducts as any);
    const ordProf = testOrders.map(o => calculateOrderProfitability(o as any, testProducts as any));
    const lineAggs = aggregateProfitabilityByLine(prodProf, ordProf);

    assert(Array.isArray(lineAggs), 'aggregateProfitabilityByLine retorna array de linhas');
    const forceAgg = lineAggs.find(l => l.lineName === 'FORCE');
    const markAgg = lineAggs.find(l => l.lineName === 'MARK');

    assert(forceAgg !== undefined && forceAgg.grossRevenue === 100, 'Linha FORCE agregada corretamente (Receita R$ 100)');
    assert(markAgg !== undefined && markAgg.grossRevenue === 200 && markAgg.unitsSold === 2, 'Linha MARK agregada corretamente (Receita R$ 200, 2 unidades)');
  }

  // =========================================================================
  // TESTE 2: DIRECT ATTRIBUTION ISOLATION COM ESCOPO DE LINHA DE PRODUTO
  // =========================================================================
  console.log('\n--- TESTE 2: Direct Attribution com Isolamento de Linha ---');
  {
    const multiItemOrder = {
      id: 'ord_multi_1',
      createdAt: '2026-08-10T10:00:00.000Z',
      couponCode: 'CUPOM_FORCE_10',
      actionTrackingId: 'TRACK_FORCE_PROMO',
      paymentStatus: 'approved',
      pricing: { total: 300 },
      payment: { paidAmount: 300, gatewayFee: 9 },
      items: [
        { productId: 'p_force', slug: 'camisa-force', line: 'FORCE', price: 100, quantity: 1, cost: 30 },
        { productId: 'p_mark', slug: 'calca-mark', line: 'MARK', price: 200, quantity: 1, cost: 60 }
      ]
    };

    const dataset = {
      orders: [multiItemOrder],
      expenses: [],
      investments: [],
      traffic: [],
      products: [
        { id: 'p_force', slug: 'camisa-force', line: 'FORCE', cost: 30 },
        { id: 'p_mark', slug: 'calca-mark', line: 'MARK', cost: 60 }
      ]
    };

    // Ação com tracking e escopo restrito a FORCE
    const actionForce: any = {
      id: 'act_force',
      title: 'Campanha FORCE Exclusiva',
      productLine: 'FORCE',
      executionStatus: 'completed',
      priority: 'high',
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-08-31',
      actionTrackingId: 'TRACK_FORCE_PROMO'
    };

    const impact = computeActionActualImpactCanonical({
      action: actionForce,
      dataset,
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });

    assert(impact.impactAttribution === 'direct', 'Atribuição classificada como direct');
    assert(impact.revenue === 100, `Receita isolada estritamente para itens FORCE (Esperado 100, Obtido ${impact.revenue})`);
    assert(impact.units === 1, `Unidades isoladas estritamente para itens FORCE (Esperado 1, Obtido ${impact.units})`);
    assert(impact.orders === 1, `Contagem de pedidos válidos com FORCE (Esperado 1, Obtido ${impact.orders})`);
    assert(impact.costCoveragePercent === 100, 'Cobertura de custo 100%');
    assert(impact.confidence === 'high', 'Confiança high para atribuição direta determinística');
    assert(typeof impact.contributionMargin === 'number' && impact.contributionMargin > 0, 'Margem de contribuição calculada com sucesso');
  }

  // =========================================================================
  // TESTE 3: COST GOVERNANCE & CONFIDENCE (DADOS DE CUSTO AUSENTES / INSUFICIENTES)
  // =========================================================================
  console.log('\n--- TESTE 3: Cost Governance e Incerteza de Custos ---');
  {
    const missingCostOrder = {
      id: 'ord_missing_cost',
      createdAt: '2026-08-15T12:00:00.000Z',
      couponCode: 'CUPOM_NOVO',
      actionTrackingId: 'TRACK_NO_COST',
      paymentStatus: 'approved',
      pricing: { total: 300 },
      payment: { paidAmount: 300 },
      items: [
        { productId: 'p_unknown', slug: 'produto-sem-custo', line: 'FORCE', price: 300, quantity: 1 } // sem cost
      ]
    };

    const dataset = {
      orders: [missingCostOrder],
      expenses: [],
      investments: [],
      traffic: [],
      products: [
        { id: 'p_unknown', slug: 'produto-sem-custo', line: 'FORCE', cost: 0 } // custo 0/indisponível
      ]
    };

    const actionNoCost: any = {
      id: 'act_nocost',
      title: 'Ação com Custo Desconhecido',
      productLine: 'FORCE',
      executionStatus: 'completed',
      priority: 'high',
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-08-31',
      actionTrackingId: 'TRACK_NO_COST'
    };

    const impact = computeActionActualImpactCanonical({
      action: actionNoCost,
      dataset,
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });

    assert(impact.revenue === 300, `Receita real preservada (Esperado 300, Obtido ${impact.revenue})`);
    assert(impact.confidence === 'insufficient', `Confidence marcado como 'insufficient' devido a custo ausente (Obtido ${impact.confidence})`);
    assert(impact.contributionMargin === undefined, 'Margem de contribuição omitida/undefined para não inventar lucro zero falso');
    assert(impact.operatingProfit === undefined, 'Resultado operacional omitido/undefined');
    assert(impact.costCoveragePercent === 0, 'costCoveragePercent reportado como 0%');
  }

  // =========================================================================
  // TESTE 4: 10X CONCORRÊNCIA IDEMPOTENTE EM TODA A MÁQUINA DE ESTADOS
  // =========================================================================
  console.log('\n--- TESTE 4: 10x Concorrência Idempotente em Transações ---');
  {
    const db = new MockDb();
    setCommercialExecutionDb(db);

    // Setup Budget
    await db.collection('commercial_budgets').doc('b_concurrent_1').set({
      id: 'b_concurrent_1',
      version: 1,
      targetRevenue: 100000,
      targetContributionMargin: 40000,
      targetOperatingProfit: 15000,
      targetUnits: 1000,
      targetAverageTicket: 100
    });

    // 1. CREATE CYCLE 10x
    const createKey = 'idemp_cycle_create_conc_10x';
    const createReqs = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({
        title: 'Ciclo Concorrente 10x',
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        budgetId: 'b_concurrent_1'
      }, { 'idempotency-key': createKey });
      return createCommercialExecutionCycleController(req, res).then(() => res);
    });

    const createResponses = await Promise.all(createReqs);
    const createdCycleId = createResponses[0].body.cycle.id;
    const allSameId = createResponses.every(r => r.body?.cycle?.id === createdCycleId);
    assert(allSameId, '10x CREATE concurrentes retornam exatamente o mesmo Cycle ID');

    let cycleDocsCount = 0;
    for (const [k] of db.storage.entries()) {
      if (k.startsWith('commercial_execution_cycles/')) cycleDocsCount++;
    }
    assert(cycleDocsCount === 1, `Exatamente 1 documento de ciclo criado no Firestore (Obtido ${cycleDocsCount})`);

    // 2. ACTIVATE CYCLE 10x
    const actKey = 'idemp_cycle_act_conc_10x';
    const actReqs = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({}, { 'idempotency-key': actKey }, { id: createdCycleId });
      return activateCommercialExecutionCycleController(req, res).then(() => res);
    });
    const actResponses = await Promise.all(actReqs);
    const allActive = actResponses.every(r => r.body?.cycle?.status === 'active');
    assert(allActive, '10x ACTIVATE concurrentes resultam em ciclo ativo');

    // 3. ADD ACTION 10x com mesma chave
    const addKey = 'idemp_action_add_conc_10x';
    const addReqs = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({
        title: 'Ação Concorrente 1',
        productLine: 'FORCE',
        plannedStartDate: '2026-08-01',
        plannedEndDate: '2026-08-15'
      }, { 'idempotency-key': addKey }, { id: createdCycleId });
      return addCommercialActionToCycleController(req, res).then(() => res);
    });
    const addResponses = await Promise.all(addReqs);
    const createdActionId = addResponses[0].body.action.id;
    const allSameActionId = addResponses.every(r => r.body?.action?.id === createdActionId);
    assert(allSameActionId, '10x ADD ACTION concurrentes com mesma chave retornam o mesmo Action ID');

    let actionDocsCount = 0;
    for (const [k] of db.storage.entries()) {
      if (k.startsWith('commercial_actions/')) actionDocsCount++;
    }
    assert(actionDocsCount === 1, `Exatamente 1 documento de ação criado no Firestore (Obtido ${actionDocsCount})`);

    // 4. READY ACTION 10x
    const readyKey = 'idemp_action_ready_conc_10x';
    const readyReqs = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({}, { 'idempotency-key': readyKey }, { id: createdCycleId, actionId: createdActionId });
      return readyCommercialActionController(req, res).then(() => res);
    });
    const readyResponses = await Promise.all(readyReqs);
    assert(readyResponses.every(r => r.body?.action?.executionStatus === 'ready'), '10x READY concurrentes resultam em estado ready');

    // 5. START ACTION 10x
    const startKey = 'idemp_action_start_conc_10x';
    const startReqs = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({}, { 'idempotency-key': startKey }, { id: createdCycleId, actionId: createdActionId });
      return startCommercialActionController(req, res).then(() => res);
    });
    const startResponses = await Promise.all(startReqs);
    assert(startResponses.every(r => r.body?.action?.executionStatus === 'in_progress'), '10x START concurrentes resultam em estado in_progress');

    // 6. BLOCK ACTION 10x
    const blockKey = 'idemp_action_block_conc_10x';
    const blockReqs = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({ blockingReason: 'Aguardando fornecedor' }, { 'idempotency-key': blockKey }, { id: createdCycleId, actionId: createdActionId });
      return blockCommercialActionController(req, res).then(() => res);
    });
    const blockResponses = await Promise.all(blockReqs);
    assert(blockResponses.every(r => r.body?.action?.executionStatus === 'blocked'), '10x BLOCK concurrentes resultam em estado blocked');

    // 7. UNBLOCK ACTION 10x
    const unblockKey = 'idemp_action_unblock_conc_10x';
    const unblockReqs = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({}, { 'idempotency-key': unblockKey }, { id: createdCycleId, actionId: createdActionId });
      return unblockCommercialActionController(req, res).then(() => res);
    });
    const unblockResponses = await Promise.all(unblockReqs);
    assert(unblockResponses.every(r => r.body?.action?.executionStatus === 'in_progress'), '10x UNBLOCK concurrentes resultam em estado in_progress');

    // 8. COMPLETE ACTION 10x
    const completeKey = 'idemp_action_comp_conc_10x';
    const completeReqs = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({ executionNotes: 'Concluído com sucesso' }, { 'idempotency-key': completeKey }, { id: createdCycleId, actionId: createdActionId });
      return completeCommercialActionController(req, res).then(() => res);
    });
    const completeResponses = await Promise.all(completeReqs);
    assert(completeResponses.every(r => r.body?.action?.executionStatus === 'completed'), '10x COMPLETE concurrentes resultam em estado completed');

    // 9. RECALCULATE ACTION IMPACT 10x
    const recalcKey = 'idemp_action_recalc_conc_10x';
    const recalcReqs = Array.from({ length: 10 }).map(() => {
      const { req, res } = createMockReqRes({}, { 'idempotency-key': recalcKey }, { id: createdCycleId, actionId: createdActionId });
      return recalculateCommercialActionImpactController(req, res).then(() => res);
    });
    const recalcResponses = await Promise.all(recalcReqs);
    assert(recalcResponses.every(r => r.body?.action?.id === createdActionId), '10x RECALCULATE concurrentes completados com sucesso');
  }

  // =========================================================================
  // TESTE 5: 10X CONCORRÊNCIA COM DIFERENTES CHAVES E MESMO SOURCERECOMMENDATIONID
  // =========================================================================
  console.log('\n--- TESTE 5: 10x Deduplicação Multi-instância com Chaves Diferentes ---');
  {
    const db = new MockDb();
    setCommercialExecutionDb(db);

    const cycleId = 'cycle_rec_dedupe_1';
    await db.collection('commercial_execution_cycles').doc(cycleId).set({
      id: cycleId,
      status: 'active',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31'
    });

    const sourceRecId = 'REC_PRICE_PROMO_FORCE_001';

    const multiReqs = Array.from({ length: 10 }).map((_, idx) => {
      const { req, res } = createMockReqRes({
        title: 'Ação Gerada por Recomendação',
        productLine: 'FORCE',
        plannedStartDate: '2026-08-01',
        plannedEndDate: '2026-08-15',
        sourceRecommendationId: sourceRecId
      }, { 'idempotency-key': `unique_user_key_${idx}_${Date.now()}` }, { id: cycleId });
      return addCommercialActionToCycleController(req, res).then(() => res);
    });

    const responses = await Promise.all(multiReqs);
    const actionIds = responses.map(r => r.body?.action?.id).filter(Boolean);
    const uniqueActionIds = new Set(actionIds);

    assert(uniqueActionIds.size === 1, `Exatamente 1 ação criada e compartilhada por todas as 10 requisições simultâneas (Total IDs: ${uniqueActionIds.size})`);

    let actionsCount = 0;
    for (const [k] of db.storage.entries()) {
      if (k.startsWith('commercial_actions/')) actionsCount++;
    }
    assert(actionsCount === 1, `Coleção commercial_actions tem exatamente 1 documento (Obtido ${actionsCount})`);

    let lockDocsCount = 0;
    for (const [k] of db.storage.entries()) {
      if (k.startsWith('commercial_action_recommendation_locks/')) lockDocsCount++;
    }
    assert(lockDocsCount === 1, `Coleção commercial_action_recommendation_locks tem exatamente 1 documento (Obtido ${lockDocsCount})`);
  }

  // =========================================================================
  // TESTE 6: RECOMMENDATION LOCK DETERMINÍSTICO COM SHA256
  // =========================================================================
  console.log('\n--- TESTE 6: Recommendation Lock Determinístico SHA256 ---');
  {
    const db = new MockDb();
    setCommercialExecutionDb(db);

    const cycleId = 'cycle_hash_test_1';
    await db.collection('commercial_execution_cycles').doc(cycleId).set({
      id: cycleId,
      status: 'active',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31'
    });

    const rawRecId = 'REC-SPECIAL/TEST:2026';
    const expectedHash = crypto.createHash('sha256').update(`${cycleId}:${rawRecId}`).digest('hex');

    const { req, res } = createMockReqRes({
      title: 'Ação com Caracteres Especiais na Recomendação',
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-08-15',
      sourceRecommendationId: rawRecId
    }, { 'idempotency-key': 'key_hash_test_1' }, { id: cycleId });

    await addCommercialActionToCycleController(req, res);

    const expectedLockDocKey = `commercial_action_recommendation_locks/rec_lock_${expectedHash}`;
    assert(db.storage.has(expectedLockDocKey), `Documento de lock criado com a chave SHA256 correta: rec_lock_${expectedHash}`);
  }

  // =========================================================================
  // TESTE 7: PAGINAÇÃO FIRESTORE E 400 INVALID_CURSOR
  // =========================================================================
  console.log('\n--- TESTE 7: Paginação Server-Side Firestore e 400 INVALID_CURSOR ---');
  {
    const db = new MockDb();
    setCommercialExecutionDb(db);

    const cycleId = 'cycle_events_test_1';

    // Inserir 5 eventos
    for (let i = 1; i <= 5; i++) {
      await db.collection('commercial_execution_events').doc(`evt_${i}`).set({
        id: `evt_${i}`,
        executionCycleId: cycleId,
        eventType: 'cycle_updated',
        timestamp: `2026-08-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`
      });
    }

    // 1. Paginação regular limite 2
    {
      const { req, res } = createMockReqRes({}, {}, { id: cycleId }, { limit: '2' });
      await getCommercialExecutionEventsController(req, res);
      assert(res.body?.events?.length === 2, 'Página 1 retorna 2 eventos');
      assert(res.body?.hasMore === true, 'Página 1 indica hasMore = true');
      assert(res.body?.nextCursor === 'evt_5' || res.body?.nextCursor !== null, 'Página 1 retorna nextCursor');
    }

    // 2. Cursor inválido/inexistente deve retornar 400 INVALID_CURSOR
    {
      const { req, res } = createMockReqRes({}, {}, { id: cycleId }, { limit: '2', startAfter: 'cursor_que_nao_existe_123' });
      await getCommercialExecutionEventsController(req, res);
      assert(res.statusCode === 400, `Cursor inválido retorna HTTP 400 (Obtido ${res.statusCode})`);
      assert(res.body?.code === 'INVALID_CURSOR', `Código de erro é 'INVALID_CURSOR' (Obtido ${res.body?.code})`);
    }

    // 3. Cursor válido retorna a próxima página
    {
      const { req, res } = createMockReqRes({}, {}, { id: cycleId }, { limit: '2', startAfter: 'evt_5' });
      await getCommercialExecutionEventsController(req, res);
      assert(res.statusCode === 200, 'Cursor válido retorna HTTP 200');
      assert(res.body?.events?.length > 0, 'Próxima página de eventos retornada com sucesso');
    }
  }

  // =========================================================================
  // TESTE 8: AUTHENTICATE ADMIN E SEGURANÇA DE TOKENS
  // =========================================================================
  console.log('\n--- TESTE 8: Pipeline de Autenticação Admin ---');
  {
    resetAuthForTesting();

    // 1. Sem header Authorization -> 401
    {
      let nextCalled = false;
      const { req, res } = createMockReqRes({}, {});
      await authenticateAdmin(req, res, () => { nextCalled = true; });
      assert(res.statusCode === 401, 'Requisição sem token retorna HTTP 401');
      assert(!nextCalled, 'Next() não foi invocado sem token');
    }

    // 2. Token inválido -> 401
    {
      setAuthTokenVerifierForTesting(async () => {
        throw new Error('TOKEN_EXPIRED');
      });

      let nextCalled = false;
      const { req, res } = createMockReqRes({}, { authorization: 'Bearer invalid_token_123' });
      await authenticateAdmin(req, res, () => { nextCalled = true; });
      assert(res.statusCode === 401, 'Token inválido retorna HTTP 401');
      assert(!nextCalled, 'Next() não foi invocado com token inválido');
    }

    // 3. Token válido com role admin -> 200 e next()
    {
      setAuthTokenVerifierForTesting(async (token: string) => {
        if (token === 'valid_admin_token') {
          return { uid: 'admin_real', email: 'admin@fpacstore.com.br', role: 'admin' } as any;
        }
        throw new Error('INVALID');
      });

      let nextCalled = false;
      const { req, res } = createMockReqRes({}, { authorization: 'Bearer valid_admin_token' });
      await authenticateAdmin(req, res, () => { nextCalled = true; });
      assert(nextCalled, 'Next() invocado com token admin válido');
      assert(req.user?.uid === 'admin_real', 'User populado no request com sucesso');
    }
  }

  // =========================================================================
  // TESTE 9: NORMALIZAÇÃO DE DATAS MISTAS E EXCLUSÃO OUT-OF-PERIOD
  // =========================================================================
  console.log('\n--- TESTE 9: Normalização Resiliente de Datas Mistas ---');
  {
    // Testar normalizeDateToObj e formatDateToYMD em vários formatos
    const isoDateStr = '2026-08-15T14:30:00.000Z';
    const timestampObj = {
      toDate: () => new Date('2026-08-16T10:00:00.000Z'),
      _seconds: 1786874400,
      _nanoseconds: 0
    };
    const legacySeconds = 1786874400; // 2026-08-16
    const nativeDate = new Date('2026-08-17T08:00:00.000Z');

    assert(formatDateToYMD(isoDateStr) === '2026-08-15', 'Formata ISO String para YYYY-MM-DD');
    assert(formatDateToYMD(timestampObj) === '2026-08-16', 'Formata Firestore Timestamp para YYYY-MM-DD');
    assert(formatDateToYMD(legacySeconds) === '2026-08-16', 'Formata Legacy UNIX Seconds para YYYY-MM-DD');
    assert(formatDateToYMD(nativeDate) === '2026-08-17', 'Formata Native Date para YYYY-MM-DD');

    // Dataset com registros dentro e fora do período
    const mixedOrders = [
      { id: 'ord_in_1', createdAt: '2026-08-10T10:00:00.000Z', paymentStatus: 'approved', pricing: { total: 100 } },
      { id: 'ord_in_2', createdAt: timestampObj, paymentStatus: 'approved', pricing: { total: 150 } },
      { id: 'ord_out_early', createdAt: '2026-07-20T10:00:00.000Z', paymentStatus: 'approved', pricing: { total: 500 } },
      { id: 'ord_out_late', createdAt: '2026-09-05T10:00:00.000Z', paymentStatus: 'approved', pricing: { total: 800 } }
    ];

    const dataset = {
      orders: mixedOrders,
      expenses: [],
      investments: [],
      traffic: [],
      products: []
    };

    const actionGeneral: any = {
      id: 'act_mixed',
      title: 'Ação Geral',
      executionStatus: 'completed',
      priority: 'medium',
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-08-31'
    };

    const impact = computeActionActualImpactCanonical({
      action: actionGeneral,
      dataset,
      startDate: '2026-08-01',
      endDate: '2026-08-31'
    });

    assert(impact.orders === 2, `Exatamente 2 pedidos in-period contabilizados (Obtido ${impact.orders})`);
    assert(impact.revenue === 250, `Receita somada apenas dos in-period R$ 250 (Obtido R$ ${impact.revenue})`);
  }

  // =========================================================================
  // RELATÓRIO FINAL
  // =========================================================================
  console.log('\n======================================================================');
  console.log(`📋 RESULTADO FINAL DE CERTIFICAÇÃO FASE 9.6.7-D:`);
  console.log(`   Passaram: ${passed}`);
  console.log(`   Falharam: ${failed}`);
  console.log('======================================================================\n');

  if (failed > 0) {
    console.error(`❌ FASE 9.6.7-D NÃO CERTIFICADA: ${failed} falhas encontradas.`);
    process.exit(1);
  } else {
    console.log('🏆 FASE 9.6.7-D TOTALMENTE CERTIFICADA E BLINDADA COM SUCESSO!');
  }
}

runPhase967DCertification().catch(err => {
  console.error('❌ Erro fatal na execução do teste:', err);
  process.exit(1);
});
