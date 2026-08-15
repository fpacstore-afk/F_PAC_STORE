
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

let db: any;

export function createInMemoryDb() {
  const store = new Map<string, Map<string, any>>();

  if (admin.firestore && admin.firestore.FieldValue) {
    admin.firestore.FieldValue.arrayUnion = (...elements: any[]) => ({ __isArrayUnion: true, elements } as any);
    admin.firestore.FieldValue.arrayRemove = (...elements: any[]) => ({ __isArrayRemove: true, elements } as any);
    admin.firestore.FieldValue.serverTimestamp = () => new Date().toISOString() as any;
    admin.firestore.FieldValue.increment = (n: number) => ({ __isIncrement: true, operand: n } as any);
  }

  function getCol(colName: string): Map<string, any> {
    if (!store.has(colName)) store.set(colName, new Map());
    return store.get(colName)!;
  }

  function getPathValue(obj: any, pathStr: string): any {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = pathStr.split('.');
    let current = obj;
    for (const part of parts) {
      if (!current || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }

  function resolveValue(existingVal: any, val: any): any {
    if (val && typeof val === 'object') {
      if (val.__isArrayUnion || Array.isArray(val.elements) || Array.isArray(val._elements)) {
        const elems = val.elements || val._elements || [];
        const currentArr = Array.isArray(existingVal) ? existingVal : [];
        return [...currentArr, ...elems];
      }
      if (val.__isArrayRemove) {
        const elems = val.elements || [];
        const currentArr = Array.isArray(existingVal) ? existingVal : [];
        return currentArr.filter(item => !elems.some(e => JSON.stringify(e) === JSON.stringify(item)));
      }
      if (val.__isIncrement) {
        const currentNum = typeof existingVal === 'number' ? existingVal : 0;
        return currentNum + val.operand;
      }
    }
    return val;
  }

  function applyDotNotationUpdate(target: any, update: any) {
    const res = JSON.parse(JSON.stringify(target || {}));
    for (const [key, value] of Object.entries(update || {})) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let current = res;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
            current[parts[i]] = {};
          }
          current = current[parts[i]];
        }
        const lastPart = parts[parts.length - 1];
        current[lastPart] = resolveValue(current[lastPart], value);
      } else {
        res[key] = resolveValue(res[key], value);
      }
    }
    return res;
  }

  class MockDocRef {
    constructor(public colName: string, public id: string) {}

    async get() {
      const col = getCol(this.colName);
      const data = col.get(this.id);
      return {
        exists: data !== undefined,
        id: this.id,
        data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
        ref: this
      };
    }

    async set(data: any, options?: { merge?: boolean }) {
      const col = getCol(this.colName);
      if (options?.merge && col.has(this.id)) {
        const existing = col.get(this.id) || {};
        const updated = applyDotNotationUpdate(existing, data);
        col.set(this.id, updated);
      } else {
        const updated = applyDotNotationUpdate({}, data);
        col.set(this.id, updated);
      }
    }

    async update(data: any) {
      const col = getCol(this.colName);
      const existing = col.get(this.id) || {};
      const updated = applyDotNotationUpdate(existing, data);
      col.set(this.id, updated);
    }

    async delete() {
      const col = getCol(this.colName);
      col.delete(this.id);
    }
  }

  class MockQuery {
    private limitNum?: number;
    constructor(public colName: string, public conditions: Array<{ field: string; op: string; val: any }> = []) {}

    where(field: string, op: string, val: any) {
      return new MockQuery(this.colName, [...this.conditions, { field, op, val }]);
    }

    limit(n: number) {
      const q = new MockQuery(this.colName, this.conditions);
      q.limitNum = n;
      return q;
    }

    async get() {
      const col = getCol(this.colName);
      let docs: any[] = [];
      for (const [id, data] of col.entries()) {
        let match = true;
        for (const cond of this.conditions) {
          const fieldVal = cond.field.includes('.') 
            ? getPathValue(data, cond.field)
            : data[cond.field];
          if (cond.op === '==' && fieldVal !== cond.val) match = false;
          if (cond.op === '!=' && fieldVal === cond.val) match = false;
          if (cond.op === 'in' && Array.isArray(cond.val) && !cond.val.includes(fieldVal)) match = false;
        }
        if (match) {
          docs.push({
            exists: true,
            id,
            data: () => JSON.parse(JSON.stringify(data)),
            ref: new MockDocRef(this.colName, id)
          });
        }
      }
      if (this.limitNum !== undefined) {
        docs = docs.slice(0, this.limitNum);
      }
      return {
        empty: docs.length === 0,
        size: docs.length,
        docs
      };
    }
  }

  class MockCollection {
    constructor(public name: string) {}

    doc(id?: string) {
      const docId = id || `auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return new MockDocRef(this.name, docId);
    }

    async add(data: any) {
      const docId = `auto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const ref = new MockDocRef(this.name, docId);
      await ref.set(data);
      return ref;
    }

    where(field: string, op: string, val: any) {
      return new MockQuery(this.name, [{ field, op, val }]);
    }

    async get() {
      return new MockQuery(this.name).get();
    }
  }

  let txChain = Promise.resolve();

  return {
    collection: (name: string) => new MockCollection(name),
    doc: (path: string) => {
      const parts = path.split('/');
      return new MockDocRef(parts[0], parts[1]);
    },
    runTransaction: async (cb: any) => {
      const result = txChain.then(async () => {
        const txn = {
          get: async (ref: any) => ref.get(),
          set: async (ref: any, data: any, opt?: any) => ref.set(data, opt),
          update: async (ref: any, data: any) => ref.update(data),
          delete: async (ref: any) => ref.delete()
        };
        return cb(txn);
      });
      txChain = result.catch(() => {});
      return result;
    }
  };
}

