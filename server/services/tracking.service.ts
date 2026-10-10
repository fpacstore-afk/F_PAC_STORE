import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';
import { isLocalDeliveryOrder } from './stateMachine.service.js';

/**
 * Generates a high-entropy tracking access token and its SHA-256 hash.
 */
export function generateTrackingToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

/**
 * Computes the SHA-256 hash of a tracking access token.
 */
export function hashTrackingToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verifies a provided tracking access token against a stored SHA-256 hash using constant-time comparison.
 */
export function verifyTrackingToken(token: string, storedHash: string): boolean {
  if (!token || !storedHash || typeof token !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const computedHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const bufA = Buffer.from(computedHash, 'hex');
  const bufB = Buffer.from(storedHash.trim(), 'hex');

  if (bufA.length !== bufB.length || bufA.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface TrackingAccessResult {
  authorized: boolean;
  reason?: string;
  method?: string;
}

/**
 * Validates order tracking access based on:
 * Condition A: Firebase Auth Ownership (UID matching with priority over email, or verified email for guest orders)
 * OR
 * Condition B: Valid trackingAccessToken matching order.trackingAccessTokenHash
 */
export async function verifyOrderTrackingAccess(
  order: any,
  authHeader?: string,
  queryToken?: string,
  headerToken?: string
): Promise<TrackingAccessResult> {
  if (!order) {
    return { authorized: false, reason: 'ORDER_NOT_FOUND' };
  }

  // 1. Condition A: Firebase Auth Ownership Check
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.substring(7).trim();
    if (idToken) {
      try {
        const decodedToken = await getAuth().verifyIdToken(idToken);
        const orderUserId = (
          order.userId ||
          order.customerInfo?.userId ||
          order.customer?.id ||
          order.user?.uid ||
          ''
        ).trim();

        if (orderUserId) {
          // Priority 1: When order has userId, token UID MUST match orderUserId.
          if (decodedToken.uid === orderUserId) {
            return { authorized: true, method: 'firebase_uid' };
          }
          // Note: If order has userId and decodedToken.uid !== orderUserId, access via Auth fails.
        } else {
          // Priority 2: Guest / Historical order without userId.
          // Fallback to email, BUT email_verified MUST be true and match order customerEmail.
          const orderEmail = (
            order.customerEmail ||
            order.email ||
            order.customerInfo?.email ||
            ''
          ).trim().toLowerCase();
          const authEmail = (decodedToken.email || '').trim().toLowerCase();

          if (
            decodedToken.email_verified === true &&
            authEmail &&
            orderEmail &&
            authEmail === orderEmail
          ) {
            return { authorized: true, method: 'firebase_email' };
          }
        }
      } catch (authErr) {
        // Invalid or expired token; proceed to check tracking token
      }
    }
  }

  // 2. Condition B: Tracking Access Token Check
  const token = (queryToken || headerToken || '').trim();
  if (token && order.trackingAccessTokenHash) {
    if (verifyTrackingToken(token, order.trackingAccessTokenHash)) {
      return { authorized: true, method: 'tracking_token' };
    }
  }

  return { authorized: false, reason: 'FORBIDDEN' };
}

const PUBLIC_ORDER_STATUSES = new Set([
  'received', 'payment_pending', 'payment_approved', 'approved', 'pending',
  'processing', 'production', 'ready', 'shipped', 'in_transit', 'delivered', 'completed',
  'cancelled', 'rejected', 'expired'
]);

function normalizePublicOrderStatus(orderData: any): string {
  const raw = String(orderData?.status || orderData?.lifecycleStatus || '').trim();
  const normalized = raw.toLowerCase();
  const paymentStatus = String(orderData?.paymentStatus || orderData?.payment?.status || '').trim().toLowerCase();

  const legacy: Record<string, string> = {
    'aguardando pagamento': 'payment_pending',
    'aguardando pagamento pix': 'payment_pending',
    'pagamento aprovado': 'payment_approved',
    'pagamento confirmado': 'payment_approved',
    'em produção': 'processing',
    'em producao': 'processing',
    'pronto para envio': 'ready',
    'pedido enviado': 'shipped',
    'pedido entregue': 'delivered',
    'pagamento não realizado': 'rejected',
    'pagamento nao realizado': 'rejected',
  };

  const status = PUBLIC_ORDER_STATUSES.has(normalized)
    ? normalized
    : legacy[normalized];

  if (['received', 'pending', 'payment_pending', 'approved', 'payment_approved'].includes(status || '')) {
    if (['approved', 'payment_approved', 'paid', 'pago'].includes(paymentStatus)) return 'payment_approved';
    if (['pending', 'payment_pending'].includes(paymentStatus)) return 'payment_pending';
    if (['rejected', 'cancelled', 'expired'].includes(paymentStatus)) return paymentStatus;
    if (status) return status;
  }

  return status || 'received';
}

function normalizePublicProductionStage(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  const stageIds = ['separacao_corte', 'estamparia', 'embalagem', 'ready', 'completed'];
  if (stageIds.includes(normalized)) return normalized;

  if (/conclu|finaliz|complet/.test(normalized)) return 'completed';
  if (/pronto|ready/.test(normalized)) return 'ready';
  if (/embal|qualidad|costur/.test(normalized)) return 'embalagem';
  if (/estamp|impress/.test(normalized) && !/aguardando/.test(normalized)) return 'estamparia';
  if (/separa|cort|fila|aguardando impress/.test(normalized)) return 'separacao_corte';
  return null;
}

/**
 * Sanitizes tracking data to ensure ONLY minimal logistical fields are returned.
 * Excludes all financial, internal, PII, and hash/token fields.
 */
export function sanitizeTrackingResponse(orderId: string, orderData: any) {
  const isLocal = isLocalDeliveryOrder(orderData);

  // Validate trackingUrl to prevent javascript: or data: URLs
  let safeTrackingUrl: string | null = null;
  const rawTrackingUrl = orderData.shipping?.trackingUrl || orderData.trackingUrl;
  if (typeof rawTrackingUrl === 'string') {
    const trimmed = rawTrackingUrl.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      safeTrackingUrl = trimmed;
    }
  }

  // Sanitize tracking events
  const rawEvents = Array.isArray(orderData.shipping?.trackingEvents)
    ? orderData.shipping.trackingEvents
    : Array.isArray(orderData.trackingEvents)
      ? orderData.trackingEvents
      : [];

  const sanitizedEvents = rawEvents.map((evt: any) => ({
    status: typeof evt?.status === 'string' ? evt.status : 'pending',
    description: typeof evt?.description === 'string'
      ? String(evt.description).replace(/<[^>]*>?/gm, '').trim()
      : '',
    date: evt?.date || evt?.timestamp || evt?.createdAt || null,
    location: typeof evt?.location === 'string' ? evt.location : null
  }));

  // Strict whitelist for public logistics tracking response
  return {
    success: true,
    orderId,
    status: normalizePublicOrderStatus(orderData),
    productionStage: normalizePublicProductionStage(
      orderData.productionStatus || orderData.production?.stage || orderData.production?.status,
    ),
    shippingStatus: orderData.shipping?.status || orderData.shippingStatus || 'pending',
    carrier: orderData.shipping?.carrier || orderData.carrier || (isLocal ? 'Entrega Própria (Joinville)' : 'Correios'),
    trackingCode: orderData.shipping?.trackingCode || orderData.trackingCode || null,
    trackingUrl: safeTrackingUrl,
    trackingEvents: sanitizedEvents,
    shippedAt: orderData.shipping?.shippedAt || orderData.shippedAt || null,
    deliveredAt: orderData.shipping?.deliveredAt || orderData.deliveredAt || null,
    isLocalDelivery: isLocal
  };
}
