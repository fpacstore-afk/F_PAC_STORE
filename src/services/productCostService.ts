import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { cleanFirestoreData } from '../lib/utils';

export async function savePrivateProductCost(params: {
  productId: string;
  slug?: string;
  costPrice?: number | null;
  costCalculation?: Record<string, any> | null;
}) {
  const numericCost = params.costPrice === null || params.costPrice === undefined
    ? null
    : Number(params.costPrice);

  await setDoc(doc(db, 'product_costs', params.productId), cleanFirestoreData({
    productId: params.productId,
    slug: params.slug || '',
    costPrice: Number.isFinite(numericCost as number) ? numericCost : null,
    cost: Number.isFinite(numericCost as number) ? numericCost : null,
    costCalculation: params.costCalculation || null,
    updatedAt: serverTimestamp()
  }), { merge: true });
}
