/**
 * FASE 9.6.3-A — MOTOR DE INTELIGÊNCIA COMERCIAL, CENÁRIOS E RECOMENDAÇÕES DE PREÇO
 * F PAC STORE — Camada Analítica e Decisória Read-Only
 * 
 * Regras Estritas:
 * 1. 100% Read-Only, zero gravações/mutações.
 * 2. Consome exclusivamente funções certificadas de profitability.ts e orderFinancial.ts.
 * 3. Nenhuma fórmula financeira paralela.
 * 4. Nenhuma causalidade fabricada ("porque"), apenas fatos descritivos e simulações declaradas.
 * 5. Identificação transparente de dados estimados e nível de confiança.
 */

import { 
  calculateOrderProfitability, 
  calculateProductProfitability, 
  aggregateProfitabilityByLine, 
  simulateProductPrice, 
  calculateMinimumPrice, 
  calculatePriceForDesiredMargin, 
  calculateBreakEven, 
  calculateTargetProfitRequirements, 
  classifyMargin, 
  classifyBreakEvenStatus,
  type OrderProfitability,
  type ProductProfitabilityItem,
  type CostSource,
  type LineProfitabilityItem,
  type PriceSimulationResult,
  type BreakEvenResult,
  type TargetProfitResult
} from './profitability';
import { 
  calculateFinancialDRE, 
  calculateOperatingResult,
  type FinancialDREResult 
} from './orderFinancial';
import { 
  FINANCIAL_DEFAULTS, 
  MARGIN_THRESHOLDS, 
  roundMoney, 
  roundPercent 
} from '../config/financialDefaults';
import {
  COMMERCIAL_SCORE_WEIGHTS,
  SENSITIVITY_PERCENTAGES,
  SCENARIO_PRESETS,
  type CommercialScenarioPreset
} from '../config/commercialIntelligenceDefaults';

// Re-export defaults
export {
  COMMERCIAL_SCORE_WEIGHTS,
  SENSITIVITY_PERCENTAGES,
  SCENARIO_PRESETS,
  type CommercialScenarioPreset
};

// ----------------------------------------------------
// TIPOS E CONTRATOS CANÔNICOS
// ----------------------------------------------------

export type RecommendationType =
  | 'price_increase'
  | 'price_decrease_analysis'
  | 'discount_warning'
  | 'promotion_candidate'
  | 'margin_risk'
  | 'negative_margin'
  | 'shipping_subsidy_risk'
  | 'gateway_cost_risk'
  | 'cost_increase_risk'
  | 'high_margin_opportunity'
  | 'high_volume_low_margin'
  | 'low_volume_high_margin'
  | 'cost_data_incomplete'
  | 'break_even_risk'
  | 'target_profit_gap';

export type RecommendationSeverity = 'info' | 'opportunity' | 'warning' | 'critical';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type CommercialEntity = 'product' | 'line' | 'store' | 'scenario';

export interface CommercialRecommendation {
  id: string;
  type: RecommendationType;
  severity: RecommendationSeverity;
  entityType: CommercialEntity;
  entityId?: string;
  entityName?: string;
  title: string;
  description: string;
  reasonCodes: string[];
  currentMetrics: {
    price?: number;
    cost?: number;
    marginPercent?: number;
    contributionMargin?: number;
    grossProfit?: number;
    unitsSold?: number;
    revenue?: number;
    minimumPrice?: number;
    targetPrice?: number;
    costCoverage?: number;
    shippingSubsidy?: number;
    gatewayFee?: number;
    [key: string]: any;
  };
  projectedMetrics?: {
    recommendedPrice?: number;
    priceDiff?: number;
    priceDiffPercent?: number;
    projectedMarginPercent?: number;
    projectedContributionMargin?: number;
    maxSustainableDiscount?: number;
    simulatedProfitDiff?: number;
    [key: string]: any;
  };
  suggestedAction: string;
  confidence: ConfidenceLevel;
  isEstimated: boolean;
  score: number;
}

export type CommercialMatrixQuadrant = 'strategic' | 'opportunity' | 'optimize' | 'review';

export interface CommercialMatrixItem {
  product: ProductProfitabilityItem;
  quadrant: CommercialMatrixQuadrant;
  quadrantLabel: string;
  quadrantBadgeClass: string;
  unitsSold: number;
  contributionMarginPercent: number;
  contributionMargin: number;
  grossProfit: number;
  grossMarginPercent: number;
  isHighVolume: boolean;
  isHighMargin: boolean;
  score: number;
}

export interface CommercialScenarioParams {
  name: string;
  volumeChangePercent: number; // Ex: -15, 0, +25
  costChangePercent: number;   // Ex: +10, 0
  shippingCostChangePercent: number; // Ex: +10
  averageDiscountPercent: number;    // Ex: 5
  marketingInvestmentDelta: number;  // Ex: +1000
}

export interface CommercialScenarioResult {
  name: string;
  description: string;
  isSimulation: true;
  projectedOrdersCount: number;
  projectedUnitsCount: number;
  projectedGrossRevenue: number;
  projectedNetRevenue: number;
  projectedCogs: number;
  projectedGatewayFees: number;
  projectedShippingSubsidy: number;
  projectedOtherVariableCosts: number;
  projectedContributionMargin: number;
  projectedMarginPercent: number;
  projectedFixedExpenses: number;
  projectedMarketingExpenses?: number;
  projectedOtherExpenses?: number;
  projectedVariableOperatingExpenses?: number;
  projectedOperatingResult: number;
  breakEvenRevenue: number;
  breakEvenRevenueGap: number;
  targetProfit: number;
  targetProfitRequiredRevenue: number;
  targetProfitRequiredUnits: number;
  targetProfitGap: number;
  varianceVsActual: {
    netRevenueDelta: number;
    contributionMarginDelta: number;
    operatingResultDelta: number;
    marginPercentDelta: number;
  };
}

