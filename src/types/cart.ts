export interface PrintConfiguration {
  id: string;
  stampId?: string;
  stamp: string;
  location: string;
  printSize: string;
  image?: string;
  background: 'Com Fundo' | 'Sem Fundo';
  productionFiles?: any[];
  scale?: number;
  rotation?: number;
  offsetX?: number;
  offsetY?: number;
  colorFilter?: string;
}

export interface CartItem {
  id: string;
  slug?: string;
  parentSlug?: string;
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
  observations: string;
  paymentMethod: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD';
  customerInfo: CustomerInfo;
  checkout_session_id?: string | null;
  weeklyPromotionDiscount?: number;
  weeklyPromotionLabel?: string;
  shippingDiscount?: number;
  pixDiscountRate?: number;
}
