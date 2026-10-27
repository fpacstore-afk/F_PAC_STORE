import { garmentProfile, garmentTitle } from '../../shared/garmentModels';
import { createHash } from 'node:crypto';
import { getDb } from '../firebase.js';
import { round, validateQuote } from '../../shared/pricingWorkbench.js';
import { buildManualCustomOrderLines, buildManualCustomProduction } from '../../src/lib/manualCustomOrder.js';

const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
const clean = (value: any) => JSON.parse(JSON.stringify(value));

/** Convert the preserved commercial proposal, without repricing or receiving money. */
export function createQuoteOrderService(dbProvider = getDb) {
  return async (quoteId: string, expectedVersion: number, approved: boolean, actor: string) => {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(quoteId) || !Number.isInteger(expectedVersion) || approved !== true) fail('Confirme a aprovação do cliente e a versão do orçamento.');
    const db = dbProvider();
    const orderId = `MANUAL-QUOTE-${createHash('sha256').update(quoteId).digest('hex').slice(0, 32)}`;
    return db.runTransaction(async (tx: any) => {
      const quoteRef = db.collection('pricing_workbench_quotes').doc(quoteId);
      const orderRef = db.collection('orders').doc(orderId);
      const [snapshot, existing] = await Promise.all([tx.get(quoteRef), tx.get(orderRef)]);
      if (!snapshot.exists) fail('Orçamento não encontrado.', 404);
      const quote = snapshot.data();
      if (quote.version !== expectedVersion) fail('O orçamento mudou. Abra a versão atual antes de converter.', 409);
      if (existing.exists) {
        if (existing.data()?.sourceQuote?.id !== quoteId || existing.data()?.sourceQuote?.version !== expectedVersion) fail('Já existe outro pedido com esta identificação.', 409);
        return { orderId, alreadyCreated: true };
      }
      if (quote.convertedOrderId) fail('Este orçamento já possui um pedido. Abra o pedido vinculado.', 409);
      if (quote.status !== 'finalized') fail('Finalize e confira o orçamento antes de registrar a aprovação.');
      validateQuote(quote.input);
      const { input, result, catalog } = quote;
      if (!input.customer.trim()) fail('Informe o nome do cliente no orçamento antes de finalizar.');
      if (!result || result.errors?.length || !Number.isFinite(result.total) || result.total < 0 || result.items?.length !== input.items.length) fail('Os valores salvos do orçamento precisam de conferência.');
      const lines: any[] = [];
      const items = input.items.map((item: any, index: number) => {
        const calculated = result.items[index];
        if (!Number.isFinite(calculated.sale) || calculated.sale < 0 || !item.size.trim() || !item.color.trim()) fail('Confira preço, cor e tamanho de todos os itens antes de converter.');
        const product = catalog.entries.find((entry: any) => entry.id === item.productId && entry.kind === 'product');
        if (!product) fail('Um dos produtos não consta na memória salva do orçamento.');
        const built = buildManualCustomOrderLines({ groupId: `quote-${item.id}`, productName: garmentTitle(product.name, garmentProfile(product)), model: item.line, garmentColor: item.color, notes: item.description, unitPrice: calculated.sale, sizeRows: [{ id: item.id, size: item.size, quantity: item.quantity }], artworks: item.prints.map((print: any, n: number) => ({ id: `quote-${item.id}-${n}`, name: catalog.entries.find((entry: any) => entry.id === print.stampId && entry.kind === 'stamp')?.name || `Arte ${n + 1}`, location: print.position, color: '', artSize: print.width != null && print.height != null ? `${print.width} × ${print.height} cm` : '', notes: 'Referência do orçamento. Anexar e conferir a arte antes de produzir.' })) })[0];
        lines.push(built);
        const knownCost = typeof calculated.cost === 'number' && Number.isFinite(calculated.cost) && calculated.cost >= 0;
        return clean({ id: built.product.id, productId: built.product.id, slug: built.product.slug, parentSlug: built.product.parentSlug, manualLineId: built.id, name: built.displayName, ...(garmentProfile(product) ? { garmentModelId: product.id, garmentModelName: garmentProfile(product)!.garmentModelName } : {}), color: built.color, size: built.size, quantity: built.quantity, price: built.price, image: '/estampas/logo-fpac.png', customProduct: true, manualProductMode: 'custom', customDetails: built.customDetails, variantKey: `${built.color}_${built.size}`, customization: { prints: built.stamps.map(art => ({ stampId: art.id, location: art.location, artSize: art.artSize, source: 'own_art' })) }, printConfigs: built.stamps.map(art => ({ stampId: art.id, stamp: art.name, image: '', location: art.location, artSize: art.artSize, source: 'own_art' })), ...(knownCost ? { unitCostSnapshot: calculated.cost, totalCostSnapshot: calculated.cost * item.quantity } : {}), costCoverage: knownCost ? 'complete' : 'unavailable', costComposition: { version: 1, calculatedAt: quote.updatedAt || new Date().toISOString(), catalogVersion: quote.catalogVersion, mode: 'quote', components: calculated.components || [], pending: calculated.costPending || [], warnings: calculated.warnings || [] } });
      });
      const subtotal = round(items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0));
      const total = round(subtotal + input.shipping + input.surcharge - input.discount);
      if (total !== round(result.total) || subtotal !== round(result.subtotal)) fail('O total preservado difere dos itens. Revise o orçamento antes de converter.');
      const now = new Date().toISOString();
      const contact = String(input.contact || '').trim();
      // A free-form contact can be a handle or a note; only copy recognisable values.
      const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : '';
      const phone = !email && /^[+()\d\s.-]{8,30}$/.test(contact) ? contact : '';
      const order = clean({ id: orderId, customerName: input.customer.trim(), customerPhone: phone, customerEmail: email, customerContact: contact, items, customProduction: buildManualCustomProduction(lines), subtotal, shipping: input.shipping, surcharge: input.surcharge, couponDiscount: input.discount, total, amountPaid: 0, balanceDue: total, paymentStatus: 'pending', payment: { status: 'pending', paidAmount: 0, pendingAmount: total, method: input.payment || 'A combinar', installments: [] }, paymentMethod: input.payment || 'A combinar', paymentLogs: [], installments: [], status: 'received', productionStatus: 'waiting', shippingStatus: 'pending', shippingMethodName: input.shippingLabel, origin: 'Orçamento aprovado', gateway: 'manual', stockControl: 'no_move', inventoryLifecycle: 'unmanaged', isManual: true, isGift: false, orderKind: 'sale', observations: input.notes, productionDeadline: input.deadline, sourceQuote: { id: quoteId, version: quote.version, catalogVersion: quote.catalogVersion, validUntil: input.validUntil, contact, approvedBy: actor, approvedAt: now, approvalSource: 'admin_confirmation' }, createdAt: now, updatedAt: now });
      if (Buffer.byteLength(JSON.stringify(order)) > 850000) fail('Este orçamento gera um pedido muito grande. Divida os itens em propostas menores.');
      tx.set(orderRef, order);
      tx.update(quoteRef, { convertedOrderId: orderId, convertedAt: now, conversionActor: actor });
      tx.set(db.collection('pricing_workbench_events').doc(`conversion-${quoteId}`), { type: 'quote_conversion', quoteId, version: quote.version, orderId, actor, createdAt: now });
      return { orderId, alreadyCreated: false };
    });
  };
}
