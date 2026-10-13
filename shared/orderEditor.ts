export type OrderEditArtwork = {
  stampId: string;
  name: string;
  code: string;
  location: string;
  color: string;
  printSize: string;
  artSize: string;
  image: string;
  source?: string;
  status?: string;
};

function artworkId(print: any): string {
  const id = String(print?.stampId || print?.catalogStampId || '').trim();
  if (id) return id;
  return print?.source === 'catalog' ? String(print?.id || '').trim() : '';
}

/** Read the supported legacy and current order artwork shapes into one editor shape. */
export function getOrderEditArtworks(item: any): OrderEditArtwork[] {
  const source = Array.isArray(item?.printConfigs) ? item.printConfigs
    : Array.isArray(item?.stamps) ? item.stamps
      : Array.isArray(item?.customization?.prints) ? item.customization.prints
        : Array.isArray(item?.stampRecipe) ? item.stampRecipe
          : item?.stampId || item?.stampName || item?.stamp
            ? [{
              stampId: item.stampId,
              name: item.stampName || item.stamp,
              code: item.stampCode,
              location: item.stampLocation,
              color: item.stampColor,
              printSize: item.printSize || item.stockPrintSize,
              artSize: item.artSize || item.artworkSize,
              image: item.stampImage,
            }]
            : [];

  return source.map((print: any) => ({
    stampId: artworkId(print),
    name: String(print?.name || print?.stampName || print?.stamp || print?.code || '').trim(),
    code: String(print?.code || '').trim(),
    location: String(print?.location || '').trim(),
    color: String(print?.color || '').trim(),
    printSize: String(print?.printSize || print?.stockPrintSize || print?.size || '').trim(),
    artSize: String(print?.artSize || print?.artworkSize || print?.printSize || print?.stockPrintSize || '').trim(),
    image: String(print?.image || print?.thumbnailUrl || print?.mockupUrl || print?.pngUrl || '').trim(),
    ...(print?.source ? { source: String(print.source) } : {}),
    ...(print?.status ? { status: String(print.status) } : {}),
  }));
}

/** Apply editor artwork to all order snapshots consumed by production and stock code. */
export function applyOrderEditArtworks(item: any, artworks: OrderEditArtwork[], product?: any) {
  const printConfigs = artworks.map((art) => ({
    ...(art.stampId ? { stampId: art.stampId } : {}),
    stamp: art.name,
    stampName: art.name,
    ...(art.code ? { code: art.code } : {}),
    ...(art.location ? { location: art.location } : {}),
    ...(art.color ? { color: art.color } : {}),
    ...(art.printSize ? { printSize: art.printSize, size: art.printSize } : {}),
    ...(art.artSize ? { artSize: art.artSize } : {}),
    ...(art.image ? { image: art.image } : {}),
    ...(art.source ? { source: art.source } : {}),
    ...(art.status ? { status: art.status } : {}),
  }));

  const next: any = {
    ...item,
    printConfigs,
    stampId: printConfigs.length === 1 ? printConfigs[0].stampId || '' : '',
    stampName: printConfigs.length === 1 ? printConfigs[0].stampName || '' : '',
    stampStatus: printConfigs.length === 1 ? printConfigs[0].status || '' : '',
  };

  const catalogPrints = printConfigs
    .filter((print) => print.stampId && !String(print.stampId).startsWith('own_art_'))
    .map((print) => ({ stampId: print.stampId, printSize: print.printSize || print.size || '' }));

  if (Array.isArray(item?.stamps)) {
    next.stamps = artworks.map((art) => ({
      ...(art.stampId ? { id: art.stampId, catalogStampId: art.stampId, source: art.source || 'catalog' } : { source: 'customer' }),
      name: art.name,
      ...(art.code ? { code: art.code } : {}),
      ...(art.location ? { location: art.location } : {}),
      ...(art.color ? { color: art.color } : {}),
      ...(art.printSize ? { printSize: art.printSize, stockPrintSize: art.printSize } : {}),
      ...(art.artSize ? { artSize: art.artSize } : {}),
      ...(art.image ? { image: art.image } : {}),
    }));
  }

  if (Array.isArray(item?.customization?.prints) || item?.mode === 'custom' || item?.customDetails) {
    next.customization = {
      ...(item.customization || {}),
      prints: catalogPrints,
    };
  }

  if (Array.isArray(item?.stampRecipe) || product?.productFinish === 'printed') {
    next.stampRecipe = catalogPrints;
  }

  return next;
}

export function calculateOrderEditTotals(items: any[], shipping: unknown, discount: unknown) {
  const subtotal = Math.round(items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0) * 100) / 100;
  const shippingAmount = Math.max(0, Number(shipping) || 0);
  const discountAmount = Math.max(0, Number(discount) || 0);
  return {
    subtotal,
    shipping: shippingAmount,
    couponDiscount: discountAmount,
    total: Math.round(Math.max(0, subtotal + shippingAmount - discountAmount) * 100) / 100,
  };
}

export function validateOrderEditDraft(items: any[], origin: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) return 'O pedido precisa ter ao menos um item.';
  if (items.length > 100) return 'O pedido excede o limite de 100 itens.';
  if (!String(origin || '').trim()) return 'Selecione o canal de venda.';

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    if (!String(item.name || '').trim()) return `Informe o produto do item ${index + 1}.`;
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return `A quantidade do item ${index + 1} deve ser um número inteiro entre 1 e 999.`;
    if (String(item.price ?? '').trim() === '') return `Informe um preço para o item ${index + 1}.`;
    const price = Number(item.price);
    if (!Number.isFinite(price) || price < 0 || price > 1000000) return `Informe um preço válido para o item ${index + 1}.`;
    const artworks = Array.isArray(item.artworks) ? item.artworks : [];
    for (const [artIndex, art] of artworks.entries()) {
      if (!String(art.name || '').trim()) return `Informe o nome da estampa ${artIndex + 1} do item ${index + 1}.`;
      if (art.stampId && !String(art.printSize || '').trim()) return `Informe a medida de estoque da estampa ${art.name}.`;
    }
  }
  return null;
}
