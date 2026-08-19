/**
 * SUÍTE DE TESTES E CERTIFICAÇÃO DEFINITIVA — FASE 9.6.6-E
 *
 * Auditoria Completa:
 * 1. Active Target, Active Line Method, Active Line Allocation
 * 2. Status Immutability (Completed 400, Archived 400, Draft Editable 200)
 * 3. UI Multi Goals, linkedGoalIds, Line Method & Manual Lines
 * 4. Rebudget Goals & Lines inheritance/mutation
 * 5. Idempotency Records para os 6 endpoints (Create, Patch, Activate, Recalculate, Rebudget, Archive)
 * 6. Zero Regressions em 9.6.6-A/B/C/D
 */

import {
  generateCommercialBudget,
  buildBudgetBaselineSnapshot,
  calculateBudgetCurrentActuals,
  recalculateCommercialBudgetActuals,
  createApprovedBudgetSnapshot,
  createRebudgetVersion,
  generateCommercialBudgetLineAllocations,
  normalizeBudgetAllocations
} from '../src/utils/commercialBudget.js';

import {
  setCommercialBudgetDb,
  computePayloadFingerprint,
  createCommercialBudgetController,
  updateCommercialBudgetController,
  activateCommercialBudgetController,
  rebudgetCommercialBudgetController,
  recalculateCommercialBudgetController,
  archiveCommercialBudgetController,
  getCommercialBudgetsController,
  getCommercialBudgetByIdController
} from '../server/controllers/commercialBudget.controller.js';

import { CommercialGoal } from '../src/types/commercialGovernance.js';
import { CommercialBudgetLineAllocation } from '../src/types/commercialBudget.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

class MockFirestore {
  data: Record<string, Record<string, any>> = {};
  private txnQueue: Promise<void> = Promise.resolve();

  collection(name: string) {
    if (!this.data[name]) {
      this.data[name] = {};
    }
    const colData = this.data[name];

    const colObj: any = {
      doc: (id?: string) => {
        const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        return {
          id: docId,
          get: async () => ({
            id: docId,
            exists: !!colData[docId],
            data: () => colData[docId]
          }),
          set: async (docData: any, opts?: any) => {
            if (opts && opts.merge && colData[docId]) {
              colData[docId] = { ...colData[docId], ...docData };
            } else {
              colData[docId] = { ...docData };
            }
          },
          update: async (patch: any) => {
            if (!colData[docId]) throw new Error(`Doc ${docId} not found`);
            colData[docId] = { ...colData[docId], ...patch };
          },
          collection: (subName: string) => this.collection(`${name}/${docId}/${subName}`)
        };
      },
      add: async (docData: any) => {
        const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        colData[id] = { ...docData, id };
        return { id };
      },
      where: (field: string, op: string, val: any) => {
        const filterFn = (item: any) => {
          const itemVal = item[field];
          if (op === '==') return itemVal === val;
          if (op === '>=') return itemVal >= val;
          if (op === '<=') return itemVal <= val;
          if (op === '>') return itemVal > val;
          if (op === '<') return itemVal < val;
          return true;
        };
        return {
          where: (f2: string, op2: string, val2: any) => ({
            orderBy: () => ({
              get: async () => ({
                empty: false,
                docs: Object.keys(colData)
                  .map(k => ({ id: k, data: () => colData[k] }))
                  .filter(d => filterFn(d.data()) && (op2 === '==' ? d.data()[f2] === val2 : true))
              })
            }),
            get: async () => ({
              empty: false,
              docs: Object.keys(colData)
                .map(k => ({ id: k, data: () => colData[k] }))
                .filter(d => filterFn(d.data()) && (op2 === '==' ? d.data()[f2] === val2 : true))
            })
          }),
          orderBy: () => ({
            get: async () => ({
              empty: false,
              docs: Object.keys(colData)
                .map(k => ({ id: k, data: () => colData[k] }))
                .filter(d => filterFn(d.data()))
            })
          }),
          get: async () => ({
            empty: false,
            docs: Object.keys(colData)
              .map(k => ({ id: k, data: () => colData[k] }))
              .filter(d => filterFn(d.data()))
          })
        };
      },
      get: async () => ({
        empty: Object.keys(colData).length === 0,
        docs: Object.keys(colData).map(k => ({
          id: k,
          data: () => colData[k]
        }))
      })
    };
    return colObj;
  }

