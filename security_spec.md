# Security Specification - F PAC STORE

## 1. Data Invariants
- An Order cannot exist without a valid structure (customerName, items, total).
- Once an order is status 'validated', 'approved', 'shipped', or 'delivered', it cannot be modified by the client.
- Direct mutations on `/orders/{orderId}` from client SDK are forbidden in `firestore.rules`. All order updates and cancellations must route through authenticated backend API endpoints.
- `req.body.email` is strictly prohibited as proof of ownership. User identity for order cancellation and administrative actions is determined exclusively via verified Firebase Auth ID Tokens (`Authorization: Bearer <token>`).
- Authorization hierarchy for order cancellation:
  1. Priority 1 (UID): If order has `userId`, token `uid` must match `order.userId`. Mismatch is rejected with 403 FORBIDDEN even if email matches.
  2. Priority 2 (Email Fallback): If order is a guest order without `userId`, email matching is permitted ONLY IF `decodedToken.email_verified === true`. Unverified tokens are rejected with 403 EMAIL_NOT_VERIFIED.
- Order cancellation (`order.status = 'cancelled'`) never erases financial history (`paidAmount`). Order cancellation is distinct from payment refund (`ORDER CANCELLED != PAYMENT REFUNDED`). Manual admin payment status transitions to `cancelled`/`rejected`/`expired` when `paidAmount > 0` are rejected with HTTP 400.

## 2. Shipping, Label, Tracking & Return Invariants (Fase 8.5 & 8.6)
- **Zero Public Label/Shipping Calls**: Calling Melhor Envio APIs, label endpoints or manual status updates without authenticated admin rights is strictly forbidden.
- **Return Request Security**: Client return requests (`POST /api/orders/:orderId/return-request`) require authenticated user credentials (Firebase Auth ID Token) with strict UID matching or verified email ownership. Unauthenticated requests are blocked (401 UNAUTHORIZED). Direct client mutations on Firestore `orders` are forbidden in `firestore.rules`.
- **Return Quantity Limits**: Physical return reception enforces strict quantity limits against original order items minus prior returns (`INVALID_RETURN_QUANTITY`).
- **Resellable vs Non-Sellable Inventory Isolation**: Physical return processing (`processPhysicalReturn`) increases sellable inventory (`physicalQuantity`) ONLY for undamaged, resellable items (`resellable !== false`). Non-sellable, damaged, or customized items are logged in return ledgers without inflating sellable inventory.
- **Tracking Validation**: Client/admin supplied tracking codes, carriers, and tracking URLs are validated via `validateTrackingInfo`. Non-string, null, undefined, malformed URLs, or objects are rejected (400 `INVALID_TRACKING_CODE` / `INVALID_TRACKING_URL`).
- **Canonical Backend Payload**: All shipping labels are built exclusively on the backend using the order document in Firestore. Client-supplied addresses, weights, or dimensions are discarded.
- **Local Delivery Guard**: Orders with `shippingServiceId = 0` or method 'Entrega Própria / Retirada Local' are blocked from generating labels (`SHIPPING_LOCAL_DELIVERY_NO_LABEL`).
- **Atomic Concurrency Lock**: Simultaneous concurrent requests for label creation on the same order are blocked via Firestore transaction locks (`shipping_locks/{orderId}`) returning HTTP 409 (`OPERATION_IN_PROGRESS`).
- **Secret Redaction**: Error logs, HTTP responses, and audit records MUST automatically sanitize all Bearer tokens, secrets, and API keys via `sanitizeSecrets`.
- **Terminal State Inviolability**: The `delivered` status is a terminal shipping state and cannot be regressed to `shipped`, `in_transit`, `label_created`, or `pending`.
- **Webhook Idempotency**: Webhook tracking events utilize unique idempotency keys in `idempotency_records` to reject duplicate events and prevent out-of-order status regressions.

## 3. Red Team Security Test Cases

1. **Identity Spoofing**: Create order with `userId` of another user.
2. **Body Email Forgery**: Attempting to cancel another user's order by supplying their email in request body -> Blocked (403 FORBIDDEN).
3. **UID Mismatch / Email Spoofing**: Token UID does not match `order.userId`, even if email matches -> Blocked (403 FORBIDDEN).
4. **Unverified Email Guest Cancel**: Attempting to cancel guest order with unverified email token -> Blocked (403 EMAIL_NOT_VERIFIED).
5. **Unauthenticated Cancel**: Attempting to cancel an order without a valid Firebase ID token -> Blocked (401 UNAUTHORIZED).
6. **Financial Erase**: Attempting to cancel an approved or partially paid order to wipe `paidAmount` to zero -> Blocked (financial truth preserved).
7. **Ghost Update**: Update an existing order to `status: 'shipped'` without being admin.
8. **ID Poisoning**: Create a document in `/orders/` with a 1MB string as ID.
9. **PII Leak**: Authenticated user trying to list all `/users/`.
10. **Self-Promotion**: Update user profile to include `isAdmin: true`.
11. **Shipped Cancel Bypass**: Attempting to cancel an order with `shippingStatus = 'shipped'` -> Blocked (400 ORDER_CANNOT_BE_CANCELLED).
12. **Timestamp Fraud**: Setting `createdAt` to a date in 2030.
13. **Shadow Field Injection**: Injection of `isInternalTest: true` into an order.
14. **Method Swapping**: Changing a PIX order to CREDIT_CARD without server verification.
15. **Unauthenticated Label Request**: Attempting to trigger `/shipping/create-label` without admin credentials -> Blocked (401/403).
16. **Double-Click Label Purchase**: Triggering concurrent label requests simultaneously -> Handled atomically by `shipping_locks` (409/idempotent).
17. **Local Delivery Label Forgery**: Triggering label generation for a local delivery order -> Blocked (400 `SHIPPING_LOCAL_DELIVERY_NO_LABEL`).
18. **Credential Log Leak**: Triggering provider error to capture `MELHOR_ENVIO_TOKEN` in log -> Redacted to `[REDACTED]`.
