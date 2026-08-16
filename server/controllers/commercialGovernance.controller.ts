import { Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../firebase.js';
import { logger } from '../utils/logger.js';
import {
  CommercialAction,
  CommercialActionEvent,
  CommercialActionStatus,
  CommercialActionType,
  CommercialActionPriority,
  CommercialActionResultClassification,
  CommercialGoal,
  CommercialGoalStatus,
  CommercialGoalType,
  CommercialGoalPeriod
} from '../../src/types/commercialGovernance.js';
import {
  canTransitionActionStatus,
  generateRecommendationFingerprint,
  evaluateCommercialGoal,
  toTimestampMillis
} from '../../src/utils/commercialGovernance.js';

let dbOverride: any = null;

/**
 * Permite injeção de instância de banco de dados para testes de integração de controllers
 */
export function setCommercialGovernanceDb(db: any) {
  dbOverride = db;
}

function getDatabase() {
  return dbOverride || getDb();
}

/**
 * Cria hash SHA256 para idempotencyKey (evita salvar chave crua)
 */
function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Extrai e valida a presença obrigatória de Idempotency-Key
 */
function extractIdempotencyKey(req: Request): string | null {
  const headerKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
  const bodyKey = req.body?.idempotencyKey;
  const key = headerKey || bodyKey;
  if (typeof key === 'string' && key.trim() !== '') {
    return key.trim();
  }
  return null;
}

/**
 * Whitelist canônica para sanitização do snapshot histórico de métricas
 */
const ALLOWED_SNAPSHOT_METRICS = [
  'recommendationType',
  'reasonCodes',
  'confidence',
  'isEstimated',
  'currentPrice',
  'minimumPrice',
  'targetPrice',
  'unitCost',
  'costSource',
  'costCoveragePercent',
  'unitsSold',
  'grossRevenue',
  'netRevenue',
  'cogs',
  'grossProfit',
  'marginPercent',
  'contributionMargin',
  'contributionMarginPercent',
  'shippingSubsidy',
  'gatewayFees'
];

/**
 * Sanitiza e protege os campos do snapshot (servidor é a autoridade máxima)
 */
function sanitizeSourceSnapshot(raw: any, nowIso: string) {
  const sanitized: Record<string, any> = {};
  if (raw && typeof raw === 'object') {
    for (const key of ALLOWED_SNAPSHOT_METRICS) {
      if (raw[key] !== undefined) {
        sanitized[key] = raw[key];
      }
    }
  }
  return {
    ...sanitized,
    isHistoricalSnapshot: true,
    snapshotCapturedAt: nowIso,
    snapshotVersion: '1.0'
  };
}

/**
 * GET /api/admin/commercial/actions
 * Listagem paginada com filtros e cursores (limit + 1 para hasMore exato)
 */
export async function getCommercialActionsController(req: Request, res: Response) {
  try {
    const db = getDatabase();
    const {
      status,
      priority,
      type,
      entityId,
      limit = '50',
      startAfter
    } = req.query;

    const pageSize = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
    let query: any = db.collection('commercial_actions');

    if (status && status !== 'all') {
      query = query.where('status', '==', status);
    }
    if (priority && priority !== 'all') {
      query = query.where('priority', '==', priority);
    }
    if (type && type !== 'all') {
      query = query.where('type', '==', type);
    }
    if (entityId) {
      query = query.where('entityId', '==', entityId);
    }

    query = query.orderBy('createdAt', 'desc');

    if (startAfter) {
      const cursorDoc = await db.collection('commercial_actions').doc(String(startAfter)).get();
      if (cursorDoc && (cursorDoc.exists !== false)) {
        query = query.startAfter(cursorDoc);
      }
    }

    // Busca pageSize + 1 para determinar hasMore com exatidão
    query = query.limit(pageSize + 1);

    const snapshot = await query.get();
    const hasMore = snapshot.docs.length > pageSize;
    const returnedDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

    const actions: CommercialAction[] = returnedDocs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    })) as CommercialAction[];

    const lastDoc = returnedDocs[returnedDocs.length - 1];
    const nextCursor = lastDoc ? lastDoc.id : null;

    res.json({
      actions,
      pageSize,
      nextCursor,
      hasMore
    });
  } catch (error: any) {
    logger.error('❌ [COMMERCIAL-ACTIONS-GET-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao carregar ações comerciais.' });
  }
}

