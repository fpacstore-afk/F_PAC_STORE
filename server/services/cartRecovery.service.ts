import { readRecoveryCartByToken } from './automation.service.js';
import { loadPublicCatalog } from './publicCatalog.service.js';
import { calculateOrderPricing } from './pricing.service.js';
import { getProductGallery } from '../../src/lib/productGallery.js';
import { getCustomizationProfileByCartSlug } from '../../shared/customizationProfiles.js';

/** Returns product choices only. No customer, checkout credential, costs or delivery data. */
export async function restoreRecoveryCart(id: string, token: string) {
  const savedItems = await readRecoveryCartByToken(id, token);
  const catalog = await loadPublicCatalog();
  const products = [...catalog.products, ...catalog.primeBases] as any[];
  const messages: string[] = [];
  const candidates: any[] = [];
  const used = new Map<string, number>();
  for (const saved of savedItems.slice(0, 60)) {
    const product = products.find(product => [product.id, product.slug].some(key => key && [saved.productId, saved.baseProductSlug, saved.id, saved.slug].includes(key)));
    const prime = getCustomizationProfileByCartSlug(saved.slug || '');
    if (!product || (Array.isArray(saved.printConfigs) && saved.printConfigs.length && !prime)) { messages.push('Um produto não está mais disponível e não será incluído.'); continue; }
    const physicalId = product.stockBaseSlug ? (product.slug || product.id) : (product.parentSlug || product.slug || product.id);
    const stock = catalog.availability[physicalId] || catalog.availability[product.id];
    const variant = stock?.variants?.[`${saved.color}_${saved.size}`];
    if (!stock?.available || !variant?.available || variant.availableQuantity <= 0) { messages.push(`${product.name}: a cor ${saved.color} no tamanho ${saved.size} está indisponível.`); continue; }
    const key = `${physicalId}/${saved.color}/${saved.size}`;
    const sharedId = product.stockBaseSlug || (product.productFinish === 'plain' ? physicalId : '');
    const sharedKey = sharedId ? `plain:${sharedId}/${saved.color}/${saved.size}` : '';
    const plainQuantity = product.stockBaseSlug ? (variant as any).madeToOrderQuantity || 0 : product.productFinish === 'plain' ? variant.availableQuantity : 0;
    const readyQuantity = product.stockBaseSlug ? (variant as any).readyQuantity || 0 : product.productFinish === 'plain' ? 0 : variant.availableQuantity;
    const readyRemaining = Math.max(0, readyQuantity - (used.get(key) || 0));
    const plainRemaining = sharedKey ? Math.max(0, plainQuantity - (used.get(sharedKey) || 0)) : 0;
    const remaining = readyRemaining + plainRemaining;
    if (!remaining) { messages.push(`${product.name}: não há mais unidades desta combinação.`); continue; }
    const quantity = Math.min(Math.max(1, Math.floor(Number(saved.quantity) || 1)), remaining);
    const fromReady = Math.min(quantity, readyRemaining);
    used.set(key, (used.get(key) || 0) + fromReady);
    if (sharedKey) used.set(sharedKey, (used.get(sharedKey) || 0) + quantity - fromReady);
    if (quantity < saved.quantity) messages.push(`${product.name}: quantidade ajustada ao estoque atual (${quantity}).`);
    candidates.push({ ...saved, productId: product.id, slug: prime ? saved.slug : product.slug, parentSlug: product.parentSlug, baseProductSlug: prime ? product.slug : undefined, quantity, catalogProduct: product });
  }
  if (!candidates.length) return { items: [], messages: [...messages, 'Nenhum item desta sacola está disponível agora.'] };
  const { verifiedItems } = await calculateOrderPricing({ items: candidates, customerInfo: {} }, { priceOnly: true });
  const items = verifiedItems.map((verified, index) => {
    const source = candidates[index];
    const product = source.catalogProduct;
    const prime = getCustomizationProfileByCartSlug(source.slug);
    return {
      id: source.id, productId: verified.productId, slug: source.slug, parentSlug: verified.parentSlug,
      ...(prime ? { baseProductSlug: product.slug, printConfigs: verified.customization?.prints || [] } : {}),
      name: prime ? `${product.name} PRIME` : verified.name, price: verified.price, originalPrice: verified.originalPrice,
      color: verified.color, size: verified.size, quantity: verified.quantity,
      image: prime ? `/product-visuals/${prime.id}-front-v1.webp` : getProductGallery(product, verified.color)[0] || '',
      category: verified.category, weight: verified.weight, width: verified.width, height: verified.height, length: verified.length,
    };
  });
  return { items, messages };
}
