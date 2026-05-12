export interface PrintConfiguration {
  id: string;
  stamp: string;
  location: string;
  printSize: string;
  image?: string;
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

export interface CustomerInfo {
  name: string;
  phone: string;
  email: string;
  cpf: string;
  cep: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
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
}
