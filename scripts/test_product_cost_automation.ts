import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {
  AUDITED_FALLBACK_COST_PROFILES,
  buildAutomaticCostMetadata,
  resolveProductCostProfile
} from '../shared/productCostProfiles';
import { validateSheetSyncPayload } from '../server/utils/sheetValidation';
import { loadProductsWithPrivateCosts, mergePrivateProductCost } from '../server/utils/productCosts';

const root = process.cwd();

const forcePrinted = resolveProductCostProfile(AUDITED_FALLBACK_COST_PROFILES, {
  baseModel: 'Oversized Premium 240GSM',
  productFinish: 'printed',
  collection: 'FORCE'
});
assert(forcePrinted, 'o perfil auditado FORCE estampado deve ser encontrado');
assert.equal(forcePrinted.unitCost, 30.51, 'o COGS não pode incluir os R$ 0,79 da taxa de checkout');
assert.equal(forcePrinted.coverage, 'partial', 'o valor auditado deve permanecer identificado como parcial');

const exactWins = resolveProductCostProfile([
  { id: 'generic', baseModel: 'Oversized Premium 240GSM', productFinish: 'all', collection: 'TODOS', unitCost: 20, coverage: 'complete' },
  { id: 'exact', baseModel: 'Oversized Premium 240GSM', productFinish: 'printed', collection: 'FORCE', unitCost: 31, coverage: 'complete' }
], {
  baseModel: 'Oversized Premium 240GSM',
  productFinish: 'printed',
  collection: 'FORCE'
});
assert.equal(exactWins?.id, 'exact', 'o perfil mais específico deve vencer o perfil genérico');

const sanitized = validateSheetSyncPayload({
  costProfiles: [{
    id: 'oversized-force',
    baseModel: 'Oversized Premium 240GSM',
    productFinish: 'printed',
    collection: 'FORCE',
    unitCost: '32,45',
    coverage: 'partial',
    pendingComponents: 'energia, mão de obra',
    active: true
  }]
});
assert.equal(sanitized.isValid, true);
assert.equal(sanitized.sanitized?.costProfiles?.[0].unitCost, 32.45);
assert.deepEqual(sanitized.sanitized?.costProfiles?.[0].pendingComponents, ['energia', 'mão de obra']);

const contradictoryCoverage = validateSheetSyncPayload({
  costProfiles: [{
    id: 'unsafe-complete',
    baseModel: 'Oversized Premium 240GSM',
    productFinish: 'printed',
    collection: 'FORCE',
    unitCost: 40,
    coverage: 'complete',
    pendingComponents: 'energia'
  }]
});
assert.equal(contradictoryCoverage.sanitized?.costProfiles?.[0].coverage, 'partial', 'um custo com componentes pendentes não pode ser marcado como completo');

const metadata = buildAutomaticCostMetadata(forcePrinted, '2026-09-20T00:00:00.000Z');
assert.equal(metadata.mode, 'automatic');
assert.equal(metadata.coverage, 'partial');