export interface PeriodComparisonResult {
  currentPeriodLabel: string;
  previousPeriodLabel: string;
  metrics: {
    netRevenue: { current: number; previous: number; delta: number; deltaPercent: number };
    contributionMargin: { current: number; previous: number; delta: number; deltaPercent: number };
    marginPercent: { current: number; previous: number; delta: number };
    unitsSold: { current: number; previous: number; delta: number; deltaPercent: number };
    ordersCount: { current: number; previous: number; delta: number; deltaPercent: number };
    cogs: { current: number; previous: number; delta: number; deltaPercent: number };
  };
  descriptiveSummary: string[];
}

export interface FreeShippingSimulationResult {
  dataAvailable: boolean;
  baseline?: PriceSimulationResult;
  freeShipping?: PriceSimulationResult;
  marginDropMoney?: number;
  marginDropPercent?: number;
  isMarginNegative?: boolean;
  message?: string;
}

// ----------------------------------------------------
// SCORE DETERMINÍSTICO DE PRIORIZAÇÃO
// ----------------------------------------------------

/**
 * Calcula o score comercial determinístico de priorização de oportunidades (0 a 100).
 */
export function calculateOpportunityScore(
  marginPercent: number,
  unitsSold: number,
  contributionMargin: number,
  maxUnitsInCatalog: number = 100,
  maxMarginInCatalog: number = 10000
): number {
  const normMarginPct = Math.min(100, Math.max(0, marginPercent));
  const normVolume = maxUnitsInCatalog > 0 ? Math.min(100, Math.max(0, (unitsSold / maxUnitsInCatalog) * 100)) : 0;
  const normContrib = maxMarginInCatalog > 0 ? Math.min(100, Math.max(0, (contributionMargin / maxMarginInCatalog) * 100)) : 0;

  const score = (normMarginPct * COMMERCIAL_SCORE_WEIGHTS.marginPercentWeight) +
                (normVolume * COMMERCIAL_SCORE_WEIGHTS.volumeWeight) +
                (normContrib * COMMERCIAL_SCORE_WEIGHTS.contributionMarginWeight);

  return roundPercent(Math.min(100, Math.max(0, score)), 1);
}

// ----------------------------------------------------
// SIMULAÇÕES E HELPERS ANALÍTICOS ESPECÍFICOS
// ----------------------------------------------------

/**
 * Encontra o maior desconto sustentável (%) onde a margem de contribuição não seja negativa.
 * Utiliza estritamente o simulador canônico `simulateProductPrice()`.
 */
export function calculateMaxSustainableDiscount(
  unitCost: number,
  salePrice: number,
  options: {
    gatewayFeePercent?: number;
    gatewayFixedFee?: number;
    shippingCharged?: number;
    shippingCost?: number;
    otherVariableCosts?: number;
  } = {}
): number {
  if (salePrice <= 0 || unitCost < 0) return 0;

  let maxDiscount = 0;
  for (let d = 0; d <= 90; d += 1) {
    const sim = simulateProductPrice({
      unitCost,
      salePrice,
      discountPercent: d,
      gatewayFeePercent: options.gatewayFeePercent,
      gatewayFixedFee: options.gatewayFixedFee,
      shippingCharged: options.shippingCharged,
      shippingCost: options.shippingCost,
      otherVariableCosts: options.otherVariableCosts
    });

    if (sim.contributionMargin >= 0) {
      maxDiscount = d;
    } else {
      break;
    }
  }

  return maxDiscount;
}

/**
 * Simula o impacto de adoção de Frete Grátis total (`shippingCharged = 0`).
 * Utiliza o simulador canônico `simulateProductPrice()`.
 * NUNCA inventa valor financeiro: se não houver dados de frete, retorna dataAvailable: false.
 */
export function simulateFreeShippingImpact(
  unitCost: number,
  salePrice: number,
  shippingCost?: number,
  shippingCharged?: number
): FreeShippingSimulationResult {
  if (shippingCost === undefined || shippingCost === null || isNaN(shippingCost) || shippingCost <= 0) {
    return {
      dataAvailable: false,
      message: 'Dados reais de frete indisponíveis para esta simulação.'
    };
  }

  const shipCost = Number(shippingCost);
  const shipCharged = shippingCharged !== undefined && shippingCharged !== null && !isNaN(shippingCharged)
    ? Number(shippingCharged)
    : 0;

  const baseline = simulateProductPrice({
    unitCost,
    salePrice,
    shippingCharged: shipCharged,
    shippingCost: shipCost
  });

  const freeShipping = simulateProductPrice({
    unitCost,
    salePrice,
    shippingCharged: 0,
    shippingCost: shipCost
  });

  const marginDropMoney = roundMoney(baseline.contributionMargin - freeShipping.contributionMargin);
  const marginDropPercent = roundPercent(baseline.contributionMarginPercent - freeShipping.contributionMarginPercent);

  return {
    dataAvailable: true,
    baseline,
    freeShipping,
    marginDropMoney,
    marginDropPercent,
    isMarginNegative: freeShipping.contributionMargin < 0
  };
}

/**
 * Simula o impacto comparativo de Gateway: PIX vs Cartão de Crédito.
 * Utiliza as taxas canônicas de `FINANCIAL_DEFAULTS.gateway`.
 */
export function simulatePaymentMethodImpact(
  unitCost: number,
  salePrice: number
): {
  pix: PriceSimulationResult;
  card: PriceSimulationResult;
  gatewayFeeDiff: number;
  contributionMarginDiff: number;
  marginPercentDiff: number;
} {
  const pix = simulateProductPrice({
    unitCost,
    salePrice,
    gatewayFeePercent: FINANCIAL_DEFAULTS.gateway.pixFeePercent,
    gatewayFixedFee: FINANCIAL_DEFAULTS.gateway.pixFixedFee
  });

  const card = simulateProductPrice({
    unitCost,
    salePrice,
    gatewayFeePercent: FINANCIAL_DEFAULTS.gateway.cardFeePercent,
    gatewayFixedFee: FINANCIAL_DEFAULTS.gateway.cardFixedFee
  });

  const gatewayFeeDiff = roundMoney(card.gatewayFee - pix.gatewayFee);
  const contributionMarginDiff = roundMoney(pix.contributionMargin - card.contributionMargin);
  const marginPercentDiff = roundPercent(pix.contributionMarginPercent - card.contributionMarginPercent);

  return {
    pix,
    card,
    gatewayFeeDiff,
    contributionMarginDiff,
    marginPercentDiff
  };
}

