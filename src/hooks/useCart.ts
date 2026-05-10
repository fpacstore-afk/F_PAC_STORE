import { useSyncExternalStore } from 'react';
import { CartItem, CartStore } from '../types/cart';

// --- Internal Store Logic ---

let store: CartStore = {
  items: [],
  subtotal: 0,
  couponDiscount: 0,
  pixDiscount: 0,
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

const emit = () => {
  // Replace store reference so useSyncExternalStore detects change
  store = { ...store };
  listeners.forEach((l) => l());
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
};

const calculateTotals = () => {
  const itemsSubtotal = store.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  
  // Coupon discount (if any)
  const couponDiscount = store.coupon ? itemsSubtotal * 0.05 : 0;
  
  // PIX discount (5% extra on subtotal)
  const pixDiscount = store.paymentMethod === 'PIX' ? itemsSubtotal * 0.05 : 0;
  
  const total = Math.max(0, itemsSubtotal - couponDiscount - pixDiscount + store.shipping);

  store = {
    ...store,
    subtotal: itemsSubtotal,
    couponDiscount,
    pixDiscount,
    total
  };
};

loadInitial();

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

  clear: () => {
    store = {
      items: [],
      subtotal: 0,
      couponDiscount: 0,
      pixDiscount: 0,
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
