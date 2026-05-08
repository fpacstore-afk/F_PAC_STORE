export interface PrintConfiguration {
  id: string;
  stamp: string;
  location: string;
  background: 'Com Fundo' | 'Sem Fundo';
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  size: string;
  color: string;
  quantity: number;
  printConfigs?: PrintConfiguration[];
}

export interface CartStore {
  items: CartItem[];
  subtotal: number;
  couponDiscount: number;
  pixDiscount: number;
  total: number;
  coupon: string | null;
  shipping: number;
  observations: string;
  paymentMethod: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD';
}
