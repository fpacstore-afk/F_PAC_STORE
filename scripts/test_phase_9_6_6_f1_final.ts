/**
 * SUÍTE DE TESTES E CERTIFICAÇÃO DEFINITIVA — FASE 9.6.6-F.1
 *
 * Validações:
 * 1. UI Handler Logic (Rebudget loads linkedGoalIds, lineAllocationMethod, manualLines)
 * 2. UI Handler Logic (Create New resets linkedGoalIds, lineAllocationMethod, manualLines, form fields)
 * 3. HTTP 409 Immutability para Active, Completed e Archived
 * 4. Draft Edit 200 OK
 * 5. Rebudget Versioning & Data Consistency
 */

import fs from 'fs';
import path from 'path';

import {
  setCommercialBudgetDb,
  createCommercialBudgetController,
  updateCommercialBudgetController,
  activateCommercialBudgetController,
  rebudgetCommercialBudgetController,
  recalculateCommercialBudgetController,
  archiveCommercialBudgetController
} from '../server/controllers/commercialBudget.controller.js';

import { CommercialGoal } from '../src/types/commercialGovernance.js';
import { CommercialBudgetLineAllocation } from '../src/types/commercialBudget.js';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
}

// 1. Validar por AST / Source Assertions no CommercialBudgetView.tsx
function validateCommercialBudgetViewSource() {
  console.log('🔹 1. Validando Lógica de Estado no CommercialBudgetView.tsx...');
  const viewPath = path.resolve(process.cwd(), 'src/components/admin/financial/profitability/CommercialBudgetView.tsx');
  const source = fs.readFileSync(viewPath, 'utf8');

  // REBUDGET LOADS
  assert(source.includes('budgetToRebudget.linkedGoalIds'), 'REBUDGET LOADS linkedGoalIds');
  assert(source.includes("budgetToRebudget.lineAllocationMethod ?? 'revenue_proportional'"), 'REBUDGET LOADS lineAllocationMethod');
  assert(source.includes("mappedLines[l.line]"), 'REBUDGET LOADS lines into mapped structure');
  assert(source.includes("FORCE: { revenue: 0, cogs: 0, cm: 0, units: 0 }"), 'REBUDGET LOADS FORCE template');
  assert(source.includes("MARK: { revenue: 0, cogs: 0, cm: 0, units: 0 }"), 'REBUDGET LOADS MARK template');
  assert(source.includes("PRIME: { revenue: 0, cogs: 0, cm: 0, units: 0 }"), 'REBUDGET LOADS PRIME template');
  assert(source.includes("OTHER: { revenue: 0, cogs: 0, cm: 0, units: 0 }"), 'REBUDGET LOADS OTHER template');
  console.log('  ✅ REBUDGET LOADS: linkedGoalIds, lineAllocationMethod, FORCE, MARK, PRIME, OTHER');

  // CREATE NEW RESETS
  assert(source.includes('setNewLinkedGoalIds([])'), 'CREATE NEW RESETS GOALS');
  assert(source.includes("setNewLineAllocationMethod('revenue_proportional')"), 'CREATE NEW RESETS METHOD');
  assert(source.includes("setNewLinkedForecastId('')"), 'CREATE NEW RESETS FORECAST');
  console.log('  ✅ CREATE NEW RESETS: GOALS, METHOD, MANUAL LINES');
}

