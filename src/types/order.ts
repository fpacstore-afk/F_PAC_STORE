export type OrderStatus =
  | 'received'
  | 'processing'
  | 'production'
  | 'ready'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'returned'
  | 'cancelled';

export type PaymentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export type ProductionStatus =
  | 'waiting'
  | 'separation'
  | 'cutting'
  | 'printing'
  | 'sewing'
  | 'packaging'
  | 'ready'
  | 'completed';

export type ShippingStatus =
  | 'pending'
  | 'label_created'
  | 'shipped'
  | 'in_transit'
  | 'delivered'
  | 'returned';

export interface OrderItem {
  id: string;
  productId?: string;
  slug?: string;
  parentSlug?: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  price: number;
  originalPrice?: number;
  totalPrice?: number;
  image?: string;
  sku?: string;
  stampName?: string;
}

export interface OrderPricingSnapshot {
  subtotal: number;
  couponDiscount: number;
  promotionalDiscount: number;
  pixDiscount: number;
  shipping: number;
  total: number;
  currency: 'BRL';
}

export interface OrderCustomer {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  phone2?: string;
  cpf?: string;
  address?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
}

export interface OrderPaymentInfo {
  status: PaymentStatus;
  method: string;
  methodId: string;
  provider: 'mercadopago';
  providerPaymentId?: string;
  paidAmount: number;
  pendingAmount: number;
  paidAt?: string | null;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
}

export interface OrderProductionInfo {
  status: ProductionStatus;
  currentStage?: string;
  updatedAt?: string;
}

export interface OrderShippingInfo {
  status: ShippingStatus;
  method?: string;
  methodName?: string;
  carrier?: string;
  trackingCode?: string;
  labelId?: string;
  serviceId?: number;
}

export interface OrderCanonical {
  id: string;
  userId?: string | null;
  customer: OrderCustomer;
  items: OrderItem[];
  pricing: OrderPricingSnapshot;
  payment: OrderPaymentInfo;
  production: OrderProductionInfo;
  shipping: OrderShippingInfo;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerCpf?: string;
  total: number;
  subtotal: number;
  couponDiscount: number;
  shippingFee: number;
  paymentStatus: PaymentStatus;
  productionStatus: ProductionStatus;
  shippingStatus: ShippingStatus;
  processedEvents?: string[];
  createdAt: any;
  updatedAt: any;
}
