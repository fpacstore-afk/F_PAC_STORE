
import admin from "firebase-admin";
import path from "path";
import fs from "fs";

let db: admin.firestore.Firestore;

export function initFirebase() {
  if (db) return db;

  try {
    console.log("🔥 [FIREBASE] Initializing Service...");
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: serviceAccount.project_id
        });
      }
    } else if (!admin.apps.length) {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      let fallbackId = undefined;
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          fallbackId = config.projectId;
        } catch (e) {
          console.warn("⚠️ [FIREBASE] Could not read firebase-applet-config.json", e);
        }
      }

      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || fallbackId;
      
      if (!projectId) {
        console.warn("⚠️ [FIREBASE] No Project ID found. Initializing with empty config (will likely fail on first DB access).");
        // We don't throw here to allow the server to start for static serving
        return null as any; 
      }

      admin.initializeApp({ projectId });
    }
    db = admin.firestore();
    return db;
  } catch (error) {
    console.error("🔥 [FIREBASE] Critical Initialization Error:", error);
    // Return null to allow server to start, but subsequent DB calls will fail gracefully if handled
    return null as any;
  }
}

export const getDb = () => {
  if (!db) return initFirebase();
  if (!db) throw new Error("Database not initialized. Check your Firebase environment variables.");
  return db;
};
