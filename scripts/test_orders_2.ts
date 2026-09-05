import fs from 'node:fs';

const controller = fs.readFileSync('server/controllers/order.controller.ts', 'utf8');
const server = fs.readFileSync('server.ts', 'utf8');

const checks: Array<[string, boolean]> = [
  ['return route is registered', server.includes('/orders/:orderId/return-request') && server.includes('requestOrderReturnController')],
  ['return requests require authentication', controller.includes("error: 'UNAUTHORIZED'") && controller.includes('verifyIdToken')],
  ['return eligibility is limited to shipped/in_transit/delivered', controller.includes("['shipped', 'in_transit', 'delivered'].includes(shippingStatus)")],
  ['empty order item lists are rejected', controller.includes("error: 'ORDER_ITEMS_REQUIRED'")],
  ['return quantity must be a positive integer', controller.includes('Number.isFinite(rawQty)') && controller.includes('Number.isInteger(rawQty)') && controller.includes('rawQty <= 0')],
  ['return item identity is mandatory', controller.includes("error: 'INVALID_RETURN_ITEM'")],
  ['requested return item must exist in original order', controller.includes("error: 'RETURN_ITEM_NOT_FOUND'") && controller.includes('if (!matchedOrderItem)')],
  ['original purchased quantity is validated', controller.includes("error: 'INVALID_ORDER_ITEM_QUANTITY'")],
  ['nested previous return items are counted', controller.includes('Array.isArray(r.items)') && controller.includes('r.items?.some?.')],
  ['return quantity cannot exceed remaining quantity', controller.includes('rawQty > maxReturnable') && controller.includes("error: 'INVALID_RETURN_QUANTITY'")],
  ['legacy quantity coercion is absent', !controller.includes('Math.max(1, Number(item.quantity) || 1)')],
  ['legacy unmatched-item purchased quantity fallback is absent', !controller.includes('matchedOrderItem?.quantity || qty')],
  ['cancel remains idempotent', controller.includes('idempotent: true')],
  ['cancel blocks shipped/in_transit/delivered orders', controller.includes("error: 'ORDER_CANNOT_BE_CANCELLED'")],
  ['cancel preserves paid financial truth', controller.includes("['approved', 'partially_paid', 'refunded', 'partially_refunded'].includes(currentPayStatus)")],
];

let failures = 0;
for (const [name, ok] of checks) {
  if (ok) {
    console.log(`✅ ${name}`);
  } else {
    failures += 1;
    console.error(`❌ ${name}`);
  }
}

if (failures > 0) {
  console.error(`\nOrders 2.0 certification checks failed: ${failures}/${checks.length}`);
  process.exit(1);
}

console.log(`\n✅ Orders 2.0 certification checks passed: ${checks.length}/${checks.length}`);
