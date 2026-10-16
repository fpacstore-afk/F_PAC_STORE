import { useSyncExternalStore } from 'react';
import { CartItem, CartStore } from '../types/cart';
import { getFlashSaleInfo } from '../lib/flashSale';
import { getDailyPromoCode } from '../lib/promo';
import { getActivePromotion } from '../services/promotions/getActivePromotion';
import { applyPromotion } from '../services/promotions/applyPromotion';
import { WeeklyPromotion } from '../types/promotions';
import { safeStorage } from '../lib/storage';
import { getPublicApiUrl } from '../lib/api';
import { persistentCart, validCheckoutSession, CHECKOUT_SESSION_TTL } from '../../shared/privacy';
import { RecoveryRevocations } from '../services/recoveryRevocations';

import { analyticsTracker } from '../services/analyticsTracker';
import { calculateStorefrontTotals } from '../../shared/storefrontTotals';
import { qualifiesForFreeShipping } from '../../shared/shippingThreshold';

// --- Internal Store Logic ---

let store: CartStore = {
  items: [],
  subtotal: 0,
  couponDiscount: 0,
  pixDiscount: 0,
  pixDiscountRate: 5,
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
    phone2: '',
    email: '',
    cpf: '',
    cep: '',
    address: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: 'Joinville',
    state: 'SC',
    shippingMethodName: 'Entrega Local F PAC',
    shippingServiceId: 0,
  },
  checkout_session_id: null,
};

// Persistence key
const STORAGE_KEY = 'f_pac_cart_v2';
const CHECKOUT_DETAILS_KEY = 'fpac_checkout_details_v1';
const emptyCustomerInfo = { ...store.customerInfo };
let leadAccessToken = '';
let lastSavedLead = '';

function persistCheckoutDetails() {
  try {
    if (!store.customerInfo.name && !store.customerInfo.email && !store.customerInfo.phone && !store.customerInfo.cpf) {
      sessionStorage.removeItem(CHECKOUT_DETAILS_KEY);
      return;
    }
    sessionStorage.setItem(CHECKOUT_DETAILS_KEY, JSON.stringify({ customerInfo: store.customerInfo, observations: store.observations, shipping: store.shipping, quotedShipping: store.quotedShipping, checkout_session_id: store.checkout_session_id, recoveryConsent: store.recoveryConsent === true, leadAccessToken, expiresAt: Date.now() + CHECKOUT_SESSION_TTL }));
  } catch { /* Private checkout details stay in memory when storage is unavailable. */ }
}

// Load initial state
const loadInitial = () => {
  if (typeof window === 'undefined') return;
  const saved = safeStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        store = { ...store, ...persistentCart(parsed) } as CartStore;
        // Preserve an in-progress legacy checkout in this tab while removing PII from persistent storage.
        let hasPrivateSession = false;
        try { hasPrivateSession = Boolean(sessionStorage.getItem(CHECKOUT_DETAILS_KEY)); } catch { /* Still scrub persistent PII when session storage is unavailable. */ }
        if (parsed.customerInfo && typeof parsed.customerInfo === 'object' && !hasPrivateSession) {
          store.customerInfo = { ...emptyCustomerInfo, ...parsed.customerInfo };
          persistCheckoutDetails();
        }
        safeStorage.setItem(STORAGE_KEY, JSON.stringify(persistentCart(store)));
        calculateTotals();
      }
    } catch (e) {
      console.error('Failed to load cart:', e);
    }
  }
  try {
    const privateData = JSON.parse(sessionStorage.getItem(CHECKOUT_DETAILS_KEY) || 'null');
    if (validCheckoutSession(privateData)) {
      store = { ...store, customerInfo: { ...emptyCustomerInfo, ...privateData.customerInfo }, observations: privateData.observations || '', shipping: Number(privateData.shipping) || 0, quotedShipping: Number(privateData.quotedShipping ?? privateData.shipping) || 0, checkout_session_id: privateData.checkout_session_id || null };
      leadAccessToken = /^[a-f0-9]{64}$/.test(privateData.leadAccessToken || '') ? privateData.leadAccessToken : '';
      store.recoveryConsent = privateData.recoveryConsent === true && !!leadAccessToken;
      calculateTotals();
    } else sessionStorage.removeItem(CHECKOUT_DETAILS_KEY);
  } catch { /* Leave customer details empty on an invalid/expired session. */ }
};

