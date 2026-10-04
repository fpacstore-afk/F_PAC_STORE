export interface ManualCustomArtworkInput {
  id: string;
  catalogStampId?: string;
  code?: string;
  name: string;
  location: string;
  color: string;
  artSize: string;
  stockPrintSize?: string;
  notes?: string;
  image?: string;
  status?: string;
}

export interface ManualCustomSizeInput {
  id: string;
  size: string;
  quantity: number;
}

export interface ManualCustomOrderInput {
  companyName?: string;
  productName: string;
  model: string;
  garmentColor: string;
  notes?: string;
  unitPrice: number;
  unitCost?: number;
  sizeRows: ManualCustomSizeInput[];
  artworks: ManualCustomArtworkInput[];
}

/** Only show or encode links created by the private artwork upload flow. */
export function isPrivateManualArtworkUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['fpacstore.com.br', 'www.fpacstore.com.br', 'fpac-store62.web.app', 'f-pac-store-n-o-s-roupa-identidade-ooc3wzri3q-ue.a.run.app'].includes(url.hostname)
      && !url.port && !url.username && !url.password
      && /^\/api\/artwork\/[a-f0-9-]{36}$/.test(url.pathname)
      && /^[a-f0-9]{64}$/.test(url.searchParams.get('token') || '');
  } catch { return false; }
}

export function inferManualStampPrintColor(stamp: any): string {
  const explicit = [stamp?.printColor, stamp?.inkColor, stamp?.stampColor, stamp?.color]
    .find((value) => typeof value === 'string' && value.trim());
  if (explicit) return String(explicit).trim();
  const variant = [stamp?.variant, stamp?.name, stamp?.code, stamp?.sku, stamp?.id]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (/\b(preta?|black|blk)\b/.test(variant)) return 'Preta';
  if (/\b(branca?|white|wht)\b/.test(variant)) return 'Branca';
  if (/\b(vermelha?|red)\b/.test(variant)) return 'Vermelha';
  if (/\b(amarela?|yellow)\b/.test(variant)) return 'Amarela';
  if (/\b(azul|blue)\b/.test(variant)) return 'Azul';
  return '';
}

/** Keep artwork rows only when the operator entered some useful detail or chose a catalog stamp. */
export function filterManualCustomArtworkRows(artworks: ManualCustomArtworkInput[]) {
  return artworks.filter((art) => String(art.catalogStampId || '').trim() || [
    art.name, art.location, art.color, art.artSize, art.notes, art.image,
  ].some((value) => String(value || '').trim()));
}

/** Turns a custom garment's size grid into regular order lines while preserving
 * exact catalog artwork IDs and placements for production and print-stock debit. */
export function buildManualCustomOrderLines(input: ManualCustomOrderInput) {
  const productName = input.productName.trim();
  const companyName = String(input.companyName || '').trim();
  const model = input.model.trim();
  const garmentColor = input.garmentColor.trim();
  const displayName = [productName, model].filter(Boolean).join(' · ');
  const productId = 'manual-custom-uniform';
  const product = {
    id: productId,
    slug: productId,
    parentSlug: productId,
    name: productName,
    image: '/estampas/logo-fpac.png',
    costPrice: Number(input.unitCost) || 0,
  };
  const artworks = input.artworks.map((art) => {
    const catalogStampId = String(art.catalogStampId || '').trim();
    const stockPrintSize = String(art.stockPrintSize || '').trim();
    const artSize = String(art.artSize || '').trim();
    return {
      id: catalogStampId || `own_art_${art.id}`,
      name: String(art.name || '').trim(),
      code: art.code || undefined,
      location: String(art.location || '').trim(),
      color: String(art.color || '').trim(),
      printSize: catalogStampId ? (stockPrintSize || undefined) : artSize,
      stockPrintSize: catalogStampId ? (stockPrintSize || undefined) : undefined,
      artSize,
      notes: String(art.notes || '').trim(),
      image: art.image || '',
      status: art.status || 'active',
      source: catalogStampId ? 'catalog' : 'own_art',
    };
  });
  const customDetails = {
    companyName,
    productName,
    model,
    garmentColor,
    notes: String(input.notes || '').trim(),
    artworks: artworks.map(({ id, name, code, location, color, printSize, stockPrintSize, artSize, notes, image, source }) => ({
      id, name, code, location, color, printSize, stockPrintSize, artSize, notes, image, source,
    })),
  };

  return input.sizeRows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.size.trim() && Number(row.quantity) > 0)
    .map(({ row, index }) => ({
      id: `${productId}-${row.id || index}`,
      product,
      color: garmentColor,
      size: row.size.trim(),
      quantity: Math.max(1, Math.trunc(Number(row.quantity) || 1)),
      price: Math.max(0, Number(input.unitPrice) || 0),
      mode: 'custom' as const,
      displayName,
      customDetails,
      stamps: artworks,
    }));
}
