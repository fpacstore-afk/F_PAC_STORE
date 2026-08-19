import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import { getDb } from "../firebase.js";
import { logger } from "../utils/logger.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email?: string;
    role: string;
  };
}

let customTokenVerifier: ((token: string) => Promise<admin.auth.DecodedIdToken>) | null = null;
let customAuthDb: any = null;

export function setAuthTokenVerifierForTesting(verifier: ((token: string) => Promise<admin.auth.DecodedIdToken>) | null) {
  customTokenVerifier = verifier;
}

export function setAuthDbForTesting(db: any) {
  customAuthDb = db;
}

export function resetAuthForTesting() {
  customTokenVerifier = null;
  customAuthDb = null;
}

/**
 * Middleware centralizado de autenticação e autorização administrativa.
 * Exige um token de ID do Firebase Auth válido no cabeçalho `Authorization: Bearer <token>`
 * ou uma chave secreta no cabeçalho `x-admin-api-key` / `x-sync-secret` (para scripts/integradores confiáveis).
 */
export async function authenticateAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const adminApiKey = (req.headers['x-admin-api-key'] || req.headers['x-api-key']) as string;
    const syncSecret = req.headers['x-sync-secret'] as string;
    
    const expectedAdminKey = process.env.ADMIN_API_KEY;
    const expectedSyncSecret = process.env.SHEETS_SYNC_SECRET;

    // 1a. Autenticação estrita por x-admin-api-key para chamadas de sistema/automação interna
    if (adminApiKey && expectedAdminKey && adminApiKey === expectedAdminKey) {
      req.user = {
        uid: 'system-admin-key',
        email: 'system-admin@fpacstore.com.br',
        role: 'admin'
      };
      return next();
    }

    // 1b. Autenticação estrita por x-sync-secret EXCLUSIVAMENTE para a rota de sincronização do Google Sheets
    const currentUrl = req.originalUrl || req.url || '';
    const isSheetsSyncRoute = typeof currentUrl === 'string' && currentUrl.includes('/sheets/sync-back');
    if (isSheetsSyncRoute && syncSecret && expectedSyncSecret && syncSecret === expectedSyncSecret) {
      req.user = {
        uid: 'sheets-sync-bot',
        email: 'sheets-sync@fpacstore.com.br',
        role: 'admin'
      };
      return next();
    }

    // 2. Verificação por Bearer Token do Firebase Auth
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn(`🔒 [AUTH-DENIED] Tentativa de acesso sem token em rota administrativa: ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
      return res.status(401).json({ 
        error: "Não autenticado. Cabeçalho Authorization com Bearer token é obrigatório." 
      });
    }

    const token = authHeader.split('Bearer ')[1]?.trim();
    if (!token) {
      return res.status(401).json({ error: "Token de autenticação ausente ou malformado." });
    }

    // 3. Validação do Token do Firebase
    let decodedToken: admin.auth.DecodedIdToken;
    try {
      if (customTokenVerifier) {
        decodedToken = await customTokenVerifier(token);
      } else {
        decodedToken = await admin.auth().verifyIdToken(token);
      }
    } catch (tokenErr: any) {
      logger.warn(`🔒 [AUTH-EXPIRED/INVALID] Token inválido em ${req.method} ${req.originalUrl}: ${tokenErr.message}`);
      return res.status(401).json({ error: "Sessão inválida ou expirada. Por favor, faça login novamente." });
    }

    const uid = decodedToken.uid;
    const email = decodedToken.email || '';

    // 4. Verificação de Permissão de Administrador (Custom Claims, Coleção 'users' ou Lista Branca)
    let isAdmin = false;

    // a) Checa se o usuário tem claim personalizada 'admin'
    if (decodedToken.admin === true || (decodedToken as any).role === 'admin') {
      isAdmin = true;
    }

    // b) Checa se o e-mail está na lista de admins configurada nas variáveis de ambiente
    const envAdmins = (process.env.ADMIN_EMAILS || 'fpacstore@gmail.com').split(',').map(e => e.trim().toLowerCase());
    if (email && envAdmins.includes(email.toLowerCase())) {
      isAdmin = true;
    }

    // c) Checa no Firestore se o documento de usuário possui role == 'admin'
    if (!isAdmin) {
      try {
        const db = customAuthDb || getDb();
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) {
          const userData = typeof userDoc.data === 'function' ? userDoc.data() : userDoc.data;
          if (userData?.role === 'admin' || userData?.isAdmin === true) {
            isAdmin = true;
          }
        }
      } catch (dbErr: any) {
        logger.error(`⚠️ [AUTH-DB-ERR] Falha ao verificar permissão do usuário no Firestore: ${dbErr.message}`);
      }
    }

    if (!isAdmin) {
      logger.warn(`🚫 [AUTH-FORBIDDEN] Usuário ${email} (${uid}) tentou acessar rota administrativa ${req.originalUrl}`);
      return res.status(403).json({ 
        error: "Acesso negado. Esta operação exige privilégios de Administrador." 
      });
    }

    // Sucesso - anexa usuário e continua
    req.user = {
      uid,
      email,
      role: 'admin'
    };

    next();
  } catch (error: any) {
    logger.error(`❌ [AUTH-MIDDLEWARE-ERR] Erro inesperado no middleware de autenticação: ${error.message}`);
    return res.status(500).json({ error: "Erro interno na verificação de autenticação." });
  }
}