/**
 * GET /api/admin/commercial/actions/:id
 * Detalhes da ação com timeline de eventos paginada (padrão limit=50, query pageSize + 1)
 */
export async function getCommercialActionByIdController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { limit = '50', startAfter } = req.query;
    const pageSize = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
    const db = getDatabase();

    const actionDoc = await db.collection('commercial_actions').doc(id).get();
    if (!actionDoc || actionDoc.exists === false) {
      return res.status(404).json({ error: 'ACTION_NOT_FOUND', message: 'Ação comercial não encontrada.' });
    }

    let eventsQuery: any = db
      .collection('commercial_action_events')
      .where('actionId', '==', id)
      .orderBy('timestamp', 'asc');

    if (startAfter) {
      const cursorDoc = await db.collection('commercial_action_events').doc(String(startAfter)).get();
      if (cursorDoc && (cursorDoc.exists !== false)) {
        eventsQuery = eventsQuery.startAfter(cursorDoc);
      }
    }

    eventsQuery = eventsQuery.limit(pageSize + 1);
    const eventsSnap = await eventsQuery.get();

    const eventsHasMore = eventsSnap.docs.length > pageSize;
    const returnedDocs = eventsHasMore ? eventsSnap.docs.slice(0, pageSize) : eventsSnap.docs;

    const events: CommercialActionEvent[] = returnedDocs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    })) as CommercialActionEvent[];

    const lastDoc = returnedDocs[returnedDocs.length - 1];
    const eventsNextCursor = lastDoc ? lastDoc.id : null;

    res.json({
      action: { id: actionDoc.id, ...actionDoc.data() },
      events,
      eventsNextCursor,
      eventsHasMore,
      pageSize
    });
  } catch (error: any) {
    logger.error('❌ [COMMERCIAL-ACTION-DETAIL-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao carregar detalhe da ação.' });
  }
}

/**
 * GET /api/admin/commercial/actions/:id/events
 * Listagem paginada de eventos da timeline de auditoria (padrão limit=50, query pageSize + 1)
 */
export async function getCommercialActionEventsController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { limit = '50', startAfter } = req.query;
    const pageSize = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50));
    const db = getDatabase();

    let eventsQuery: any = db
      .collection('commercial_action_events')
      .where('actionId', '==', id)
      .orderBy('timestamp', 'asc');

    if (startAfter) {
      const cursorDoc = await db.collection('commercial_action_events').doc(String(startAfter)).get();
      if (cursorDoc && (cursorDoc.exists !== false)) {
        eventsQuery = eventsQuery.startAfter(cursorDoc);
      }
    }

    eventsQuery = eventsQuery.limit(pageSize + 1);
    const eventsSnap = await eventsQuery.get();

    const hasMore = eventsSnap.docs.length > pageSize;
    const returnedDocs = hasMore ? eventsSnap.docs.slice(0, pageSize) : eventsSnap.docs;

    const events: CommercialActionEvent[] = returnedDocs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    })) as CommercialActionEvent[];

    const lastDoc = returnedDocs[returnedDocs.length - 1];
    const nextCursor = lastDoc ? lastDoc.id : null;

    res.json({
      events,
      pageSize,
      nextCursor,
      hasMore
    });
  } catch (error: any) {
    logger.error('❌ [COMMERCIAL-EVENTS-GET-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao carregar eventos da ação comercial.' });
  }
}

/**
 * POST /api/admin/commercial/actions
 * Criação transacional e idempotente de Ação Comercial com lock atômico de fingerprint
 */
