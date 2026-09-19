import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

const server = read('server.ts');
const media = read('server/controllers/media.controller.ts');
const uploader = read('src/services/cloudinary.ts');
const stamps = read('src/components/admin/AdminStampsManager.tsx');
const printCss = read('src/index.css');
const shipping = read('src/components/admin/shipping/AdminShippingCenter.tsx');
const productWizard = read('src/components/admin/products/ProductFormWizard.tsx');
const productDrawer = read('src/components/admin/products/ProductManagementDrawer.tsx');
const goals = read('src/components/admin/financial/FinancialGoalsView.tsx');
const payables = read('src/components/admin/financial/AccountsPayableManager.tsx');
const adminController = read('server/controllers/admin.controller.ts');
const melhorEnvioService = read('server/services/melhor-envio.service.ts');
const adminOrders = read('src/pages/AdminOrders.tsx');
const firestoreRules = read('firestore.rules');

const checks: Array<[string, () => void]> = [
  ['media upload is authenticated, rate-limited and accepts raw mobile image/video bodies', () => {
    assert.match(server, /admin\/media\/upload[\s\S]*adminApiLimiter[\s\S]*authenticateAdmin[\s\S]*express\.raw/);
    assert.match(media, /image\/png/);
    assert.match(media, /video\/mp4/);
    assert.match(media, /getStorageBucket/);
  }],
  ['upload reports real progress and cannot remain pending forever', () => {
    assert.match(uploader, /xhr\.upload\.onprogress/);
    assert.match(uploader, /xhr\.timeout/);
    assert.match(uploader, /ontimeout/);
    assert.match(stamps, /Tentar novamente/);
    assert.match(stamps, /setFailedUpload\(\{ file, type, message \}\)/);
  }],
  ['stamp form uses manual sizes, multiple products and no tag editor', () => {
    assert.match(stamps, /até 5, preenchimento manual/i);
    assert.match(stamps, /Todos os produtos/);
    assert.doesNotMatch(stamps, /TAGS \(SEPARADAS POR VÍRGULA\)/i);
  }],
  ['product information removes legacy slogan/seal fields and accepts TODOS', () => {
    assert.doesNotMatch(productWizard, /HEADLINE \/ SLOGAN CURTO/i);
    assert.doesNotMatch(productDrawer, /SELO DO PRODUTO/i);
    assert.match(productWizard, /\['TODOS', 'FORCE', 'MARK', 'PRIME'/);
    assert.match(productDrawer, /TODOS/);
  }],
  ['shipping print uses an isolated portal and hides the application tree', () => {
    assert.match(shipping, /createPortal/);
    assert.match(printCss, /body > #root[\s\S]*display: none !important/);
    assert.match(printCss, /break-inside: avoid/);
  }],
  ['financial goals use received payments and are promoted on the dashboard', () => {
    assert.match(goals, /paymentLogs/);
    assert.match(goals, /FinancialGoalSummary/);
    assert.match(goals, /Meta de faturamento do mês/);
  }],
  ['accounts payable has compact mobile cards and payment history', () => {
    assert.match(payables, /md:hidden/);
    assert.match(payables, /Pago no Mês/);
    assert.match(adminController, /paymentHistory/);
    assert.match(adminController, /sourceType: 'accounts_payable'/);
  }],
  ['cash forecast schedules installments and prevents payable double counting', () => {
    assert.match(adminController, /payableCashflowRefs/);
    assert.match(adminController, /receivableDueBy/);
    assert.doesNotMatch(adminController.slice(adminController.indexOf('export async function getCashForecastController')), /investmentsSnap/);
  }],
  ['Melhor Envio token can be configured safely inside the authenticated admin', () => {
    assert.match(server, /apiRouter\.post\("\/shipping\/config"[\s\S]*authenticateAdmin/);
    assert.match(server, /collection\('server_secrets'\)\.doc\('melhorenvio'\)/);
    assert.match(server, /validateCredentials\(normalizedToken, sanitizedUrl\)/);
    assert.doesNotMatch(server.slice(server.indexOf('apiRouter.get("/shipping/config"'), server.indexOf('apiRouter.post("/shipping/config"')), /token:\s*(?:process|tokenStatus)/);
    assert.match(melhorEnvioService, /shipment\/calculate/);
    assert.match(melhorEnvioService, /timeout:\s*15_000/);
    assert.match(adminOrders, /Validar e conectar/);
    assert.match(adminOrders, /type=\{meTokenVisible \? 'text' : 'password'\}/);
    assert.match(firestoreRules, /match \/server_secrets\/\{secretId\}[\s\S]*allow read, write: if false/);
  }]
];

for (const [name, check] of checks) {
  check();
  console.log(`✅ ${name}`);
}

console.log(`\n🔎 Integrated audit checks passed: ${checks.length}/${checks.length}`);
