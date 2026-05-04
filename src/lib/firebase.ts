import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfigJSON from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigJSON.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigJSON.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJSON.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigJSON.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJSON.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigJSON.appId,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || firebaseConfigJSON.firestoreDatabaseId || '(default)'
};

// Safe initialization
const isConfigValid = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'placeholder');

if (!isConfigValid) {
  console.error("❌ Configuração do Firebase inválida ou ausente. O site pode não funcionar corretamente até que as chaves sejam adicionadas nas configurações do site (VITE_FIREBASE_API_KEY, etc).");
}

// If config is missing, we use a dummy one to prevent early crashes during build/boot
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
    })
  : getFirestore(app); 

export const auth = getAuth(app);
export { app };
