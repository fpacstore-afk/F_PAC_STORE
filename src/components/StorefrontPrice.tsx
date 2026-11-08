import React from 'react';
import { formatBRL, toCents } from '../lib/money';
import { formatStorefrontAmount } from '../lib/storefrontPrice';

type Props = { price: number; originalPrice?: number; size?: 'compact' | 'card' | 'detail'; dark?: boolean; className?: string };

/** One currency cue for the group; complete BRL values remain available to assistive technology. */
export function StorefrontPrice({ price, originalPrice, size = 'card', dark = false, className = '' }: Props) {
  if (!Number.isFinite(price) || price < 0) return <span className={className}>Preço indisponível</span>;
  const discounted = Number.isFinite(originalPrice) && toCents(originalPrice!) > toCents(price);
  const sizes = size === 'detail' ? { previous: 'text-3xl', current: 'text-2xl' } : size === 'compact'
    ? { previous: 'text-base', current: 'text-sm' } : { previous: 'text-lg', current: 'text-base' };
  return <span data-storefront-price className={`inline-flex max-w-full flex-col gap-0.5 leading-tight tabular-nums ${className}`}>
    <span className="sr-only">{discounted ? `De ${formatBRL(originalPrice!)} por ${formatBRL(price)}` : formatBRL(price)}</span>
    <span aria-hidden="true" className="inline-flex flex-col gap-0.5">
      <span className={`text-[10px] font-medium ${dark ? 'text-white/70' : 'text-gray-600'}`}>Em reais</span>
      {discounted && <span className={`${sizes.previous} font-medium ${dark ? 'text-white/70' : 'text-gray-500'}`}><span className="text-xs">De </span><del>{formatStorefrontAmount(originalPrice!)}</del></span>}
      <span className={`${sizes.current} font-bold ${dark ? 'text-[#eab308]' : 'text-zinc-950'}`}>{discounted && <span className="text-xs font-medium">Por </span>}{formatStorefrontAmount(price)}</span>
    </span>
  </span>;
}
