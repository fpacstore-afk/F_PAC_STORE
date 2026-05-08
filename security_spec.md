# Security Specification for F PAC STORE

## Data Invariants
1. **Orders**:
   - Must have a non-empty `customerName`, `customerPhone`, `address`, and `total`.
   - `status` must be one of the allowed values: `pending`, `processing`, `shipped`, `delivered`, `cancelled`, `validated`, `approved`.
   - `createdAt` must be set to `request.time` on creation.
   - Only admins can update the `status` of an order.
   - Users can only read their own orders (matched by `userId`).
   - Guests can read a single order by ID for tracking (allowed for better UX, risks are limited by ID entropy).

2. **Users (Profiles)**:
   - Profile document ID must match the `request.auth.uid`.
   - `email` field must match the authenticated user's email.
   - Users can only read/write their own profile.

3. **Inventory**:
   - Publicly readable.
   - Only admins or the system (during checkout transaction) can update stock levels.
   - `updatedAt` must be set to `request.time` on update.

4. **Estampas & Products**:
   - Publicly readable.
   - Only admins can create/update/delete.

## The "Dirty Dozen" (Malicious Payloads)
1. **Identity Spoofing (Order)**: Attempt to create an order with a different `userId` than the one authenticated.
2. **Identity Spoofing (Profile)**: Attempt to update someone else's profile by changing the document ID.
3. **State Shortcutting**: Attempt to update an order status from `pending` to `delivered` as a non-admin.
4. **Price Manipulation**: Attempt to create an order with `total: 0` despite item prices.
5. **shadow field Injection**: Attempt to add a `isVerified: true` field to a user profile.
6. **Stock Hijacking**: Attempt to reset `stock` to `1000` as a non-admin.
7. **Bypassing Immutability**: Attempt to change the `createdAt` of an existing order.
8. **PII Blanket Read**: Attempt to list all orders from all users.
9. **Spammy ID Injection**: Attempt to create a document with a 1MB string in the ID field.
10. **Terminal State Lockdown Bypass**: Attempt to update an order after it has been marked `delivered`.
11. **Spoofed Admin Check**: Attempt to write to `products` while logged in as a normal user.
12. **Null Pointer Trigger**: Attempt to read/update without being logged in when required.

## The Test Runner
A `firestore.rules.test.ts` file will be created to simulate these attacks using the Firebase emulator.