export async function createCommercialActionController(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const idempotencyKey = extractIdempotencyKey(req);

    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'O cabeçalho Idempotency-Key é obrigatório para criação de ações comerciais.'
      });
    }

    const {
      title,
      description,
      type = 'custom',
      priority = 'medium',
      entityType = 'product',
      entityId,
      entityName,
      recommendationId,
      reasonCodes = [],
      dueDate,
      assignedTo,
      assignedToName,
      notes,
      sourceSnapshot = {}
    } = req.body;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'INVALID_TITLE', message: 'Título da ação é obrigatório.' });
    }

    const keyHash = hashKey(idempotencyKey);
    const db = getDatabase();
    const idempotencyRef = db.collection('idempotency_records').doc(`comm_act_${keyHash}`);

    const fingerprint = generateRecommendationFingerprint(
      type,
      entityId || 'global',
      Array.isArray(reasonCodes) ? reasonCodes : []
    );
    const fpHash = crypto.createHash('sha256').update(fingerprint).digest('hex');
    const fpLockRef = db.collection('commercial_action_fingerprints').doc(fpHash);

    const result = await db.runTransaction(async (transaction) => {
      // 1. Verificação de replay idempotente
      const idempDoc = await transaction.get(idempotencyRef);
      if (idempDoc.exists) {
        const cachedData = idempDoc.data();
        return {
          idempotentReplay: true,
          action: cachedData?.action
        };
      }

      // 2. Verificação atômica de duplicação ativa por fingerprint lock
      const fpDoc = await transaction.get(fpLockRef);
      if (fpDoc.exists) {
        const fpData = fpDoc.data();
        if (['draft', 'approved', 'in_progress'].includes(fpData?.status)) {
          return {
            duplicateConflict: true,
            existingActionId: fpData?.actionId
          };
        }
      }

      // 3. Criação da ação
      const actionRef = db.collection('commercial_actions').doc();
      const eventRef = db.collection('commercial_action_events').doc();
      const nowIso = new Date().toISOString();

      const sanitizedSnapshot = sanitizeSourceSnapshot(sourceSnapshot, nowIso);

      const newAction: CommercialAction = {
        id: actionRef.id,
        recommendationId: recommendationId || undefined,
        recommendationFingerprint: fingerprint,
        type: type as CommercialActionType,
        entityType,
        entityId: entityId || undefined,
        entityName: entityName || undefined,
        title: title.trim(),
        description: (description || '').trim(),
        status: 'draft',
        priority: priority as CommercialActionPriority,
        source: recommendationId ? 'commercial_intelligence' : 'manual',
        createdAt: nowIso,
        createdBy: user?.uid || 'admin',
        createdByName: user?.email || user?.name || 'Administrador',
        dueDate: dueDate || undefined,
        assignedTo: assignedTo || user?.uid || 'admin',
        assignedToName: assignedToName || user?.email || 'Administrador',
        notes: notes || undefined,
        sourceSnapshot: sanitizedSnapshot as any,
        updatedAt: nowIso
      };

      const event: CommercialActionEvent = {
        id: eventRef.id,
        actionId: actionRef.id,
        eventType: 'created',
        timestamp: nowIso,
        operatorUid: user?.uid || 'admin',
        operatorEmail: user?.email || 'fpacstore@gmail.com',
        operatorName: user?.email || 'Administrador',
        toStatus: 'draft',
        note: notes || 'Ação comercial registrada em rascunho.',
        idempotencyKeyHash: keyHash
      };

      transaction.set(actionRef, newAction);
      transaction.set(eventRef, event);
      transaction.set(fpLockRef, {
        fingerprint,
        actionId: actionRef.id,
        status: 'draft',
        createdAt: nowIso,
        updatedAt: nowIso,
        active: true
      });
      transaction.set(idempotencyRef, {
        idempotencyKeyHash: keyHash,
        actionId: actionRef.id,
        createdAt: nowIso,
        action: newAction
      });

      return {
        idempotentReplay: false,
        action: newAction
      };
    });

    if (result.duplicateConflict) {
      return res.status(409).json({
        error: 'ACTIVE_ACTION_ALREADY_EXISTS',
        message: 'Já existe um plano de ação ativo para este diagnóstico comercial.',
        existingActionId: result.existingActionId
      });
    }

    res.status(result.idempotentReplay ? 200 : 201).json(result);
  } catch (error: any) {
    logger.error('❌ [COMMERCIAL-ACTION-CREATE-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao criar ação comercial.' });
  }
}

