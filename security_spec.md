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

## 2. Red Team Security Test Cases

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
