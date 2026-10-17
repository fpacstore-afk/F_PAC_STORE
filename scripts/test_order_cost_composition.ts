import assert from 'node:assert/strict';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { artworkDimensions, calculateCustomOrderCosts, type OrderCostRecipe } from '../shared/orderCostComposition';
import { emptyCatalog, type Catalog, type Entry } from '../shared/pricingWorkbench';
import { buildManualCustomOrderLines } from '../src/lib/manualCustomOrder';
import { getOrderCogs } from '../shared/orderCostCoverage';
import { hasRecordedShippingCost } from '../shared/orderFinancialCore';
import { manualOrderEditLines } from '../shared/manualCustomOrderEditing';
import { prepareManualOrderCosts } from '../server/services/orderCosts.service';
import { createManualOrderController } from '../server/controllers/admin.controller';
import { editManualCustomOrderController } from '../server/controllers/manualOrderEdit.controller';
import { calculateOrderFinancials as clientFinancials } from '../src/utils/orderFinancial';
import { calculateOrderFinancials as serverFinancials } from '../server/utils/orderFinancial';
import { sanitizeTrackingResponse } from '../server/services/tracking.service';

const db = requireIsolatedTestDb();
const entry = (id: string, kind: Entry['kind'], name: string, rest: Partial<Entry> = {}): Entry => ({ id, kind, name, active: true, status: 'Confirmado', date: '2099-01-01', source: { kind: 'app' }, ...rest });
const catalog: Catalog = {
  ...emptyCatalog(),
  rules: { ...emptyCatalog().rules, sheetWidth: 56, sheetHeight: 100, sheetCost: 56, gap: 0, dtfStatus: 'Confirmado', dtfCostBasis: 'consumed' },
  entries: [entry('shirt', 'product', 'Camiseta', { supplier: 'Fornecedor', sizes: ['P', 'G'], colors: ['Preto'] }),
    entry('p', 'price', 'Peça P', { product: 'Camiseta', supplier: 'Fornecedor', size: 'P', cost: 20, minQty: 1 }),
    entry('g', 'price', 'Peça G', { product: 'Camiseta', supplier: 'Fornecedor', size: 'G', cost: 30, minQty: 1 }),
    entry('bulk', 'price', 'Atacado P', { product: 'Camiseta', supplier: 'Fornecedor', size: 'P', cost: 18, minQty: 10 }),
    entry('dtf', 'stamp', 'DTF', { method: 'dtf' }),
    entry('pack', 'extra', 'Embalagem', { cost: 1, basis: 'unit', defaultForOrders: true }),
    entry('apply', 'extra', 'Aplicação', { cost: 3, basis: 'unit', defaultForOrders: true }),
    entry('setup', 'extra', 'Preparação do pedido', { cost: 12, basis: 'quote' })],
};
const recipe: OrderCostRecipe = { productId: 'shirt', line: '', printRuleId: 'dtf', extraIds: ['pack', 'apply', 'setup'], extrasReviewed: true, manualUnitCost: null, manualConfirmed: false, manualReason: '' };
const built = buildManualCustomOrderLines({ productName: 'Camiseta', model: 'Tradicional', garmentColor: 'Preto', unitPrice: 80, costRecipe: recipe,
  sizeRows: [{ id: 'p', size: 'P', quantity: 2 }, { id: 'g', size: 'G', quantity: 1 }], artworks: [{ id: 'logo', name: 'Logo', color: '', location: 'Frente', artSize: '10 × 10 cm' }] });
