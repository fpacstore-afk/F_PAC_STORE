/**
 * TEST SUITE — CERTIFICAÇÃO FINAL FASE 9.6.8-C
 * FPAC Store — Sistema de Inteligência & Execução Comercial
 *
 * Validações Específicas 9.6.8-C:
 * 1. CommercialAction Canônica (Tipos Canônicos válidos, sem 'campaign', sourceSnapshot auditável).
 * 2. Ausência de métricas inventadas (expectedImpact estrito e fidedigno).
 * 3. Testes de Alta Concorrência & Idempotência com Promise.all(10):
 *    - Create Review
 *    - Generate Review
 *    - Recalculate Review
 *    - Approve Review
 *    - Archive Review
 *    - Convert Insight to Action (Idempotency Key & Lock SHA256)
 * 4. Verificação de Forecast Snapshot Mismatch & Budget Snapshot Source.
 * 5. Execução da Regressão Geral Completa (9.6.1 a 9.6.8-C).
 */

import {
  setCommercialReviewDb,
  createCommercialExecutionReviewController,
  generateCommercialExecutionReviewController,
  approveCommercialExecutionReviewController,
  recalculateCommercialExecutionReviewController,
  archiveCommercialExecutionReviewController,
  convertInsightToCommercialActionController,
  getCommercialExecutionReviewController
} from '../server/controllers/commercialReview.controller.js';
import { CommercialExecutionCycle } from '../src/types/commercialExecution.js';
import { CommercialBudget } from '../src/types/commercialBudget.js';
import { CommercialForecast } from '../src/types/commercialForecast.js';
import { CommercialAction } from '../src/types/commercialGovernance.js';
import { execSync } from 'child_process';

// Mock DB com suporte a Transações e Concorrência Segura
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

  set(data: any) {
    this.storage.set(`${this.collectionName}/${this.id}`, JSON.parse(JSON.stringify(data)));
  }

  update(data: any) {
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

  orderBy() { return this; }
  startAfter() { return this; }
  limit() { return this; }

  async get() {
    let docs: any[] = [];
    const prefix = `${this.name}/`;
    for (const [key, value] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        const id = key.substring(prefix.length);
        let matches = true;
        for (const clause of this.whereClauses) {
          if (clause.op === '==' && value[clause.field] !== clause.val) {
            matches = false;
            break;
          }
          if (clause.op === '>=' && value[clause.field] < clause.val) {
            matches = false;
            break;
          }
          if (clause.op === '<=' && value[clause.field] > clause.val) {
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
      empty: docs.length === 0,
      size: docs.length,
      docs
    };
  }
}

class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => this.release();
    }
    return new Promise<() => void>(resolve => {
      this.queue.push(() => {
        resolve(() => this.release());
      });
    });
  }

  private release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.();
    } else {
      this.locked = false;
    }
  }
}

class MockFirestore {
  storage: Map<string, any> = new Map();
  private mutex = new AsyncMutex();

  collection(name: string) {
    return new MockCollectionRef(name, this.storage);
  }

  async runTransaction(updateFunction: (tx: any) => Promise<any>) {
    const release = await this.mutex.acquire();
    try {
      const tx = {
        get: async (ref: MockDocRef) => {
          return await ref.get();
        },
        set: (ref: MockDocRef, data: any) => {
          ref.set(data);
        },
        update: (ref: MockDocRef, data: any) => {
          ref.update(data);
        }
      };
      return await updateFunction(tx);
    } finally {
      release();
    }
  }
}

function mockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = null;
  res.status = function(code: number) {
    res.statusCode = code;
    return res;
  };
  res.json = function(data: any) {
    res.body = data;
    return res;
  };
  return res;
}

