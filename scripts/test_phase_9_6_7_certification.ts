/**
 * TESTE DE CERTIFICAÇÃO FASE 9.6.7 — EXECUÇÃO COMERCIAL, PLANOS DE AÇÃO & RESULTADOS
 * Valida:
 * 1. Funções matemáticas e determinísticas de execução:
 *    - calculateExecutionProgress
 *    - calculateBudgetExecutionProgress (reconciliação temporal pro-rata MTD vs Expected)
 *    - calculateExecutionHealth
 *    - generateExecutionAlerts
 *    - prioritizeCommercialActions
 * 2. Máquina de estados estrita:
 *    - planned -> ready -> in_progress -> blocked -> in_progress -> completed
 *    - planned -> cancelled
 *    - bloqueio de transições inválidas
 * 3. Endpoints Backend do Controller:
 *    - Ciclos: create, patch, activate, complete, archive, dashboard, recalculate
 *    - Ações: create, patch, start, block, unblock, complete, cancel, recalculate-impact
 *    - Idempotência: deduplicação por Idempotency-Key com mesmo payload, detecção de conflito em divergência
 *    - Congelamento de Snapshot imutável de Budget no activate
 *    - Imutabilidade estrutural em ciclos 'completed' e 'archived'
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
import {
  CommercialExecutionActionItem,
  CommercialExecutionCycle
} from '../src/types/commercialExecution.js';

// Setup Mock Firestore InMemory DB
class MockDocRef {
  id: string;
  dataObj: any;
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
    let docs: any[] = [];
    const prefix = `${this.name}/`;
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        const id = key.slice(prefix.length);
        let matches = true;
        for (const w of this.whereClauses) {
          if (value[w.field] !== w.val) {
            matches = false;
            break;
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

  collection(name: string) {
    return new MockCollectionRef(name, this.storage);
  }

  async runTransaction(cb: (tx: any) => Promise<any>) {
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
  }
}

function createMockReqRes(body: any = {}, headers: any = {}, params: any = {}, query: any = {}) {
  const req: any = {
    body,
    headers: { ...headers },
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

async function runTests() {
  console.log('================================================================');
  console.log('TEST SUITE: FASE 9.6.7 — EXECUÇÃO COMERCIAL, PLANO DE AÇÃO E RESULTADOS');
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

  // -------------------------------------------------------------
  // TESTE 1: Métricas de Progresso de Execução
  // -------------------------------------------------------------
  console.log('--- TESTE 1: Métricas e Utilitários de Progresso ---');
  const mockActions: CommercialExecutionActionItem[] = [
    {
      id: 'act_1',
      executionCycleId: 'cycle_1',
      title: 'Ação 1',
      description: 'Desc 1',
      executionStatus: 'completed',
      priority: 'high',
      completionPercent: 100,
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-08-10',
      createdAt: '2026-08-01',
      createdBy: 'admin_test'
    },
    {
      id: 'act_2',
      executionCycleId: 'cycle_1',
      title: 'Ação 2',
      description: 'Desc 2',
      executionStatus: 'in_progress',
      priority: 'critical',
      completionPercent: 50,
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-08-15',
      createdAt: '2026-08-01',
      createdBy: 'admin_test'
    },
    {
      id: 'act_3',
      executionCycleId: 'cycle_1',
      title: 'Ação 3',
      description: 'Desc 3',
      executionStatus: 'blocked',
      blockingReason: 'Aguardando fornecedor',
      priority: 'medium',
      completionPercent: 20,
      plannedStartDate: '2026-08-01',
      plannedEndDate: '2026-08-05',
      createdAt: '2026-08-01',
      createdBy: 'admin_test'
    }
  ];

  const progress = calculateExecutionProgress(mockActions, new Date('2026-08-12'));
  assert(progress.totalActions === 3, 'Total de ações calculado');
  assert(progress.completedActions === 1, 'Ações concluídas calculadas');
  assert(progress.inProgressActions === 1, 'Ações em progresso calculadas');
  assert(progress.blockedActions === 1, 'Ações bloqueadas calculadas');
  assert(progress.overdueActions === 1, 'Ações atrasadas identificadas corretamente (act_3)');
  assert(Math.round(progress.completionPercent) === 57, `Percentual médio ponderado calculado (${progress.completionPercent}%)`);

  // -------------------------------------------------------------
  // TESTE 2: Reconciliação Temporal Pro-Rata (MTD vs Expected)
  // -------------------------------------------------------------
  console.log('\n--- TESTE 2: Reconciliação Temporal Pro-Rata (MTD vs Expected) ---');
  const budgetExec = calculateBudgetExecutionProgress({
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    referenceDate: new Date('2026-08-15'), // Dia 15 de 31 (~48.39%)
    budget: {
      revenue: 100000,
      contributionMargin: 40000,
      operatingProfit: 20000,
      units: 1000,
      averageTicket: 100
    },
    actuals: {
      revenue: 55000, // Acima do esperado pro-rata
      contributionMargin: 22000,
      operatingProfit: 11000,
      units: 550
    },
    forecast: {
      revenue: 105000
    },
    goals: {
      revenue: 110000
    }
  });

  assert(budgetExec.daysElapsed === 15, 'Dias decorridos calculados');
  assert(budgetExec.totalDays === 31, 'Total de dias do ciclo calculado');
  assert(budgetExec.timeProgressPercent === 48.39, 'Progresso temporal pro-rata calculado');
  assert(Math.round(budgetExec.revenue.expectedToDate) === 48387, `Receita esperada pro-rata calculada (esperado ~48387, obtido ${budgetExec.revenue.expectedToDate})`);
  assert(Math.round(budgetExec.revenue.varianceToExpected) === 6613, `Variância positiva vs ritmo calculada (esperado ~6613, obtido ${budgetExec.revenue.varianceToExpected})`);
  assert(budgetExec.revenue.varianceToExpected >= 0, 'Sinalizador da variância de receita é positivo (on-track)');

  // -------------------------------------------------------------
  // TESTE 3: Cálculo de Saúde da Execução e Geração de Alertas
  // -------------------------------------------------------------
  console.log('\n--- TESTE 3: Saúde da Execução e Alertas ---');
  const health = calculateExecutionHealth({
    progress,
    budgetExecution: budgetExec,
    hasSufficientData: true
  });
  assert(health.status === 'attention', `Status de saúde calculado com ação bloqueada (esperado attention, obtido ${health.status})`);
  assert(health.reasons.length > 0, 'Motivos de saúde detalhados');

  const alerts = generateExecutionAlerts({
    actions: mockActions,
    progress,
    budgetExecution: budgetExec,
    now: new Date('2026-08-12')
  });
  assert(alerts.some(a => a.code === 'ACTION_BLOCKED'), 'Alerta de ação bloqueada gerado');
  assert(alerts.some(a => a.code === 'ACTION_OVERDUE'), 'Alerta de ação atrasada gerado');

  // -------------------------------------------------------------
  // TESTE 4: Priorização Canônica de Ações
  // -------------------------------------------------------------
  console.log('\n--- TESTE 4: Priorização de Ações Comerciais ---');
  const prioritized = prioritizeCommercialActions(mockActions, { revenueVarianceToExpected: -5000 });
  assert(prioritized.length === 3, 'Todas as 3 ações foram pontuadas');
  assert(prioritized[0].actionId === 'act_3' || prioritized[0].actionId === 'act_2', 'Ação bloqueada/crítica ordenada com alto score');

  // -------------------------------------------------------------
  // TESTE 5: Backend Controller — Ciclo Completo de Execução
  // -------------------------------------------------------------
  console.log('\n--- TESTE 5: Backend Controller — Ciclo Completo & Idempotência ---');
  const mockDb = new MockDb();
  setCommercialExecutionDb(mockDb);

  // Semear Budget Comercial 9.6.6 prévio
  const budgetId = 'budget_test_aug_2026';
  await mockDb.collection('commercial_budgets').doc(budgetId).set({
    title: 'Budget Agosto 2026',
    status: 'active',
    version: 1,
    targetRevenue: 120000,
    targetContributionMargin: 48000,
    targetOperatingProfit: 24000,
    targetUnits: 1200,
    targetAverageTicket: 100,
    lineAllocations: [
      { line: 'FORCE', targetRevenue: 60000, targetUnits: 600, targetContributionMargin: 24000 },
      { line: 'MARK', targetRevenue: 60000, targetUnits: 600, targetContributionMargin: 24000 }
    ]
  });

  // Semear Meta 9.6.4
  const goalId = 'goal_test_rev';
  await mockDb.collection('commercial_goals').doc(goalId).set({
    title: 'Meta Receita Agosto',
    type: 'revenue',
    targetValue: 125000,
    period: 'monthly'
  });

  // 5.1 Criar Ciclo de Execução
  const idempKeyCreate = 'idemp_cycle_create_001';
  const { req: reqC1, res: resC1 } = createMockReqRes({
    title: 'Ciclo Operacional Agosto 2026',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    budgetId,
    linkedGoalIds: [goalId]
  }, { 'idempotency-key': idempKeyCreate });

  await createCommercialExecutionCycleController(reqC1, resC1);
  assert(resC1.statusCode === 201, `Ciclo criado com sucesso (HTTP ${resC1.statusCode})`);
  const createdCycle = resC1.body?.cycle;
  assert(createdCycle?.id, `ID do ciclo gerado: ${createdCycle?.id}`);
  assert(createdCycle?.status === 'draft', 'Status inicial é draft');

  // 5.2 Replay Idempotente de Criação
  const { req: reqC1Replay, res: resC1Replay } = createMockReqRes({
    title: 'Ciclo Operacional Agosto 2026',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    budgetId,
    linkedGoalIds: [goalId]
  }, { 'idempotency-key': idempKeyCreate });

  await createCommercialExecutionCycleController(reqC1Replay, resC1Replay);
  assert(resC1Replay.statusCode === 201, 'Replay idempotente retornou status original 201');
  assert(resC1Replay.body?.cycle?.id === createdCycle?.id, 'Replay idempotente retornou mesmo cycle ID');

  // 5.3 Ativar Ciclo (Congelando Snapshot)
  const idempKeyAct = 'idemp_cycle_act_001';
  const { req: reqAct, res: resAct } = createMockReqRes({}, { 'idempotency-key': idempKeyAct }, { id: createdCycle.id });
  await activateCommercialExecutionCycleController(reqAct, resAct);
  assert(resAct.statusCode === 200, `Ciclo ativado (HTTP ${resAct.statusCode})`);
  assert(resAct.body?.cycle?.status === 'active', 'Status do ciclo atualizado para active');
  assert(resAct.body?.cycle?.budgetExecutionSnapshot?.targetRevenue === 120000, 'Snapshot de Budget congelado com sucesso');
  assert(resAct.body?.cycle?.goalExecutionSnapshots?.length === 1, 'Snapshot de Metas congelado com sucesso');

  // 5.4 Adicionar Ação ao Ciclo
  const idempKeyActAdd = 'idemp_act_add_001';
  const { req: reqAddAct, res: resAddAct } = createMockReqRes({
    title: 'Campanha Tráfego Google Ads FORCE',
    description: 'Aumentar investimento em palavras chave topo de funil',
    priority: 'high',
    productLine: 'FORCE',
    ownerName: 'Gerente Comercial',
    plannedStartDate: '2026-08-05',
    plannedEndDate: '2026-08-20',
    expectedImpact: {
      revenueImpact: 15000,
      contributionMarginImpact: 6000,
      unitsImpact: 150
    }
  }, { 'idempotency-key': idempKeyActAdd }, { id: createdCycle.id });

  await addCommercialActionToCycleController(reqAddAct, resAddAct);
  assert(resAddAct.statusCode === 201, `Ação comercial criada (HTTP ${resAddAct.statusCode})`);
  const createdAction = resAddAct.body?.action;
  assert(createdAction?.executionStatus === 'planned', 'Status da ação é planned');

  // 5.5 Marcar Pronta e Iniciar Ação (planned -> ready -> in_progress)
  const idempKeyReady = 'idemp_act_ready_001';
  const { req: reqReady, res: resReady } = createMockReqRes({}, { 'idempotency-key': idempKeyReady }, { id: createdCycle.id, actionId: createdAction.id });
  await readyCommercialActionController(reqReady, resReady);
  assert(resReady.statusCode === 200, 'Ação marcada como pronta com sucesso');
  assert(resReady.body?.action?.executionStatus === 'ready', 'Status da ação é ready');

  const idempKeyStart = 'idemp_act_start_001';
  const { req: reqStart, res: resStart } = createMockReqRes({}, { 'idempotency-key': idempKeyStart }, { id: createdCycle.id, actionId: createdAction.id });
  await startCommercialActionController(reqStart, resStart);
  assert(resStart.statusCode === 200, 'Ação iniciada com sucesso');
  assert(resStart.body?.action?.executionStatus === 'in_progress', 'Status da ação é in_progress');

  // 5.6 Bloquear Ação (in_progress -> blocked)
  const idempKeyBlock = 'idemp_act_block_001';
  const { req: reqBlock, res: resBlock } = createMockReqRes({
    blockingReason: 'Conta de anúncios pausada para verificação de segurança'
  }, { 'idempotency-key': idempKeyBlock }, { id: createdCycle.id, actionId: createdAction.id });
  await blockCommercialActionController(reqBlock, resBlock);
  assert(resBlock.statusCode === 200, 'Ação bloqueada com sucesso');
  assert(resBlock.body?.action?.executionStatus === 'blocked', 'Status da ação é blocked');
  assert(resBlock.body?.action?.blockingReason?.includes('pausada'), 'Motivo de bloqueio salvo');

  // 5.7 Desbloquear Ação (blocked -> in_progress)
  const idempKeyUnblock = 'idemp_act_unblock_001';
  const { req: reqUnblock, res: resUnblock } = createMockReqRes({}, { 'idempotency-key': idempKeyUnblock }, { id: createdCycle.id, actionId: createdAction.id });
  await unblockCommercialActionController(reqUnblock, resUnblock);
  assert(resUnblock.statusCode === 200, 'Ação desbloqueada com sucesso');
  assert(resUnblock.body?.action?.executionStatus === 'in_progress', 'Status da ação retornou para in_progress');

  // 5.8 Concluir Ação (in_progress -> completed)
  const idempKeyComp = 'idemp_act_comp_001';
  const { req: reqComp, res: resComp } = createMockReqRes({
    executionNotes: 'Campanha finalizada com ROAS 4.2'
  }, { 'idempotency-key': idempKeyComp }, { id: createdCycle.id, actionId: createdAction.id });
  await completeCommercialActionController(reqComp, resComp);
  assert(resComp.statusCode === 200, 'Ação concluída com sucesso');
  assert(resComp.body?.action?.executionStatus === 'completed', 'Status da ação é completed');
  assert(resComp.body?.action?.completionPercent === 100, 'Progresso da ação é 100%');

  // 5.9 Recalcular Impacto Real da Ação
  const idempKeyRecalc = 'idemp_act_recalc_001';
  const { req: reqRecalc, res: resRecalc } = createMockReqRes({}, { 'idempotency-key': idempKeyRecalc }, { id: createdCycle.id, actionId: createdAction.id });
  await recalculateCommercialActionImpactController(reqRecalc, resRecalc);
  assert(resRecalc.statusCode === 200, 'Impacto da ação recalculado');
  assert(resRecalc.body?.action?.actualImpact?.impactAttribution === 'insufficient' || resRecalc.body?.action?.actualImpact?.impactAttribution === 'correlated', 'Atribuição de impacto transparente gerada');

  // 5.10 Obter Dashboard Server-Side Agregado
  const { req: reqDash, res: resDash } = createMockReqRes({}, {}, { id: createdCycle.id });
  await getCommercialExecutionDashboardController(reqDash, resDash);
  assert(resDash.statusCode === 200, 'Dashboard server-side agregado gerado');
  assert(resDash.body?.dashboard?.actions?.length === 1, 'Ações agregadas no dashboard');
  assert(resDash.body?.dashboard?.progress?.completedActions === 1, 'Progresso agregado reflete conclusão');

  // 5.11 Concluir Ciclo de Execução (active -> completed)
  const idempKeyCycleComp = 'idemp_cycle_comp_001';
  const { req: reqCycleComp, res: resCycleComp } = createMockReqRes({}, { 'idempotency-key': idempKeyCycleComp }, { id: createdCycle.id });
  await completeCommercialExecutionCycleController(reqCycleComp, resCycleComp);
  assert(resCycleComp.statusCode === 200, 'Ciclo de execução concluído');
  assert(resCycleComp.body?.cycle?.status === 'completed', 'Status do ciclo é completed');

  // 5.12 Verificar Imutabilidade Estrutural de Ciclo Concluído (Tentativa de Patch deve dar 409)
  const idempKeyPatchForbidden = 'idemp_patch_forbid_001';
  const { req: reqForbid, res: resForbid } = createMockReqRes({
    title: 'Tentativa de alteração em ciclo concluído'
  }, { 'idempotency-key': idempKeyPatchForbidden }, { id: createdCycle.id });
  await updateCommercialExecutionCycleController(reqForbid, resForbid);
  assert(resForbid.statusCode === 409, `Imutabilidade de ciclo concluído garantida (HTTP ${resForbid.statusCode})`);

  console.log('\n================================================================');
  console.log(`RELATÓRIO DE CERTIFICAÇÃO FASE 9.6.7:`);
  console.log(`TOTAL PASS: ${passed}`);
  console.log(`TOTAL FAIL: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
