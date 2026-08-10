import { useState, useEffect } from 'react';
import { subscribeToOrders, updateOrderStatusInDb } from '../services/orders/orderService';
import toast from 'react-hot-toast';

export function useOrders() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToOrders((updatedOrders) => {
      setOrders(updatedOrders);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const changeOrderStatus = async (orderId: string, newStatus: string, extraData?: Record<string, any>) => {
    try {
      await updateOrderStatusInDb(orderId, newStatus, extraData);
      toast.success(`Status do pedido atualizado para: ${newStatus}`);
    } catch (err: any) {
      toast.error(`Erro ao atualizar status: ${err.message}`);
      throw err;
    }
  };

  return { orders, loading, error, changeOrderStatus };
}
