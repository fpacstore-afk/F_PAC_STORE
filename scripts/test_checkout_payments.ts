import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const webhookPath = path.join(root, 'server/controllers/webhook.controller.ts');
const checkoutPath = path.join(root, 'server/controllers/checkout.controller.ts');
const paymentPath = path.join(root, 'server/services/payment.service.ts');
const storePath = path.join(root, 'server/services/store.service.ts');

const webhook = fs.readFileSync(webhookPath, 'utf8');
const checkout = fs.readFileSync(checkoutPath, 'utf8');
const payment = fs.readFileSync(paymentPath, 'utf8');
const store = fs.readFileSync(storePath, 'utf8');

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Checkout/Pagamentos 2.0: ${message}`);
}

// Webhook security + replay/idempotency guarantees.
assert(webhook.includes("MERCADO_PAGO_WEBHOOK_SECRET"), 'webhook secret must be mandatory');
assert(webhook.includes("x-signature") && webhook.includes("x-request-id"), 'signature headers must be required');
assert(webhook.includes("timingSafeEqual"), 'HMAC comparison must use timing-safe equality');
assert(webhook.includes("createHash('sha256')") && webhook.includes("String(paymentId)}:${xRequestId}"), 'idempotency key must be event-scoped, not payment-scoped');
assert(webhook.includes("processingStatus === 'completed'"), 'completed webhook events must short-circuit retries');
assert(webhook.includes("processingStatus: 'completed'"), 'successful webhook processing must persist completion marker');
assert(webhook.includes("paymentStatus: status || null"), 'provider payment status must be stored separately from processing status');
assert(webhook.includes("return res.status(500).send(\"Idempotency check failed\")"), 'idempotency storage failures must force provider retry');

// Checkout price/payment identity guarantees already required by the payment pipeline.
assert(checkout.includes('calculateOrderPricing'), 'checkout must use server-authoritative pricing');
assert(checkout.includes('external_reference: orderId'), 'Mercado Pago payment must bind to internal order id');
assert(checkout.includes('IDEMP-${orderId}'), 'Mercado Pago charge must use an idempotency key');
assert(payment.includes('Payment amount mismatch for order'), 'approved payments must match the server order total');
assert(payment.includes('Payment identity mismatch for order'), 'approved orders must reject a different provider payment id');
// Order creation and stock reservation must be one Firestore transaction.
assert(checkout.includes('canonicalOrder\n    );') && !checkout.includes('createOrder(orderId, canonicalOrder)'), 'checkout must not persist an order before its stock reservation');
assert(store.includes('orderData?: any') && store.includes('transaction.set(orderRef'), 'reserveStock must support atomic order creation inside its transaction');

// A failed Mercado Pago charge must never acknowledge stock release before release succeeds.
assert(checkout.includes('stockRevertedAcknowledged: false'), 'failed charge must persist a pending stock reversion before attempting release');
assert(checkout.indexOf('stockRevertedAcknowledged: false') < checkout.indexOf('releaseStockReservation(orderId, verifiedItems'), 'pending reversion marker must be written before release attempt');
assert(checkout.includes('stockRevertedAcknowledged: true') && checkout.indexOf('stockRevertedAcknowledged: true') > checkout.indexOf('releaseStockReservation(orderId, verifiedItems'), 'reversion acknowledgement must only be written after release succeeds');



console.log('✅ Checkout/Pagamentos 2.0 static certification checks passed.');
