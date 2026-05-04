import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Configuration priority: Env Variables > JSON File (if exists)
// Note: We use globalThis to avoid build errors if the JSON file is missing in some environments
let firebaseConfigJSON: any = {};
try {
  // @ts-ignore - This file might not exist in all environments (ignored by git)
  import('../../firebase-applet-config.json').then(module => {
    firebaseConfigJSON = module.default;
  }).catch(() => {
    // Ignore error if file is missing
  });
} catch (e) {
  // Ignore
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)'
};

// Fallback to JSON if env vars are missing (useful for local dev or initial setup)
if (!firebaseConfig.apiKey && firebaseConfigJSON.apiKey) {
  firebaseConfig.apiKey = firebaseConfigJSON.apiKey;
  firebaseConfig.authDomain = firebaseConfigJSON.authDomain;
  firebaseConfig.projectId = firebaseConfigJSON.projectId;
  firebaseConfig.storageBucket = firebaseConfigJSON.storageBucket;
  firebaseConfig.messagingSenderId = firebaseConfigJSON.messagingSenderId;
  firebaseConfig.appId = firebaseConfigJSON.appId;
}

// Safe initialization
const isConfigValid = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'placeholder';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const db = isConfigValid 
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    })
  : getFirestore(app); 

export const auth = getAuth(app);
export { app };