const lines = built.map(line => ({ ...line, id: line.product.id, productId: line.product.id, manualLineId: line.id, customProduct: true, name: line.displayName }));
assert.deepEqual(artworkDimensions(' 2,5 x 3 cm '), { width: 2.5, height: 3 });
assert.deepEqual(artworkDimensions('A4'), { width: null, height: null });
assert.deepEqual(artworkDimensions('10x10 mm'), { width: null, height: null });
let calculated = calculateCustomOrderCosts(lines, catalog, 1);
assert.deepEqual(calculated.map(line => [line.unitCostSnapshot, line.totalCostSnapshot, line.costCoverage]), [[29, 58, 'complete'], [39, 39, 'complete']]);
assert.equal(getOrderCogs({ items: calculated }).cogs, 97);
assert.equal(calculated.reduce((sum, line) => sum + line.costComposition.components.find((c: any) => c.name === 'Preparação do pedido').unitCost * line.quantity, 0), 12, 'one order-wide cost is shared once across sizes');
const purchaseCatalog = { ...catalog, rules: { ...catalog.rules, dtfCostBasis: 'purchase' as const } };
calculated = calculateCustomOrderCosts(lines, purchaseCatalog);
assert.equal(getOrderCogs({ items: calculated }).cogs, 150, 'whole DTF purchase is allocated once, without also adding consumed material');
const bulk = calculateCustomOrderCosts([{ ...lines[0], quantity: 10 }], catalog)[0];
assert.equal(bulk.totalCostSnapshot, 242, 'quantity tiers use the selected reference, color and size');
const missing = structuredClone(lines); missing[0].customDetails.artworks[0].artSize = ''; missing[0].customDetails.artworks[0].printSize = '';
assert.equal(calculateCustomOrderCosts(missing, catalog)[0].costCoverage, 'estimated');
const unreviewed = structuredClone(lines); unreviewed[0].customDetails.costRecipe!.extrasReviewed = false;
assert.match(calculateCustomOrderCosts(unreviewed, catalog)[0].costComposition.pending.join(' '), /embalagem/);
const manual = structuredClone(lines[0]);
manual.customDetails.costRecipe = { ...recipe, manualMode: true, manualUnitCost: 0, manualConfirmed: true, manualReason: 'Peça fornecida pelo cliente, sem aplicação' };
assert.equal(calculateCustomOrderCosts([manual], catalog)[0].costCoverage, 'complete', 'explicit confirmed zero differs from unknown');
manual.customDetails.costRecipe.manualUnitCost = null;
assert.equal(calculateCustomOrderCosts([manual], catalog)[0].costCoverage, 'unavailable');
manual.customDetails.costRecipe.manualUnitCost = 25; manual.customDetails.costRecipe.manualConfirmed = false;
assert.equal(calculateCustomOrderCosts([manual], catalog)[0].costCoverage, 'estimated');
const mixedOverride = structuredClone(lines);
mixedOverride[1].customDetails = structuredClone(mixedOverride[1].customDetails);
mixedOverride[1].customDetails.costRecipe = { ...recipe, manualMode: true, manualUnitCost: 50, manualConfirmed: true, manualReason: 'Custo total conferido' };
mixedOverride[1].customDetails.artworks[0].artSize = '20 × 20 cm';
const mixedCost = calculateCustomOrderCosts(mixedOverride, purchaseCatalog);
assert.equal(mixedCost[1].unitCostSnapshot, 50, 'manual total replaces rather than adds to automatic costs');
assert.ok(Math.abs(mixedCost[0].costComposition.components[1].unitCost - 56 * 100 / 600) < 1e-9, 'manual totals still participate in the DTF lot and allocation');
assert.equal(mixedCost[0].costComposition.components.find((c: any) => c.name === 'Preparação do pedido').unitCost, 4);

await db.collection('pricing_workbench').doc('catalog').set({ catalog, version: 1 });
const id = 'MANUAL-COST-ISOLATED';
const order = { id, items: lines.map(line => ({ ...line, unitCostSnapshot: 0.01, totalCostSnapshot: 0.01, costCoverage: 'complete', costComposition: { components: ['forged'] } })),
  total: 240, subtotal: 240, shipping: 0, paymentStatus: 'pending', amountPaid: 0, balanceDue: 240, payment: { paidAmount: 0, pendingAmount: 240, status: 'pending', installments: [] }, stockControl: 'no_move', printSupplyMode: 'on_demand', status: 'received', productionStatus: 'waiting', shippingStatus: 'pending', expectedCostCatalogVersion: 1 };