/**
 * Transição de status genérica com validação estrita, auditoria append-only, liberação de fingerprint e idempotência
 */
async function transitionActionStatus(
  req: Request,
  res: Response,
  targetStatus: CommercialActionStatus,
  eventType: any,
  validatePayload?: (body: any) => { isValid: boolean; error?: string }
) {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const idempotencyKey = extractIdempotencyKey(req);

    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: `Idempotency-Key é obrigatório para a transição para ${targetStatus}.`
      });
    }

    if (validatePayload) {
      const validation = validatePayload(req.body);
      if (!validation.isValid) {
        return res.status(400).json({ error: 'INVALID_PAYLOAD', message: validation.error });
      }
    }

    const keyHash = hashKey(`${id}_${targetStatus}_${idempotencyKey}`);
    const db = getDatabase();
    const idempotencyRef = db.collection('idempotency_records').doc(`comm_trans_${keyHash}`);
    const actionRef = db.collection('commercial_actions').doc(id);

    const result = await db.runTransaction(async (transaction) => {
      // 1. Checagem de replay idempotente
      const idempDoc = await transaction.get(idempotencyRef);
      if (idempDoc.exists) {
        const cached = idempDoc.data();
        return { idempotentReplay: true, action: cached?.action };
      }

      // 2. Busca da ação
      const actionDoc = await transaction.get(actionRef);
      if (!actionDoc.exists) {
        throw new Error('ACTION_NOT_FOUND');
      }

      const currentAction = actionDoc.data() as CommercialAction;
      const currentStatus = currentAction.status;

      // 3. Validação: mesmo status não é nova transição (STATE_ALREADY_APPLIED)
      if (currentStatus === targetStatus) {
        return {
          alreadyApplied: true,
          action: currentAction
        };
      }

      // 4. Validação de máquina de estados
      if (!canTransitionActionStatus(currentStatus, targetStatus)) {
        throw new Error(`INVALID_STATE_TRANSITION: Transição de '${currentStatus}' para '${targetStatus}' não é permitida.`);
      }

      const nowIso = new Date().toISOString();
      const eventRef = db.collection('commercial_action_events').doc();

      const updates: Partial<CommercialAction> = {
        status: targetStatus,
        updatedAt: nowIso
      };

      if (targetStatus === 'approved') {
        updates.approvedAt = nowIso;
        updates.approvedBy = user?.uid || 'admin';
        updates.approvedByName = user?.email || 'Administrador';
      } else if (targetStatus === 'in_progress') {
        updates.startedAt = nowIso;
        updates.startedBy = user?.uid || 'admin';
        updates.startedByName = user?.email || 'Administrador';
      } else if (targetStatus === 'completed') {
        updates.completedAt = nowIso;
        updates.completedBy = user?.uid || 'admin';
        updates.completedByName = user?.email || 'Administrador';
        updates.resultNote = req.body.resultNote;
        updates.resultClassification = req.body.resultClassification || 'successful';
      } else if (targetStatus === 'dismissed') {
        updates.dismissedAt = nowIso;
        updates.dismissedBy = user?.uid || 'admin';
        updates.dismissedByName = user?.email || 'Administrador';
        updates.dismissReason = req.body.reason || req.body.dismissReason;
      } else if (targetStatus === 'cancelled') {
        updates.cancelledAt = nowIso;
        updates.cancelledBy = user?.uid || 'admin';
        updates.cancelledByName = user?.email || 'Administrador';
        updates.cancelReason = req.body.reason || req.body.cancelReason;
      }

      const updatedAction = { ...currentAction, ...updates };

      const event: CommercialActionEvent = {
        id: eventRef.id,
        actionId: id,
        eventType,
        timestamp: nowIso,
        operatorUid: user?.uid || 'admin',
        operatorEmail: user?.email || 'fpacstore@gmail.com',
        operatorName: user?.email || 'Administrador',
        fromStatus: currentStatus,
        toStatus: targetStatus,
        reason: req.body.reason || req.body.dismissReason || req.body.cancelReason,
        note: req.body.note || req.body.resultNote,
        idempotencyKeyHash: keyHash
      };

      // Atualiza ação e registra evento
      transaction.update(actionRef, updates);
      transaction.set(eventRef, event);

      // Atualiza fingerprint lock atômico
      if (currentAction.recommendationFingerprint) {
        const fpHash = crypto.createHash('sha256').update(currentAction.recommendationFingerprint).digest('hex');
        const fpLockRef = db.collection('commercial_action_fingerprints').doc(fpHash);
        const isTerminal = ['completed', 'dismissed', 'cancelled', 'expired'].includes(targetStatus);

        transaction.set(fpLockRef, {
          fingerprint: currentAction.recommendationFingerprint,
          actionId: id,
          status: targetStatus,
          updatedAt: nowIso,
          active: !isTerminal
        }, { merge: true });
      }

      transaction.set(idempotencyRef, {
        idempotencyKeyHash: keyHash,
        actionId: id,
        createdAt: nowIso,
        action: updatedAction
      });

      return { idempotentReplay: false, action: updatedAction };
    });

    if (result.alreadyApplied) {
      return res.status(400).json({
        error: 'STATE_ALREADY_APPLIED',
        message: `Ação comercial já se encontra no status '${targetStatus}'.`
      });
    }

    res.json(result);
  } catch (error: any) {
    if (error.message === 'ACTION_NOT_FOUND') {
      return res.status(404).json({ error: 'ACTION_NOT_FOUND', message: 'Ação comercial não encontrada.' });
    }
    if (error.message?.startsWith('INVALID_STATE_TRANSITION')) {
      return res.status(400).json({ error: 'INVALID_STATE_TRANSITION', message: error.message });
    }
    logger.error(`❌ [COMMERCIAL-ACTION-${targetStatus.toUpperCase()}-ERR]`, error);
    res.status(500).json({ error: error.message || `Erro ao transicionar para ${targetStatus}.` });
  }
}

