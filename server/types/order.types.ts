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
  | 'processing'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'partially_paid'
  | 'partially_refunded';

export type ProductionStatus =
  | 'waiting'
  | 'separacao_corte'
  | 'estamparia'
  | 'costura'
  | 'embalagem'
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
  variantId?: string;
  variantKey?: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  price: number; // Unit price calculated server-side
  originalPrice?: number;
  totalPrice?: number; // quantity * price
  image?: string;
  sku?: string;
  stampName?: string;
  customization?: any;
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
  method: string; // 'PIX' | 'CARTÃO DE CRÉDITO' | string
  methodId: string; // 'pix' | 'credit_card' | string
  provider: 'mercadopago';
  providerPaymentId?: string;
  paidAmount: number;
  pendingAmount: number;
  paidAt?: string | null;
  qrCode?: string;
  qrCodeBase64?: string;
  ticketUrl?: string;
}

export type ProductionPriority = 'normal' | 'alta' | 'urgente';

export interface ProductionNote {
  id: string;
  note: string;
  author: string;
  timestamp: string;
}

export interface OrderProductionInfo {
  status: ProductionStatus;
  currentStage?: string;
  enteredAt?: string;
  updatedAt?: string;
  priority?: ProductionPriority;
  assignedTo?: string;
  dueDate?: string;
  notes?: ProductionNote[];
}

export interface OrderShippingInfo {
  status: ShippingStatus;
  method?: string; // e.g. "Melhor Envio" | "Pedido Local"
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
  
  // Legacy / top-level backward compatibility fields
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
