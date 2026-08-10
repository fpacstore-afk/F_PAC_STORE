import React from 'react';
import { Search, RotateCw, FileSpreadsheet } from 'lucide-react';
import { PRODUCTION_STAGES, getStageFromStatus } from '../../../constants/productionStages';

interface OrderFiltersProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  stockFilter: 'all' | 'moved' | 'not_moved';
  setStockFilter: (val: 'all' | 'moved' | 'not_moved') => void;
  orders: any[];
  orderSubView: 'list' | 'reports' | 'logs';
  setOrderSubView: (view: 'list' | 'reports' | 'logs') => void;
}

export const OrderFilters: React.FC<OrderFiltersProps> = ({
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  stockFilter,
  setStockFilter,
  orders,
  orderSubView,
  setOrderSubView
}) => {
  return (
    <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-md p-2 border border-black/10 shadow-xs flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="flex-1 min-w-[200px] relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
        <input 
          type="text" 
          placeholder="Buscar por ID, Nome ou E-mail..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          className="w-full pl-8 pr-3 py-1.5 border border-black/10 text-xs focus:outline-none focus:border-[#eab308] bg-gray-50/50" 
        />
      </div>

      {/* Stage Filter */}
      <select 
        value={statusFilter} 
        onChange={e => setStatusFilter(e.target.value)} 
        className="py-1.5 px-2.5 border border-black/10 text-[10px] font-black uppercase tracking-wider focus:outline-none focus:border-[#eab308] cursor-pointer bg-white"
      >
        <option value="all">⚡ TODAS AS ETAPAS ({orders.length})</option>
        {PRODUCTION_STAGES.map(stage => {
          const count = orders.filter(o => getStageFromStatus(o.status).id === stage.id).length;
          return (
            <option key={stage.id} value={stage.id}>
              {stage.emoji} {stage.label.toUpperCase()} ({count})
            </option>
          );
        })}
      </select>

      {/* Stock Filter */}
      <select 
        value={stockFilter} 
        onChange={e => setStockFilter(e.target.value as any)} 
        className="py-1.5 px-2.5 border border-black/10 text-[10px] font-black uppercase tracking-wider focus:outline-none focus:border-[#eab308] cursor-pointer bg-white"
      >
        <option value="all">📦 ESTOQUE: TODOS</option>
        <option value="moved">📈 COM BAIXA</option>
        <option value="not_moved">🔘 SEM BAIXA</option>
      </select>

      {/* Audit Logs Subview Toggle */}
      <button
        onClick={() => setOrderSubView(orderSubView === 'logs' ? 'list' : 'logs')}
        className={`px-3 py-1.5 border text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all ${
          orderSubView === 'logs' 
            ? 'bg-black text-[#eab308] border-black' 
            : 'bg-white text-gray-700 border-black/10 hover:border-black'
        }`}
      >
        <RotateCw size={12} /> {orderSubView === 'logs' ? 'Ver Pedidos' : 'Logs de Auditoria'}
      </button>
    </div>
  );
};
