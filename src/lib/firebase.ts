import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Load from JSON (AI Studio platform standard)
// @ts-ignore - this file might not exist in some environments
import firebaseConfigJSON from '../../firebase-applet-config.json';

const envProjectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const isLegacyPlatformId = envProjectId && envProjectId.startsWith('ais-');

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigJSON.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJSON.authDomain,
  // Prioridade: JSON > Env (a menos que a env seja um ID de produção real inserido pelo usuário)
  projectId: (isLegacyPlatformId ? firebaseConfigJSON.projectId : (envProjectId || firebaseConfigJSON.projectId)),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJSON.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJSON.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigJSON.appId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfigJSON.firestoreDatabaseId || '(default)'
};

// No AI Studio, usamos o ID do banco resolvido dinamicamente das configurações para suportar isolamento por applet.
console.log(`ℹ️ [FIREBASE_CLIENT] Usando Projeto: ${firebaseConfig.projectId}, Banco: ${firebaseConfig.firestoreDatabaseId}`);

// Safe initialization
const isConfigValid = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'placeholder' && !firebaseConfig.apiKey.includes('apiKey'));

if (!isConfigValid) {
  console.warn("⚠️ Configuração do Firebase incompleta. Use as configurações do AI Studio para definir VITE_FIREBASE_API_KEY, etc.");
}

// Effective config with fallback to prevent crashes
const effectiveConfig = isConfigValid ? firebaseConfig : { 
  apiKey: 'placeholder',
  authDomain: 'placeholder',
  projectId: 'placeholder',
  storageBucket: 'placeholder',
  messagingSenderId: 'placeholder',
  appId: 'placeholder'
};

const app = !getApps().length ? initializeApp(effectiveConfig) : getApp();

export const db = isConfigValid 
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    }, firebaseConfig.firestoreDatabaseId) 
  : getFirestore(app); 

export const auth = getAuth(app);
export const storage = getStorage(app);

// Security: Firestore Error Handler
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  const jsonError = JSON.stringify(errInfo);
  console.error('[Security] Firestore Access Denied:', jsonError);
  throw new Error(jsonError);
}

/**
 * Sanitiza objetos recursivamente para o Firestore.
 * Remove campos 'undefined', converte-os para null ou os exclui.
 * Essencial para evitar o erro "Unsupported field value: undefined".
 */
export function sanitizeFirestoreData(data: any): any {
  if (data === undefined) return undefined; // Alterado para undefined para remoção de chaves
  if (data === null) return null;
  
  if (Array.isArray(data)) {
    return data.map(v => sanitizeFirestoreData(v)).filter(v => v !== undefined);
  }
  
  if (typeof data === 'object' && data.constructor === Object) {
    const clean: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const value = sanitizeFirestoreData(data[key]);
        if (value !== undefined) {
          clean[key] = value;
        }
      }
    }
    return clean;
  }
  return data;
}

export { app };
