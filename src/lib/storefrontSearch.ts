const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const searchTerms = (value: unknown) => normalize(value).replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const equivalent = (word: string) => {
  if (['camisa', 'camisas', 'camiseta', 'camisetas'].includes(word)) return 'camiseta';
  if (['preta', 'preto'].includes(word)) return 'preto';
  if (['branca', 'branco'].includes(word)) return 'branco';
  if (['marinho', 'azulmarinho'].includes(word)) return 'marinho';
  if (['militar', 'verdemilitar'].includes(word)) return 'militar';
  return word;
};

const attributeNames = (entries: unknown, key: string) => Array.isArray(entries) ? entries.flatMap(entry => {
  if (typeof entry === 'string') return [entry];
  if (!entry || typeof entry !== 'object') return [];
  return [entry[key], entry.name, entry.label, entry.colorName, entry.color, entry.size].filter(Boolean);
}) : [];

export function matchesStorefrontSearch(product: any, query: string): boolean {
  const words = searchTerms(query).map(equivalent);
  if (!words.length) return false;
  const searchable = normalize([
    product.name, product.sku, product.slug, product.parentSlug, product.headline, product.collection, product.category,
    product.productType, product.baseModel, product.description, ...(Array.isArray(product.tags) ? product.tags : []),
    ...(Array.isArray(product.searchAliases) ? product.searchAliases : []),
    product.fabric, product.gsm, product.fit, product.collar, product.garmentModelName,
    ...attributeNames(product.colors, 'name'), ...attributeNames(product.variants, 'colorName'),
    ...attributeNames(product.sizes, 'size'),
  ].join(' '));
  const tokens = searchTerms(searchable).map(equivalent);
  return words.every(word => tokens.some(token => token.includes(word)));
}
