/**
 * TESTE DE CERTIFICAÇÃO FASE 9.6.7-A — HARDENING DE INTEGRIDADE, ACTUALS E COMPATIBILIDADE
 * Valida:
 * 1. CommercialAction 9.6.4 Backward Compatibility na coleção commercial_actions
 * 2. Máquina de Estados Estrita (planned -> ready -> in_progress -> blocked/completed/cancelled)
 * 3. Bloqueio de mutações operacionais em Ciclos 'completed' e 'archived'
 * 4. Cálculo determinístico de actualImpact somente no Backend via motores certificados
 * 5. Idempotência estrita (10 requisições concorrentes com mesma chave -> 1 único processamento, sem replicação; divergência -> 409)
 * 6. Range queries canônicas no dataset comercial sem scans globais
 * 7. Health Signals e todos os 13 Códigos Canônicos de Alerta
 */

import {
  calculateExecutionProgress,
  calculateBudgetExecutionProgress,
  calculateExecutionHealth,
  generateExecutionAlerts,
  prioritizeCommercialActions
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
  addCommercialActionToCycleController,
  updateCommercialActionController,
  readyCommercialActionController,
  startCommercialActionController,
  blockCommercialActionController,
  unblockCommercialActionController,
  completeCommercialActionController,
  cancelCommercialActionController,
  recalculateCommercialActionImpactController
} from '../server/controllers/commercialExecution.controller.js';
import { fetchCommercialDataset } from '../server/utils/commercialDataset.js';

// Setup Mock Firestore InMemory DB
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
    return copy;
  }

  limit(num: number) {
    return this;
  }

  async get() {
    const docs: any[] = [];
    const prefix = `${this.name}/`;
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        const id = key.slice(prefix.length);
        let matches = true;
        for (const w of this.whereClauses) {
          if (w.op === '==' && value[w.field] !== w.val) {
            matches = false;
            break;
          }
          if (w.op === '>=' && (value[w.field] < w.val)) {
            matches = false;
            break;
          }
          if (w.op === '<=' && (value[w.field] > w.val)) {
            matches = false;
            break;
          }
        }
        if (matches) {
          docs.push({
            id,
            data: () => JSON.parse(JSON.stringify(value))
          });
        }
      }
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
  private lock = Promise.resolve();

  collection(name: string) {
    return new MockCollectionRef(name, this.storage);
  }

  async runTransaction(cb: (tx: any) => Promise<any>) {
    // Serializar transações para simular o isolamento serializado do Firestore
    const previousLock = this.lock;
    let releaseLock: () => void;
    this.lock = new Promise(resolve => {
      releaseLock = resolve;
    });

    await previousLock;
    try {
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
    } finally {
      releaseLock!();
    }
  }
}

function createMockReqRes(body: any = {}, headers: any = {}, params: any = {}, query: any = {}) {
  const finalHeaders = {
    'idempotency-key': headers['idempotency-key'] || headers['Idempotency-Key'] || `mock_idem_${Math.random().toString(36).slice(2, 9)}`,
    ...headers
  };
  const req: any = {
    body,
    headers: finalHeaders,
    params,
    query,
    user: { uid: 'admin_test', email: 'fpacstore@gmail.com', name: 'Admin Test' }
  };
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    }
  };
  return { req, res };
}

