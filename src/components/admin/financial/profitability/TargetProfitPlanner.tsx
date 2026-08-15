import React, { useState, useMemo } from 'react';
import { 
  Award, 
  TrendingUp, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  DollarSign,
  Target,
  Sparkles,
  ShoppingBag
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import { 
  calculateTargetProfitRequirements, 
  type TargetProfitResult 
} from '../../../../utils/profitability';

interface TargetProfitPlannerProps {
  currentRevenue: number;
  currentUnits: number;
  averageContributionMarginRatio: number; // in % (e.g. 35.5)
  averageTicket: number;
  fixedExpensesFromDRE: number;
}

export const TargetProfitPlanner: React.FC<TargetProfitPlannerProps> = ({
  currentRevenue,
  currentUnits,
  averageContributionMarginRatio,
  averageTicket,
  fixedExpensesFromDRE
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  // Target profit input state (e.g. R$ 5.000)
  const [targetProfit, setTargetProfit] = useState<number>(5000.00);
  const [customFixedExpenses, setCustomFixedExpenses] = useState<number>(fixedExpensesFromDRE);
  const [customMarginRatio, setCustomMarginRatio] = useState<number>(averageContributionMarginRatio > 0 ? averageContributionMarginRatio : 30);
  const [customTicket, setCustomTicket] = useState<number>(averageTicket > 0 ? averageTicket : 149.90);

  // Quick preset shortcuts
  const presets = [2000, 5000, 10000, 20000, 50000];

  // Calculate target profit requirements using canonical function
  const plan: TargetProfitResult = useMemo(() => {
    return calculateTargetProfitRequirements({
      fixedOperatingExpenses: customFixedExpenses,
      targetProfit,
      averageContributionMarginRatio: customMarginRatio,
      averageSalePrice: customTicket
    });
  }, [customFixedExpenses, targetProfit, customMarginRatio, customTicket]);

  const revenueGap = Math.max(0, plan.requiredRevenueForTargetProfit - currentRevenue);
  const unitsGap = Math.max(0, plan.requiredUnitsForTargetProfit - currentUnits);
  const progressPercent = plan.requiredRevenueForTargetProfit > 0
    ? Math.min(200, Math.round((currentRevenue / plan.requiredRevenueForTargetProfit) * 100))
    : 100;
  const isGoalAchieved = revenueGap === 0;

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white border border-black/10 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Award className="text-[#eab308]" size={20} />
            <h2 className="text-sm font-black uppercase tracking-widest text-black">Planejador de Metas de Lucro Líquido</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Planejamento quantitativo de faturamento e volume de vendas necessários para atingir seu objetivo de lucro líquido operacional.
          </p>
        </div>
        <span className="text-[9px] font-mono text-gray-400 uppercase bg-gray-50 px-2.5 py-1 border border-black/5">
          Simulação Canônica 9.6.1
        </span>
      </div>

      {/* Inputs Card */}
      <div className="bg-white border border-black/10 p-6 space-y-5 shadow-xs">
        <div className="border-b border-black/10 pb-3 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
            <Target size={14} className="text-[#eab308]" />
            Defina sua Meta de Lucro Operacional
          </h3>
          <span className="text-[9px] font-bold uppercase text-gray-400">Objetivo Líquido</span>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[9px] font-black uppercase text-gray-500 mr-1">Atalhos Rápidos:</span>
          {presets.map(p => (
            <button
              key={p}
              onClick={() => setTargetProfit(p)}
              className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border transition-colors cursor-pointer ${targetProfit === p ? 'bg-black text-[#eab308] border-black shadow-xs' : 'bg-gray-50 text-gray-700 border-black/10 hover:bg-gray-100'}`}
            >
              {formatMoney(p)}
            </button>
          ))}
        </div>

        {/* Input fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Target Profit Input */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider flex items-center justify-between">
              <span>Meta de Lucro (R$)</span>
              <span className="text-emerald-600 font-mono font-bold">Líquido</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-mono text-gray-400">R$</span>
              <input
                type="number"
                step="500"
                min="0"
                value={targetProfit}
                onChange={(e) => setTargetProfit(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-gray-50 border border-black/10 pl-8 pr-3 py-2 text-xs font-mono font-black focus:bg-white focus:outline-none focus:border-black"
              />
            </div>
          </div>

          {/* Fixed Expenses Input */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider">
              Custos Fixos da Operação (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-mono text-gray-400">R$</span>
              <input
                type="number"
                step="100"
                min="0"
                value={customFixedExpenses}
                onChange={(e) => setCustomFixedExpenses(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-gray-50 border border-black/10 pl-8 pr-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-black"
              />
            </div>
          </div>

          {/* Average Margin % Input */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider">
              Margem de Contribuição Média (%)
            </label>
            <div className="relative">
              <input
                type="number"
                step="1"
                min="1"
                max="90"
                value={customMarginRatio}
                onChange={(e) => setCustomMarginRatio(Math.min(90, Math.max(1, parseFloat(e.target.value) || 30)))}
                className="w-full bg-gray-50 border border-black/10 px-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-black"
              />
            </div>
          </div>

          {/* Average Ticket Input */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider">
              Ticket / Preço Médio (R$)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-mono text-gray-400">R$</span>
              <input
                type="number"
                step="1"
                min="1"
                value={customTicket}
                onChange={(e) => setCustomTicket(Math.max(1, parseFloat(e.target.value) || 149.90))}
                className="w-full bg-gray-50 border border-black/10 pl-8 pr-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-black"
              />
            </div>
          </div>

        </div>

      </div>

      {/* Main Results Hero Card */}
      <div className="bg-black text-white p-6 space-y-6 border border-black shadow-lg">
        
        {/* Header with goal badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-[#eab308] block">Resultado do Planejamento</span>
            <span className="text-xl font-black uppercase tracking-tight text-white">
              Faturamento & Vendas Necessárias
            </span>
          </div>
          <div>
            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 border ${isGoalAchieved ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-[#eab308] border-amber-500/30'}`}>
              Progresso da Meta: {progressPercent}%
            </span>
          </div>
        </div>

        {/* Big Numbers Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1">
            <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Faturamento Necessário</span>
            <span className="text-2xl font-black font-mono text-[#eab308] block">
              {formatMoney(plan.requiredRevenueForTargetProfit)}
            </span>
            <span className="text-[8px] text-gray-400 uppercase font-medium block">
              Para cobrir fixos + lucro
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Unidades Necessárias</span>
            <span className="text-2xl font-black font-mono text-white block">
              {plan.requiredUnitsForTargetProfit} un.
            </span>
            <span className="text-[8px] text-gray-400 uppercase font-medium block">
              Volume total de peças
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Cobertura Total</span>
            <span className="text-2xl font-black font-mono text-emerald-400 block">
              {formatMoney(plan.totalCoverageRequired)}
            </span>
            <span className="text-[8px] text-gray-400 uppercase font-medium block">
              {formatMoney(customFixedExpenses)} (Fixos) + {formatMoney(targetProfit)} (Lucro)
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Quanto Falta Faturar</span>
            <span className={`text-2xl font-black font-mono block ${isGoalAchieved ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isGoalAchieved ? 'Meta Atingida!' : formatMoney(revenueGap)}
            </span>
            <span className="text-[8px] text-gray-400 uppercase font-medium block">
              {isGoalAchieved ? `${currentUnits} un. vendidas` : `~${unitsGap} unidades restantes`}
            </span>
          </div>
        </div>

        {/* Progress Bar towards Target Profit */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="flex items-center justify-between text-xs uppercase font-bold">
            <span className="text-gray-400">Faturamento Atual: {formatMoney(currentRevenue)}</span>
            <span className="text-[#eab308]">Meta Total: {formatMoney(plan.requiredRevenueForTargetProfit)}</span>
          </div>
          <div className="h-3 bg-white/10 overflow-hidden border border-white/20">
            <div 
              className={`h-full transition-all duration-500 ${isGoalAchieved ? 'bg-emerald-500' : 'bg-[#eab308]'}`}
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>
        </div>

      </div>

      {/* Strategic Insights Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider block">Ticket Médio Atual</span>
          <span className="text-xl font-black font-mono text-black block">{formatMoney(averageTicket > 0 ? averageTicket : customTicket)}</span>
          <p className="text-[8.5px] text-gray-400 uppercase font-medium mt-1">
            Base histórica de vendas no período
          </p>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider block">Margem Média de Contribuição</span>
          <span className="text-xl font-black font-mono text-[#eab308] block">{formatPercent(plan.averageContributionMarginRatio)}</span>
          <p className="text-[8.5px] text-gray-400 uppercase font-medium mt-1">
            Gera ~{formatMoney(plan.averageContributionPerUnit)} de margem por peça
          </p>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider block">Volume Diário Estimado</span>
          <span className="text-xl font-black font-mono text-blue-700 block">
            {Math.ceil(plan.requiredUnitsForTargetProfit / 30)} un./dia
          </span>
          <p className="text-[8.5px] text-gray-400 uppercase font-medium mt-1">
            Meta diária de produção para 30 dias
          </p>
        </div>

      </div>

    </div>
  );
};
