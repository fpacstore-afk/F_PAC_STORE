import React from 'react';
import { X, Layers, TrendingUp, AlertTriangle, ShieldCheck, ShoppingBag, DollarSign } from 'lucide-react';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import { 
  classifyMargin, 
  calculateMinimumPrice, 
  calculatePriceForDesiredMargin,
  type ProductProfitabilityItem 
} from '../../../../utils/profitability';

interface ProductProfitabilityDrawerProps {
  product: ProductProfitabilityItem | null;
  orders: any[];
  onClose: () => void;
}

export const ProductProfitabilityDrawer: React.FC<ProductProfitabilityDrawerProps> = ({
  product,
  orders,
  onClose
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  if (!product) return null;

  const marginClass = classifyMargin(product.marginPercent);

  const minPrice = calculateMinimumPrice({
    unitCost: product.unitCost
  });

  const recPrice = calculatePriceForDesiredMargin({
    unitCost: product.unitCost,
    desiredMarginPercent: 30
  });

  // Encontrar pedidos que contêm esse produto (sem expor PII como CPF/nome/email)
  const productOrders = orders.filter(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    return items.some((it: any) => 
      (it.slug && it.slug === product.slug) || 
      (it.id && it.id === product.id) || 
      (it.productId && it.productId === product.id)
    );
  }).map(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    const matchedItem = items.find((it: any) => 
      (it.slug && it.slug === product.slug) || 
      (it.id && it.id === product.id) || 
      (it.productId && it.productId === product.id)
    );
    return {
      orderId: o.id || o.orderId || 'N/A',
      date: o.createdAt || o.createdAtDate || o.created_at || o.date,
      quantity: Number(matchedItem?.quantity || matchedItem?.qty || 1),
      unitPrice: Number(matchedItem?.price || product.unitPrice),
      status: o.status || 'N/A'
    };
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col border-l border-black/10 overflow-y-auto animate-in slide-in-from-right duration-300">
        
        {/* Header */}
        <div className="p-6 bg-black text-white flex items-center justify-between sticky top-0 z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest bg-white/10 text-gray-300 px-2 py-0.5 border border-white/10">
                Linha {product.line}
              </span>
              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border ${marginClass.badgeClass}`}>
                Margem {marginClass.label}
              </span>
            </div>
            <h2 className="text-lg font-black uppercase tracking-tight text-white line-clamp-1">{product.name}</h2>
            <p className="text-[10px] font-mono text-gray-400">SKU/Slug: {product.slug}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 transition-colors border border-white/10"
            title="Fechar Detalhes"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1">
          
          {/* Status do Custo */}
          <div className={`p-4 border text-xs flex items-center gap-3 ${product.isCostSnapshot ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-amber-50/60 border-amber-200 text-amber-900'}`}>
            {product.isCostSnapshot ? (
              <ShieldCheck className="text-emerald-600 shrink-0" size={20} />
            ) : (
              <AlertTriangle className="text-amber-600 shrink-0" size={20} />
            )}
            <div>
              <p className="font-black uppercase text-[10px] tracking-wider">
                {product.isCostSnapshot ? 'Custo Real Cadastrado' : 'Custo Unitário Estimado'}
              </p>
              <p className="text-[11px] opacity-80 mt-0.5">
                {product.isCostSnapshot 
                  ? 'O custo unitário de insumo/confecção foi extraído com precisão do cadastro do produto.'
                  : 'Custo calculado com base na estimativa padrão para a linha ' + product.line + '.'}
              </p>
            </div>
          </div>

          {/* Grid de Métricas Unitárias & Sugestão */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 border border-black/5 p-3 space-y-1">
              <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider block">Preço de Venda</span>
              <span className="text-base font-black font-mono text-black block">{formatMoney(product.unitPrice)}</span>
            </div>
            <div className="bg-gray-50 border border-black/5 p-3 space-y-1">
              <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider block">Custo Unitário</span>
              <span className="text-base font-black font-mono text-red-600 block">{formatMoney(product.unitCost)}</span>
            </div>
            <div className="bg-gray-50 border border-black/5 p-3 space-y-1">
              <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider block">Preço Mínimo</span>
              <span className="text-base font-black font-mono text-amber-600 block">{formatMoney(minPrice)}</span>
            </div>
            <div className="bg-gray-50 border border-black/5 p-3 space-y-1">
              <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider block">Preço Sugerido (30%)</span>
              <span className="text-base font-black font-mono text-emerald-600 block">{formatMoney(recPrice)}</span>
            </div>
          </div>

          {/* Desempenho no Período Selecionado */}
          <div className="bg-black text-white p-5 space-y-4 border border-black">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-[#eab308]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-[#eab308]">Desempenho no Período</span>
              </div>
              <span className="text-[10px] font-mono text-gray-400 font-bold">{product.unitsSold} unid. vendidas</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <span className="text-[8.5px] font-black uppercase text-gray-400 tracking-wider block">Faturamento Bruto</span>
                <span className="text-lg font-black font-mono text-white block">{formatMoney(product.grossRevenue !== undefined ? product.grossRevenue : product.totalRevenue)}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[8.5px] font-black uppercase text-gray-400 tracking-wider block">CMV / COGS Total</span>
                <span className="text-lg font-black font-mono text-red-400 block">{formatMoney(product.cogs !== undefined ? product.cogs : product.totalCogs)}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[8.5px] font-black uppercase text-gray-400 tracking-wider block">Lucro Bruto</span>
                <span className={`text-lg font-black font-mono block ${product.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatMoney(product.grossProfit)}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[8.5px] font-black uppercase text-gray-400 tracking-wider block">Margem Bruta %</span>
                <span className="text-lg font-black font-mono text-[#eab308] block">
                  {formatPercent(product.grossMarginPercent !== undefined ? product.grossMarginPercent : product.marginPercent)}
                </span>
              </div>
            </div>

            {/* Atribuição Canônica de Custos do Pedido */}
            {product.isAllocated && (
              <div className="pt-3 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[9px] font-mono text-gray-400 uppercase">
                  <span>Política de Alocação: {product.allocationMethod}</span>
                  <span className="text-emerald-400 font-bold">Margem Contribuição: {formatMoney(product.contributionMargin)} ({formatPercent(product.contributionMarginPercent)})</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[8.5px] font-mono bg-white/5 p-2 border border-white/10">
                  <div>
                    <span className="text-gray-400 block">Gateway Alocado:</span>
                    <span className="text-white font-bold">{formatMoney(product.gatewayFeesAllocated || 0)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Frete Sub. Alocado:</span>
                    <span className="text-white font-bold">{formatMoney(product.shippingSubsidyAllocated || 0)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block">Outros Custos:</span>
                    <span className="text-white font-bold">{formatMoney(product.otherVariableCostsAllocated || 0)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Histórico de Vendas (Sem PII) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
                <ShoppingBag size={14} />
                Histórico de Vendas ({productOrders.length} registros)
              </h3>
              <span className="text-[9px] text-gray-400 uppercase font-medium">Privacidade Ativa (Sem PII)</span>
            </div>

            {productOrders.length === 0 ? (
              <div className="p-8 text-center bg-gray-50 border border-black/5 text-gray-400 text-xs uppercase font-bold">
                Nenhum pedido registrado para este produto no período
              </div>
            ) : (
              <div className="border border-black/10 overflow-hidden">
                <table className="w-full text-left text-[11px] uppercase border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-b border-black/10 text-[9px] font-black text-gray-600">
                      <th className="p-2.5">Pedido</th>
                      <th className="p-2.5 text-center">Qtd</th>
                      <th className="p-2.5 text-right">Preço Unit.</th>
                      <th className="p-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {productOrders.slice(0, 15).map((o, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition-colors">
                        <td className="p-2.5 font-mono font-bold text-black">#{String(o.orderId).slice(-6)}</td>
                        <td className="p-2.5 text-center font-bold">{o.quantity}</td>
                        <td className="p-2.5 text-right font-mono font-medium">{formatMoney(o.unitPrice)}</td>
                        <td className="p-2.5 text-right">
                          <span className="text-[9px] font-bold px-2 py-0.5 bg-gray-100 border border-black/5 text-gray-700">
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {productOrders.length > 15 && (
                  <div className="p-2 text-center text-[9px] font-black uppercase text-gray-400 bg-gray-50 border-t border-black/5">
                    Exibindo os 15 pedidos mais recentes
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-black/10 flex justify-end sticky bottom-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-black text-white text-xs font-black uppercase tracking-wider hover:bg-black/90 transition-colors"
          >
            Fechar Detalhes
          </button>
        </div>

      </div>
    </div>
  );
};