const listeners = new Set<() => void>();
const revocations = new RecoveryRevocations({
  read: () => typeof window === 'undefined' ? null : sessionStorage.getItem('fpac_pending_recovery_cancellations'),
  write: value => sessionStorage.setItem('fpac_pending_recovery_cancellations', value),
  send: async entry => (await fetch(getPublicApiUrl('/api/checkout/lead'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ checkout_session_id: entry.checkout_session_id, leadAccessToken: entry.leadAccessToken, recoveryConsent: false }),
    signal: AbortSignal.timeout(15_000),
  })).ok,
  changed: pending => { store = { ...store, recoveryCancellationPending: pending }; listeners.forEach(listener => listener()); },
});
store.recoveryCancellationPending = revocations.hasPending();

let saveTimeout: any = null;

const triggerAutosaveLead = () => {
  if (typeof window === 'undefined') return;
  if (saveTimeout) clearTimeout(saveTimeout);
  if (store.recoveryConsent !== true) return;
  
  const customer = store.customerInfo;
  // Trigger only if there are items in the cart and at least some detail (name, email, phone or cep) is filled
  if (store.items.length === 0) return;
  if (!customer.email && !customer.phone) return;

  // Ensure we have a session ID
  if (!store.checkout_session_id || !leadAccessToken) {
    store.checkout_session_id = 'lead_' + crypto.randomUUID();
    leadAccessToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    persistCheckoutDetails();
  }

  // Clear previous debounce timeout
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // Only explicit recovery consent permits contact capture; avoid repeated saves while typing.
  saveTimeout = setTimeout(async () => {
    if (store.recoveryConsent !== true) return;
    try {
      const payload = {
        checkout_session_id: store.checkout_session_id,
        leadAccessToken,
        recoveryConsent: true,
        customer_name: customer.name,
        email: customer.email,
        phone: customer.phone,
        cart_items: store.items.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, size: item.size, color: item.color, price: item.price })),
        total: store.total
      };
      const serialized = JSON.stringify(payload);
      if (serialized === lastSavedLead) return;
      const response = await fetch(getPublicApiUrl('/api/checkout/lead'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serialized
      });
      if (store.checkout_session_id !== payload.checkout_session_id) return;
      if (response.ok && store.recoveryConsent) lastSavedLead = serialized;
      if (response.status === 409) {
        store = { ...store, recoveryConsent: false, checkout_session_id: null };
        leadAccessToken = ''; emit();
      }
    } catch (e) {
      console.warn('[AUTOSAVE-LEAD-ERR] Failed to sync progress to server:', e);
    }
  }, 10_000);
};

function revokeRecoveryConsent() {
  if (saveTimeout) clearTimeout(saveTimeout);
  if (store.checkout_session_id && leadAccessToken) {
    void revocations.enqueue(store.checkout_session_id, leadAccessToken);
  }
  store = { ...store, checkout_session_id: null, recoveryConsent: false };
  leadAccessToken = '';
  lastSavedLead = '';
}

const emit = () => {
  // Replace store reference so useSyncExternalStore detects change
  store = { ...store };
  listeners.forEach((l) => l());
  if (typeof window !== 'undefined') {
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(persistentCart(store)));
    persistCheckoutDetails();
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

  const money = calculateStorefrontTotals({
    items: store.items, promotion: activePromotion, shipping: store.quotedShipping ?? store.shipping,
    coupon: store.coupon, pixEnabled: store.paymentMethod === 'PIX', city: store.customerInfo.city || 'Joinville',
  });
  const activePixRate = money.pixDiscountRate;
  const nextPromoLabel = money.weeklyPromotionLabel;
  const nextShippingDiscount = money.shippingDiscount;

  // ONLY update if something changed to prevent reference fatigue
  if (
    store.subtotal !== money.subtotal ||
    store.shipping !== money.shipping ||
    store.couponDiscount !== money.couponDiscount ||
    store.pixDiscount !== money.pixDiscount ||
    store.pixDiscountRate !== activePixRate ||
    store.flashSaleDiscount !== money.flashSaleDiscount ||
    store.weeklyPromotionDiscount !== money.promotionDiscount ||
    store.weeklyPromotionLabel !== nextPromoLabel ||
    store.shippingDiscount !== nextShippingDiscount ||
    store.total !== money.total
  ) {
    store = {
      ...store,
      subtotal: money.subtotal,
      shipping: money.shipping,
      couponDiscount: money.couponDiscount,
      pixDiscount: money.pixDiscount,
      pixDiscountRate: activePixRate,
      flashSaleDiscount: money.flashSaleDiscount,
      weeklyPromotionDiscount: money.promotionDiscount,
      weeklyPromotionLabel: nextPromoLabel,
      shippingDiscount: nextShippingDiscount,
      total: money.total,
    };
  }
};

