
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
        } catch (e) {}
      }

      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || fallbackId
      });
    }
    db = admin.firestore();
    return db;
  } catch (error) {
    console.error("🔥 [FIREBASE] Critical Error:", error);
    throw error;
  }
}

export const getDb = () => {
  if (!db) return initFirebase();
  return db;
};
