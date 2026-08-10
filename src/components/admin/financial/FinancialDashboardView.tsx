import React from 'react';
import { TrendingUp, DollarSign, Award, Target, Percent } from 'lucide-react';

interface FinancialDashboardViewProps {
  totalRevenue: number;
  totalInvestments: number;
  totalCashflowOut: number;
  netProfit: number;
  roi: number;
  formatMoney: (val: number) => string;
  formatPercent: (val: number) => string;
}

export const FinancialDashboardView: React.FC<FinancialDashboardViewProps> = ({
  totalRevenue,
  totalInvestments,
  totalCashflowOut,
  netProfit,
  roi,
  formatMoney,
  formatPercent
}) => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Faturamento Bruto</span>
            <DollarSign className="text-emerald-600" size={18} />
          </div>
          <span className="text-2xl font-black font-mono block text-emerald-700">{formatMoney(totalRevenue)}</span>
          <span className="text-[9px] text-gray-400 uppercase tracking-widest mt-1 block">Total Vendas Aprovadas</span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Aportes e Investimentos</span>
            <Target className="text-blue-600" size={18} />
          </div>
          <span className="text-2xl font-black font-mono block text-blue-700">{formatMoney(totalInvestments)}</span>
          <span className="text-[9px] text-gray-400 uppercase tracking-widest mt-1 block">Estrutura & Equipamentos</span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">Lucro Líquido Real</span>
            <TrendingUp className={netProfit >= 0 ? "text-emerald-600" : "text-red-600"} size={18} />
          </div>
          <span className={`text-2xl font-black font-mono block ${netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
            {formatMoney(netProfit)}
          </span>
          <span className="text-[9px] text-gray-400 uppercase tracking-widest mt-1 block">Receita - Despesas</span>
        </div>

        <div className="bg-white border border-black/10 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">ROI Geral do Projeto</span>
            <Award className="text-[#eab308]" size={18} />
          </div>
          <span className="text-2xl font-black font-mono block text-black">{formatPercent(roi)}</span>
          <span className="text-[9px] text-gray-400 uppercase tracking-widest mt-1 block">Retorno sobre Aportes</span>
        </div>
      </div>
    </div>
  );
};
