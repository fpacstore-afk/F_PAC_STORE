import { manualProductIdentity } from './manualProductIdentity';

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const readableName = (value: unknown) => String(value || 'Produto')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\s+(?:F\s*PAC|FPAC)(?:\s+STORE)?$/i, '')
  .replace(/\b(camiseta|camisa|oversized|boxy|tradicional|cropped|suedine|bermuda|linho|cargo)\b/gi,
    word => word[0].toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR'));

const uniqueLabels = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = normalize(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const singleColor = (product: any) => {
  const explicit = typeof product.colorName === 'string' ? product.colorName.trim() : '';
  if (explicit) return explicit;
  const colors = uniqueLabels((Array.isArray(product.colors) ? product.colors : [])
    .map((color: any) => typeof color === 'string' ? color : color?.name)
    .filter((color: unknown): color is string => typeof color === 'string' && Boolean(color.trim())));
  return colors.length === 1 ? colors[0].trim() : '';
};

export function stockProductIdentity(product: any, designs: Array<{ id: string; name?: string; code?: string }>) {
  const stampIds = (Array.isArray(product.stampIds) ? product.stampIds : []).filter(Boolean);
  const stamps = uniqueLabels(stampIds.map((id: string) => {
    const design = designs.find(item => item.id === id);
    return String(design?.name || design?.code || id).trim();
  }));
  const identity = manualProductIdentity({ ...product, stampNames: stamps });
  const baseName = readableName(product.name);
  const artwork = stamps.filter(stamp => !normalize(baseName).includes(normalize(stamp)));
  const withArtwork = artwork.length ? `${baseName} ${artwork.join(' + ')}` : baseName;
  const color = singleColor(product);
  const displayName = color && !normalize(withArtwork).endsWith(normalize(color))
    ? `${withArtwork} - ${color}` : withArtwork;
  const searchable = normalize([
    displayName, product.name, identity.reference, identity.details, product.id, product.slug,
    ...stampIds.map((id: string) => {
      const design = designs.find(item => item.id === id);
      return [id, design?.code, design?.name].filter(Boolean).join(' ');
    }),
    ...(Array.isArray(product.colors) ? product.colors.map((item: any) => typeof item === 'string' ? item : item?.name) : []),
    product.category, product.displayCategory, product.linha, ...(Array.isArray(product.tags) ? product.tags : [])
  ].join(' '));
  return { ...identity, displayName, searchable };
}

export function matchesStockProduct(searchable: string, query: string): boolean {
  return normalize(query).split(/\s+/).every(word => searchable.includes(word));
}

export function duplicateProductReferences(products: Array<{ id?: string; sku?: string }>): Set<string> {
  const owners = new Map<string, Set<string | number>>();
  products.forEach((product, index) => {
    const sku = normalize(product.sku);
    if (!sku) return;
    const ids = owners.get(sku) || new Set();
    ids.add(product.id || index);
    owners.set(sku, ids);
  });
  return new Set([...owners].filter(([, ids]) => ids.size > 1).map(([sku]) => sku));
}

export function hasDuplicateProductReference(sku: string, duplicates: Set<string>): boolean {
  return duplicates.has(normalize(sku));
}