/**
 * Simula a sensibilidade a aumentos de custo de produção/confecção (+5%, +10%, +15%, +20%).
 * Não grava dados, pura simulação analítica.
 */
export function simulateCostIncreaseSensitivity(
  unitCost: number,
  salePrice: number,
  increases: readonly number[] = SENSITIVITY_PERCENTAGES
): Array<{
  increasePercent: number;
  simulatedCost: number;
  simulatedMarginMoney: number;
  simulatedMarginPercent: number;
  isNegative: boolean;
}> {
  return increases.map(pct => {
    const simulatedCost = roundMoney(unitCost * (1 + pct / 100));
    const sim = simulateProductPrice({
      unitCost: simulatedCost,
      salePrice
    });
    return {
      increasePercent: pct,
      simulatedCost,
      simulatedMarginMoney: sim.contributionMargin,
      simulatedMarginPercent: sim.contributionMarginPercent,
      isNegative: sim.contributionMargin < 0
    };
  });
}

// ----------------------------------------------------
// MATRIZ DE RENTABILIDADE (VOLUME x MARGEM)
// ----------------------------------------------------

export function classifyCommercialMatrix(
  products: ProductProfitabilityItem[],
  customVolumeThreshold?: number,
  customMarginThreshold: number = MARGIN_THRESHOLDS.LOW // 25%
): CommercialMatrixItem[] {
  if (!products || products.length === 0) return [];

  const activeProducts = products.filter(p => p.unitsSold > 0);
  let volumeThreshold = customVolumeThreshold;

  if (volumeThreshold === undefined) {
    if (activeProducts.length === 0) {
      volumeThreshold = 1;
    } else {
      const sortedUnits = [...activeProducts].map(p => p.unitsSold).sort((a, b) => a - b);
      const mid = Math.floor(sortedUnits.length / 2);
      volumeThreshold = sortedUnits.length % 2 !== 0 
        ? sortedUnits[mid] 
        : Math.round((sortedUnits[mid - 1] + sortedUnits[mid]) / 2);
      if (volumeThreshold < 1) volumeThreshold = 1;
    }
  }

  const maxUnits = Math.max(1, ...products.map(p => p.unitsSold));
  const maxMargin = Math.max(1, ...products.map(p => p.contributionMargin));

  return products.map(product => {
    const isHighVolume = product.unitsSold >= volumeThreshold;
    const isHighMargin = product.contributionMarginPercent >= customMarginThreshold;

    let quadrant: CommercialMatrixQuadrant = 'review';
    let quadrantLabel = 'Revisar';
    let quadrantBadgeClass = 'bg-gray-100 text-gray-700 border-gray-300';

    if (isHighVolume && isHighMargin) {
      quadrant = 'strategic';
      quadrantLabel = 'Estratégico';
      quadrantBadgeClass = 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30';
    } else if (!isHighVolume && isHighMargin) {
      quadrant = 'opportunity';
      quadrantLabel = 'Oportunidade';
      quadrantBadgeClass = 'bg-blue-500/10 text-blue-700 border-blue-500/30';
    } else if (isHighVolume && !isHighMargin) {
      quadrant = 'optimize';
      quadrantLabel = 'Otimizar (Alto Vol / Baixa Margem)';
      quadrantBadgeClass = 'bg-amber-500/10 text-amber-700 border-amber-500/30';
    } else {
      quadrant = 'review';
      quadrantLabel = 'Revisar (Baixo Vol / Baixa Margem)';
      quadrantBadgeClass = 'bg-red-500/10 text-red-700 border-red-500/30';
    }

    const score = calculateOpportunityScore(
      product.contributionMarginPercent,
      product.unitsSold,
      product.contributionMargin,
      maxUnits,
      maxMargin
    );

    return {
      product,
      quadrant,
      quadrantLabel,
      quadrantBadgeClass,
      unitsSold: product.unitsSold,
      contributionMarginPercent: product.contributionMarginPercent,
      contributionMargin: product.contributionMargin,
      grossProfit: product.grossProfit,
      grossMarginPercent: product.grossMarginPercent,
      isHighVolume,
      isHighMargin,
      score
    };
  });
}

// ----------------------------------------------------
// GERADOR DE RECOMENDAÇÕES COMERCIAIS DETERMINÍSTICAS
// ----------------------------------------------------

