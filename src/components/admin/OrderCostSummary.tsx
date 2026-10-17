import React from 'react';
import { getOrderCogs, getOrderItemCost } from '../../../shared/orderCostCoverage';
import { money } from '../../../shared/pricingWorkbench';
import { getOrderGatewayFee, getOrderShippingFinances, hasRecordedShippingCost } from '../../../shared/orderFinancialCore';

export function OrderCostSummary({ items, order, formatAmount = money, showSources = true }: { items: any[]; order?: any; formatAmount?: (n: number) => string; showSources?: boolean }) {
  if (!items.length) return null;
  const cogs = getOrderCogs({ items });
  const gateway = order ? getOrderGatewayFee(order) : null;
  const freight = order ? getOrderShippingFinances(order) : null;
  const hasActualFreight = hasRecordedShippingCost(order);
  const provisional = !cogs.isComplete || (order && (!gateway!.isExact || !hasActualFreight));
  return <section aria-label="Composição dos custos" className="min-w-0 space-y-3 rounded border border-black/15 bg-white p-3 text-xs text-black">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-black">Custos dos produtos</h4><strong>{formatAmount(cogs.cogs)}</strong></div>
    <p className={provisional ? 'text-amber-800' : 'text-emerald-800'}>{provisional ? 'Resultado provisório: confira as pendências e estimativas.' : 'Custos conferidos.'}</p>
    {items.map((item, index) => {
      const cost = getOrderItemCost(item);
      const snapshot = item.costComposition;
      return <details key={`${item.manualLineId || item.id}-${index}`} className="min-w-0 border-t border-black/10 pt-2">
        <summary className="cursor-pointer break-words leading-relaxed">{item.name || item.displayName || item.product?.name} · {item.size} · {item.quantity} un. — {formatAmount(cost.totalCost)}{cost.costCoverage !== 'complete' && ' · A conferir'}</summary>
        <div className="mt-2 space-y-1 pl-2">
          {(snapshot?.components || []).map((part: any, i: number) => <div key={i} className="break-words"><div className="flex flex-wrap justify-between gap-1"><span>{part.name}</span><b>{part.unitCost == null ? 'Falta cadastrar' : `${formatAmount(part.unitCost)}/peça`}</b></div>{showSources && <small className="block text-gray-500">{part.source}</small>}</div>)}
          {!snapshot && <p>Valor histórico preservado; composição detalhada indisponível.</p>}
          {[...(snapshot?.pending || []), ...(snapshot?.warnings || [])].map((note: string, i: number) => <p key={i} className="break-words text-amber-800">{note}</p>)}
          {item.costEditReviewRequired && <p className="text-amber-800">Peça ou arte alterada: conferir o custo.</p>}
          {snapshot?.calculatedAt && <small className="block text-gray-500">Valores guardados em {new Date(snapshot.calculatedAt).toLocaleDateString('pt-BR')}.</small>}
        </div>
      </details>;
    })}
    {order && <div className="space-y-1 border-t border-black/10 pt-2">
      <p>Taxa do pagamento: {formatAmount(gateway!.fee)} · {gateway!.isExact ? 'valor registrado' : 'estimativa'}</p>
      <p>Frete pago pela loja: {hasActualFreight ? formatAmount(freight!.shippingActualCost) : 'a confirmar'}</p>
      <p className="text-gray-500">Taxas e frete são apurados separadamente dos custos dos produtos.</p>
    </div>}
  </section>;
}
