/**
 * MOTOR CANÔNICO DE FORECAST E PLANEJAMENTO COMERCIAL
 * FASE 9.6.5-A — FPAC Store
 *
 * Utiliza o motor canônico de rentabilidade 9.6.1 e o demonstrativo canônico DRE.
 * Não cria fórmulas paralelas. Suporta datas mistas (String ISO + Firestore Timestamp),
 * 150+ pedidos, cenários What-If, cálculo de confiança estatística ponderada por unidades,
 * separação de baseline histórico vs horizonte projetado (Run-Rate), e conversão em Ações Comerciais.
 */

import {
  calculateOrderProfitability,
  calculateProductProfitability,
  calculateProfitabilityOverviewStats
} from './profitability';
import {
  calculateFinancialDRE,
  getOrderPaymentStatus
} from './orderFinancial';
import {
  toTimestampMillis
} from './commercialGovernance';
import {
  ForecastHorizon,
  ForecastConfidenceDetails,
  ForecastConfidenceLevel,
  ForecastBaselineSnapshot,
  ForecastCurrentActuals,
  WhatIfScenarioParams,
  WhatIfScenarioResult,
  RealVsGoalVsForecastComparison,
  CommercialForecast,
  ForecastMetricType
} from '../types/commercialForecast';
import { CommercialAction, CommercialGoal, CommercialGoalType, CommercialGoalPeriod } from '../types/commercialGovernance';

/**
 * Função utilitária para garantir valores numéricos finitos seguros (zero-safe)
 */
export function safeNum(val: any, fallback: number = 0): number {
  if (val === null || val === undefined) return fallback;
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || Number.isNaN(num)) return fallback;
  return num;
}

/**
 * Calcula a cobertura de custos no catálogo (% de itens com costPrice > 0)
 */
export function calculateCatalogCostCoverage(productCatalog: any[] = []): number {
  if (!Array.isArray(productCatalog) || productCatalog.length === 0) return 0;
  let withCost = 0;
  for (const p of productCatalog) {
    const cost = safeNum(p.costPrice ?? p.cost);
    if (cost > 0) withCost++;
  }
  return Number(((withCost / productCatalog.length) * 100).toFixed(1));
}

/**
 * Calcula a contagem de dias inclusiva exata entre duas datas YYYY-MM-DD
 */