/**
 * POST /api/admin/commercial/actions/:id/approve
 */
export async function approveCommercialActionController(req: Request, res: Response) {
  return transitionActionStatus(req, res, 'approved', 'approved');
}

/**
 * POST /api/admin/commercial/actions/:id/start
 */
export async function startCommercialActionController(req: Request, res: Response) {
  return transitionActionStatus(req, res, 'in_progress', 'started');
}

/**
 * POST /api/admin/commercial/actions/:id/complete
 */
export async function completeCommercialActionController(req: Request, res: Response) {
  return transitionActionStatus(req, res, 'completed', 'completed', (body) => {
    if (!body.resultNote || typeof body.resultNote !== 'string' || body.resultNote.trim() === '') {
      return { isValid: false, error: 'resultNote é obrigatório ao concluir uma ação comercial.' };
    }
    return { isValid: true };
  });
}

/**
 * POST /api/admin/commercial/actions/:id/dismiss
 */
export async function dismissCommercialActionController(req: Request, res: Response) {
  return transitionActionStatus(req, res, 'dismissed', 'dismissed', (body) => {
    const reason = body.reason || body.dismissReason;
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      return { isValid: false, error: 'Motivo (reason) é obrigatório ao descartar uma ação comercial.' };
    }
    return { isValid: true };
  });
}

