import { readFileSync } from 'node:fs';
import { createCipheriv, createHash, publicEncrypt, randomBytes } from 'node:crypto';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { garmentProfiles } from '../shared/garmentModels';

// Inventory is private. Only an encrypted envelope may leave the runner logs.
const request = JSON.parse(readFileSync('scripts/stock-reorganization-request.json', 'utf8'));
if (request.action !== 'audit') throw new Error('This workflow only supports a read-only stock audit.');
const project = process.env.GCP_PROJECT_ID;
const database = process.env.FIREBASE_DATABASE_ID;
if (project !== 'fpac-store62' || database !== 'ai-studio-a7d50f8c-9b01-4490-9a13-dd8892e0c41a') throw new Error('Unexpected audit database.');
const db = getFirestore(initializeApp({ projectId: project, credential: applicationDefault() }), database);
const [products, inventory, catalog] = await Promise.all([
  db.collection('products').get(), db.collection('inventory').get(), db.collection('pricing_workbench').doc('catalog').get(),
]);
const fields = ['slug','name','sku','category','productType','baseModel','fit','productFinish','status','stockBaseSlug','stockMode','garmentModelId','garmentModelName','garmentFamily','neckline','supplierName','sourceCode','sourceProductName','modelSeparationRequired','modelClassificationPending','mergedIntoProductId','mergedIntoSlug','sizes','colors','variants','variantsStock','stock','totalPhysicalStock','totalReservedStock','parentSlug','collection','primeBaseEnabled','confirmedBaseModels','images','createdAt','updatedAt'];
const pick = (data: any, keys: string[]) => Object.fromEntries(keys.filter(key => data[key] !== undefined).map(key => [key,data[key]]));
const snapshot = {
  products: products.docs.map(doc => ({ id: doc.id, ...pick(doc.data(), fields) })).sort((a,b)=>a.id.localeCompare(b.id)),
  inventory: inventory.docs.map(doc => ({ id: doc.id, ...pick(doc.data(), ['productId','productSlug','name','variants','stock','physicalQuantity','totalPhysicalStock','reservedQuantity','totalReservedStock','availableQuantity','totalAvailableStock','active','available','updatedAt']) })).sort((a,b)=>a.id.localeCompare(b.id)),
  profiles: garmentProfiles(catalog.data()?.catalog),
};
const payload = Buffer.from(JSON.stringify({ requestId: request.requestId, project, database, createdAt: new Date().toISOString(), snapshotHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), ...snapshot }));
const key = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
const body = Buffer.concat([cipher.update(payload), cipher.final()]);
const envelope = { key: publicEncrypt({ key: request.publicKey, oaepHash: 'sha256' }, key).toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), body: body.toString('base64') };
console.log('FPAC_ENCRYPTED_STOCK_AUDIT=' + Buffer.from(JSON.stringify(envelope)).toString('base64'));
console.log('Read-only inventory audit completed; no stock, product, order or pricing record was changed.');
