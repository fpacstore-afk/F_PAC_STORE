import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  TrendingUp, 
  Search, 
  Filter, 
  ArrowUpDown, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldCheck, 
  ShieldAlert, 
  ChevronRight, 
  Award,
  DollarSign,
  Package,
  TrendingDown
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import { 
  classifyMargin, 
  calculateMinimumPrice, 
  calculatePriceForDesiredMargin,
  aggregateProfitabilityByLine,
  type ProductProfitabilityItem 
} from '../../../../utils/profitability';
import { ProductProfitabilityDrawer } from './ProductProfitabilityDrawer';

interface ProductProfitabilityViewProps {
  products: ProductProfitabilityItem[];
  orders: any[];
  onOpenProductDrawer?: (product: ProductProfitabilityItem) => void;
}

export const ProductProfitabilityView: React.FC<ProductProfitabilityViewProps> = ({
  products,
  orders
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  // Filters & State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedLine, setSelectedLine] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'ranking_money' | 'ranking_percent' | 'critical' | 'all'>('ranking_money');
  const [selectedProductForDrawer, setSelectedProductForDrawer] = useState<ProductProfitabilityItem | null>(null);

  // Filtered dataset
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.slug.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLine = selectedLine === 'all' || p.line.toUpperCase() === selectedLine.toUpperCase();
      return matchesSearch && matchesLine;
    });
  }, [products, searchTerm, selectedLine]);

  // Aggregated Line Stats (FORCE, MARK, PRIME) - Margem Bruta / CMV Consolidada via helper canônico
  const lineStats = useMemo(() => {
    return aggregateProfitabilityByLine(products);
  }, [products]);

  // Rankings
  const topByMoney = useMemo(() => {
    return [...products]
      .filter(p => p.totalRevenue > 0)
      .sort((a, b) => b.grossProfit - a.grossProfit)
      .slice(0, 10);
  }, [products]);

  const topByPercent = useMemo(() => {
    return [...products]
      .filter(p => p.totalRevenue > 0 && p.unitsSold >= 1)
      .sort((a, b) => b.marginPercent - a.marginPercent)
      .slice(0, 10);
  }, [products]);

  const criticalProducts = useMemo(() => {
    return products.filter(p => {
      const cls = classifyMargin(p.marginPercent);
      return cls.type === 'negative' || cls.type === 'critical';
    });
  }, [products]);

  // Display list based on active subtab
  const displayedProducts = useMemo(() => {
    if (activeTab === 'ranking_money') {
      return [...filteredProducts].sort((a, b) => b.grossProfit - a.grossProfit);
    }
    if (activeTab === 'ranking_percent') {
      return [...filteredProducts].sort((a, b) => b.marginPercent - a.marginPercent);
    }
    if (activeTab === 'critical') {
      return filteredProducts.filter(p => {
        const cls = classifyMargin(p.marginPercent);
        return cls.type === 'negative' || cls.type === 'critical';
      });
    }
    return filteredProducts;
  }, [filteredProducts, activeTab]);

  return (
    <div className="space-y-6">
      
      {/* Comparativo de Linhas (FORCE / MARK / PRIME) */}
      <div className="bg-white border border-black/10 p-6 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/10 pb-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
              <Layers size={14} className="text-[#eab308]" />
              Desempenho Consolidado por Linha de Produto
            </h3>
            <p className="text-[10px] text-gray-500 uppercase mt-0.5">
              Comparativo de Lucro Bruto e CMV agregado entre as coleções FORCE, MARK e PRIME
            </p>
          </div>
          <span className="text-[9px] font-mono text-gray-400 uppercase">Classificação Canônica</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {lineStats.map(ls => (
            <div key={ls.lineName} className="bg-gray-50 border border-black/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-widest text-black">Linha {ls.lineName}</span>
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border ${ls.grossClassification.badgeClass}`}>
                  {ls.grossClassification.label} ({formatPercent(ls.grossMarginPercent)})
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[8.5px] uppercase text-gray-500 block font-bold">Faturamento</span>
                  <span className="font-mono font-black text-black">{formatMoney(ls.totalRevenue)}</span>
                </div>
                <div>
                  <span className="text-[8.5px] uppercase text-gray-500 block font-bold">CMV Total</span>
                  <span className="font-mono font-bold text-red-600">{formatMoney(ls.totalCogs)}</span>
                </div>
                <div>
                  <span className="text-[8.5px] uppercase text-gray-500 block font-bold">Lucro Bruto</span>
                  <span className={`font-mono font-black ${ls.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatMoney(ls.grossProfit)}
                  </span>
                </div>
                <div>
                  <span className="text-[8.5px] uppercase text-gray-500 block font-bold">Unidades</span>
                  <span className="font-mono font-bold text-blue-700">{ls.unitsSold} un.</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerta de Produtos Críticos/Negativos se houver */}
      {criticalProducts.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 flex items-start gap-3 text-xs text-amber-900">
          <ShieldAlert size={20} className="shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="font-black uppercase tracking-wider text-[11px]">
              Atenção: {criticalProducts.length} produto(s) com margem negativa ou crítica identificados
            </p>
            <p className="opacity-90 mt-0.5">
              Revise os custos unitários e preços de venda para evitar erosão da rentabilidade operacional da loja.
            </p>
          </div>
          <button
            onClick={() => setActiveTab('critical')}
            className="px-3 py-1 bg-amber-600 text-white font-black text-[9px] uppercase tracking-wider hover:bg-amber-700 transition-colors"
          >
            Ver Críticos
          </button>
        </div>
      )}

      {/* Main Table and Rankings Section */}
      <div className="bg-white border border-black/10 p-6 space-y-5 shadow-xs">
        
        {/* Navigation Tabs for Views */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 pb-4">
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'ranking_money', label: 'Top 10 Lucro Bruto (R$)', icon: <DollarSign size={12} /> },
              { id: 'ranking_percent', label: 'Top 10 Margem Bruta (%)', icon: <TrendingUp size={12} /> },
              { id: 'critical', label: `Críticos / Negativos (${criticalProducts.length})`, icon: <AlertTriangle size={12} /> },
              { id: 'all', label: `Todos os Artigos (${products.length})`, icon: <Layers size={12} /> }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 border transition-colors cursor-pointer ${activeTab === tab.id ? 'bg-black text-[#eab308] border-black shadow-xs' : 'bg-gray-50 text-gray-600 border-black/10 hover:bg-gray-100 hover:text-black'}`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search and Line Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Buscar produto/slug..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-black/10 focus:bg-white focus:outline-none focus:border-black font-bold uppercase"
              />
            </div>
            <select
              value={selectedLine}
              onChange={(e) => setSelectedLine(e.target.value)}
              className="bg-gray-50 border border-black/10 px-3 py-1.5 text-xs font-bold uppercase focus:outline-none focus:border-black"
            >
              <option value="all">Todas as Linhas</option>
              <option value="FORCE">Linha FORCE</option>
              <option value="MARK">Linha MARK</option>
              <option value="PRIME">Linha PRIME</option>
              <option value="OTHER">Outros / Não Classificados</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto border border-black/10">
          <table className="w-full text-left text-xs uppercase border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-black/10 text-[9px] font-black text-gray-600">
                <th className="p-3">Produto</th>
                <th className="p-3 text-center">Linha</th>
                <th className="p-3 text-center">Qtd Vendida</th>
                <th className="p-3 text-right">Faturamento</th>
                <th className="p-3 text-right">CMV Total</th>
                <th className="p-3 text-right">Lucro Bruto</th>
                <th className="p-3 text-right">Margem Bruta %</th>
                <th className="p-3 text-center">Custo</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {displayedProducts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-400 font-bold uppercase text-xs">
                    Nenhum produto encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                displayedProducts.map((prod) => {
                  const marginClass = classifyMargin(prod.marginPercent);
                  return (
                    <tr 
                      key={prod.id || prod.slug}
                      onClick={() => setSelectedProductForDrawer(prod)}
                      className="hover:bg-amber-50/40 transition-colors cursor-pointer"
                    >
                      <td className="p-3">
                        <div className="space-y-0.5">
                          <span className="font-black text-black block line-clamp-1">{prod.name}</span>
                          <span className="text-[9px] font-mono text-gray-400 block">{prod.slug}</span>
                        </div>
                      </td>

                      <td className="p-3 text-center">
                        <span className="text-[9px] font-black px-2 py-0.5 bg-gray-100 border border-black/5 text-gray-700">
                          {prod.line}
                        </span>
                      </td>

                      <td className="p-3 text-center font-mono font-bold text-black">
                        {prod.unitsSold}
                      </td>

                      <td className="p-3 text-right font-mono font-bold text-black">
                        {formatMoney(prod.totalRevenue)}
                      </td>

                      <td className="p-3 text-right font-mono font-medium text-red-600">
                        {formatMoney(prod.totalCogs)}
                      </td>

                      <td className={`p-3 text-right font-mono font-black ${prod.grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {formatMoney(prod.grossProfit)}
                      </td>

                      <td className="p-3 text-right font-mono font-black text-black">
                        {formatPercent(prod.marginPercent)}
                      </td>

                      <td className="p-3 text-center">
                        {prod.isCostSnapshot ? (
                          <span className="inline-flex items-center gap-1 text-[8.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 border border-emerald-200" title="Custo Real Cadastrado">
                            <ShieldCheck size={10} /> Real
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[8.5px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 border border-amber-200" title="Custo Estimado por Linha">
                            <AlertTriangle size={10} /> Estimado
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-center">
                        <span className={`text-[8.5px] font-black uppercase tracking-wider px-2 py-0.5 border ${marginClass.badgeClass}`}>
                          {marginClass.label}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProductForDrawer(prod);
                          }}
                          className="p-1.5 text-gray-400 hover:text-black hover:bg-black/5 transition-colors border border-black/5"
                          title="Ver Detalhes do Produto"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Product Drawer */}
      <ProductProfitabilityDrawer
        product={selectedProductForDrawer}
        orders={orders}
        onClose={() => setSelectedProductForDrawer(null)}
      />

    </div>
  );
};
