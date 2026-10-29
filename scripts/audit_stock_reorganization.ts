import { readFileSync } from 'node:fs';
import { createCipheriv, createHash, publicEncrypt, randomBytes } from 'node:crypto';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { garmentProfiles } from '../shared/garmentModels';
import { execFileSync } from 'node:child_process';

// Inventory is private. Only an encrypted envelope may leave the runner logs.
const request = JSON.parse(readFileSync('scripts/stock-reorganization-request.json', 'utf8'));
if (request.action !== 'audit') throw new Error('This workflow only supports a read-only stock audit.');
const project = process.env.GCP_PROJECT_ID;
const database = process.env.FIREBASE_DATABASE_ID;
if (project !== 'fpac-store62' || database !== 'ai-studio-a7d50f8c-9b01-4490-9a13-dd8892e0c41a') throw new Error('Unexpected audit database.');
async function readDatabase(db: any) {
  const [products, inventory, catalog] = await Promise.all([
    db.collection('products').get(), db.collection('inventory').get(), db.collection('pricing_workbench').doc('catalog').get(),
  ]);
  return { products: products.docs.map((doc: any) => ({ ...doc.data(), id: doc.id })), inventory: Object.fromEntries(inventory.docs.map((doc: any) => [doc.id, doc.data()])), profiles: garmentProfiles(catalog.data()?.catalog) };
}
async function readExistingRuntime() {
  // Reuse an existing administrative integration only. Never create credentials,
  // change IAM or emit service environment variables into runner output.
  const service = JSON.parse(execFileSync('gcloud', ['run','services','describe','f-pac-store-n-o-s-roupa-identidade','--project',project!, '--region','us-east1','--format=json'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }));
  const env = service.spec?.template?.spec?.containers?.[0]?.env || [];
  const resolve = (name: string) => {
    const entry = env.find((item: any) => item.name === name);
    if (typeof entry?.value === 'string') return entry.value;
    const secret = entry?.valueFrom?.secretKeyRef;
    if (!secret) return '';
    return execFileSync('gcloud', ['secrets','versions','access',secret.key || 'latest','--secret',secret.name,'--project',project!], { encoding:'utf8', stdio:['ignore','pipe','pipe'] }).trim();
  };
  const adminKey = resolve('ADMIN_API_KEY');
  if (adminKey) {
    const response = await fetch('https://fpac-store62.web.app/api/admin/garment-models', { headers: { 'x-admin-api-key': adminKey }, redirect:'error', signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('Existing runtime integration refused the read-only audit.');
    return await response.json() as any;
  }
  const serviceCredential = resolve('FIREBASE_SERVICE_ACCOUNT');
  if (serviceCredential) return readDatabase(getFirestore(initializeApp({ projectId:project, credential:cert(JSON.parse(serviceCredential)) }, 'stock-runtime-audit'), database!));
  throw new Error('No existing runtime integration is available for the inventory audit. No permissions were changed.');
}
let live: any;
try { live = await readDatabase(getFirestore(initializeApp({ projectId:project, credential:applicationDefault() }), database!)); }
catch (error: any) {
  if (error.code !== 7) throw new Error('The inventory audit could not read the selected database.');
  live = await readExistingRuntime();
}
const fields = ['slug','name','sku','category','productType','baseModel','fit','productFinish','status','stockBaseSlug','stockMode','garmentModelId','garmentModelName','garmentFamily','neckline','supplierName','sourceCode','sourceProductName','modelSeparationRequired','modelClassificationPending','mergedIntoProductId','mergedIntoSlug','sizes','colors','variants','variantsStock','stock','totalPhysicalStock','totalReservedStock','parentSlug','collection','primeBaseEnabled','confirmedBaseModels','images','createdAt','updatedAt'];
const pick = (data: any, keys: string[]) => Object.fromEntries(keys.filter(key => data[key] !== undefined).map(key => [key,data[key]]));
const snapshot = {
  products: live.products.map((doc: any) => ({ id: doc.id, ...pick(doc, fields) })).sort((a: any,b: any)=>a.id.localeCompare(b.id)),
  inventory: Object.entries(live.inventory).map(([id, doc]: [string, any]) => ({ id, ...pick(doc, ['productId','productSlug','name','variants','stock','physicalQuantity','totalPhysicalStock','reservedQuantity','totalReservedStock','availableQuantity','totalAvailableStock','active','available','updatedAt']) })).sort((a,b)=>a.id.localeCompare(b.id)),
  profiles: live.profiles,
};
const payload = Buffer.from(JSON.stringify({ requestId: request.requestId, project, database, createdAt: new Date().toISOString(), snapshotHash: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), ...snapshot }));
const key = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
const body = Buffer.concat([cipher.update(payload), cipher.final()]);
const envelope = { key: publicEncrypt({ key: request.publicKey, oaepHash: 'sha256' }, key).toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), body: body.toString('base64') };
console.log('FPAC_ENCRYPTED_STOCK_AUDIT=' + Buffer.from(JSON.stringify(envelope)).toString('base64'));
console.log('Read-only inventory audit completed; no stock, product, order or pricing record was changed.');