export function countInclusiveDays(startDateStr: string, endDateStr: string): number {
  if (!startDateStr || !endDateStr) return 1;
  const s = startDateStr.split('T')[0];
  const e = endDateStr.split('T')[0];
  const startMs = new Date(`${s}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${e}T00:00:00.000Z`).getTime();
  if (isNaN(startMs) || isNaN(endMs)) return 1;
  const diffDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

/**
 * Parâmetros para resolução canônica de janelas de forecast e amostragem
 */
export interface ForecastWindowParams {
  horizon?: ForecastHorizon;
  startDate?: string;
  endDate?: string;
  sourceStartDate?: string;
  sourceEndDate?: string;
  asOfDate?: string;
  forecastStartDate?: string;
  forecastEndDate?: string;
  testNow?: string | Date;
}

export interface ResolvedForecastWindows {
  forecastStartDate: string;
  forecastEndDate: string;
  sourceStartDate: string;
  sourceEndDate: string;
  asOfDate?: string;
  targetDaysCount: number;
  sampleDaysCount: number;
}

/**
 * Resolve automaticamente as janelas temporais de Projeção e Amostragem (Baseline)
 * sem exigir que a UI envie asOfDate manualmente.
 */
export function resolveForecastWindows(params: ForecastWindowParams): ResolvedForecastWindows {
  const {
    horizon,
    startDate,
    endDate,
    sourceStartDate,
    sourceEndDate,
    asOfDate,
    forecastStartDate,
    forecastEndDate,
    testNow
  } = params;

  // Determinar data "hoje" de referência (ISO YYYY-MM-DD)
  const now = testNow
    ? (typeof testNow === 'string'
        ? new Date(testNow.includes('T') ? testNow : `${testNow}T12:00:00.000Z`)
        : new Date(testNow))
    : new Date();
  
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth(); // 0-indexed
  const nowDay = now.getUTCDate();
  const nowIsoDate = `${nowYear}-${String(nowMonth + 1).padStart(2, '0')}-${String(nowDay).padStart(2, '0')}`;

  // 1. Resolver target window (forecastStartDate e forecastEndDate)
  let targetStart = forecastStartDate || startDate;
  let targetEnd = forecastEndDate || endDate;

  if (!targetStart || !targetEnd) {
    if (horizon === 'current_month') {
      const firstDay = new Date(Date.UTC(nowYear, nowMonth, 1));
      const lastDay = new Date(Date.UTC(nowYear, nowMonth + 1, 0));
      targetStart = targetStart || firstDay.toISOString().split('T')[0];
      targetEnd = targetEnd || lastDay.toISOString().split('T')[0];
    } else if (horizon === 'next_month') {
      const firstDayNext = new Date(Date.UTC(nowYear, nowMonth + 1, 1));
      const lastDayNext = new Date(Date.UTC(nowYear, nowMonth + 2, 0));
      targetStart = targetStart || firstDayNext.toISOString().split('T')[0];
      targetEnd = targetEnd || lastDayNext.toISOString().split('T')[0];
    } else if (horizon === 'quarter') {
      const quarterIndex = Math.floor(nowMonth / 3);
      const qStartMonth = quarterIndex * 3;
      const firstDayQuarter = new Date(Date.UTC(nowYear, qStartMonth, 1));
      const lastDayQuarter = new Date(Date.UTC(nowYear, qStartMonth + 3, 0));
      targetStart = targetStart || firstDayQuarter.toISOString().split('T')[0];
      targetEnd = targetEnd || lastDayQuarter.toISOString().split('T')[0];
    } else if (horizon === 'year') {
      const firstDayYear = new Date(Date.UTC(nowYear, 0, 1));
      const lastDayYear = new Date(Date.UTC(nowYear, 12, 0));
      targetStart = targetStart || firstDayYear.toISOString().split('T')[0];
      targetEnd = targetEnd || lastDayYear.toISOString().split('T')[0];
    } else {
      targetStart = targetStart || nowIsoDate;
      const future30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      targetEnd = targetEnd || future30.toISOString().split('T')[0];
    }
  }

  // Normalizar strings para YYYY-MM-DD
  targetStart = targetStart.split('T')[0];
  targetEnd = targetEnd.split('T')[0];

  const targetDaysCount = countInclusiveDays(targetStart, targetEnd);

  // 2. Resolver baseline source window (sourceStartDate e sourceEndDate / asOfDate)
  let resolvedSourceStart = sourceStartDate ? sourceStartDate.split('T')[0] : '';
  let resolvedSourceEnd = (asOfDate || sourceEndDate) ? (asOfDate || sourceEndDate)!.split('T')[0] : '';
  let resolvedAsOf = asOfDate ? asOfDate.split('T')[0] : undefined;

  if (!resolvedSourceStart || !resolvedSourceEnd) {
    if (horizon === 'current_month') {
      resolvedSourceStart = resolvedSourceStart || targetStart;
      // Para mês atual: o asOfDate padrão é min(hoje, targetEnd)
      const effectiveEnd = nowIsoDate < targetEnd ? (nowIsoDate < targetStart ? targetStart : nowIsoDate) : targetEnd;
      resolvedSourceEnd = resolvedSourceEnd || effectiveEnd;
      resolvedAsOf = resolvedAsOf || resolvedSourceEnd;
    } else if (horizon === 'next_month') {
      // Para próximo mês (ex: Setembro): Baseline padrão é o mês atual até a data de hoje (Month-to-Date)
      // se hoje estiver dentro do mês anterior ao target, ou o mês anterior completo se já tiver encerrado.
      const targetStartDateObj = new Date(`${targetStart}T00:00:00.000Z`);
      const prevMonthLastDay = new Date(targetStartDateObj.getTime() - 24 * 60 * 60 * 1000);
      const prevMonthYear = prevMonthLastDay.getUTCFullYear();
      const prevMonthIndex = prevMonthLastDay.getUTCMonth();
      const prevMonthFirstDay = new Date(Date.UTC(prevMonthYear, prevMonthIndex, 1));
      
      const prevMonthFirstDayStr = prevMonthFirstDay.toISOString().split('T')[0];
      const prevMonthLastDayStr = prevMonthLastDay.toISOString().split('T')[0];

      resolvedSourceStart = resolvedSourceStart || prevMonthFirstDayStr;
      
      if (!resolvedSourceEnd) {
        if (nowIsoDate >= prevMonthFirstDayStr && nowIsoDate <= prevMonthLastDayStr) {
          resolvedSourceEnd = nowIsoDate;
        } else if (nowIsoDate > prevMonthLastDayStr) {
          resolvedSourceEnd = prevMonthLastDayStr;
        } else {
          resolvedSourceEnd = prevMonthFirstDayStr;
        }
      }
    } else if (horizon === 'quarter') {
      // Para trimestre (ex: Q3): Baseline padrão é o trimestre imediatamente anterior (ex: Q2)
      const targetStartDateObj = new Date(`${targetStart}T00:00:00.000Z`);
      const prevQEnd = new Date(targetStartDateObj.getTime() - 24 * 60 * 60 * 1000);
      const prevQEndMonth = prevQEnd.getUTCMonth();
      const prevQYear = prevQEnd.getUTCFullYear();
      const prevQIdx = Math.floor(prevQEndMonth / 3);
      const prevQStart = new Date(Date.UTC(prevQYear, prevQIdx * 3, 1));

      resolvedSourceStart = resolvedSourceStart || prevQStart.toISOString().split('T')[0];
      resolvedSourceEnd = resolvedSourceEnd || prevQEnd.toISOString().split('T')[0];
    } else if (horizon === 'year') {
      // Para ano: Baseline padrão é o ano anterior completo
      const targetStartDateObj = new Date(`${targetStart}T00:00:00.000Z`);
      const targetYear = targetStartDateObj.getUTCFullYear();
      const prevYearStart = new Date(Date.UTC(targetYear - 1, 0, 1));
      const prevYearEnd = new Date(Date.UTC(targetYear - 1, 12, 0));

      resolvedSourceStart = resolvedSourceStart || prevYearStart.toISOString().split('T')[0];
      resolvedSourceEnd = resolvedSourceEnd || prevYearEnd.toISOString().split('T')[0];
    } else {
      // Períodos customizados ou quando horizon não é especificado:
      // Se targetStart está no futuro em relação a hoje e sem source explícito,
      // utiliza a janela histórica imediatamente anterior de duração idêntica.
      if (targetStart > nowIsoDate && !sourceStartDate && !sourceEndDate) {
        const targetStartDateObj = new Date(`${targetStart}T00:00:00.000Z`);
        const priorEnd = new Date(targetStartDateObj.getTime() - 24 * 60 * 60 * 1000);
        const priorStart = new Date(priorEnd.getTime() - (targetDaysCount - 1) * 24 * 60 * 60 * 1000);
        resolvedSourceStart = resolvedSourceStart || priorStart.toISOString().split('T')[0];
        resolvedSourceEnd = resolvedSourceEnd || priorEnd.toISOString().split('T')[0];
      } else {
        resolvedSourceStart = resolvedSourceStart || targetStart;
        resolvedSourceEnd = resolvedSourceEnd || targetEnd;
        resolvedAsOf = resolvedAsOf || (asOfDate ? asOfDate.split('T')[0] : undefined);
      }
    }
  }

  const sampleDaysCount = countInclusiveDays(resolvedSourceStart, resolvedSourceEnd);

  return {
    forecastStartDate: targetStart,
    forecastEndDate: targetEnd,
    sourceStartDate: resolvedSourceStart,
    sourceEndDate: resolvedSourceEnd,
    asOfDate: resolvedAsOf,
    targetDaysCount,
    sampleDaysCount
  };
}

/**
 * Calcula as datas padrão para um horizonte na UI a partir de uma data de referência
 */
export function computeHorizonDefaultDates(horizon: ForecastHorizon, refDate: Date = new Date()): { startDate: string; endDate: string } {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();

  if (horizon === 'current_month') {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    return {
      startDate: `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`,
      endDate: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
    };
  } else if (horizon === 'next_month') {
    const first = new Date(year, month + 1, 1);
    const last = new Date(year, month + 2, 0);
    return {
      startDate: `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`,
      endDate: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
    };
  } else if (horizon === 'quarter') {
    const qIdx = Math.floor(month / 3);
    const first = new Date(year, qIdx * 3, 1);
    const last = new Date(year, qIdx * 3 + 3, 0);
    return {
      startDate: `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`,
      endDate: `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
    };
  } else if (horizon === 'year') {
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`
    };
  }

  // custom
  const today = `${year}-${String(month + 1).padStart(2, '0')}-${String(refDate.getDate()).padStart(2, '0')}`;
  const future30 = new Date(refDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  const future30Str = `${future30.getFullYear()}-${String(future30.getMonth() + 1).padStart(2, '0')}-${String(future30.getDate()).padStart(2, '0')}`;
  return {
    startDate: today,
    endDate: future30Str
  };
}

/**
 * Constrói o Snapshot Imutável de Baseline a partir dos pedidos e despesas do período histórico de amostragem
 */
export interface BuildBaselineParams {
  rawOrders: any[];
  expenses?: any[];
  traffic?: any[];
  investments?: any[];
  productCatalog?: any[];
  horizon?: ForecastHorizon;
  periodStartDate?: string;
  periodEndDate?: string;
  sourceStartDate?: string;
  sourceEndDate?: string;
  asOfDate?: string;
  forecastStartDate?: string;
  forecastEndDate?: string;
  testNow?: string | Date;
}

export function buildForecastBaselineSnapshot(params: BuildBaselineParams): ForecastBaselineSnapshot {
  const {
    rawOrders = [],
    expenses = [],
    traffic = [],
    investments = [],
    productCatalog = [],
    horizon,
    periodStartDate,
    periodEndDate,
    sourceStartDate,
    sourceEndDate,
    asOfDate,
    forecastStartDate,
    forecastEndDate,
    testNow
  } = params;

  // Resolução canônica de janelas
  const windows = resolveForecastWindows({
    horizon,
    startDate: periodStartDate || forecastStartDate,
    endDate: periodEndDate || forecastEndDate,
    sourceStartDate,
    sourceEndDate,
    asOfDate,
    forecastStartDate,
    forecastEndDate,
    testNow
  });

  const sourceStartStr = windows.sourceStartDate;
  const sourceEndStr = windows.sourceEndDate;
  const forecastStartStr = windows.forecastStartDate;
  const forecastEndStr = windows.forecastEndDate;

  const startMs = toTimestampMillis(sourceStartStr.includes('T') ? sourceStartStr : `${sourceStartStr}T00:00:00.000Z`) || 0;
  const endMs = toTimestampMillis(sourceEndStr.includes('T') ? sourceEndStr : `${sourceEndStr}T23:59:59.999Z`) || Infinity;

  // Filtragem estrita de pedidos pelo período de amostragem
  const filteredOrders = rawOrders.filter(o => {
    if (!o) return false;
    const t = toTimestampMillis(o.createdAt || o.created_at || o.date);
    if (t === null) return false;
    return t >= startMs && t <= endMs;
  });

  // Filtragem estrita de despesas pelo período
  const filteredExpenses = expenses.filter(e => {
    if (!e) return false;
    const t = toTimestampMillis(e.date || e.createdAt);
    if (t === null) return false;
    return t >= startMs && t <= endMs;
  });

  // Filtragem estrita de tráfego pelo período
  const filteredTraffic = traffic.filter(tr => {
    if (!tr) return false;
    const t = toTimestampMillis(tr.date || tr.createdAt);
    if (t === null) return false;
    return t >= startMs && t <= endMs;
  });

  // Filtragem estrita de investimentos pelo período
  const filteredInvestments = investments.filter(inv => {
    if (!inv) return false;
    const t = toTimestampMillis(inv.date || inv.createdAt);
    if (t === null) return false;
    return t >= startMs && t <= endMs;
  });

  // Cálculo da quantidade de dias na janela de amostragem
  const diffDays = windows.sampleDaysCount;

  // Motor Canônico de Rentabilidade 9.6.1 e quebra por produto
  const productsProf = calculateProductProfitability(filteredOrders, productCatalog);

  // DRE Canônico (FASE 9.6.1 / 9.6.4)
  const dre = calculateFinancialDRE(
    filteredOrders,
    filteredExpenses,
    filteredInvestments,
    filteredTraffic,
    productCatalog
  );

  const realizedRevenue = safeNum(dre.netReceived);
  const realizedContributionMargin = safeNum(dre.contributionMargin);
  const realizedOperatingProfit = safeNum(dre.operatingProfit);

  // Contagem de pedidos pagos e ticket médio consumindo DRE canônico diretamente (sem filtros paralelos)
  const realizedOrders = dre.paidOrdersCount;
  const realizedAverageTicket = dre.averageTicket;

  // Unidades totais vendidas
  const productUnitsSum = productsProf.reduce((acc, p) => acc + p.unitsSold, 0);
  const realizedUnits = productUnitsSum > 0 ? productUnitsSum : filteredOrders.reduce((acc, o) => {
    const items = o.items && Array.isArray(o.items) ? o.items : [];
    if (items.length === 0) return acc + 1;
    return acc + items.reduce((qAcc: number, item: any) => qAcc + (Number(item.quantity) || 1), 0);
  }, 0);

  // Cobertura de Custo Ponderada por Unidades (Reutilizando 9.6.3)
  let snapshotUnits = 0;
  let catalogUnits = 0;
  let estimatedUnits = 0;
  let missingUnits = 0;

  productsProf.forEach(p => {
    if (p.costSourceBreakdown) {
      snapshotUnits += p.costSourceBreakdown.snapshotUnits || 0;
      catalogUnits += p.costSourceBreakdown.catalogUnits || 0;
      estimatedUnits += p.costSourceBreakdown.estimatedUnits || 0;
      missingUnits += p.costSourceBreakdown.missingUnits || 0;
    }
  });

  const totalBreakdownUnits = snapshotUnits + catalogUnits + estimatedUnits + missingUnits;
  let costCoveragePercent = 0;

  if (totalBreakdownUnits > 0) {
    costCoveragePercent = Number((((snapshotUnits + catalogUnits) / totalBreakdownUnits) * 100).toFixed(1));
  } else if (productCatalog.length > 0) {
    costCoveragePercent = calculateCatalogCostCoverage(productCatalog);
  } else {
    costCoveragePercent = 100;
  }

  const baseline: ForecastBaselineSnapshot = {
    isHistoricalSnapshot: true,
    snapshotCapturedAt: new Date().toISOString(),
    snapshotVersion: '1.0',
    sourceStartDate: sourceStartStr,
    sourceEndDate: sourceEndStr,
    asOfDate: windows.asOfDate,
    forecastStartDate: forecastStartStr,
    forecastEndDate: forecastEndStr,
    sampleOrdersCount: filteredOrders.length,
    sampleDaysCount: diffDays,
    dailyAverageRevenue: Number((realizedRevenue / diffDays).toFixed(4)),
    dailyAverageOrders: Number((realizedOrders / diffDays).toFixed(4)),
    dailyAverageUnits: Number((realizedUnits / diffDays).toFixed(4)),
    dailyAverageContributionMargin: Number((realizedContributionMargin / diffDays).toFixed(4)),
    dailyAverageOperatingProfit: Number((realizedOperatingProfit / diffDays).toFixed(4)),
    realizedRevenue,
    realizedOrders,
    realizedUnits,
    realizedContributionMargin,
    realizedOperatingProfit,
    realizedAverageTicket,
    averageTicket: realizedAverageTicket,
    cogs: safeNum(dre.cogs),
    variableCosts: safeNum(dre.totalVariableCosts),
    gatewayFees: safeNum(dre.gatewayFees),
    shippingSubsidy: safeNum(dre.shippingSubsidy),
    orderOtherVariableCosts: safeNum((dre as any).totalOrdersOtherVariableCosts ?? 0),
    administrativeVariableExpenses: safeNum(dre.variableExpenses),
    otherExpenses: safeNum(dre.otherExpenses),
    fixedExpenses: safeNum(dre.fixedExpenses),
    trafficExpenses: safeNum(dre.marketingExpenses),
    costCoveragePercent,
    costSourceBreakdown: {
      snapshotUnits,
      catalogUnits,
      estimatedUnits,
      missingUnits
    }
  };

  return baseline;
}

/**
 * Calcula o nível de confiança estatística do Forecast de forma objetiva
 */
export function calculateForecastConfidence(params: {
  sampleOrdersCount: number;
  sampleDaysCount: number;
  costCoveragePercent: number;
  targetHorizonDays: number;
  missingUnits?: number;
  estimatedUnits?: number;
  costSourceBreakdown?: {
    snapshotUnits: number;
    catalogUnits: number;
    estimatedUnits: number;
    missingUnits: number;
  };
}): ForecastConfidenceDetails {
  const {
    sampleOrdersCount = 0,
    sampleDaysCount = 1,
    costCoveragePercent = 0,
    targetHorizonDays = 30,
    missingUnits = 0,
    estimatedUnits = 0,
    costSourceBreakdown
  } = params;

  const reasons: string[] = [];
  let score = 50; // Base score

  // 1. Caso crítico: 0 pedidos
  if (sampleOrdersCount === 0) {
    return {
      level: 'insufficient',
      score: 0,
      sampleSize: 0,
      costCoveragePercent: 0,
      timeHorizonDays: targetHorizonDays,
      missingUnits: 0,
      estimatedUnits: 0,
      costSourceBreakdown,
      reasons: ['Nenhum pedido registrado no período de amostragem (0 ordens).']
    };
  }

  // 2. Volume de amostragem de pedidos
  if (sampleOrdersCount >= 100) {
    score += 25;
    reasons.push(`Amostragem robusta com ${sampleOrdersCount} pedidos analisados`);
  } else if (sampleOrdersCount >= 30) {
    score += 15;
    reasons.push(`Amostragem moderada com ${sampleOrdersCount} pedidos`);
  } else if (sampleOrdersCount >= 10) {
    score += 5;
    reasons.push(`Amostragem básica (${sampleOrdersCount} pedidos)`);
  } else {
    score -= 20;
    reasons.push(`Amostragem muito reduzida (${sampleOrdersCount} pedidos)`);
  }

  // 3. Cobertura de custos
  if (costCoveragePercent >= 80) {
    score += 20;
    reasons.push(`Alta cobertura de custos cadastrados (${costCoveragePercent}%)`);
  } else if (costCoveragePercent >= 50) {
    score += 5;
    reasons.push(`Cobertura parcial de custos (${costCoveragePercent}%)`);
  } else {
    score -= 25;
    reasons.push(`Baixa cobertura de custos (${costCoveragePercent}%), COGS estimado ou ausente`);
  }

  if (missingUnits > 0) {
    score -= 15;
    reasons.push(`${missingUnits} unidades sem qualquer custo cadastrado`);
  }

  // 4. Extensão da Projeção vs Histórico
  const historyRatio = sampleDaysCount / Math.max(1, targetHorizonDays);
  if (historyRatio >= 1.0) {
    score += 10;
    reasons.push('Janela histórica é igual ou superior ao horizonte de projeção');
  } else if (historyRatio < 0.3) {
    score -= 20;
    reasons.push('Janela histórica muito curta para o horizonte projetado');
  }

  // Clamping 0-100
  score = Math.max(0, Math.min(99, score));

  let level: ForecastConfidenceLevel = 'low';
  if (score < 25 || sampleDaysCount < 3) {
    level = 'insufficient';
  } else if (score >= 75 && costCoveragePercent >= 70 && missingUnits === 0) {
    level = 'high';
  } else if (score >= 45) {
    level = 'medium';
  } else {
    level = 'low';
  }

  return {
    level,
    score,
    sampleSize: sampleOrdersCount,
    costCoveragePercent,
    timeHorizonDays: targetHorizonDays,
    missingUnits,
    estimatedUnits,
    costSourceBreakdown,
    reasons
  };
}

/**
 * Gera o Forecast Completo baseado no Baseline e no Horizonte de Projeção (Run-Rate Canônico)
 */
export interface GenerateForecastParams {
  id?: string;
  title: string;
  horizon: ForecastHorizon;
  startDate?: string;
  endDate?: string;
  sourceStartDate?: string;
  sourceEndDate?: string;
  asOfDate?: string;
  forecastStartDate?: string;
  forecastEndDate?: string;
  rawOrders: any[];
  expenses?: any[];
  traffic?: any[];
  investments?: any[];
  productCatalog?: any[];
  createdBy?: string;
  notes?: string;
  testNow?: string | Date;
}

export function generateCommercialForecast(params: GenerateForecastParams): CommercialForecast {
  const {
    id = `fc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title,
    horizon,
    startDate,
    endDate,
    sourceStartDate,
    sourceEndDate,
    asOfDate,
    forecastStartDate,
    forecastEndDate,
    rawOrders = [],
    expenses = [],
    traffic = [],
    investments = [],
    productCatalog = [],
    createdBy = 'system',
    notes = '',
    testNow
  } = params;

  // Resolução única e canônica de janelas via helper
  const windows = resolveForecastWindows({
    horizon,
    startDate,
    endDate,
    sourceStartDate,
    sourceEndDate,
    asOfDate,
    forecastStartDate,
    forecastEndDate,
    testNow
  });

  // 1. Construir baseline imutável
  const baseline = buildForecastBaselineSnapshot({
    rawOrders,
    expenses,
    traffic,
    investments,
    productCatalog,
    horizon,
    sourceStartDate: windows.sourceStartDate,
    sourceEndDate: windows.sourceEndDate,
    asOfDate: windows.asOfDate,
    forecastStartDate: windows.forecastStartDate,
    forecastEndDate: windows.forecastEndDate,
    testNow
  });

  // 2. Determinar dias totais do horizonte de projeção
  const targetDaysCount = windows.targetDaysCount;

  // 3. Projeção Linear Canônica Run-Rate
  // Se estamos projetando o mês atual e temos asOfDate (ex: 10 dias transcorridos de 30 dias totais)
  // Run Rate diário = realized / 10 dias -> Forecast Total = diário * 30 dias
  const projectedRevenue = Number((baseline.dailyAverageRevenue * targetDaysCount).toFixed(2));
  const projectedOrders = Math.max(0, Math.round(baseline.dailyAverageOrders * targetDaysCount));
  const projectedUnits = Math.max(0, Math.round(baseline.dailyAverageUnits * targetDaysCount));
  const projectedContributionMargin = Number((baseline.dailyAverageContributionMargin * targetDaysCount).toFixed(2));
  
  const projectedContributionMarginPercent = projectedRevenue > 0
    ? Number(((projectedContributionMargin / projectedRevenue) * 100).toFixed(1))
    : 0;

  const projectedOperatingProfit = Number((baseline.dailyAverageOperatingProfit * targetDaysCount).toFixed(2));
  
  // Ticket Médio Projetado: Receita Projetada / Pedidos Projetados
  const projectedAverageTicket = projectedOrders > 0 && projectedRevenue > 0
    ? Number((projectedRevenue / projectedOrders).toFixed(2))
    : baseline.realizedAverageTicket;

  // 4. Confiança Estatística
  const confidence = calculateForecastConfidence({
    sampleOrdersCount: baseline.sampleOrdersCount,
    sampleDaysCount: baseline.sampleDaysCount,
    costCoveragePercent: baseline.costCoveragePercent,
    targetHorizonDays: targetDaysCount,
    missingUnits: baseline.costSourceBreakdown?.missingUnits || 0,
    estimatedUnits: baseline.costSourceBreakdown?.estimatedUnits || 0,
    costSourceBreakdown: baseline.costSourceBreakdown
  });

  const nowIso = new Date().toISOString();

  // 5. Estado Atual Realizado (Current Actuals)
  const currentActuals: ForecastCurrentActuals = {
    revenue: baseline.realizedRevenue,
    operatingProfit: baseline.realizedOperatingProfit,
    contributionMargin: baseline.realizedContributionMargin,
    units: baseline.realizedUnits,
    averageTicket: baseline.realizedAverageTicket,
    orders: baseline.realizedOrders,
    calculatedAt: nowIso
  };

  return {
    id,
    title,
    horizon,
    sourceStartDate: windows.sourceStartDate,
    sourceEndDate: windows.sourceEndDate,
    asOfDate: windows.asOfDate,
    forecastStartDate: windows.forecastStartDate,
    forecastEndDate: windows.forecastEndDate,
    startDate: windows.forecastStartDate,
    endDate: windows.forecastEndDate,
    targetDaysCount,
    baseline,
    currentActuals,
    confidence,
    projectedRevenue,
    projectedOrders,
    projectedUnits,
    projectedContributionMargin,
    projectedContributionMarginPercent,
    projectedOperatingProfit,
    projectedAverageTicket,
    status: 'active',
    notes,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy
  };
}

/**
 * Atualiza o estado atualizado (Current Actuals) e projeções de um Forecast existente
 * SEM ALTERAR O SNAPSHOT IMUTÁVEL DE BASELINE
 */
export function recalculateCommercialForecastActuals(
  existingForecast: CommercialForecast,
  data: {
    rawOrders: any[];
    expenses?: any[];
    traffic?: any[];
    investments?: any[];
    productCatalog?: any[];
    testNow?: string | Date;
  }
): CommercialForecast {
  const { rawOrders = [], expenses = [], traffic = [], investments = [], productCatalog = [], testNow } = data;

  const now = testNow
    ? (typeof testNow === 'string'
        ? new Date(testNow.includes('T') ? testNow : `${testNow}T12:00:00.000Z`)
        : new Date(testNow))
    : new Date();
  
  const nowIsoDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  const currentActualsStart = existingForecast.forecastStartDate || existingForecast.startDate || '2026-08-01';
  const targetEnd = existingForecast.forecastEndDate || existingForecast.endDate || '2026-08-31';
  const isBeforeTargetStart = nowIsoDate < currentActualsStart;
  const currentActualsEnd = isBeforeTargetStart
    ? currentActualsStart
    : (nowIsoDate < targetEnd ? nowIsoDate : targetEnd);

  const nowIso = new Date().toISOString();

  let currentActuals: ForecastCurrentActuals;
  let projectedRevenue: number;
  let projectedOrders: number;
  let projectedUnits: number;
  let projectedContributionMargin: number;
  let projectedContributionMarginPercent: number;
  let projectedOperatingProfit: number;
  let projectedAverageTicket: number;
  let confidence = existingForecast.confidence;

  if (isBeforeTargetStart) {
    // Quando recalculado antes do início da janela de forecast (ex: hoje é 16/08 e forecast é Setembro):
    // currentActuals deve ser zerado (nenhum dia transcorrido dentro da janela de forecast)
    // MAS as projeções DEVEM PERMANECER IGUAIS ao Forecast original já persistido (não zerar projeção sobre target vazio).
    currentActuals = {
      revenue: 0,
      orders: 0,
      units: 0,
      contributionMargin: 0,
      operatingProfit: 0,
      averageTicket: 0,
      calculatedAt: nowIso
    };
    projectedRevenue = existingForecast.projectedRevenue;
    projectedOrders = existingForecast.projectedOrders;
    projectedUnits = existingForecast.projectedUnits;
    projectedContributionMargin = existingForecast.projectedContributionMargin;
    projectedContributionMarginPercent = existingForecast.projectedContributionMarginPercent;
    projectedOperatingProfit = existingForecast.projectedOperatingProfit;
    projectedAverageTicket = existingForecast.projectedAverageTicket;
    confidence = existingForecast.confidence;
  } else {
    // Calcular novo estado de dados atuais na janela transcorrida até hoje (currentActualsStart -> currentActualsEnd)
    const freshSnapshot = buildForecastBaselineSnapshot({
      rawOrders,
      expenses,
      traffic,
      investments,
      productCatalog,
      sourceStartDate: currentActualsStart,
      sourceEndDate: currentActualsEnd,
      asOfDate: currentActualsEnd,
      forecastStartDate: existingForecast.forecastStartDate || existingForecast.startDate,
      forecastEndDate: existingForecast.forecastEndDate || existingForecast.endDate,
      testNow
    });

    currentActuals = {
      revenue: freshSnapshot.realizedRevenue,
      operatingProfit: freshSnapshot.realizedOperatingProfit,
      contributionMargin: freshSnapshot.realizedContributionMargin,
      units: freshSnapshot.realizedUnits,
      averageTicket: freshSnapshot.realizedAverageTicket,
      orders: freshSnapshot.realizedOrders,
      calculatedAt: nowIso
    };

    const targetDaysCount = existingForecast.targetDaysCount;
    projectedRevenue = Number((freshSnapshot.dailyAverageRevenue * targetDaysCount).toFixed(2));
    projectedOrders = Math.max(0, Math.round(freshSnapshot.dailyAverageOrders * targetDaysCount));
    projectedUnits = Math.max(0, Math.round(freshSnapshot.dailyAverageUnits * targetDaysCount));
    projectedContributionMargin = Number((freshSnapshot.dailyAverageContributionMargin * targetDaysCount).toFixed(2));
    projectedContributionMarginPercent = projectedRevenue > 0
      ? Number(((projectedContributionMargin / projectedRevenue) * 100).toFixed(1))
      : 0;
    projectedOperatingProfit = Number((freshSnapshot.dailyAverageOperatingProfit * targetDaysCount).toFixed(2));
    projectedAverageTicket = projectedOrders > 0 && projectedRevenue > 0
      ? Number((projectedRevenue / projectedOrders).toFixed(2))
      : freshSnapshot.realizedAverageTicket;

    confidence = calculateForecastConfidence({
      sampleOrdersCount: freshSnapshot.sampleOrdersCount,
      sampleDaysCount: freshSnapshot.sampleDaysCount,
      costCoveragePercent: freshSnapshot.costCoveragePercent,
      targetHorizonDays: targetDaysCount,
      missingUnits: freshSnapshot.costSourceBreakdown?.missingUnits || 0,
      estimatedUnits: freshSnapshot.costSourceBreakdown?.estimatedUnits || 0,
      costSourceBreakdown: freshSnapshot.costSourceBreakdown
    });
  }

  // Retorna forecast com baselineSnapshot intacto e imutável
  return {
    ...existingForecast,
    baseline: existingForecast.baseline, // Preservação estrita
    currentActuals,
    confidence,
    projectedRevenue,
    projectedOrders,
    projectedUnits,
    projectedContributionMargin,
    projectedContributionMarginPercent,
    projectedOperatingProfit,
    projectedAverageTicket,
    lastRecalculatedAt: nowIso,
    updatedAt: nowIso
  };
}

/**
 * Simula Cenário What-If sem alterar ou mutar nenhum dado de produto ou catálogo.
 * Reconcilia centavo a centavo com o DRE e os motores canônicos 9.6.1.
 */
export function simulateWhatIfScenario(
  forecast: CommercialForecast,
  params: WhatIfScenarioParams
): WhatIfScenarioResult {
  const {
    name,
    priceAdjustmentPercent = 0,
    volumeElasticityFactor = 1.0,
    volumeAdjustmentPercent = 0,
    costInflationPercent = 0,
    trafficSpendAdjustment = 0,
    fixedExpenseAdjustment = 0
  } = params;

  const baseRev = safeNum(forecast.projectedRevenue);
  const baseUnits = safeNum(forecast.projectedUnits);
  const baseOrders = safeNum(forecast.projectedOrders || Math.round(forecast.baseline.dailyAverageOrders * forecast.targetDaysCount));
  const baseCM = safeNum(forecast.projectedContributionMargin);
  const baseOP = safeNum(forecast.projectedOperatingProfit);

  const horizonDays = Math.max(1, forecast.targetDaysCount);
  const sampleDays = Math.max(1, forecast.baseline.sampleDaysCount);
  const timeScale = horizonDays / sampleDays;

  // Componentes base em escala do horizonte
  const baseCOGS = safeNum(forecast.baseline.cogs * timeScale);
  
  // Custos variáveis do pedido (Gateway + Frete subsidiado + outros custos do pedido)
  const baseGatewayFees = safeNum((forecast.baseline.gatewayFees ?? 0) * timeScale);
  const baseShippingSubsidy = safeNum((forecast.baseline.shippingSubsidy ?? 0) * timeScale);
  const baseOrderOtherVar = safeNum((forecast.baseline.orderOtherVariableCosts ?? 0) * timeScale);
  
  let baseOrderVarCosts = baseGatewayFees + baseShippingSubsidy + baseOrderOtherVar;
  if (baseOrderVarCosts === 0 && forecast.baseline.variableCosts > 0) {
    const adminVar = safeNum((forecast.baseline.administrativeVariableExpenses ?? 0) * timeScale);
    baseOrderVarCosts = safeNum((forecast.baseline.variableCosts * timeScale) - adminVar);
  }

  const baseAdminVarExpenses = safeNum((forecast.baseline.administrativeVariableExpenses ?? 0) * timeScale);
  const baseFixed = safeNum(forecast.baseline.fixedExpenses * timeScale);
  const baseTraffic = safeNum(forecast.baseline.trafficExpenses * timeScale);
  const baseOtherExpenses = safeNum((forecast.baseline.otherExpenses ?? 0) * timeScale);

  // Efeito Preço & Elasticidade de Volume
  const effectiveVolumeChangePercent = (volumeAdjustmentPercent - (priceAdjustmentPercent * (volumeElasticityFactor || 1.0))) / 100;
  const simulatedUnits = Math.max(0, Math.round(baseUnits * (1 + effectiveVolumeChangePercent)));
  const simulatedOrders = Math.max(0, Math.round(baseOrders * (1 + effectiveVolumeChangePercent)));

  const effectivePriceMultiplier = 1 + (priceAdjustmentPercent / 100);
  const simulatedRevenue = Number((baseRev * (1 + effectiveVolumeChangePercent) * effectivePriceMultiplier).toFixed(2));

  // COGS varia com volume e inflação de custo
  const effectiveCostMultiplier = 1 + (costInflationPercent / 100);
  const simulatedCOGS = Number((baseCOGS * (1 + effectiveVolumeChangePercent) * effectiveCostMultiplier).toFixed(2));

  // Custos variáveis do pedido variam proporcionalmente ao volume/receita
  const simulatedOrderVarCosts = Number((baseOrderVarCosts * (1 + effectiveVolumeChangePercent)).toFixed(2));

  // Margem de Contribuição Simulada Canônica (Receita Líquida - COGS - Custos Variáveis dos Pedidos)
  // Reconciliado com motor 9.6.1 e DRE orderContributionMargin (exclui despesas variáveis administrativas)
  const simulatedCM = Number((simulatedRevenue - simulatedCOGS - simulatedOrderVarCosts).toFixed(2));
  const simulatedCMPercent = simulatedRevenue > 0
    ? Number(((simulatedCM / simulatedRevenue) * 100).toFixed(1))
    : 0;

  // Despesas Variáveis Administrativas, Fixas, Tráfego e Outras
  const simulatedAdminVarExpenses = Number((baseAdminVarExpenses * (1 + effectiveVolumeChangePercent)).toFixed(2));
  const simulatedFixed = Math.max(0, Number((baseFixed + fixedExpenseAdjustment).toFixed(2)));
  const simulatedTraffic = Math.max(0, Number((baseTraffic + trafficSpendAdjustment).toFixed(2)));
  const simulatedOtherExpenses = Number(baseOtherExpenses.toFixed(2));

  // Lucro Operacional Simulado Canônico = Margem de Contribuição - Despesas Adm Variáveis - Fixas - Tráfego - Outras
  // Reconciliado com calculateOperatingResult / calculateFinancialDRE
  const simulatedOP = Number((simulatedCM - simulatedAdminVarExpenses - simulatedFixed - simulatedTraffic - simulatedOtherExpenses).toFixed(2));

  const simulatedAvgTicket = simulatedOrders > 0 && simulatedRevenue > 0
    ? Number((simulatedRevenue / simulatedOrders).toFixed(2))
    : (simulatedUnits > 0 ? Number((simulatedRevenue / simulatedUnits).toFixed(2)) : 0);

  const deltaRevenue = Number((simulatedRevenue - baseRev).toFixed(2));
  const deltaContributionMargin = Number((simulatedCM - baseCM).toFixed(2));
  const deltaOperatingProfit = Number((simulatedOP - baseOP).toFixed(2));
  const deltaUnits = simulatedUnits - baseUnits;
  const deltaOrders = simulatedOrders - baseOrders;

  let impactAssessment: 'positive' | 'neutral' | 'negative' = 'neutral';
  if (deltaOperatingProfit > 0 && deltaContributionMargin >= 0) {
    impactAssessment = 'positive';
  } else if (deltaOperatingProfit < 0 || deltaContributionMargin < 0) {
    impactAssessment = 'negative';
  }

  let summary = `Cenário "${name}": `;
  if (deltaOperatingProfit >= 0) {
    summary += `Aumento projetado de R$ ${deltaOperatingProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no Lucro Operacional.`;
  } else {
    summary += `Redução projetada de R$ ${Math.abs(deltaOperatingProfit).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no Lucro Operacional.`;
  }

  return {
    id: `sc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name,
    params,
    projectedRevenue: simulatedRevenue,
    projectedOrders: simulatedOrders,
    projectedUnits: simulatedUnits,
    projectedContributionMargin: simulatedCM,
    projectedContributionMarginPercent: simulatedCMPercent,
    projectedOperatingProfit: simulatedOP,
    projectedAverageTicket: simulatedAvgTicket,
    deltaRevenue,
    deltaContributionMargin,
    deltaOperatingProfit,
    deltaUnits,
    deltaOrders,
    impactAssessment,
    summary,
    simulatedAt: new Date().toISOString()
  };
}

/**
 * Gera uma fingerprint determinística e estável para um Cenário What-If
 * evitando duplicações ao converter em Ação Comercial mesmo com IDs de simulação gerados dinamicamente.
 */
export function generateScenarioFingerprint(
  arg1: string | Partial<WhatIfScenarioParams>,
  arg2?: string,
  arg3?: string,
  arg4?: Partial<WhatIfScenarioParams>
): string {
  let forecastId = 'global';
  let actionType = 'improve_margin';
  let entityId = 'store';
  let params: Partial<WhatIfScenarioParams> = {};

  if (typeof arg1 === 'object' && arg1 !== null) {
    params = arg1;
  } else if (typeof arg1 === 'string') {
    forecastId = arg1;
    actionType = arg2 || 'improve_margin';
    entityId = arg3 || 'store';
    params = arg4 || {};
  }

  const p = {
    price: Number(params.priceAdjustmentPercent || 0).toFixed(2),
    vol: Number(params.volumeAdjustmentPercent || 0).toFixed(2),
    elas: Number(params.volumeElasticityFactor ?? 1.0).toFixed(2),
    cogs: Number(params.costInflationPercent || 0).toFixed(2),
    traf: Number(params.trafficSpendAdjustment || 0).toFixed(2),
    fix: Number(params.fixedExpenseAdjustment || 0).toFixed(2)
  };
  return `whatif_${forecastId}_${actionType}_${entityId || 'store'}_p${p.price}_v${p.vol}_e${p.elas}_c${p.cogs}_t${p.traf}_f${p.fix}`;
}

/**
 * Converte um Cenário What-If em um payload pronto para criação de Ação Comercial (CommercialAction)
 */
export function convertScenarioToCommercialActionPayload(
  scenario: WhatIfScenarioResult,
  forecast: CommercialForecast,
  options?: { targetProductId?: string; targetProductName?: string; createdBy?: string }
): Partial<CommercialAction> {
  const { params } = scenario;
  let actionType: any = 'improve_margin';

  if ((params.priceAdjustmentPercent || 0) !== 0) {
    actionType = 'review_price';
  } else if ((params.costInflationPercent || 0) !== 0) {
    actionType = 'review_cost';
  } else if ((params.trafficSpendAdjustment || 0) !== 0) {
    actionType = 'review_promotion';
  }

  const targetEntityId = options?.targetProductId || 'store_all';
  const targetEntityName = options?.targetProductName || 'Geral Loja';
  const deterministicFingerprint = generateScenarioFingerprint(
    forecast.id,
    actionType,
    targetEntityId,
    scenario.params
  );

  const payload: Partial<CommercialAction> = {
    title: `Implementar Cenário: ${scenario.name}`,
    description: `Ação originada a partir do Forecast "${forecast.title}". ${scenario.summary}. Variação esperada de Lucro: R$ ${scenario.deltaOperatingProfit.toFixed(2)}.`,
    type: actionType,
    entityType: options?.targetProductId ? 'product' : 'store',
    entityId: targetEntityId,
    entityName: targetEntityName,
    priority: scenario.impactAssessment === 'positive' && scenario.deltaOperatingProfit > 500 ? 'high' : 'medium',
    status: 'draft',
    source: 'commercial_intelligence',
    sourceSnapshot: {
      isHistoricalSnapshot: true,
      snapshotCapturedAt: new Date().toISOString(),
      snapshotVersion: '1.0',
      recommendationType: 'forecast_what_if',
      reasonCodes: [deterministicFingerprint],
      confidence: forecast.confidence.level,
      currentPrice: forecast.projectedAverageTicket,
      grossRevenue: forecast.projectedRevenue,
      contributionMargin: forecast.projectedContributionMargin,
      costCoveragePercent: forecast.confidence.costCoveragePercent,
      unitsSold: forecast.projectedUnits
    },
    recommendationFingerprint: deterministicFingerprint,
    createdBy: options?.createdBy || 'forecast_engine',
    createdAt: new Date().toISOString()
  };

  return payload;
}

/**
 * Compara Realizado Atual (Current Actuals) vs Meta vs Forecast para qualquer métrica comercial
 */
export function compareRealVsGoalVsForecast(params: {
  metric: ForecastMetricType;
  realized: number;
  targetGoal?: number;
  forecasted: number;
}): RealVsGoalVsForecastComparison {
  const { metric, realized = 0, targetGoal, forecasted = 0 } = params;

  const cleanReal = safeNum(realized);
  const cleanGoal = targetGoal !== undefined ? safeNum(targetGoal) : undefined;
  const cleanFc = safeNum(forecasted);

  let gapGoalVsForecast = 0;
  let gapRealVsGoal = 0;
  let projectedAttainmentPercent = 0;
  let currentAttainmentPercent = 0;
  let isGoalOnTrack = true;
  let paceStatus: 'ahead' | 'on_track' | 'behind' | 'critical' = 'on_track';

  if (cleanGoal !== undefined && cleanGoal > 0) {
    gapGoalVsForecast = Number((cleanGoal - cleanFc).toFixed(2));
    gapRealVsGoal = Number((cleanReal - cleanGoal).toFixed(2));
    projectedAttainmentPercent = Number(((cleanFc / cleanGoal) * 100).toFixed(1));
    currentAttainmentPercent = Number(((cleanReal / cleanGoal) * 100).toFixed(1));
    isGoalOnTrack = cleanFc >= cleanGoal;

    if (projectedAttainmentPercent >= 110) {
      paceStatus = 'ahead';
    } else if (projectedAttainmentPercent >= 95) {
      paceStatus = 'on_track';
    } else if (projectedAttainmentPercent >= 75) {
      paceStatus = 'behind';
    } else {
      paceStatus = 'critical';
    }
  }

  return {
    metric,
    realized: cleanReal,
    targetGoal: cleanGoal,
    forecasted: cleanFc,
    gapGoalVsForecast,
    gapRealVsGoal,
    isGoalOnTrack,
    projectedAttainmentPercent,
    currentAttainmentPercent,
    paceStatus
  };
}

/**
 * Infere o período canônico estrito com base nas datas de início e fim.
 * Regras:
 * - MONTHLY: estritamente do primeiro ao último dia do mesmo mês (ex: 2026-08-01 -> 2026-08-31; 2028-02-01 -> 2028-02-29).
 * - QUARTERLY: estritamente trimestre civil completo:
 *     Q1: 01/01 -> 31/03
 *     Q2: 01/04 -> 30/06
 *     Q3: 01/07 -> 30/09
 *     Q4: 01/10 -> 31/12
 * - YEARLY: estritamente 01/01 -> 31/12 do mesmo ano.
 * - CUSTOM: qualquer outro intervalo (ex: 10/08 a 20/08).
 */
export function inferCanonicalPeriodFromDates(
  startDate?: string,
  endDate?: string
): CommercialGoalPeriod | 'custom' {
  if (!startDate || !endDate) return 'custom';

  const s = startDate.split('T')[0];
  const e = endDate.split('T')[0];

  const sMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const eMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e);
  if (!sMatch || !eMatch) return 'custom';

  const sYear = parseInt(sMatch[1], 10);
  const sMonth = parseInt(sMatch[2], 10); // 1-12
  const sDay = parseInt(sMatch[3], 10);

  const eYear = parseInt(eMatch[1], 10);
  const eMonth = parseInt(eMatch[2], 10); // 1-12
  const eDay = parseInt(eMatch[3], 10);

  // 1. YEARLY: 01/01 a 31/12 do mesmo ano
  if (sYear === eYear && sMonth === 1 && sDay === 1 && eMonth === 12 && eDay === 31) {
    return 'yearly';
  }

  // 2. QUARTERLY: Trimestre civil completo do mesmo ano
  if (sYear === eYear) {
    if (sMonth === 1 && sDay === 1 && eMonth === 3 && eDay === 31) return 'quarterly'; // Q1
    if (sMonth === 4 && sDay === 1 && eMonth === 6 && eDay === 30) return 'quarterly'; // Q2
    if (sMonth === 7 && sDay === 1 && eMonth === 9 && eDay === 30) return 'quarterly'; // Q3
    if (sMonth === 10 && sDay === 1 && eMonth === 12 && eDay === 31) return 'quarterly'; // Q4
  }

  // 3. MONTHLY: Primeiro até último dia do mesmo mês (considera ano bissexto para Fevereiro)
  if (sYear === eYear && sMonth === eMonth && sDay === 1) {
    const lastDayOfMonth = new Date(Date.UTC(sYear, sMonth, 0)).getUTCDate();
    if (eDay === lastDayOfMonth) {
      return 'monthly';
    }
  }

  // 4. Qualquer outro caso é CUSTOM
  return 'custom';
}

/**
 * Seleciona determinísticamente a meta compatível com o Forecast
 * Regras da Fase 9.6.5-F:
 * 1. Meta com status 'active' e tipo (metric) compatível.
 * 2. O período canônico inferido do Forecast (inferCanonicalPeriodFromDates) DEVE coincidir com o período canônico da Meta.
 *    - A meta deve ter seu `goal.period` compatível com o período canônico inferido de suas próprias datas.
 *    - A correspondência exata de datas NÃO pode ignorar o tipo de período (ex: custom 10/08->20/08 vs monthly 10/08->20/08 => NO MATCH).
 *    - Se o forecast for 'custom' (ex: 10/08 a 20/08), apenas metas 'custom' com as exatas mesmas datas dão match.
 *    - Se o forecast for 'monthly' (ex: 01/08 a 31/08), a meta deve ser 'monthly' e cobrir o mesmo mês civil.
 *    - Se o forecast for 'quarterly' (ex: 01/07 a 30/09), a meta deve ser 'quarterly' e cobrir o mesmo trimestre civil.
 *    - Se o forecast for 'yearly' (ex: 01/01 a 31/12), a meta deve ser 'yearly' e cobrir o mesmo ano civil.
 * 3. Prioridade 1: Match exato de datas com período compatível.
 * 4. Prioridade 2: Match canônico de período equivalente (ex: mesmo mês YYYY-MM para metas mensais).
 */
export function selectCompatibleCommercialGoal(
  goals: CommercialGoal[],
  metric: ForecastMetricType | CommercialGoalType,
  forecastStartDate?: string,
  forecastEndDate?: string
): CommercialGoal | undefined {
  if (!goals || goals.length === 0 || !forecastStartDate || !forecastEndDate) {
    return undefined;
  }

  const fStart = forecastStartDate.split('T')[0];
  const fEnd = forecastEndDate.split('T')[0];
  const forecastPeriod = inferCanonicalPeriodFromDates(fStart, fEnd);

  const matchingGoals = goals.filter(g => g.status === 'active' && g.type === metric);
  if (matchingGoals.length === 0) return undefined;

  // Filtrar apenas metas cujo período declarado e inferido sejam consistentes com o período do forecast
  const validCandidateGoals = matchingGoals.filter(g => {
    const gStart = (g.startDate || '').split('T')[0];
    const gEnd = (g.endDate || '').split('T')[0];
    const goalInferredPeriod = inferCanonicalPeriodFromDates(gStart, gEnd);

    // O período da meta declarado deve coincidir com o inferido pelas suas datas
    if (g.period !== goalInferredPeriod) {
      return false;
    }

    // O período da meta deve ser idêntico ao período canônico inferido do forecast
    return g.period === forecastPeriod;
  });

  if (validCandidateGoals.length === 0) return undefined;

  // 1. Prioridade 1: Exato (mesmas datas e período compatível)
  const exactMatch = validCandidateGoals.find(g => {
    const gStart = (g.startDate || '').split('T')[0];
    const gEnd = (g.endDate || '').split('T')[0];
    return gStart === fStart && gEnd === fEnd;
  });
  if (exactMatch) return exactMatch;

  // 2. Prioridade 2: Canônico equivalente
  const fStartYear = fStart.substring(0, 4);
  const fStartMonth = fStart.substring(5, 7);

  for (const g of validCandidateGoals) {
    const gStart = (g.startDate || '').split('T')[0];
    const gStartYear = gStart.substring(0, 4);
    const gStartMonth = gStart.substring(5, 7);

    if (forecastPeriod === 'monthly' && gStartYear === fStartYear && gStartMonth === fStartMonth) {
      return g;
    }
    if (forecastPeriod === 'yearly' && gStartYear === fStartYear) {
      return g;
    }
    if (forecastPeriod === 'quarterly') {
      const gEnd = (g.endDate || '').split('T')[0];
      if (gStart === fStart && gEnd === fEnd) {
        return g;
      }
    }
  }

  return undefined;
}

