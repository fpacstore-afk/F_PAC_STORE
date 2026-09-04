import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const storePath = path.join(root, 'server/services/store.service.ts');
const inventoryClientPath = path.join(root, 'src/services/inventory/inventoryService.ts');

const store = fs.readFileSync(storePath, 'utf8');
const inventoryClient = fs.readFileSync(inventoryClientPath, 'utf8');

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
  ['persistent idempotency records are used', /collection\('idempotency_records'\)/.test(store)],
  ['frontend rejects negative manual stock', /if \(newStock < 0\)/.test(inventoryClient)],
  ['frontend stock mutations use authenticated backend route', /authenticatedFetch\('\/api\/admin\/stock\/movement'/.test(inventoryClient)],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} - ${name}`);
}

if (failed.length) {
  console.error(`\nInventory 2.0 certification checks failed: ${failed.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nInventory 2.0 structural checks passed: ${checks.length}/${checks.length}`);
