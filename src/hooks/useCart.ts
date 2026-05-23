import { useSyncExternalStore } from 'react';
import { CartItem, CartStore } from '../types/cart';
import { getFlashSaleInfo } from '../lib/flashSale';
import { getDailyPromoCode } from '../lib/promo';
import { getActivePromotion } from '../services/promotions/getActivePromotion';
import { applyPromotion } from '../services/promotions/applyPromotion';
import { WeeklyPromotion } from '../types/promotions';

// --- Internal Store Logic ---

let store: CartStore = {
  items: [],
  subtotal: 0,
  couponDiscount: 0,
  pixDiscount: 0,
  flashSaleDiscount: 0,
  weeklyPromotionDiscount: 0,
  weeklyPromotionLabel: '',
  shippingDiscount: 0,
  total: 0,
  coupon: null,
  shipping: 0,
  observations: '',
  paymentMethod: 'CREDIT_CARD',
  customerInfo: {
    name: '',
    phone: '',
    email: '',
    cpf: '',
    cep: '',
    address: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: 'Joinville',
    state: 'SC',
  },
  checkout_session_id: null,
};

// Persistence key
const STORAGE_KEY = 'f_pac_cart_v2';

// Load initial state
const loadInitial = () => {
  if (typeof window === 'undefined') return;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.items)) {
        store = { ...store, ...parsed };
        calculateTotals();
      }
    } catch (e) {
      console.error('Failed to load cart:', e);
    }
  }
};

const listeners = new Set<() => void>();

let saveTimeout: any = null;

