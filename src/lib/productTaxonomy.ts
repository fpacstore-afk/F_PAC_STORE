export type CanonicalProductCategory = 'tshirt' | 'shorts' | 'jacket' | 'cropped' | 'other';
export type ProductSizeSystem = 'alpha' | 'numeric' | 'custom';

export interface ProductCategoryDefinition {
  id: CanonicalProductCategory;
  label: string;
  pluralLabel: string;
  aliases: string[];
  defaultSizeSystem: ProductSizeSystem;
  displayOrder: number;
}

export const PRODUCT_CATEGORIES: readonly ProductCategoryDefinition[] = [
  {
    id: 'tshirt',
    label: 'Camiseta',
    pluralLabel: 'Camisetas',
    aliases: ['camiseta', 'camisetas', 'tshirt', 't-shirt', 'shirt', 'oversized', 'suedine'],
    defaultSizeSystem: 'alpha',
    displayOrder: 10,
  },
  {
    id: 'shorts',
    label: 'Bermuda',
    pluralLabel: 'Bermudas',
    aliases: ['bermuda', 'bermudas', 'short', 'shorts'],
    defaultSizeSystem: 'alpha',
    displayOrder: 20,
  },
  {
    id: 'jacket',
    label: 'Casaco',
    pluralLabel: 'Casacos',
    aliases: ['casaco', 'casacos', 'moletom', 'moletons', 'jacket', 'hoodie', 'corta-vento'],
    defaultSizeSystem: 'alpha',
    displayOrder: 30,
  },
  {
    id: 'cropped',
    label: 'Cropped',
    pluralLabel: 'Feminino',
    aliases: ['cropped', 'croppeds', 'feminino', 'female'],
    defaultSizeSystem: 'alpha',
    displayOrder: 40,
  },
  {
    id: 'other',
    label: 'Outro',
    pluralLabel: 'Outros',
    aliases: ['other', 'outro', 'outros'],
    defaultSizeSystem: 'custom',
    displayOrder: 999,
  },
] as const;

const normalize = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export function normalizeProductCategory(value: unknown): CanonicalProductCategory {
  const normalized = normalize(value);
  if (!normalized) return 'tshirt';

  const direct = PRODUCT_CATEGORIES.find(category => category.id === normalized);
  if (direct) return direct.id;

  const alias = PRODUCT_CATEGORIES.find(category => category.aliases.includes(normalized));
  return alias?.id || 'other';
}

export function getProductCategory(product: {
  productType?: unknown;
  category?: unknown;
  name?: unknown;
}): CanonicalProductCategory {
  const explicit = normalize(product.productType);
  if (explicit) return normalizeProductCategory(explicit);

  const legacy = normalize(product.category);
  if (legacy) return normalizeProductCategory(legacy);

  const name = normalize(product.name);
  const matched = PRODUCT_CATEGORIES.find(category =>
    category.id !== 'other' && category.aliases.some(alias => name.includes(alias)),
  );
  return matched?.id || 'tshirt';
}

export function getActiveProductCategories<T extends { status?: unknown; productType?: unknown; category?: unknown; name?: unknown }>(
  products: readonly T[],
): ProductCategoryDefinition[] {
  const activeIds = new Set<CanonicalProductCategory>();

  products.forEach(product => {
    const status = normalize(product.status);
    if (status === 'inactive' || status === 'draft' || status === 'archived' || status === 'hidden') return;
    activeIds.add(getProductCategory(product));
  });

  return PRODUCT_CATEGORIES
    .filter(category => category.id !== 'other' && activeIds.has(category.id))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function productMatchesCategory(
  product: { productType?: unknown; category?: unknown; name?: unknown },
  category: string,
): boolean {
  if (!category || category === 'all') return true;
  return getProductCategory(product) === normalizeProductCategory(category);
}

const skuPart = (value: unknown): string => normalize(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toUpperCase();

export function buildVariantSku(input: {
  baseSku?: string;
  slug?: string;
  category?: string;
  color?: string;
  size?: string;
}): string {
  const base = skuPart(input.baseSku || input.slug || input.category || 'FPAC');
  const color = skuPart(input.color || 'UNICA');
  const size = skuPart(input.size || 'UNICO');
  return [base, color, size].filter(Boolean).join('-');
}