/**
 * POST /api/admin/commercial/actions/:id/cancel
 */
export async function cancelCommercialActionController(req: Request, res: Response) {
  return transitionActionStatus(req, res, 'cancelled', 'cancelled', (body) => {
    const reason = body.reason || body.cancelReason;
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      return { isValid: false, error: 'Motivo (reason) é obrigatório ao cancelar uma ação comercial.' };
    }
    return { isValid: true };
  });
}

/**
 * POST /api/admin/commercial/actions/:id/notes
 * Adiciona nota de acompanhamento com evento 'note_added' e idempotência transacional
 */
export async function addCommercialActionNoteController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const user = (req as any).user;
    const idempotencyKey = extractIdempotencyKey(req);

    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key é obrigatório para adicionar notas.'
      });
    }

    if (!note || typeof note !== 'string' || note.trim() === '') {
      return res.status(400).json({ error: 'NOTE_REQUIRED', message: 'Texto da nota é obrigatório.' });
    }

    const keyHash = hashKey(`${id}_note_${idempotencyKey}`);
    const db = getDatabase();
    const idempotencyRef = db.collection('idempotency_records').doc(`comm_note_${keyHash}`);
    const actionRef = db.collection('commercial_actions').doc(id);
    const eventRef = db.collection('commercial_action_events').doc();
    const nowIso = new Date().toISOString();

    const result = await db.runTransaction(async (transaction) => {
      const idempDoc = await transaction.get(idempotencyRef);
      if (idempDoc.exists) {
        return { idempotentReplay: true, success: true, message: 'Nota adicionada com sucesso.' };
      }

      const actionDoc = await transaction.get(actionRef);
      if (!actionDoc.exists) {
        throw new Error('ACTION_NOT_FOUND');
      }

      const event: CommercialActionEvent = {
        id: eventRef.id,
        actionId: id,
        eventType: 'note_added',
        timestamp: nowIso,
        operatorUid: user?.uid || 'admin',
        operatorEmail: user?.email || 'fpacstore@gmail.com',
        operatorName: user?.email || 'Administrador',
        note: note.trim(),
        idempotencyKeyHash: keyHash
      };

      transaction.update(actionRef, {
        notes: note.trim(),
        updatedAt: nowIso
      });
      transaction.set(eventRef, event);
      transaction.set(idempotencyRef, {
        idempotencyKeyHash: keyHash,
        actionId: id,
        createdAt: nowIso,
        success: true
      });

      return { idempotentReplay: false, success: true, message: 'Nota adicionada com sucesso.' };
    });

    res.json(result);
  } catch (error: any) {
    if (error.message === 'ACTION_NOT_FOUND') {
      return res.status(404).json({ error: 'ACTION_NOT_FOUND', message: 'Ação comercial não encontrada.' });
    }
    logger.error('❌ [COMMERCIAL-ACTION-NOTE-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao adicionar nota.' });
  }
}

/**
 * =========================================================================
 * METAS COMERCIAIS PERSISTENTES (commercial_goals)
 * =========================================================================
 */

/**
 * GET /api/admin/commercial/goals
 */
export async function getCommercialGoalsController(req: Request, res: Response) {
  try {
    const db = getDatabase();
    const snap = await db.collection('commercial_goals').orderBy('createdAt', 'desc').get();
    const goals: CommercialGoal[] = snap.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    })) as CommercialGoal[];

    res.json({ goals });
  } catch (error: any) {
    logger.error('❌ [COMMERCIAL-GOALS-GET-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao carregar metas.' });
  }
}

/**
 * POST /api/admin/commercial/goals
 * Criação transacional e idempotente de Meta Comercial
 */
