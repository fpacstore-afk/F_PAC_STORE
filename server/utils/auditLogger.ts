import { getDb } from "../firebase.js";
import { logger } from "./logger.js";

export interface AuditLogOptions {
  userId: string;
  userEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

/**
 * Registra eventos administrativos no banco de dados para rastreabilidade e auditoria.
 * NUNCA armazena senhas, tokens ou dados de cartão de crédito.
 */
export async function recordAuditLog(options: AuditLogOptions): Promise<void> {
  try {
    const db = getDb();
    
    // Sanitização do metadata
    const sanitizedMetadata = { ...(options.metadata || {}) };
    delete sanitizedMetadata.token;
    delete sanitizedMetadata.password;
    delete sanitizedMetadata.secret;
    delete sanitizedMetadata.cardToken;
    delete sanitizedMetadata.cvv;
    delete sanitizedMetadata.cardNumber;

    const logEntry = {
      userId: options.userId || "anonymous",
      userEmail: options.userEmail || "unknown",
      action: options.action,
      resource: options.resource,
      resourceId: options.resourceId || null,
      ip: options.ip || "0.0.0.0",
      userAgent: options.userAgent || "Unknown",
      metadata: sanitizedMetadata,
      timestamp: new Date().toISOString()
    };

    await db.collection("audit_logs").add(logEntry);
    logger.info(`🧾 [AUDIT-LOG] ${options.action} por ${options.userEmail || options.userId} em ${options.resource}`);
  } catch (err: any) {
    logger.error(`⚠️ [AUDIT-LOG-ERR] Falha ao gravar log de auditoria: ${err.message}`);
  }
}
