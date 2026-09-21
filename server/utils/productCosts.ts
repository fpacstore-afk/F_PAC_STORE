type FirestoreDocument = {
  id: string;
  data: (() => Record<string, any>) | Record<string, any>;
};

function documentData(document: FirestoreDocument): Record<string, any> {
  return typeof document.data === 'function' ? document.data() : (document.data || {});
}

export function mergePrivateProductCost(
  product: Record<string, any>,
  privateCost?: Record<string, any>
) {
  if (!privateCost) return product;

  return {
    ...product,
    costPrice: privateCost.costPrice ?? undefined,
    cost: privateCost.cost ?? privateCost.costPrice ?? undefined,
    costCalculation: privateCost.costCalculation ?? undefined
  };
}

/** Server/admin-only catalog view. Public product documents remain cost-free. */
export async function loadProductsWithPrivateCosts(db: any): Promise<any[]> {
  const [productsSnapshot, costsSnapshot] = await Promise.all([
    db.collection('products').get(),
    db.collection('product_costs').get()
  ]);

  const costsByProductId = new Map<string, Record<string, any>>();
  for (const costDocument of costsSnapshot?.docs || []) {
    costsByProductId.set(costDocument.id, documentData(costDocument));
  }

  return (productsSnapshot?.docs || []).map((productDocument: FirestoreDocument) => {
    const product = { ...documentData(productDocument), id: productDocument.id };
    return mergePrivateProductCost(product, costsByProductId.get(productDocument.id));
  });
}

export async function loadPrivateProductCost(db: any, productId: string) {
  if (!productId) return undefined;
  const costDocument = await db.collection('product_costs').doc(productId).get();
  return costDocument?.exists ? documentData(costDocument) : undefined;
}
