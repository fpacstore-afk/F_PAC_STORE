import React from 'react';
import { ShoppingBag } from 'lucide-react';
import { useFixedControlHeight } from '../hooks/useFixedControlHeight';

type ProductPurchaseBarProps = {
  unitPrice: number;
  quantity: number;
  color: string;
  size: string;
  available: boolean;
  onBuy: () => void;
  onChooseOptions: () => void;
};

export function ProductPurchaseBar({ unitPrice, quantity, color, size, available, onBuy, onChooseOptions }: ProductPurchaseBarProps) {
  const purchaseBarRef = useFixedControlHeight('--purchase-control-height');
  const hasOptions = Boolean(color && size);
  const unavailable = hasOptions && !available;
  const total = (unitPrice * quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return <div ref={purchaseBarRef} data-purchase-bar="product" aria-label="Compra da peça"
    className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/95 px-3 py-2 shadow-[0_-8px_24px_rgba(0,0,0,.1)] backdrop-blur-xl md:hidden">
    <div className="mx-auto flex max-w-lg items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[9px] font-medium text-black/55">{hasOptions ? `${color} · ${size}${quantity > 1 ? ` · ${quantity} peças` : ''}` : 'Escolha cor e tamanho'}</p>
        <p className="text-lg font-black leading-tight text-black">{total}</p>
      </div>
      <button type="button" disabled={unavailable} onClick={hasOptions ? onBuy : onChooseOptions}
        className="inline-flex min-h-12 min-w-[138px] items-center justify-center gap-2 rounded-xl bg-[#eab308] px-4 text-xs font-black uppercase text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/40">
        <ShoppingBag size={17} aria-hidden="true" />{unavailable ? 'Esgotado' : hasOptions ? 'Comprar' : 'Escolher opções'}
      </button>
    </div>
  </div>;
}