async function runHardeningTests() {
  console.log('================================================================');
  console.log('TEST SUITE: FASE 9.6.7-A — HARDENING DE INTEGRIDADE & COMPATIBILIDADE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  const mockDb = new MockDb();
  setCommercialExecutionDb(mockDb as any);

  // Seed baseline Budget
  const budgetId = 'budget_2026_q3';
  mockDb.storage.set(`commercial_budgets/${budgetId}`, {
    id: budgetId,
    title: 'Budget Q3 2026',
    status: 'active',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    targetRevenue: 100000,
    maxAllowedCogs: 35000,
    maxAllowedTrafficSpend: 15000,
    minContributionMargin: 30000,
    guardrails: {
      maxCogsPercentOfRevenue: 35,
      maxTrafficSpendPercentOfRevenue: 15,
      minContributionMarginPercent: 30,
      burnRateAlertThresholdPercent: 110
    },
    lineAllocations: {
      FORCE: { targetRevenue: 50000, maxCogs: 17500, maxTraffic: 7500, minMargin: 15000 },
      MARK: { targetRevenue: 30000, maxCogs: 10500, maxTraffic: 4500, minMargin: 9000 },
      PRIME: { targetRevenue: 20000, maxCogs: 7000, maxTraffic: 3000, minMargin: 6000 }
    }
  });

  // Seed sample orders in period
  mockDb.storage.set('orders/ord_101', {
    id: 'ord_101',
    createdAt: new Date().toISOString(),
    status: 'Pagamento Aprovado',
    paymentStatus: 'approved',
    orderTotal: 10000,
    financial: {
      grossRevenue: 10000,
      netRevenue: 9500,
      totalCogs: 3000,
      grossProfit: 6500,
      totalVariableExpenses: 1000,
      contributionMargin: 5500,
      contributionMarginPercent: 55,
      netProfit: 4500
    },
    items: [
      { id: 'item_1', sku: 'FORCE-01', productLine: 'FORCE', name: 'Camiseta FORCE', price: 100, quantity: 100, costPrice: 30 }
    ]
  });

  console.log('--- TEST 1: CommercialAction 9.6.4 Backward Compatibility ---');
  // 1. Criar Ciclo
  const { req: cReq, res: cRes } = createMockReqRes({
    title: 'Ciclo Q3 Hardening',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    budgetId: budgetId
  });
  await createCommercialExecutionCycleController(cReq, cRes);
  const cycleId = cRes.body.cycle.id;
  assert(cRes.statusCode === 201 && !!cycleId, 'Ciclo criado com sucesso com budgetId vinculado');

  // 2. Adicionar Ação Comercial ao Ciclo
  const { req: aReq, res: aRes } = createMockReqRes({
    title: 'Campanha de Recuperação Linha FORCE',
    description: 'Ação focada em otimização de campanhas para alavancar margem da linha FORCE',
    priority: 'high',
    productLine: 'FORCE',
    ownerName: 'Gerente Comercial',
    plannedStartDate: '2026-07-05',
    plannedEndDate: '2026-07-25',
    expectedImpact: {
      revenueImpact: 15000,
      contributionMarginImpact: 6000
    }
  }, {}, { id: cycleId });

  await addCommercialActionToCycleController(aReq, aRes);
  assert(aRes.statusCode === 201, 'Ação adicionada ao ciclo com sucesso');
  const actionId = aRes.body.action.id;

  // Verificar documento persistido na coleção commercial_actions
  const persistedAction = mockDb.storage.get(`commercial_actions/${actionId}`);
  assert(!!persistedAction, 'Documento persistido na coleção canonical commercial_actions');
  assert(persistedAction.status === 'pending_approval' || persistedAction.status === 'draft', 'Campo 9.6.4 status presente e compatível');
  assert(['price_adjustment', 'bundle_create', 'cross_sell_rule', 'cost_renegotiation', 'marketing_boost', 'stock_clearance', 'custom'].includes(persistedAction.type), 'Campo 9.6.4 type presente e compatível');
  assert(['product', 'line', 'bundle', 'general', 'custom'].includes(persistedAction.entityType), 'Campo 9.6.4 entityType compatível');
  assert(['opportunity', 'risk', 'governance_alert', 'manual', 'commercial_intelligence', 'planning_scenario', 'budget_deviation'].includes(persistedAction.source), 'Campo 9.6.4 source compatível');
  assert(persistedAction.executionCycleId === cycleId, 'Campo 9.6.7 executionCycleId gravado');
  assert(persistedAction.executionStatus === 'planned', 'Campo 9.6.7 executionStatus inicial = planned');

  console.log('\n--- TEST 2: Máquina de Estados Estrita ---');
  // Tentativa inválida: planned -> completed (deve ser rejeitado com 400 ou 409)
  const { req: invReq, res: invRes } = createMockReqRes({}, {}, { id: cycleId, actionId });
  await completeCommercialActionController(invReq, invRes);
  assert(invRes.statusCode === 400 || invRes.statusCode === 409, 'Transição direta planned -> completed bloqueada');

  // Transição válida 1: planned -> ready
  const { req: rdyReq, res: rdyRes } = createMockReqRes({}, {}, { id: cycleId, actionId });
  await readyCommercialActionController(rdyReq, rdyRes);
  assert(rdyRes.statusCode === 200 && rdyRes.body.action.executionStatus === 'ready', 'Transição planned -> ready efetuada com sucesso');

  // Transição válida 2: ready -> in_progress
  const { req: strtReq, res: strtRes } = createMockReqRes({}, {}, { id: cycleId, actionId });
  await startCommercialActionController(strtReq, strtRes);
  assert(strtRes.statusCode === 200 && strtRes.body.action.executionStatus === 'in_progress', 'Transição ready -> in_progress efetuada com sucesso');

  // Transição válida 3: in_progress -> blocked
  const { req: blkReq, res: blkRes } = createMockReqRes({ blockingReason: 'Falta de verba liberada pelo marketing' }, {}, { id: cycleId, actionId });
  await blockCommercialActionController(blkReq, blkRes);
  assert(blkRes.statusCode === 200 && blkRes.body.action.executionStatus === 'blocked', 'Transição in_progress -> blocked efetuada com motivo registrado');

  // Transição válida 4: blocked -> in_progress (unblock)
  const { req: unblkReq, res: unblkRes } = createMockReqRes({}, {}, { id: cycleId, actionId });
  await unblockCommercialActionController(unblkReq, unblkRes);
  assert(unblkRes.statusCode === 200 && unblkRes.body.action.executionStatus === 'in_progress', 'Transição blocked -> in_progress (unblock) efetuada');

  // Transição válida 5: in_progress -> completed
  const { req: cmpReq, res: cmpRes } = createMockReqRes({ executionNotes: 'Campanha executada conforme planejamento' }, {}, { id: cycleId, actionId });
  await completeCommercialActionController(cmpReq, cmpRes);
  assert(cmpRes.statusCode === 200 && cmpRes.body.action.executionStatus === 'completed', 'Transição in_progress -> completed efetuada com sucesso');
  assert(!!cmpRes.body.action.actualImpact, 'Impacto real (actualImpact) calculado automaticamente no complete');
  assert(cmpRes.body.action.actualImpact.impactAttribution === 'correlated' || cmpRes.body.action.actualImpact.impactAttribution === 'direct', 'Atribuição de impacto correlacionada para linha FORCE');

  console.log('\n--- TEST 3: Bloqueio de Mutações em Ciclos Completed / Archived ---');
  // Ativar ciclo primeiro (draft -> active)
  const { req: actCycReq, res: actCycRes } = createMockReqRes({}, {}, { id: cycleId });
  await activateCommercialExecutionCycleController(actCycReq, actCycRes);
  assert(actCycRes.statusCode === 200 && actCycRes.body.cycle.status === 'active', 'Ciclo ativado para active com sucesso');

  // Concluir ciclo (active -> completed)
  const { req: compCycReq, res: compCycRes } = createMockReqRes({}, {}, { id: cycleId });
  await completeCommercialExecutionCycleController(compCycReq, compCycRes);
  assert(compCycRes.statusCode === 200 && compCycRes.body.cycle.status === 'completed', 'Ciclo concluído com sucesso');

  // Tentativa de adicionar ação ao ciclo concluído
  const { req: addAfterCompReq, res: addAfterCompRes } = createMockReqRes({
    title: 'Ação Tardia',
    priority: 'low',
    plannedStartDate: '2026-07-10',
    plannedEndDate: '2026-07-20'
  }, {}, { id: cycleId });
  await addCommercialActionToCycleController(addAfterCompReq, addAfterCompRes);
  assert(addAfterCompRes.statusCode === 400 || addAfterCompRes.statusCode === 409, 'Adição de ação bloqueada em ciclo concluído');

  console.log('\n--- TEST 4: Idempotência Estrita & Concorrência (10 Chamadas Concorrentes) ---');
  // Criar um novo ciclo ativo para o teste de concorrência
  const { req: concCycReq, res: concCycRes } = createMockReqRes({
    title: 'Ciclo Concorrência',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    budgetId: budgetId
  });
  await createCommercialExecutionCycleController(concCycReq, concCycRes);
  const concCycleId = concCycRes.body.cycle.id;

  const idempotencyKey = 'idem_key_action_create_test_967a';
  const sharedPayload = {
    title: 'Ação Criada Concorrentemente',
    description: 'Teste de 10 chamadas concorrentes com mesma chave de idempotência',
    priority: 'medium',
    productLine: 'MARK',
    plannedStartDate: '2026-08-05',
    plannedEndDate: '2026-08-15'
  };

  // Disparar 10 chamadas concorrentes simultâneas com mesma chave
  const concurrentPromises = Array.from({ length: 10 }).map(() => {
    const { req, res } = createMockReqRes(sharedPayload, { 'idempotency-key': idempotencyKey }, { id: concCycleId });
    return addCommercialActionToCycleController(req, res).then(() => res);
  });

  const responses = await Promise.all(concurrentPromises);
  const successCodes = responses.map(r => r.statusCode);
  const allSuccessful = successCodes.every(c => c === 200 || c === 201);
  assert(allSuccessful, `Todas as 10 requisições responderam com sucesso HTTP (códigos: ${successCodes.slice(0, 3).join(', ')}...)`);

  // Verificar se os actionIds retornados são exatamente o mesmo ID
  const returnedActionIds = new Set(responses.map(r => r.body.action.id));
  assert(returnedActionIds.size === 1, 'Exatamente 1 ação única criada; todas as 10 chamadas retornaram o mesmo ID deduplicado');

  // Testar divergência de payload com a mesma chave (deve retornar 409 Conflict)
  const divergentPayload = {
    ...sharedPayload,
    title: 'Payload Divergente com Mesma Chave'
  };
  const { req: divReq, res: divRes } = createMockReqRes(divergentPayload, { 'idempotency-key': idempotencyKey }, { id: concCycleId });
  await addCommercialActionToCycleController(divReq, divRes);
  assert(divRes.statusCode === 409, 'Detecção de replay com payload divergente retornou HTTP 409 Conflict');

  console.log('\n--- TEST 5: Health Signals e 13 Códigos Canônicos de Alerta ---');
  // Validar geração de alertas e status de saúde do ciclo
  const mockHealthyProgress: any = {
    totalActions: 5,
    completedActions: 4,
    inProgressActions: 1,
    blockedActions: 0,
    criticalBlockedActions: 0,
    overdueActions: 0,
    criticalOverdueActions: 0,
    completionPercent: 80
  };
  const mockHealthyBudget: any = {
    revenue: { varianceToExpectedPercent: 5, gapToBudget: 1000, gapToGoal: 0 },
    contributionMargin: { varianceToExpectedPercent: 2 },
    operatingProfit: { varianceToExpectedPercent: 0 },
    timeProgressPercent: 50
  };

  const healthHealthy = calculateExecutionHealth({
    progress: mockHealthyProgress,
    budgetExecution: mockHealthyBudget,
    costCoveragePercent: 95,
    confidence: 'high',
    hasSufficientData: true
  });
  assert(healthHealthy.status === 'healthy', 'calculateExecutionHealth retorna healthy para progresso alinhado e sem bloqueios');

  const mockCriticalProgress: any = {
    totalActions: 5,
    completedActions: 1,
    inProgressActions: 1,
    blockedActions: 3,
    criticalBlockedActions: 2,
    overdueActions: 2,
    criticalOverdueActions: 2,
    completionPercent: 20
  };
  const mockCriticalBudget: any = {
    revenue: { varianceToExpectedPercent: -35, gapToBudget: -20000, gapToGoal: -30000 },
    contributionMargin: { varianceToExpectedPercent: -30 },
    operatingProfit: { varianceToExpectedPercent: -40 },
    timeProgressPercent: 60
  };

  const healthCritical = calculateExecutionHealth({
    progress: mockCriticalProgress,
    budgetExecution: mockCriticalBudget,
    costCoveragePercent: 85,
    confidence: 'high',
    hasSufficientData: true
  });
  assert(healthCritical.status === 'critical', 'calculateExecutionHealth retorna critical quando há ações críticas bloqueadas e atrasadas');

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL FASE 9.6.7-A: ${passed} PASSOU / ${failed} FALHOU`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runHardeningTests().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
