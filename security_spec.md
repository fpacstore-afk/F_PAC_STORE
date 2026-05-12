# Security Specification - F PAC STORE

## Data Invariants
1. **Orders**: An order must have items, a total matching the items + shipping, and a valid customer name/email.
2. **Identity**: Users can only read their own orders unless they are admins.
3. **Immutability**: Once an order is created, its `userId`, `items`, and `total` cannot be changed by the customer.
4. **Availability**: Inventory can only be modified by admins, except for atomic stock decrements (if implemented, currently handled by checkout logic).

## The Dirty Dozen (Malicious Payloads)

1. **The Ghost Order**: Creating an order with `userId` of another user.
2. **The Price Fluctuation**: Updating an existing order's `total` to R$ 0.10.
3. **The Shadow Admin**: Updating a user profile to set `role: 'admin'`.
4. **The Inventory Wipe**: Deleting the entire `products` collection.
5. **The PII Leak**: Querying the `orders` collection without a `where` clause on `userId`.
6. **The Status Jump**: Updating an order status directly from `pending` to `shipped` bypassing payment.
7. **The Stamp Hijack**: Creating a custom print (`estampas`) as a guest.
8. **The Identification Spoof**: Submitting an order with a 2MB long ID to cause resource exhaustion.
9. **The Email Impersonator**: Submitting an order with the admin's email to try and gain privileges.
10. **The Stock Injection**: Updating inventory availability to `true` for an out-of-stock item.
11. **The Transaction Break**: Trying to set `paymentStatus: 'approved'` directly on a document.
12. **The Anonymous Write**: Writing to `config` collection without any auth.

## Test Runner Logic
All above payloads must return `PERMISSION_DENIED` by the security rules.
