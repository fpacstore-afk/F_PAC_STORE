export interface Review {
  id: string;
  productId: string;
  name: string;
  rating: number;
  comment: string;
  styleInfo?: string; // Max 100 chars
  verified: boolean;
  createdAt: string;
  userId?: string | null;
}

export type OrderStatus =
  | 'received'
  | 'payment_pending'
  | 'payment_approved'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'Aguardando Pagamento PIX'
  | 'Pagamento Aprovado'
  | 'Pagamento Não Realizado'
  | 'separacao'
  | 'embalagem'
  | 'aguardando_impressao'
  | 'estampa_finalizada'
  | 'controle_qualidade'
  | 'pronto_envio';

export type ProductCategory = 'tshirt' | 'shorts' | 'jacket' | 'cropped' | 'other';
export type ProductSizeSystem = 'alpha' | 'numeric' | 'custom';

export interface ProductColor {
  name: string;
  hex: string;
  images?: string[]; // Color-specific mockups
}

export interface ProductMockup {
  id: string;
  url: string;
  colorName?: string;
  type?: 'frontal' | 'traseira' | 'lateral' | 'dobrada' | 'detalhe' | 'lifestyle';
  isPrimary?: boolean;
  order: number;
  altText?: string;
}

export interface ProductVideoMedia {
  id: string;
  url: string;
  title?: string;
  order: number;
  status: 'active' | 'inactive';
}

export interface SizeStockItem {
  size: string;
  colorName?: string;
  quantity: number;
  minStock: number;
  reserved: number;
}

export interface ProductVariantDefinition {
  sku: string;
  size?: string;
  colorName?: string;
  stock?: number;
  minStock?: number;
  reserved?: number;
  price?: number;
  costPrice?: number;
  active?: boolean;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku?: string;
  headline?: string;
  description: string;
  price: number;
  promotionalPrice?: number;
  costPrice?: number;

  // Taxonomy: category describes the garment type; collection describes the commercial line.
  // Legacy category strings remain accepted while productType provides the canonical future-safe value.
  category: string;
  productType?: ProductCategory;
  collection?: string;
  sizeSystem?: ProductSizeSystem;
  brand?: string;
  status: 'active' | 'inactive' | 'draft' | 'archived';
  isNew?: boolean;
  isBestseller?: boolean;
  is_prime?: boolean;
  
  // Media & Mockups
  images: string[];
  colorVariants?: {
    name: string;
    hex: string;
    images: string[];
  }[];
  mockups?: ProductMockup[];
  videos?: ProductVideoMedia[];

  // Inventory & Dimensions
  sizes: string[];
  colors: { name: string; hex: string }[];
  sizeStock?: SizeStockItem[];
  variants?: ProductVariantDefinition[];
  stock?: number;
  minStock?: number;

  weight?: number; // kg
  width?: number;  // cm
  height?: number; // cm
  length?: number; // cm

  // Details
  specs: string[];
  fabric?: string;
  gsm?: string;
  fit?: string;
  collar?: string;
  printDetails?: string;
  careInstructions?: string[];
  videoUrl?: string;
  pixDiscountPercent?: number;
  maxInstallments?: number;
  sizeChart?: { size: string; length: string; width: string; sleeve: string; notes?: string }[];
  parentSlug?: string;
  stampSize?: string;
  tags?: string[];
  
  // Metadata & Config
  seal?: string;
  displayOrder?: number;
  variantsStock?: Record<string, number>;
  createdAt?: any;
  updatedAt?: any;
}