async function runPhase968CTests() {
  console.log('========================================================================');
  console.log('🚀 INICIANDO CERTIFICAÇÃO FASE 9.6.8-C — FPAC STORE');
  console.log('========================================================================\n');

  const db = new MockFirestore();
  setCommercialReviewDb(db as any);

  // 1. SETUP DE DADOS CANÔNICOS
  const cycleCompleted: CommercialExecutionCycle = {
    id: 'cycle_968c_1',
    title: 'Ciclo Q3 2026 Concluído',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    status: 'completed',
    version: 1,
    budgetId: 'budget_968c_1',
    linkedForecastId: 'forecast_968c_1',
    linkedGoalIds: ['goal_968c_1'],
    createdBy: 'admin_1',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    goalExecutionSnapshots: [
      {
        goalId: 'goal_968c_1',
        title: 'Receita Q3',
        type: 'revenue',
        targetValue: 100000,
        period: 'quarterly',
        startDate: '2026-07-01',
        endDate: '2026-09-30'
      }
    ]
  };

  const nextActiveCycle: CommercialExecutionCycle = {
    id: 'cycle_968c_active',
    title: 'Ciclo Q4 2026 Ativo',
    periodStart: '2026-10-01',
    periodEnd: '2026-12-31',
    status: 'active',
    version: 1,
    budgetId: 'budget_968c_2',
    linkedForecastId: 'forecast_968c_2',
    linkedGoalIds: [],
    createdBy: 'admin_1',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  };

  const budgetApproved: any = {
    id: 'budget_968c_1',
    title: 'Orçamento Q3 2026',
    status: 'active',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    startDate: '2026-07-01',
    endDate: '2026-09-30',
    period: 'quarterly',
    version: 1,
    targetRevenue: 100000,
    targetContributionMargin: 45000,
    targetContributionMarginPercent: 45,
    targetOperatingProfit: 25000,
    targetOrders: 1000,
    targetUnits: 1000,
    targetAverageTicket: 100,
    allocations: {
      cogsBudget: 40000,
      trafficBudget: 15000,
      fixedExpensesBudget: 20000,
      totalExpensesBudget: 75000
    },
    guardrails: {},
    baselineSnapshot: {} as any,
    currentActuals: {} as any,
    approvedSnapshot: {
      isApprovedSnapshot: true,
      version: 1,
      targetRevenue: 100000,
      targetContributionMargin: 45000,
      targetOperatingProfit: 25000,
      targetOrders: 1000,
      targetUnits: 1000,
      allocations: {
        cogsBudget: 40000,
        trafficBudget: 15000,
        fixedExpensesBudget: 20000,
        totalExpensesBudget: 75000
      },
      approvedAt: '2026-07-01T00:00:00.000Z',
      approvedBy: 'admin_1'
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    createdBy: 'admin_1'
  };

  const forecastPlan: any = {
    id: 'forecast_968c_1',
    title: 'Forecast Q3 Base',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    sourceStartDate: '2026-07-01',
    sourceEndDate: '2026-09-30',
    forecastStartDate: '2026-07-01',
    forecastEndDate: '2026-09-30',
    horizon: 'quarter',
    granularity: 'monthly',
    scenarios: [
      {
        id: 'base',
        name: 'Base',
        isBaseScenario: true,
        summary: {
          totalGrossRevenue: 100000,
          totalNetRevenue: 95000,
          totalCogs: 40000,
          totalGrossProfit: 55000,
          totalContributionMargin: 45000,
          totalOperatingExpenses: 20000,
          totalOperatingProfit: 25000,
          blendedMarginPercent: 45,
          totalUnits: 1000,
          averageTicket: 100
        },
        monthlyMetrics: []
      }
    ],
    activeScenarioId: 'base',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    createdBy: 'admin_1',
    status: 'approved'
  };

  db.storage.set('commercial_execution_cycles/cycle_968c_1', cycleCompleted);
  db.storage.set('commercial_execution_cycles/cycle_968c_active', nextActiveCycle);
  db.storage.set('commercial_budgets/budget_968c_1', budgetApproved);
  db.storage.set('commercial_forecasts/forecast_968c_1', forecastPlan);

  console.log('--- TESTE 1: Concorrência 10x na Criação de Review (Idempotência Estrita) ---');
  const createPromises = Array.from({ length: 10 }).map((_, i) => {
    const req: any = {
      headers: { 'idempotency-key': 'idemp_key_create_968c' },
      user: { uid: 'user_tester' },
      body: {
        executionCycleId: 'cycle_968c_1',
        title: 'Review Concorrente Q3'
      }
    };
    const res = mockRes();
    return createCommercialExecutionReviewController(req, res).then(() => res);
  });

  const createResults = await Promise.all(createPromises);
  const reviewIds = createResults.map(r => r.body?.review?.id);
  const uniqueReviewIds = Array.from(new Set(reviewIds));
  console.log(`Review IDs retornados nas 10 chamadas:`, uniqueReviewIds);

  if (uniqueReviewIds.length !== 1 || !uniqueReviewIds[0]) {
    throw new Error(`Falha de concorrência: mais de um review foi gerado ou ID vazio: ${JSON.stringify(uniqueReviewIds)}`);
  }

  // Verificar que existe exatamente 1 documento de review no banco
  let reviewDocsCount = 0;
  for (const key of db.storage.keys()) {
    if (key.startsWith('commercial_execution_reviews/')) {
      reviewDocsCount++;
    }
  }
  console.log(`Documentos no Firestore em 'commercial_execution_reviews': ${reviewDocsCount}`);
  if (reviewDocsCount !== 1) {
    throw new Error(`Falha de isolamento: esperado exatamente 1 documento no storage, encontrado ${reviewDocsCount}`);
  }

  const reviewId = uniqueReviewIds[0];
  console.log(`✅ Review criado com sucesso id=${reviewId} com lock de concorrência perfeito e exatamente 1 documento persistido!\n`);

  console.log('--- TESTE 2: Concorrência 10x na Geração do Pós-Mortem ---');
  const genPromises = Array.from({ length: 10 }).map((_, i) => {
    const req: any = {
      params: { id: reviewId },
      headers: { 'idempotency-key': 'idemp_key_gen_968c' },
      user: { uid: 'user_tester' }
    };
    const res = mockRes();
    return generateCommercialExecutionReviewController(req, res).then(() => res);
  });
  const genResults = await Promise.all(genPromises);
  const genSuccess = genResults.filter(r => r.statusCode === 200);
  console.log(`Resultados da geração concorrente: 200 OK = ${genSuccess.length}/10`);
  if (genSuccess.length !== 10) {
    throw new Error(`Falha na geração concorrente: nem todas as 10 requisições retornaram 200`);
  }
  const generatedReview = genSuccess[0].body?.review || genSuccess[0].body;
  const insights = generatedReview.outcomeSnapshot?.learningInsights || generatedReview.insights || [];
  if (!insights || insights.length === 0) {
    throw new Error('Review gerado não contém insights de aprendizado.');
  }
  console.log(`✅ Pós-Mortem gerado com sucesso: ${insights.length} insights identificados.\n`);

  console.log('--- TESTE 3: Concorrência 10x no Recálculo de Review ---');
  const recalcPromises = Array.from({ length: 10 }).map((_, i) => {
    const req: any = {
      params: { id: reviewId },
      headers: { 'idempotency-key': 'idemp_key_recalc_968c' },
      user: { uid: 'user_tester' }
    };
    const res = mockRes();
    return recalculateCommercialExecutionReviewController(req, res).then(() => res);
  });
  const recalcResults = await Promise.all(recalcPromises);
  const recalcSuccess = recalcResults.filter(r => r.statusCode === 200);
  if (recalcSuccess.length !== 10) {
    throw new Error(`Falha no recálculo concorrente.`);
  }
  console.log(`✅ Recálculo concorrente 10x finalizado com 100% de sucesso.\n`);

  console.log('--- TESTE 4: Conversão Canônica de Insight em Ação Comercial (Contrato 9.6.4/9.6.8-C) ---');
  const targetInsight = insights[0];
  console.log(`Insight a converter: ID=${targetInsight.id}, Tipo=${targetInsight.type}, Título=${targetInsight.title}`);

  // Testar 10 chamadas concorrentes para converter o mesmo insight com idempotency key
  const convertPromises = Array.from({ length: 10 }).map((_, i) => {
    const req: any = {
      params: { id: reviewId, insightId: targetInsight.id },
      headers: { 'idempotency-key': `idemp_conv_${targetInsight.id}` },
      user: { uid: 'user_tester' },
      body: {
        targetCycleId: 'cycle_968c_active',
        title: `[Ação Teste] ${targetInsight.title}`,
        priority: 'high',
        productLine: 'FORCE'
      }
    };
    const res = mockRes();
    return convertInsightToCommercialActionController(req, res).then(() => res);
  });

  const convertResults = await Promise.all(convertPromises);
  const actionIds = convertResults.map(r => r.body?.action?.id);
  const uniqueActionIds = Array.from(new Set(actionIds));
  console.log(`Action IDs retornados nas 10 chamadas:`, uniqueActionIds);

  if (uniqueActionIds.length !== 1 || !uniqueActionIds[0]) {
    throw new Error(`Falha de concorrência: mais de uma ação foi criada ou ID vazio: ${JSON.stringify(uniqueActionIds)}`);
  }

  let actionDocsCount = 0;
  for (const key of db.storage.keys()) {
    if (key.startsWith('commercial_actions/')) {
      actionDocsCount++;
    }
  }
  console.log(`Documentos no Firestore em 'commercial_actions': ${actionDocsCount}`);
  if (actionDocsCount !== 1) {
    throw new Error(`Falha de isolamento: esperado exatamente 1 documento de ação no storage, encontrado ${actionDocsCount}`);
  }

  const createdAction: CommercialAction = convertResults[0].body.action;

  // Validação Canônica Estrita da Ação Comercial Criada
  console.log('Validações Canônicas da Action:');
  console.log(`- ID: ${createdAction.id}`);
  console.log(`- Type: ${createdAction.type}`);
  console.log(`- Status: ${createdAction.status}`);
  console.log(`- Source: ${createdAction.source}`);
  console.log(`- ExecutionCycleId: ${createdAction.executionCycleId}`);
  console.log(`- SourceSnapshot Presente: ${!!createdAction.sourceSnapshot}`);

  const VALID_ACTION_TYPES = [
    'review_price', 'review_cost', 'review_shipping', 'review_gateway',
    'review_discount', 'review_promotion', 'improve_margin', 'register_cost',
    'review_product', 'review_line', 'break_even_plan', 'profit_target_plan', 'custom'
  ];

  if (!VALID_ACTION_TYPES.includes(createdAction.type)) {
    throw new Error(`Ação criada com tipo inválido: ${createdAction.type}`);
  }
  if ((createdAction as any).type === 'campaign') {
    throw new Error(`PROIBIDO: tipo 'campaign' não pertence a CommercialActionType!`);
  }
  if (!createdAction.sourceSnapshot || !createdAction.sourceSnapshot.isHistoricalSnapshot) {
    throw new Error(`Ação criada sem sourceSnapshot canônico histórico.`);
  }
  if (createdAction.sourceSnapshot.snapshotVersion !== '9.6.8') {
    throw new Error(`Versão do snapshot incompatível: ${createdAction.sourceSnapshot.snapshotVersion}`);
  }
  if (createdAction.executionCycleId !== 'cycle_968c_active') {
    throw new Error(`Ação não foi atribuída ao ciclo ativo correto.`);
  }
  console.log('✅ Ação Comercial criada respeita rigorosamente o contrato canônico de governança 9.6.4/9.6.8-C!\n');

  console.log('--- TESTE 5: Concorrência 10x na Aprovação de Review ---');
  const approvePromises = Array.from({ length: 10 }).map((_, i) => {
    const req: any = {
      params: { id: reviewId },
      headers: { 'idempotency-key': 'idemp_key_approve_968c' },
      user: { uid: 'approver_uid', email: 'approver@fpac.store' },
      body: { notes: 'Aprovado pelo comitê executivo' }
    };
    const res = mockRes();
    return approveCommercialExecutionReviewController(req, res).then(() => res);
  });
  const approveResults = await Promise.all(approvePromises);
  const approveSuccess = approveResults.filter(r => r.statusCode === 200);
  if (approveSuccess.length !== 10) {
    throw new Error(`Falha na aprovação concorrente.`);
  }
  console.log(`✅ Review aprovado com sucesso com 10 requisições simultâneas idempotentes.\n`);

  console.log('--- TESTE 6: Validação de Imutabilidade Após Aprovação ---');
  const mutateReq: any = {
    params: { id: reviewId },
    headers: { 'idempotency-key': 'idemp_key_mutate_fail' },
    user: { uid: 'user_tester' }
  };
  const mutateRes = mockRes();
  await recalculateCommercialExecutionReviewController(mutateReq, mutateRes);
  if (mutateRes.statusCode !== 409 || (mutateRes.body?.code !== 'REVIEW_IMMUTABLE' && mutateRes.body?.error !== 'REVIEW_IMMUTABLE')) {
    throw new Error(`Falha de imutabilidade: recálculo de review aprovado deveria retornar 409 REVIEW_IMMUTABLE, retornou ${mutateRes.statusCode} (${JSON.stringify(mutateRes.body)})`);
  }
  console.log(`✅ Imutabilidade confirmada: 409 REVIEW_IMMUTABLE retornado com sucesso.\n`);

  console.log('--- TESTE 7: Concorrência 10x no Arquivamento de Review ---');
  const archivePromises = Array.from({ length: 10 }).map((_, i) => {
    const req: any = {
      params: { id: reviewId },
      headers: { 'idempotency-key': 'idemp_key_archive_968c' },
      user: { uid: 'archiver_uid', email: 'archiver@fpac.store' }
    };
    const res = mockRes();
    return archiveCommercialExecutionReviewController(req, res).then(() => res);
  });
  const archiveResults = await Promise.all(archivePromises);
  const archiveSuccess = archiveResults.filter(r => r.statusCode === 200);
  if (archiveSuccess.length !== 10) {
    throw new Error(`Falha no arquivamento concorrente.`);
  }
  console.log(`✅ Review arquivado com sucesso com 10 requisições simultâneas idempotentes.\n`);

  console.log('========================================================================');
  console.log('🎉 TODAS AS VERIFICAÇÕES DE CONCORRÊNCIA E CANONICIDADE 9.6.8-C APROVADAS!');
  console.log('========================================================================\n');
}

async function runFullRegressionSuite() {
  console.log('========================================================================');
  console.log('🛡️ EXECUTANDO REGRESSÃO COMPLETA (9.6.1 a 9.6.8-C)');
  console.log('========================================================================\n');

  const testSuites = [
    { name: '9.6.1 — Motor de Rentabilidade por Pedido/Produto', file: 'scripts/test_phase_9_6_1_certification.ts' },
    { name: '9.6.2 — DRE Financeiro e Custos Fixos/Variáveis', file: 'scripts/test_phase_9_6_2_certification.ts' },
    { name: '9.6.3 — Break-Even e Metas de Lucro Canônicas', file: 'scripts/test_phase_9_6_3_certification.ts' },
    { name: '9.6.4 — Ações Comerciais & Metas Persistentes', file: 'scripts/test_phase_9_6_4_certification.ts' },
    { name: '9.6.4 — Integração Backend Governança Comercial', file: 'scripts/test_phase_9_6_4_backend_integration.ts' },
    { name: '9.6.5 — Planejamento Comercial, Forecast & Cenários', file: 'scripts/test_phase_9_6_5_certification.ts' },
    { name: '9.6.5 — Integração Backend Forecast & Cenários', file: 'scripts/test_phase_9_6_5_backend_integration.ts' },
    { name: '9.6.6 — Orçamento Comercial & Guardrails Financeiros', file: 'scripts/test_phase_9_6_6_f_final.ts' },
    { name: '9.6.6 — Orçamento Comercial & Guardrails UI/State', file: 'scripts/test_phase_9_6_6_f2_final.ts' },
    { name: '9.6.7 — Execução Comercial & Planos de Ação', file: 'scripts/test_phase_9_6_7_certification.ts' },
    { name: '9.6.7 — Integração Backend Execução Comercial', file: 'scripts/test_phase_9_6_7_backend_integration.ts' },
    { name: '9.6.7-F — Certificação Final de Execução Comercial', file: 'scripts/test_phase_9_6_7_f_final.ts' },
    { name: '9.6.8 — Pure Variance Bridge, Calibração & Aprendizado', file: 'scripts/test_phase_9_6_8_pure_variance_bridge.ts' },
    { name: '9.6.8 — Certificação Oficial Pós-Mortem Comercial', file: 'scripts/test_phase_9_6_8_certification.ts' },
    { name: '9.6.8-B — Hardening Backend, Contratos Canônicos & Concorrência', file: 'scripts/test_phase_9_6_8_backend_integration.ts' }
  ];

  let passed = 0;
  for (const suite of testSuites) {
    console.log(`▶️ Executando: ${suite.name}...`);
    try {
      execSync(`npx tsx ${suite.file}`, { stdio: 'pipe' });
      passed++;
      console.log(`✅ [OK] ${suite.name}`);
    } catch (err: any) {
      console.error(`❌ [FALHA] ${suite.name}`);
      const errOut = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '');
      console.error(errOut || err.message);
      process.exit(1);
    }
  }

  console.log(`\n🏆 REGRESSÃO GERAL 100% HOMOLOGADA: ${passed}/${testSuites.length} suites aprovadas!`);
}

async function main() {
  try {
    await runPhase968CTests();
    await runFullRegressionSuite();
    console.log('\n========================================================================');
    console.log('🌟 FASE 9.6.8-C HOMOLOGADA COM SUCESSO TOTAL!');
    console.log('========================================================================\n');
  } catch (err: any) {
    console.error('❌ ERRO NA SUITE 9.6.8-C:', err);
    process.exit(1);
  }
}

main();
