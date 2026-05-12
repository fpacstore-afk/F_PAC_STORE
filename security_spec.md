# Security Specification - F PAC STORE

## 1. Data Invariants
- An Order cannot exist without a valid structure (customerName, items, total).
- Once an order is status 'validated', 'approved', 'shipped', or 'delivered', it cannot be modified by the client.
- Users can only read their own UserProfile.
- Public can read inventory and products, but only Admins can write.

## 2. The Dirty Dozen Payloads (Red Team Test Cases)

1. **Identity Spoofing**: Create order with `userId` of another user.
2. **Price Manipulation**: Create order with `total = 0.01` for a $100 cart.
3. **Ghost Update**: Update an existing order to `status: 'shipped'` without being admin.
4. **ID Poisoning**: Create a document in `/orders/` with a 1MB string as ID.
5. **PII Leak**: Authenticated user trying to list all `/users/`.
6. **Self-Promotion**: Update user profile to include `isAdmin: true` or similar (not implemented here but good to guard against).
7. **Negative Inventory**: Update inventory item to a negative quantity (if numeric).
8. **Orphaned Write**: Create a payment before an order.
9. **Relational Bypass**: Update an order's `status` without changing the relational sync (handled by backend usually).
10. **Timestamp Fraud**: Setting `createdAt` to a date in 2030.
11. **Shadow Field Injection**: Injection of `isInternalTest: true` into an order.
12. **Method Swapping**: Changing a PIX order to CREDIT_CARD without server verification.

## 3. Test Runner Concept
The `firestore.rules.test.ts` will verify that `PERMISSION_DENIED` is returned for these cases.
