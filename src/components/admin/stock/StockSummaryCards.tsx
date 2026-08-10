import React from 'react';
import { Box, AlertTriangle, Database } from 'lucide-react';

interface StockSummaryCardsProps {
  totalItemsCount: number;
  criticalCount: number;
  outOfStockCount: number;
  totalPiecesCount: number;
  setStockStatusFilter: (status: 'all' | 'critical' | 'out_of_stock' | 'normal') => void;
}

export const StockSummaryCards: React.FC<StockSummaryCardsProps> = ({
  totalItemsCount,
  criticalCount,
  outOfStockCount,
  totalPiecesCount,
  setStockStatusFilter
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <div 
        onClick={() => setStockStatusFilter('all')}
        className="bg-white border border-black/10 p-3 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between"
      >
        <div>
          <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 block font-sans">Cadastrados</span>
          <span className="text-xl font-black font-mono tracking-tight mt-0.5 block">{totalItemsCount}</span>
        </div>
        <Box className="text-gray-400" size={20} />
      </div>

      <div 
        onClick={() => setStockStatusFilter('critical')}
        className="bg-white border border-black/10 p-3 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between"
      >
        <div>
          <span className="text-[8px] font-black uppercase tracking-widest text-amber-600 block font-sans">Estoque Crítico</span>
          <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-amber-700">{criticalCount}</span>
        </div>
        <AlertTriangle className="text-amber-500" size={20} />
      </div>

      <div 
        onClick={() => setStockStatusFilter('out_of_stock')}
        className="bg-white border border-black/10 p-3 shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center justify-between"
      >
        <div>
          <span className="text-[8px] font-black uppercase tracking-widest text-red-600 block font-sans">Esgotados</span>
          <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-red-700">{outOfStockCount}</span>
        </div>
        <AlertTriangle className="text-red-500" size={20} />
      </div>

      <div className="bg-white border border-black/10 p-3 shadow-xs flex items-center justify-between">
        <div>
          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 block font-sans">Total de Peças</span>
          <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-emerald-700">{totalPiecesCount}</span>
        </div>
        <Database className="text-emerald-500" size={20} />
      </div>
    </div>
  );
};