const capture = () => ({ statusCode: 200, body: {} as any, status(code: number) { this.statusCode = code; return this; }, json(value: any) { this.body = value; return this; } });
const create = async (input: any) => { const res = capture(); await createManualOrderController({ body: { order: input }, user: { uid: 'cost-tester' } } as any, res as any); return res; };
assert.equal((await create(order)).statusCode, 201);
const read = async () => (await db.collection('orders').doc(id).get()).data();
let saved = await read();
assert.equal(saved.items[0].unitCostSnapshot, 29, 'server resolves costs from the trusted catalog');
assert.equal(saved.costCatalogSnapshot.version, 1);
const before = JSON.stringify(saved.items);
const changed = structuredClone(catalog); changed.entries.find(e => e.id === 'p')!.cost = 50;
await db.collection('pricing_workbench').doc('catalog').set({ catalog: changed, version: 2 });
assert.equal(JSON.stringify((await read()).items), before, 'catalog update never rewrites an existing order');
assert.equal((await create(order)).statusCode, 201);
assert.equal(JSON.stringify((await read()).items), before, 'retry also preserves original snapshots');
assert.equal((await create({ ...order, id: 'MANUAL-COST-STALE' })).statusCode, 409, 'stale preview must be reviewed before creating');
const draft = manualOrderEditLines(saved); draft[0].quantity = 10; draft[0].artworks[0].artSize = '20 × 20 cm';
const res = capture();
await editManualCustomOrderController({ params: { orderId: id }, body: { expectedRevision: 0, lines: draft }, user: { uid: 'cost-tester' } } as any, res as any);
assert.equal(res.statusCode, 200, JSON.stringify(res.body)); saved = await read();
assert.equal(saved.items[0].unitCostSnapshot, 27.09, 'edit recalculates quantity tier and artwork using the original supplier rates');
assert.equal(saved.items[0].costCoverage, 'complete');
assert.equal(saved.items[0].costEditReviewRequired, false);
assert.equal(saved.items[1].costComposition.components.find((c: any) => c.name === 'Preparação do pedido').unitCost, 12 / 11, 'shared cost is reallocated across all surviving lines');
assert.equal((await db.collection('order_edit_events').doc(`${id}_1`).get()).data().previousItems[0].unitCostSnapshot, 29);
assert.equal(saved.amountPaid, 0, 'cost changes do not record receipts');
const manualId = 'MANUAL-COST-OVERRIDE-EDIT';
const manualLine = structuredClone(lines[0]);
manualLine.customDetails.costRecipe = { ...recipe, manualMode: true, manualUnitCost: 25, manualConfirmed: true, manualReason: 'Custo total conferido' };
assert.equal((await create({ ...order, id: manualId, items: [manualLine], total: 160, subtotal: 160, expectedCostCatalogVersion: 2 })).statusCode, 201);
const manualRead = async () => (await db.collection('orders').doc(manualId).get()).data();
let manualDraft = manualOrderEditLines(await manualRead()); manualDraft[0].artworks[0].artSize = '15 × 15 cm';
const editManual = async (draft: any[], revision: number) => { const response = capture(); await editManualCustomOrderController({ params: { orderId: manualId }, body: { expectedRevision: revision, lines: draft }, user: { uid: 'cost-tester' } } as any, response as any); assert.equal(response.statusCode, 200, JSON.stringify(response.body)); };
await editManual(manualDraft, 0);
assert.equal((await manualRead()).items[0].costCoverage, 'estimated', 'changing artwork cannot silently confirm the previous manual cost');
manualDraft = manualOrderEditLines(await manualRead()); manualDraft[0].confirmManualCost = true;
await editManual(manualDraft, 1);
assert.equal((await manualRead()).items[0].costCoverage, 'complete', 'operator can explicitly reconfirm the preserved manual cost');
assert.equal((await manualRead()).items[0].unitCostSnapshot, 25);
assert.equal((await manualRead()).amountPaid, 0);
await db.collection('products').doc('catalog-shirt').set({ slug: 'catalog-shirt', name: 'Catálogo' });
await db.collection('product_costs').doc('catalog-shirt').set({ costPrice: 22, costCalculation: { coverage: 'partial', pendingComponents: ['Aplicação'] } });
const catalogOrder = await prepareManualOrderCosts({ items: [{ productId: 'catalog-shirt', quantity: 2, unitCostSnapshot: 0.01 }] }, db);
assert.equal(catalogOrder.items[0].totalCostSnapshot, 44);
assert.equal(catalogOrder.items[0].costCoverage, 'estimated');
assert.equal(hasRecordedShippingCost({ shipping: 20 }), false, 'customer freight charge is not actual shop cost');
assert.equal(hasRecordedShippingCost({ shippingCost: 0 }), true);
const completeOrder = { ...order, items: calculateCustomOrderCosts(lines, catalog), payment: { gatewayFee: 0 }, shippingCost: 0 };
assert.equal(clientFinancials(completeOrder).isResultProvisional, false);
assert.equal(serverFinancials(completeOrder).isResultProvisional, false);
assert.equal(clientFinancials({ ...completeOrder, shippingCost: undefined }).isResultProvisional, true);
const publicView = sanitizeTrackingResponse(id, saved);
assert.doesNotMatch(JSON.stringify(publicView), /costRecipe|costComposition|costCatalogSnapshot|Fornecedor|unitCost/);
console.log('PASS: automatic component costs, mixed quantities, DTF allocation, missing vs zero, trusted creation, historical edits, catalog updates and private cost data.');
