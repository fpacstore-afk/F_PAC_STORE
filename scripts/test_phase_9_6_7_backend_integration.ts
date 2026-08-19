/**
 * TESTE DE INTEGRAÇÃO BACKEND FASE 9.6.7
 * Valida o ciclo completo de ponta a ponta com o controller e motores certificados.
 */

import {
  setCommercialExecutionDb,
  createCommercialExecutionCycleController,
  activateCommercialExecutionCycleController,
  getCommercialExecutionDashboardController,
  addCommercialActionToCycleController,
  readyCommercialActionController,
  startCommercialActionController,
  completeCommercialActionController,
  recalculateCommercialExecutionCycleController
} from '../server/controllers/commercialExecution.controller.js';

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
          const valInDoc = value[w.field];
          if (w.op === '==') {
            if (valInDoc !== w.val) {
              matches = false;
              break;
            }
          } else if (w.op === '>=') {
            if (valInDoc === undefined || valInDoc === null) {
              matches = false;
              break;
            }
            const compVal = typeof w.val === 'object' && w.val?.toDate ? w.val.toDate().toISOString() : w.val;
            if (valInDoc < compVal) {
              matches = false;
              break;
            }
          } else if (w.op === '<=') {
            if (valInDoc === undefined || valInDoc === null) {
              matches = false;
              break;
            }
            const compVal = typeof w.val === 'object' && w.val?.toDate ? w.val.toDate().toISOString() : w.val;
            if (valInDoc > compVal) {
              matches = false;
              break;
            }
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

async function run() {
  console.log('================================================================');
  console.log('TEST SUITE: BACKEND INTEGRATION FASE 9.6.7');
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

  // Seed Budget & Goal
  const budgetId = 'b_test_integration';
  mockDb.storage.set(`commercial_budgets/${budgetId}`, {
    id: budgetId,
    title: 'Budget Q3 Integration',
    status: 'active',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    targetRevenue: 50000,
    maxAllowedCogs: 20000,
    maxAllowedTrafficSpend: 7500,
    minContributionMargin: 15000,
    guardrails: {
      maxCogsPercentOfRevenue: 40,
      maxTrafficSpendPercentOfRevenue: 15,
      minContributionMarginPercent: 30,
      burnRateAlertThresholdPercent: 110
    }
  });

  const goalId = 'g_test_integration';
  mockDb.storage.set(`commercial_goals/${goalId}`, {
    id: goalId,
    title: 'Meta Receita Q3',
    type: 'revenue',
    targetValue: 50000,
    currentValue: 0,
    status: 'active',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30'
  });

  // 1. Create Cycle
  const { req: cReq, res: cRes } = createMockReqRes({
    title: 'Ciclo Integrado 2026-Q3',
    periodStart: '2026-07-01',
    periodEnd: '2026-09-30',
    budgetId,
    linkedGoalIds: [goalId]
  });
  await createCommercialExecutionCycleController(cReq, cRes);
  assert(cRes.statusCode === 201, 'Ciclo criado com sucesso');
  const cycleId = cRes.body.cycle.id;

  // 2. Activate Cycle
  const { req: actReq, res: actRes } = createMockReqRes({}, {}, { id: cycleId });
  await activateCommercialExecutionCycleController(actReq, actRes);
  assert(actRes.statusCode === 200 && actRes.body.cycle.status === 'active', 'Ciclo ativado e snapshots congelados');
  assert(!!actRes.body.cycle.budgetExecutionSnapshot, 'budgetExecutionSnapshot presente');
  assert(Array.isArray(actRes.body.cycle.goalExecutionSnapshots) && actRes.body.cycle.goalExecutionSnapshots.length === 1, 'goalExecutionSnapshots presente');

  // 3. Add Action
  const { req: aReq, res: aRes } = createMockReqRes({
    title: 'Otimização de Preços Linha PRIME',
    priority: 'high',
    productLine: 'PRIME',
    plannedStartDate: '2026-07-15',
    plannedEndDate: '2026-08-15',
    expectedImpact: {
      revenueImpact: 10000,
      contributionMarginImpact: 4000
    }
  }, {}, { id: cycleId });
  await addCommercialActionToCycleController(aReq, aRes);
  assert(aRes.statusCode === 201, 'Ação adicionada ao ciclo');
  const actionId = aRes.body.action.id;

  // 4. Ready Action
  const { req: rReq, res: rRes } = createMockReqRes({}, {}, { id: cycleId, actionId });
  await readyCommercialActionController(rReq, rRes);
  assert(rRes.statusCode === 200 && rRes.body.action.executionStatus === 'ready', 'Ação marcada como ready');

  // 5. Start Action
  const { req: sReq, res: sRes } = createMockReqRes({}, {}, { id: cycleId, actionId });
  await startCommercialActionController(sReq, sRes);
  assert(sRes.statusCode === 200 && sRes.body.action.executionStatus === 'in_progress', 'Ação iniciada (in_progress)');

  // 6. Complete Action
  const { req: cmpReq, res: cmpRes } = createMockReqRes({ executionNotes: 'Concluído com sucesso' }, {}, { id: cycleId, actionId });
  await completeCommercialActionController(cmpReq, cmpRes);
  assert(cmpRes.statusCode === 200 && cmpRes.body.action.executionStatus === 'completed', 'Ação concluída com sucesso');

  // 7. Get Dashboard
  const { req: dReq, res: dRes } = createMockReqRes({}, {}, { id: cycleId });
  await getCommercialExecutionDashboardController(dReq, dRes);
  assert(dRes.statusCode === 200, 'Dashboard retornado');
  assert(dRes.body.progress.completedActions === 1, 'Dashboard contabiliza 1 ação concluída');
  assert(dRes.body.progress.completionPercent === 100, 'Percentual de conclusão de ações = 100%');

  console.log('\n================================================================');
  console.log(`INTEGRAÇÃO FASE 9.6.7: ${passed} PASSOU / ${failed} FALHOU`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal Integration Error:', err);
  process.exit(1);
});
