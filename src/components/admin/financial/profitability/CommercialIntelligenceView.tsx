import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  HelpCircle, 
  ShieldAlert, 
  Sparkles, 
  Layers, 
  Sliders, 
  DollarSign, 
  Percent, 
  ArrowUpRight, 
  ArrowDownRight, 
  Truck, 
  CreditCard, 
  BarChart3, 
  Target, 
  Activity, 
  Info,
  ChevronRight,
  Flame,
  ShieldCheck,
  Zap,
  RefreshCw,
  EyeOff,
  Filter
} from 'lucide-react';
import { useFinancialPrivacy } from '../../../../context/FinancialPrivacyContext';
import { 
  type OrderProfitability, 
  type ProductProfitabilityItem, 
  type LineProfitabilityItem,
  aggregateProfitabilityByLine,
  calculateBreakEven,
  calculateTargetProfitRequirements,
  classifyMargin
} from '../../../../utils/profitability';
import { type FinancialDREResult } from '../../../../utils/orderFinancial';
import { 
  generateCommercialRecommendations,
  classifyCommercialMatrix,
  simulateCommercialScenario,
  simulateFreeShippingImpact,
  simulatePaymentMethodImpact,
  simulateCostIncreaseSensitivity,
  calculateMaxSustainableDiscount,
  SCENARIO_PRESETS,
  SENSITIVITY_PERCENTAGES,
  type CommercialRecommendation,
  type CommercialMatrixItem,
  type CommercialScenarioResult,
  type RecommendationSeverity,
  type CommercialMatrixQuadrant
} from '../../../../utils/commercialIntelligence';
import { CommercialActionCenter } from './CommercialActionCenter';
import {
  createCommercialAction,
  fetchCommercialActions,
  createIdempotencyKey
} from '../../../../services/commercial/commercialGovernanceService';
import { generateRecommendationFingerprint } from '../../../../utils/commercialGovernance';
import { FINANCIAL_DEFAULTS } from '../../../../../shared/financialDefaults';
import { CommercialAction } from '../../../../types/commercialGovernance';

interface CommercialIntelligenceViewProps {
  ordersProfitability: OrderProfitability[];
  productsProfitability: ProductProfitabilityItem[];
  dre: FinancialDREResult;
  onNavigateToSimulator?: (productSlug?: string) => void;
  rawOrders?: any[];
  productCatalog?: any[];
  expenses?: any[];
  investments?: any[];
  traffic?: any[];
}

type CommercialSubTab = 'overview' | 'recommendations' | 'matrix' | 'scenarios' | 'lines' | 'sensitivity' | 'governance';

