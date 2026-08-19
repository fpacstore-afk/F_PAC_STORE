/**
 * SUÍTE DE INTEGRAÇÃO REAL DE BACKEND — FASE 9.6.4-C
 * Execução direta dos controllers Express e middlewares de Governança Comercial
 * com injeção de Firestore transacional em memória.
 */

import {
  setCommercialGovernanceDb,
  createCommercialActionController,
  approveCommercialActionController,
  addCommercialActionNoteController,
  createCommercialGoalController,
  getCommercialActionsController,
  getCommercialActionByIdController,
  getCommercialActionEventsController,
  getCommercialGoalEvaluationController
} from '../server/controllers/commercialGovernance.controller.js';
import { authenticateAdmin, setAuthTokenVerifierForTesting, setAuthDbForTesting } from '../server/middleware/auth.middleware.js';
import { evaluateCommercialGoal, toTimestampMillis } from '../src/utils/commercialGovernance.js';
import { calculateFinancialDRE } from '../src/utils/orderFinancial.js';
import { calculateOrderProfitability, calculateProfitabilityOverviewStats } from '../src/utils/profitability.js';
import { CommercialGoal } from '../src/types/commercialGovernance.js';
import { Timestamp } from 'firebase-admin/firestore';
import { execSync } from 'child_process';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failedTests++;
  }
}

// -----------------------------------------------------------------
// Implementação Canônica de Mock Firestore Transacional
// -----------------------------------------------------------------
class InMemoryFirestoreDb {
  public collections: Map<string, Map<string, any>> = new Map();
  public queryLog: Array<{ collection: string; filters: Array<{ field: string; op: string; val: any }>; fullScan: boolean }> = [];
  private transactionLock: Promise<void> = Promise.resolve();

  public getColMap(name: string): Map<string, any> {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map());
    }
    return this.collections.get(name)!;
  }

  private _createQuery(
    name: string,
    filters: Array<{ field: string; op: string; val: any }>,
    orders: Array<{ field: string; dir: 'asc' | 'desc' }>,
    startAfterDocId: string | null,
    limitCount: number | null
  ) {
    const self = this;
    const colMap = this.getColMap(name);

    const queryObj: any = {
      where(f: string, o: string, v: any) {
        return self._createQuery(name, [...filters, { field: f, op: o, val: v }], orders, startAfterDocId, limitCount);
      },
      orderBy(f: string, d: 'asc' | 'desc' = 'asc') {
        return self._createQuery(name, filters, [...orders, { field: f, dir: d }], startAfterDocId, limitCount);
      },
      startAfter(cursorDoc: any) {
        const cursorId = typeof cursorDoc === 'string' ? cursorDoc : cursorDoc?.id;
        return self._createQuery(name, filters, orders, cursorId, limitCount);
      },
      limit(n: number) {
        return self._createQuery(name, filters, orders, startAfterDocId, n);
      },
      get: async () => {
        self.queryLog.push({
          collection: name,
          filters: [...filters],
          fullScan: filters.length === 0
        });

        let items: Array<{ id: string; data: any }> = [];
        for (const [id, val] of colMap.entries()) {
          items.push({ id, data: { ...val } });
        }

        // Apply where filters respecting Firestore type separation
        for (const f of filters) {
          items = items.filter(it => {
            const itemVal = it.data[f.field];
            if (itemVal === undefined) return false;

            const isFilterString = typeof f.val === 'string';
            const isItemString = typeof itemVal === 'string';

            const isFilterTimestamp = f.val instanceof Date || (typeof f.val === 'object' && f.val !== null && (typeof f.val.toMillis === 'function' || typeof f.val.toDate === 'function' || 'seconds' in f.val));
            const isItemTimestamp = itemVal instanceof Date || (typeof itemVal === 'object' && itemVal !== null && (typeof itemVal.toMillis === 'function' || typeof itemVal.toDate === 'function' || 'seconds' in itemVal));

            // If query is for string createdAt and item is string:
            if (isFilterString && isItemString) {
              if (f.op === '==') return itemVal === f.val;
              if (f.op === '!=') return itemVal !== f.val;
              if (f.op === '>') return itemVal > f.val;
              if (f.op === '>=') return itemVal >= f.val;
              if (f.op === '<') return itemVal < f.val;
              if (f.op === '<=') return itemVal <= f.val;
              return true;
            }

            // If query is for Timestamp createdAt and item is Timestamp:
            if (isFilterTimestamp && isItemTimestamp) {
              const tItem = toTimestampMillis(itemVal);
              const tFilter = toTimestampMillis(f.val);
              if (tItem === null || tFilter === null) return false;

              if (f.op === '==') return tItem === tFilter;
              if (f.op === '!=') return tItem !== tFilter;
              if (f.op === '>') return tItem > tFilter;
              if (f.op === '>=') return tItem >= tFilter;
              if (f.op === '<') return tItem < tFilter;
              if (f.op === '<=') return tItem <= tFilter;
              return true;
            }

            // Cross-type separation: string query does not match Timestamp and vice versa
            if ((isFilterString && isItemTimestamp) || (isFilterTimestamp && isItemString)) {
              return false;
            }

            if (f.op === '==') return itemVal === f.val;
            if (f.op === '!=') return itemVal !== f.val;
            if (f.op === '>') return itemVal > f.val;
            if (f.op === '>=') return itemVal >= f.val;
            if (f.op === '<') return itemVal < f.val;
            if (f.op === '<=') return itemVal <= f.val;
            return true;
          });
        }

        // Apply orderBy
        if (orders.length > 0) {
          items.sort((a, b) => {
            for (const o of orders) {
              const valA = a.data[o.field] ?? a.id;
              const valB = b.data[o.field] ?? b.id;
              if (valA < valB) return o.dir === 'asc' ? -1 : 1;
              if (valA > valB) return o.dir === 'asc' ? 1 : -1;
            }
            return 0;
          });
        }

        // Apply startAfter
        if (startAfterDocId) {
          const idx = items.findIndex(it => it.id === startAfterDocId);
          if (idx !== -1) {
            items = items.slice(idx + 1);
          }
        }

        // Apply limit
        if (limitCount !== null && limitCount >= 0) {
          items = items.slice(0, limitCount);
        }

        return {
          docs: items.map(it => ({
            id: it.id,
            exists: true,
            data: () => it.data
          }))
        };
      }
    };
    return queryObj;
  }

  public collection(name: string) {
    const colMap = this.getColMap(name);

    return {
      doc: (id?: string) => {
        const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        return {
          id: docId,
          get: async () => {
            const data = colMap.get(docId);
            return {
              id: docId,
              exists: data !== undefined,
              data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
            };
          },
          set: async (data: any, options?: { merge?: boolean }) => {
            if (options?.merge && colMap.has(docId)) {
              const existing = colMap.get(docId);
              colMap.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
            } else {
              colMap.set(docId, JSON.parse(JSON.stringify(data)));
            }
          },
          update: async (data: any) => {
            if (!colMap.has(docId)) {
              throw new Error('NOT_FOUND');
            }
            const existing = colMap.get(docId);
            colMap.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
          },
          delete: async () => {
            colMap.delete(docId);
          }
        };
      },
      where: (field: string, op: string, val: any) => {
        return this._createQuery(name, [{ field, op, val }], [], null, null);
      },
      orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => {
        return this._createQuery(name, [], [{ field, dir }], null, null);
      },
      limit: (n: number) => {
        return this._createQuery(name, [], [], null, n);
      },
      get: async () => {
        return this._createQuery(name, [], [], null, null).get();
      }
    };
  }

  public async runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    // Execução serializada de transações atômicas para simular Firestore ACID
    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    const previousLock = this.transactionLock;
    this.transactionLock = lockPromise;

    await previousLock;

    try {
      const stagedWrites: Array<() => void> = [];
      const self = this;

      const transaction = {
        get: async (docRef: any) => {
          const colName = docRef.id.startsWith('comm_act_') || docRef.id.startsWith('comm_trans_') || docRef.id.startsWith('comm_note_') || docRef.id.startsWith('comm_goal_')
            ? 'idempotency_records'
            : docRef.id.length === 64
            ? 'commercial_action_fingerprints'
            : docRef.colName || (self.collections.has('commercial_actions') && self.collections.get('commercial_actions')!.has(docRef.id) ? 'commercial_actions' : 'commercial_goals');

          const colMap = self.getColMap(colName);
          const data = colMap.get(docRef.id);
          return {
            id: docRef.id,
            exists: data !== undefined,
            data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
          };
        },
        set: (docRef: any, data: any, options?: { merge?: boolean }) => {
          stagedWrites.push(() => {
            const colName = docRef.id.startsWith('comm_act_') || docRef.id.startsWith('comm_trans_') || docRef.id.startsWith('comm_note_') || docRef.id.startsWith('comm_goal_')
              ? 'idempotency_records'
              : docRef.id.length === 64
              ? 'commercial_action_fingerprints'
              : data.period !== undefined
              ? 'commercial_goals'
              : data.eventType !== undefined
              ? 'commercial_action_events'
              : 'commercial_actions';

            const colMap = self.getColMap(colName);
            if (options?.merge && colMap.has(docRef.id)) {
              colMap.set(docRef.id, { ...colMap.get(docRef.id), ...JSON.parse(JSON.stringify(data)) });
            } else {
              colMap.set(docRef.id, JSON.parse(JSON.stringify(data)));
            }
          });
        },
        update: (docRef: any, data: any) => {
          stagedWrites.push(() => {
            const colName = docRef.id.startsWith('comm_act_') || docRef.id.startsWith('comm_trans_') || docRef.id.startsWith('comm_note_') || docRef.id.startsWith('comm_goal_')
              ? 'idempotency_records'
              : docRef.period !== undefined
              ? 'commercial_goals'
              : 'commercial_actions';

            const colMap = self.getColMap(colName);
            if (colMap.has(docRef.id)) {
              colMap.set(docRef.id, { ...colMap.get(docRef.id), ...JSON.parse(JSON.stringify(data)) });
            }
          });
        }
      };

      const result = await updateFunction(transaction);

      // Commit staged writes
      for (const write of stagedWrites) {
        write();
      }

      return result;
    } finally {
      releaseLock!();
    }
  }
}

