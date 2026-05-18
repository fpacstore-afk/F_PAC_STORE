
import admin from "firebase-admin";
import path from "path";
import fs from "fs";

let db: admin.firestore.Firestore;

export function initFirebase() {
  if (db) return db;

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

    db = admin.firestore();
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
