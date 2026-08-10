export interface VariantStock {
  color?: string;
  size?: string;
  stock: number;
  minStock?: number;
}

export interface InventoryVariant {
  id: string; // e.g. `${productSlug}_${color}_${size}` or variantId
  productId: string;
  productSlug: string;
  variantId: string;
  sku: string;
  color: string;
  size: string;

  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;

  minimumStock: number;
  maximumStock?: number;

  active: boolean;

  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryItem {
  id: string;
  slug: string;
  productName: string;
  category?: string;
  totalPhysicalStock?: number;
  totalReservedStock?: number;
  totalAvailableStock?: number;
  totalStock: number;
  available: boolean;
  variants: Record<string, InventoryVariant | VariantStock | any>;
  lastUpdated?: string;
}

export type StockMovementType =
  | 'purchase_entry'
  | 'manual_entry'
  | 'reservation'
  | 'reservation_release'
  | 'sale'
  | 'production_consumption'
  | 'return'
  | 'adjustment_increase'
  | 'adjustment_decrease'
  | 'loss'
  | 'damage'
  | 'add'
  | 'subtract'
  | 'adjust';

export interface StockMovement {
  id: string;
  productId?: string;
  productSlug: string;
  variantKey: string;
  sku?: string;

  type: StockMovementType;
  quantity: number;

  previousPhysicalQuantity: number;
  newPhysicalQuantity: number;
  previousReservedQuantity: number;
  newReservedQuantity: number;
  previousAvailableQuantity: number;
  newAvailableQuantity: number;

  referenceType?: 'order' | 'manual' | 'purchase' | 'return' | 'webhook';
  referenceId?: string;

  reason: string;
  performedBy: string;
  createdAt: string;
  idempotencyKey?: string;
}

export interface StockReservation {
  id: string;
  orderId: string;
  productSlug: string;
  variantKey: string;
  sku?: string;
  quantity: number;
  status: 'active' | 'fulfilled' | 'released';
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}
