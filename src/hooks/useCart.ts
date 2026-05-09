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

loadInitial();

const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((l) => l());
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }
};

const calculateTotals = () => {
  const itemsSubtotal = store.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
  
  // Coupon discount (if any)
  store.couponDiscount = store.coupon ? itemsSubtotal * 0.05 : 0;
  
  // PIX discount (5% extra on subtotal)
  store.pixDiscount = store.paymentMethod === 'PIX' ? itemsSubtotal * 0.05 : 0;
  
  store.subtotal = itemsSubtotal;
  store.total = Math.max(0, itemsSubtotal - store.couponDiscount - store.pixDiscount + store.shipping);
};

// --- Actions ---

export const cartActions = {
  setPaymentMethod: (method: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD') => {
    store.paymentMethod = method;
    calculateTotals();
    emit();
  },
  updateCustomer: (info: Partial<CartStore['customerInfo']>) => {
    store.customerInfo = { ...store.customerInfo, ...info };
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
      store.items[existingIndex].quantity += newItem.quantity;
    } else {
      store.items = [...store.items, newItem];
    }
    calculateTotals();
    emit();
  },

  removeItem: (index: number) => {
    store.items = store.items.filter((_, i) => i !== index);
    calculateTotals();
    emit();
  },

  updateQuantity: (index: number, quantity: number) => {
    if (quantity < 1) {
      cartActions.removeItem(index);
      return;
    }
    store.items = store.items.map((item, i) =>
      i === index ? { ...item, quantity } : item
    );
    calculateTotals();
    emit();
  },

  setCoupon: (code: string | null) => {
    store.coupon = code;
    calculateTotals();
    emit();
  },

  setShipping: (value: number) => {
    store.shipping = value;
    calculateTotals();
    emit();
  },

  setObservations: (text: string) => {
    store.observations = text;
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