const drawer = fs.readFileSync(path.join(root, 'src/components/admin/products/ProductManagementDrawer.tsx'), 'utf8');
assert.match(drawer, /readOnly=\{!!automaticCostProfile\}/, 'o custo automático no drawer deve ser somente leitura');
assert.match(drawer, /buildAutomaticCostMetadata\(automaticCostProfile\)/, 'o produto deve salvar a origem do cálculo');
assert.match(drawer, /savePrivateProductCost\(/, 'o drawer deve salvar custos na coleção privada');
assert.match(drawer, /costPrice: deleteField\(\)/, 'o drawer deve remover custos legados do documento público');

const wizard = fs.readFileSync(path.join(root, 'src/components/admin/products/ProductFormWizard.tsx'), 'utf8');
assert.match(wizard, /savePrivateProductCost\(/, 'o assistente de cadastro deve salvar custos na coleção privada');
assert.match(wizard, /costCalculation: deleteField\(\)/, 'o assistente deve remover metadados de custo do documento público');

const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
assert.match(rules, /match \/product_costs\/\{productId\}[\s\S]*?allow read, write: if isAdmin\(\);/, 'custos privados devem exigir administrador');
assert.match(rules, /match \/products\/\{productId\}[\s\S]*?allow read: if true;/, 'o catálogo público deve continuar legível sem depender de custos');

const privateCostService = fs.readFileSync(path.join(root, 'src/services/productCostService.ts'), 'utf8');
assert.match(privateCostService, /doc\(db, 'product_costs', params\.productId\)/, 'o cliente administrativo deve gravar na coleção privada');

const privateWins = mergePrivateProductCost(
  { id: 'prod-1', costPrice: 99, costCalculation: { coverage: 'complete' } },
  { costPrice: 30.51, costCalculation: { coverage: 'partial' } }
);
assert.equal(privateWins.costPrice, 30.51, 'o custo privado deve prevalecer sobre qualquer valor legado público');
assert.equal(privateWins.costCalculation.coverage, 'partial');
assert.equal(mergePrivateProductCost({ id: 'legacy', costPrice: 20 }).costPrice, 20, 'a migração deve preservar leitura legada temporária');

const adminCatalog = await loadProductsWithPrivateCosts({
  collection(name: string) {
    return {
      async get() {
        if (name === 'products') {
          return { docs: [{ id: 'prod-1', data: () => ({ slug: 'force', price: 99.9 }) }] };
        }
        if (name === 'product_costs') {
          return { docs: [{ id: 'prod-1', data: () => ({ costPrice: 30.51, costCalculation: { coverage: 'partial' } }) }] };
        }
        throw new Error(`coleção inesperada: ${name}`);
      }
    };
  }
});
assert.equal(adminCatalog[0].price, 99.9, 'a leitura administrativa deve preservar os dados públicos');
assert.equal(adminCatalog[0].costPrice, 30.51, 'a leitura administrativa deve combinar o custo privado');

const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
assert.match(server, /collection\('settings'\)\.doc\('product_costs'\)/, 'o sync deve persistir a fonte central');
assert.match(server, /unitCostSnapshot gravado no momento da venda/, 'a atualização deve documentar a preservação histórica');
assert.match(server, /collection\('product_costs'\)\.doc\(productDoc\.id\)/, 'o sync deve aplicar o custo na coleção privada');
assert.match(server, /costPrice: deleteFirestoreField/, 'o sync deve limpar custos legados do catálogo público');

const pricing = fs.readFileSync(path.join(root, 'server/services/pricing.service.ts'), 'utf8');
assert.match(pricing, /costCalculation\?\.coverage !== 'partial'/, 'checkout deve marcar perfis parciais como estimados');
assert.match(pricing, /loadPrivateProductCost\(db, canonicalProductId\)/, 'checkout deve ler o custo privado pelo ID canônico');

for (const file of [
  'server/controllers/commercialBudget.controller.ts',
  'server/controllers/commercialForecast.controller.ts',
  'server/controllers/commercialGovernance.controller.ts',
  'server/utils/commercialDataset.ts'
]) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(source, /loadProductsWithPrivateCosts/, `${file} deve usar o catálogo administrativo com custos privados`);
}

const manualOrders = fs.readFileSync(path.join(root, 'src/pages/AdminOrders.tsx'), 'utf8');
assert.match(manualOrders, /unitCostSnapshot/, 'pedidos manuais devem congelar o custo do momento da venda');

const financial = fs.readFileSync(path.join(root, 'src/components/AdminFinancial.tsx'), 'utf8');
assert.match(financial, /CUSTOS PRODUTO/, 'o Apps Script deve criar e ler a aba central de custos');
assert.match(financial, /"x-sync-secret": SYNC_SECRET/, 'o Apps Script deve autenticar o envio ao site');

const financialAst = ts.createSourceFile('AdminFinancial.tsx', financial, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
let appsScript = '';
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'APPS_SCRIPT_PROMPT' && node.initializer && ts.isNoSubstitutionTemplateLiteral(node.initializer)) {
    appsScript = node.initializer.text;
  }
  ts.forEachChild(node, visit);
};
visit(financialAst);
assert(appsScript.length > 0, 'o código copiável do Apps Script deve ser encontrado');
const appsScriptAst = ts.createSourceFile('Code.gs', appsScript, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
const appsScriptDiagnostics = ((appsScriptAst as any).parseDiagnostics || []) as Array<{ messageText: string }>;
assert.equal(appsScriptDiagnostics.length, 0, `Apps Script inválido: ${appsScriptDiagnostics.map(d => d.messageText).join('; ')}`);

console.log('✅ Automação e privacidade de custos de produto: verificações aprovadas.');
