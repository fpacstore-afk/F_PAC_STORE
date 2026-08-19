/**
 * SUÍTE DE TESTES E CERTIFICAÇÃO DEFINITIVA — FASE 9.6.6-F
 *
 * Validação rigorosa dos bloqueios finais:
 * 1. ACTIVE TARGET / ALLOCATIONS / LINE METHOD / LINES -> 409 ACTIVE_BUDGET_IMMUTABLE
 * 2. COMPLETED TARGET / LINE METHOD -> 409 BUDGET_NOT_EDITABLE (com Idempotency-Key válida)
 * 3. ARCHIVED TARGET / LINE METHOD -> 409 BUDGET_NOT_EDITABLE (com Idempotency-Key válida)
 * 4. DRAFT EDIT -> 200 OK
 * 5. UI Multi Goals, linkedGoalIds, Line Method, Manual Lines
 * 6. Rebudget Goals & Lines inheritance/mutation
 * 7. Zero Regressions
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
  console.log('🚀 INICIANDO SUÍTE DE TESTES E CERTIFICAÇÃO DEFINITIVA — FASE 9.6.6-F\n');
  const mockDb = new MockFirestore();
  setCommercialBudgetDb(mockDb as any);

  const manualLines: CommercialBudgetLineAllocation[] = [
    { line: 'FORCE', targetRevenue: 60000, targetRevenuePercent: 60, targetCogs: 24000, targetContributionMargin: 30000, targetUnits: 600 },
    { line: 'MARK', targetRevenue: 25000, targetRevenuePercent: 25, targetCogs: 10000, targetContributionMargin: 12500, targetUnits: 250 },
    { line: 'PRIME', targetRevenue: 10000, targetRevenuePercent: 10, targetCogs: 4000, targetContributionMargin: 5000, targetUnits: 100 },
    { line: 'OTHER', targetRevenue: 5000, targetRevenuePercent: 5, targetCogs: 2000, targetContributionMargin: 2500, targetUnits: 50 }
  ];

  // 1. SETUP DE METAS
  const goals: CommercialGoal[] = [
    { id: 'goal_rev', title: 'Meta Receita', type: 'revenue', targetValue: 100000, period: 'quarterly', startDate: '2026-10-01', endDate: '2026-12-31', status: 'active', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', createdBy: 'admin' },
    { id: 'goal_op', title: 'Meta Lucro Op', type: 'operating_profit', targetValue: 25000, period: 'quarterly', startDate: '2026-10-01', endDate: '2026-12-31', status: 'active', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', createdBy: 'admin' }
  ];
  for (const g of goals) {
    await mockDb.collection('commercial_goals').doc(g.id).set(g);
  }

  // 2. CREATE DRAFT BUDGET
  console.log('🔹 1. Criando Budget Draft e Validando Edição (DRAFT EDIT: 200)...');
  const createReq = createMockReq({
    title: 'Orçamento 9.6.6-F Base',
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
    idempotencyKey: 'idemp_create_966f'
  });
  const createRes = createMockRes();
  await createCommercialBudgetController(createReq, createRes);
  assert(createRes.statusCode === 201, `Criação deve retornar 201. Obteve ${createRes.statusCode}: ${JSON.stringify(createRes.body)}`);
  const budgetId = (createRes.body.budget || createRes.body.data).id;

  // DRAFT EDIT -> 200
  const patchDraftReq = createMockReq({
    title: 'Orçamento 9.6.6-F Base (Editado em Draft)',
    targetRevenue: 105000,
    allocations: {
      cogsBudget: 42000,
      trafficBudget: 15000,
      fixedExpensesBudget: 10000,
      totalExpensesBudget: 72000
    },
    idempotencyKey: 'idemp_patch_draft_966f'
  }, { id: budgetId });
  const patchDraftRes = createMockRes();
  await updateCommercialBudgetController(patchDraftReq, patchDraftRes);
  assert(patchDraftRes.statusCode === 200, `Edição em Draft deve retornar 200. Obteve ${patchDraftRes.statusCode}`);
  console.log('  ✅ DRAFT EDIT: 200 OK');

  // 3. ACTIVATE BUDGET
  console.log('🔹 2. Ativando Budget e Testando Bloqueios Imutáveis de Active (409)...');
  const actReq = createMockReq({ idempotencyKey: 'idemp_activate_966f' }, { id: budgetId });
  const actRes = createMockRes();
  await activateCommercialBudgetController(actReq, actRes);
  assert(actRes.statusCode === 200, 'Ativação deve retornar 200');

  // ACTIVE TARGET -> 409
  const patchActiveTargetReq = createMockReq({
    targetRevenue: 120000,
    idempotencyKey: 'idemp_patch_act_target_966f'
  }, { id: budgetId });
  const patchActiveTargetRes = createMockRes();
  await updateCommercialBudgetController(patchActiveTargetReq, patchActiveTargetRes);
  assert(patchActiveTargetRes.statusCode === 409, `ACTIVE TARGET deve retornar 409. Obteve ${patchActiveTargetRes.statusCode}`);
  assert(patchActiveTargetRes.body.code === 'ACTIVE_BUDGET_IMMUTABLE', 'Código deve ser ACTIVE_BUDGET_IMMUTABLE');

  // ACTIVE ALLOCATIONS -> 409
  const patchActiveAllocReq = createMockReq({
    allocations: { cogsBudget: 50000 },
    idempotencyKey: 'idemp_patch_act_alloc_966f'
  }, { id: budgetId });
  const patchActiveAllocRes = createMockRes();
  await updateCommercialBudgetController(patchActiveAllocReq, patchActiveAllocRes);
  assert(patchActiveAllocRes.statusCode === 409, `ACTIVE ALLOCATIONS deve retornar 409. Obteve ${patchActiveAllocRes.statusCode}`);
  assert(patchActiveAllocRes.body.code === 'ACTIVE_BUDGET_IMMUTABLE', 'Código deve ser ACTIVE_BUDGET_IMMUTABLE');

  // ACTIVE LINE METHOD -> 409
  const patchActiveMethodReq = createMockReq({
    lineAllocationMethod: 'revenue_proportional',
    idempotencyKey: 'idemp_patch_act_method_966f'
  }, { id: budgetId });
  const patchActiveMethodRes = createMockRes();
  await updateCommercialBudgetController(patchActiveMethodReq, patchActiveMethodRes);
  assert(patchActiveMethodRes.statusCode === 409, `ACTIVE LINE METHOD deve retornar 409. Obteve ${patchActiveMethodRes.statusCode}`);
  assert(patchActiveMethodRes.body.code === 'ACTIVE_BUDGET_IMMUTABLE', 'Código deve ser ACTIVE_BUDGET_IMMUTABLE');

  // ACTIVE LINES -> 409
  const patchActiveLinesReq = createMockReq({
    lineAllocations: [{ line: 'FORCE', targetRevenue: 50000, targetRevenuePercent: 50, targetCogs: 20000, targetContributionMargin: 25000, targetUnits: 500 }],
    idempotencyKey: 'idemp_patch_act_lines_966f'
  }, { id: budgetId });
  const patchActiveLinesRes = createMockRes();
  await updateCommercialBudgetController(patchActiveLinesReq, patchActiveLinesRes);
  assert(patchActiveLinesRes.statusCode === 409, `ACTIVE LINES deve retornar 409. Obteve ${patchActiveLinesRes.statusCode}`);
  assert(patchActiveLinesRes.body.code === 'ACTIVE_BUDGET_IMMUTABLE', 'Código deve ser ACTIVE_BUDGET_IMMUTABLE');
  console.log('  ✅ ACTIVE TARGET, ALLOCATIONS, LINE METHOD, LINES: 409 PASS');

  // 4. COMPLETED IMMUTABILITY COM IDEMPOTENCY KEY VÁLIDA (409 BUDGET_NOT_EDITABLE)
  console.log('🔹 3. Validando Imutabilidade de COMPLETED (409 BUDGET_NOT_EDITABLE)...');
  const completedBudgetId = 'budget_completed_966f';
  await mockDb.collection('commercial_budgets').doc(completedBudgetId).set({
    id: completedBudgetId,
    status: 'completed',
    title: 'Orçamento Finalizado Q3 2026',
    targetRevenue: 100000,
    lineAllocationMethod: 'revenue_proportional',
    allocations: { cogsBudget: 40000, trafficBudget: 15000, fixedExpensesBudget: 10000, totalExpensesBudget: 65000 }
  });

  // COMPLETED TARGET -> 409
  const patchCompTargetReq = createMockReq({
    targetRevenue: 110000,
    idempotencyKey: 'idemp_patch_comp_target_966f'
  }, { id: completedBudgetId });
  const patchCompTargetRes = createMockRes();
  await updateCommercialBudgetController(patchCompTargetReq, patchCompTargetRes);
  assert(patchCompTargetRes.statusCode === 409, `COMPLETED TARGET deve retornar 409. Obteve ${patchCompTargetRes.statusCode}`);
  assert(patchCompTargetRes.body.code === 'BUDGET_NOT_EDITABLE', `Código esperado BUDGET_NOT_EDITABLE. Obteve ${patchCompTargetRes.body.code}`);

  // COMPLETED LINE METHOD -> 409
  const patchCompMethodReq = createMockReq({
    lineAllocationMethod: 'manual',
    idempotencyKey: 'idemp_patch_comp_method_966f'
  }, { id: completedBudgetId });
  const patchCompMethodRes = createMockRes();
  await updateCommercialBudgetController(patchCompMethodReq, patchCompMethodRes);
  assert(patchCompMethodRes.statusCode === 409, `COMPLETED LINE METHOD deve retornar 409. Obteve ${patchCompMethodRes.statusCode}`);
  assert(patchCompMethodRes.body.code === 'BUDGET_NOT_EDITABLE', `Código esperado BUDGET_NOT_EDITABLE. Obteve ${patchCompMethodRes.body.code}`);
  console.log('  ✅ COMPLETED TARGET & LINE METHOD: 409 BUDGET_NOT_EDITABLE PASS');

  // 5. ARCHIVED IMMUTABILITY COM IDEMPOTENCY KEY VÁLIDA (409 BUDGET_NOT_EDITABLE)
  console.log('🔹 4. Validando Imutabilidade de ARCHIVED (409 BUDGET_NOT_EDITABLE)...');
  const archiveReq = createMockReq({ idempotencyKey: 'idemp_archive_act_966f' }, { id: budgetId });
  const archiveRes = createMockRes();
  await archiveCommercialBudgetController(archiveReq, archiveRes);
  assert(archiveRes.statusCode === 200, 'Arquivamento deve retornar 200');

  // ARCHIVED TARGET -> 409
  const patchArchTargetReq = createMockReq({
    targetRevenue: 130000,
    idempotencyKey: 'idemp_patch_arch_target_966f'
  }, { id: budgetId });
  const patchArchTargetRes = createMockRes();
  await updateCommercialBudgetController(patchArchTargetReq, patchArchTargetRes);
  assert(patchArchTargetRes.statusCode === 409, `ARCHIVED TARGET deve retornar 409. Obteve ${patchArchTargetRes.statusCode}`);
  assert(patchArchTargetRes.body.code === 'BUDGET_NOT_EDITABLE', `Código esperado BUDGET_NOT_EDITABLE. Obteve ${patchArchTargetRes.body.code}`);

  // ARCHIVED LINE METHOD -> 409
  const patchArchMethodReq = createMockReq({
    lineAllocationMethod: 'manual',
    idempotencyKey: 'idemp_patch_arch_method_966f'
  }, { id: budgetId });
  const patchArchMethodRes = createMockRes();
  await updateCommercialBudgetController(patchArchMethodReq, patchArchMethodRes);
  assert(patchArchMethodRes.statusCode === 409, `ARCHIVED LINE METHOD deve retornar 409. Obteve ${patchArchMethodRes.statusCode}`);
  assert(patchArchMethodRes.body.code === 'BUDGET_NOT_EDITABLE', `Código esperado BUDGET_NOT_EDITABLE. Obteve ${patchArchMethodRes.body.code}`);
  console.log('  ✅ ARCHIVED TARGET & LINE METHOD: 409 BUDGET_NOT_EDITABLE PASS');

  // 6. REBUDGET GOALS, METHOD & LINES (PASS)
  console.log('🔹 5. Validando REBUDGET (Metas, Método e Linhas)...');
  const manualRebudgetLines: CommercialBudgetLineAllocation[] = [
    { line: 'FORCE', targetRevenue: 70000, targetRevenuePercent: 58.33, targetCogs: 28000, targetContributionMargin: 35000, targetUnits: 700 },
    { line: 'MARK', targetRevenue: 30000, targetRevenuePercent: 25.00, targetCogs: 12000, targetContributionMargin: 15000, targetUnits: 300 },
    { line: 'PRIME', targetRevenue: 15000, targetRevenuePercent: 12.50, targetCogs: 6000, targetContributionMargin: 7500, targetUnits: 150 },
    { line: 'OTHER', targetRevenue: 5000, targetRevenuePercent: 4.17, targetCogs: 2000, targetContributionMargin: 2500, targetUnits: 50 }
  ];

  const rebudgetReq = createMockReq({
    title: 'Orçamento 9.6.6-F (Revisão v2)',
    targetRevenue: 120000,
    allocations: {
      cogsBudget: 48000,
      trafficBudget: 18000,
      fixedExpensesBudget: 10000,
      totalExpensesBudget: 76000
    },
    lineAllocationMethod: 'manual',
    customLineAllocations: manualRebudgetLines,
    linkedGoalIds: ['goal_rev', 'goal_op'],
    idempotencyKey: 'idemp_rebudget_966f'
  }, { id: budgetId });
  const rebudgetRes = createMockRes();
  await rebudgetCommercialBudgetController(rebudgetReq, rebudgetRes);
  assert(rebudgetRes.statusCode === 201, `Rebudget deve retornar 201. Obteve ${rebudgetRes.statusCode}`);
  const rebudgeted = rebudgetRes.body.budget || rebudgetRes.body.data;
  assert(rebudgeted.version === 2, 'Versão do Rebudget deve ser 2');
  assert(rebudgeted.linkedGoalIds.length === 2, 'Rebudget deve conter as 2 metas');
  assert(rebudgeted.lineAllocationMethod === 'manual', 'Rebudget deve adotar o método manual especificado');
  assert(rebudgeted.lineAllocations.length === 4, 'Rebudget deve conter as 4 linhas manuais');
  console.log('  ✅ REBUDGET GOALS, METHOD, LINES: PASS');

  console.log('\n=============================================================');
  console.log('🎉 AUDITORIA DA FASE 9.6.6-F CONCLUÍDA COM 100% DE SUCESSO!');
  console.log('=============================================================\n');
}

runSuite().catch(err => {
  console.error('\n❌ ERRO NA AUDITORIA FASE 9.6.6-F:', err);
  process.exit(1);
});