const triggerAutosaveLead = () => {
  if (typeof window === 'undefined') return;
  
  const customer = store.customerInfo;
  // Trigger only if there are items in the cart and at least some detail (name, email, phone or cep) is filled
  if (store.items.length === 0) return;
  if (!customer.email && !customer.phone && !customer.name && !customer.cep) return;

  // Ensure we have a session ID
  if (!store.checkout_session_id) {
    store.checkout_session_id = `FPAC-SESS-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  }

  // Clear previous debounce timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // Debouncing to avoid database spam - 1.5 seconds is perfect
  saveTimeout = setTimeout(async () => {
    try {
      const payload = {
        checkout_session_id: store.checkout_session_id,
        customer_name: customer.name,
        email: customer.email,
        phone: customer.phone,
        cep: customer.cep,
        address: customer.address,
        number: customer.number,
        complement: customer.complement,
        neighborhood: customer.neighborhood,
        city: customer.city,
        state: customer.state,
        cart_items: store.items,
        total: store.total
      };

      await fetch('/api/checkout/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('[AUTOSAVE-LEAD-ERR] Failed to sync progress to server:', e);
    }
  }, 1500);
};

const emit = () => {
  // Replace store reference so useSyncExternalStore detects change
  store = { ...store };
  listeners.forEach((l) => l());
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
  
  // Trigger debounced telemetry autosave
  triggerAutosaveLead();
};

let activePromotion: WeeklyPromotion | null = null;
let isFetchingPromo = false;
let promoLastFetchedTime = 0;

const fetchPromoIfNeed = () => {
  const now = Date.now();
  if (!isFetchingPromo && (now - promoLastFetchedTime > 15000)) {
    isFetchingPromo = true;
    getActivePromotion().then(promo => {
      activePromotion = promo;
      promoLastFetchedTime = Date.now();
      isFetchingPromo = false;
      calculateTotals();
      emit();
    }).catch((err) => {
      console.warn('[PROMO_FETCH_ERR] Failed to load dynamic promotion:', err);
      isFetchingPromo = false;
    });
  }
};

const calculateTotals = () => {
  fetchPromoIfNeed();

  const itemsSubtotal = store.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const totalItemsCount = store.items.reduce((acc, item) => acc + item.quantity, 0);

  // Apply Weekly Promotion Discounts (if any)
  const promoResultObj = applyPromotion(
    store.items,
    activePromotion,
    store.shipping,
    store.customerInfo.city || 'Joinville'
  );

  const promoDiscountValue = promoResultObj.promotionDiscount;
  const shippingPromoDiscountValue = promoResultObj.shippingDiscount;

  const isExclusivePromoActive = activePromotion && activePromotion.active;

  // 1. FRETE GRÁTIS: Disable automatic 2-piece free-shipping if campaign is active and exclusive!
  let finalShipping = store.shipping;
  if (isExclusivePromoActive) {
    // Only free shipping if the campaign itself specifies/grants it
    finalShipping = (shippingPromoDiscountValue > 0) ? 0 : store.shipping;
  } else {
    // Standard rule: free shipping above 2 items
    finalShipping = (totalItemsCount >= 2) ? 0 : store.shipping;
  }
  
  // 2. FLASH SALE (Automático se ativo) - R$ 5, 7 ou 9 total no subtotal se houver itens. Disabled if exclusive promotion is active.
  const flashSale = getFlashSaleInfo();
  const flashSaleDiscountValue = (flashSale.isActive && store.items.length > 0 && !isExclusivePromoActive) ? flashSale.discountValue : 0;
  
  // 3. CUPOM 5% (Dinâmico): Aplicado apenas se o cupom for o válido do dia. Disabled if campaign is active unless it's a cupom campaign matching code.
  const currentDailyCode = getDailyPromoCode();
  const isDailyCouponValid = store.coupon?.toUpperCase().replace(/\s/g, '') === currentDailyCode;
  
  // Apply coupon discount AFTER calculating the Weekly Promo Discount
  const subtotalAfterPromo = Math.max(0.10, itemsSubtotal - promoDiscountValue);
  
  let couponDiscountValue = 0;
  if (isExclusivePromoActive) {
    if (activePromotion.discount_type === 'cupom' && store.coupon?.toUpperCase().trim() === activePromotion.coupon_code?.toUpperCase().trim()) {
      // It matches the active campaign coupon code! Apply campaign discount value%
      const rate = (activePromotion.discount_value || 5) / 100;
      couponDiscountValue = subtotalAfterPromo * rate;
    } else {
      // Non-stackable campaign active -> disable external daily coupons
      couponDiscountValue = 0;
    }
  } else {
    couponDiscountValue = isDailyCouponValid ? (subtotalAfterPromo - flashSaleDiscountValue) * 0.05 : 0;
  }
  
  // 4. DESCONTO PIX: 5% extra. Disabled if campaign is active, unless campaign is specifically 'pix_discount' type or allows stacking.
  const subtotalAfterDiscounts = Math.max(0.10, subtotalAfterPromo - flashSaleDiscountValue - couponDiscountValue);
  let pixDiscountValue = 0;
  if (isExclusivePromoActive) {
    if (activePromotion.discount_type === 'pix_discount' && store.paymentMethod === 'PIX') {
      const pixRate = (activePromotion.pix_discount || activePromotion.discount_value || 10) / 100;
      pixDiscountValue = subtotalAfterDiscounts * pixRate;
    } else {
      // No PIX discount under active campaign unless stackable is explicitly set
      pixDiscountValue = (activePromotion.stackable && store.paymentMethod === 'PIX') ? subtotalAfterDiscounts * 0.05 : 0;
    }
  } else {
    pixDiscountValue = store.paymentMethod === 'PIX' ? subtotalAfterDiscounts * 0.05 : 0;
  }
  
  // Safety: If there are items, total should be at least R$ 0.10 to prevent gateway 400 errors
  const rawTotal = subtotalAfterDiscounts - pixDiscountValue + finalShipping;
  const totalValue = store.items.length > 0 
    ? Math.max(0.10, Number(rawTotal.toFixed(2)))
    : 0;

  const nextSubtotal = Number(itemsSubtotal.toFixed(2));
  const nextCouponDiscount = Number(couponDiscountValue.toFixed(2));
  const nextPixDiscount = Number(pixDiscountValue.toFixed(2));
  const nextFlashSaleDiscount = Number(flashSaleDiscountValue.toFixed(2));
  const nextPromoDiscount = Number(promoDiscountValue.toFixed(2));
  const nextPromoLabel = promoResultObj.discountLabel;
  const nextShippingDiscount = Number(shippingPromoDiscountValue.toFixed(2));

  // ONLY update if something changed to prevent reference fatigue
  if (
    store.subtotal !== nextSubtotal ||
    store.shipping !== finalShipping ||
    store.couponDiscount !== nextCouponDiscount ||
    store.pixDiscount !== nextPixDiscount ||
    store.flashSaleDiscount !== nextFlashSaleDiscount ||
    store.weeklyPromotionDiscount !== nextPromoDiscount ||
    store.weeklyPromotionLabel !== nextPromoLabel ||
    store.shippingDiscount !== nextShippingDiscount ||
    store.total !== totalValue
  ) {
    store = {
      ...store,
      subtotal: nextSubtotal,
      shipping: finalShipping,
      couponDiscount: nextCouponDiscount,
      pixDiscount: nextPixDiscount,
      flashSaleDiscount: nextFlashSaleDiscount,
      weeklyPromotionDiscount: nextPromoDiscount,
      weeklyPromotionLabel: nextPromoLabel,
      shippingDiscount: nextShippingDiscount,
      total: totalValue
    };
  }
};

loadInitial();

// Periodic recalculation for Flash Sale/Timed events
if (typeof window !== 'undefined') {
  setInterval(() => {
    // Only emit if there's a practical reason (flash sale changed state)
    if (store.items.length > 0) {
      const oldTotal = store.total;
      const oldFlash = store.flashSaleDiscount;
      calculateTotals();
      
      // Only emit if the totals actually changed (avoids re-rendering components like Checkout if nothing changed)
      if (store.total !== oldTotal || store.flashSaleDiscount !== oldFlash) {
        emit();
      }
    }
  }, 600000); // Checa a cada 10 minutos para ser ULTRA estável
}

// Sync across tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (Array.isArray(parsed.items)) {
          store = { ...store, ...parsed };
          listeners.forEach((l) => l());
        }
      } catch (err) {
        console.error('Failed to sync cart from storage:', err);
      }
    } else if (e.key === STORAGE_KEY && !e.newValue) {
      // Cart was cleared in another tab
      store = {
        ...store,
        items: [],
        subtotal: 0,
        couponDiscount: 0,
        pixDiscount: 0,
        total: 0,
        coupon: null,
      };
      listeners.forEach((l) => l());
    }
  });
}

// --- Actions ---

export const cartActions = {
  setPaymentMethod: (method: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD') => {
    store = { ...store, paymentMethod: method };
    calculateTotals();
    emit();
  },
  updateCustomer: (info: Partial<CartStore['customerInfo']>) => {
    store = { 
      ...store, 
      customerInfo: { ...store.customerInfo, ...info } 
    };
    emit();
  },
  addItem: (newItem: CartItem) => {
    const configHash = newItem.printConfigs ? JSON.stringify(newItem.printConfigs) : '';
    const existingIndex = store.items.findIndex(
      (item) =>
        item.id === newItem.id &&
        item.size === newItem.size &&
        item.color === newItem.color &&
        (item.printConfigs ? JSON.stringify(item.printConfigs) : '') === configHash
    );

    if (existingIndex > -1) {
      const newItems = [...store.items];
      newItems[existingIndex] = {
        ...newItems[existingIndex],
        quantity: newItems[existingIndex].quantity + newItem.quantity
      };
      store = { ...store, items: newItems };
    } else {
      store = { ...store, items: [...store.items, newItem] };
    }
    calculateTotals();
    emit();
  },

  removeItem: (index: number) => {
    store = { ...store, items: store.items.filter((_, i) => i !== index) };
    calculateTotals();
    emit();
  },

  updateQuantity: (index: number, quantity: number) => {
    if (quantity < 1) {
      cartActions.removeItem(index);
      return;
    }
    const newItems = store.items.map((item, i) =>
      i === index ? { ...item, quantity } : item
    );
    store = { ...store, items: newItems };
    calculateTotals();
    emit();
  },

  setCoupon: (code: string | null) => {
    store = { ...store, coupon: code };
    calculateTotals();
    emit();
  },

  setShipping: (value: number) => {
    store = { ...store, shipping: value };
    calculateTotals();
    emit();
  },

  setObservations: (text: string) => {
    store = { ...store, observations: text };
    emit();
  },

  clearCart: () => {
    store = {
      items: [],
      subtotal: 0,
      couponDiscount: 0,
      pixDiscount: 0,
      flashSaleDiscount: 0,
      weeklyPromotionDiscount: 0,
      weeklyPromotionLabel: '',
      shippingDiscount: 0,
      total: 0,
      coupon: null,
      shipping: 0,
      observations: '',
      paymentMethod: 'CREDIT_CARD',
      customerInfo: {
        name: '',
        phone: '',
        email: '',
        cpf: '',
        cep: '',
        address: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: 'Joinville',
        state: 'SC',
      },
      checkout_session_id: null,
    };
    emit();
  },
};

// --- Hook ---

export function useCart() {
  const data = useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => store,
    () => store // SSR fallback
  );

  return {
    ...data,
    ...cartActions,
  };
}