export function generateCommercialRecommendations(
  products: ProductProfitabilityItem[],
  ordersProfitability: OrderProfitability[],
  dre: FinancialDREResult,
  options: {
    desiredMarginPercent?: number;
    breakEvenTargetRevenue?: number;
    targetMonthlyProfit?: number;
  } = {}
): CommercialRecommendation[] {
  const recommendations: CommercialRecommendation[] = [];
  const targetMargin = options.desiredMarginPercent ?? FINANCIAL_DEFAULTS.defaultDesiredMarginPercent;

  // 1. Auditoria individual de produtos
  products.forEach(p => {
    const salePrice = p.unitPrice > 0 ? p.unitPrice : FINANCIAL_DEFAULTS.defaultSalePrice;
    const unitsSold = Math.max(1, p.unitsSold);

    // Considerar custos variáveis unitários alocados observados
    const unitShipSubsidy = p.shippingSubsidyAllocated ? roundMoney(p.shippingSubsidyAllocated / unitsSold) : 0;
    const unitOtherCosts = p.otherVariableCostsAllocated ? roundMoney(p.otherVariableCostsAllocated / unitsSold) : 0;

    const breakdown = p.costSourceBreakdown;
    let costSource: CostSource = p.costSource;
    if (!costSource) {
      if (p.isCostSnapshot) costSource = 'snapshot';
      else if (p.unitCost > 0) costSource = 'catalog';
      else costSource = 'missing';
    }

    const isMissing = costSource === 'missing' || (p.unitCost <= 0 && costSource !== 'estimated');
    const isEstimated = costSource === 'estimated' || (costSource === 'missing' && p.isEstimated);
    const isCostSnapshot = costSource === 'snapshot' && (!breakdown || (p.unitsSold > 0 && breakdown.snapshotUnits === p.unitsSold));

    let confidence: ConfidenceLevel = 'low';
    if (costSource === 'snapshot' && isCostSnapshot) {
      confidence = 'high';
    } else if (costSource === 'catalog') {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    // Se o custo for estritamente MISSING:
    // Não inventar custo de DEFAULT para gerar recomendações financeiras definitivas.
    // Gerar prioritariamente 'cost_data_incomplete' e abortar recomendações numéricas de preço/promoção/sensibilidade.
    if (isMissing) {
      recommendations.push({
        id: `rec_cost_missing_${p.id}`,
        type: 'cost_data_incomplete',
        severity: 'warning',
        entityType: 'product',
        entityId: p.id,
        entityName: p.name,
        title: `Custo Não Informado: ${p.name}`,
        description: `Custo insuficiente para recomendação segura de preço. Este produto não possui custo de confecção ou ficha técnica cadastrada.`,
        reasonCodes: ['COST_DATA_MISSING'],
        currentMetrics: {
          price: salePrice,
          cost: 0,
          isEstimated: true
        },
        suggestedAction: `Custo insuficiente para recomendação segura de preço. Cadastrar o custo de confecção exato na ficha técnica.`,
        confidence: 'low',
        isEstimated: true,
        score: 40
      });
      return;
    }

    // Processamento para produtos com custo real (snapshot/catálogo) ou metodologia estimada (estimated)
    const lineCost = (FINANCIAL_DEFAULTS.estimatedProductCosts as Record<string, number>)[p.line] || FINANCIAL_DEFAULTS.estimatedProductCosts.DEFAULT;
    const unitCost = p.unitCost > 0 ? p.unitCost : (isEstimated ? lineCost : FINANCIAL_DEFAULTS.estimatedProductCosts.DEFAULT);

    const minPrice = calculateMinimumPrice({
      unitCost,
      shippingCost: unitShipSubsidy,
      shippingCharged: 0,
      otherVariableCosts: unitOtherCosts
    });

    const targetPrice = calculatePriceForDesiredMargin({
      unitCost,
      desiredMarginPercent: targetMargin,
      shippingCost: unitShipSubsidy,
      shippingCharged: 0,
      otherVariableCosts: unitOtherCosts
    });

    const maxSustainableDiscount = calculateMaxSustainableDiscount(unitCost, salePrice, {
      shippingCost: unitShipSubsidy,
      otherVariableCosts: unitOtherCosts
    });

    const estNotice = isEstimated ? ' Simulação baseada em custo estimado.' : '';

    // A. Preço abaixo do mínimo sustentável
    if (salePrice < minPrice && p.unitsSold > 0) {
      const diff = roundMoney(minPrice - salePrice);
      const diffPct = roundPercent((diff / salePrice) * 100);
      recommendations.push({
        id: `rec_below_min_${p.id}`,
        type: 'negative_margin',
        severity: 'critical',
        entityType: 'product',
        entityId: p.id,
        entityName: p.name,
        title: `Preço Abaixo do Mínimo Sustentável: ${p.name}`,
        description: `Preço de venda atual (R$ ${salePrice.toFixed(2)}) é inferior ao custo mínimo de cobertura (R$ ${minPrice.toFixed(2)}), gerando prejuízo operacional por unidade vendida.${estNotice ? ' ' + estNotice : ''}`,
        reasonCodes: ['BELOW_MINIMUM_PRICE', 'MARGIN_NEGATIVE'],
        currentMetrics: {
          price: salePrice,
          cost: unitCost,
          minimumPrice: minPrice,
          marginPercent: p.contributionMarginPercent,
          contributionMargin: p.contributionMargin,
          unitsSold: p.unitsSold
        },
        projectedMetrics: {
          recommendedPrice: minPrice,
          priceDiff: diff,
          priceDiffPercent: diffPct
        },
        suggestedAction: `Reajustar preço para no mínimo R$ ${minPrice.toFixed(2)} (+${diffPct}%) para cobrir CMV e taxas mínimas.${estNotice}`,
        confidence,
        isEstimated,
        score: 95
      });
    }

    // B. Margem negativa consolidada
    else if (p.contributionMargin < 0 && p.unitsSold > 0) {
      recommendations.push({
        id: `rec_neg_margin_${p.id}`,
        type: 'negative_margin',
        severity: 'critical',
        entityType: 'product',
        entityId: p.id,
        entityName: p.name,
        title: `Margem de Contribuição Negativa: ${p.name}`,
        description: `${p.name} acumula margem negativa de R$ ${p.contributionMargin.toFixed(2)} (${p.contributionMarginPercent.toFixed(1)}%). Os custos variáveis alocados superam a receita líquida.${estNotice ? ' ' + estNotice : ''}`,
        reasonCodes: ['MARGIN_NEGATIVE'],
        currentMetrics: {
          price: salePrice,
          cost: unitCost,
          marginPercent: p.contributionMarginPercent,
          contributionMargin: p.contributionMargin,
          unitsSold: p.unitsSold,
          shippingSubsidy: p.shippingSubsidyAllocated,
          gatewayFee: p.gatewayFeesAllocated
        },
        suggestedAction: `Revisar precificação e taxas de frete/gateway alocadas ou renegociar custo de confecção.${estNotice}`,
        confidence,
        isEstimated,
        score: 90
      });
    }

    // C. Margem abaixo da meta configurada
    else if (p.contributionMarginPercent < targetMargin && p.unitsSold > 0 && salePrice >= minPrice) {
      const priceDiff = roundMoney(targetPrice - salePrice);
      const priceDiffPct = salePrice > 0 ? roundPercent((priceDiff / salePrice) * 100) : 0;
      recommendations.push({
        id: `rec_target_gap_${p.id}`,
        type: 'price_increase',
        severity: p.contributionMarginPercent < MARGIN_THRESHOLDS.CRITICAL ? 'warning' : 'info',
        entityType: 'product',
        entityId: p.id,
        entityName: p.name,
        title: `Margem Abaixo da Meta (${targetMargin}%): ${p.name}`,
        description: `${p.name} possui margem de contribuição de ${p.contributionMarginPercent.toFixed(1)}%, abaixo da meta de ${targetMargin}%. Para atingir a meta, o preço recomendado é R$ ${targetPrice.toFixed(2)}.${estNotice ? ' ' + estNotice : ''}`,
        reasonCodes: ['TARGET_MARGIN_NOT_REACHED'],
        currentMetrics: {
          price: salePrice,
          cost: unitCost,
          marginPercent: p.contributionMarginPercent,
          contributionMargin: p.contributionMargin,
          targetPrice,
          unitsSold: p.unitsSold
        },
        projectedMetrics: {
          recommendedPrice: targetPrice,
          priceDiff,
          priceDiffPercent: priceDiffPct,
          projectedMarginPercent: targetMargin
        },
        suggestedAction: `Simular reposicionamento de preço para R$ ${targetPrice.toFixed(2)} (+${priceDiffPct}%).${estNotice}`,
        confidence,
        isEstimated,
        score: 70
      });
    }

    // D. Candidato a promoção segura (apenas se custo não for missing e margem saudável)
    if (
      !isMissing &&
      p.contributionMargin > 0 &&
      p.contributionMarginPercent >= MARGIN_THRESHOLDS.HEALTHY &&
      p.unitsSold > 0 &&
      salePrice >= minPrice &&
      maxSustainableDiscount >= 10
    ) {
      recommendations.push({
        id: `rec_promo_${p.id}`,
        type: 'promotion_candidate',
        severity: 'opportunity',
        entityType: 'product',
        entityId: p.id,
        entityName: p.name,
        title: `Candidato a Ação Promocional: ${p.name}`,
        description: `${p.name} possui margem saudável de ${p.contributionMarginPercent.toFixed(1)}% e suporta desconto de até ${maxSustainableDiscount}% mantendo resultado positivo.${estNotice ? ' ' + estNotice : ''}`,
        reasonCodes: ['HEALTHY_MARGIN_BUFFER', 'DISCOUNT_CAPACITY'],
        currentMetrics: {
          price: salePrice,
          cost: unitCost,
          marginPercent: p.contributionMarginPercent,
          contributionMargin: p.contributionMargin,
          unitsSold: p.unitsSold
        },
        projectedMetrics: {
          maxSustainableDiscount
        },
        suggestedAction: `Candidato a promoção de até ${Math.min(20, maxSustainableDiscount)}% para alavancar volume sem comprometer margem.${estNotice}`,
        confidence,
        isEstimated,
        score: 80
      });
    }

    // E. Risco de aumento de custo (sensibilidade)
    const sens = simulateCostIncreaseSensitivity(unitCost, salePrice, [10]);
    if (sens[0] && sens[0].isNegative && p.contributionMargin >= 0) {
      recommendations.push({
        id: `rec_cost_risk_${p.id}`,
        type: 'cost_increase_risk',
        severity: 'warning',
        entityType: 'product',
        entityId: p.id,
        entityName: p.name,
        title: `Alta Vulnerabilidade a Custos: ${p.name}`,
        description: `A margem deste produto torna-se negativa se o custo unitário aumentar em até 10% (custo simulado: R$ ${sens[0].simulatedCost.toFixed(2)}).${estNotice ? ' ' + estNotice : ''}`,
        reasonCodes: ['COST_SENSITIVITY_HIGH'],
        currentMetrics: {
          price: salePrice,
          cost: unitCost,
          marginPercent: p.contributionMarginPercent
        },
        suggestedAction: `Manter vigilância sobre a tabela de corte e costura para este item.${estNotice}`,
        confidence,
        isEstimated,
        score: 65
      });
    }

    // F. Alerta de cadastro de custo incompleto
    if (isEstimated) {
      recommendations.push({
        id: `rec_cost_est_${p.id}`,
        type: 'cost_data_incomplete',
        severity: 'info',
        entityType: 'product',
        entityId: p.id,
        entityName: p.name,
        title: `Custo Estimado no Catálogo: ${p.name}`,
        description: `Simulação baseada em custo estimado. Este produto está utilizando custo padrão estimado por linha (R$ ${unitCost.toFixed(2)}) por ausência de snapshot de custo de confecção exato.`,
        reasonCodes: ['COST_ESTIMATED'],
        currentMetrics: {
          cost: unitCost,
          isEstimated: true
        },
        suggestedAction: `Cadastrar o custo de confecção exato na ficha técnica do produto.`,
        confidence: 'low',
        isEstimated: true,
        score: 40
      });
    }
  });

  // 2. Análise consolidada de Break-Even e Metas Globais
  const totalNet = ordersProfitability.reduce((acc, o) => acc + o.netRevenue, 0);
  const totalContrib = ordersProfitability.reduce((acc, o) => acc + o.contributionMargin, 0);
  const avgMarginRatio = totalNet > 0 ? (totalContrib / totalNet) * 100 : 0;
  const fixedExpenses = dre.fixedExpenses || 0;

  const be = calculateBreakEven({
    fixedOperatingExpenses: fixedExpenses,
    averageContributionMarginRatio: avgMarginRatio
  });

  const beStatus = classifyBreakEvenStatus(totalNet, be.requiredRevenue);
  const coveragePercent = be.requiredRevenue > 0 ? (totalNet / be.requiredRevenue) * 100 : 100;

  if (beStatus.status === 'not_reached' && fixedExpenses > 0) {
    const gap = roundMoney(be.requiredRevenue - totalNet);
    recommendations.push({
      id: 'rec_store_breakeven_gap',
      type: 'break_even_risk',
      severity: 'warning',
      entityType: 'store',
      title: `Ponto de Equilíbrio Não Atingido no Período`,
      description: `O faturamento líquido atual (R$ ${totalNet.toFixed(2)}) cobriu ${coveragePercent.toFixed(1)}% das despesas fixas (R$ ${fixedExpenses.toFixed(2)}). Faltam R$ ${gap.toFixed(2)} em receita líquida para o Break-Even.`,
      reasonCodes: ['BREAK_EVEN_NOT_REACHED'],
      currentMetrics: {
        revenue: totalNet,
        fixedExpenses,
        coveragePercent,
        breakEvenRevenue: be.requiredRevenue,
        breakEvenRevenueGap: gap
      },
      suggestedAction: `Concentrar esforços promocionais nos artigos de maior margem de contribuição (Top Oportunidades).`,
      confidence: 'high',
      isEstimated: false,
      score: 85
    });
  }

  // 3. Meta de Lucro Operacional (Target Profit Requirements)
  const targetMonthlyProfit = options.targetMonthlyProfit || 0;
  if (targetMonthlyProfit > 0) {
    const totalUnits = products.reduce((acc, p) => acc + (p.unitsSold || 0), 0);
    const avgSalePrice = totalUnits > 0 ? totalNet / totalUnits : 0;
    const avgContribPerUnit = totalUnits > 0 ? totalContrib / totalUnits : 0;

    const targetProfitReq = calculateTargetProfitRequirements({
      fixedOperatingExpenses: fixedExpenses,
      targetProfit: targetMonthlyProfit,
      averageContributionMarginRatio: avgMarginRatio,
      averageSalePrice: avgSalePrice,
      averageContributionPerUnit: avgContribPerUnit
    });
    const targetGap = Math.max(0, roundMoney(targetProfitReq.requiredRevenueForTargetProfit - totalNet));

    if (targetGap > 0) {
      recommendations.push({
        id: 'rec_store_target_profit_gap',
        type: 'target_profit_gap',
        severity: 'info',
        entityType: 'store',
        title: `Meta de Lucro Operacional (R$ ${targetMonthlyProfit.toFixed(2)})`,
        description: `Para atingir a meta de lucro de R$ ${targetMonthlyProfit.toFixed(2)}, é necessária uma receita líquida de R$ ${targetProfitReq.requiredRevenueForTargetProfit.toFixed(2)} (${targetProfitReq.requiredUnitsForTargetProfit} unidades estimadas). Gap atual: R$ ${targetGap.toFixed(2)}.`,
        reasonCodes: ['TARGET_PROFIT_GAP'],
        currentMetrics: {
          revenue: totalNet,
          targetProfit: targetMonthlyProfit,
          requiredRevenue: targetProfitReq.requiredRevenueForTargetProfit,
          requiredUnits: targetProfitReq.requiredUnitsForTargetProfit,
          targetProfitGap: targetGap
        },
        suggestedAction: `Alavancar artigos de alto volume no quadrante Estratégico para cobrir o gap de R$ ${targetGap.toFixed(2)}.`,
        confidence: 'high',
        isEstimated: false,
        score: 75
      });
    }
  }

  // Ordenar recomendações por severidade (critical > warning > opportunity > info) e score
  const severityOrder: Record<RecommendationSeverity, number> = {
    critical: 4,
    warning: 3,
    opportunity: 2,
    info: 1
  };

  return recommendations.sort((a, b) => {
    if (severityOrder[b.severity] !== severityOrder[a.severity]) {
      return severityOrder[b.severity] - severityOrder[a.severity];
    }
    return (b.score || 0) - (a.score || 0);
  });
}

// ----------------------------------------------------
// SIMULADOR DE CENÁRIOS COMERCIAIS HIPOTÉTICOS
// ----------------------------------------------------

export interface ScenarioAdjustedItem {
  productId: string;
  productName: string;
  actualUnits: number;
  simulatedUnits: number;
  unitPrice: number;
  unitCost: number;
  unitSimulation: PriceSimulationResult;
}

/**
 * Simula Cenários Comerciais Hipotéticos a partir da transformação de premissas e
 * agregação dos resultados unitários produzidos por `simulateProductPrice()`.
 * NUNCA duplica fórmulas de DRE nem de Margem de Contribuição.
 */
export function simulateCommercialScenario(
  productsProfitability: ProductProfitabilityItem[],
  ordersProfitability: OrderProfitability[],
  dre: FinancialDREResult,
  scenarioParams: CommercialScenarioParams,
  options?: { targetMonthlyProfit?: number }
): CommercialScenarioResult {
  if (!productsProfitability || !Array.isArray(productsProfitability) || productsProfitability.length === 0) {
    throw new Error('PRODUCT_PROFITABILITY_REQUIRED');
  }
  if (!ordersProfitability || !Array.isArray(ordersProfitability)) {
    throw new Error('ORDERS_PROFITABILITY_REQUIRED');
  }
  if (!dre) {
    throw new Error('DRE_REQUIRED');
  }
  if (!scenarioParams) {
    throw new Error('SCENARIO_PARAMS_REQUIRED');
  }

  const params = scenarioParams;
  const opts = options || {};
  const volMult = Math.max(0, 1 + (params.volumeChangePercent || 0) / 100);
  const costMult = Math.max(0, 1 + (params.costChangePercent || 0) / 100);
  const shipMult = Math.max(0, 1 + (params.shippingCostChangePercent || 0) / 100);
  const discountPercent = Math.max(0, params.averageDiscountPercent || 0);

  // 1. Unidades reais e contagem de pedidos reais do dataset canônico
  const actualOrdersCount = ordersProfitability.length;
  const actualUnits = productsProfitability.reduce((acc, p) => acc + (p.unitsSold || 0), 0);

  const actualGrossRevenue = ordersProfitability.reduce((acc, o) => acc + o.grossRevenue, 0);
  const actualNetRevenue = ordersProfitability.reduce((acc, o) => acc + o.netRevenue, 0);
  const actualContrib = ordersProfitability.reduce((acc, o) => acc + o.contributionMargin, 0);
  const actualMarginPct = actualNetRevenue > 0 ? (actualContrib / actualNetRevenue) * 100 : 0;
  const actualFixedExpenses = dre.fixedExpenses || 0;
  const actualMarketingExpenses = dre.marketingExpenses || 0;
  const actualOtherExpenses = dre.otherExpenses || 0;
  const actualVariableExpenses = dre.variableExpenses || 0;
  const actualOperatingResult = dre.operatingProfit !== undefined
    ? dre.operatingProfit
    : calculateOperatingResult(
        actualContrib,
        actualFixedExpenses,
        actualMarketingExpenses,
        actualOtherExpenses,
        actualVariableExpenses
      );

  const projectedOrdersCount = Math.round(actualOrdersCount * volMult);
  const projectedUnitsCount = Math.round(actualUnits * volMult);

  // 2. Camada de transformação de inputs e execução do motor canônico simulateProductPrice
  let projectedGrossRevenue = 0;
  let projectedNetRevenue = 0;
  let projectedCogs = 0;
  let projectedGatewayFees = 0;
  let projectedShippingSubsidy = 0;
  let projectedOtherVariableCosts = 0;
  let projectedContributionMargin = 0;

  productsProfitability.forEach(p => {
    const pUnits = p.unitsSold || 0;
    if (pUnits === 0 && actualUnits > 0) return;

    const simUnits = pUnits * volMult;
    const baseGrossUnitPrice = (pUnits > 0 && p.grossRevenue > 0)
      ? (p.grossRevenue / pUnits)
      : (p.unitPrice > 0 ? p.unitPrice : FINANCIAL_DEFAULTS.defaultSalePrice);
    const baseNetUnitPrice = (pUnits > 0 && p.netRevenue > 0)
      ? (p.netRevenue / pUnits)
      : (p.unitPrice > 0 ? p.unitPrice : FINANCIAL_DEFAULTS.defaultSalePrice);
    const baseUnitCost = (pUnits > 0 && p.totalCogs > 0)
      ? (p.totalCogs / pUnits)
      : (p.unitCost > 0 ? p.unitCost : FINANCIAL_DEFAULTS.estimatedProductCosts.DEFAULT);
    const simUnitCost = baseUnitCost * costMult;

    const unitShipSubsidy = (p.shippingSubsidyAllocated && pUnits > 0)
      ? (p.shippingSubsidyAllocated / pUnits) * shipMult
      : 0;
    const unitOtherCosts = (p.otherVariableCostsAllocated && pUnits > 0)
      ? (p.otherVariableCostsAllocated / pUnits)
      : 0;
    const unitGateway = (p.gatewayFeesAllocated && pUnits > 0)
      ? (p.gatewayFeesAllocated / pUnits)
      : 0;
    const effectiveGatewayPercent = (p.netRevenue && p.netRevenue > 0 && p.gatewayFeesAllocated)
      ? (p.gatewayFeesAllocated / p.netRevenue) * 100
      : (baseNetUnitPrice > 0 && unitGateway > 0 ? (unitGateway / baseNetUnitPrice) * 100 : 0);

    // Execução canônica de simulação de preço e custos por unidade via simulateProductPrice
    const sim = simulateProductPrice({
      unitCost: simUnitCost,
      salePrice: baseNetUnitPrice,
      discountPercent: discountPercent,
      gatewayFeePercent: effectiveGatewayPercent,
      gatewayFixedFee: 0,
      shippingCost: unitShipSubsidy,
      shippingCharged: 0,
      otherVariableCosts: unitOtherCosts
    });

    projectedGrossRevenue += roundMoney(baseGrossUnitPrice * simUnits);
    projectedNetRevenue += roundMoney(sim.finalSalePrice * simUnits);
    projectedCogs += roundMoney(simUnitCost * simUnits);
    projectedGatewayFees += roundMoney(sim.gatewayFee * simUnits);
    projectedShippingSubsidy += roundMoney(sim.shippingSubsidy * simUnits);
    projectedOtherVariableCosts += roundMoney(unitOtherCosts * simUnits);
    projectedContributionMargin += roundMoney(sim.contributionMargin * simUnits);
  });

  projectedGrossRevenue = roundMoney(projectedGrossRevenue);
  projectedNetRevenue = roundMoney(projectedNetRevenue);
  projectedCogs = roundMoney(projectedCogs);
  projectedGatewayFees = roundMoney(projectedGatewayFees);
  projectedShippingSubsidy = roundMoney(projectedShippingSubsidy);
  projectedOtherVariableCosts = roundMoney(projectedOtherVariableCosts);
  projectedContributionMargin = roundMoney(projectedContributionMargin);

  const projectedMarginPercent = projectedNetRevenue > 0
    ? roundPercent((projectedContributionMargin / projectedNetRevenue) * 100)
    : 0;

  // 3. Resultado Operacional e Despesas via helper canônico
  const projectedFixedExpenses = roundMoney(actualFixedExpenses);
  const projectedMarketingExpenses = roundMoney(actualMarketingExpenses + (params.marketingInvestmentDelta || 0));
  const projectedOtherExpenses = roundMoney(actualOtherExpenses);
  const projectedVariableOperatingExpenses = roundMoney(actualVariableExpenses);

  const projectedOperatingResult = calculateOperatingResult(
    projectedContributionMargin,
    projectedFixedExpenses,
    projectedMarketingExpenses,
    projectedOtherExpenses,
    projectedVariableOperatingExpenses
  );

  const totalFixedStructuralExpenses = roundMoney(
    projectedFixedExpenses +
    projectedMarketingExpenses +
    projectedOtherExpenses +
    projectedVariableOperatingExpenses
  );

  // 4. Break-Even
  const be = calculateBreakEven({
    fixedOperatingExpenses: totalFixedStructuralExpenses,
    averageContributionMarginRatio: projectedMarginPercent
  });
  const breakEvenRevenue = be.requiredRevenue;
  const breakEvenRevenueGap = Math.max(0, roundMoney(be.requiredRevenue - projectedNetRevenue));

  // 5. Target Profit Requirements
  const targetMonthlyProfit = opts.targetMonthlyProfit !== undefined
    ? opts.targetMonthlyProfit
    : 0;

  const avgSalePrice = projectedUnitsCount > 0 ? projectedNetRevenue / projectedUnitsCount : 0;
  const avgContribPerUnit = projectedUnitsCount > 0 ? projectedContributionMargin / projectedUnitsCount : 0;

  const targetProfitReq = calculateTargetProfitRequirements({
    fixedOperatingExpenses: totalFixedStructuralExpenses,
    targetProfit: targetMonthlyProfit,
    averageContributionMarginRatio: projectedMarginPercent,
    averageSalePrice: avgSalePrice,
    averageContributionPerUnit: avgContribPerUnit
  });

  const targetProfitGap = Math.max(0, roundMoney(targetProfitReq.requiredRevenueForTargetProfit - projectedNetRevenue));

  return {
    name: params.name,
    description: `Simulação com variação de volume (${params.volumeChangePercent > 0 ? '+' : ''}${params.volumeChangePercent}%), custos (${params.costChangePercent > 0 ? '+' : ''}${params.costChangePercent}%) e desconto médio (${params.averageDiscountPercent}%).`,
    isSimulation: true,
    projectedOrdersCount,
    projectedUnitsCount,
    projectedGrossRevenue,
    projectedNetRevenue,
    projectedCogs,
    projectedGatewayFees,
    projectedShippingSubsidy,
    projectedOtherVariableCosts,
    projectedContributionMargin,
    projectedMarginPercent,
    projectedFixedExpenses,
    projectedMarketingExpenses,
    projectedOtherExpenses,
    projectedVariableOperatingExpenses,
    projectedOperatingResult,
    breakEvenRevenue,
    breakEvenRevenueGap,
    targetProfit: targetMonthlyProfit,
    targetProfitRequiredRevenue: targetProfitReq.requiredRevenueForTargetProfit,
    targetProfitRequiredUnits: targetProfitReq.requiredUnitsForTargetProfit,
    targetProfitGap,
    varianceVsActual: {
      netRevenueDelta: roundMoney(projectedNetRevenue - actualNetRevenue),
      contributionMarginDelta: roundMoney(projectedContributionMargin - actualContrib),
      operatingResultDelta: roundMoney(projectedOperatingResult - actualOperatingResult),
      marginPercentDelta: roundPercent(projectedMarginPercent - actualMarginPct)
    }
  };
}

// ----------------------------------------------------
// COMPARAÇÃO DESCRITIVA ENTRE PERÍODOS (SEM PSEUDO-CAUSALIDADE)
// ----------------------------------------------------

export function compareCommercialPeriods(
  currentStats: { netRevenue: number; contributionMargin: number; marginPercent: number; unitsSold: number; ordersCount: number; cogs: number },
  previousStats: { netRevenue: number; contributionMargin: number; marginPercent: number; unitsSold: number; ordersCount: number; cogs: number },
  currentLabel: string = 'Período Atual',
  previousLabel: string = 'Período Anterior'
): PeriodComparisonResult {
  const calcDelta = (cur: number, prev: number) => {
    const delta = roundMoney(cur - prev);
    const deltaPercent = prev > 0 ? roundPercent((delta / prev) * 100) : 0;
    return { current: cur, previous: prev, delta, deltaPercent };
  };

  const netRev = calcDelta(currentStats.netRevenue, previousStats.netRevenue);
  const contrib = calcDelta(currentStats.contributionMargin, previousStats.contributionMargin);
  const units = calcDelta(currentStats.unitsSold, previousStats.unitsSold);
  const orders = calcDelta(currentStats.ordersCount, previousStats.ordersCount);
  const cogs = calcDelta(currentStats.cogs, previousStats.cogs);
  const marginDelta = roundPercent(currentStats.marginPercent - previousStats.marginPercent);

  // Fatos descritivos estritos, sem afirmar causalidade infundada
  const descriptiveSummary: string[] = [
    `Receita Líquida variou ${netRev.delta >= 0 ? '+' : ''}${netRev.deltaPercent}% (${roundMoney(netRev.delta) >= 0 ? '+' : ''}R$ ${netRev.delta.toFixed(2)}) em relação ao período anterior.`,
    `Margem de Contribuição registrou variação de ${contrib.delta >= 0 ? '+' : ''}${contrib.deltaPercent}% (${roundMoney(contrib.delta) >= 0 ? '+' : ''}R$ ${contrib.delta.toFixed(2)}), com margem percentual oscilando em ${marginDelta >= 0 ? '+' : ''}${marginDelta} p.p.`,
    `Volume de peças vendidas variou em ${units.delta >= 0 ? '+' : ''}${units.deltaPercent}% (${units.delta >= 0 ? '+' : ''}${units.delta} unidades).`
  ];

  return {
    currentPeriodLabel: currentLabel,
    previousPeriodLabel: previousLabel,
    metrics: {
      netRevenue: netRev,
      contributionMargin: contrib,
      marginPercent: { current: currentStats.marginPercent, previous: previousStats.marginPercent, delta: marginDelta },
      unitsSold: units,
      ordersCount: orders,
      cogs
    },
    descriptiveSummary
  };
}
