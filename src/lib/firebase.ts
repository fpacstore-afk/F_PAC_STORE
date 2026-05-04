import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Try to load from JSON if available (AI Studio platform standard)
let firebaseConfigJSON: any = {};
try {
  // Using import.meta.glob to optionally load the config file without causing build errors if missing
  const configs = import.meta.glob('../../firebase-applet-config.json', { eager: true, import: 'default' });
  const path = '../../firebase-applet-config.json';
  if (configs[path]) {
    firebaseConfigJSON = configs[path];
  }
} catch (e) {
  // Config missing, will fallback to env vars
}

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
export const storage = getStorage(app);
export { app };
