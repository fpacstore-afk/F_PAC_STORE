import type { PrimeArtworkPlacement } from '../../shared/primePlacement';
export interface PrintConfiguration {
  id: string;
  stampId?: string;
  stamp: string;
  location: string;
  printSize: string;
  image?: string;
  background: 'Com Fundo' | 'Sem Fundo';
  productionFiles?: any[];
  placement?: PrimeArtworkPlacement;
  rotationDeg?: number;
  orientationInstruction?: string;
  scale?: number;
  rotation?: number;
  offsetX?: number;
  offsetY?: number;
  colorFilter?: string;
}

export interface CartItem {
  garmentModelId?: string;
  garmentModelName?: string;
  neckline?: string;
  sizeChartMode?: string;
  modelSeparationRequired?: boolean;
  modelClassificationPending?: boolean;

  id: string;
  category?: string;
  productId?: string;
  slug?: string;
  baseProductSlug?: string;
  parentSlug?: string;
  stockBaseSlug?: string;
  stockMode?: 'shared' | 'ready_only';
  inventoryAllocations?: import('../../shared/sharedGarmentStock').InventoryAllocation[];
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  size: string;
  color: string;
  quantity: number;
  printConfigs?: PrintConfiguration[];
  weight?: number;
  width?: number;
  height?: number;
  length?: number;
}

export interface CustomerInfo {
  name: string;
  phone: string;
  phone2?: string;
  email: string;
  cpf: string;
  cep: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  shippingMethodName?: string;
  shippingServiceId?: number;
}

export interface CartStore {
  items: CartItem[];
  subtotal: number;
  couponDiscount: number;
  pixDiscount: number;
  flashSaleDiscount: number;
  total: number;
  coupon: string | null;
  shipping: number;
  quotedShipping?: number;
  observations: string;
  paymentMethod: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD';
  customerInfo: CustomerInfo;
  checkout_session_id?: string | null;
  recoveryConsent?: boolean;
  recoveryCancellationPending?: boolean;
  weeklyPromotionDiscount?: number;
  weeklyPromotionLabel?: string;
  shippingDiscount?: number;
  pixDiscountRate?: number;
}
