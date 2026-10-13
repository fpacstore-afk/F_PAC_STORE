export type ProductTitleSource = {
  name?: unknown;
  headline?: unknown;
  collection?: unknown;
  stampIds?: unknown;
  stampIdsByColor?: unknown;
};

const normalizeTitlePart = (value: unknown) => String(value ?? '')
  .trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

export function buildStampNameMap(stamps: Array<{ id?: unknown; code?: unknown; name?: unknown }>): Record<string, string> {
  const names: Record<string, string> = {};
  for (const stamp of stamps) {
    const name = String(stamp.name ?? '').trim();
    if (!name) continue;
    for (const key of [stamp.id, stamp.code]) {
      const normalizedKey = String(key ?? '').trim();
      if (normalizedKey) names[normalizedKey] = name;
    }
  }
  return names;
}

export function getStorefrontProductTitle(
  product: ProductTitleSource | null | undefined,
  stampNames: Record<string, string> = {},
  selectedColor = '',
): string {
  const name = String(product?.name ?? '').trim();
  const headline = String(product?.headline ?? '').trim();
  const baseTitle = headline || name || 'Peça F PAC STORE';
  const recipes = product?.stampIdsByColor && typeof product.stampIdsByColor === 'object'
    ? product.stampIdsByColor as Record<string, unknown>
    : {};
  const selectedKey = Object.keys(recipes).find(key => normalizeTitlePart(key) === normalizeTitlePart(selectedColor));
  const colorRecipe = selectedKey ? recipes[selectedKey] : undefined;
  const allColorRecipes = Object.values(recipes).find(value => Array.isArray(value) && value.length > 0);
  const stampIds = Array.isArray(colorRecipe) && colorRecipe.length > 0
    ? colorRecipe
    : Array.isArray(product?.stampIds) && product.stampIds.length > 0
      ? product.stampIds
      : Array.isArray(allColorRecipes) ? allColorRecipes : [];
  const artworkName = stampIds
    .map(id => stampNames[String(id ?? '').trim()])
    .find(value => Boolean(value?.trim()))
    ?.trim();
  const collection = String(product?.collection ?? '').trim();
  const parts = [baseTitle];
  for (const candidate of [artworkName, collection]) {
    const normalizedCandidate = normalizeTitlePart(candidate);
    if (normalizedCandidate && !parts.some(part => normalizeTitlePart(part).includes(normalizedCandidate))) {
      parts.push(String(candidate).trim());
    }
  }
  return parts.join(' | ');
}