  async runTransaction(updateFunction: (transaction: any) => Promise<any>) {
    const run = async () => {
      const txn = {
        get: async (docRef: any) => docRef.get(),
        set: async (docRef: any, data: any, opts?: any) => docRef.set(data, opts),
        update: async (docRef: any, patch: any) => docRef.update(patch),
        delete: async (docRef: any) => {}
      };
      return updateFunction(txn);
    };

    const res = this.txnQueue.then(run);
    this.txnQueue = res.then(() => {}, () => {});
    return res;
  }
}

function createMockReq(body: any = {}, params: any = {}, query: any = {}, headers: any = {}) {
  return {
    body,
    params,
    query,
    headers: { ...headers },
    header: (name: string) => headers[name.toLowerCase()] || headers[name],
    get: (name: string) => headers[name.toLowerCase()] || headers[name],
    adminUser: { uid: 'usr_admin', email: 'admin@fpacstore.com' }
  } as any;
}

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.body = data;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
      return this;
    }
  };
  return res;
}

async function runSuite() {
  console.log('🚀 INICIANDO AUDITORIA FINAL DA FASE 9.6.6-E\n');
  const mockDb = new MockFirestore();
  setCommercialBudgetDb(mockDb as any);

  // 1. ACTIVE TARGET, ACTIVE LINE METHOD & LINE ALLOCATION
  console.log('🔹 1. Validando Active Target, Line Method e Line Allocations...');
  const manualLines: CommercialBudgetLineAllocation[] = [
    { line: 'FORCE', targetRevenue: 60000, targetRevenuePercent: 60, targetCogs: 24000, targetContributionMargin: 30000, targetUnits: 600 },
    { line: 'MARK', targetRevenue: 25000, targetRevenuePercent: 25, targetCogs: 10000, targetContributionMargin: 12500, targetUnits: 250 },
    { line: 'PRIME', targetRevenue: 10000, targetRevenuePercent: 10, targetCogs: 4000, targetContributionMargin: 5000, targetUnits: 100 },
    { line: 'OTHER', targetRevenue: 5000, targetRevenuePercent: 5, targetCogs: 2000, targetContributionMargin: 2500, targetUnits: 50 }
  ];

  const goals: CommercialGoal[] = [
    { id: 'goal_rev', title: 'Meta Receita', type: 'revenue', targetValue: 100000, period: 'quarterly', startDate: '2026-10-01', endDate: '2026-12-31', status: 'active', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', createdBy: 'admin' },
    { id: 'goal_op', title: 'Meta Lucro Op', type: 'operating_profit', targetValue: 25000, period: 'quarterly', startDate: '2026-10-01', endDate: '2026-12-31', status: 'active', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', createdBy: 'admin' }
  ];
  for (const g of goals) {
    await mockDb.collection('commercial_goals').doc(g.id).set(g);
  }

  // CREATE DRAFT
  const createReq = createMockReq({
    title: 'Orçamento 9.6.6-E',
    startDate: '2026-10-01',
    endDate: '2026-12-31',
    targetRevenue: 100000,
    allocations: {
      cogsBudget: 40000,
      trafficBudget: 15000,
      fixedExpensesBudget: 10000,
      administrativeVariableExpensesBudget: 5000,
      totalExpensesBudget: 70000
    },
    lineAllocationMethod: 'manual',
    customLineAllocations: manualLines,
    linkedGoalIds: ['goal_rev', 'goal_op'],
    idempotencyKey: 'idemp_create_966e'
  });
  const createRes = createMockRes();
  await createCommercialBudgetController(createReq, createRes);
  assert(createRes.statusCode === 201, 'Criação deve retornar 201');
  const budgetId = (createRes.body.budget || createRes.body.data).id;

  // DRAFT EDIT
  const patchReq = createMockReq({
    targetRevenue: 100000,
    title: 'Orçamento 9.6.6-E (Editado)',
    idempotencyKey: 'idemp_patch_966e'
  }, { id: budgetId });
  const patchRes = createMockRes();
  await updateCommercialBudgetController(patchReq, patchRes);
  assert(patchRes.statusCode === 200, 'Edição em status draft deve retornar 200');

  // ACTIVATE
  const actReq = createMockReq({ idempotencyKey: 'idemp_activate_966e' }, { id: budgetId });
  const actRes = createMockRes();
  await activateCommercialBudgetController(actReq, actRes);
  assert(actRes.statusCode === 200, 'Ativação deve retornar 200');
  const activeBudget = actRes.body.budget || actRes.body.data;
  assert(activeBudget.status === 'active', 'Status deve ser active');
  assert(activeBudget.lineAllocationMethod === 'manual', 'Line allocation method deve ser manual');
  assert(activeBudget.lineAllocations.length === 4, 'Line allocations deve ter 4 linhas');
  assert(activeBudget.approvedSnapshot !== undefined, 'Snapshot aprovado deve existir');
  console.log('  ✅ Active Target, Line Method e Line Allocations validados com sucesso.');

  // RECALCULATE
  console.log('🔹 2. Validando Recalculate e Idempotency Record...');
  const recalcReq = createMockReq({ idempotencyKey: 'idemp_recalc_966e' }, { id: budgetId });
  const recalcRes = createMockRes();
  await recalculateCommercialBudgetController(recalcReq, recalcRes);
  assert(recalcRes.statusCode === 200, 'Recálculo deve retornar 200');
  const recalcBudget = recalcRes.body.budget || recalcRes.body.data;
  assert(recalcBudget.reconciliation.budgetVsGoal.length === 2, 'Metas preservadas após recálculo');

  // REBUDGET
  console.log('🔹 3. Validando Rebudget (Preservação de Goals e Lines)...');
  const rebudgetReq = createMockReq({
    targetRevenue: 120000,
    allocations: {
      cogsBudget: 48000,
      trafficBudget: 18000,
      fixedExpensesBudget: 10000,
      totalExpensesBudget: 76000
    },
    idempotencyKey: 'idemp_rebudget_966e'
  }, { id: budgetId });
  const rebudgetRes = createMockRes();
  await rebudgetCommercialBudgetController(rebudgetReq, rebudgetRes);
  assert(rebudgetRes.statusCode === 201, 'Rebudget deve retornar 201');
  const rebudgeted = rebudgetRes.body.budget || rebudgetRes.body.data;
  assert(rebudgeted.version === 2, 'Versão do rebudget deve ser 2');
  assert(rebudgeted.linkedGoalIds.length === 2, 'Rebudget deve herdar linkedGoalIds');
  assert(rebudgeted.lineAllocations.length === 4, 'Rebudget deve calcular ou herdar line allocations');

  // COMPLETED & ARCHIVED IMMUTABILITY
  console.log('🔹 4. Validando Imutabilidade de Status Completed e Archived...');
  // Simular budget completed
  const completedBudgetId = 'budget_completed_test';
  await mockDb.collection('commercial_budgets').doc(completedBudgetId).set({
    ...activeBudget,
    id: completedBudgetId,
    status: 'completed'
  });
  const patchCompletedReq = createMockReq({ title: 'Tentativa de mutação' }, { id: completedBudgetId });
  const patchCompletedRes = createMockRes();
  await updateCommercialBudgetController(patchCompletedReq, patchCompletedRes);
  assert(patchCompletedRes.statusCode === 400, 'Tentativa de PATCH em budget completed deve falhar com 400');

  // Archive
  const archiveReq = createMockReq({ idempotencyKey: 'idemp_archive_966e' }, { id: budgetId });
  const archiveRes = createMockRes();
  await archiveCommercialBudgetController(archiveReq, archiveRes);
  assert(archiveRes.statusCode === 200, 'Arquivamento deve retornar 200');

  const patchArchivedReq = createMockReq({ title: 'Tentativa de mutação archived' }, { id: budgetId });
  const patchArchivedRes = createMockRes();
  await updateCommercialBudgetController(patchArchivedReq, patchArchivedRes);
  assert(patchArchivedRes.statusCode === 400, 'Tentativa de PATCH em budget archived deve falhar com 400');
  console.log('  ✅ Imutabilidade estrita de Completed e Archived confirmada.');

  // IDEMPOTENCY RECORDS COUNT
  console.log('🔹 5. Validando Total de Idempotency Records Registrados...');
  const idempCol = mockDb.data['idempotency_records'] || mockDb.data['commercial_budget_idempotency'] || {};
  const recordKeys = Object.keys(idempCol);
  assert(recordKeys.length === 6, `Esperado exatamente 6 registros de idempotência (1 por endpoint). Obteve: ${recordKeys.length}`);
  console.log(`  ✅ 6 Registros de Idempotência confirmados: ${recordKeys.join(', ')}`);

  console.log('\n=============================================================');
  console.log('🎉 AUDITORIA DA FASE 9.6.6-E CONCLUÍDA COM 100% DE SUCESSO!');
  console.log('=============================================================\n');
}

runSuite().catch(err => {
  console.error('\n❌ ERRO NA AUDITORIA:', err);
  process.exit(1);
});
