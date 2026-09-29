import React, { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { authenticatedFetch, getBaseUrl } from '../../../lib/api';

interface AbandonedCheckout {
  id: string;
  customer_name?: string;
  phone?: string;
  total?: number;
  recovery_status?: string;
  payment_status?: string;
  recoveryConsent?: boolean;
  last_interaction?: string;
  created_at?: string;
  cart_items?: unknown[];
}

interface AbandonedCartsRecoveryProps {
  formatMoney: (val: number) => string;
}

const checkoutTime = (checkout: AbandonedCheckout) => new Date(checkout.last_interaction || checkout.created_at || 0).getTime();

export const AbandonedCartsRecovery: React.FC<AbandonedCartsRecoveryProps> = ({ formatMoney }) => {
  const [checkouts, setCheckouts] = useState<AbandonedCheckout[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await authenticatedFetch('/api/automation/dashboard');
        if (!response.ok) return;
        const payload = await response.json();
        if (!active) return;
        const realAbandoned = (Array.isArray(payload?.checkouts) ? payload.checkouts : [])
          .filter((checkout: AbandonedCheckout) =>
            checkout.recovery_status === 'abandoned'
            && checkout.payment_status !== 'approved'
            && checkout.recoveryConsent === true
            && Array.isArray(checkout.cart_items)
            && checkout.cart_items.length > 0
          )
          .sort((a: AbandonedCheckout, b: AbandonedCheckout) => checkoutTime(b) - checkoutTime(a));
        setCheckouts(realAbandoned);
      } catch {
        if (active) setCheckouts([]);
      }
    };
    void load();
    const interval = window.setInterval(load, 45_000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  if (checkouts.length === 0) return null;

  return (
    <div className="space-y-2 border border-orange-200 bg-orange-50/80 p-3">
      <div className="flex items-center justify-between border-b border-orange-200/60 pb-1">
        <div className="flex items-center gap-1.5">
          <Smartphone className="text-orange-500" size={14} />
          <h2 className="text-[10px] font-black uppercase tracking-widest text-orange-900">CARRINHOS ABANDONADOS ({checkouts.length})</h2>
        </div>
        <span className="text-[8px] font-bold uppercase tracking-wider text-orange-700">Carrinho real sem compra</span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {checkouts.slice(0, 3).map(checkout => {
          const hours = Math.max(1, Math.floor((Date.now() - checkoutTime(checkout)) / 3_600_000));
          const firstName = (checkout.customer_name || 'Cliente').split(' ')[0].toUpperCase();
          const message = `Fala ${firstName}! Vimos que você adicionou produtos à sacola da F PAC STORE, mas não concluiu a compra. Se quiser continuar, acesse ${getBaseUrl()}/bag`;
          return (
            <div key={checkout.id} className="flex items-center justify-between gap-2 border border-orange-200 bg-white p-2 shadow-2xs">
              <div className="min-w-0">
                <p className="truncate text-[9px] font-black uppercase text-black">{checkout.customer_name || 'Cliente'}</p>
                <p className="font-mono text-[8px] font-bold text-gray-500">Há {hours}h • {formatMoney(Number(checkout.total) || 0)}</p>
              </div>
              {checkout.phone && (
                <button type="button" onClick={() => window.open(`https://wa.me/${checkout.phone!.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank')} className="shrink-0 bg-orange-500 px-2 py-1 text-[8px] font-black uppercase text-white transition-colors hover:bg-black">Recuperar WA</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