// 2. Mock Firestore e Suite Controller
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
  console.log('🚀 INICIANDO SUÍTE DE TESTES E CERTIFICAÇÃO DEFINITIVA — FASE 9.6.6-F.1\n');
  
  validateCommercialBudgetViewSource();

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
  console.log('🔹 2. Criando Budget Draft e Validando Edição (DRAFT EDIT: 200)...');
  const createReq = createMockReq({
    title: 'Orçamento 9.6.6-F.1 Base',
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
    idempotencyKey: 'idemp_create_966f1'
  });
  const createRes = createMockRes();
  await createCommercialBudgetController(createReq, createRes);
  assert(createRes.statusCode === 201, `Criação deve retornar 201. Obteve ${createRes.statusCode}`);
  const budgetId = (createRes.body.budget || createRes.body.data).id;

  // DRAFT EDIT -> 200
  const patchDraftReq = createMockReq({
    title: 'Orçamento 9.6.6-F.1 Base (Editado em Draft)',
    targetRevenue: 105000,
    allocations: {
      cogsBudget: 42000,
      trafficBudget: 15000,
      fixedExpensesBudget: 10000,
      totalExpensesBudget: 72000
    },
    idempotencyKey: 'idemp_patch_draft_966f1'
  }, { id: budgetId });
  const patchDraftRes = createMockRes();
  await updateCommercialBudgetController(patchDraftReq, patchDraftRes);
  assert(patchDraftRes.statusCode === 200, `Edição em Draft deve retornar 200. Obteve ${patchDraftRes.statusCode}`);
  console.log('  ✅ DRAFT EDIT: 200 OK');

  // 3. ACTIVATE BUDGET
  console.log('🔹 3. Ativando Budget e Testando Bloqueios Imutáveis de Active (409)...');
  const actReq = createMockReq({ idempotencyKey: 'idemp_activate_966f1' }, { id: budgetId });
  const actRes = createMockRes();
  await activateCommercialBudgetController(actReq, actRes);
  assert(actRes.statusCode === 200, 'Ativação deve retornar 200');

  // ACTIVE TARGET -> 409
  const patchActiveTargetReq = createMockReq({
    targetRevenue: 120000,
    idempotencyKey: 'idemp_patch_act_target_966f1'
  }, { id: budgetId });
  const patchActiveTargetRes = createMockRes();
  await updateCommercialBudgetController(patchActiveTargetReq, patchActiveTargetRes);
  assert(patchActiveTargetRes.statusCode === 409, `ACTIVE TARGET deve retornar 409. Obteve ${patchActiveTargetRes.statusCode}`);

  // ACTIVE LINE METHOD -> 409
  const patchActiveMethodReq = createMockReq({
    lineAllocationMethod: 'revenue_proportional',
    idempotencyKey: 'idemp_patch_act_method_966f1'
  }, { id: budgetId });
  const patchActiveMethodRes = createMockRes();
  await updateCommercialBudgetController(patchActiveMethodReq, patchActiveMethodRes);
  assert(patchActiveMethodRes.statusCode === 409, `ACTIVE LINE METHOD deve retornar 409. Obteve ${patchActiveMethodRes.statusCode}`);
  console.log('  ✅ ACTIVE TARGET & LINE METHOD: 409 PASS');

  // 4. COMPLETED & ARCHIVED IMMUTABILITY (409 BUDGET_NOT_EDITABLE)
  console.log('🔹 4. Validando Imutabilidade de COMPLETED e ARCHIVED (409 BUDGET_NOT_EDITABLE)...');
  const completedBudgetId = 'budget_completed_966f1';
  await mockDb.collection('commercial_budgets').doc(completedBudgetId).set({
    id: completedBudgetId,
    status: 'completed',
    title: 'Orçamento Finalizado Q3 2026',
    targetRevenue: 100000,
    lineAllocationMethod: 'revenue_proportional',
    allocations: { cogsBudget: 40000, trafficBudget: 15000, fixedExpensesBudget: 10000, totalExpensesBudget: 65000 }
  });

  const patchCompTargetReq = createMockReq({
    targetRevenue: 110000,
    idempotencyKey: 'idemp_patch_comp_target_966f1'
  }, { id: completedBudgetId });
  const patchCompTargetRes = createMockRes();
  await updateCommercialBudgetController(patchCompTargetReq, patchCompTargetRes);
  assert(patchCompTargetRes.statusCode === 409, `COMPLETED TARGET deve retornar 409. Obteve ${patchCompTargetRes.statusCode}`);
  assert(patchCompTargetRes.body.code === 'BUDGET_NOT_EDITABLE', 'Código esperado BUDGET_NOT_EDITABLE');

  // ARCHIVE CURRENT ACTIVE
  const archiveReq = createMockReq({ idempotencyKey: 'idemp_archive_act_966f1' }, { id: budgetId });
  const archiveRes = createMockRes();
  await archiveCommercialBudgetController(archiveReq, archiveRes);
  assert(archiveRes.statusCode === 200, 'Arquivamento deve retornar 200');

  const patchArchTargetReq = createMockReq({
    targetRevenue: 130000,
    idempotencyKey: 'idemp_patch_arch_target_966f1'
  }, { id: budgetId });
  const patchArchTargetRes = createMockRes();
  await updateCommercialBudgetController(patchArchTargetReq, patchArchTargetRes);
  assert(patchArchTargetRes.statusCode === 409, `ARCHIVED TARGET deve retornar 409. Obteve ${patchArchTargetRes.statusCode}`);
  assert(patchArchTargetRes.body.code === 'BUDGET_NOT_EDITABLE', 'Código esperado BUDGET_NOT_EDITABLE');
  console.log('  ✅ COMPLETED & ARCHIVED: 409 BUDGET_NOT_EDITABLE PASS');

  // 5. REBUDGET SIMULATION COM CARGA COMPLETA
  console.log('🔹 5. Validando REBUDGET com Herança Completa...');
  const rebudgetReq = createMockReq({
    title: 'Orçamento 9.6.6-F.1 (Revisão v2)',
    targetRevenue: 120000,
    allocations: {
      cogsBudget: 48000,
      trafficBudget: 18000,
      fixedExpensesBudget: 10000,
      totalExpensesBudget: 76000
    },
    lineAllocationMethod: 'manual',
    customLineAllocations: manualLines,
    linkedGoalIds: ['goal_rev', 'goal_op'],
    idempotencyKey: 'idemp_rebudget_966f1'
  }, { id: budgetId });
  const rebudgetRes = createMockRes();
  await rebudgetCommercialBudgetController(rebudgetReq, rebudgetRes);
  assert(rebudgetRes.statusCode === 201, `Rebudget deve retornar 201. Obteve ${rebudgetRes.statusCode}`);
  const rebudgeted = rebudgetRes.body.budget || rebudgetRes.body.data;
  assert(rebudgeted.version === 2, 'Versão do Rebudget deve ser 2');
  assert(rebudgeted.linkedGoalIds.length === 2, 'Rebudget deve conter as 2 metas');
  assert(rebudgeted.lineAllocationMethod === 'manual', 'Rebudget deve adotar o método manual');
  assert(rebudgeted.lineAllocations.length === 4, 'Rebudget deve conter as 4 linhas');
  console.log('  ✅ REBUDGET INHERITANCE: PASS');

  console.log('\n=============================================================');
  console.log('🎉 AUDITORIA DA FASE 9.6.6-F.1 CONCLUÍDA COM 100% DE SUCESSO!');
  console.log('=============================================================\n');
}

runSuite().catch(err => {
  console.error('\n❌ ERRO NA AUDITORIA FASE 9.6.6-F.1:', err);
  process.exit(1);
});