export async function createCommercialGoalController(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const idempotencyKey = extractIdempotencyKey(req);

    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key é obrigatório para cadastrar metas.'
      });
    }

    const {
      title,
      type = 'revenue',
      targetValue,
      startDate,
      endDate,
      period = 'monthly',
      notes
    } = req.body;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'TITLE_REQUIRED', message: 'Título da meta é obrigatório.' });
    }

    const numTarget = Number(targetValue);
    if (!Number.isFinite(numTarget) || numTarget <= 0) {
      return res.status(400).json({ error: 'INVALID_TARGET', message: 'Valor alvo deve ser maior que zero.' });
    }

    const keyHash = hashKey(`goal_${idempotencyKey}`);
    const db = getDatabase();
    const idempotencyRef = db.collection('idempotency_records').doc(`comm_goal_${keyHash}`);
    const goalRef = db.collection('commercial_goals').doc();
    const nowIso = new Date().toISOString();

    const result = await db.runTransaction(async (transaction: any) => {
      const idempDoc = await transaction.get(idempotencyRef);
      if (idempDoc.exists) {
        return {
          idempotentReplay: true,
          goal: idempDoc.data()?.goal
        };
      }

      const newGoal: CommercialGoal = {
        id: goalRef.id,
        title: title.trim(),
        type: type as CommercialGoalType,
        targetValue: numTarget,
        startDate: startDate || nowIso,
        endDate: endDate || nowIso,
        period: period as CommercialGoalPeriod,
        status: 'active',
        createdBy: user?.uid || 'admin',
        createdByName: user?.email || 'Administrador',
        createdAt: nowIso,
        updatedAt: nowIso,
        notes: notes || undefined
      };

      transaction.set(goalRef, newGoal);
      transaction.set(idempotencyRef, {
        idempotencyKeyHash: keyHash,
        goalId: goalRef.id,
        createdAt: nowIso,
        goal: newGoal
      });

      return {
        idempotentReplay: false,
        goal: newGoal
      };
    });

    res.status(result.idempotentReplay ? 200 : 201).json(result);
  } catch (error: any) {
    logger.error('❌ [COMMERCIAL-GOAL-CREATE-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao criar meta comercial.' });
  }
}

/**
 * POST /api/admin/commercial/goals/:id/status
 * Atualização transacional e idempotente do status de meta
 */
export async function updateCommercialGoalStatusController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const idempotencyKey = extractIdempotencyKey(req);

    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key é obrigatório para atualizar status de metas.'
      });
    }

    if (!['active', 'achieved', 'missed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'INVALID_STATUS', message: 'Status de meta inválido.' });
    }

    const keyHash = hashKey(`${id}_goal_status_${status}_${idempotencyKey}`);
    const db = getDatabase();
    const idempotencyRef = db.collection('idempotency_records').doc(`comm_goal_status_${keyHash}`);
    const goalRef = db.collection('commercial_goals').doc(id);

    const result = await db.runTransaction(async (transaction) => {
      const idempDoc = await transaction.get(idempotencyRef);
      if (idempDoc.exists) {
        return { idempotentReplay: true, success: true, message: `Status da meta atualizado para ${status}.` };
      }

      const doc = await transaction.get(goalRef);
      if (!doc.exists) {
        throw new Error('GOAL_NOT_FOUND');
      }

      const nowIso = new Date().toISOString();
      transaction.update(goalRef, {
        status,
        updatedAt: nowIso
      });

      transaction.set(idempotencyRef, {
        idempotencyKeyHash: keyHash,
        goalId: id,
        createdAt: nowIso,
        status
      });

      return { idempotentReplay: false, success: true, message: `Status da meta atualizado para ${status}.` };
    });

    res.json(result);
  } catch (error: any) {
    if (error.message === 'GOAL_NOT_FOUND') {
      return res.status(404).json({ error: 'GOAL_NOT_FOUND', message: 'Meta não encontrada.' });
    }
    logger.error('❌ [COMMERCIAL-GOAL-STATUS-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao atualizar status da meta.' });
  }
}