export function initFirebase() {
  if (db) return db;

  if (process.env.USE_MOCK_DB === 'true' || process.env.NODE_ENV === 'test') {
    console.log("ℹ️ [FIREBASE_SERVER] Modo de teste/mock ativado: usando In-Memory Database.");
    if (!admin.apps.length) {
      admin.initializeApp({ projectId: 'fpac-store-test' });
    }
    db = createInMemoryDb();
    return db;
  }

  try {
    console.log("🔥 [FIREBASE] Iniciando serviço...");
    let saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (saRaw) {
      try {
        let saJson = saRaw.trim();
        
        // 1. Localizar o bloco JSON real (ignorar lixo externo tipo aspas de wrapper)
        const firstBrace = saJson.indexOf('{');
        const lastBrace = saJson.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
          saJson = saJson.substring(firstBrace, lastBrace + 1);
        }

        // 2. Corrigir aspas duplas repetidas (comum em copy-paste de planilhas/tabelas)
        saJson = saJson.replace(/""/g, '"');
        
        // 3. Corrigir aspas escapadas se existirem como literais
        saJson = saJson.replace(/\\"/g, '"');

        const serviceAccount = JSON.parse(saJson);
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id
          });
          console.log("✅ [FIREBASE] Inicializado com Service Account.");
        }
      } catch (parseErr: any) {
        console.error("❌ [FIREBASE] Erro ao processar JSON da Service Account:", parseErr.message);
        throw new Error(`Falha crítica no JSON do Firebase: ${parseErr.message}`);
      }
    } else if (!admin.apps.length) {
      console.log("🔍 [FIREBASE] Sem Service Account. Tentando via Project ID...");
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      let fallbackId = undefined;
      
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          fallbackId = config.projectId;
        } catch (e) {
          console.warn("⚠️ [FIREBASE] Não foi possível ler o arquivo de config local.");
        }
      }

      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || fallbackId;
      
      if (!projectId) {
        throw new Error("FIREBASE_PROJECT_ID não encontrado. Configure nos Secrets.");
      }

      admin.initializeApp({ projectId });
      console.log(`✅ [FIREBASE] Inicializado via Project ID: ${projectId}`);
    }

    let dbId: string | undefined = undefined;
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        dbId = config.firestoreDatabaseId;
      } catch (e) {
        console.warn("⚠️ [FIREBASE] Não foi possível ler o arquivo de config local para buscar o banco.");
      }
    }

    const finalDbId = process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID || dbId || "(default)";
    console.log(`ℹ️ [FIREBASE_SERVER] Conectando ao Banco: ${finalDbId}`);

    db = finalDbId && finalDbId !== "(default)" 
      ? getFirestore(admin.apps[0] || undefined, finalDbId) 
      : getFirestore();
    return db;
  } catch (error: any) {
    console.error("🔥 [FIREBASE] Erro crítico de inicialização:", error.message);
    throw error;
  }
}

export const getDb = () => {
  if (!db) {
    db = initFirebase();
  }
  if (!db) {
    throw new Error("Banco de dados não inicializado. Verifique as variáveis de ambiente.");
  }
  return db;
};
