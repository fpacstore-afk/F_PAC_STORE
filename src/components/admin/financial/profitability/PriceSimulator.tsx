import React, { useState, useMemo } from 'react';
import { 
  Calculator, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  Layers, 
  ArrowRight, 
  ShieldAlert, 
  ShieldCheck, 
  HelpCircle,
  Percent,
  DollarSign,
  Truck,
  RotateCcw
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import { 
  simulateProductPrice, 
  calculateMinimumPrice, 
  calculatePriceForDesiredMargin,
  classifyMargin,
  type PriceSimulationParams,
  type PriceSimulationResult,
  type ProductProfitabilityItem
} from '../../../../utils/profitability';
import { FINANCIAL_DEFAULTS } from '../../../../../shared/financialDefaults';

interface PriceSimulatorProps {
  products?: ProductProfitabilityItem[];
}

export const PriceSimulator: React.FC<PriceSimulatorProps> = ({ products = [] }) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();

  // Selected product from catalog (optional)
  const [selectedProductId, setSelectedProductId] = useState<string>('custom');

  // Input states with robust defaults
  const [unitCost, setUnitCost] = useState<number>(45.00);
  const [isCostEstimated, setIsCostEstimated] = useState<boolean>(false);
  const [basePrice, setBasePrice] = useState<number>(149.90);
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [gatewayFeePercent, setGatewayFeePercent] = useState<number>(FINANCIAL_DEFAULTS.gateway.defaultFeePercent);
  const [gatewayFixedFee, setGatewayFixedFee] = useState<number>(FINANCIAL_DEFAULTS.gateway.defaultFixedFee);
  const [shippingCost, setShippingCost] = useState<number>(25.00);
  const [shippingCharged, setShippingCharged] = useState<number>(15.00);
  const [otherVariableCosts, setOtherVariableCosts] = useState<number>(0.00);
  const [desiredMarginPercent, setDesiredMarginPercent] = useState<number>(FINANCIAL_DEFAULTS.defaultDesiredMarginPercent);

  // Auto-fill when selecting product
  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    if (productId === 'custom') {
      setIsCostEstimated(false);
      return;
    }

    const prod = products.find(p => p.id === productId || p.slug === productId);
    if (prod) {
      setUnitCost(prod.unitCost);
      setIsCostEstimated(!prod.isCostSnapshot);
      if (prod.unitPrice > 0) {
        setBasePrice(prod.unitPrice);
      }
    }
  };

  // Reset to default baseline
  const handleReset = () => {
    setSelectedProductId('custom');
    setUnitCost(45.00);
    setIsCostEstimated(false);
    setBasePrice(149.90);
    setDiscountPercent(0);
    setGatewayFeePercent(FINANCIAL_DEFAULTS.gateway.defaultFeePercent);
    setGatewayFixedFee(FINANCIAL_DEFAULTS.gateway.defaultFixedFee);
    setShippingCost(25.00);
    setShippingCharged(15.00);
    setOtherVariableCosts(0.00);
    setDesiredMarginPercent(FINANCIAL_DEFAULTS.defaultDesiredMarginPercent);
  };

  // Calculate simulation result exclusively using canonical function
  const simulation: PriceSimulationResult = useMemo(() => {
    return simulateProductPrice({
      unitCost,
      salePrice: basePrice,
      discountPercent,
      gatewayFeePercent,
      gatewayFixedFee,
      shippingCost,
      shippingCharged,
      otherVariableCosts,
      desiredMarginPercent
    });
  }, [
    unitCost,
    basePrice,
    discountPercent,
    gatewayFeePercent,
    gatewayFixedFee,
    shippingCost,
    shippingCharged,
    otherVariableCosts,
    desiredMarginPercent
  ]);

  const marginClassification = classifyMargin(simulation.contributionMarginPercent);

  // Automatic discount sensitivity table (0%, 5%, 10%, 15%, 20%, 25%, 30%)
  const discountTiers = useMemo(() => {
    const percentages = [0, 5, 10, 15, 20, 25, 30];
    return percentages.map(disc => {
      const res = simulateProductPrice({
        unitCost,
        salePrice: basePrice,
        discountPercent: disc,
        gatewayFeePercent,
        gatewayFixedFee,
        shippingCost,
        shippingCharged,
        otherVariableCosts,
        desiredMarginPercent
      });
      const cls = classifyMargin(res.contributionMarginPercent);
      return {
        discountPercent: disc,
        finalPrice: res.finalSalePrice,
        gatewayFee: res.gatewayFee,
        shippingSubsidy: res.shippingSubsidy,
        marginMoney: res.contributionMargin,
        marginPercent: res.contributionMarginPercent,
        classification: cls,
        isBelowMinimum: res.finalSalePrice < res.minimumPrice
      };
    });
  }, [
    unitCost,
    basePrice,
    gatewayFeePercent,
    gatewayFixedFee,
    shippingCost,
    shippingCharged,
    otherVariableCosts,
    desiredMarginPercent
  ]);

  const isBelowMinimum = simulation.finalSalePrice < simulation.minimumPrice;
  const isBelowDesired = simulation.contributionMarginPercent < desiredMarginPercent;
  const priceDeltaToDesired = Math.max(0, simulation.recommendedPrice - simulation.finalSalePrice);

  return (
    <div className="space-y-6">
      
      {/* Header & Controls */}
      <div className="bg-white border border-black/10 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="text-[#eab308]" size={20} />
            <h2 className="text-sm font-black uppercase tracking-widest text-black">Simulador Dinâmico de Preço & Rentabilidade</h2>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Simulação matemática instantânea baseada na metodologia canônica de Margem de Contribuição Direta.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-black/10 text-[9px] font-black uppercase tracking-wider text-gray-600 hover:text-black hover:bg-gray-100 transition-colors"
        >
          <RotateCcw size={12} />
          Restaurar Padrões
        </button>
      </div>

      {/* Main Grid: Inputs vs Outputs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Simulation Inputs (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-black/10 p-6 space-y-5 shadow-xs">
          <div className="border-b border-black/10 pb-3 flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
              <Layers size={14} />
              Parâmetros de Entrada
            </h3>
            <span className="text-[9px] font-mono text-gray-400">Read-Only</span>
          </div>

          {/* Product Pre-fill Selector */}
          {products.length > 0 && (
            <div className="space-y-1.5 bg-gray-50 p-3 border border-black/5">
              <label className="text-[9px] font-black uppercase tracking-wider text-gray-700 block">
                Selecionar Artigo do Catálogo (Auto-Preencher)
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => handleProductSelect(e.target.value)}
                className="w-full bg-white border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-black"
              >
                <option value="custom">-- Simulação Livre / Manual --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.line}) — Custo: {formatMoney(p.unitCost)}
                  </option>
                ))}
              </select>
              {selectedProductId !== 'custom' && (
                <div className="flex items-center gap-1.5 mt-1.5 text-[9px] font-bold">
                  {isCostEstimated ? (
                    <span className="text-amber-700 bg-amber-50 px-2 py-0.5 border border-amber-200 flex items-center gap-1">
                      <AlertTriangle size={10} /> Custo Estimado por Linha
                    </span>
                  ) : (
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-200 flex items-center gap-1">
                      <ShieldCheck size={10} /> Custo Real Cadastrado
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Unit Cost */}
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider flex items-center justify-between">
                <span>Custo Unitário (CMV)</span>
                <span className="text-red-500 font-mono">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-mono text-gray-400">R$</span>
                <input
                  type="number"
                  step="0.10"
                  min="0"
                  value={unitCost}
                  onChange={(e) => {
                    setUnitCost(Math.max(0, parseFloat(e.target.value) || 0));
                    setSelectedProductId('custom');
                  }}
                  className="w-full bg-gray-50 border border-black/10 pl-8 pr-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-black"
                />
              </div>
            </div>

            {/* Target Price */}
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider flex items-center justify-between">
                <span>Preço Pretendido</span>
                <span className="text-black font-mono">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-mono text-gray-400">R$</span>
                <input
                  type="number"
                  step="0.50"
                  min="0"
                  value={basePrice}
                  onChange={(e) => setBasePrice(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-gray-50 border border-black/10 pl-8 pr-3 py-2 text-xs font-mono font-black focus:bg-white focus:outline-none focus:border-black"
                />
              </div>
            </div>

            {/* Discount % */}
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider flex items-center justify-between">
                <span>Desconto / Cupom</span>
                <span className="text-amber-600 font-mono font-bold">{discountPercent}%</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                  className="w-full bg-gray-50 border border-black/10 px-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-black"
                />
              </div>
            </div>

            {/* Desired Margin % */}
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider flex items-center justify-between">
                <span>Margem Alvo</span>
                <span className="text-[#eab308] font-mono font-bold">{desiredMarginPercent}%</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="90"
                  value={desiredMarginPercent}
                  onChange={(e) => setDesiredMarginPercent(Math.min(90, Math.max(1, parseFloat(e.target.value) || 30)))}
                  className="w-full bg-gray-50 border border-black/10 px-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-black"
                />
              </div>
            </div>

            {/* Gateway Fee % */}
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider">
                Taxa Gateway (%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="30"
                value={gatewayFeePercent}
                onChange={(e) => setGatewayFeePercent(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-gray-50 border border-black/10 px-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-black"
              />
            </div>

            {/* Gateway Fixed Fee */}
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider">
                Taxa Fixa Gateway (R$)
              </label>
              <input
                type="number"
                step="0.10"
                min="0"
                value={gatewayFixedFee}
                onChange={(e) => setGatewayFixedFee(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-gray-50 border border-black/10 px-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-black"
              />
            </div>

            {/* Shipping Cost */}
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider">
                Custo Real do Frete (R$)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={shippingCost}
                onChange={(e) => setShippingCost(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-gray-50 border border-black/10 px-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-black"
              />
            </div>

            {/* Shipping Charged */}
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider">
                Frete Cobrado Cliente (R$)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={shippingCharged}
                onChange={(e) => setShippingCharged(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-gray-50 border border-black/10 px-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-black"
              />
            </div>

          </div>

          {/* Other Variable Costs */}
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-gray-600 tracking-wider">
              Outros Custos Variáveis por Unidade (Tags, Brindes, Embalagem Extra)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-mono text-gray-400">R$</span>
              <input
                type="number"
                step="0.50"
                min="0"
                value={otherVariableCosts}
                onChange={(e) => setOtherVariableCosts(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-gray-50 border border-black/10 pl-8 pr-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-black"
              />
            </div>
          </div>

        </div>

        {/* Right Column: Calculated Outputs & Diagnostics (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Main Profitability Result Box */}
          <div className="bg-black text-white p-6 space-y-6 border border-black shadow-lg">
            
            {/* Top row with status badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#eab308] block">Resultado da Simulação</span>
                <span className="text-xl font-black uppercase tracking-tight text-white">
                  Margem de Contribuição Direta
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 border ${marginClassification.badgeClass}`}>
                  Margem {marginClassification.label}
                </span>
              </div>
            </div>

            {/* Key Metrics Output */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Preço Final Venda</span>
                <span className="text-2xl font-black font-mono text-white block">{formatMoney(simulation.finalSalePrice)}</span>
                {discountPercent > 0 && (
                  <span className="text-[8px] text-amber-400 uppercase font-medium block">
                    -{discountPercent}% ({formatMoney(basePrice - simulation.finalSalePrice)})
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Custo Variável Total</span>
                <span className="text-2xl font-black font-mono text-red-400 block">{formatMoney(simulation.totalVariableCost)}</span>
                <span className="text-[8px] text-gray-400 uppercase font-medium block">CMV + Taxas + Frete Sub.</span>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Margem em R$</span>
                <span className={`text-2xl font-black font-mono block ${simulation.contributionMargin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatMoney(simulation.contributionMargin)}
                </span>
                <span className="text-[8px] text-gray-400 uppercase font-medium block">Por unidade vendida</span>
              </div>

              <div className="space-y-1">
                <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider block">Margem em %</span>
                <span className={`text-2xl font-black font-mono block ${simulation.contributionMarginPercent >= 0 ? 'text-[#eab308]' : 'text-red-400'}`}>
                  {formatPercent(simulation.contributionMarginPercent)}
                </span>
                <span className="text-[8px] text-gray-400 uppercase font-medium block">Meta: {desiredMarginPercent}%</span>
              </div>
            </div>

            {/* Variable Costs Detailed Breakdown */}
            <div className="pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[10px] uppercase font-bold text-gray-300">
              <div>
                <span className="text-gray-500 block text-[8px]">Insumo (CMV)</span>
                <span className="font-mono text-white">{formatMoney(unitCost)}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[8px]">Gateway ({gatewayFeePercent}%)</span>
                <span className="font-mono text-white">{formatMoney(simulation.gatewayFee)}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[8px]">Frete Subsidiado</span>
                <span className="font-mono text-white">{formatMoney(simulation.shippingSubsidy)}</span>
              </div>
              <div>
                <span className="text-gray-500 block text-[8px]">Outros Variáveis</span>
                <span className="font-mono text-white">{formatMoney(otherVariableCosts)}</span>
              </div>
            </div>

          </div>

          {/* Pricing Thresholds & Recommendations Box */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Minimum Price Box */}
            <div className={`p-4 border ${isBelowMinimum ? 'bg-red-50 border-red-200 text-red-900' : 'bg-gray-50 border-black/10 text-gray-900'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">Preço Mínimo (0% CM)</span>
                {isBelowMinimum ? <AlertTriangle className="text-red-600" size={16} /> : <CheckCircle2 className="text-emerald-600" size={16} />}
              </div>
              <span className="text-xl font-black font-mono text-black block mt-1">
                {formatMoney(simulation.minimumPrice)}
              </span>
              <p className="text-[9px] text-gray-500 mt-1 uppercase font-medium">
                Ponto de equilíbrio unitário. Vender abaixo deste valor gera prejuízo operacional direto.
              </p>
            </div>

            {/* Recommended Price for Desired Margin */}
            <div className="bg-gray-50 border border-black/10 p-4 text-gray-900">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-gray-500">Preço Recomendado ({desiredMarginPercent}%)</span>
                <TrendingUp className="text-[#eab308]" size={16} />
              </div>
              <span className="text-xl font-black font-mono text-emerald-700 block mt-1">
                {formatMoney(simulation.recommendedPrice)}
              </span>
              <p className="text-[9px] text-gray-500 mt-1 uppercase font-medium">
                Preço ideal para garantir a margem de contribuição alvo configurada.
              </p>
            </div>

          </div>

          {/* Dynamic Warning Banners */}
          {isBelowMinimum && (
            <div className="p-4 bg-red-600 text-white border border-red-700 flex items-start gap-3 text-xs">
              <ShieldAlert size={20} className="shrink-0 text-white" />
              <div>
                <p className="font-black uppercase tracking-wider text-[11px]">ALERTA CRÍTICO: Venda Abaixo do Preço Mínimo Sustentável</p>
                <p className="opacity-90 mt-0.5">
                  O preço final de {formatMoney(simulation.finalSalePrice)} não cobre os custos variáveis ({formatMoney(simulation.totalVariableCost)}). Cada unidade vendida gera prejuízo líquido de {formatMoney(Math.abs(simulation.contributionMargin))}.
                </p>
              </div>
            </div>
          )}

          {!isBelowMinimum && isBelowDesired && (
            <div className="p-4 bg-amber-50 text-amber-900 border border-amber-300 flex items-start gap-3 text-xs">
              <AlertTriangle size={20} className="shrink-0 text-amber-600" />
              <div>
                <p className="font-black uppercase tracking-wider text-[11px]">Margem Abaixo da Meta ({desiredMarginPercent}%)</p>
                <p className="opacity-90 mt-0.5">
                  A margem atual ({formatPercent(simulation.contributionMarginPercent)}) está abaixo do alvo. Aumente o preço em {formatMoney(priceDeltaToDesired)} para atingir a meta recomendada de {formatMoney(simulation.recommendedPrice)}.
                </p>
              </div>
            </div>
          )}

        </div>

      </div>

      {/* Discount Sensitivity Matrix Table (0% to 30%) */}
      <div className="bg-white border border-black/10 p-6 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/10 pb-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
              <Percent size={14} className="text-[#eab308]" />
              Matriz de Sensibilidade a Descontos (0% a 30%)
            </h3>
            <p className="text-[10px] text-gray-500 uppercase mt-0.5 font-medium">
              Avaliação de impacto de cupons promocionais na margem unitária do produto
            </p>
          </div>
          <span className="text-[9px] font-mono text-gray-400 uppercase">Fórmula Canônica 9.6.1</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs uppercase border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-black/10 text-[9px] font-black text-gray-600">
                <th className="p-3">Desconto</th>
                <th className="p-3 text-right">Preço Final</th>
                <th className="p-3 text-right">Gateway Fee</th>
                <th className="p-3 text-right">Frete Sub.</th>
                <th className="p-3 text-right">Margem R$</th>
                <th className="p-3 text-right">Margem %</th>
                <th className="p-3 text-center">Classificação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {discountTiers.map((tier) => (
                <tr key={tier.discountPercent} className={`hover:bg-gray-50 transition-colors ${tier.discountPercent === discountPercent ? 'bg-amber-50/50 font-bold' : ''}`}>
                  <td className="p-3 font-mono font-black text-black">
                    {tier.discountPercent}%
                    {tier.discountPercent === 0 && <span className="text-[8px] text-gray-400 ml-1">(Preço Cheio)</span>}
                  </td>
                  <td className="p-3 text-right font-mono font-bold text-black">{formatMoney(tier.finalPrice)}</td>
                  <td className="p-3 text-right font-mono text-gray-500">{formatMoney(tier.gatewayFee)}</td>
                  <td className="p-3 text-right font-mono text-gray-500">{formatMoney(tier.shippingSubsidy)}</td>
                  <td className={`p-3 text-right font-mono font-bold ${tier.marginMoney >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatMoney(tier.marginMoney)}
                  </td>
                  <td className={`p-3 text-right font-mono font-black ${tier.classification.type === 'healthy' || tier.classification.type === 'excellent' ? 'text-emerald-600' : (tier.classification.type === 'low' ? 'text-amber-600' : 'text-red-600')}`}>
                    {formatPercent(tier.marginPercent)}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border ${tier.classification.badgeClass}`}>
                      {tier.classification.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