/**
 * Helper para carregar documentos de uma coleção respeitando o range de datas da meta
 * sem carregar o histórico inteiro desnecessariamente e sem truncamento artificial de UI (sem limit 100)
 */
async function fetchCollectionDocsInGoalRange(
  db: any,
  collectionName: string,
  dateFields: string[],
  startDateStr: string,
  endDateStr: string
): Promise<any[]> {
  const colRef = db.collection(collectionName);
  const startTimestamp = toTimestampMillis(startDateStr) ?? new Date(startDateStr).getTime();
  const rawEndTime = toTimestampMillis(endDateStr) ?? new Date(endDateStr).getTime();
  const endTimestamp = typeof endDateStr === 'string' && !endDateStr.includes('T')
    ? (toTimestampMillis(`${endDateStr}T23:59:59.999Z`) ?? new Date(`${endDateStr}T23:59:59.999Z`).getTime())
    : rawEndTime;

  // Consulta todos os documentos da coleção sem limit(100) e filtra de forma segura e canônica
  const snap = await colRef.get();
  const rawDocs = snap.docs
    ? snap.docs.map((d: any) => ({ id: d.id, ...(typeof d.data === 'function' ? d.data() : d.data) }))
    : [];

  return rawDocs.filter((item: any) => {
    let rawVal = null;
    for (const f of dateFields) {
      if (item[f] !== undefined && item[f] !== null) {
        rawVal = item[f];
        break;
      }
    }
    if (rawVal === null || rawVal === undefined) return false;
    const t = toTimestampMillis(rawVal);
    if (t === null) return false;
    return (!isNaN(startTimestamp) ? t >= startTimestamp : true) &&
           (!isNaN(endTimestamp) ? t <= endTimestamp : true);
  });
}

/**
 * GET /api/admin/commercial/goals/:id/evaluation
 * Avaliação server-side de meta comercial processando todo o range de pedidos/financeiro do Firestore
 * sem o limite visual de 100 pedidos do dashboard operacional e usando as collections canônicas.
 */
export async function getCommercialGoalEvaluationController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const db = getDatabase();

    const goalDoc = await db.collection('commercial_goals').doc(id).get();
    if (!goalDoc.exists) {
      return res.status(404).json({ error: 'GOAL_NOT_FOUND', message: 'Meta não encontrada.' });
    }

    const goal = { id: goalDoc.id, ...goalDoc.data() } as CommercialGoal;

    // Carrega produtos para apuração precisa de COGS / unidades
    const productsSnap = await db.collection('products').get();
    const productCatalog = productsSnap.docs ? productsSnap.docs.map((d: any) => ({ id: d.id, ...(typeof d.data === 'function' ? d.data() : d.data) })) : [];

    // Carrega dados financeiros canônicos delimitados pelo intervalo da meta (sem limit 100)
    const [rawOrders, expenses, traffic, investments] = await Promise.all([
      fetchCollectionDocsInGoalRange(db, 'orders', ['createdAt', 'date', 'orderDate', 'placedAt'], goal.startDate, goal.endDate),
      fetchCollectionDocsInGoalRange(db, 'financial_cashflow', ['date', 'createdAt', 'paymentDate'], goal.startDate, goal.endDate),
      fetchCollectionDocsInGoalRange(db, 'financial_traffic', ['date', 'createdAt', 'timestamp'], goal.startDate, goal.endDate),
      fetchCollectionDocsInGoalRange(db, 'financial_investments', ['date', 'createdAt', 'dueDate'], goal.startDate, goal.endDate)
    ]);

    const evaluation = evaluateCommercialGoal(goal, {
      rawOrders,
      expenses,
      investments,
      traffic,
      productCatalog
    });

    res.json({
      success: true,
      goal,
      evaluation
    });
  } catch (error: any) {
    logger.error('❌ [COMMERCIAL-GOAL-EVALUATION-ERR]', error);
    res.status(500).json({ error: error.message || 'Erro ao avaliar meta comercial.' });
  }
}
