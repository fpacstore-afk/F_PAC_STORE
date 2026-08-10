import React from 'react';
import { Smartphone } from 'lucide-react';
import { getBaseUrl } from '../../../lib/api';

interface AbandonedCartsRecoveryProps {
  orders: any[];
  formatMoney: (val: number) => string;
}

export const AbandonedCartsRecovery: React.FC<AbandonedCartsRecoveryProps> = ({ orders, formatMoney }) => {
  const abandonedOrders = orders.filter(o => 
    ['received', 'payment_pending', 'Aguardando Pagamento PIX'].includes(o.status) && 
    (Date.now() - (o.createdAt?.toMillis ? o.createdAt.toMillis() : new Date(o.createdAt).getTime())) > 3600000
  );

  if (abandonedOrders.length === 0) return null;

  return (
    <div className="bg-orange-50/80 border border-orange-200 p-3 space-y-2">
      <div className="flex items-center justify-between border-b border-orange-200/60 pb-1">
        <div className="flex items-center gap-1.5">
          <Smartphone className="text-orange-500" size={14} />
          <h2 className="text-[10px] font-black uppercase tracking-widest text-orange-900">
            CARRINHOS ABANDONADOS ({abandonedOrders.length})
          </h2>
        </div>
        <span className="text-[8px] text-orange-700 font-bold uppercase tracking-wider">Iniciados há +1h</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {abandonedOrders.slice(0, 3).map(order => (
          <div key={order.id} className="bg-white border border-orange-200 p-2 flex items-center justify-between gap-2 shadow-2xs">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase truncate text-black">{order.customerName}</p>
              <p className="text-[8px] text-gray-500 font-mono font-bold">
                Há {Math.floor((Date.now() - (order.createdAt?.toMillis ? order.createdAt.toMillis() : new Date(order.createdAt).getTime())) / 3600000)}h • {formatMoney(order.total)}
              </p>
            </div>
            <button 
              onClick={() => {
                const name = order.customerName.split(' ')[0].toUpperCase();
                const msg = `👕 F PAC STORE • NÃO É SÓ ROUPA. É IDENTIDADE! 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nFala ${name}!\n\n🛒 CARRINHO RESERVADO! 🛒\n\nVimos que você escolheu peças incríveis com muita atitude e iniciou seu pedido, mas acabou não finalizando o checkout.\nReservamos os itens temporariamente no nosso estoque para você não perder! Garanta suas peças oficiais da F PAC STORE no link seguro abaixo:\n\n👉CONCLUIR COM SEGURANÇA:\n${getBaseUrl()}/#/order/${order.id}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🌟CANAIS OFICIAIS F PAC STORE:\n🌐 Site Oficial:www.fpacstore.com.br\n📸 Instagram: @f_pac_store\n💬 WhatsApp Oficial: (47) 99746-5602\n📍 Loja/Expedição em Joinville/SC\n🛡️Esta é uma mensagem automática de suporte e acompanhamento de pedido.`;
                window.open(`https://wa.me/${order.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
              }}
              className="bg-orange-500 text-white px-2 py-1 text-[8px] font-black uppercase hover:bg-black transition-colors shrink-0 cursor-pointer"
            >
              Recuperar WA
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
