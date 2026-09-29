const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Internal order entry must distinguish products that share a storefront title. */
export function manualProductIdentity(product: any) {
  const reference = String(product.sku || product.reference || product.slug || product.id || product.name || 'Produto');
  const firstImage = product.images?.[0];
  const image = typeof firstImage === 'string' ? firstImage : firstImage?.url || product.image || product.imageUrl || '';
  const stampNames = Array.isArray(product.stampNames) ? product.stampNames : [product.stampName];
  const details = [product.collection, product.fit || product.baseModel || product.productType, ...stampNames].filter(Boolean).join(' · ');
  const name = String(product.name || 'Produto');
  const design = stampNames.filter(Boolean).join(' + ');
  const displayName = design ? `${name} · ${design}` : `${name} · ${reference}`;
  return { reference, image, details, displayName };
}
export function matchesManualProduct(product: any, query: string): boolean {
  const identity = manualProductIdentity(product);
  const source = normalize([identity.reference, identity.details, product.name, product.headline, product.category].join(' '));
  return normalize(query).trim().split(/\s+/).every(word => source.includes(word));
}
