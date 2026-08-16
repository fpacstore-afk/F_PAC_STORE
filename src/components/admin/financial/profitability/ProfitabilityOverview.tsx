import React, { useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Percent, 
  ShieldAlert, 
  ShieldCheck, 
  AlertTriangle, 
  Layers, 
  Award, 
  Truck, 
  CreditCard,
  ShoppingBag,
  HelpCircle,
  ArrowUpRight
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import { 
  classifyMargin, 
  calculateProfitabilityOverviewStats,
  aggregateProfitabilityByLine,
  type OrderProfitability, 
  type ProductProfitabilityItem 
} from '../../../../utils/profitability';

interface ProfitabilityOverviewProps {
  ordersProfitability: OrderProfitability[];
  productsProfitability: ProductProfitabilityItem[];
  dre: any;
  onNavigateToTab?: (tab: 'products' | 'simulator' | 'breakeven' | 'targets') => void;
}

export const ProfitabilityOverview: React.FC<ProfitabilityOverviewProps> = ({
  ordersProfitability,
  productsProfitability,
  dre,
  onNavigateToTab
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  // Aggregate high-level metrics directly derived from canonical items
  const stats = useMemo(() => {
    return calculateProfitabilityOverviewStats(ordersProfitability);
  }, [ordersProfitability]);

  const marginClass = stats.classification;

  // Line stats - strictly canonical with all 8 requested metrics
  const lineStats = useMemo(() => {
    return aggregateProfitabilityByLine(productsProfitability, ordersProfitability);
  }, [productsProfitability, ordersProfitability]);

  // Top Products by Contribution Margin (Margem de Contribuição R$)
  const topProducts = useMemo(() => {
    return [...productsProfitability]
      .filter(p => p.grossRevenue > 0 || p.totalRevenue > 0)
      .sort((a, b) => b.contributionMargin - a.contributionMargin)
      .slice(0, 5);
  }, [productsProfitability]);

  return (
    <div className="space-y-6">
      
      {/* Alert Banner: Estimated Costs */}
      {stats.isCostEstimated && (
        <div className="p-4 bg-amber-50 border border-amber-300 flex items-start gap-3 text-xs text-amber-900 shadow-xs">
          <AlertTriangle size={18} className="shrink-0 text-amber-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-black uppercase tracking-wider text-[11px]">
              Aviso de Cobertura de Custo ({stats.costCoveragePercent}%)
            </p>
            <p className="opacity-90 mt-0.5">
              Algumas métricas de rentabilidade utilizam custos estimados (defaults por linha FORCE/MARK/PRIME) para pedidos sem snapshot explícito no catálogo.
            </p>
          </div>
        </div>
      )}

      {/* Alert Banner: Negative Margin Orders */}
      {stats.negativeMarginOrdersCount > 0 && (
        <div className="p-4 bg-red-50 border border-red-300 flex items-start gap-3 text-xs text-red-900 shadow-xs">
          <ShieldAlert size={18} className="shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-black uppercase tracking-wider text-[11px]">
              Alerta de Margem Negativa: {stats.negativeMarginOrdersCount} pedido(s) geraram prejuízo de contribuição
            </p>
            <p className="opacity-90 mt-0.5">
              A soma de CMV, frete subsidiado e taxas de gateway superou o valor líquido recebido nesses pedidos. Verifique descontos e políticas de frete.
            </p>
          </div>
        </div>
      )}

      {/* Main KPI Cards Grid (8 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. Receita Líquida */}
        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">Receita Líquida</span>
            <DollarSign className="text-emerald-600" size={16} />
          </div>
          <span className="text-2xl font-black font-mono block text-black">{formatMoney(stats.netRevenue)}</span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">
            Capturado deduzido de reembolsos
          </span>
        </div>

        {/* 2. COGS / CMV */}
        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">COGS / CMV Total</span>
            <ShoppingBag className="text-red-500" size={16} />
          </div>
          <span className="text-2xl font-black font-mono block text-red-600">{formatMoney(stats.cogs)}</span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">
            Custo dos insumos e confecção
          </span>
        </div>

        {/* 3. Margem de Contribuição R$ */}
        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">Margem Contribuição</span>
            <TrendingUp className={stats.contributionMargin >= 0 ? "text-emerald-600" : "text-red-600"} size={16} />
          </div>
          <span className={`text-2xl font-black font-mono block ${stats.contributionMargin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {formatMoney(stats.contributionMargin)}
          </span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">
            Receita Líq. - Custos Variáveis
          </span>
        </div>

        {/* 4. Margem de Contribuição % */}
        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">Margem %</span>
            <span className={`text-[8.5px] font-black uppercase tracking-wider px-1.5 py-0.5 border ${marginClass.badgeClass}`}>
              {marginClass.label}
            </span>
          </div>
          <span className={`text-2xl font-black font-mono block ${marginClass.type === 'healthy' || marginClass.type === 'excellent' ? 'text-emerald-700' : (marginClass.type === 'low' ? 'text-amber-600' : 'text-red-600')}`}>
            {formatPercent(stats.marginPercent)}
          </span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">
            Meta operacional: 30%
          </span>
        </div>

        {/* 5. Gateway Fees */}
        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">Gateway Fees</span>
            <CreditCard className="text-gray-500" size={16} />
          </div>
          <span className="text-2xl font-black font-mono block text-gray-800">{formatMoney(stats.gatewayFees)}</span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">
            Taxas PIX, Cartão e Boletos
          </span>
        </div>

        {/* 6. Frete Subsidiado */}
        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">Frete Subsidiado</span>
            <Truck className="text-blue-600" size={16} />
          </div>
          <span className="text-2xl font-black font-mono block text-blue-800">{formatMoney(stats.shippingSubsidy)}</span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">
            Custo real frete - cobrado
          </span>
        </div>

        {/* 7. Pedidos com Margem Negativa */}
        <div className={`p-5 border shadow-xs space-y-1 ${stats.negativeMarginOrdersCount > 0 ? 'bg-red-50/50 border-red-200' : 'bg-white border-black/10'}`}>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">Margem Negativa</span>
            <ShieldAlert className={stats.negativeMarginOrdersCount > 0 ? "text-red-600" : "text-gray-400"} size={16} />
          </div>
          <span className={`text-2xl font-black font-mono block ${stats.negativeMarginOrdersCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
            {stats.negativeMarginOrdersCount} pedidos
          </span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">
            {stats.negativeMarginOrdersCount > 0 ? 'Exigem revisão urgente' : 'Nenhum pedido em prejuízo'}
          </span>
        </div>

        {/* 8. Cobertura de Custos */}
        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">Cobertura Custos</span>
            {stats.costCoveragePercent >= 100 ? <ShieldCheck className="text-emerald-600" size={16} /> : <AlertTriangle className="text-amber-500" size={16} />}
          </div>
          <span className={`text-2xl font-black font-mono block ${stats.costCoveragePercent >= 100 ? 'text-emerald-700' : 'text-amber-600'}`}>
            {stats.costCoveragePercent}%
          </span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">
            {stats.completeCogsOrders} exatos / {stats.estimatedCogsOrders} estimados
          </span>
        </div>

      </div>

      {/* Visual Breakdown of Variable Cost Load */}
      <div className="bg-black text-white p-6 space-y-4 border border-black shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-[#eab308] block">Composição da Receita Líquida</span>
            <span className="text-base font-black uppercase tracking-tight text-white">
              Absorção de Custos Variáveis & Margem Residual
            </span>
          </div>
          <span className="text-[10px] font-mono text-gray-400 font-bold">Total: {formatMoney(stats.netRevenue)}</span>
        </div>

        {/* Progress Multi-Bar */}
        {stats.netRevenue > 0 ? (
          <div className="space-y-3">
            <div className="h-4 bg-white/10 flex overflow-hidden border border-white/20">
              <div 
                className="bg-red-500 h-full transition-all" 
                style={{ width: `${stats.revenueComposition.cogsBarWidth}%` }} 
                title={`COGS: ${formatMoney(stats.cogs)}`}
              />
              <div 
                className="bg-amber-500 h-full transition-all" 
                style={{ width: `${stats.revenueComposition.gatewayBarWidth}%` }} 
                title={`Gateway: ${formatMoney(stats.gatewayFees)}`}
              />
              <div 
                className="bg-blue-500 h-full transition-all" 
                style={{ width: `${stats.revenueComposition.shippingBarWidth}%` }} 
                title={`Frete Sub.: ${formatMoney(stats.shippingSubsidy)}`}
              />
              <div 
                className="bg-emerald-500 h-full transition-all" 
                style={{ width: `${stats.revenueComposition.marginBarWidth}%` }} 
                title={`Margem: ${formatMoney(stats.contributionMargin)}`}
              />
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-[9px] font-black uppercase pt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-red-500 inline-block" />
                <span className="text-gray-300">CMV: {formatMoney(stats.cogs)} ({formatPercent(stats.revenueComposition.cogsPercent)})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-amber-500 inline-block" />
                <span className="text-gray-300">Gateway: {formatMoney(stats.gatewayFees)} ({formatPercent(stats.revenueComposition.gatewayPercent)})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-blue-500 inline-block" />
                <span className="text-gray-300">Frete Sub.: {formatMoney(stats.shippingSubsidy)} ({formatPercent(stats.revenueComposition.shippingSubsidyPercent)})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-emerald-500 inline-block" />
                <span className="text-[#eab308]">Margem Contrib.: {formatMoney(stats.contributionMargin)} ({formatPercent(stats.revenueComposition.marginPercent)})</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-gray-500 text-xs uppercase font-bold">
            Sem dados de faturamento líquido no período selecionado.
          </div>
        )}
      </div>

      {/* Two Column Section: Line Summary & Top 5 Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left: Summary by Product Line */}
        <div className="bg-white border border-black/10 p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-black/10 pb-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
              <Layers size={14} />
              Performance por Linha
            </h3>
            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('products')}
                className="text-[9px] font-black uppercase text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                Ver Produtos <ArrowUpRight size={10} />
              </button>
            )}
          </div>

          <div className="space-y-4">
            {lineStats.map(ls => (
              <div key={ls.lineName} className="p-4 bg-gray-50 border border-black/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-black">Linha {ls.lineName}</span>
                    <span className="text-[9px] font-mono text-gray-500 font-bold">({ls.unitsSold} un. vendidas)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const breakdown = ls.costSourceBreakdown;
                      const is100Snapshot = ls.unitsSold > 0
                        ? (breakdown ? breakdown.snapshotUnits === ls.unitsSold : !ls.isEstimated && ls.costCoverage === 100 && ls.costSource === 'snapshot')
                        : ls.costSource === 'snapshot';

                      if (is100Snapshot) {
                        return (
                          <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 border border-emerald-200" title="100% Snapshot de Corte">
                            100% Snapshot
                          </span>
                        );
                      }

                      if (ls.costSource === 'catalog' || (!ls.isEstimated && ls.costCoverage >= 100)) {
                        return (
                          <span className="text-[8px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 border border-blue-200" title="Custo Cadastrado no Catálogo">
                            Custo cadastrado — cobertura 100%
                          </span>
                        );
                      }

                      if (ls.costSource === 'missing' || (breakdown && breakdown.missingUnits > 0)) {
                        return (
                          <span className="text-[8px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 border border-red-200" title="Custo Incompleto">
                            Custo incompleto — cobertura {ls.costCoverage}%
                          </span>
                        );
                      }

                      return (
                        <span className="text-[8px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 border border-amber-200" title="Custo Estimado por Linha">
                          Custo estimado — cobertura {ls.costCoverage}%
                        </span>
                      );
                    })()}
                    <span className={`text-[8.5px] font-black uppercase px-2 py-0.5 border ${ls.classification.badgeClass}`}>
                      {ls.classification.label} ({formatPercent(ls.contributionMarginPercent)})
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="bg-white p-2 border border-black/5">
                    <span className="text-[8px] uppercase text-gray-400 block font-sans font-bold">Receita Líq.</span>
                    <span className="font-bold text-black">{formatMoney(ls.netRevenue)}</span>
                  </div>
                  <div className="bg-white p-2 border border-black/5">
                    <span className="text-[8px] uppercase text-gray-400 block font-sans font-bold">CMV Total</span>
                    <span className="font-bold text-red-600">{formatMoney(ls.cogs)}</span>
                  </div>
                  <div className="bg-white p-2 border border-black/5">
                    <span className="text-[8px] uppercase text-gray-400 block font-sans font-bold">Gateway Fees</span>
                    <span className="font-bold text-gray-700">{formatMoney(ls.gatewayFees)}</span>
                  </div>
                  <div className="bg-white p-2 border border-black/5">
                    <span className="text-[8px] uppercase text-gray-400 block font-sans font-bold">Frete Sub.</span>
                    <span className="font-bold text-blue-700">{formatMoney(ls.shippingSubsidy)}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-black/5 text-xs font-mono">
                  <span className="text-[9px] uppercase font-bold text-gray-500 font-sans">Margem de Contribuição:</span>
                  <span className={`font-black ${ls.contributionMargin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatMoney(ls.contributionMargin)} ({formatPercent(ls.contributionMarginPercent)})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Top 5 Margin Drivers */}
        <div className="bg-white border border-black/10 p-6 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-black/10 pb-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
              <Award size={14} className="text-[#eab308]" />
              Top 5 Artigos em Margem de Contribuição (R$)
            </h3>
            {onNavigateToTab && (
              <button
                onClick={() => onNavigateToTab('products')}
                className="text-[9px] font-black uppercase text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                Ranking Completo <ArrowUpRight size={10} />
              </button>
            )}
          </div>

          <div className="space-y-2">
            {topProducts.length === 0 ? (
              <p className="text-xs text-gray-400 font-bold uppercase text-center py-6">
                Nenhum produto vendido no período
              </p>
            ) : (
              topProducts.map((p, idx) => (
                <div key={p.id} className="flex items-center justify-between p-2.5 bg-gray-50 border border-black/5 hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-mono font-black text-gray-400">#{idx + 1}</span>
                    <div>
                      <span className="text-xs font-black uppercase text-black line-clamp-1 block">{p.name}</span>
                      <span className="text-[8.5px] font-mono text-gray-500 uppercase">{p.unitsSold} un. vendidas</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-mono font-black block ${p.contributionMargin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {formatMoney(p.contributionMargin)}
                    </span>
                    <span className="text-[8.5px] font-mono text-gray-500 font-bold">
                      {formatPercent(p.contributionMarginPercent)} MC
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};
