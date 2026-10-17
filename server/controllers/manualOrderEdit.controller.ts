import { reconcileSharedStockEdit } from '../services/sharedStockEdit.service.js';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../firebase.js';
import { getOrderPaidAmount, getOrderRefundedAmount } from '../utils/orderFinancial.js';
import { reconcileEditedOrderStampsInTransaction } from '../services/stampStock.service.js';
import { buildManualCustomOrderLines, buildManualCustomProduction, inferManualStampPrintColor, isPrivateManualArtworkUrl } from '../../src/lib/manualCustomOrder.js';
import { manualEditLineId, resizeManualInstallments } from '../../shared/manualCustomOrderEditing.js';
import { calculateCustomOrderCosts } from '../../shared/orderCostComposition.js';

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status, code: status === 409 ? 'ORDER_EDIT_CONFLICT' : 'INVALID_ORDER_EDIT' });
}
function text(value: unknown, limit = 200): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > limit) invalid('Um dos campos do pedido é inválido ou muito longo.');
  return (value as string).trim();
}
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const costArtSignature = (arts: any[]) => JSON.stringify(arts.map(art => [art.source === 'catalog' ? art.id : art.image || 'pending', art.artSize || art.stockPrintSize || art.printSize || '', art.costRuleId || '']));

/** Reprice from trusted saved unit prices and reconcile only changed print reservations. */
export async function editManualCustomOrderController(req: Request, res: Response) {
  try {
    const orderId = text(req.params.orderId);
    const { expectedRevision, lines } = req.body || {};
    if (!orderId.startsWith('MANUAL-') || orderId.includes('/') || !Number.isInteger(expectedRevision) || expectedRevision < 0 || !Array.isArray(lines) || !lines.length || lines.length > 100) invalid('Informe um pedido manual e entre 1 e 100 linhas de tamanhos.');
    const db = getDb();
    const result = await db.runTransaction(async tx => {
      const ref = db.collection('orders').doc(orderId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) invalid('Pedido não encontrado.', 404);
      const order = snapshot.data()!;
      if (!order.isManual || (order.stockControl === 'move' && order.inventoryAllocationVersion !== 1) || !order.items?.length || !order.items.every((item: any) => item.customProduct && item.customDetails)) invalid('Esta edição está disponível para pedidos manuais personalizados compatíveis com o controle de estoque.');
      if (order.isGift === true || order.orderKind === 'gift') invalid('A edição de brindes precisa preservar o lançamento do custo. Faça essa revisão no financeiro antes de alterar as peças.');
      if (Number(order.customEditRevision || 0) !== expectedRevision) invalid('O pedido foi alterado por outra pessoa. Feche e abra a edição para carregar a versão atual.', 409);
      const statuses = [order.status, order.shippingStatus, order.productionStatus, order.paymentStatus].map(value => String(value || '').toLowerCase());
      if (statuses.some(value => ['shipped', 'delivered', 'entregue', 'cancelled', 'canceled', 'cancelado', 'completed', 'finalizado', 'concluído', 'refunded'].includes(value))) invalid('Reabra a operação do pedido antes de editar peças ou artes.');
      if (getOrderRefundedAmount(order) > 0) invalid('Este pedido possui estorno. Confira o financeiro antes de alterar o total.');
      const sources = new Map<string, any>(order.items.map((item: any, index: number) => [manualEditLineId(item, index), item]));
      const oldImages = new Set(order.items.flatMap((item: any) => (item.customDetails.artworks || []).map((art: any) => art.image).filter(Boolean)));
      const catalogs = new Map<string, any>();
      const lineIds = new Set<string>();
      let nextItems: any[] = [];
      for (const raw of lines) {
        const lineId = text(raw?.lineId);
        const source = sources.get(text(raw?.sourceLineId));
        const size = text(raw?.size, 60);
        if (!lineId || lineId.includes('/') || lineIds.has(lineId) || !source || !size || !Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > 10000 || !Array.isArray(raw.artworks) || raw.artworks.length > 20) invalid('Confira os tamanhos, quantidades e artes. Cada linha precisa de um tamanho e quantidade inteira positiva.');
        lineIds.add(lineId);
        const artIds = new Set<string>();
        const artworks: any[] = [];
        for (const art of raw.artworks) {
          const id = text(art?.id);
          if (!id || artIds.has(id)) invalid('Cada arte precisa de uma identificação única na linha.');
          artIds.add(id);
          const catalogStampId = text(art.catalogStampId);
          if (catalogStampId.includes('/') || catalogStampId.startsWith('own_art_')) invalid('Estampa do acervo inválida.');
          let catalog: any;
          if (catalogStampId) {
            if (!catalogs.has(catalogStampId)) {
              let found = await tx.get(db.collection('designs').doc(catalogStampId));
              if (!found.exists) found = await tx.get(db.collection('estampas').doc(catalogStampId));
              if (!found.exists) invalid('Uma das estampas não está mais cadastrada no acervo.');
              catalogs.set(catalogStampId, found.data());
            }
            catalog = catalogs.get(catalogStampId);
          }
          const image = catalog ? String(catalog.thumbnailUrl || catalog.mockupUrl || catalog.pngUrl || catalog.imageUrl || catalog.image || '') : text(art.image, 2048);
          if (image && !catalog && !isPrivateManualArtworkUrl(image) && !oldImages.has(image)) invalid('Envie a imagem pelo campo de arquivo ou importe o link antes de salvar.');
          const stockPrintSize = text(art.stockPrintSize, 80);
          if (catalog && (catalog.availableSizes?.length || Object.keys(catalog.stockBySize || {}).length) && !stockPrintSize) invalid('Escolha o tamanho de estoque da estampa do acervo.');
          artworks.push({ id, ...(catalogStampId ? { catalogStampId } : {}), code: catalog?.code || '', name: catalog ? String(catalog.name || catalog.code || catalogStampId) : text(art.name), location: text(art.location, 100), color: catalog ? inferManualStampPrintColor(catalog) : text(art.color, 80), artSize: text(art.artSize, 80), stockPrintSize, image, notes: text(art.notes, 1000), costRuleId: text(art.costRuleId, 100) });
        }
        const price = Number(source.price);
        if (!Number.isFinite(price) || price < 0) invalid('Preço anterior inválido. Confira o cadastro deste pedido.');
        const details = source.customDetails;
        const groupId = `edited-${createHash('sha256').update(JSON.stringify([details.productName, details.model, source.color, price, details.costRecipe || null, artworks])).digest('hex').slice(0, 24)}`;
        const built = buildManualCustomOrderLines({ groupId, companyName: details.companyName || '', productName: details.productName || source.name, model: details.model || '', garmentColor: source.color || details.garmentColor || '', notes: details.notes || '', unitPrice: price, ...(details.costRecipe ? { costRecipe: details.costRecipe } : {}), sizeRows: [{ id: lineId, size, quantity: raw.quantity }], artworks })[0];
        const first = built.stamps[0];
        const prints = built.stamps.map(art => ({ stampId: art.id, location: art.location, printSize: art.stockPrintSize || art.printSize, color: art.color, artSize: art.artSize }));
        const changedCostRecipe = costArtSignature(details.artworks || []) !== costArtSignature(built.customDetails.artworks);
        if (raw.confirmManualCost !== undefined && typeof raw.confirmManualCost !== 'boolean') invalid('Confirmação de custo inválida.');
        if (built.customDetails.costRecipe && (changedCostRecipe || source.size !== size)
          && (built.customDetails.costRecipe.manualMode || built.customDetails.costRecipe.manualUnitCost != null)) {
          built.customDetails.costRecipe = { ...built.customDetails.costRecipe, manualConfirmed: false };
        }
        if (built.customDetails.costRecipe && raw.confirmManualCost === true) {
          built.customDetails.costRecipe = { ...built.customDetails.costRecipe, manualConfirmed: true };
        }
        nextItems.push(clean({ ...source, manualLineId: lineId, size, quantity: raw.quantity, price, customDetails: built.customDetails, variantKey: `${source.color || ''}_${size}`, stampId: first?.id || '', stampName: first?.name || '', stampImage: first?.image || '', stampStatus: first?.status || '', customization: { ...(source.customization || {}), prints }, printConfigs: built.stamps.map(art => ({ stampId: art.id, stamp: art.name, image: art.image, status: art.status, location: art.location, color: art.color, artSize: art.artSize, printSize: art.stockPrintSize || art.printSize, stockPrintSize: art.stockPrintSize, notes: art.notes, source: art.source })), ...(Number.isFinite(Number(source.unitCostSnapshot)) ? { totalCostSnapshot: Math.round(Number(source.unitCostSnapshot) * raw.quantity * 100) / 100 } : {}), ...(changedCostRecipe ? { costEditReviewRequired: true, costCoverage: Number(source.unitCostSnapshot) > 0 ? 'estimated' : 'unavailable' } : {}) }));
      }
      if (order.costCatalogSnapshot?.catalog) {
        nextItems = calculateCustomOrderCosts(nextItems, order.costCatalogSnapshot.catalog, order.costCatalogSnapshot.version)
          .map(item => item.customDetails?.costRecipe ? { ...item, costEditReviewRequired: item.costCoverage !== 'complete' } : item);
      }
      const gift = order.isGift === true || order.orderKind === 'gift';
      const subtotal = gift ? 0 : nextItems.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0) / 100;
      const shipping = Number(order.pricing?.shipping ?? order.shipping ?? 0);
      const discount = Number(order.pricing?.couponDiscount ?? order.couponDiscount ?? 0);
      const surcharge = Number(order.pricing?.surcharge ?? order.surcharge ?? 0);
      const total = gift ? 0 : Math.max(0, Math.round((subtotal + shipping + surcharge - discount) * 100) / 100);
      const paid = gift ? 0 : getOrderPaidAmount(order);
      if (![shipping, discount, surcharge, total, paid].every(Number.isFinite) || shipping < 0 || discount < 0 || surcharge < 0 || paid < 0) invalid('Os valores financeiros anteriores precisam de conferência.');
      if (Math.round(total * 100) < Math.round(paid * 100)) invalid('O novo total ficaria abaixo do valor já recebido. Registre o estorno necessário antes de reduzir as peças.');
      const pending = Math.max(0, Math.round((total - paid) * 100) / 100);
      const status = gift ? 'not_applicable' : pending === 0 ? 'approved' : paid > 0 ? 'partially_paid' : 'pending';
      const schedule = order.payment?.installments?.length ? order.payment.installments : order.installments || [];
      let installments: any[];
      try { installments = gift ? [] : resizeManualInstallments(schedule, total); } catch (error: any) { invalid(error.message); }
      const revision = expectedRevision + 1;
      const updates: any = clean({ items: nextItems, subtotal, total, amountPaid: paid, balanceDue: pending, paymentStatus: status, installments: installments!, payment: { ...(order.payment || {}), status, paidAmount: paid, pendingAmount: pending, installments: installments! }, customProduction: buildManualCustomProduction(nextItems.map(item => ({ ...item, mode: 'custom' }))), customEditRevision: revision, ...(order.pricing ? { pricing: { ...order.pricing, subtotal, total } } : {}) });
      if (gift) updates.giftCost = { knownCost: Math.round(nextItems.reduce((sum, item) => sum + Number(item.totalCostSnapshot || 0), 0) * 100) / 100, unknownUnits: nextItems.reduce((sum, item) => sum + (item.costCoverage === 'complete' ? 0 : item.quantity), 0), coverage: nextItems.every(item => item.costCoverage === 'complete') ? 'complete' : 'partial' };
      try {
        if (order.inventoryAllocationVersion === 1) updates.items = await reconcileSharedStockEdit(tx, db, orderId, order, nextItems, revision);
        else await reconcileEditedOrderStampsInTransaction(tx, db, orderId, order.items, nextItems, revision);
      }
      catch (error: any) { invalid(error.message || 'Confira as reservas das estampas antes de editar.', 409); }
      tx.update(ref, { ...updates, updatedAt: FieldValue.serverTimestamp() });
      const actor = (req as any).user?.email || (req as any).user?.uid || 'Admin';
      tx.set(db.collection('order_edit_events').doc(`${orderId}_${revision}`), { orderId, revision, actor, createdAt: new Date().toISOString(), previousItems: order.items, items: updates.items, previousTotal: Number(order.pricing?.total ?? order.total), total, paidAmount: paid });
      tx.set(db.collection('audit_logs').doc(`custom_order_edit_${orderId}_${revision}`), { action: 'EDIT_MANUAL_CUSTOM_ORDER', resource: 'orders', resourceId: orderId, userId: (req as any).user?.uid || 'admin', userEmail: actor, timestamp: new Date().toISOString(), metadata: { revision, previousTotal: Number(order.pricing?.total ?? order.total), total, paidAmount: paid } });
      return { revision, total, paidAmount: paid, pendingAmount: pending };
    });
    return res.json({ success: true, orderId, ...result });
  } catch (error: any) {
    return res.status(error.status || 500).json({ error: error.code || 'ORDER_EDIT_FAILED', message: error.message || 'Não foi possível salvar as alterações.' });
  }
}

export async function getManualOrderEditHistoryController(req: Request, res: Response) {
  try {
    const orderId = text(req.params.orderId);
    if (!orderId.startsWith('MANUAL-') || orderId.includes('/')) invalid('Pedido inválido.');
    const snapshot = await getDb().collection('order_edit_events').where('orderId', '==', orderId).get();
    const events = snapshot.docs.map(doc => doc.data()).sort((a, b) => b.revision - a.revision).slice(0, 20).map(event => ({ revision: event.revision, actor: event.actor, createdAt: event.createdAt, previousTotal: event.previousTotal, total: event.total, paidAmount: event.paidAmount, previousUnits: event.previousItems.reduce((sum: number, item: any) => sum + Number(item.quantity), 0), units: event.items.reduce((sum: number, item: any) => sum + Number(item.quantity), 0) }));
    return res.json({ events });
  } catch (error: any) { return res.status(error.status || 500).json({ message: error.message || 'Não foi possível carregar o histórico.' }); }
}