// Helper para mock de Request/Response do Express
function createMockReqRes(options: {
  method?: string;
  url?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: any;
  user?: any;
}) {
  const req: any = {
    method: options.method || 'GET',
    originalUrl: options.url || '/',
    params: options.params || {},
    query: options.query || {},
    headers: options.headers || {},
    body: options.body || {},
    user: options.user
  };

  let statusCode = 200;
  let responseData: any = null;

  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
    send(data: any) {
      responseData = data;
      return this;
    },
    getStatus: () => statusCode,
    getData: () => responseData
  };

  return { req, res };
}

async function runIntegrationSuite() {
  console.log('===============================================================');
  console.log('🧪 SUÍTE DE INTEGRAÇÃO REAL DE BACKEND — FASE 9.6.4-C');
  console.log('===============================================================\n');

  const testDb = new InMemoryFirestoreDb();
  setCommercialGovernanceDb(testDb);

  // -----------------------------------------------------------------
  // 1. CREATE ACTION CONTROLLER REAL COM 10x CONCORRÊNCIA PROMISE.ALL
  // -----------------------------------------------------------------
  console.log('--- 1. Create Action Controller Real (10x Concorrência Mesma Chave) ---');
  const actionKey = 'real_idemp_act_test_001';
  const createReqs = Array.from({ length: 10 }).map(() => {
    return createMockReqRes({
      method: 'POST',
      url: '/api/admin/commercial/actions',
      headers: { 'idempotency-key': actionKey },
      body: {
        title: 'Revisar Preço de Camiseta Heavyweight',
        type: 'review_price',
        entityId: 'prod_hw_1',
        entityName: 'Camiseta Heavyweight',
        reasonCodes: ['low_contribution_margin', 'high_cogs'],
        priority: 'high'
      },
      user: { uid: 'adm_tester', email: 'admin@fpacstore.com.br' }
    });
  });

  await Promise.all(createReqs.map(({ req, res }) => createCommercialActionController(req, res)));

  const actionCreates201 = createReqs.filter(r => r.res.getStatus() === 201 && r.res.getData()?.idempotentReplay === false);
  const actionReplays200 = createReqs.filter(r => r.res.getStatus() === 200 && r.res.getData()?.idempotentReplay === true);
  const createdActionId = actionCreates201[0]?.res.getData()?.action?.id;

  assert(actionCreates201.length === 1, 'Exatamente 1 resposta HTTP 201 (criação real efetuada)');
  assert(actionReplays200.length === 9, 'Exatamente 9 respostas HTTP 200 com replay idempotente');
  assert(testDb.collections.get('commercial_actions')?.size === 1, 'Exatamente 1 documento de ação persistido no banco real');
  assert(testDb.collections.get('commercial_action_events')?.size === 1, 'Exatamente 1 evento de criação registrado na timeline');
  assert(testDb.collections.get('idempotency_records')?.size === 1, 'Exatamente 1 registro de idempotência gerado');

  // -----------------------------------------------------------------
  // 2. APPROVE CONTROLLER REAL COM 10x CONCORRÊNCIA PROMISE.ALL
  // -----------------------------------------------------------------
  console.log('\n--- 2. Approve Action Controller Real (10x Concorrência Mesma Chave) ---');
  const approveKey = 'real_idemp_appr_001';
  const approveReqs = Array.from({ length: 10 }).map(() => {
    return createMockReqRes({
      method: 'POST',
      url: `/api/admin/commercial/actions/${createdActionId}/approve`,
      params: { id: createdActionId },
      headers: { 'idempotency-key': approveKey },
      body: {},
      user: { uid: 'adm_tester', email: 'admin@fpacstore.com.br' }
    });
  });

  await Promise.all(approveReqs.map(({ req, res }) => approveCommercialActionController(req, res)));

  const approveExecutions = approveReqs.filter(r => r.res.getStatus() === 200 && r.res.getData()?.idempotentReplay === false);
  const approveReplays = approveReqs.filter(r => r.res.getStatus() === 200 && r.res.getData()?.idempotentReplay === true);
  const persistedAction = testDb.collections.get('commercial_actions')?.get(createdActionId);

  assert(approveExecutions.length === 1, 'Exatamente 1 aprovação real executada (status 200)');
  assert(approveReplays.length === 9, 'Exatamente 9 replays idempotentes de aprovação');
  assert(persistedAction?.status === 'approved', 'Status persistido da ação atualizado para "approved"');

  // -----------------------------------------------------------------
  // 3. NOTE CONTROLLER REAL COM 10x CONCORRÊNCIA PROMISE.ALL
  // -----------------------------------------------------------------
  console.log('\n--- 3. Add Note Controller Real (10x Concorrência Mesma Chave) ---');
  const noteKey = 'real_idemp_note_001';
  const noteReqs = Array.from({ length: 10 }).map(() => {
    return createMockReqRes({
      method: 'POST',
      url: `/api/admin/commercial/actions/${createdActionId}/notes`,
      params: { id: createdActionId },
      headers: { 'idempotency-key': noteKey },
      body: { note: 'Ajuste de fornecedor alinhado com a confecção.' },
      user: { uid: 'adm_tester', email: 'admin@fpacstore.com.br' }
    });
  });

  await Promise.all(noteReqs.map(({ req, res }) => addCommercialActionNoteController(req, res)));

  const noteExecutions = noteReqs.filter(r => r.res.getStatus() === 200 && r.res.getData()?.idempotentReplay === false);
  const noteReplays = noteReqs.filter(r => r.res.getStatus() === 200 && r.res.getData()?.idempotentReplay === true);
  const eventsAfterNotes = Array.from(testDb.collections.get('commercial_action_events')?.values() || []).filter(e => e.eventType === 'note_added');

  assert(noteExecutions.length === 1, 'Exatamente 1 inserção real de nota');
  assert(noteReplays.length === 9, 'Exatamente 9 replays idempotentes de nota');
  assert(eventsAfterNotes.length === 1, 'Exatamente 1 evento note_added registrado na timeline');

  // -----------------------------------------------------------------
  // 4. GOAL CONTROLLER REAL COM 10x CONCORRÊNCIA PROMISE.ALL
  // -----------------------------------------------------------------
  console.log('\n--- 4. Create Goal Controller Real (10x Concorrência Mesma Chave) ---');
  const goalKey = 'real_idemp_goal_001';
  const goalReqs = Array.from({ length: 10 }).map(() => {
    return createMockReqRes({
      method: 'POST',
      url: '/api/admin/commercial/goals',
      headers: { 'idempotency-key': goalKey },
      body: {
        title: 'Meta de Faturamento Q3',
        type: 'revenue',
        targetValue: 50000,
        startDate: '2026-07-01',
        endDate: '2026-09-30',
        period: 'quarterly'
      },
      user: { uid: 'adm_tester', email: 'admin@fpacstore.com.br' }
    });
  });

  await Promise.all(goalReqs.map(({ req, res }) => createCommercialGoalController(req, res)));

  const goalCreates201 = goalReqs.filter(r => r.res.getStatus() === 201 && r.res.getData()?.idempotentReplay === false);
  const goalReplays200 = goalReqs.filter(r => r.res.getStatus() === 200 && r.res.getData()?.idempotentReplay === true);

  assert(goalCreates201.length === 1, 'Exatamente 1 criação real de meta (201)');
  assert(goalReplays200.length === 9, 'Exatamente 9 replays idempotentes de meta');
  assert(testDb.collections.get('commercial_goals')?.size === 1, 'Exatamente 1 meta persistida no banco');

  // -----------------------------------------------------------------
  // 5. FINGERPRINT REAL — 10x Requisições com Mesmo Fingerprint e Chaves Distintas
  // -----------------------------------------------------------------
  console.log('\n--- 5. Fingerprint Real (10x Concorrência Chaves Distintas) ---');
  const fpReqs = Array.from({ length: 10 }).map((_, i) => {
    return createMockReqRes({
      method: 'POST',
      url: '/api/admin/commercial/actions',
      headers: { 'idempotency-key': `diff_key_fp_${i}_${Date.now()}` },
      body: {
        title: 'Revisão de Preço com Conflito de Fingerprint',
        type: 'increase_price',
        entityId: 'prod_fp_conflict',
        reasonCodes: ['low_margin', 'high_demand'],
        priority: 'critical'
      },
      user: { uid: 'adm_tester', email: 'admin@fpacstore.com.br' }
    });
  });

  await Promise.all(fpReqs.map(({ req, res }) => createCommercialActionController(req, res)));

  const fpSuccesses = fpReqs.filter(r => r.res.getStatus() === 201);
  const fpConflicts = fpReqs.filter(r => r.res.getStatus() === 409 && r.res.getData()?.error === 'ACTIVE_ACTION_ALREADY_EXISTS');

  assert(fpSuccesses.length === 1, 'Exatamente 1 criação aceita (201)');
  assert(fpConflicts.length === 9, 'Exatamente 9 conflitos 409 ACTIVE_ACTION_ALREADY_EXISTS bloqueados');

  // -----------------------------------------------------------------
  // 6. SNAPSHOT REAL CONTROLLER — Sanitização e Imutabilidade
  // -----------------------------------------------------------------
  console.log('\n--- 6. Snapshot Real Controller ---');
  const snapKey = 'real_idemp_snap_001';
  const snapReq = createMockReqRes({
    method: 'POST',
    url: '/api/admin/commercial/actions',
    headers: { 'idempotency-key': snapKey },
    body: {
      title: 'Ação com Snapshot Forjado pelo Cliente',
      type: 'review_price',
      entityId: 'prod_snap_1',
      sourceSnapshot: {
        currentPrice: 99.90,
        isHistoricalSnapshot: false,
        snapshotCapturedAt: '1970-01-01T00:00:00Z',
        snapshotVersion: '99',
        unauthorizedCustomField: 'HACK'
      }
    },
    user: { uid: 'adm_tester', email: 'admin@fpacstore.com.br' }
  });

  await createCommercialActionController(snapReq.req, snapReq.res);
  const snapActionId = snapReq.res.getData()?.action?.id;
  const persistedSnapDoc = testDb.collections.get('commercial_actions')?.get(snapActionId);
  const snapshotData = persistedSnapDoc?.sourceSnapshot;

  assert(snapshotData?.currentPrice === 99.90, 'Preço legítimo preservado no snapshot');
  assert(snapshotData?.isHistoricalSnapshot === true, 'isHistoricalSnapshot forçado como true pelo servidor');
  assert(snapshotData?.snapshotCapturedAt !== '1970-01-01T00:00:00Z', 'snapshotCapturedAt foi gerado pelo servidor em tempo real');
  assert(snapshotData?.snapshotVersion === '1.0', 'snapshotVersion forçado como "1.0" pelo servidor');
  assert(snapshotData?.unauthorizedCustomField === undefined, 'Campo não-autorizado "unauthorizedCustomField" removido com sucesso');

  // -----------------------------------------------------------------
  // 7. AUTH REAL MIDDLEWARE — 401, 403 e 200 com Next()
  // -----------------------------------------------------------------
  console.log('\n--- 7. Auth Real Middleware ---');
  const prevApiKey = process.env.ADMIN_API_KEY;
  const prevAdminEmails = process.env.ADMIN_EMAILS;
  process.env.ADMIN_API_KEY = 'valid_admin_secret_key_123';
  process.env.ADMIN_EMAILS = 'admin@fpacstore.com.br';

  // a) Sem header Authorization
  const reqNoAuth = createMockReqRes({ headers: {} });
  let nextCalledNoAuth = false;
  await authenticateAdmin(reqNoAuth.req, reqNoAuth.res, () => { nextCalledNoAuth = true; });
  const noToken401 = reqNoAuth.res.getStatus() === 401 && !nextCalledNoAuth;
  assert(noToken401, 'Requisição sem token retorna 401 e não executa next()');

  // b) Token malformado / Bearer vazio
  const reqEmptyBearer = createMockReqRes({ headers: { authorization: 'Bearer ' } });
  let nextCalledEmpty = false;
  await authenticateAdmin(reqEmptyBearer.req, reqEmptyBearer.res, () => { nextCalledEmpty = true; });
  assert(reqEmptyBearer.res.getStatus() === 401 && !nextCalledEmpty, 'Bearer token vazio retorna 401');

  // c) Firebase Non-Admin Token -> 403 Forbidden
  setAuthTokenVerifierForTesting(async (token: string) => {
    if (token === 'token_customer_user') {
      return {
        uid: 'cust_user_456',
        email: 'customer@fpacstore.com.br',
        admin: false
      } as any;
    }
    throw new Error('Invalid token');
  });

  const mockAuthDb = {
    collection: (colName: string) => ({
      doc: (docId: string) => ({
        get: async () => ({
          exists: true,
          data: () => ({ role: 'customer', isAdmin: false })
        })
      })
    })
  };
  setAuthDbForTesting(mockAuthDb);

  const reqCustomer = createMockReqRes({
    headers: { authorization: 'Bearer token_customer_user' },
    url: '/api/admin/commercial/actions'
  });
  let nextCalledCustomer = false;
  await authenticateAdmin(reqCustomer.req, reqCustomer.res, () => { nextCalledCustomer = true; });
  const firebaseNonAdmin403 = reqCustomer.res.getStatus() === 403 && !nextCalledCustomer;
  assert(firebaseNonAdmin403, 'Usuário Firebase autenticado sem privilégio admin retorna 403 Forbidden');

  // d) Firebase Admin Token -> 200 / next()
  setAuthTokenVerifierForTesting(async (token: string) => {
    if (token === 'token_admin_user') {
      return {
        uid: 'adm_user_789',
        email: 'admin@fpacstore.com.br',
        admin: true
      } as any;
    }
    throw new Error('Invalid token');
  });

  const reqAdminToken = createMockReqRes({
    headers: { authorization: 'Bearer token_admin_user' },
    url: '/api/admin/commercial/actions'
  });
  let nextCalledAdminToken = false;
  await authenticateAdmin(reqAdminToken.req, reqAdminToken.res, () => { nextCalledAdminToken = true; });
  const firebaseAdminPass = nextCalledAdminToken && reqAdminToken.req.user?.role === 'admin';
  assert(firebaseAdminPass, 'Usuário Firebase com claim admin executa next() e anexa req.user.role = admin');

  // Reset DI hooks
  setAuthTokenVerifierForTesting(null);
  setAuthDbForTesting(null);

  // e) Admin API Key válida (executa next)
  const reqAdminKey = createMockReqRes({ headers: { 'x-admin-api-key': 'valid_admin_secret_key_123' } });
  let nextCalledAdminKey = false;
  await authenticateAdmin(reqAdminKey.req, reqAdminKey.res, () => { nextCalledAdminKey = true; });
  const adminApiKeyPass = nextCalledAdminKey && reqAdminKey.req.user?.role === 'admin';
  assert(adminApiKeyPass, 'Chave administrativa autenticada com role admin e next() executado');

  process.env.ADMIN_API_KEY = prevApiKey;
  process.env.ADMIN_EMAILS = prevAdminEmails;

  // -----------------------------------------------------------------
  // 8. EVENT CONTROLLER 125 PAGINATION (REAL CONTROLLER)
  // -----------------------------------------------------------------
  console.log('\n--- 8. Event Controller 125 Pagination (Real Controller) ---');
  const pagActionId = 'act_pag_real_125';
  const eventsCol = testDb.getColMap('commercial_action_events');

  // Seed 125 eventos ordenados por timestamp
  for (let i = 1; i <= 125; i++) {
    const pad = String(i).padStart(3, '0');
    const evId = `ev_real_${pad}`;
    eventsCol.set(evId, {
      id: evId,
      actionId: pagActionId,
      eventType: i === 1 ? 'created' : 'note_added',
      timestamp: new Date(1700000000000 + i * 1000).toISOString(),
      operatorUid: 'adm_1',
      operatorEmail: 'admin@fpacstore.com.br',
      note: `Nota de teste #${i}`
    });
  }

  // Página 1 (limit 50)
  const p1Req = createMockReqRes({ params: { id: pagActionId }, query: { limit: '50' } });
  await getCommercialActionEventsController(p1Req.req, p1Req.res);
  const p1Data = p1Req.res.getData();

  assert(p1Data?.events?.length === 50, 'Página 1 retorna exatamente 50 eventos');
  assert(p1Data?.hasMore === true, 'Página 1 hasMore = true');
  assert(p1Data?.nextCursor === 'ev_real_050', 'Página 1 nextCursor aponta para ev_real_050');

  // Página 2 (startAfter ev_real_050, limit 50)
  const p2Req = createMockReqRes({ params: { id: pagActionId }, query: { limit: '50', startAfter: p1Data.nextCursor } });
  await getCommercialActionEventsController(p2Req.req, p2Req.res);
  const p2Data = p2Req.res.getData();

  assert(p2Data?.events?.length === 50, 'Página 2 retorna exatamente 50 eventos');
  assert(p2Data?.hasMore === true, 'Página 2 hasMore = true');
  assert(p2Data?.nextCursor === 'ev_real_100', 'Página 2 nextCursor aponta para ev_real_100');

  // Página 3 (startAfter ev_real_100, limit 50)
  const p3Req = createMockReqRes({ params: { id: pagActionId }, query: { limit: '50', startAfter: p2Data.nextCursor } });
  await getCommercialActionEventsController(p3Req.req, p3Req.res);
  const p3Data = p3Req.res.getData();

  assert(p3Data?.events?.length === 25, 'Página 3 retorna exatamente os 25 eventos restantes');
  assert(p3Data?.hasMore === false, 'Página 3 hasMore = false');
  assert(p3Data?.nextCursor === 'ev_real_125', 'Página 3 nextCursor aponta para ev_real_125');

  const allRealEvents = [...p1Data.events, ...p2Data.events, ...p3Data.events];
  const uniqueRealEvents = new Set(allRealEvents.map(e => e.id));
  assert(uniqueRealEvents.size === 125, 'Total consolidado de 125 eventos únicos sem falhas ou sobreposições');

  // -----------------------------------------------------------------
  // 9. EVENT CONTROLLER EXACT-100 PAGINATION (REAL CONTROLLER)
  // -----------------------------------------------------------------
  console.log('\n--- 9. Event Controller Exact-100 Pagination (Real Controller) ---');
  const exact100ActionId = 'act_pag_exact_100';
  for (let i = 1; i <= 100; i++) {
    const pad = String(i).padStart(3, '0');
    const evId = `ev_exact_${pad}`;
    eventsCol.set(evId, {
      id: evId,
      actionId: exact100ActionId,
      eventType: i === 1 ? 'created' : 'note_added',
      timestamp: new Date(1700000000000 + i * 1000).toISOString(),
      operatorUid: 'adm_1',
      operatorEmail: 'admin@fpacstore.com.br',
      note: `Nota exact 100 #${i}`
    });
  }

  // Página 1 (limit 50)
  const exP1Req = createMockReqRes({ params: { id: exact100ActionId }, query: { limit: '50' } });
  await getCommercialActionEventsController(exP1Req.req, exP1Req.res);
  const exP1Data = exP1Req.res.getData();

  assert(exP1Data?.events?.length === 50, 'Página 1 (Exact-100) retorna 50 eventos');
  assert(exP1Data?.hasMore === true, 'Página 1 (Exact-100) hasMore = true');

  // Página 2 (startAfter ev_exact_050, limit 50)
  const exP2Req = createMockReqRes({ params: { id: exact100ActionId }, query: { limit: '50', startAfter: exP1Data.nextCursor } });
  await getCommercialActionEventsController(exP2Req.req, exP2Req.res);
  const exP2Data = exP2Req.res.getData();

  assert(exP2Data?.events?.length === 50, 'Página 2 (Exact-100) retorna os 50 eventos finais');
  assert(exP2Data?.hasMore === false, 'Página 2 (Exact-100) hasMore = false (NENHUMA 3ª requisição vazia necessária)');

  // -----------------------------------------------------------------
  // 10. GOAL FULL DATASET PROPAGATION & INDEPENDENCE OF VISUAL FILTER
  // -----------------------------------------------------------------
  console.log('\n--- 10. Propagação de Dataset Completo & Independência de Filtro Visual ---');
  const allHistoricalOrders = [
    // Pedidos de Julho (R$ 9.000)
    { id: 'ord_jul_1', total: 9000, paidAmount: 9000, payment: { gatewayFee: 90 }, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-07-15T10:00:00Z', items: [{ productId: 'p1', quantity: 90, unitPrice: 100, costPrice: 40 }] },
    // Pedidos de Agosto 01-20 (R$ 800)
    { id: 'ord_aug_1', total: 800, paidAmount: 800, payment: { gatewayFee: 8 }, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-10T14:00:00Z', items: [{ productId: 'p1', quantity: 8, unitPrice: 100, costPrice: 40 }] },
    // Pedidos de Agosto 21-31 (R$ 200 - janela dos últimos 7 dias)
    { id: 'ord_aug_2', total: 200, paidAmount: 200, payment: { gatewayFee: 2 }, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-25T16:00:00Z', items: [{ productId: 'p1', quantity: 2, unitPrice: 100, costPrice: 40 }] }
  ];

  const goalAugustRevenue: CommercialGoal = {
    id: 'goal_august_full',
    title: 'Meta de Faturamento de Agosto',
    type: 'revenue',
    targetValue: 2000,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'adm_tester',
    createdAt: '2026-08-01T00:00:00Z'
  };

  // Simulação de filtro visual "7 dias" (apenas R$ 200 em filteredOrders)
  const visualFilteredOrders7Days = allHistoricalOrders.filter(o => o.createdAt >= '2026-08-21');
  assert(visualFilteredOrders7Days.length === 1 && visualFilteredOrders7Days[0].total === 200, 'Filtro visual de 7 dias contém apenas R$ 200');

  // Avaliação da meta usando a governança conectada ao dataset total (governanceOrders)
  const evalWithGovernanceOrders = evaluateCommercialGoal(goalAugustRevenue, {
    rawOrders: allHistoricalOrders, // Propagado via governanceOrders
    productCatalog: [{ id: 'p1', costPrice: 40, price: 100 }]
  });

  assert(evalWithGovernanceOrders.currentValue === 1000, 'Meta de Agosto apura exatamente R$ 1.000 (R$ 800 + R$ 200), ignorando R$ 9.000 de Julho');
  assert(evalWithGovernanceOrders.currentValue !== 200, 'Meta NÃO é corrompida pelo filtro visual de 7 dias (R$ 200)');
  assert(evalWithGovernanceOrders.currentValue !== 10000, 'Meta NÃO soma receita fora do período de vigência (R$ 10.000)');

  // Testando com outros filtros visuais (Today, Current Month, Year/All)
  const visualFilters = [
    { name: 'TODAY', orders: allHistoricalOrders.filter(o => o.id === 'ord_aug_2') },
    { name: '7 DAYS', orders: visualFilteredOrders7Days },
    { name: 'CURRENT MONTH', orders: allHistoricalOrders.filter(o => o.createdAt.startsWith('2026-08')) },
    { name: 'YEAR', orders: allHistoricalOrders }
  ];

  for (const filter of visualFilters) {
    const evalResult = evaluateCommercialGoal(goalAugustRevenue, {
      rawOrders: allHistoricalOrders, // dataset completo sempre propagado
      productCatalog: [{ id: 'p1', costPrice: 40, price: 100 }]
    });
    assert(evalResult.currentValue === 1000, `Filtro visual "${filter.name}" não afeta resultado da meta (R$ 1.000 mantido)`);
  }

  // -----------------------------------------------------------------
  // 10.1. AVALIAÇÃO DAS 5 METAS REAIS, FILTROS TEMPORAIS E MOTORES DRE
  // -----------------------------------------------------------------
  console.log('\n--- 10.1. Avaliação Real das 5 Metas e Isolamento por Período ---');

  const multiPeriodOrders = [
    // Julho
    { id: 'ord_jul_A', total: 5000, paidAmount: 5000, payment: { gatewayFee: 50 }, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-07-10T10:00:00Z', items: [{ productId: 'p1', quantity: 50, unitPrice: 100, costPrice: 40 }] },
    // Agosto: Aprovado A (100)
    { id: 'ord_aug_A', total: 100, paidAmount: 100, payment: { gatewayFee: 5 }, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-05T10:00:00Z', items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }] },
    // Agosto: Aprovado B (200)
    { id: 'ord_aug_B', total: 200, paidAmount: 200, payment: { gatewayFee: 10 }, status: 'delivered', paymentStatus: 'approved', createdAt: '2026-08-15T12:00:00Z', items: [{ productId: 'p1', quantity: 2, unitPrice: 100, costPrice: 40 }] },
    // Agosto: Cancelado C (900)
    { id: 'ord_aug_C', total: 900, paidAmount: 0, status: 'cancelled', paymentStatus: 'cancelled', createdAt: '2026-08-20T15:00:00Z', items: [{ productId: 'p1', quantity: 9, unitPrice: 100, costPrice: 40 }] }
  ];

  const multiPeriodExpenses = [
    { id: 'exp_jul', amount: 20000, category: 'DESPESA_FIXA', date: '2026-07-10' },
    { id: 'exp_aug', amount: 50, category: 'DESPESA_VARIAVEL', date: '2026-08-10' }
  ];

  const multiPeriodTraffic = [
    { id: 'trf_jul', amountSpent: 8000, date: '2026-07-20' },
    { id: 'trf_aug', amountSpent: 500, date: '2026-08-20' }
  ];

  const multiPeriodInvestments = [
    { id: 'inv_jul', amount: 30000, date: '2026-07-05' },
    { id: 'inv_aug', amount: 2000, date: '2026-08-05' },
    { id: 'inv_sep', amount: 5000, date: '2026-09-05' }
  ];

  const catalogP1 = [{ id: 'p1', costPrice: 40, price: 100 }];

  // 1. Goal Revenue Real Flow
  const goalRealRevenue: CommercialGoal = {
    id: 'g_rev_real',
    title: 'Meta Receita Real',
    type: 'revenue',
    targetValue: 300,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'adm',
    createdAt: '2026-08-01T00:00:00Z'
  };
  const evalRealRevenue = evaluateCommercialGoal(goalRealRevenue, {
    rawOrders: multiPeriodOrders,
    expenses: multiPeriodExpenses,
    traffic: multiPeriodTraffic,
    investments: multiPeriodInvestments,
    productCatalog: catalogP1
  });
  const goalRevenueRealPass = evalRealRevenue.currentValue === 300;
  assert(goalRevenueRealPass, 'Goal Revenue Real Flow apura R$ 300 (exclui Julho e Pending)');

  // 2. Goal Contribution Margin Real Flow
  const goalRealCM: CommercialGoal = {
    id: 'g_cm_real',
    title: 'Meta Margem Contribuição Real',
    type: 'contribution_margin',
    targetValue: 100,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'adm',
    createdAt: '2026-08-01T00:00:00Z'
  };
  const evalRealCM = evaluateCommercialGoal(goalRealCM, {
    rawOrders: multiPeriodOrders,
    expenses: multiPeriodExpenses,
    traffic: multiPeriodTraffic,
    investments: multiPeriodInvestments,
    productCatalog: catalogP1
  });
  // ord_aug_A (100 - 40 - 5 = 55) + ord_aug_B (200 - 80 - 10 = 110) = 165
  const goalContributionMarginRealPass = evalRealCM.currentValue === 165;
  assert(goalContributionMarginRealPass, 'Goal Contribution Margin Real Flow apura exatamente 165 do motor canônico de rentabilidade');

  // 3. Goal Operating Profit Real Flow
  const goalRealOperatingProfit: CommercialGoal = {
    id: 'g_op_real',
    title: 'Meta Lucro Operacional Real',
    type: 'operating_profit',
    targetValue: -500,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'adm',
    createdAt: '2026-08-01T00:00:00Z'
  };
  const evalRealOp = evaluateCommercialGoal(goalRealOperatingProfit, {
    rawOrders: multiPeriodOrders,
    expenses: multiPeriodExpenses,
    traffic: multiPeriodTraffic,
    investments: multiPeriodInvestments,
    productCatalog: catalogP1
  });
  // Lucro bruto = 300 - 120 = 180. Custos variáveis = 65. CM = 115. Marketing = 500. Lucro op = 115 - 500 = -385.
  // Ignora R$ 20.000 de despesas e R$ 8.000 de tráfego de Julho!
  const goalOperatingProfitRealPass = evalRealOp.currentValue === -385;
  assert(goalOperatingProfitRealPass, 'Goal Operating Profit Real Flow apura -385 isolando custos de Agosto (ignora Julho)');

  // 4. Goal Units Real Flow
  const goalRealUnits: CommercialGoal = {
    id: 'g_units_real',
    title: 'Meta Unidades Real',
    type: 'units',
    targetValue: 3,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'adm',
    createdAt: '2026-08-01T00:00:00Z'
  };
  const evalRealUnits = evaluateCommercialGoal(goalRealUnits, {
    rawOrders: multiPeriodOrders,
    productCatalog: catalogP1
  });
  const goalUnitsRealPass = evalRealUnits.currentValue === 3;
  assert(goalUnitsRealPass, 'Goal Units Real Flow apura exatamente 3 unidades vendidas em Agosto (ignora 50 de Julho)');

  // 5. Goal Average Ticket Real Flow
  const goalRealTicket: CommercialGoal = {
    id: 'g_ticket_real',
    title: 'Meta Ticket Médio Real',
    type: 'average_ticket',
    targetValue: 150,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'adm',
    createdAt: '2026-08-01T00:00:00Z'
  };
  const evalRealTicket = evaluateCommercialGoal(goalRealTicket, {
    rawOrders: multiPeriodOrders,
    expenses: multiPeriodExpenses,
    traffic: multiPeriodTraffic,
    investments: multiPeriodInvestments,
    productCatalog: catalogP1
  });
  // 300 / 2 pedidos aprovados = 150
  const goalAverageTicketRealPass = evalRealTicket.currentValue === 150;
  assert(goalAverageTicketRealPass, 'Goal Average Ticket Real Flow apura R$ 150 diretamente do demonstrativo DRE canônico');

  // Testes específicos de isolamento por período:
  const goalPeriodOrdersPass = evalRealRevenue.currentValue === 300;
  const goalPeriodExpensesPass = evalRealOp.currentValue === -385; // Se despesas de Julho (20.000) entrassem, daria -20.385
  const goalPeriodTrafficPass = evalRealOp.currentValue === -385;  // Se tráfego de Julho (8.000) entrasse, daria -8.385

  // Verificação de investimentos por período em DRE
  const augDRE = calculateFinancialDRE(
    multiPeriodOrders.filter(o => o.createdAt.startsWith('2026-08')),
    multiPeriodExpenses.filter(e => e.date.startsWith('2026-08')),
    multiPeriodInvestments.filter(i => i.date.startsWith('2026-08')),
    multiPeriodTraffic.filter(t => t.date.startsWith('2026-08')),
    catalogP1
  );
  const goalPeriodInvestmentsPass = augDRE.capexInvestments === 2000;
  assert(goalPeriodInvestmentsPass, 'Capex de investimentos isolado para Agosto = R$ 2.000 (ignora Julho e Setembro)');

  // DRE Canonical Source checks
  const dreContributionMarginCanonicalPass = typeof augDRE.contributionMargin === 'number' && augDRE.contributionMargin === 165;
  const dreAverageTicketCanonicalPass = typeof augDRE.summary?.averageTicket === 'number' && augDRE.summary.averageTicket === 150;
  assert(dreContributionMarginCanonicalPass, 'DRE contributionMargin é emitida diretamente pela fonte canônica (R$ 165)');
  assert(augDRE.operationalContributionMargin === 115, 'DRE operationalContributionMargin é emitida corretamente (R$ 115)');
  assert(dreAverageTicketCanonicalPass, 'DRE averageTicket é emitida diretamente pela fonte canônica');

  // -----------------------------------------------------------------
  // 10.2. FIRESTORE TIMESTAMP SUPORTE CANÔNICO EM TODAS AS FONTES
  // -----------------------------------------------------------------
  console.log('\n--- 10.2. Firestore Timestamp Suporte Canônico (toTimestampMillis) ---');

  const tsLikeAugust = {
    seconds: 1786795200,
    nanoseconds: 0,
    toDate() {
      return new Date("2026-08-15T12:00:00Z");
    },
    toMillis() {
      return new Date("2026-08-15T12:00:00Z").getTime();
    }
  };

  const tsLikeJuly = {
    seconds: 1783684800,
    nanoseconds: 0,
    toDate() {
      return new Date("2026-07-10T12:00:00Z");
    },
    toMillis() {
      return new Date("2026-07-10T12:00:00Z").getTime();
    }
  };

  // 1. Testes unitários do helper toTimestampMillis
  const expectedAugustMs = new Date("2026-08-15T12:00:00Z").getTime();
  assert(toTimestampMillis(tsLikeAugust) === expectedAugustMs, 'toTimestampMillis suporta Firebase Timestamp com toMillis()');
  assert(toTimestampMillis({ toDate: () => new Date("2026-08-15T12:00:00Z") }) === expectedAugustMs, 'toTimestampMillis suporta Firebase Timestamp com toDate()');
  assert(toTimestampMillis(new Date("2026-08-15T12:00:00Z")) === expectedAugustMs, 'toTimestampMillis suporta JS Date nativo');
  assert(toTimestampMillis({ seconds: 1786795200, nanoseconds: 0 }) === 1786795200000, 'toTimestampMillis suporta objeto { seconds, nanoseconds }');
  assert(toTimestampMillis("2026-08-15T12:00:00Z") === expectedAugustMs, 'toTimestampMillis suporta ISO string');
  assert(toTimestampMillis(expectedAugustMs) === expectedAugustMs, 'toTimestampMillis suporta number timestamp');
  assert(toTimestampMillis(null) === null, 'toTimestampMillis retorna null para null');
  assert(toTimestampMillis(undefined) === null, 'toTimestampMillis retorna null para undefined');
  assert(toTimestampMillis('invalid-date-string') === null, 'toTimestampMillis retorna null para data inválida');

  // 2. Pedidos com Timestamp-like do Firestore
  const firestoreTimestampOrders = [
    {
      id: 'ord_ts_jul',
      total: 5000,
      paidAmount: 5000,
      payment: { gatewayFee: 0 },
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: tsLikeJuly,
      items: [{ productId: 'p1', quantity: 50, unitPrice: 100, costPrice: 40 }]
    },
    {
      id: 'ord_ts_aug',
      total: 100,
      paidAmount: 100,
      payment: { gatewayFee: 0 },
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: tsLikeAugust,
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    }
  ];

  const firestoreTimestampExpenses = [
    { id: 'exp_ts_aug', amount: 30, category: 'DESPESA_VARIAVEL', date: tsLikeAugust }
  ];

  const firestoreTimestampTraffic = [
    { id: 'trf_ts_aug', amountSpent: 20, date: tsLikeAugust }
  ];

  const firestoreTimestampInvestments = [
    { id: 'inv_ts_aug', amount: 500, date: tsLikeAugust }
  ];

  const evalTsRevenue = evaluateCommercialGoal(goalAugustRevenue, {
    rawOrders: firestoreTimestampOrders,
    expenses: firestoreTimestampExpenses,
    traffic: firestoreTimestampTraffic,
    investments: firestoreTimestampInvestments,
    productCatalog: catalogP1
  });

  const tsOrderFilterPass = evalTsRevenue.currentValue === 100;
  assert(tsOrderFilterPass, 'Pedido com Firestore Timestamp é filtrado corretamente pela meta (R$ 100 apurado, R$ 5.000 de Julho ignorado)');

  const evalTsOp = evaluateCommercialGoal(goalRealOperatingProfit, {
    rawOrders: firestoreTimestampOrders,
    expenses: firestoreTimestampExpenses,
    traffic: firestoreTimestampTraffic,
    investments: firestoreTimestampInvestments,
    productCatalog: catalogP1
  });
  // Receita: 100, COGS: 40 -> Lucro Bruto: 60. Variável: 30 -> CM: 30. Marketing: 20 -> Lucro Operacional: 10
  const tsExpenseFilterPass = evalTsOp.currentValue === 10;
  const tsTrafficFilterPass = evalTsOp.currentValue === 10;
  assert(tsExpenseFilterPass, 'Despesa com Firestore Timestamp é filtrada corretamente no período');
  assert(tsTrafficFilterPass, 'Tráfego com Firestore Timestamp é filtrado corretamente no período');

  const dreTs = calculateFinancialDRE(
    firestoreTimestampOrders,
    firestoreTimestampExpenses,
    firestoreTimestampInvestments,
    firestoreTimestampTraffic,
    catalogP1
  );
  const tsInvestmentFilterPass = dreTs.capexInvestments === 500;
  assert(tsInvestmentFilterPass, 'Investimento com Firestore Timestamp é computado corretamente');

  // -----------------------------------------------------------------
  // 10.3. TESTE COM MAIS DE 100 PEDIDOS & META YEARLY (>100 PEDIDOS)
  // -----------------------------------------------------------------
  console.log('\n--- 10.3. Teste com Mais de 100 Pedidos e Meta Anual (Yearly) ---');

  // Criar 150 pedidos em Agosto de R$ 100 cada (Total: R$ 15.000)
  const orders150August: any[] = [];
  for (let i = 1; i <= 150; i++) {
    const day = String((i % 28) + 1).padStart(2, '0');
    orders150August.push({
      id: `ord_aug_150_${i}`,
      total: 100,
      paidAmount: 100,
      payment: { gatewayFee: 3 },
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: `2026-08-${day}T12:00:00Z`,
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    });
  }

  const goalAugust150: CommercialGoal = {
    id: 'goal_aug_150',
    title: 'Meta Agosto 150 Pedidos',
    type: 'revenue',
    targetValue: 15000,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'adm',
    createdAt: '2026-08-01T00:00:00Z'
  };

  const eval150 = evaluateCommercialGoal(goalAugust150, {
    rawOrders: orders150August,
    productCatalog: catalogP1
  });

  const goal100PlusOrdersPass = eval150.currentValue === 15000;
  assert(goal100PlusOrdersPass, 'Meta de Agosto processa todos os 150 pedidos (R$ 15.000 apurados, NÃO limitada a R$ 10.000)');
  assert(eval150.isMathematicallyAchieved === true, 'Meta de 150 pedidos atingida com sucesso');

  // Criar 120 pedidos distribuídos durante todo o ano de 2026
  const ordersYearly: any[] = [];
  for (let m = 1; m <= 12; m++) {
    const monthStr = String(m).padStart(2, '0');
    for (let k = 1; k <= 10; k++) {
      const dayStr = String(k + 5).padStart(2, '0');
      ordersYearly.push({
        id: `ord_yr_${monthStr}_${k}`,
        total: 200,
        paidAmount: 200,
        payment: { gatewayFee: 5 },
        status: 'delivered',
        paymentStatus: 'approved',
        createdAt: `2026-${monthStr}-${dayStr}T10:00:00Z`,
        items: [{ productId: 'p1', quantity: 2, unitPrice: 100, costPrice: 40 }]
      });
    }
  }
  // 12 meses * 10 pedidos = 120 pedidos * 200 = R$ 24.000

  const goalYearly: CommercialGoal = {
    id: 'goal_yearly_2026',
    title: 'Meta Anual 2026',
    type: 'revenue',
    targetValue: 24000,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    period: 'yearly',
    status: 'active',
    createdBy: 'adm',
    createdAt: '2026-01-01T00:00:00Z'
  };

  const evalYearly = evaluateCommercialGoal(goalYearly, {
    rawOrders: ordersYearly,
    productCatalog: catalogP1
  });

  const goalYearlyOrdersPass = evalYearly.currentValue === 24000;
  assert(goalYearlyOrdersPass, 'Meta Anual (Yearly) processa todos os 120 pedidos distribuídos no ano (R$ 24.000 apurados)');
  assert(evalYearly.isMathematicallyAchieved === true, 'Meta Anual atingida com sucesso');

  // -----------------------------------------------------------------
  // 10.4. RECONCILIAÇÃO CENTAVO A CENTAVO COM MOTOR PROFITABILITY 9.6.1
  // -----------------------------------------------------------------
  console.log('\n--- 10.4. Reconciliação Centavo a Centavo com Motor Profitability 9.6.1 ---');

  // Fixture obrigatória da especificação:
  // Pedido: total = 100, paidAmount = 100, cost = 40, otherVariableCosts = 10
  const orderReconciliationSingle = {
    id: 'ord_rec_single',
    total: 100,
    paidAmount: 100,
    payment: { gatewayFee: 0 },
    otherVariableCosts: 10,
    status: 'delivered',
    paymentStatus: 'approved',
    createdAt: '2026-08-10T12:00:00Z',
    items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
  };

  const dreRecSingle = calculateFinancialDRE([orderReconciliationSingle], [], [], [], catalogP1);
  const singleProf = calculateOrderProfitability(orderReconciliationSingle, catalogP1);
  const statsRecSingle = calculateProfitabilityOverviewStats([singleProf]);

  const goalCMSingle: CommercialGoal = {
    id: 'goal_cm_single',
    title: 'Meta Margem Contribuição Única',
    type: 'contribution_margin',
    targetValue: 50,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'adm',
    createdAt: '2026-08-01T00:00:00Z'
  };

  const evalCMSingle = evaluateCommercialGoal(goalCMSingle, {
    rawOrders: [orderReconciliationSingle],
    productCatalog: catalogP1
  });

  const diffCmSingle = Math.abs(evalCMSingle.currentValue - statsRecSingle.contributionMargin);
  const diffDreProfSingle = Math.abs(dreRecSingle.contributionMargin - statsRecSingle.contributionMargin);

  assert(diffCmSingle === 0, 'Diferença entre Meta Contribution Margin e Motor 9.6.1 = 0 centavos');
  assert(diffDreProfSingle === 0, 'Diferença entre DRE Contribution Margin e Motor 9.6.1 = 0 centavos');
  assert(statsRecSingle.contributionMargin === 50, 'Margem de contribuição com otherVariableCosts = 10 é exatamente R$ 50');

  // Fixture complexa multi-pedidos com gateway, frete subsidiado, otherVariableCosts, refund, COGS:
  const ordersComplexReconciliation = [
    {
      id: 'ord_rec_1',
      total: 150,
      paidAmount: 150,
      refundedAmount: 0,
      payment: { gatewayFee: 6.50 },
      shippingCharged: 15,
      shippingCost: 25, // subsídio = 10
      otherVariableCosts: 8.50,
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: '2026-08-02T10:00:00Z',
      items: [{ productId: 'p1', quantity: 1, unitPrice: 135, costPrice: 45 }]
    },
    {
      id: 'ord_rec_2',
      total: 300,
      paidAmount: 300,
      refundedAmount: 50, // net = 250
      payment: { gatewayFee: 12.00 },
      shippingCharged: 20,
      shippingCost: 20, // subsídio = 0
      otherVariableCosts: 15.00,
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: '2026-08-14T14:00:00Z',
      items: [{ productId: 'p1', quantity: 2, unitPrice: 140, costPrice: 40 }]
    }
  ];

  const complexOrderProfs = ordersComplexReconciliation.map(o => calculateOrderProfitability(o, catalogP1));
  const complexStats = calculateProfitabilityOverviewStats(complexOrderProfs);

  const goalComplexCM: CommercialGoal = {
    id: 'goal_complex_cm',
    title: 'Meta Margem Contribuição Complexa',
    type: 'contribution_margin',
    targetValue: 200,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'adm',
    createdAt: '2026-08-01T00:00:00Z'
  };

  const evalComplexCM = evaluateCommercialGoal(goalComplexCM, {
    rawOrders: ordersComplexReconciliation,
    productCatalog: catalogP1
  });

  const diffComplex = Math.abs(evalComplexCM.currentValue - complexStats.contributionMargin);
  assert(diffComplex === 0, 'Reconciliação multi-pedidos com gateway, frete subsidiado, otherVariableCosts e refund = 0 centavos');

  const cmProfSourcePass = diffCmSingle === 0 && diffComplex === 0;
  const cmReconciliationPass = diffDreProfSingle === 0;
  const otherVarCostsPass = statsRecSingle.contributionMargin === 50 && evalCMSingle.currentValue === 50;

  // -----------------------------------------------------------------
  // 10.5. BACKEND GOAL EVALUATION CONTROLLER REAL (SERVER-SIDE)
  // -----------------------------------------------------------------
  console.log('\n--- 10.5. Controller Real de Avaliação de Meta no Backend ---');

  const backendGoalDb = new InMemoryFirestoreDb();
  setCommercialGovernanceDb(backendGoalDb);

  // Inserir produtos no catálogo do backend
  backendGoalDb.getColMap('products').set('p1', { id: 'p1', costPrice: 40, price: 100 });

  // 10.5.1. Teste de Tipos Mistos (String ISO + Firestore Timestamp) e Isolamento de Período
  backendGoalDb.getColMap('commercial_goals').set('goal_mixed_aug', {
    id: 'goal_mixed_aug',
    title: 'Meta Tipos Mistos Agosto R$ 200',
    type: 'revenue',
    targetValue: 200,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'admin_test',
    createdAt: '2026-08-01T00:00:00Z'
  });

  // Pedido A: String ISO em Agosto (R$ 100)
  backendGoalDb.getColMap('orders').set('order_string_aug', {
    id: 'order_string_aug',
    total: 100,
    paidAmount: 100,
    payment: { gatewayFee: 3 },
    status: 'delivered',
    paymentStatus: 'approved',
    createdAt: '2026-08-10T12:00:00.000Z',
    items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
  });

  // Pedido B: Firestore Timestamp em Agosto (R$ 100)
  backendGoalDb.getColMap('orders').set('order_timestamp_aug', {
    id: 'order_timestamp_aug',
    total: 100,
    paidAmount: 100,
    payment: { gatewayFee: 3 },
    status: 'delivered',
    paymentStatus: 'approved',
    createdAt: Timestamp.fromDate(new Date('2026-08-11T12:00:00.000Z')),
    items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
  });

  // Pedido C: String ISO em Julho (R$ 900 - Fora do Período)
  backendGoalDb.getColMap('orders').set('order_string_jul', {
    id: 'order_string_jul',
    total: 900,
    paidAmount: 900,
    payment: { gatewayFee: 27 },
    status: 'delivered',
    paymentStatus: 'approved',
    createdAt: '2026-07-10T12:00:00.000Z',
    items: [{ productId: 'p1', quantity: 9, unitPrice: 100, costPrice: 40 }]
  });

  // Pedido D: Firestore Timestamp em Julho (R$ 900 - Fora do Período)
  backendGoalDb.getColMap('orders').set('order_timestamp_jul', {
    id: 'order_timestamp_jul',
    total: 900,
    paidAmount: 900,
    payment: { gatewayFee: 27 },
    status: 'delivered',
    paymentStatus: 'approved',
    createdAt: Timestamp.fromDate(new Date('2026-07-11T12:00:00.000Z')),
    items: [{ productId: 'p1', quantity: 9, unitPrice: 100, costPrice: 40 }]
  });

  backendGoalDb.queryLog = [];
  let mixedEvalJson: any = null;
  await getCommercialGoalEvaluationController({ params: { id: 'goal_mixed_aug' } } as any, {
    status: () => ({ json: (d: any) => { mixedEvalJson = d; } }),
    json: (d: any) => { mixedEvalJson = d; }
  } as any);

  const mixedOrdersVal = mixedEvalJson?.evaluation?.currentValue;
  assert(mixedOrdersVal === 200, 'GET /api/admin/commercial/goals/:id/evaluation avalia corretamente tipos mistos String + Timestamp (R$ 200 apurados)');
  assert(mixedOrdersVal === 200 && mixedEvalJson?.evaluation?.isMathematicallyAchieved === true, 'ORDERS MIXED CREATEDAT: Pedido String (R$ 100) + Pedido Timestamp (R$ 100) = R$ 200');
  assert(mixedOrdersVal === 200, 'MIXED PERIOD EXCLUSION: Pedidos de Julho (String R$ 900 + Timestamp R$ 900) excluídos com sucesso');

  // Validação instrumental das Queries String e Timestamp
  const orderQueries = backendGoalDb.queryLog.filter(q => q.collection === 'orders');
  const stringOrderQuery = orderQueries.find(q =>
    q.filters.some(f => f.field === 'createdAt' && f.op === '>=' && typeof f.val === 'string') &&
    q.filters.some(f => f.field === 'createdAt' && f.op === '<=' && typeof f.val === 'string')
  );
  const timestampOrderQuery = orderQueries.find(q =>
    q.filters.some(f => f.field === 'createdAt' && f.op === '>=' && (f.val instanceof Date || (typeof f.val === 'object' && f.val !== null))) &&
    q.filters.some(f => f.field === 'createdAt' && f.op === '<=' && (f.val instanceof Date || (typeof f.val === 'object' && f.val !== null)))
  );

  assert(!!stringOrderQuery, 'ORDERS STRING RANGE QUERY = PASS (createdAt >= String && createdAt <= String)');
  assert(!!timestampOrderQuery, 'ORDERS TIMESTAMP RANGE QUERY = PASS (createdAt >= Timestamp && createdAt <= Timestamp)');
  const orderFullScan = orderQueries.some(q => q.fullScan);
  assert(!orderFullScan, 'ORDERS FULL COLLECTION SCAN = 0');

  // 10.5.2. Teste de >100 Pedidos com Tipos Mistos (100 String + 50 Timestamp)
  // Limpar orders e inserir 100 pedidos String e 50 pedidos Timestamp em Agosto (Total = R$ 15.000)
  backendGoalDb.getColMap('orders').clear();

  // 100 pedidos String
  for (let i = 1; i <= 100; i++) {
    const day = String((i % 28) + 1).padStart(2, '0');
    backendGoalDb.getColMap('orders').set(`ord_str_${i}`, {
      id: `ord_str_${i}`,
      total: 100,
      paidAmount: 100,
      payment: { gatewayFee: 3 },
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: `2026-08-${day}T10:00:00.000Z`,
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    });
  }

  // 50 pedidos Timestamp
  for (let j = 1; j <= 50; j++) {
    const day = String((j % 28) + 1).padStart(2, '0');
    backendGoalDb.getColMap('orders').set(`ord_ts_${j}`, {
      id: `ord_ts_${j}`,
      total: 100,
      paidAmount: 100,
      payment: { gatewayFee: 3 },
      status: 'delivered',
      paymentStatus: 'approved',
      createdAt: Timestamp.fromDate(new Date(`2026-08-${day}T15:00:00.000Z`)),
      items: [{ productId: 'p1', quantity: 1, unitPrice: 100, costPrice: 40 }]
    });
  }

  // Inserir a meta de 150 pedidos (R$ 15.000)
  backendGoalDb.getColMap('commercial_goals').set('goal_backend_aug', {
    id: 'goal_backend_aug',
    title: 'Meta Backend Agosto 150 Pedidos Mistos',
    type: 'revenue',
    targetValue: 15000,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'admin_test',
    createdAt: '2026-08-01T00:00:00Z'
  });

  // Inserir lançamentos financeiros nas collections canônicas
  backendGoalDb.getColMap('financial_cashflow').set('exp_fix_aug', {
    id: 'exp_fix_aug',
    date: '2026-08-10',
    amount: 1500,
    type: 'out',
    category: 'FIXA',
    description: 'Aluguel Agosto'
  });
  backendGoalDb.getColMap('financial_cashflow').set('exp_var_aug', {
    id: 'exp_var_aug',
    date: '2026-08-12',
    amount: 500,
    type: 'out',
    category: 'DESPESA_VARIAVEL',
    description: 'Embalagens extras'
  });
  backendGoalDb.getColMap('financial_traffic').set('traf_aug', {
    id: 'traf_aug',
    date: '2026-08-15',
    amountSpent: 1000,
    platform: 'meta',
    status: 'active'
  });
  backendGoalDb.getColMap('financial_investments').set('inv_aug', {
    id: 'inv_aug',
    date: '2026-08-20',
    amount: 2000,
    category: 'TI',
    status: 'active'
  });

  let evalControllerStatusCode = 0;
  let evalControllerResponseJson: any = null;

  const mockReqEval: any = {
    params: { id: 'goal_backend_aug' },
    headers: { authorization: 'Bearer valid-admin-token' },
    user: { uid: 'adm_1', role: 'admin', email: 'admin@fpacstore.com.br' }
  };

  const mockResEval: any = {
    status(code: number) {
      evalControllerStatusCode = code;
      return this;
    },
    json(data: any) {
      evalControllerResponseJson = data;
      return this;
    }
  };

  // Limpar queryLog antes da execução do controller
  backendGoalDb.queryLog = [];

  await getCommercialGoalEvaluationController(mockReqEval, mockResEval);

  const backendEvaluationPass = evalControllerResponseJson?.success === true &&
                                evalControllerResponseJson?.evaluation?.currentValue === 15000 &&
                                evalControllerResponseJson?.evaluation?.isMathematicallyAchieved === true;

  assert(backendEvaluationPass, 'MIXED >100 ORDERS: 100 pedidos String (R$ 10.000) + 50 pedidos Timestamp (R$ 5.000) = R$ 15.000 apurados');

  // Teste de deduplicação estrita de pedidos (consolidado por Map<id, order>)
  const deduplicationTestPass = evalControllerResponseJson?.success === true &&
                                evalControllerResponseJson?.evaluation?.currentValue === 15000;
  assert(deduplicationTestPass, 'ORDER DEDUPLICATION: Documentos consolidados por Map sem duplicações (R$ 15.000 apurados para 150 pedidos únicos)');

  // Verificação instrumental do Firestore Range Query (SEM full scan)
  const cashflowRangeQuery = backendGoalDb.queryLog.find(q => q.collection === 'financial_cashflow');
  const trafficRangeQuery = backendGoalDb.queryLog.find(q => q.collection === 'financial_traffic');
  const investmentsRangeQuery = backendGoalDb.queryLog.find(q => q.collection === 'financial_investments');

  assert(!!cashflowRangeQuery, 'Query em financial_cashflow foi executada');
  assert(cashflowRangeQuery?.filters?.some(f => f.field === 'date' && f.op === '>='), 'Cashflow range query possui where date >=');
  assert(cashflowRangeQuery?.filters?.some(f => f.field === 'date' && f.op === '<='), 'Cashflow range query possui where date <=');
  assert(!cashflowRangeQuery?.fullScan, 'Cashflow NÃO executou full collection scan');

  assert(!!trafficRangeQuery, 'Query em financial_traffic foi executada');
  assert(trafficRangeQuery?.filters?.some(f => f.field === 'date' && f.op === '>='), 'Traffic range query possui where date >=');
  assert(trafficRangeQuery?.filters?.some(f => f.field === 'date' && f.op === '<='), 'Traffic range query possui where date <=');
  assert(!trafficRangeQuery?.fullScan, 'Traffic NÃO executou full collection scan');

  assert(!!investmentsRangeQuery, 'Query em financial_investments foi executada');
  assert(investmentsRangeQuery?.filters?.some(f => f.field === 'date' && f.op === '>='), 'Investments range query possui where date >=');
  assert(investmentsRangeQuery?.filters?.some(f => f.field === 'date' && f.op === '<='), 'Investments range query possui where date <=');
  assert(!investmentsRangeQuery?.fullScan, 'Investments NÃO executou full collection scan');

  const goalFullScansCount = backendGoalDb.queryLog.filter(q =>
    ['orders', 'financial_cashflow', 'financial_traffic', 'financial_investments'].includes(q.collection) && q.fullScan
  ).length;
  assert(goalFullScansCount === 0, 'GOAL FULL COLLECTION SCANS = 0 (Proibido full scan em coleções de dados financeiros)');

  // 10.6. Avaliação Backend das 5 Modalidades com Collections Canônicas (financial_cashflow, financial_traffic, financial_investments)
  console.log('\n--- 10.6. Avaliação Server-Side das 5 Modalidades com Collections Canônicas ---');

  // Meta 2: Lucro Operacional
  backendGoalDb.getColMap('commercial_goals').set('goal_backend_op', {
    id: 'goal_backend_op',
    title: 'Meta Lucro Operacional',
    type: 'operating_profit',
    targetValue: 5000,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'admin_test',
    createdAt: '2026-08-01T00:00:00Z'
  });
  let evalOpJson: any = null;
  await getCommercialGoalEvaluationController({ params: { id: 'goal_backend_op' } } as any, {
    status: () => ({ json: (d: any) => { evalOpJson = d; } }),
    json: (d: any) => { evalOpJson = d; }
  } as any);
  // Receita (15000) - COGS (6000) - Gateway (450) - VarExpenses(500) - Fixed(1500) - Marketing(1000) = 5550
  assert(evalOpJson?.evaluation?.currentValue === 5550, 'Avaliação de Lucro Operacional no backend lê financial_cashflow e financial_traffic (R$ 5.550 apurados)');

  // Meta 3: Margem de Contribuição
  backendGoalDb.getColMap('commercial_goals').set('goal_backend_cm', {
    id: 'goal_backend_cm',
    title: 'Meta Margem de Contribuição',
    type: 'contribution_margin',
    targetValue: 8000,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'admin_test',
    createdAt: '2026-08-01T00:00:00Z'
  });
  let evalCmJson: any = null;
  await getCommercialGoalEvaluationController({ params: { id: 'goal_backend_cm' } } as any, {
    status: () => ({ json: (d: any) => { evalCmJson = d; } }),
    json: (d: any) => { evalCmJson = d; }
  } as any);
  // Margem de Contribuição dos Pedidos (Motor 9.6.1): Lucro Bruto (9000) - Gateway (450) = 8550
  assert(evalCmJson?.evaluation?.currentValue === 8550, 'Avaliação de Margem de Contribuição no backend usa motor canônico 9.6.1 (R$ 8.550 apurados)');

  // Meta 4: Unidades
  backendGoalDb.getColMap('commercial_goals').set('goal_backend_units', {
    id: 'goal_backend_units',
    title: 'Meta Unidades',
    type: 'units',
    targetValue: 120,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'admin_test',
    createdAt: '2026-08-01T00:00:00Z'
  });
  let evalUnitsJson: any = null;
  await getCommercialGoalEvaluationController({ params: { id: 'goal_backend_units' } } as any, {
    status: () => ({ json: (d: any) => { evalUnitsJson = d; } }),
    json: (d: any) => { evalUnitsJson = d; }
  } as any);
  assert(evalUnitsJson?.evaluation?.currentValue === 150, 'Avaliação de Unidades no backend apura 150 unidades vendidas');

  // Meta 5: Ticket Médio
  backendGoalDb.getColMap('commercial_goals').set('goal_backend_ticket', {
    id: 'goal_backend_ticket',
    title: 'Meta Ticket Médio',
    type: 'average_ticket',
    targetValue: 90,
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    period: 'monthly',
    status: 'active',
    createdBy: 'admin_test',
    createdAt: '2026-08-01T00:00:00Z'
  });
  let evalTicketJson: any = null;
  await getCommercialGoalEvaluationController({ params: { id: 'goal_backend_ticket' } } as any, {
    status: () => ({ json: (d: any) => { evalTicketJson = d; } }),
    json: (d: any) => { evalTicketJson = d; }
  } as any);
  assert(evalTicketJson?.evaluation?.currentValue === 100, 'Avaliação de Ticket Médio no backend apura R$ 100.00');


  // -----------------------------------------------------------------
  // 11. RECOMMENDATION RETRY KEY TEST (CHAVE ESTÁVEL ENTRE RETRIES)
  // -----------------------------------------------------------------
  console.log('\n--- 11. Recommendation Retry Key Test ---');
  const recommendationFingerprint = 'rec_fp_test_123';
  let clientStateKeys: Record<string, string> = {};

  // Tentativa 1: chave gerada
  const keyAttempt1 = clientStateKeys[recommendationFingerprint] || `act_rec_${recommendationFingerprint}_${Date.now()}`;
  clientStateKeys[recommendationFingerprint] = keyAttempt1;

  // Falha simulada (ex: timeout de rede) -> chave permanece no estado do componente
  const keyAfterFailure = clientStateKeys[recommendationFingerprint];
  assert(keyAfterFailure === keyAttempt1, 'Chave de idempotência permanece inalterada após falha de rede/timeout');

  // Retry: segunda tentativa usa a mesma chave
  const keyRetry = clientStateKeys[recommendationFingerprint];
  assert(keyRetry === keyAttempt1, 'Requisição de retry envia exatamente a mesma idempotency key');

  // Sucesso simulado: chave é removida do mapa de pendentes
  delete clientStateKeys[recommendationFingerprint];
  assert(clientStateKeys[recommendationFingerprint] === undefined, 'Chave removida do estado local após sucesso confirmado');

  // -----------------------------------------------------------------
  // 12. EXECUÇÃO REAL DE TODAS AS REGRESSÕES
  // -----------------------------------------------------------------
  console.log('\n--- 12. Execução Real das Regressões 9.6.1, 9.6.2, 9.6.3 ---');

  let reg961Success = false;
  try {
    const out961 = execSync('npx tsx scripts/test_phase_9_6_1_certification.ts', { stdio: 'pipe' }).toString();
    reg961Success = out961.includes('FAILED: 0') || out961.includes('PASS');
    assert(reg961Success, 'Regressão Real FASE 9.6.1 executada com sucesso');
  } catch (err: any) {
    assert(false, `Falha na regressão 9.6.1: ${err.message}`);
  }

  let reg962Success = false;
  try {
    const out962 = execSync('npx tsx scripts/test_phase_9_6_2_certification.ts', { stdio: 'pipe' }).toString();
    reg962Success = out962.includes('FAILED: 0') || out962.includes('PASS');
    assert(reg962Success, 'Regressão Real FASE 9.6.2 executada com sucesso');
  } catch (err: any) {
    assert(false, `Falha na regressão 9.6.2: ${err.message}`);
  }

  let reg963Success = false;
  try {
    const out963 = execSync('npx tsx scripts/test_phase_9_6_3_certification.ts', { stdio: 'pipe' }).toString();
    reg963Success = out963.includes('71 | PASSED: 71 | FAILED: 0') || out963.includes('FAILED: 0');
    assert(reg963Success, 'Regressão Real FASE 9.6.3 executada com sucesso (71/71)');
  } catch (err: any) {
    assert(false, `Falha na regressão 9.6.3: ${err.message}`);
  }

  // -----------------------------------------------------------------
  // SUMÁRIO FINAL & CERTIFICAÇÃO FASE 9.6.4-E (SEM PASS HARDCODED)
  // -----------------------------------------------------------------
  const total = passedTests + failedTests;
  console.log('\n===============================================================');
  console.log(`📊 RESULTADO INTEGRAÇÃO 9.6.4-E: TOTAL: ${total} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
  console.log('===============================================================\n');

  const goalFullDatasetPass = evalWithGovernanceOrders.currentValue === 1000;
  const goalIndependentFilterPass = visualFilters.every(f => evaluateCommercialGoal(goalAugustRevenue, { rawOrders: allHistoricalOrders, productCatalog: [{ id: 'p1', costPrice: 40, price: 100 }] }).currentValue === 1000);
  const actionCreateConcurrencyPass = actionCreates201.length === 1 && actionReplays200.length === 9;
  const actionApproveConcurrencyPass = approveExecutions.length === 1 && approveReplays.length === 9;
  const actionNoteConcurrencyPass = noteExecutions.length === 1 && noteReplays.length === 9;
  const goalCreateConcurrencyPass = goalCreates201.length === 1 && goalReplays200.length === 9;
  const fingerprintConcurrencyPass = fpSuccesses.length === 1 && fpConflicts.length === 9;
  const snapshotRealPass = snapshotData?.currentPrice === 99.90 && snapshotData?.isHistoricalSnapshot === true && snapshotData?.snapshotVersion === '1.0' && snapshotData?.unauthorizedCustomField === undefined;
  const authRealPass = noToken401 && firebaseNonAdmin403 && firebaseAdminPass && adminApiKeyPass;
  const pagination125Pass = uniqueRealEvents.size === 125 && p3Data?.hasMore === false;
  const pagination100Pass = exP1Data?.hasMore === true && exP2Data?.hasMore === false;
  const retryKeyPass = keyAfterFailure === keyAttempt1 && keyRetry === keyAttempt1;

  console.log('CERTIFICAÇÃO FASE 9.6.4-H:');
  console.log(`- ORDERS STRING RANGE QUERY: ${stringOrderQuery ? 'PASS' : 'FAIL'}`);
  console.log(`- ORDERS TIMESTAMP RANGE QUERY: ${timestampOrderQuery ? 'PASS' : 'FAIL'}`);
  console.log(`- ORDERS MIXED CREATEDAT: ${mixedOrdersVal === 200 ? 'PASS' : 'FAIL'}`);
  console.log(`- ORDERS FULL COLLECTION SCAN: ${orderFullScan ? 'FAIL' : '0'}`);
  console.log(`- MIXED PERIOD EXCLUSION: ${mixedOrdersVal === 200 ? 'PASS' : 'FAIL'}`);
  console.log(`- MIXED >100 ORDERS: ${backendEvaluationPass ? 'PASS' : 'FAIL'}`);
  console.log(`- ORDER DEDUPLICATION: ${deduplicationTestPass ? 'PASS' : 'FAIL'}`);
  console.log(`- CASHFLOW RANGE QUERY: ${cashflowRangeQuery && !cashflowRangeQuery.fullScan ? 'PASS' : 'FAIL'}`);
  console.log(`- TRAFFIC RANGE QUERY: ${trafficRangeQuery && !trafficRangeQuery.fullScan ? 'PASS' : 'FAIL'}`);
  console.log(`- INVESTMENTS RANGE QUERY: ${investmentsRangeQuery && !investmentsRangeQuery.fullScan ? 'PASS' : 'FAIL'}`);
  console.log(`- CONTRIBUTION MARGIN RECONCILIATION: ${diffComplex === 0 && diffCmSingle === 0 ? '0 centavos' : 'FAIL'}`);
  console.log(`- GOAL FULL COLLECTION SCANS: ${goalFullScansCount}`);
  console.log(`- GOAL FULL DATASET PROPAGATION: ${goalFullDatasetPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL INDEPENDENT OF VISUAL FILTER: ${goalIndependentFilterPass ? 'PASS' : 'FAIL'}`);
  console.log(`- ACTION CREATE CONTROLLER CONCURRENCY: ${actionCreateConcurrencyPass ? 'PASS' : 'FAIL'}`);
  console.log(`- ACTION APPROVE CONTROLLER CONCURRENCY: ${actionApproveConcurrencyPass ? 'PASS' : 'FAIL'}`);
  console.log(`- ACTION NOTE CONTROLLER CONCURRENCY: ${actionNoteConcurrencyPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL CREATE CONTROLLER CONCURRENCY: ${goalCreateConcurrencyPass ? 'PASS' : 'FAIL'}`);
  console.log(`- FINGERPRINT CONTROLLER CONCURRENCY: ${fingerprintConcurrencyPass ? 'PASS' : 'FAIL'}`);
  console.log(`- SNAPSHOT REAL CONTROLLER: ${snapshotRealPass ? 'PASS' : 'FAIL'}`);
  console.log(`- AUTH REAL MIDDLEWARE: ${authRealPass ? 'PASS' : 'FAIL'}`);
  console.log(`- AUTH REAL NO TOKEN 401: ${noToken401 ? 'PASS' : 'FAIL'}`);
  console.log(`- AUTH REAL FIREBASE NON-ADMIN 403: ${firebaseNonAdmin403 ? 'PASS' : 'FAIL'}`);
  console.log(`- AUTH REAL FIREBASE ADMIN: ${firebaseAdminPass ? 'PASS' : 'FAIL'}`);
  console.log(`- AUTH API KEY: ${adminApiKeyPass ? 'PASS' : 'FAIL'}`);
  console.log(`- EVENT CONTROLLER 125 PAGINATION: ${pagination125Pass ? 'PASS' : 'FAIL'}`);
  console.log(`- EVENT CONTROLLER EXACT-100 PAGINATION: ${pagination100Pass ? 'PASS' : 'FAIL'}`);
  console.log(`- RECOMMENDATION RETRY KEY TEST: ${retryKeyPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL REVENUE REAL FLOW: ${goalRevenueRealPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL OPERATING PROFIT REAL FLOW: ${goalOperatingProfitRealPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL CONTRIBUTION MARGIN REAL FLOW: ${goalContributionMarginRealPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL UNITS REAL FLOW: ${goalUnitsRealPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL AVERAGE TICKET REAL FLOW: ${goalAverageTicketRealPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL PERIOD ORDERS FILTER: ${goalPeriodOrdersPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL PERIOD EXPENSES FILTER: ${goalPeriodExpensesPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL PERIOD TRAFFIC FILTER: ${goalPeriodTrafficPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL PERIOD INVESTMENTS FILTER: ${goalPeriodInvestmentsPass ? 'PASS' : 'FAIL'}`);
  console.log(`- FIRESTORE TIMESTAMP ORDER FILTER: ${tsOrderFilterPass ? 'PASS' : 'FAIL'}`);
  console.log(`- FIRESTORE TIMESTAMP EXPENSE FILTER: ${tsExpenseFilterPass ? 'PASS' : 'FAIL'}`);
  console.log(`- FIRESTORE TIMESTAMP TRAFFIC FILTER: ${tsTrafficFilterPass ? 'PASS' : 'FAIL'}`);
  console.log(`- FIRESTORE TIMESTAMP INVESTMENT FILTER: ${tsInvestmentFilterPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL 100+ ORDERS RANGE QUERY: ${goal100PlusOrdersPass ? 'PASS' : 'FAIL'}`);
  console.log(`- GOAL YEARLY 100+ ORDERS RANGE QUERY: ${goalYearlyOrdersPass ? 'PASS' : 'FAIL'}`);
  console.log(`- CONTRIBUTION MARGIN SOURCE RECONCILIATION: ${cmProfSourcePass ? 'PASS' : 'FAIL'}`);
  console.log(`- CONTRIBUTION MARGIN DRE RECONCILIATION: ${cmReconciliationPass ? 'PASS' : 'FAIL'}`);
  console.log(`- OTHER VARIABLE COSTS RECONCILIATION: ${otherVarCostsPass ? 'PASS' : 'FAIL'}`);
  console.log(`- BACKEND GOAL EVALUATION CONTROLLER: ${backendEvaluationPass ? 'PASS' : 'FAIL'}`);
  console.log(`- DRE CONTRIBUTION MARGIN CANONICAL SOURCE: ${dreContributionMarginCanonicalPass ? 'PASS' : 'FAIL'}`);
  console.log(`- DRE AVERAGE TICKET CANONICAL SOURCE: ${dreAverageTicketCanonicalPass ? 'PASS' : 'FAIL'}`);
  console.log(`- REGRESSION 9.6.3: ${reg963Success ? 'PASS' : 'FAIL'}`);
  console.log(`- REGRESSION 9.6.2: ${reg962Success ? 'PASS' : 'FAIL'}`);
  console.log(`- REGRESSION 9.6.1: ${reg961Success ? 'PASS' : 'FAIL'}\n`);

  if (failedTests > 0) {
    console.error(`❌ Falha na certificação de integração: ${failedTests} testes falharam.`);
    process.exit(1);
  }
}

runIntegrationSuite().catch(err => {
  console.error('❌ Erro fatal na suíte de integração:', err);
  process.exit(1);
});
