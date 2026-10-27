import { garmentTitle } from '../../shared/garmentModels';
import { getStampDisplayName, getStampSearchAliases, type StampNameSource } from '../../shared/stampDisplayNames';

export type ProductTitleSource = {
  name?: unknown;
  garmentModelName?: string;
  catalogName?: unknown;
  headline?: unknown;
  collection?: unknown;
  stampIds?: unknown;
  stampIdsByColor?: unknown;
};

const normalizeTitlePart = (value: unknown) => String(value ?? '').trim().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function buildStampNameMap(stamps: StampNameSource[]): Record<string, string> {
  const names: Record<string, string> = Object.create(null);
  for (const stamp of stamps) {
    const name = getStampDisplayName(stamp);
    if (!name) continue;
    for (const key of [stamp.id, stamp.code]) {
      const normalizedKey = String(key ?? '').trim();
      if (normalizedKey) names[normalizedKey] = name;
    }
  }
  return names;
}

function titleStampIds(product: ProductTitleSource | null | undefined, selectedColor: string): unknown[] {
  const recipes = product?.stampIdsByColor && typeof product.stampIdsByColor === 'object' && !Array.isArray(product.stampIdsByColor)
    ? product.stampIdsByColor as Record<string, unknown> : {};
  if (selectedColor && Object.keys(recipes).length) {
    const key = Object.keys(recipes).find(color => normalizeTitlePart(color) === normalizeTitlePart(selectedColor));
    // Never label a chosen garment color with another color's artwork.
    return key && Array.isArray(recipes[key]) ? recipes[key] as unknown[] : [];
  }
  if (Array.isArray(product?.stampIds) && product.stampIds.length) return product.stampIds;
  return Object.values(recipes).find(value => Array.isArray(value) && value.length) as unknown[] || [];
}

export function getStorefrontProductTitle(
  product: ProductTitleSource | null | undefined,
  stampNames: Record<string, string> = {},
  selectedColor = '',
): string {
  const name = String(product?.name ?? '').trim();
  const catalogName = String(product?.catalogName ?? '').trim();
  const headline = String(product?.headline ?? '').trim();
  // Commercial lines remain in their separate badges, not in the artwork title.
  const baseTitle = (headline || catalogName || name || 'Peça F PAC STORE')
    .replace(/\s*\|\s*(FORCE|MARK|PRIME)\s*$/i, '').trim();
  const artworkName = titleStampIds(product, selectedColor)
    .map(id => stampNames[String(id ?? '').trim()])
    .find(value => Boolean(value?.trim()))
    ?.trim().replace(/\s+[-–—]\s+(Preto|Branco|Neon)$/i, '');
  if (!artworkName) return garmentTitle(catalogName && !selectedColor ? name : baseTitle, product);
  return garmentTitle(normalizeTitlePart(baseTitle).includes(normalizeTitlePart(artworkName))
    ? baseTitle : `${baseTitle} — ${artworkName}`, product);
}

/** Public presentation only: never rewrite stored product names, recipes or old orders. */
export function withStorefrontProductNames<T extends ProductTitleSource>(products: T[], stamps: StampNameSource[]) {
  const names = buildStampNameMap(stamps);
  const aliases = new Map<string, string[]>();
  for (const stamp of stamps) {
    for (const key of [stamp.id, stamp.code]) {
      if (key) aliases.set(String(key), getStampSearchAliases(stamp));
    }
  }
  return products.map(product => {
    const byColor = product.stampIdsByColor && typeof product.stampIdsByColor === 'object'
      ? Object.values(product.stampIdsByColor).flatMap(ids => Array.isArray(ids) ? ids : []) : [];
    const ids = [...(Array.isArray(product.stampIds) ? product.stampIds : []), ...byColor];
    return {
      ...product,
      catalogName: String(product.catalogName ?? product.name ?? ''),
      name: getStorefrontProductTitle(product, names),
      searchAliases: [...new Set(ids.flatMap(id => aliases.get(String(id)) || []))],
    };
  });
}
