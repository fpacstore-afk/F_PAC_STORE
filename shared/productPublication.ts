export type ProductPublicationStatus = 'active' | 'inactive' | 'draft' | 'archived';

// The stock table previously passed its Portuguese display label to the editor,
// which saved "Ativa" / "Rascunho" back to Firestore. Read those legacy values
// without publishing unknown states, and always save the canonical value.
export function normalizeProductStatus(value: unknown): ProductPublicationStatus {
  const status = String(value ?? '').trim().toLowerCase();
  if (!status || ['active', 'ativa', 'ativo'].includes(status)) return 'active';
  if (['draft', 'rascunho'].includes(status)) return 'draft';
  if (['archived', 'arquivado', 'arquivada'].includes(status)) return 'archived';
  return 'inactive';
}

export function isProductPublished(product: { status?: unknown; productFinish?: unknown }): boolean {
  return product.productFinish !== 'plain' && normalizeProductStatus(product.status) === 'active';
}
