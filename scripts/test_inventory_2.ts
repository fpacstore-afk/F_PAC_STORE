import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const storePath = path.join(root, 'server/services/store.service.ts');
const inventoryClientPath = path.join(root, 'src/services/inventory/inventoryService.ts');
const inventoryHookPath = path.join(root, 'src/hooks/useInventory.ts');
const productDrawerPath = path.join(root, 'src/components/admin/products/ProductManagementDrawer.tsx');
const checkoutPath = path.join(root, 'server/controllers/checkout.controller.ts');
const paymentPath = path.join(root, 'server/services/payment.service.ts');
const adminControllerPath = path.join(root, 'server/controllers/admin.controller.ts');
const designTypePath = path.join(root, 'src/types/design.ts');

const store = fs.readFileSync(storePath, 'utf8');
const inventoryClient = fs.readFileSync(inventoryClientPath, 'utf8');
const inventoryHook = fs.readFileSync(inventoryHookPath, 'utf8');
const productDrawer = fs.readFileSync(productDrawerPath, 'utf8');
const checkout = fs.readFileSync(checkoutPath, 'utf8');
const payment = fs.readFileSync(paymentPath, 'utf8');
const adminController = fs.readFileSync(adminControllerPath, 'utf8');
const designType = fs.readFileSync(designTypePath, 'utf8');

const checks: Array<[string, boolean]> = [
  ['derives available stock from physical - reserved', /availableQuantity\s*=\s*Math\.max\(0,\s*physicalQuantity\s*-\s*reservedQuantity\)/.test(store)],
  ['reserves stock in Firestore transaction', /export async function reserveStock[\s\S]*?runTransaction/.test(store)],
  ['releases reservations in Firestore transaction', /export async function releaseStockReservation[\s\S]*?runTransaction/.test(store)],
  ['consumes reservations in Firestore transaction', /export async function consumeStockReservation[\s\S]*?runTransaction/.test(store)],
  ['processes physical returns in Firestore transaction', /export async function processPhysicalReturn[\s\S]*?runTransaction/.test(store)],
  ['manual stock adjustment is transactional', /export async function adjustStock[\s\S]*?runTransaction/.test(store)],
  ['manual subtraction protects reserved stock', /Manual outbound check: MUST NOT consume reserved stock![\s\S]*?stats\.availableQuantity\s*<\s*quantity/.test(store)],
  ['consumption blocks negative physical/reserved/available values', /newPhysicalQuantity\s*<\s*0\s*\|\|\s*newReservedQuantity\s*<\s*0\s*\|\|\s*newAvailableQuantity\s*<\s*0/.test(store)],
  ['stock movements are append-only documents', /collection\('stock_movements'\)\.doc\(\)/.test(store)],
  ['reservation tracking collection exists', /collection\('stock_reservations'\)/.test(store)],
  ['canonical persistent stock idempotency collection is used', /collection\('stock_idempotency'\)/.test(store)],
  ['reservation document identity includes order + product + variant', /stock_reservations'\)\.doc\(`\$\{orderId\}_\$\{physicalSlug\}_\$\{variantKey\}`\)/.test(store)],
  ['per-item idempotency identity includes product + variant', /effectiveIdempotencyKey[^\n]*physicalSlug[^\n]*variantKey|physicalSlug[^\n]*effectiveIdempotencyKey[^\n]*variantKey/.test(store)],
  ['inventory operations aggregate duplicate physical variants before transaction writes', /aggregateInventoryItems|groupInventoryItems|normalizeInventoryItems/.test(store)],
  ['frontend rejects negative manual stock', /if \(newStock < 0\)/.test(inventoryClient)],
  ['frontend stock mutations use authenticated backend route', /authenticatedFetch\('\/api\/admin\/stock\/movement'/.test(inventoryClient)],
  ['admin history reads official movement product identity', /where\('productSlug',\s*'==',/.test(productDrawer)],
  ['admin inventory mutation failure is not silently swallowed', !/catch \(movErr\)[\s\S]{0,240}console\.error[\s\S]{0,240}\}\s*\n\s*\}/.test(productDrawer)],
  ['storefront normalizes and exposes available quantity', /availableQuantity[\s\S]*physicalQuantity[\s\S]*reservedQuantity/.test(inventoryHook)],
  ['storefront missing inventory is not sellable through product stock fallback', /Inventory 2\.0 is the only quantity authority[\s\S]*if \(!item\) return false/.test(inventoryHook)],
  ['storefront stock count uses available quantity instead of physical stock', /getStock[\s\S]*availableQuantity/.test(inventoryHook)],
  ['checkout atomically creates order and reserves stock before payment attempt', /reserveStock\(\s*orderId,\s*verifiedItems,\s*`checkout_\$\{orderId\}_reserve`,\s*canonicalOrder\s*\)[\s\S]*?mpService\.createPayment/.test(checkout)],
  ['checkout releases reservation when payment creation fails', /releaseStockReservation\(orderId, verifiedItems, `checkout_\$\{orderId\}_release_fail`\)/.test(checkout)],
  ['failed payment reservation release is retryable and acknowledged only after success', /ensurePendingStockReversion[\s\S]*releaseStockReservation[\s\S]*stockRevertedAcknowledged:\s*true/.test(payment)],
  ['payment replays still execute pending stock reversion', /const finalOrder = await ensurePendingStockReversion\(orderId\)[\s\S]*if \(!wasUpdated\)/.test(payment)],
  ['physical stock consumption happens on first shipped transition only', /newStatus === 'shipped'[\s\S]*currentShippingStatus !== 'shipped'[\s\S]*consumeStockReservation/.test(adminController)],
  ['design catalog does not define finite stamp stock quantities', !/\b(stock|physicalQuantity|reservedQuantity|availableQuantity)\??\s*:/.test(designType)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
}

if (failed.length) {
  console.error(`\nInventory 2.0 certification checks failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nInventory 2.0 certification structural checks passed: ${checks.length}/${checks.length}`);