export const CommercialIntelligenceView: React.FC<CommercialIntelligenceViewProps> = ({
  ordersProfitability,
  productsProfitability,
  dre,
  onNavigateToSimulator,
  rawOrders = [],
  productCatalog = [],
  expenses = [],
  investments = [],
  traffic = []
}) => {
  const { formatMoney, formatPercent } = useFinancialPrivacy();
  const [activeTab, setActiveTab] = useState<CommercialSubTab>('overview');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [lineFilter, setLineFilter] = useState<string>('all');
  const [selectedProductForSensitivity, setSelectedProductForSensitivity] = useState<string>(
    productsProfitability[0]?.slug || ''
  );
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [activeActions, setActiveActions] = useState<CommercialAction[]>([]);
  // Stable Idempotency Keys map per recommendation (preserved across retries/errors)
  const [recommendationIdempotencyKeys, setRecommendationIdempotencyKeys] = useState<Record<string, string>>({});

  // Carregar ações ativas para verificação de duplicidade na interface
  const loadActiveActions = async () => {
    try {
      const res = await fetchCommercialActions({ limit: 100 });
      setActiveActions(res.actions || []);
    } catch {
      // Falha não-bloqueante na UI; a proteção real continua no backend
    }
  };

  useEffect(() => {
    loadActiveActions();
  }, [activeTab]);

  // Mapeamento de ações ativas por fingerprint
  const activeActionsByFingerprint = useMemo(() => {
    const map = new Map<string, CommercialAction>();
    activeActions.forEach(a => {
      if (['draft', 'approved', 'in_progress'].includes(a.status) && a.recommendationFingerprint) {
        map.set(a.recommendationFingerprint, a);
      }
    });
    return map;
  }, [activeActions]);

  // Scenario parameters state
  const [scenarioVolume, setScenarioVolume] = useState<number>(0);
  const [scenarioCost, setScenarioCost] = useState<number>(0);
  const [scenarioShipping, setScenarioShipping] = useState<number>(0);
  const [scenarioDiscount, setScenarioDiscount] = useState<number>(0);
  const [scenarioMarketing, setScenarioMarketing] = useState<number>(0);

  // 1. Gera recomendações comerciais determinísticas
  const recommendations = useMemo(() => {
    return generateCommercialRecommendations(productsProfitability, ordersProfitability, dre);
  }, [productsProfitability, ordersProfitability, dre]);

  const typeMap: Record<string, any> = {
    negative_margin: 'improve_margin',
    below_minimum_margin: 'review_price',
    high_shipping_impact: 'review_shipping',
    high_gateway_impact: 'review_gateway',
    opportunity_scale: 'review_promotion',
    cost_coverage_risk: 'register_cost',
    unprofitable_line: 'review_line'
  };

  // Converter Recomendação em Plano de Ação de Governança com Idempotency-Key estável entre retries
  const handleConvertToCommercialAction = async (rec: CommercialRecommendation) => {
    try {
      const priorityMap: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
        critical: 'critical',
        warning: 'high',
        opportunity: 'medium',
        info: 'low'
      };

      const key = recommendationIdempotencyKeys[rec.id] || createIdempotencyKey(`rec_act_${rec.id || 'custom'}`);
      if (!recommendationIdempotencyKeys[rec.id]) {
        setRecommendationIdempotencyKeys(prev => ({ ...prev, [rec.id]: key }));
      }

      await createCommercialAction(
        {
          title: `[Plano] ${rec.title}`,
          description: `${rec.description}\n\nAção Sugerida: ${rec.suggestedAction}`,
          type: typeMap[rec.type] || 'custom',
          priority: priorityMap[rec.severity] || 'medium',
          entityType: rec.entityType === 'product' ? 'product' : rec.entityType === 'line' ? 'line' : 'store',
          entityId: rec.entityId,
          entityName: rec.entityName,
          recommendationId: rec.id,
          reasonCodes: rec.reasonCodes,
          sourceSnapshot: {
            recommendationType: rec.type,
            reasonCodes: rec.reasonCodes,
            confidence: rec.confidence,
            isEstimated: rec.isEstimated,
            currentPrice: rec.currentMetrics?.price,
            minimumPrice: rec.currentMetrics?.minimumPrice,
            unitCost: rec.currentMetrics?.cost,
            marginPercent: rec.currentMetrics?.marginPercent,
            contributionMargin: rec.currentMetrics?.contributionMargin,
            contributionMarginPercent: rec.currentMetrics?.marginPercent
          }
        },
        key
      );

      // Limpar chave apenas em caso de sucesso
      setRecommendationIdempotencyKeys(prev => {
        const next = { ...prev };
        delete next[rec.id];
        return next;
      });

      setActionSuccessMessage(`Plano de ação criado com sucesso para "${rec.title}"! Acesse a aba Central de Ações.`);
      await loadActiveActions();
      setTimeout(() => setActionSuccessMessage(null), 5000);
    } catch (err: any) {
      alert(`Erro ao criar plano de ação: ${err.message}`);
    }
  };

  // 2. Classifica a matriz comercial Volume x Margem
  const matrixItems = useMemo(() => {
    return classifyCommercialMatrix(productsProfitability);
  }, [productsProfitability]);

  // 3. Agregação canônica por linhas
  const linesProfitability = useMemo(() => {
    return aggregateProfitabilityByLine(productsProfitability, ordersProfitability);
  }, [productsProfitability, ordersProfitability]);

  // 4. Métricas consolidadas
  const criticalCount = recommendations.filter(r => r.severity === 'critical').length;
  const warningCount = recommendations.filter(r => r.severity === 'warning').length;
  const opportunityCount = recommendations.filter(r => r.severity === 'opportunity').length;

  // Filtragem de recomendações
  const filteredRecommendations = useMemo(() => {
    return recommendations.filter(r => {
      if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
      return true;
    });
  }, [recommendations, severityFilter]);

  // Cenários pré-configurados centralizados
  const conservativeScenario = useMemo(() => {
    return simulateCommercialScenario(productsProfitability, ordersProfitability, dre, SCENARIO_PRESETS.conservative);
  }, [productsProfitability, ordersProfitability, dre]);

  const baseScenario = useMemo(() => {
    return simulateCommercialScenario(productsProfitability, ordersProfitability, dre, SCENARIO_PRESETS.base);
  }, [productsProfitability, ordersProfitability, dre]);

  const aggressiveScenario = useMemo(() => {
    return simulateCommercialScenario(productsProfitability, ordersProfitability, dre, SCENARIO_PRESETS.aggressive);
  }, [productsProfitability, ordersProfitability, dre]);

  const customScenario = useMemo(() => {
    return simulateCommercialScenario(productsProfitability, ordersProfitability, dre, {
      name: 'Simulação Personalizada',
      volumeChangePercent: scenarioVolume,
      costChangePercent: scenarioCost,
      shippingCostChangePercent: scenarioShipping,
      averageDiscountPercent: scenarioDiscount,
      marketingInvestmentDelta: scenarioMarketing
    });
  }, [productsProfitability, ordersProfitability, dre, scenarioVolume, scenarioCost, scenarioShipping, scenarioDiscount, scenarioMarketing]);

  // Produto selecionado para testes de sensibilidade
  const activeProduct = useMemo(() => {
    return productsProfitability.find(p => p.slug === selectedProductForSensitivity) || productsProfitability[0];
  }, [productsProfitability, selectedProductForSensitivity]);

  const activeProductCost = activeProduct?.unitCost || FINANCIAL_DEFAULTS.estimatedProductCosts.DEFAULT;
  const activeProductPrice = activeProduct?.unitPrice || FINANCIAL_DEFAULTS.defaultSalePrice;
  const activeProductShipping = (activeProduct && activeProduct.unitsSold > 0 && activeProduct.shippingSubsidyAllocated)
    ? activeProduct.shippingSubsidyAllocated / activeProduct.unitsSold
    : undefined;

  // Cálculos de sensibilidade do produto ativo
  const freeShippingSim = useMemo(() => {
    return simulateFreeShippingImpact(activeProductCost, activeProductPrice, activeProductShipping, 0);
  }, [activeProductCost, activeProductPrice, activeProductShipping]);

  const paymentSim = useMemo(() => {
    return simulatePaymentMethodImpact(activeProductCost, activeProductPrice);
  }, [activeProductCost, activeProductPrice]);

  const costSensitivitySim = useMemo(() => {
    return simulateCostIncreaseSensitivity(activeProductCost, activeProductPrice, SENSITIVITY_PERCENTAGES);
  }, [activeProductCost, activeProductPrice]);

  const maxDiscountAllowed = useMemo(() => {
    return calculateMaxSustainableDiscount(activeProductCost, activeProductPrice);
  }, [activeProductCost, activeProductPrice]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Header Banner com Auditoria Read-Only */}
      <div className="bg-black text-white p-5 border border-black/20 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[8.5px] font-black uppercase tracking-widest bg-[#eab308] text-black">
              FASE 9.6.3 — MOTOR ANALÍTICO
            </span>
            <span className="px-2 py-0.5 text-[8.5px] font-mono text-emerald-400 border border-emerald-400/30">
              100% READ-ONLY
            </span>
          </div>
          <h2 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
            Inteligência Comercial & Decisão de Preço
          </h2>
          <p className="text-xs text-gray-400 max-w-2xl font-mono mt-0.5">
            Diagnósticos determinísticos, análise de vulnerabilidade a custos, identificação de artigos estratégicos e simulação de cenários baseados na rentabilidade certificada.
          </p>
        </div>

        {/* Resumo Rápido de Sinais */}
        <div className="flex items-center gap-3 bg-white/5 p-3 border border-white/10 shrink-0">
          <div className="text-center px-2">
            <span className="text-xs font-mono font-bold text-red-400 block">{criticalCount}</span>
            <span className="text-[8px] font-mono uppercase text-gray-400">Críticos</span>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="text-center px-2">
            <span className="text-xs font-mono font-bold text-amber-400 block">{warningCount}</span>
            <span className="text-[8px] font-mono uppercase text-gray-400">Alertas</span>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <div className="text-center px-2">
            <span className="text-xs font-mono font-bold text-emerald-400 block">{opportunityCount}</span>
            <span className="text-[8px] font-mono uppercase text-gray-400">Oportunidades</span>
          </div>
        </div>
      </div>

      {/* Sub-abas de Inteligência Comercial */}
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 border border-black/10">
        {[
          { id: 'overview', label: 'Resumo Executivo', icon: <Activity size={13} /> },
          { id: 'recommendations', label: `Recomendações (${recommendations.length})`, icon: <Zap size={13} /> },
          { id: 'governance', label: 'Central de Ações & Metas', icon: <Target size={13} /> },
          { id: 'matrix', label: 'Matriz Volume x Margem', icon: <BarChart3 size={13} /> },
          { id: 'scenarios', label: 'Cenários Hipotéticos', icon: <Sliders size={13} /> },
          { id: 'lines', label: 'Inteligência por Linha', icon: <Layers size={13} /> },
          { id: 'sensitivity', label: 'Simulador de Sensibilidade', icon: <DollarSign size={13} /> }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as CommercialSubTab)}
            className={`px-3.5 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-black text-[#eab308] shadow-xs'
                : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-black border border-black/5'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {actionSuccessMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-lg flex items-center justify-between">
          <span>{actionSuccessMessage}</span>
          <button
            onClick={() => setActiveTab('governance')}
            className="underline font-bold hover:text-emerald-300"
          >
            Ver na Central de Ações →
          </button>
        </div>
      )}

      {/* ----------------------------------------------------
          1. RESUMO EXECUTIVO
      ---------------------------------------------------- */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Destaques Principais */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Card 1: Artigos Críticos */}
            <div className="bg-white p-5 border border-red-500/30 border-l-4 border-l-red-500 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-red-600 flex items-center gap-1.5">
                  <ShieldAlert size={14} />
                  Atenção Imediata
                </span>
                <span className="text-xs font-mono font-black text-red-600 bg-red-50 px-2 py-0.5">
                  {criticalCount} Críticos
                </span>
              </div>
              <p className="text-xs text-gray-700">
                Produtos com margem de contribuição negativa ou preço abaixo do custo mínimo de sustentabilidade.
              </p>
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={() => { setActiveTab('recommendations'); setSeverityFilter('critical'); }}
                  className="text-[9px] font-mono font-bold text-red-600 hover:underline flex items-center gap-1"
                >
                  Ver alertas críticos <ChevronRight size={12} />
                </button>
              </div>
            </div>

            {/* Card 2: Potencial Promocional */}
            <div className="bg-white p-5 border border-emerald-500/30 border-l-4 border-l-emerald-500 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1.5">
                  <Sparkles size={14} />
                  Alavancas Comerciais
                </span>
                <span className="text-xs font-mono font-black text-emerald-600 bg-emerald-50 px-2 py-0.5">
                  {opportunityCount} Candidatos
                </span>
              </div>
              <p className="text-xs text-gray-700">
                Artigos com margem sólida capazes de absorver ações de desconto ou frete grátis mantendo rentabilidade.
              </p>
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={() => { setActiveTab('recommendations'); setSeverityFilter('opportunity'); }}
                  className="text-[9px] font-mono font-bold text-emerald-600 hover:underline flex items-center gap-1"
                >
                  Ver oportunidades <ChevronRight size={12} />
                </button>
              </div>
            </div>

            {/* Card 3: Posição do Portfólio */}
            <div className="bg-white p-5 border border-blue-500/30 border-l-4 border-l-blue-500 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-1.5">
                  <BarChart3 size={14} />
                  Portfólio Ativo
                </span>
                <span className="text-xs font-mono font-black text-blue-600 bg-blue-50 px-2 py-0.5">
                  {productsProfitability.length} Artigos
                </span>
              </div>
              <p className="text-xs text-gray-700">
                {matrixItems.filter(m => m.quadrant === 'strategic').length} estratégicos, {matrixItems.filter(m => m.quadrant === 'opportunity').length} de alta margem e {matrixItems.filter(m => m.quadrant === 'optimize').length} de alto volume a otimizar.
              </p>
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={() => setActiveTab('matrix')}
                  className="text-[9px] font-mono font-bold text-blue-600 hover:underline flex items-center gap-1"
                >
                  Abrir Matriz Volume x Margem <ChevronRight size={12} />
                </button>
              </div>
            </div>

          </div>

          {/* Top 5 Recomendações Prioritárias */}
          <div className="bg-white p-5 border border-black/10 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-black/10 pb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
                <Zap size={14} className="text-[#eab308]" />
                Top Recomendações Priorizadas
              </h3>
              <button
                onClick={() => setActiveTab('recommendations')}
                className="text-[9px] font-mono font-bold text-gray-500 hover:text-black uppercase"
              >
                Ver Todas ({recommendations.length}) →
              </button>
            </div>

            <div className="space-y-3">
              {recommendations.slice(0, 4).map(rec => (
                <div 
                  key={rec.id} 
                  className={`p-4 border text-left transition-all ${
                    rec.severity === 'critical' 
                      ? 'bg-red-500/5 border-red-500/30' 
                      : rec.severity === 'warning' 
                        ? 'bg-amber-500/5 border-amber-500/30' 
                        : 'bg-emerald-500/5 border-emerald-500/30'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-[8px] font-black uppercase font-mono border ${
                        rec.severity === 'critical' ? 'bg-red-600 text-white border-red-700' :
                        rec.severity === 'warning' ? 'bg-amber-500 text-black border-amber-600' :
                        'bg-emerald-600 text-white border-emerald-700'
                      }`}>
                        {rec.severity}
                      </span>
                      <span className="text-xs font-black text-black uppercase">{rec.title}</span>
                    </div>
                    <span className="text-[9px] font-mono text-gray-400">Score de Prioridade: {rec.score}/100</span>
                  </div>

                  <p className="text-xs text-gray-600 mb-2 font-mono">
                    {rec.description}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-black/5 text-[9px] font-mono">
                    <span className="text-gray-500">
                      <strong>Ação Sugerida:</strong> {rec.suggestedAction}
                    </span>
                    {onNavigateToSimulator && rec.entityType === 'product' && (
                      <button
                        onClick={() => onNavigateToSimulator(rec.entityId)}
                        className="px-2 py-1 bg-black text-[#eab308] text-[8.5px] font-black uppercase tracking-wider hover:bg-gray-800 transition-colors"
                      >
                        Simular Recomendação
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          2. RECOMENDAÇÕES DETALHADAS
      ---------------------------------------------------- */}
      {activeTab === 'recommendations' && (
        <div className="space-y-4">
          
          {/* Filtros */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 border border-black/10 shadow-xs">
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-gray-400" />
              <span className="text-[9px] font-black uppercase tracking-wider text-black">Filtrar por Severidade:</span>
              <div className="flex gap-1">
                {['all', 'critical', 'warning', 'opportunity', 'info'].map(sev => (
                  <button
                    key={sev}
                    onClick={() => setSeverityFilter(sev)}
                    className={`px-2.5 py-1 text-[8.5px] font-mono font-bold uppercase border cursor-pointer ${
                      severityFilter === sev ? 'bg-black text-white border-black' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            <span className="text-[9px] font-mono text-gray-500">
              Exibindo {filteredRecommendations.length} de {recommendations.length} diagnósticos
            </span>
          </div>

          {/* Lista de Recomendações */}
          <div className="space-y-3">
            {filteredRecommendations.length === 0 ? (
              <div className="p-8 text-center bg-white border border-black/10 text-gray-400 font-mono text-xs">
                Nenhuma recomendação encontrada para o filtro selecionado.
              </div>
            ) : (
              filteredRecommendations.map(rec => (
                <div 
                  key={rec.id}
                  className={`p-5 border bg-white shadow-xs space-y-3 ${
                    rec.severity === 'critical' ? 'border-l-4 border-l-red-500' :
                    rec.severity === 'warning' ? 'border-l-4 border-l-amber-500' :
                    rec.severity === 'opportunity' ? 'border-l-4 border-l-emerald-500' :
                    'border-l-4 border-l-blue-500'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-black/5 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 text-[8.5px] font-black uppercase font-mono ${
                        rec.severity === 'critical' ? 'bg-red-100 text-red-700' :
                        rec.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
                        rec.severity === 'opportunity' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {rec.severity}
                      </span>
                      <h4 className="text-sm font-black uppercase text-black">{rec.title}</h4>
                      {rec.isEstimated && (
                        <span className="px-1.5 py-0.5 text-[7.5px] font-mono bg-gray-100 text-gray-500 border border-gray-200">
                          Dados Estimados
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[9px] font-mono text-gray-500">
                      <span>Confiança: <strong>{rec.confidence.toUpperCase()}</strong></span>
                      <span>Score: <strong>{rec.score}/100</strong></span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    <div className="space-y-1 bg-gray-50 p-3 border border-black/5">
                      <span className="text-[8px] font-black uppercase text-gray-400 block tracking-wider">Diagnóstico</span>
                      <p className="text-gray-800">{rec.description}</p>
                    </div>

                    <div className="space-y-1 bg-gray-50 p-3 border border-black/5">
                      <span className="text-[8px] font-black uppercase text-gray-400 block tracking-wider">Ação Recomendada</span>
                      <p className="text-gray-800 font-bold">{rec.suggestedAction}</p>
                    </div>
                  </div>

                  {/* Razões e Métricas */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-black/5 text-[8.5px] font-mono text-gray-500">
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400">Códigos de Motivo:</span>
                      {rec.reasonCodes.map(c => (
                        <span key={c} className="bg-gray-100 px-1 py-0.5 text-gray-600 font-mono">
                          {c}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      {(() => {
                        const fp = generateRecommendationFingerprint(
                          typeMap[rec.type] || 'custom',
                          rec.entityId || 'global',
                          rec.reasonCodes || []
                        );
                        const activeAction = activeActionsByFingerprint.get(fp);

                        if (activeAction) {
                          return (
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-600 border border-amber-500/30 text-[8.5px] font-mono font-bold">
                                Plano em andamento ({activeAction.status.replace('_', ' ')})
                              </span>
                              <button
                                onClick={() => setActiveTab('governance')}
                                className="px-2.5 py-1 bg-zinc-800 text-zinc-100 text-[9px] font-black uppercase tracking-wider hover:bg-zinc-700 transition-colors cursor-pointer"
                              >
                                Ver Plano
                              </button>
                            </div>
                          );
                        }

                        return (
                          <button
                            onClick={() => handleConvertToCommercialAction(rec)}
                            className="px-3 py-1 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-wider hover:bg-indigo-500 transition-colors cursor-pointer"
                          >
                            + Criar Plano de Ação
                          </button>
                        );
                      })()}
                      {onNavigateToSimulator && rec.entityType === 'product' && (
                        <button
                          onClick={() => onNavigateToSimulator(rec.entityId)}
                          className="px-3 py-1 bg-black text-[#eab308] text-[9px] font-black uppercase tracking-wider hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                          Simular
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          2.5. CENTRAL DE GOVERNANÇA, AÇÕES & METAS (FASE 9.6.4)
      ---------------------------------------------------- */}
      {activeTab === 'governance' && (
        <CommercialActionCenter
          ordersProfitability={ordersProfitability}
          productsProfitability={productsProfitability}
          dre={dre}
          recommendations={recommendations}
          onNavigateToSimulator={onNavigateToSimulator}
          rawOrders={rawOrders}
          productCatalog={productCatalog}
          expenses={expenses}
          investments={investments}
          traffic={traffic}
        />
      )}

      {/* ----------------------------------------------------
          3. MATRIZ DE RENTABILIDADE (VOLUME x MARGEM)
      ---------------------------------------------------- */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          <div className="bg-white p-5 border border-black/10 shadow-xs space-y-4">
            <div className="border-b border-black/10 pb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
                <BarChart3 size={14} className="text-[#eab308]" />
                Matriz de Portfólio Comercial (Volume x Margem de Contribuição)
              </h3>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                Classificação determinística dos artigos em 4 quadrantes conforme volume relativo e margem de contribuição (corte: 25% margem).
              </p>
            </div>

            {/* Quadrantes 2x2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* 1. Estratégico (Alto Vol / Alta Margem) */}
              <div className="bg-emerald-500/5 p-4 border border-emerald-500/30 space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600" />
                    1. Estratégicos (Alto Volume & Alta Margem)
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-800">
                    {matrixItems.filter(m => m.quadrant === 'strategic').length} Artigos
                  </span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {matrixItems.filter(m => m.quadrant === 'strategic').map(m => (
                    <div key={m.product.id} className="p-2 bg-white border border-emerald-500/20 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="font-bold text-black block">{m.product.name}</span>
                        <span className="text-[8.5px] text-gray-500">{m.unitsSold} unid. vendidas</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-700 block">{formatMoney(m.contributionMargin)}</span>
                        <span className="text-[8.5px] text-gray-500">{formatPercent(m.contributionMarginPercent)} MC</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Oportunidade (Baixo Vol / Alta Margem) */}
              <div className="bg-blue-500/5 p-4 border border-blue-500/30 space-y-3">
                <div className="flex items-center justify-between border-b border-blue-500/20 pb-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-blue-800 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-blue-600" />
                    2. Oportunidades (Baixo Volume & Alta Margem)
                  </span>
                  <span className="text-xs font-mono font-bold text-blue-800">
                    {matrixItems.filter(m => m.quadrant === 'opportunity').length} Artigos
                  </span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {matrixItems.filter(m => m.quadrant === 'opportunity').map(m => (
                    <div key={m.product.id} className="p-2 bg-white border border-blue-500/20 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="font-bold text-black block">{m.product.name}</span>
                        <span className="text-[8.5px] text-gray-500">{m.unitsSold} unid. vendidas</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-blue-700 block">{formatMoney(m.contributionMargin)}</span>
                        <span className="text-[8.5px] text-gray-500">{formatPercent(m.contributionMarginPercent)} MC</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Otimizar (Alto Vol / Baixa Margem) */}
              <div className="bg-amber-500/5 p-4 border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle size={13} className="text-amber-600" />
                    3. Otimizar (Alto Volume & Baixa Margem)
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-800">
                    {matrixItems.filter(m => m.quadrant === 'optimize').length} Artigos
                  </span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {matrixItems.filter(m => m.quadrant === 'optimize').map(m => (
                    <div key={m.product.id} className="p-2 bg-white border border-amber-500/20 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="font-bold text-black block">{m.product.name}</span>
                        <span className="text-[8.5px] text-gray-500">{m.unitsSold} unid. vendidas</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-amber-700 block">{formatMoney(m.contributionMargin)}</span>
                        <span className="text-[8.5px] text-gray-500">{formatPercent(m.contributionMarginPercent)} MC</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Revisar (Baixo Vol / Baixa Margem) */}
              <div className="bg-red-500/5 p-4 border border-red-500/30 space-y-3">
                <div className="flex items-center justify-between border-b border-red-500/20 pb-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-red-800 flex items-center gap-1.5">
                    <ShieldAlert size={13} className="text-red-600" />
                    4. Revisar (Baixo Volume & Baixa Margem)
                  </span>
                  <span className="text-xs font-mono font-bold text-red-800">
                    {matrixItems.filter(m => m.quadrant === 'review').length} Artigos
                  </span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {matrixItems.filter(m => m.quadrant === 'review').map(m => (
                    <div key={m.product.id} className="p-2 bg-white border border-red-500/20 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="font-bold text-black block">{m.product.name}</span>
                        <span className="text-[8.5px] text-gray-500">{m.unitsSold} unid. vendidas</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-red-700 block">{formatMoney(m.contributionMargin)}</span>
                        <span className="text-[8.5px] text-gray-500">{formatPercent(m.contributionMarginPercent)} MC</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          4. CENÁRIOS HIPOTÉTICOS
      ---------------------------------------------------- */}
      {activeTab === 'scenarios' && (
        <div className="space-y-6">
          
          {/* Disclaimer Obrigatório */}
          <div className="bg-amber-50 border border-amber-300 p-3 text-amber-900 text-xs font-mono flex items-center gap-2">
            <Info size={16} className="shrink-0 text-amber-700" />
            <span>
              <strong>Aviso Metodológico:</strong> Os cenários apresentados constituem simulações matemáticas estritas, não previsões preditivas de IA ou promessas comerciais.
            </span>
          </div>

          {/* Comparativo de 3 Cenários */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* 1. Cenário Conservador */}
            <div className="bg-white p-5 border border-black/10 shadow-xs space-y-3">
              <span className="px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider bg-gray-100 text-gray-700 block w-fit">
                Cenário 1: Conservador
              </span>
              <h4 className="text-sm font-black uppercase text-black">Estresse de Mercado</h4>
              <p className="text-[9px] font-mono text-gray-500">
                Volume: -15% | Custo: +10% | Frete: +10% | Desconto: 5%
              </p>

              <div className="space-y-2 pt-2 border-t border-black/5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-500">Rec. Líquida Projetada:</span>
                  <span className="font-bold">{formatMoney(conservativeScenario.projectedNetRevenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Margem Contribuição:</span>
                  <span className="font-bold text-emerald-700">{formatMoney(conservativeScenario.projectedContributionMargin)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Margem %:</span>
                  <span className="font-bold">{formatPercent(conservativeScenario.projectedMarginPercent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Resultado Operacional:</span>
                  <span className={`font-bold ${conservativeScenario.projectedOperatingResult >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatMoney(conservativeScenario.projectedOperatingResult)}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Cenário Esperado (Base Real) */}
            <div className="bg-black text-white p-5 border border-black shadow-xs space-y-3">
              <span className="px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider bg-[#eab308] text-black block w-fit">
                {SCENARIO_PRESETS.base.label}
              </span>
              <h4 className="text-sm font-black uppercase text-white">{SCENARIO_PRESETS.base.name}</h4>
              <p className="text-[9px] font-mono text-gray-400">
                {SCENARIO_PRESETS.base.description}
              </p>

              <div className="space-y-2 pt-2 border-t border-white/10 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-400">Rec. Líquida Base:</span>
                  <span className="font-bold">{formatMoney(baseScenario.projectedNetRevenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Margem Contribuição:</span>
                  <span className="font-bold text-emerald-400">{formatMoney(baseScenario.projectedContributionMargin)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Margem %:</span>
                  <span className="font-bold">{formatPercent(baseScenario.projectedMarginPercent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Resultado Operacional:</span>
                  <span className={`font-bold ${baseScenario.projectedOperatingResult >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatMoney(baseScenario.projectedOperatingResult)}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Cenário Agressivo */}
            <div className="bg-white p-5 border border-black/10 shadow-xs space-y-3">
              <span className="px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 block w-fit">
                {SCENARIO_PRESETS.aggressive.label}
              </span>
              <h4 className="text-sm font-black uppercase text-black">{SCENARIO_PRESETS.aggressive.name}</h4>
              <p className="text-[9px] font-mono text-gray-500">
                {SCENARIO_PRESETS.aggressive.description}
              </p>

              <div className="space-y-2 pt-2 border-t border-black/5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-500">Rec. Líquida Projetada:</span>
                  <span className="font-bold">{formatMoney(aggressiveScenario.projectedNetRevenue)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Margem Contribuição:</span>
                  <span className="font-bold text-emerald-700">{formatMoney(aggressiveScenario.projectedContributionMargin)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Margem %:</span>
                  <span className="font-bold">{formatPercent(aggressiveScenario.projectedMarginPercent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Resultado Operacional:</span>
                  <span className={`font-bold ${aggressiveScenario.projectedOperatingResult >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {formatMoney(aggressiveScenario.projectedOperatingResult)}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Simulador Interativo */}
          <div className="bg-white p-5 border border-black/10 shadow-xs space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2 border-b border-black/10 pb-3">
              <Sliders size={14} className="text-[#eab308]" />
              Simulador Personalizado de Sensibilidade Global
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
              <div>
                <label className="block text-[9px] font-black uppercase text-gray-500 mb-1">
                  Variação Volume: {scenarioVolume > 0 ? `+${scenarioVolume}%` : `${scenarioVolume}%`}
                </label>
                <input
                  type="range"
                  min="-50"
                  max="100"
                  step="5"
                  value={scenarioVolume}
                  onChange={(e) => setScenarioVolume(Number(e.target.value))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase text-gray-500 mb-1">
                  Variação Custo CMV: {scenarioCost > 0 ? `+${scenarioCost}%` : `${scenarioCost}%`}
                </label>
                <input
                  type="range"
                  min="-20"
                  max="50"
                  step="5"
                  value={scenarioCost}
                  onChange={(e) => setScenarioCost(Number(e.target.value))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase text-gray-500 mb-1">
                  Desconto Médio: {scenarioDiscount}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={scenarioDiscount}
                  onChange={(e) => setScenarioDiscount(Number(e.target.value))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase text-gray-500 mb-1">
                  Mkt Extra: R$ {scenarioMarketing}
                </label>
                <input
                  type="range"
                  min="0"
                  max="10000"
                  step="500"
                  value={scenarioMarketing}
                  onChange={(e) => setScenarioMarketing(Number(e.target.value))}
                  className="w-full accent-black cursor-pointer"
                />
              </div>
            </div>

            {/* Resultado do Simulador Interativo */}
            <div className="bg-gray-50 p-4 border border-black/10 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div>
                <span className="text-[8.5px] font-black uppercase text-gray-400 block">Receita Líquida</span>
                <span className="text-sm font-bold text-black">{formatMoney(customScenario.projectedNetRevenue)}</span>
              </div>
              <div>
                <span className="text-[8.5px] font-black uppercase text-gray-400 block">Margem Contribuição</span>
                <span className="text-sm font-bold text-emerald-700">{formatMoney(customScenario.projectedContributionMargin)}</span>
              </div>
              <div>
                <span className="text-[8.5px] font-black uppercase text-gray-400 block">Margem %</span>
                <span className="text-sm font-bold text-black">{formatPercent(customScenario.projectedMarginPercent)}</span>
              </div>
              <div>
                <span className="text-[8.5px] font-black uppercase text-gray-400 block">Resultado Operacional</span>
                <span className={`text-sm font-bold ${customScenario.projectedOperatingResult >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatMoney(customScenario.projectedOperatingResult)}
                </span>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ----------------------------------------------------
          5. INTELIGÊNCIA POR LINHA
      ---------------------------------------------------- */}
      {activeTab === 'lines' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {linesProfitability.map(line => (
              <div key={line.lineName} className="bg-white p-5 border border-black/10 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-black/10 pb-2">
                  <span className="text-xs font-black uppercase tracking-widest text-black">
                    Linha {line.lineName}
                  </span>
                  <span className={`px-2 py-0.5 text-[8.5px] font-mono font-bold border ${line.classification.badgeClass}`}>
                    {line.classification.label}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Unidades Vendidas:</span>
                    <span className="font-bold">{line.unitsSold}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Receita Bruta:</span>
                    <span className="font-bold">{formatMoney(line.grossRevenue || line.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Receita Líquida:</span>
                    <span className="font-bold">{formatMoney(line.netRevenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">CMV / COGS:</span>
                    <span className="font-bold text-red-600">{formatMoney(line.cogs)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Taxa Gateway Alocada:</span>
                    <span className="font-bold text-gray-700">{formatMoney(line.gatewayFees)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Frete Sub. Alocado:</span>
                    <span className="font-bold text-gray-700">{formatMoney(line.shippingSubsidy)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-black/5">
                    <span className="text-gray-900 font-bold">Margem Contribuição:</span>
                    <span className="font-black text-emerald-700">{formatMoney(line.contributionMargin)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-900 font-bold">Margem Contribuição %:</span>
                    <span className="font-black text-black">{formatPercent(line.contributionMarginPercent)}</span>
                  </div>
                </div>

                {/* Nota Comercial */}
                <div className="p-2 bg-gray-50 border border-black/5 text-[8.5px] font-mono text-gray-600">
                  {line.lineName === 'FORCE' && 'Artigos essenciais de alta rotatividade. Foco em controle rigoroso de CMV.'}
                  {line.lineName === 'MARK' && 'Linha intermediária com forte volume de vendas e equilíbrio de margens.'}
                  {line.lineName === 'PRIME' && 'Artigos de alto valor agregado com maior margem percentual.'}
                  {line.lineName === 'OTHER' && 'Produtos não classificados nas linhas padrão.'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------
          6. SIMULADOR DE SENSIBILIDADE POR PRODUTO
      ---------------------------------------------------- */}
      {activeTab === 'sensitivity' && (
        <div className="space-y-6">
          
          {/* Seletor de Produto */}
          <div className="bg-white p-4 border border-black/10 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[9px] font-black uppercase tracking-wider text-black">Selecione o Artigo:</label>
              <select
                value={selectedProductForSensitivity}
                onChange={(e) => setSelectedProductForSensitivity(e.target.value)}
                className="text-xs font-mono font-bold bg-gray-50 border border-black/20 p-1.5 uppercase cursor-pointer"
              >
                {productsProfitability.map(p => (
                  <option key={p.slug} value={p.slug}>
                    {p.name} (R$ {p.unitPrice.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-[9px] font-mono text-gray-500">
              <span>Custo Base: <strong>{formatMoney(activeProductCost)}</strong></span>
              <span>Preço Base: <strong>{formatMoney(activeProductPrice)}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 1. Impacto de Frete Grátis */}
            <div className="bg-white p-5 border border-black/10 shadow-xs space-y-3">
              <h4 className="text-xs font-black uppercase text-black flex items-center gap-1.5 border-b border-black/10 pb-2">
                <Truck size={14} className="text-[#eab308]" />
                Impacto de Frete Grátis Total
              </h4>
              {freeShippingSim.dataAvailable && freeShippingSim.baseline && freeShippingSim.freeShipping ? (
                <>
                  <p className="text-[9px] font-mono text-gray-500">
                    {activeProductShipping !== undefined
                      ? `Simulação com custo real de frete alocado (${formatMoney(activeProductShipping)}) vs frete grátis.`
                      : 'Simulação de subsidiação integral de frete.'}
                  </p>

                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Margem com Frete Pago:</span>
                      <span className="font-bold">{formatMoney(freeShippingSim.baseline.contributionMargin)} ({formatPercent(freeShippingSim.baseline.contributionMarginPercent)})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Margem com Frete Grátis:</span>
                      <span className={`font-bold ${freeShippingSim.isMarginNegative ? 'text-red-600' : 'text-emerald-700'}`}>
                        {formatMoney(freeShippingSim.freeShipping.contributionMargin)} ({formatPercent(freeShippingSim.freeShipping.contributionMarginPercent)})
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-black/5 text-red-600 font-bold">
                      <span>Queda na Margem:</span>
                      <span>-{formatMoney(freeShippingSim.marginDropMoney || 0)} (-{freeShippingSim.marginDropPercent || 0} p.p.)</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-3 bg-gray-50 border border-black/10 text-xs font-mono text-gray-500">
                  {freeShippingSim.message || 'Dados reais de frete indisponíveis para esta simulação.'}
                </div>
              )}
            </div>

            {/* 2. PIX vs Cartão */}
            <div className="bg-white p-5 border border-black/10 shadow-xs space-y-3">
              <h4 className="text-xs font-black uppercase text-black flex items-center gap-1.5 border-b border-black/10 pb-2">
                <CreditCard size={14} className="text-[#eab308]" />
                Comparativo PIX vs Cartão de Crédito
              </h4>
              <p className="text-[9px] font-mono text-gray-500">
                Impacto das taxas oficiais de gateway (PIX 0.99% vs Cartão 3.99% + R$ 0.40).
              </p>

              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-500">Margem no PIX:</span>
                  <span className="font-bold text-emerald-700">{formatMoney(paymentSim.pix.contributionMargin)} ({formatPercent(paymentSim.pix.contributionMarginPercent)})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Margem no Cartão:</span>
                  <span className="font-bold">{formatMoney(paymentSim.card.contributionMargin)} ({formatPercent(paymentSim.card.contributionMarginPercent)})</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-black/5 text-emerald-700 font-bold">
                  <span>Ganho no PIX:</span>
                  <span>+{formatMoney(paymentSim.contributionMarginDiff)} (+{paymentSim.marginPercentDiff} p.p.)</span>
                </div>
              </div>
            </div>

          </div>

          {/* 3. Sensibilidade a Aumentos de Custo */}
          <div className="bg-white p-5 border border-black/10 shadow-xs space-y-3">
            <h4 className="text-xs font-black uppercase text-black flex items-center gap-1.5 border-b border-black/10 pb-2">
              <Percent size={14} className="text-[#eab308]" />
              Sensibilidade a Aumentos de Custo de Confecção
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              {costSensitivitySim.map(item => (
                <div key={item.increasePercent} className="p-3 bg-gray-50 border border-black/10 space-y-1">
                  <span className="text-[9px] font-black uppercase text-gray-500 block">Custo +{item.increasePercent}%</span>
                  <span className="text-xs font-bold text-black block">{formatMoney(item.simulatedCost)}</span>
                  <span className={`text-[9px] font-bold block ${item.isNegative ? 'text-red-600' : 'text-emerald-700'}`}>
                    Margem: {formatMoney(item.simulatedMarginMoney)} ({formatPercent(item.simulatedMarginPercent)})
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-2 text-[9px] font-mono text-gray-500">
              Desconto Máximo Sustentável para este artigo: <strong className="text-black">{maxDiscountAllowed}%</strong>
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
