import React, { useState, useMemo } from 'react';
import { 
  PieChart, 
  Layers, 
  Calculator, 
  Target, 
  Award, 
  Filter, 
  Calendar, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle,
  TrendingUp,
  Sparkles,
  Zap
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import { 
  calculateOrderProfitability, 
  calculateProductProfitability,
  calculateFinancialDRE,
  calculateProfitabilityOverviewStats,
  type OrderProfitability,
  type ProductProfitabilityItem
} from '../../../../utils/orderFinancial';
import { ProfitabilityOverview } from './ProfitabilityOverview';
import { ProductProfitabilityView } from './ProductProfitabilityView';
import { PriceSimulator } from './PriceSimulator';
import { BreakEvenView } from './BreakEvenView';
import { TargetProfitPlanner } from './TargetProfitPlanner';
import { CommercialIntelligenceView } from './CommercialIntelligenceView';

export type ProfitabilitySection = 'overview' | 'products' | 'simulator' | 'breakeven' | 'targets' | 'commercial';

interface ProfitabilityPricingDashboardProps {
  orders: any[];
  expenses?: any[];
  investments?: any[];
  traffic?: any[];
  productCatalog: any[];
  periodFilter: string;
  onPeriodChange?: (period: any) => void;
  loading?: boolean;
}

export const ProfitabilityPricingDashboard: React.FC<ProfitabilityPricingDashboardProps> = ({
  orders,
  expenses = [],
  investments = [],
  traffic = [],
  productCatalog = [],
  periodFilter,
  onPeriodChange,
  loading = false
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();
  const [activeSection, setActiveSection] = useState<ProfitabilitySection>('overview');

  // Compute canonical order-level profitability dataset
  const ordersProfitability: OrderProfitability[] = useMemo(() => {
    return orders.map(o => calculateOrderProfitability(o, productCatalog));
  }, [orders, productCatalog]);

  // Compute canonical product-level profitability dataset
  const productsProfitability: ProductProfitabilityItem[] = useMemo(() => {
    return calculateProductProfitability(orders, productCatalog);
  }, [orders, productCatalog]);

  // Compute canonical financial DRE for fixed expenses and overarching metrics
  const dre = useMemo(() => {
    return calculateFinancialDRE(orders, expenses, investments, traffic, productCatalog);
  }, [orders, expenses, investments, traffic, productCatalog]);

  // High-level aggregates for break-even & targets via canonical helper
  const aggregateMetrics = useMemo(() => {
    const stats = calculateProfitabilityOverviewStats(ordersProfitability);
    const totalUnitsSold = productsProfitability.reduce((acc, p) => acc + p.unitsSold, 0);

    const averageMarginPercent = stats.marginPercent > 0
      ? stats.marginPercent
      : 30;

    const averageTicket = totalUnitsSold > 0 && stats.netRevenue > 0
      ? Number((stats.netRevenue / totalUnitsSold).toFixed(2))
      : 149.90;

    const fixedExpenses = dre.fixedExpenses || 0;

    return {
      totalNetRevenue: stats.netRevenue,
      totalContributionMargin: stats.contributionMargin,
      totalUnitsSold,
      averageMarginPercent,
      averageTicket,
      fixedExpenses
    };
  }, [ordersProfitability, productsProfitability, dre]);

  if (loading) {
    return (
      <div className="p-12 text-center bg-white border border-black/10 shadow-xs space-y-3">
        <RefreshCw className="animate-spin text-[#eab308] mx-auto" size={28} />
        <p className="text-xs font-black uppercase tracking-widest text-black">
          Calculando Métricas Canônicas de Rentabilidade...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Sub-navigation Menu */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-black/10 p-2 shadow-xs">
        <div className="flex flex-wrap gap-1">
          {[
            { id: 'overview', label: '1. Visão Geral', icon: <PieChart size={13} /> },
            { id: 'products', label: '2. Produtos', icon: <Layers size={13} /> },
            { id: 'simulator', label: '3. Simulador de Preço', icon: <Calculator size={13} /> },
            { id: 'breakeven', label: '4. Break-Even', icon: <Target size={13} /> },
            { id: 'targets', label: '5. Metas de Lucro', icon: <Award size={13} /> },
            { id: 'commercial', label: '6. Inteligência Comercial', icon: <Zap size={13} /> }
          ].map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id as ProfitabilitySection)}
              className={`px-3.5 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 border transition-all cursor-pointer ${activeSection === sec.id ? 'bg-black text-[#eab308] border-black shadow-xs scale-101' : 'bg-white text-gray-600 border-black/5 hover:bg-gray-100 hover:text-black'}`}
            >
              {sec.icon}
              {sec.label}
            </button>
          ))}
        </div>

        {/* Global Security / Privacy Indicator */}
        <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 border border-black/5 text-[9px] font-mono font-bold text-gray-500">
          <ShieldCheck size={12} className="text-emerald-600" />
          <span>Motor 9.6.1 Canônico</span>
        </div>
      </div>

      {/* 1. Visão Geral */}
      {activeSection === 'overview' && (
        <ProfitabilityOverview
          ordersProfitability={ordersProfitability}
          productsProfitability={productsProfitability}
          dre={dre}
          onNavigateToTab={(tab) => setActiveSection(tab as ProfitabilitySection)}
        />
      )}

      {/* 2. Rentabilidade por Produto */}
      {activeSection === 'products' && (
        <ProductProfitabilityView
          products={productsProfitability}
          orders={orders}
        />
      )}

      {/* 3. Simulador de Preço */}
      {activeSection === 'simulator' && (
        <PriceSimulator
          products={productsProfitability}
        />
      )}

      {/* 4. Break-Even */}
      {activeSection === 'breakeven' && (
        <BreakEvenView
          currentRevenue={aggregateMetrics.totalNetRevenue}
          currentUnits={aggregateMetrics.totalUnitsSold}
          averageContributionMarginRatio={aggregateMetrics.averageMarginPercent}
          averageTicket={aggregateMetrics.averageTicket}
          fixedExpensesFromDRE={aggregateMetrics.fixedExpenses}
        />
      )}

      {/* 5. Metas de Lucro */}
      {activeSection === 'targets' && (
        <TargetProfitPlanner
          currentRevenue={aggregateMetrics.totalNetRevenue}
          currentUnits={aggregateMetrics.totalUnitsSold}
          averageContributionMarginRatio={aggregateMetrics.averageMarginPercent}
          averageTicket={aggregateMetrics.averageTicket}
          fixedExpensesFromDRE={aggregateMetrics.fixedExpenses}
        />
      )}

      {/* 6. Inteligência Comercial */}
      {activeSection === 'commercial' && (
        <CommercialIntelligenceView
          ordersProfitability={ordersProfitability}
          productsProfitability={productsProfitability}
          dre={dre}
          onNavigateToSimulator={(slug) => {
            setActiveSection('simulator');
          }}
        />
      )}

    </div>
  );
};