loadInitial();
if (typeof window !== 'undefined') {
  void revocations.flush();
  window.addEventListener('online', () => { void revocations.flush(); });
}

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
  }, 1000); // Timed offers stay current; subscribers are notified only when totals change.
}

// Sync across tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (Array.isArray(parsed.items)) {
          store = { ...store, ...persistentCart(parsed) } as CartStore;
          if (!store.items.length) revokeRecoveryConsent();
          calculateTotals();
          persistCheckoutDetails();
          triggerAutosaveLead();
          listeners.forEach((l) => l());
        }
      } catch (err) {
        console.error('Failed to sync cart from storage:', err);
      }
    } else if (e.key === STORAGE_KEY && !e.newValue) {
      // Cart was cleared in another tab
      revokeRecoveryConsent();
      store = {
        ...store,
        items: [],
        subtotal: 0,
        couponDiscount: 0,
        pixDiscount: 0,
        pixDiscountRate: 5,
        total: 0,
        coupon: null,
      };
      listeners.forEach((l) => l());
    }
  });
}

// --- Actions ---

if (typeof window !== 'undefined') window.addEventListener('fpac:clear-checkout-details', () => {
  revokeRecoveryConsent(); leadAccessToken = '';
  store = { ...store, customerInfo: { ...emptyCustomerInfo }, observations: '', shipping: 0, quotedShipping: 0, checkout_session_id: null, recoveryConsent: false };
  if (saveTimeout) clearTimeout(saveTimeout);
  calculateTotals(); emit();
});

export const cartActions = {
  retryRecoveryCancellation: () => revocations.flush(),
  setRecoveryConsent: (consent: boolean) => {
    if (!consent) revokeRecoveryConsent();
    if (consent && !store.recoveryConsent) { store = { ...store, checkout_session_id: null }; leadAccessToken = ''; }
    store = { ...store, recoveryConsent: consent }; emit();
  },
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
    if (!store.customerInfo.email && !store.customerInfo.phone) revokeRecoveryConsent();
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
    
    // Log addition to the cart
    try {
      const slugValue = newItem.id || 'custom-item';
      analyticsTracker.trackAddToCart(slugValue, newItem.name || 'Produto', newItem.price, newItem.quantity);
    } catch (e) {
      console.warn('Analytics cart_add fail:', e);
    }

    calculateTotals();
    emit();
  },

  removeItem: (index: number) => {
    store = { ...store, items: store.items.filter((_, i) => i !== index) };
    if (!store.items.length) revokeRecoveryConsent();
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
    store = { ...store, shipping: value, quotedShipping: value };
    calculateTotals();
    emit();
  },

  setObservations: (text: string) => {
    store = { ...store, observations: text };
    emit();
  },

  refreshCheckoutPrices: (requestedItems: CartItem[], prices: { productId?: string; price: number; originalPrice?: number; category?: string; width?: number; height?: number; length?: number; weight?: number }[]) => {
    if (JSON.stringify(store.items) !== JSON.stringify(requestedItems) || prices.length !== store.items.length || prices.some(p => !Number.isFinite(p.price) || p.price <= 0)) return;
    store = { ...store, items: store.items.map((item, i) => ({ ...item, ...prices[i], price: prices[i].price, ...(Number.isFinite(prices[i].originalPrice) ? { originalPrice: prices[i].originalPrice } : {}) })) };
    calculateTotals(); emit();
  },
  clearCart: () => {
    revokeRecoveryConsent(); leadAccessToken = '';
    store = {
      items: [],
      subtotal: 0,
      couponDiscount: 0,
      pixDiscount: 0,
      pixDiscountRate: 5,
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
        phone2: '',
        email: '',
        cpf: '',
        cep: '',
        address: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: 'Joinville',
        state: 'SC',
        shippingMethodName: 'Entrega Local F PAC',
        shippingServiceId: 0,
      },
      checkout_session_id: null,
      recoveryCancellationPending: revocations.hasPending(),
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
