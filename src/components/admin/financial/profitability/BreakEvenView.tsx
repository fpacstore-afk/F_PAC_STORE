import React, { useState, useMemo } from 'react';
import { 
  Target, 
  TrendingUp, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  RotateCcw,
  Percent,
  DollarSign,
  PackageCheck
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import { 
  calculateBreakEven, 
  classifyBreakEvenStatus,
  type BreakEvenResult 
} from '../../../../utils/profitability';

interface BreakEvenViewProps {
  currentRevenue: number;
  currentUnits: number;
  averageContributionMarginRatio: number; // in % (e.g. 35.5)
  averageTicket: number;
  fixedExpensesFromDRE: number;
}

export const BreakEvenView: React.FC<BreakEvenViewProps> = ({
  currentRevenue,
  currentUnits,
  averageContributionMarginRatio,
  averageTicket,
  fixedExpensesFromDRE
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  // Mode: Auto (from period DRE) vs Custom Simulation
  const [isManualOverride, setIsManualOverride] = useState<boolean>(false);
  const [customFixedExpenses, setCustomFixedExpenses] = useState<number>(fixedExpensesFromDRE);
  const [customMarginRatio, setCustomMarginRatio] = useState<number>(averageContributionMarginRatio > 0 ? averageContributionMarginRatio : 30);
  const [customAverageTicket, setCustomAverageTicket] = useState<number>(averageTicket > 0 ? averageTicket : 149.90);

  // Active parameters
  const activeFixedExpenses = isManualOverride ? customFixedExpenses : fixedExpensesFromDRE;
  const activeMarginRatio = isManualOverride ? customMarginRatio : (averageContributionMarginRatio > 0 ? averageContributionMarginRatio : 30);
  const activeTicket = isManualOverride ? customAverageTicket : (averageTicket > 0 ? averageTicket : 149.90);

  // Compute canonical break-even result
  const breakEven: BreakEvenResult = useMemo(() => {
    return calculateBreakEven({
      fixedOperatingExpenses: activeFixedExpenses,
      averageContributionMarginRatio: activeMarginRatio,
      averageSalePrice: activeTicket
    });
  }, [activeFixedExpenses, activeMarginRatio, activeTicket]);

  // Status and progress
  const statusResult = classifyBreakEvenStatus(currentRevenue, breakEven.requiredRevenue);
  const percentAchieved = breakEven.requiredRevenue > 0
    ? Math.min(200, Math.round((currentRevenue / breakEven.requiredRevenue) * 100))
    : 100;

  const revenueGap = breakEven.requiredRevenue - currentRevenue;
  const isBreakEvenAchieved = revenueGap <= 0;
  const unitsGap = Math.max(0, breakEven.requiredUnits - currentUnits);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="bg-white border border-black/10 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Target className="text-[#eab308]" size={20} />
            <h2 className="text-sm font-black uppercase tracking-widest text-black">Ponto de Equilíbrio Operacional (Break-Even)</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Faturamento e volume de vendas necessários para cobrir 100% dos custos fixos e despesas operacionais da loja.
          </p>
        </div>

        {/* Toggle Mode */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsManualOverride(false);
              setCustomFixedExpenses(fixedExpensesFromDRE);
              setCustomMarginRatio(averageContributionMarginRatio > 0 ? averageContributionMarginRatio : 30);
              setCustomAverageTicket(averageTicket > 0 ? averageTicket : 149.90);
            }}
            className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border cursor-pointer ${!isManualOverride ? 'bg-black text-[#eab308] border-black shadow-xs' : 'bg-white text-gray-500 border-black/10 hover:bg-gray-50'}`}
          >
            Automático (DRE)
          </button>
          <button
            onClick={() => setIsManualOverride(true)}
            className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider border cursor-pointer ${isManualOverride ? 'bg-black text-[#eab308] border-black shadow-xs' : 'bg-white text-gray-500 border-black/10 hover:bg-gray-50'}`}
          >
            Simulação Livre
          </button>
        </div>
      </div>

      {/* Manual Inputs when in Custom Simulation mode */}
      {isManualOverride && (
        <div className="bg-amber-50/70 border border-amber-200 p-5 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-900 flex items-center gap-1.5">
              <Layers size={14} /> Modo de Simulação de Break-Even Personalizado
            </span>
            <span className="text-[9px] text-amber-800 font-bold uppercase">Edição Livre em Memória</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-700 tracking-wider block">
                Despesas Fixas do Período (R$)
              </label>
              <input
                type="number"
                step="50"
                min="0"
                value={customFixedExpenses}
                onChange={(e) => setCustomFixedExpenses(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-white border border-amber-300 px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:border-black"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-700 tracking-wider block">
                Margem Contribuição Média (%)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="90"
                value={customMarginRatio}
                onChange={(e) => setCustomMarginRatio(Math.min(90, Math.max(1, parseFloat(e.target.value) || 30)))}
                className="w-full bg-white border border-amber-300 px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:border-black"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-700 tracking-wider block">
                Preço / Ticket Médio Unitário (R$)
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={customAverageTicket}
                onChange={(e) => setCustomAverageTicket(Math.max(1, parseFloat(e.target.value) || 149.90))}
                className="w-full bg-white border border-amber-300 px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:border-black"
              />
            </div>
          </div>
        </div>
      )}

      {/* Progress & Gauge Banner */}
      <div className="bg-black text-white p-6 space-y-6 border border-black shadow-lg">
        
        {/* Top Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-[#eab308] block">Status de Cobertura Operacional</span>
            <span className="text-xl font-black uppercase tracking-tight text-white">
              Progresso do Break-Even no Período
            </span>
          </div>
          <div>
            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 border ${statusResult.badgeClass}`}>
              {statusResult.label} ({percentAchieved}%)
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs uppercase font-bold">
            <span className="text-gray-400">Faturado: {formatMoney(currentRevenue)}</span>
            <span className="text-[#eab308]">Ponto de Equilíbrio: {formatMoney(breakEven.requiredRevenue)}</span>
          </div>
          <div className="h-4 bg-white/10 overflow-hidden border border-white/20 relative">
            <div 
              className={`h-full transition-all duration-500 ${isBreakEvenAchieved ? 'bg-emerald-500' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(100, percentAchieved)}%` }}
            />
            {percentAchieved > 100 && (
              <div 
                className="absolute top-0 right-0 h-full bg-emerald-400 opacity-30"
                style={{ width: `${Math.min(100, percentAchieved - 100)}%` }}
              />
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] uppercase font-mono text-gray-400 pt-1">
            <span>0%</span>
            <span>100% (Equilíbrio)</span>
            <span>{percentAchieved > 100 ? `Superávit (+${percentAchieved - 100}%)` : 'Meta Superada'}</span>
          </div>
        </div>

        {/* Gap and Status Feedback */}
        <div className={`p-4 border text-xs flex items-center justify-between gap-4 ${isBreakEvenAchieved ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200' : 'bg-amber-950/60 border-amber-500/40 text-amber-200'}`}>
          <div className="space-y-0.5">
            <p className="font-black uppercase tracking-wider text-[11px]">
              {isBreakEvenAchieved 
                ? '🎉 Ponto de Equilíbrio Atingido!' 
                : '⚠️ Ponto de Equilíbrio Ainda Não Atingido'}
            </p>
            <p className="opacity-85 text-[10.5px]">
              {isBreakEvenAchieved
                ? `A operação já cobriu todos os custos fixos de ${formatMoney(breakEven.fixedOperatingExpenses)}. Todo faturamento adicional gera lucro operacional direto!`
                : `Faltam ${formatMoney(revenueGap)} em faturamento líquido (aprox. ${unitsGap} unidades) para cobrir integralmente os custos fixos.`}
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-[9px] uppercase font-bold text-gray-400 block">Diferença</span>
            <span className={`text-base font-black font-mono ${isBreakEvenAchieved ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isBreakEvenAchieved ? `+${formatMoney(Math.abs(revenueGap))}` : `-${formatMoney(revenueGap)}`}
            </span>
          </div>
        </div>

      </div>

      {/* Output Grid Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider block">Faturamento Necessário</span>
          <span className="text-2xl font-black font-mono text-black block">{formatMoney(breakEven.requiredRevenue)}</span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">Para cobrir despesas fixas</span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider block">Unidades Necessárias</span>
          <span className="text-2xl font-black font-mono text-blue-700 block">{breakEven.requiredUnits} un.</span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">
            {currentUnits} vendidas ({unitsGap > 0 ? `faltam ${unitsGap}` : 'atingido'})
          </span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider block">Custos Fixos Considerados</span>
          <span className="text-2xl font-black font-mono text-red-600 block">{formatMoney(breakEven.fixedOperatingExpenses)}</span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">Aluguel, salários, sistemas</span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs space-y-1">
          <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider block">Margem Média Considerada</span>
          <span className="text-2xl font-black font-mono text-[#eab308] block">{formatPercent(breakEven.averageContributionMarginRatio)}</span>
          <span className="text-[8.5px] text-gray-400 uppercase font-medium block">
            ~{formatMoney(breakEven.averageContributionPerUnit)} por unidade
          </span>
        </div>

      </div>

    </div>
  );
};
