export interface VariantStock {
  color?: string;
  size?: string;
  stock: number;
  minStock?: number;
}

export interface InventoryItem {
  id: string;
  slug: string;
  productName: string;
  category?: string;
  totalStock: number;
  available: boolean;
  variants: Record<string, VariantStock>;
  lastUpdated?: string;
}

export interface StockMovement {
  id: string;
  inventoryId: string;
  productName: string;
  variantKey?: string;
  type: 'add' | 'subtract' | 'adjust' | 'sale';
  quantity: number;
  previousStock: number;
  newStock: number;
  reason?: string;
  operator: string;
  timestamp: string;
}
