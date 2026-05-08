import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export interface PrintConfiguration {
  id: string; // unique ID for parsing
  stamp: string;
  location: string;
  background: 'Com Fundo' | 'Sem Fundo';
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  image: string;
  size: string;
  color: string;
  quantity: number;
  printConfigs?: PrintConfiguration[];
}

interface CartContextType {
  items: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  clearCart: () => void;
  total: number;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    // Carregar itens salvos ao iniciar
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('fpac_cart');
      try {
        const parsed = saved ? JSON.parse(saved) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error('Erro ao carregar carrinho:', e);
        return [];
      }
    }
    return [];
  });
  const [isOpen, setIsOpen] = useState(false);

  // Salvar sempre que o carrinho mudar
  useEffect(() => {
    if (Array.isArray(items)) {
      localStorage.setItem('fpac_cart', JSON.stringify(items));
    }
  }, [items]);

  const addToCart = (newItem: CartItem) => {
    setItems((currentItems) => {
      // Ensure currentItems is an array (fallback)
      const safeItems = Array.isArray(currentItems) ? currentItems : [];
      
      // Create a unique hash/key for comparison including custom print configurations
      const configHash = newItem.printConfigs ? JSON.stringify(newItem.printConfigs) : '';
      const existingIndex = safeItems.findIndex(
        (item) => item.id === newItem.id && 
                  item.size === newItem.size && 
                  item.color === newItem.color &&
                  item.image === newItem.image &&
                  (item.printConfigs ? JSON.stringify(item.printConfigs) : '') === configHash
      );
      
      if (existingIndex > -1) {
        return safeItems.map((item, i) => 
          i === existingIndex 
            ? { ...item, quantity: item.quantity + newItem.quantity }
            : item
        );
      }
      return [...safeItems, newItem];
    });
    setIsOpen(true);
  };

  const removeFromCart = (index: number) => {
    setItems((currentItems) => currentItems.filter((_, i) => i !== index));
  };

  const updateQuantity = (index: number, quantity: number) => {
    if (quantity < 1) {
      removeFromCart(index);
      return;
    }
    setItems((currentItems) => {
      const newItems = [...currentItems];
      newItems[index].quantity = quantity;
      return newItems;
    });
  };

  const clearCart = () => {
    setItems([]);
  };

  const total = Array.isArray(items) ? items.reduce((sum, item) => {
    const price = typeof item.price === 'number' ? item.price : 0;
    const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
    return sum + (price * quantity);
  }, 0) : 0;

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, total, isOpen, setIsOpen }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
