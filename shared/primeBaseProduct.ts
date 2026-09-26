import { normalizeProductStatus } from './productPublication';

export function isPrimeBaseProduct(product: any): boolean {
  // Plain stock is deliberately saved as an internal draft by the editor.
  // It may supply PRIME, but must never appear as a finished catalog product.
  return product?.productFinish === 'plain' && product.primeBaseEnabled !== false
    && ['active', 'draft'].includes(normalizeProductStatus(product.status));
}
