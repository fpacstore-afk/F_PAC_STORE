/**
 * MOTOR ANALÍTICO E MATEMÁTICO DE ORÇAMENTO COMERCIAL & GUARDRAILS FINANCEIROS
 * FASE 9.6.6 — FPAC Store
 *
 * Fornece métodos puros, sem efeitos colaterais e com exatidão de centavos para:
 * - Construção de Snapshots de Baseline e Forecast Imutáveis
 * - Cálculo Pro-Rata de Budget To-Date com contagem de dias
 * - Reconciliação Multi-Way (Real vs Budget, Budget vs Forecast, Budget vs Meta)
 * - Análise de Variâncias de Receita e Despesa (Favorável / Desfavorável)
 * - Monitoramento de Guardrails Financeiros com Alertas Críticos e Avisos
 * - Cálculo de Confiabilidade de Custo e Cobertura de Catálogo
 * - Recálculo determinístico de Realizados sem alterar Baseline Histórico
 */

import {
  CommercialBudget,
  BudgetBaselineSnapshot,
  BudgetForecastSnapshot,
  BudgetApprovedSnapshot,
  BudgetCurrentActuals,
  BudgetToDateProRata,
  BudgetReconciliation,
  BudgetVarianceMetric,
  BudgetGuardrailAlert,
  BudgetVarianceAlert,
  BudgetVarianceAlertType,
  BudgetConfidenceDetails,
  BudgetConfidenceLevel,
  BudgetCostSourceBreakdown,
  CommercialBudgetAllocations,
  CommercialBudgetLineAllocation,
  LineAllocationMethod,
  CommercialBudgetGuardrails,
  BudgetPeriod
} from '../types/commercialBudget.js';
import { CommercialForecast } from '../types/commercialForecast.js';
import { CommercialGoal } from '../types/commercialGovernance.js';
import {
  calculateOrderProfitability,
  calculateProductProfitability,
  calculateFinancialDRE,
  calculateProfitabilityOverviewStats,
  aggregateProfitabilityByLine,
  calculateOperatingResult,
  getOrderItemCost
} from './orderFinancial.js';
import { inferCanonicalPeriodFromDates } from './commercialForecast.js';

export function roundMoney(val: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
  return Number(Math.round(Number(val + 'e2')) + 'e-2');
}

export function roundPercent(val: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 0;
  return Number(Math.round(Number(val + 'e2')) + 'e-2');
}

export function zeroSafeDivide(num: number, den: number, fallback: number = 0): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || Math.abs(den) < 1e-9) {
    return fallback;
  }
  const res = num / den;
  return Number.isFinite(res) ? res : fallback;
}

/**
 * Normaliza alocações de orçamento garantindo integridade e retrocompatibilidade
 */
export function normalizeBudgetAllocations(alloc: Partial<CommercialBudgetAllocations>): CommercialBudgetAllocations {
  const cogsBudget = roundMoney(alloc?.cogsBudget || 0);
  const gatewayFeesBudget = roundMoney(alloc?.gatewayFeesBudget || 0);
  const shippingSubsidyBudget = roundMoney(alloc?.shippingSubsidyBudget || 0);
  const orderOtherVariableCostsBudget = roundMoney(alloc?.orderOtherVariableCostsBudget || 0);
  const administrativeVariableExpensesBudget = roundMoney(
    alloc?.administrativeVariableExpensesBudget ?? (alloc?.variableExpensesBudget || 0)
  );
  const fixedExpensesBudget = roundMoney(alloc?.fixedExpensesBudget || 0);
  const trafficBudget = roundMoney(alloc?.trafficBudget ?? (alloc?.marketingBudget || 0));
  const marketingBudget = trafficBudget;
  const otherExpensesBudget = roundMoney(alloc?.otherExpensesBudget || 0);

  const totalExpensesBudget = roundMoney(
    cogsBudget +
    gatewayFeesBudget +
    shippingSubsidyBudget +
    orderOtherVariableCostsBudget +
    administrativeVariableExpensesBudget +
    fixedExpensesBudget +
    trafficBudget +
    otherExpensesBudget
  );

  return {
    cogsBudget,
    gatewayFeesBudget,
    shippingSubsidyBudget,
    orderOtherVariableCostsBudget,
    administrativeVariableExpensesBudget,
    variableExpensesBudget: administrativeVariableExpensesBudget,
    fixedExpensesBudget,
    trafficBudget,
    marketingBudget,
    otherExpensesBudget,
    totalExpensesBudget: alloc?.totalExpensesBudget ? roundMoney(alloc.totalExpensesBudget) : totalExpensesBudget
  };
}

export { calculateOperatingResult };

/**
 * Extrai a data canônica de lançamentos financeiros (cashflow, tráfego, investimentos)
 */
export function extractEntryDateString(entry: any): string {
  if (!entry) return '';
  const val = entry.date ?? entry.dueDate ?? entry.paymentDate ?? entry.createdAt ?? entry.created_at ?? entry.timestamp;
  return extractOrderDateString(val);
}

/**
 * Extrai de forma canônica a string YYYY-MM-DD da data do pedido,
 * suportando strings ISO, Dates, Firestore Timestamps nativos (.toDate()),
 * e objetos com _seconds/seconds, aceitando o objeto order ou a data diretamente.
 */
export function extractOrderDateString(orderOrVal: any): string {
  if (!orderOrVal) return '';
  let val = orderOrVal;
  if (typeof orderOrVal === 'object' && !(orderOrVal instanceof Date) && typeof orderOrVal.toDate !== 'function') {
    if (orderOrVal.createdAt !== undefined || orderOrVal.orderDate !== undefined || orderOrVal.created_at !== undefined || orderOrVal.date !== undefined) {
      val = orderOrVal.createdAt ?? orderOrVal.orderDate ?? orderOrVal.created_at ?? orderOrVal.date;
    }
  }
  if (!val) return '';
  if (typeof val === 'string') {
    return val.split('T')[0];
  }
  if (val instanceof Date) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString().split('T')[0];
    } catch {
      // fallback
    }
  }
  if (typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString().split('T')[0];
  }
  if (typeof val._seconds === 'number') {
    return new Date(val._seconds * 1000).toISOString().split('T')[0];
  }
  return '';
}

/**
 * Retorna a quantidade total de dias inclusivos entre duas datas (YYYY-MM-DD)
 */
export function countDaysBetween(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 1;
  const s = new Date(`${startStr.split('T')[0]}T00:00:00.000Z`);
  const e = new Date(`${endStr.split('T')[0]}T00:00:00.000Z`);
  const diffMs = e.getTime() - s.getTime();
  if (diffMs < 0) return 1;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Calcula dias transcorridos, total de dias e taxa de avanço temporal (pro-rata)
 */
export function calculateActualDaysElapsed(
  startDateStr: string,
  endDateStr: string,
  asOfDateStr?: string
): { daysElapsed: number; totalDays: number; elapsedRatio: number } {
  const totalDays = Math.max(1, countDaysBetween(startDateStr, endDateStr));
  const s = new Date(`${startDateStr.split('T')[0]}T00:00:00.000Z`);
  const e = new Date(`${endDateStr.split('T')[0]}T00:00:00.000Z`);
  const now = asOfDateStr
    ? new Date(`${asOfDateStr.split('T')[0]}T23:59:59.999Z`)
    : new Date();

  let daysElapsed = 0;

  if (now.getTime() < s.getTime()) {
    // Ainda não iniciou o período
    daysElapsed = 0;
  } else if (now.getTime() >= e.getTime()) {
    // Período concluído
    daysElapsed = totalDays;
  } else {
    // Em andamento
    const diffMs = now.getTime() - s.getTime();
    daysElapsed = Math.min(totalDays, Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1));
  }

  const elapsedRatio = zeroSafeDivide(daysElapsed, totalDays, 0);

  return {
    daysElapsed,
    totalDays,
    elapsedRatio: roundPercent(elapsedRatio)
  };
}

/**
 * Constrói o Baseline Snapshot Imutável para o Orçamento
 */
export function buildBudgetBaselineSnapshot(params: {
  orders: any[];
  expenses?: any[];
  investments?: any[];
  traffic?: any[];
  productCatalog: any[];
  sourceStartDate: string;
  sourceEndDate: string;
  budgetStartDate: string;
  budgetEndDate: string;
  asOfDate?: string;
}): BudgetBaselineSnapshot {
  const {
    orders = [],
    expenses = [],
    investments = [],
    traffic = [],
    productCatalog = [],
    sourceStartDate,
    sourceEndDate,
    budgetStartDate,
    budgetEndDate,
    asOfDate
  } = params;

  const sStart = sourceStartDate.split('T')[0];
  const sEnd = sourceEndDate.split('T')[0];

  // Filtrar pedidos estritamente pelo intervalo de amostragem
  const filteredOrders = orders.filter(o => {
    if (!o) return false;
    const paymentStatus = o.paymentStatus || o.status;
    if (['cancelled', 'refunded', 'rejected', 'pending'].includes(paymentStatus)) {
      return false;
    }
    const orderDate = extractOrderDateString(o);
    return orderDate >= sStart && orderDate <= sEnd;
  });

  // Filtrar despesas, tráfego e investimentos estritamente pelo intervalo de amostragem (sem registros sem data)
  const filteredExpenses = expenses.filter(e => {
    const d = extractEntryDateString(e);
    return Boolean(d) && d >= sStart && d <= sEnd;
  });
  const filteredTraffic = traffic.filter(t => {
    const d = extractEntryDateString(t);
    return Boolean(d) && d >= sStart && d <= sEnd;
  });
  const filteredInvestments = investments.filter(i => {
    const d = extractEntryDateString(i);
    return Boolean(d) && d >= sStart && d <= sEnd;
  });

  const sampleDaysCount = countDaysBetween(sStart, sEnd);
  const sampleOrdersCount = filteredOrders.length;

  const ordersProf = filteredOrders.map(o => calculateOrderProfitability(o, productCatalog));
  const stats = calculateProfitabilityOverviewStats(ordersProf);
  const dre = calculateFinancialDRE(filteredOrders, filteredExpenses, filteredInvestments, filteredTraffic, productCatalog);

  const realizedUnits = filteredOrders.reduce((sum, o) => {
    const items = o.items || [];
    return sum + items.reduce((iSum: number, item: any) => iSum + (Number(item.quantity) || 1), 0);
  }, 0);

  const realizedAverageTicket = sampleOrdersCount > 0
    ? roundMoney(stats.netRevenue / sampleOrdersCount)
    : 0;

  const cogs = roundMoney(stats.cogs || (stats as any).totalCogs || 0);
  const gatewayFees = roundMoney(stats.gatewayFees || (stats as any).totalGatewayCosts || 0);
  const shippingSubsidy = roundMoney(stats.shippingSubsidy || (stats as any).totalShippingCosts || 0);
  const orderOtherVariableCosts = roundMoney(stats.otherVariableCosts || 0);
  const orderVariableCosts = roundMoney(gatewayFees + shippingSubsidy + orderOtherVariableCosts);
  const adminVariableExpenses = roundMoney(dre.variableExpenses || 0);
  const totalVariableCosts = roundMoney(orderVariableCosts + adminVariableExpenses);

  const confidenceDetails = evaluateBudgetConfidence(filteredOrders, productCatalog, sampleDaysCount);

  return {
    isHistoricalSnapshot: true,
    snapshotCapturedAt: asOfDate || new Date().toISOString(),
    snapshotVersion: '1.0',
    sourceStartDate: sStart,
    sourceEndDate: sEnd,
    budgetStartDate: budgetStartDate.split('T')[0],
    budgetEndDate: budgetEndDate.split('T')[0],
    sampleOrdersCount,
    sampleDaysCount,
    realizedRevenue: roundMoney(stats.netRevenue),
    realizedOrders: sampleOrdersCount,
    realizedUnits,
    realizedContributionMargin: roundMoney(stats.contributionMargin),
    realizedOperatingProfit: roundMoney(dre.operatingProfit),
    realizedAverageTicket,
    cogs,
    variableCosts: totalVariableCosts,
    gatewayFees,
    shippingSubsidy,
    fixedExpenses: roundMoney(dre.fixedExpenses || 0),
    trafficExpenses: roundMoney(dre.marketingExpenses || (dre as any).trafficInvestments || 0),
    costCoveragePercent: confidenceDetails.costCoveragePercent
  };
}

/**
 * Calcula a divisão pro-rata do Orçamento para o período transcorrido (Budget To-Date)
 */
export function calculateBudgetToDateProRata(
  budget: {
    targetRevenue: number;
    targetOperatingProfit: number;
    targetContributionMargin: number;
    targetOrders: number;
    targetUnits: number;
    allocations: CommercialBudgetAllocations;
  },
  daysElapsed: number,
  totalDays: number
): BudgetToDateProRata {
  const ratio = totalDays > 0 ? Math.min(1, Math.max(0, daysElapsed / totalDays)) : 0;
  const alloc = normalizeBudgetAllocations(budget.allocations);

  return {
    daysElapsed,
    totalDays,
    elapsedRatio: roundPercent(ratio * 100),
    revenueToDate: roundMoney(budget.targetRevenue * ratio),
    cogsToDate: roundMoney(alloc.cogsBudget * ratio),
    trafficToDate: roundMoney(alloc.trafficBudget * ratio),
    fixedExpensesToDate: roundMoney(alloc.fixedExpensesBudget * ratio),
    variableExpensesToDate: roundMoney(alloc.administrativeVariableExpensesBudget! * ratio),
    shippingSubsidyToDate: roundMoney((alloc.shippingSubsidyBudget || 0) * ratio),
    gatewayFeesToDate: roundMoney((alloc.gatewayFeesBudget || 0) * ratio),
    totalExpensesToDate: roundMoney(alloc.totalExpensesBudget * ratio),
    contributionMarginToDate: roundMoney(budget.targetContributionMargin * ratio),
    operatingProfitToDate: roundMoney(budget.targetOperatingProfit * ratio),
    ordersToDate: Math.round(budget.targetOrders * ratio),
    unitsToDate: Math.round(budget.targetUnits * ratio)
  };
}

/**
 * Calcula os Realizados Atuais (BudgetCurrentActuals) no período de vigência do Orçamento
 */
export function calculateBudgetCurrentActuals(params: {
  orders: any[];
  expenses?: any[];
  investments?: any[];
  traffic?: any[];
  productCatalog: any[];
  budgetStartDate: string;
  budgetEndDate: string;
  asOfDate?: string;
}): BudgetCurrentActuals {
  const {
    orders = [],
    expenses = [],
    investments = [],
    traffic = [],
    productCatalog = [],
    budgetStartDate,
    budgetEndDate,
    asOfDate
  } = params;

  const bStart = budgetStartDate.split('T')[0];
  const bEnd = budgetEndDate.split('T')[0];
  const asOf = asOfDate ? asOfDate.split('T')[0] : new Date().toISOString().split('T')[0];
  const totalDays = Math.max(1, countDaysBetween(bStart, bEnd));

  // Se a data de corte for anterior ao início do orçamento, o realizado to-date é estritamente zero
  if (asOf < bStart) {
    return {
      revenue: 0,
      orders: 0,
      ordersCount: 0,
      units: 0,
      averageTicket: 0,
      cogs: 0,
      gatewayFees: 0,
      shippingSubsidy: 0,
      administrativeVariableExpenses: 0,
      variableCosts: 0,
      fixedExpenses: 0,
      trafficExpenses: 0,
      otherExpenses: 0,
      totalExpenses: 0,
      contributionMargin: 0,
      contributionMarginPercent: 0,
      operatingProfit: 0,
      operatingProfitPercent: 0,
      costCoveragePercent: 0,
      daysElapsed: 0,
      totalDays,
      elapsedRatio: 0,
      calculatedAt: asOfDate || new Date().toISOString()
    };
  }

  // Limite efetivo para considerar dados é o menor entre o fim do orçamento e a data de corte (asOf)
  const effectiveCutoff = asOf > bEnd ? bEnd : asOf;

  const filteredOrders = orders.filter(o => {
    if (!o) return false;
    const paymentStatus = o.paymentStatus || o.status;
    if (['cancelled', 'refunded', 'rejected', 'pending'].includes(paymentStatus)) {
      return false;
    }
    const orderDate = extractOrderDateString(o);
    return orderDate >= bStart && orderDate <= effectiveCutoff;
  });

  // Filtrar despesas, tráfego e investimentos estritamente pela janela [bStart, effectiveCutoff] (sem registros sem data)
  const filteredExpenses = expenses.filter(e => {
    const d = extractEntryDateString(e);
    return Boolean(d) && d >= bStart && d <= effectiveCutoff;
  });
  const filteredTraffic = traffic.filter(t => {
    const d = extractEntryDateString(t);
    return Boolean(d) && d >= bStart && d <= effectiveCutoff;
  });
  const filteredInvestments = investments.filter(i => {
    const d = extractEntryDateString(i);
    return Boolean(d) && d >= bStart && d <= effectiveCutoff;
  });

  const ordersProf = filteredOrders.map(o => calculateOrderProfitability(o, productCatalog));
  const stats = calculateProfitabilityOverviewStats(ordersProf);
  const dre = calculateFinancialDRE(filteredOrders, filteredExpenses, filteredInvestments, filteredTraffic, productCatalog);

  const units = filteredOrders.reduce((sum, o) => {
    const items = o.items || [];
    return sum + items.reduce((iSum: number, item: any) => iSum + (Number(item.quantity) || 1), 0);
  }, 0);

  const ordersCount = filteredOrders.length;
  const averageTicket = ordersCount > 0 ? roundMoney(stats.netRevenue / ordersCount) : 0;

  const cogs = roundMoney(stats.cogs || (stats as any).totalCogs || 0);
  const gatewayFees = roundMoney(stats.gatewayFees || (stats as any).totalGatewayCosts || 0);
  const shippingSubsidy = roundMoney(stats.shippingSubsidy || (stats as any).totalShippingCosts || 0);
  const orderOtherVariableCosts = roundMoney(stats.otherVariableCosts || 0);
  const orderVariableCosts = roundMoney(gatewayFees + shippingSubsidy + orderOtherVariableCosts);
  const adminVariableExpenses = roundMoney(dre.variableExpenses || 0);
  const variableCosts = roundMoney(orderVariableCosts + adminVariableExpenses);

  const fixedExpenses = roundMoney(dre.fixedExpenses || 0);
  const trafficExpenses = roundMoney(dre.marketingExpenses || (dre as any).trafficInvestments || 0);
  const otherExpenses = roundMoney(dre.otherExpenses || 0);

  // Total de despesas canônico sem dupla contagem de COGS
  const totalExpenses = roundMoney(
    cogs +
    orderVariableCosts +
    adminVariableExpenses +
    fixedExpenses +
    trafficExpenses +
    otherExpenses
  );

  // Margem de Contribuição Canônica: Receita - COGS - Taxas Gateway - Frete Subsidiado - Outros Custos Variáveis do Pedido
  const contributionMargin = roundMoney(
    stats.netRevenue - cogs - gatewayFees - shippingSubsidy - orderOtherVariableCosts
  );

  // Lucro Operacional Canônico: CM - Despesas Variáveis Administrativas - Despesas Fixas - Marketing (Tráfego) - Outras Despesas
  const operatingProfit = calculateOperatingResult({
    contributionMargin,
    administrativeVariableExpenses: adminVariableExpenses,
    fixedExpenses,
    marketingExpenses: trafficExpenses,
    otherExpenses
  });

  const { daysElapsed, elapsedRatio } = calculateActualDaysElapsed(bStart, bEnd, asOfDate);

  const cmPercent = stats.netRevenue > 0
    ? roundPercent((contributionMargin / stats.netRevenue) * 100)
    : 0;

  const opPercent = stats.netRevenue > 0
    ? roundPercent((operatingProfit / stats.netRevenue) * 100)
    : 0;

  const confidenceDetails = evaluateBudgetConfidence(filteredOrders, productCatalog, countDaysBetween(bStart, effectiveCutoff));

  return {
    revenue: roundMoney(stats.netRevenue),
    orders: ordersCount,
    ordersCount,
    units,
    averageTicket,
    cogs,
    gatewayFees,
    shippingSubsidy,
    administrativeVariableExpenses: adminVariableExpenses,
    variableCosts,
    fixedExpenses,
    trafficExpenses,
    otherExpenses,
    totalExpenses,
    contributionMargin,
    contributionMarginPercent: cmPercent,
    operatingProfit,
    operatingProfitPercent: opPercent,
    costCoveragePercent: confidenceDetails.costCoveragePercent,
    daysElapsed,
    totalDays,
    elapsedRatio,
    calculatedAt: asOfDate || new Date().toISOString()
  };
}

/**
 * Cria métrica comparativa de variância
 */
function buildVarianceMetric(
  metric: string,
  budgeted: number,
  budgetedToDate: number,
  realized: number,
  isExpense: boolean = false
): BudgetVarianceMetric {
  const delta = roundMoney(realized - budgetedToDate);
  const variancePercent = budgetedToDate > 0
    ? roundPercent((delta / budgetedToDate) * 100)
    : (realized > 0 ? 100 : 0);

  // Para despesa, se realized <= budgetedToDate, é favorável
  // Para receita/lucro, se realized >= budgetedToDate, é favorável
  let isFavorable = isExpense ? realized <= budgetedToDate : realized >= budgetedToDate;
  
  // Status
  let status: 'favorable' | 'neutral' | 'unfavorable' = 'neutral';
  if (Math.abs(variancePercent) < 2) {
    status = 'neutral';
  } else if (isFavorable) {
    status = 'favorable';
  } else {
    status = 'unfavorable';
  }

  return {
    metric,
    metricName: metric,
    budgeted: roundMoney(budgeted),
    benchmark: roundMoney(budgeted),
    budget: roundMoney(realized),
    budgetedToDate: roundMoney(budgetedToDate),
    realized: roundMoney(realized),
    delta,
    variancePercent,
    isFavorable,
    status
  };
}

/**
 * Avalia guardrails e gera alertas críticos / warnings
 */
export function evaluateBudgetGuardrails(
  guardrails: CommercialBudgetGuardrails,
  actuals: BudgetCurrentActuals,
  toDate: BudgetToDateProRata
): BudgetGuardrailAlert[] {
  const alerts: BudgetGuardrailAlert[] = [];

  const actualRevenue = actuals?.revenue || 0;
  const trafficExp = actuals?.trafficExpenses !== undefined ? actuals.trafficExpenses : ((actuals as any)?.traffic || 0);
  const cm = actuals?.contributionMargin !== undefined ? actuals.contributionMargin : 0;
  const cmPercent = actuals?.contributionMarginPercent !== undefined
    ? actuals.contributionMarginPercent
    : (actualRevenue > 0 ? roundPercent((cm / actualRevenue) * 100) : 0);
  const cogsExp = actuals?.cogs !== undefined ? actuals.cogs : 0;
  const totalExp = actuals?.totalExpenses !== undefined ? actuals.totalExpenses : 0;
  const op = actuals?.operatingProfit !== undefined ? actuals.operatingProfit : (actualRevenue - totalExp);
  const totalExpToDate = toDate?.totalExpensesToDate !== undefined
    ? toDate.totalExpensesToDate
    : ((toDate as any)?.budgetTotalExpensesToDate !== undefined ? (toDate as any).budgetTotalExpensesToDate : 0);

  // 1. Gasto de Tráfego % da Receita
  if (guardrails.maxTrafficSpendPercentOfRevenue !== undefined && actualRevenue > 0) {
    const trafficPercent = (trafficExp / actualRevenue) * 100;
    if (trafficPercent > guardrails.maxTrafficSpendPercentOfRevenue) {
      alerts.push({
        id: `alert_traffic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        guardrailType: 'traffic_exceeded',
        type: 'max_traffic_exceeded' as any,
        severity: trafficPercent > guardrails.maxTrafficSpendPercentOfRevenue * 1.25 ? 'critical' : 'warning',
        message: `Investimento em tráfego (${trafficPercent.toFixed(1)}%) ultrapassou o teto permitido de ${guardrails.maxTrafficSpendPercentOfRevenue}% da receita.`,
        currentValue: roundPercent(trafficPercent),
        thresholdValue: guardrails.maxTrafficSpendPercentOfRevenue,
        triggeredAt: new Date().toISOString()
      });
    }
  }

  // 2. Margem de Contribuição Mínima
  if (guardrails.minContributionMarginPercent !== undefined && actualRevenue > 0) {
    if (cmPercent < guardrails.minContributionMarginPercent) {
      alerts.push({
        id: `alert_margin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        guardrailType: 'margin_below_threshold',
        type: 'min_cm_breached' as any,
        severity: cmPercent < guardrails.minContributionMarginPercent * 0.8 ? 'critical' : 'warning',
        message: `Margem de contribuição atual (${cmPercent.toFixed(1)}%) está abaixo do piso de governança de ${guardrails.minContributionMarginPercent}%.`,
        currentValue: cmPercent,
        thresholdValue: guardrails.minContributionMarginPercent,
        triggeredAt: new Date().toISOString()
      });
    }
  }

  // 3. COGS Máximo % da Receita
  if (guardrails.maxCogsPercentOfRevenue !== undefined && actualRevenue > 0) {
    const cogsPercent = (cogsExp / actualRevenue) * 100;
    if (cogsPercent > guardrails.maxCogsPercentOfRevenue) {
      alerts.push({
        id: `alert_cogs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        guardrailType: 'cogs_exceeded',
        type: 'max_cogs_exceeded' as any,
        severity: 'warning',
        message: `Custo de Mercadorias (COGS) (${cogsPercent.toFixed(1)}%) superou o teto de ${guardrails.maxCogsPercentOfRevenue}% da receita.`,
        currentValue: roundPercent(cogsPercent),
        thresholdValue: guardrails.maxCogsPercentOfRevenue,
        triggeredAt: new Date().toISOString()
      });
    }
  }

  // 4. Burn Rate / Consumo Total de Despesas vs Orçamento Pro-Rata
  if (guardrails.burnRateAlertThresholdPercent !== undefined && totalExpToDate > 0) {
    const burnRatePercent = (totalExp / totalExpToDate) * 100;
    if (burnRatePercent > guardrails.burnRateAlertThresholdPercent) {
      alerts.push({
        id: `alert_burn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        guardrailType: 'burn_rate_exceeded',
        type: 'burn_rate_warning' as any,
        severity: burnRatePercent > 130 ? 'critical' : 'warning',
        message: `Taxa de consumo de despesas (Burn Rate: ${burnRatePercent.toFixed(1)}%) está acima do limite pro-rata (${guardrails.burnRateAlertThresholdPercent}%).`,
        currentValue: roundPercent(burnRatePercent),
        thresholdValue: guardrails.burnRateAlertThresholdPercent,
        triggeredAt: new Date().toISOString()
      });
    }
  }

  // 5. Prejuízo Operacional
  if (op < 0 && actualRevenue > 0) {
    alerts.push({
      id: `alert_op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      guardrailType: 'unfavorable_operating_profit',
      type: 'operating_loss' as any,
      severity: 'critical',
      message: `Lucro operacional realizado negativo (R$ ${op.toFixed(2)}) no período atual.`,
      currentValue: op,
      thresholdValue: 0,
      triggeredAt: new Date().toISOString()
    });
  }

  return alerts;
}

/**
 * Avalia Alertas de Desvio Orçamentário (Variance Alerts) to-date
 */
export function evaluateBudgetVarianceAlerts(
  actuals: BudgetCurrentActuals,
  toDate: BudgetToDateProRata,
  confidence?: BudgetConfidenceDetails
): BudgetVarianceAlert[] {
  const alerts: BudgetVarianceAlert[] = [];
  const nowIso = new Date().toISOString();

  // 1. REVENUE_BELOW_BUDGET
  if (toDate.revenueToDate > 0 && actuals.revenue < toDate.revenueToDate * 0.85) {
    const delta = roundMoney(actuals.revenue - toDate.revenueToDate);
    const variancePercent = roundPercent((delta / toDate.revenueToDate) * 100);
    alerts.push({
      id: `var_rev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'REVENUE_BELOW_BUDGET',
      severity: actuals.revenue < toDate.revenueToDate * 0.7 ? 'critical' : 'warning',
      message: `Receita realizada (R$ ${actuals.revenue.toFixed(2)}) está ${Math.abs(variancePercent).toFixed(1)}% abaixo do orçado pro-rata to-date (R$ ${toDate.revenueToDate.toFixed(2)}).`,
      currentValue: actuals.revenue,
      budgetedValue: toDate.revenueToDate,
      variancePercent,
      recommendation: 'Revisar conversão de vendas e intensificar campanhas de tração comercial.',
      triggeredAt: nowIso
    });
  }

  // 2. MARKETING_OVER_BUDGET
  if (toDate.trafficToDate > 0 && actuals.trafficExpenses > toDate.trafficToDate * 1.15) {
    const delta = roundMoney(actuals.trafficExpenses - toDate.trafficToDate);
    const variancePercent = roundPercent((delta / toDate.trafficToDate) * 100);
    alerts.push({
      id: `var_mkt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'MARKETING_OVER_BUDGET',
      severity: actuals.trafficExpenses > toDate.trafficToDate * 1.3 ? 'critical' : 'warning',
      message: `Investimento em marketing (R$ ${actuals.trafficExpenses.toFixed(2)}) superou o orçado to-date em ${variancePercent.toFixed(1)}%.`,
      currentValue: actuals.trafficExpenses,
      budgetedValue: toDate.trafficToDate,
      variancePercent,
      recommendation: 'Ajustar lances diários e pausar campanhas com ROAS abaixo do ponto de equilíbrio.',
      triggeredAt: nowIso
    });
  }

  // 3. COGS_OVER_BUDGET
  if (toDate.cogsToDate > 0 && actuals.cogs > toDate.cogsToDate * 1.15) {
    const delta = roundMoney(actuals.cogs - toDate.cogsToDate);
    const variancePercent = roundPercent((delta / toDate.cogsToDate) * 100);
    alerts.push({
      id: `var_cogs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'COGS_OVER_BUDGET',
      severity: actuals.cogs > toDate.cogsToDate * 1.3 ? 'critical' : 'warning',
      message: `Custo de mercadorias (R$ ${actuals.cogs.toFixed(2)}) está ${variancePercent.toFixed(1)}% acima do orçado to-date.`,
      currentValue: actuals.cogs,
      budgetedValue: toDate.cogsToDate,
      variancePercent,
      recommendation: 'Revisar mix de produtos vendidos e renegociar custos de reposição.',
      triggeredAt: nowIso
    });
  }

  // 4. CONTRIBUTION_MARGIN_BELOW_BUDGET
  if (toDate.contributionMarginToDate > 0 && actuals.contributionMargin < toDate.contributionMarginToDate * 0.85) {
    const delta = roundMoney(actuals.contributionMargin - toDate.contributionMarginToDate);
    const variancePercent = roundPercent((delta / toDate.contributionMarginToDate) * 100);
    alerts.push({
      id: `var_cm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'CONTRIBUTION_MARGIN_BELOW_BUDGET',
      severity: actuals.contributionMargin < toDate.contributionMarginToDate * 0.7 ? 'critical' : 'warning',
      message: `Margem de contribuição (R$ ${actuals.contributionMargin.toFixed(2)}) está ${Math.abs(variancePercent).toFixed(1)}% abaixo do orçado to-date.`,
      currentValue: actuals.contributionMargin,
      budgetedValue: toDate.contributionMarginToDate,
      variancePercent,
      recommendation: 'Reduzir descontos comerciais agressivos e otimizar custos de frete/gateway.',
      triggeredAt: nowIso
    });
  }

  // 5. OPERATING_PROFIT_BELOW_BUDGET
  if (toDate.operatingProfitToDate > 0 && actuals.operatingProfit < toDate.operatingProfitToDate * 0.85) {
    const delta = roundMoney(actuals.operatingProfit - toDate.operatingProfitToDate);
    const variancePercent = roundPercent((delta / toDate.operatingProfitToDate) * 100);
    alerts.push({
      id: `var_op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'OPERATING_PROFIT_BELOW_BUDGET',
      severity: actuals.operatingProfit <= 0 ? 'critical' : 'warning',
      message: `Lucro operacional (R$ ${actuals.operatingProfit.toFixed(2)}) está ${Math.abs(variancePercent).toFixed(1)}% abaixo do orçado to-date.`,
      currentValue: actuals.operatingProfit,
      budgetedValue: toDate.operatingProfitToDate,
      variancePercent,
      recommendation: 'Controle rigoroso de despesas fixas e revisão imediata do plano de gastos.',
      triggeredAt: nowIso
    });
  }

  // 6. LOW_COST_COVERAGE
  const coverage = confidence?.costCoveragePercent ?? actuals.costCoveragePercent;
  if (coverage < 80) {
    alerts.push({
      id: `var_cov_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      type: 'LOW_COST_COVERAGE',
      severity: coverage < 50 ? 'critical' : 'warning',
      message: `Cobertura de custos cadastrados está em ${coverage.toFixed(0)}% (abaixo do limiar confiável de 80%).`,
      currentValue: coverage,
      budgetedValue: 80,
      variancePercent: roundPercent(((coverage - 80) / 80) * 100),
      recommendation: 'Cadastrar os custos unitários no catálogo de produtos para eliminar estimativas.',
      triggeredAt: nowIso
    });
  }

  return alerts;
}

/**
 * Constrói a reconciliação analítica completa (Real vs Budget, Budget vs Forecast, Budget vs Goal)
 */
export function evaluateBudgetReconciliation(params: {
  budget: {
    targetRevenue: number;
    targetOperatingProfit: number;
    targetContributionMargin: number;
    targetOrders: number;
    targetUnits: number;
    targetAverageTicket?: number;
    allocations: CommercialBudgetAllocations;
    guardrails: CommercialBudgetGuardrails;
  };
  actuals: BudgetCurrentActuals;
  toDate: BudgetToDateProRata;
  forecast?: CommercialForecast;
  goal?: CommercialGoal;
  goals?: CommercialGoal[];
  confidence?: BudgetConfidenceDetails;
}): BudgetReconciliation {
  const { budget, actuals, toDate, forecast, goal, goals, confidence } = params;
  const alloc = normalizeBudgetAllocations(budget.allocations);

  const revenueVariance = buildVarianceMetric('Receita Líquida', budget.targetRevenue, toDate.revenueToDate, actuals.revenue, false);
  const expenseVariance = buildVarianceMetric('Despesas Totais', alloc.totalExpensesBudget, toDate.totalExpensesToDate, actuals.totalExpenses, true);
  const cogsVariance = buildVarianceMetric('COGS (Custo de Mercadorias)', alloc.cogsBudget, toDate.cogsToDate, actuals.cogs, true);
  const trafficVariance = buildVarianceMetric('Tráfego Pago & Marketing', alloc.trafficBudget, toDate.trafficToDate, actuals.trafficExpenses, true);
  const fixedExpensesVariance = buildVarianceMetric('Despesas Fixas', alloc.fixedExpensesBudget, toDate.fixedExpensesToDate, actuals.fixedExpenses, true);
  const variableExpensesVariance = buildVarianceMetric(
    'Despesas Variáveis',
    alloc.administrativeVariableExpensesBudget!,
    toDate.variableExpensesToDate,
    actuals.administrativeVariableExpenses !== undefined ? actuals.administrativeVariableExpenses : (actuals.variableCosts || 0),
    true
  );
  const contributionMarginVariance = buildVarianceMetric('Margem de Contribuição', budget.targetContributionMargin, toDate.contributionMarginToDate, actuals.contributionMargin, false);
  const operatingProfitVariance = buildVarianceMetric('Lucro Operacional', budget.targetOperatingProfit, toDate.operatingProfitToDate, actuals.operatingProfit, false);

  const realVsBudget: BudgetVarianceMetric[] = [
    revenueVariance,
    contributionMarginVariance,
    operatingProfitVariance,
    expenseVariance,
    cogsVariance,
    trafficVariance,
    fixedExpensesVariance,
    variableExpensesVariance
  ];

  let budgetVsForecast: BudgetVarianceMetric[] | undefined;
  if (forecast) {
    budgetVsForecast = [
      buildVarianceMetric('Receita (Budget vs Forecast)', budget.targetRevenue, budget.targetRevenue, forecast.projectedRevenue, false),
      buildVarianceMetric('Margem de Contribuição (Budget vs Forecast)', budget.targetContributionMargin, budget.targetContributionMargin, forecast.projectedContributionMargin, false),
      buildVarianceMetric('Lucro Operacional (Budget vs Forecast)', budget.targetOperatingProfit, budget.targetOperatingProfit, forecast.projectedOperatingProfit, false)
    ];
  }

  let budgetVsGoal: BudgetVarianceMetric[] | undefined;
  const allGoals: CommercialGoal[] = goals && goals.length > 0 ? goals : (goal ? [goal] : []);

  if (allGoals.length > 0) {
    budgetVsGoal = allGoals.map(g => {
      let goalBudgeted = budget.targetRevenue;
      let metricName = `Meta de Receita`;

      switch (g.type as string) {
        case 'revenue':
          goalBudgeted = budget.targetRevenue;
          metricName = 'Meta de Receita';
          break;
        case 'profit':
        case 'operating_profit':
          goalBudgeted = budget.targetOperatingProfit;
          metricName = 'Meta de Lucro Operacional';
          break;
        case 'contribution_margin':
          // Contribution Margin é monetária (R$)
          goalBudgeted = budget.targetContributionMargin;
          metricName = 'Meta de Margem de Contribuição (R$)';
          break;
        case 'margin_percent':
          // Margin Percent é percentual (%)
          goalBudgeted = budget.targetContributionMargin > 0 && budget.targetRevenue > 0
            ? roundPercent((budget.targetContributionMargin / budget.targetRevenue) * 100)
            : 0;
          metricName = 'Meta de Margem %';
          break;
        case 'orders':
          goalBudgeted = budget.targetOrders || 0;
          metricName = 'Meta de Pedidos';
          break;
        case 'units':
          goalBudgeted = budget.targetUnits || 0;
          metricName = 'Meta de Unidades';
          break;
        case 'average_ticket':
          goalBudgeted = budget.targetAverageTicket || (budget.targetOrders > 0
            ? roundMoney(budget.targetRevenue / budget.targetOrders)
            : 0);
          metricName = 'Meta de Ticket Médio';
          break;
        default:
          goalBudgeted = budget.targetRevenue;
          metricName = `Meta (${(g as any).type || 'Comercial'})`;
      }

      return buildVarianceMetric(metricName, goalBudgeted, goalBudgeted, g.targetValue, false);
    });
  }

  const alerts = evaluateBudgetGuardrails(budget.guardrails, actuals, toDate);
  const varianceAlerts = evaluateBudgetVarianceAlerts(actuals, toDate, confidence);

  return {
    budgetToDate: toDate,
    realVsBudget,
    budgetVsForecast,
    budgetVsGoal,
    revenueVariance,
    expenseVariance,
    cogsVariance,
    trafficVariance,
    fixedExpensesVariance,
    variableExpensesVariance,
    contributionMarginVariance,
    operatingProfitVariance,
    alerts,
    varianceAlerts,
    reconciledAt: new Date().toISOString()
  };
}

/**
 * Avalia nível de confiança e qualidade dos dados de custo
 */
export function evaluateBudgetConfidence(
  orders: any[],
  productCatalog: any[],
  totalDays: number
): BudgetConfidenceDetails {
  const sampleSize = orders.length;
  const reasons: string[] = [];

  const breakdown: BudgetCostSourceBreakdown = {
    snapshotUnits: 0,
    catalogUnits: 0,
    estimatedUnits: 0,
    missingUnits: 0
  };

  let totalUnits = 0;
  let coveredUnits = 0;

  orders.forEach(o => {
    const items = o.items && Array.isArray(o.items) ? o.items : [];
    items.forEach((item: any) => {
      const qty = Math.max(1, Number(item.quantity) || 1);
      totalUnits += qty;
      const costInfo = getOrderItemCost(item, productCatalog);
      if (costInfo.isSnapshot) {
        breakdown.snapshotUnits += qty;
        coveredUnits += qty;
      } else if (costInfo.costCoverage === 'complete') {
        breakdown.catalogUnits += qty;
        coveredUnits += qty;
      } else if (costInfo.isEstimated) {
        breakdown.estimatedUnits += qty;
      } else {
        breakdown.missingUnits += qty;
      }
    });
  });

  const costCoveragePercent = totalUnits > 0
    ? roundPercent((coveredUnits / totalUnits) * 100)
    : (sampleSize === 0 ? 0 : 100);

  let level: BudgetConfidenceLevel = 'high';
  let score = 95;

  if (sampleSize === 0) {
    return {
      level: 'insufficient',
      score: 0,
      sampleSize: 0,
      costCoveragePercent: 0,
      timeHorizonDays: totalDays,
      costSourceBreakdown: breakdown,
      reasons: ['Nenhum pedido encontrado no período analisado.']
    };
  }

  if (costCoveragePercent === 0) {
    level = 'insufficient';
    score = 15;
    reasons.push('Nenhum custo real ou histórico mapeado nos produtos vendidos.');
  } else if (costCoveragePercent < 50) {
    level = 'low';
    score = Math.min(score, 40);
    reasons.push(`Baixa cobertura de custos nos produtos cadastrados (${costCoveragePercent.toFixed(0)}%).`);
  } else if (costCoveragePercent < 80) {
    level = 'medium';
    score = Math.min(score, 70);
    reasons.push(`Cobertura parcial de custos (${costCoveragePercent.toFixed(0)}%).`);
  }

  if (sampleSize < 5) {
    if (level !== 'insufficient') level = 'low';
    score = Math.min(score, 45);
    reasons.push(`Volume amostral muito reduzido (${sampleSize} pedidos).`);
  } else if (sampleSize < 15) {
    if (level === 'high') level = 'medium';
    score = Math.min(score, 65);
    reasons.push(`Volume amostral reduzido (${sampleSize} pedidos).`);
  }

  return {
    level,
    score,
    sampleSize,
    costCoveragePercent,
    timeHorizonDays: totalDays,
    costSourceBreakdown: breakdown,
    reasons
  };
}

/**
 * Gera alocações orçamentárias por linha de produto (FORCE, MARK, PRIME, OTHER)
 * com cálculo de resíduo exato de centavos (0 centavos de divergência).
 */
export function generateCommercialBudgetLineAllocations(params: {
  targetRevenue: number;
  cogsBudget: number;
  targetContributionMargin: number;
  targetUnits: number;
  method?: LineAllocationMethod;
  customLineAllocations?: CommercialBudgetLineAllocation[];
  productCatalog?: any[];
  baselineOrders?: any[];
}): { lineAllocations: CommercialBudgetLineAllocation[]; lineAllocationMethod: LineAllocationMethod } {
  const method: LineAllocationMethod = params.method || 'revenue_proportional';
  const lines: Array<'FORCE' | 'MARK' | 'PRIME' | 'OTHER'> = ['FORCE', 'MARK', 'PRIME', 'OTHER'];
  const totalRevenue = roundMoney(params.targetRevenue);
  const totalCogs = roundMoney(params.cogsBudget);
  const totalCM = roundMoney(params.targetContributionMargin);
  const totalUnits = Math.max(0, Math.round(params.targetUnits));

  if (method === 'manual' && params.customLineAllocations && params.customLineAllocations.length > 0) {
    let runningRev = 0;
    let runningCogs = 0;
    let runningCM = 0;
    let runningUnits = 0;

    const allocations: CommercialBudgetLineAllocation[] = lines.map((line, idx) => {
      const isLast = idx === lines.length - 1;
      const found = params.customLineAllocations?.find(a => a.line === line);
      const rev = found ? roundMoney(found.targetRevenue) : 0;
      const cogs = found ? roundMoney(found.targetCogs) : 0;
      const cm = found ? roundMoney(found.targetContributionMargin) : 0;
      const units = found ? Math.round(found.targetUnits) : 0;

      if (!isLast) {
        runningRev = roundMoney(runningRev + rev);
        runningCogs = roundMoney(runningCogs + cogs);
        runningCM = roundMoney(runningCM + cm);
        runningUnits += units;
        const pct = totalRevenue > 0 ? roundPercent((rev / totalRevenue) * 100) : 0;
        return {
          line,
          targetRevenue: rev,
          targetRevenuePercent: pct,
          targetCogs: cogs,
          targetContributionMargin: cm,
          targetUnits: units
        };
      } else {
        const finalRev = roundMoney(totalRevenue - runningRev);
        const finalCogs = roundMoney(totalCogs - runningCogs);
        const finalCM = roundMoney(totalCM - runningCM);
        const finalUnits = Math.max(0, totalUnits - runningUnits);
        const pct = totalRevenue > 0 ? roundPercent((finalRev / totalRevenue) * 100) : 0;
        return {
          line,
          targetRevenue: finalRev,
          targetRevenuePercent: pct,
          targetCogs: finalCogs,
          targetContributionMargin: finalCM,
          targetUnits: finalUnits
        };
      }
    });

    return { lineAllocations: allocations, lineAllocationMethod: 'manual' };
  }

  let weights: Record<'FORCE' | 'MARK' | 'PRIME' | 'OTHER', number>;

  if (method === 'equal_split') {
    weights = {
      FORCE: 0.25,
      MARK: 0.25,
      PRIME: 0.25,
      OTHER: 0.25
    };
  } else if (method === 'historical_mix') {
    if (!params.baselineOrders || params.baselineOrders.length === 0) {
      throw new Error('INSUFFICIENT_BASELINE_DATA_FOR_PROPORTIONAL_ALLOCATION: Não há pedidos na base histórica para calcular mix histórico.');
    }
    const ordersProf = params.baselineOrders.map(o => calculateOrderProfitability(o, params.productCatalog || []));
    const prodsProf = calculateProductProfitability(params.baselineOrders, params.productCatalog || []);
    const lineStats = aggregateProfitabilityByLine(prodsProf, ordersProf);

    let totalGrossRev = 0;
    const lineGrossMap: Record<string, number> = { FORCE: 0, MARK: 0, PRIME: 0, OTHER: 0 };

    lineStats.forEach(ls => {
      const key = (ls.lineName || (ls as any).line || '').toUpperCase();
      if (key in lineGrossMap) {
        lineGrossMap[key] = (lineGrossMap[key] || 0) + (ls.grossRevenue || 0);
        totalGrossRev += (ls.grossRevenue || 0);
      }
    });

    if (totalGrossRev <= 0) {
      throw new Error('INSUFFICIENT_BASELINE_DATA_FOR_PROPORTIONAL_ALLOCATION: Receita bruta histórica zerada para cálculo de mix.');
    }

    weights = {
      FORCE: lineGrossMap.FORCE / totalGrossRev,
      MARK: lineGrossMap.MARK / totalGrossRev,
      PRIME: lineGrossMap.PRIME / totalGrossRev,
      OTHER: lineGrossMap.OTHER / totalGrossRev
    };
  } else if (method === 'revenue_proportional') {
    if (!params.baselineOrders || params.baselineOrders.length === 0) {
      throw new Error('INSUFFICIENT_BASELINE_DATA_FOR_PROPORTIONAL_ALLOCATION: Não há pedidos na base histórica para calcular proporção de receita.');
    }
    const lineSums: Record<string, number> = { FORCE: 0, MARK: 0, PRIME: 0, OTHER: 0 };
    let totalBaselineRev = 0;

    params.baselineOrders.forEach(order => {
      const items = order.items && Array.isArray(order.items) ? order.items : [];
      items.forEach((item: any) => {
        const name = String(item.name || item.slug || '').toUpperCase();
        let itemLine = 'OTHER';
        if (name.includes('FORCE')) itemLine = 'FORCE';
        else if (name.includes('MARK')) itemLine = 'MARK';
        else if (name.includes('PRIME')) itemLine = 'PRIME';

        const itemVal = Number(item.price || item.unitPrice || 0) * Math.max(1, Number(item.quantity) || 1);
        lineSums[itemLine] = (lineSums[itemLine] || 0) + itemVal;
        totalBaselineRev += itemVal;
      });
    });

    if (totalBaselineRev <= 0) {
      throw new Error('INSUFFICIENT_BASELINE_DATA_FOR_PROPORTIONAL_ALLOCATION: Receita histórica zerada para proporção de linhas.');
    }

    weights = {
      FORCE: lineSums.FORCE / totalBaselineRev,
      MARK: lineSums.MARK / totalBaselineRev,
      PRIME: lineSums.PRIME / totalBaselineRev,
      OTHER: lineSums.OTHER / totalBaselineRev
    };
  } else {
    throw new Error(`Método de alocação de linha não suportado: ${method}`);
  }

  let runningRev = 0;
  let runningCogs = 0;
  let runningCM = 0;
  let runningUnits = 0;

  const lineAllocations: CommercialBudgetLineAllocation[] = lines.map((line, idx) => {
    const isLast = idx === lines.length - 1;
    const w = weights[line] ?? 0.25;

    if (!isLast) {
      const rev = roundMoney(totalRevenue * w);
      const cogs = roundMoney(totalCogs * w);
      const cm = roundMoney(totalCM * w);
      const units = Math.round(totalUnits * w);

      runningRev = roundMoney(runningRev + rev);
      runningCogs = roundMoney(runningCogs + cogs);
      runningCM = roundMoney(runningCM + cm);
      runningUnits += units;

      const pct = totalRevenue > 0 ? roundPercent((rev / totalRevenue) * 100) : 0;
      return {
        line,
        targetRevenue: rev,
        targetRevenuePercent: pct,
        targetCogs: cogs,
        targetContributionMargin: cm,
        targetUnits: units
      };
    } else {
      const finalRev = roundMoney(totalRevenue - runningRev);
      const finalCogs = roundMoney(totalCogs - runningCogs);
      const finalCM = roundMoney(totalCM - runningCM);
      const finalUnits = Math.max(0, totalUnits - runningUnits);
      const pct = totalRevenue > 0 ? roundPercent((finalRev / totalRevenue) * 100) : 0;
      return {
        line,
        targetRevenue: finalRev,
        targetRevenuePercent: pct,
        targetCogs: finalCogs,
        targetContributionMargin: finalCM,
        targetUnits: finalUnits
      };
    }
  });

  return { lineAllocations, lineAllocationMethod: method };
}

/**
 * Cria snapshot de aprovação para orçamentos ativados
 */
export function createApprovedBudgetSnapshot(
  budget: CommercialBudget,
  approvedBy: string
): BudgetApprovedSnapshot {
  return {
    isApprovedSnapshot: true,
    approvedAt: new Date().toISOString(),
    approvedBy: approvedBy || 'admin',
    version: budget.version || 1,
    targetRevenue: budget.targetRevenue,
    targetContributionMargin: budget.targetContributionMargin,
    targetContributionMarginPercent: budget.targetContributionMarginPercent,
    targetOperatingProfit: budget.targetOperatingProfit,
    targetOperatingProfitPercent: (budget as any).targetOperatingProfitPercent,
    targetOrders: budget.targetOrders,
    targetUnits: budget.targetUnits,
    targetAverageTicket: budget.targetAverageTicket,
    allocations: { ...budget.allocations },
    guardrails: budget.guardrails ? { ...budget.guardrails } : undefined,
    linkedGoalIds: budget.linkedGoalIds ? [...budget.linkedGoalIds] : (budget.linkedGoalId ? [budget.linkedGoalId] : undefined),
    linkedGoalId: budget.linkedGoalId,
    linkedForecastId: budget.linkedForecastId,
    forecastSnapshot: budget.forecastSnapshot ? { ...budget.forecastSnapshot } : undefined,
    lineAllocationMethod: budget.lineAllocationMethod,
    lineAllocations: budget.lineAllocations ? budget.lineAllocations.map(l => ({ ...l })) : undefined
  };
}

/**
 * Criação canônica de um Orçamento Comercial completo
 */
export function generateCommercialBudget(params: {
  id?: string;
  title: string;
  description?: string;
  period?: BudgetPeriod;
  startDate: string;
  endDate: string;
  sourceStartDate?: string;
  sourceEndDate?: string;
  targetRevenue: number;
  allocations: CommercialBudgetAllocations;
  lineAllocationMethod?: LineAllocationMethod;
  customLineAllocations?: CommercialBudgetLineAllocation[];
  guardrails?: CommercialBudgetGuardrails;
  linkedForecastId?: string;
  linkedGoalId?: string;
  linkedGoalIds?: string[];
  orders: any[];
  expenses?: any[];
  investments?: any[];
  traffic?: any[];
  productCatalog: any[];
  forecast?: CommercialForecast;
  goal?: CommercialGoal;
  goals?: CommercialGoal[];
  createdBy?: string;
  asOfDate?: string;
}): CommercialBudget {
  const {
    id = `budget_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title,
    description,
    startDate,
    endDate,
    targetRevenue,
    allocations,
    lineAllocationMethod = (params.orders && params.orders.length > 0 ? 'revenue_proportional' : 'equal_split'),
    customLineAllocations,
    guardrails = {
      maxTrafficSpendPercentOfRevenue: 15,
      minContributionMarginPercent: 30,
      maxCogsPercentOfRevenue: 40,
      burnRateAlertThresholdPercent: 110
    },
    linkedForecastId,
    linkedGoalId,
    linkedGoalIds,
    orders = [],
    expenses = [],
    investments = [],
    traffic = [],
    productCatalog = [],
    forecast,
    goal,
    goals,
    createdBy = 'admin',
    asOfDate
  } = params;

  const sStart = startDate.split('T')[0];
  const sEnd = endDate.split('T')[0];
  const inferredPeriod = params.period || inferCanonicalPeriodFromDates(sStart, sEnd);

  // Baseline Source Window
  const sourceStart = params.sourceStartDate
    ? params.sourceStartDate.split('T')[0]
    : sStart;
  const sourceEnd = params.sourceEndDate
    ? params.sourceEndDate.split('T')[0]
    : sEnd;

  const baselineSnapshot = buildBudgetBaselineSnapshot({
    orders,
    expenses,
    investments,
    traffic,
    productCatalog,
    sourceStartDate: sourceStart,
    sourceEndDate: sourceEnd,
    budgetStartDate: sStart,
    budgetEndDate: sEnd,
    asOfDate
  });

  const finalAllocations = normalizeBudgetAllocations(allocations);

  // Target Calculations
  const targetContributionMargin = roundMoney(
    targetRevenue - (
      finalAllocations.cogsBudget +
      finalAllocations.gatewayFeesBudget! +
      finalAllocations.shippingSubsidyBudget! +
      (finalAllocations.orderOtherVariableCostsBudget || 0)
    )
  );

  const targetContributionMarginPercent = targetRevenue > 0
    ? roundPercent((targetContributionMargin / targetRevenue) * 100)
    : 0;

  const targetOperatingProfit = calculateOperatingResult({
    contributionMargin: targetContributionMargin,
    administrativeVariableExpenses: finalAllocations.administrativeVariableExpensesBudget,
    fixedExpenses: finalAllocations.fixedExpensesBudget,
    marketingExpenses: finalAllocations.trafficBudget,
    otherExpenses: finalAllocations.otherExpensesBudget
  });

  const avgTicket = baselineSnapshot.realizedAverageTicket > 0
    ? baselineSnapshot.realizedAverageTicket
    : 150;

  const targetOrders = avgTicket > 0 ? Math.round(targetRevenue / avgTicket) : 0;
  const targetUnits = targetOrders; // Aproximação 1 item/pedido padrão ou base

  // Linhas de Produto
  const { lineAllocations } = generateCommercialBudgetLineAllocations({
    targetRevenue,
    cogsBudget: finalAllocations.cogsBudget,
    targetContributionMargin,
    targetUnits,
    method: lineAllocationMethod,
    customLineAllocations,
    productCatalog,
    baselineOrders: orders
  });

  let forecastSnapshot: BudgetForecastSnapshot | undefined;
  if (forecast) {
    forecastSnapshot = {
      isHistoricalSnapshot: true,
      snapshotCapturedAt: asOfDate || new Date().toISOString(),
      snapshotVersion: '1.0',
      forecastId: forecast.id,
      forecastTitle: forecast.title,
      projectedRevenue: forecast.projectedRevenue,
      projectedOrders: forecast.projectedOrders,
      projectedUnits: forecast.projectedUnits,
      projectedContributionMargin: forecast.projectedContributionMargin,
      projectedOperatingProfit: forecast.projectedOperatingProfit,
      projectedAverageTicket: forecast.projectedAverageTicket,
      projectedCogs: (forecast.baseline?.cogs ?? (forecast as any).baselineSnapshot?.cogs ?? 0),
      projectedTraffic: (forecast.baseline?.trafficExpenses ?? (forecast as any).baselineSnapshot?.trafficExpenses ?? 0),
      projectedFixedExpenses: (forecast.baseline?.fixedExpenses ?? (forecast as any).baselineSnapshot?.fixedExpenses ?? 0)
    };
  }

  const { daysElapsed, totalDays } = calculateActualDaysElapsed(sStart, sEnd, asOfDate);

  const toDate = calculateBudgetToDateProRata(
    {
      targetRevenue,
      targetOperatingProfit,
      targetContributionMargin,
      targetOrders,
      targetUnits,
      allocations: finalAllocations
    },
    daysElapsed,
    totalDays
  );

  const currentActuals = calculateBudgetCurrentActuals({
    orders,
    expenses,
    investments,
    traffic,
    productCatalog,
    budgetStartDate: sStart,
    budgetEndDate: sEnd,
    asOfDate
  });

  const confidence = evaluateBudgetConfidence(orders, productCatalog, totalDays);

  const reconciliation = evaluateBudgetReconciliation({
    budget: {
      targetRevenue,
      targetOperatingProfit,
      targetContributionMargin,
      targetOrders,
      targetUnits,
      targetAverageTicket: avgTicket,
      allocations: finalAllocations,
      guardrails
    },
    actuals: currentActuals,
    toDate,
    forecast,
    goal,
    goals,
    confidence
  });

  const nowIso = new Date().toISOString();

  return {
    id,
    title,
    description,
    period: inferredPeriod,
    startDate: sStart,
    endDate: sEnd,
    status: 'draft',
    version: 1,
    targetRevenue: roundMoney(targetRevenue),
    targetContributionMargin,
    targetContributionMarginPercent,
    targetOperatingProfit,
    targetOrders,
    targetUnits,
    targetAverageTicket: avgTicket,
    allocations: finalAllocations,
    lineAllocationMethod,
    lineAllocations,
    guardrails,
    linkedForecastId,
    linkedGoalId,
    linkedGoalIds,
    baselineSnapshot,
    forecastSnapshot,
    currentActuals,
    reconciliation,
    confidence,
    createdBy,
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

/**
 * Cria nova versão de Rebudgeting a partir de um orçamento existente
 */
export function createRebudgetVersion(
  parentBudget: CommercialBudget,
  newParams: {
    title?: string;
    description?: string;
    targetRevenue: number;
    allocations: CommercialBudgetAllocations;
    guardrails?: CommercialBudgetGuardrails;
    lineAllocationMethod?: LineAllocationMethod;
    customLineAllocations?: CommercialBudgetLineAllocation[];
    orders?: any[];
    expenses?: any[];
    investments?: any[];
    traffic?: any[];
    productCatalog?: any[];
    forecast?: CommercialForecast;
    goal?: CommercialGoal;
    goals?: CommercialGoal[];
    performedBy?: string;
  }
): CommercialBudget {
  const newVersion = (parentBudget.version || 1) + 1;
  const newBudgetId = `budget_v${newVersion}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  const generated = generateCommercialBudget({
    id: newBudgetId,
    title: newParams.title || `${parentBudget.title} (v${newVersion})`,
    description: newParams.description !== undefined ? newParams.description : parentBudget.description,
    period: parentBudget.period,
    startDate: parentBudget.startDate,
    endDate: parentBudget.endDate,
    targetRevenue: newParams.targetRevenue,
    allocations: newParams.allocations,
    guardrails: newParams.guardrails || parentBudget.guardrails,
    linkedForecastId: parentBudget.linkedForecastId,
    linkedGoalId: parentBudget.linkedGoalId,
    linkedGoalIds: parentBudget.linkedGoalIds,
    orders: newParams.orders || [],
    expenses: newParams.expenses || [],
    investments: newParams.investments || [],
    traffic: newParams.traffic || [],
    productCatalog: newParams.productCatalog || [],
    forecast: newParams.forecast,
    goal: newParams.goal,
    goals: newParams.goals,
    createdBy: newParams.performedBy || 'admin',
    asOfDate: nowIso,
    lineAllocationMethod: newParams.lineAllocationMethod || parentBudget.lineAllocationMethod,
    customLineAllocations: newParams.customLineAllocations || parentBudget.lineAllocations
  });

  return {
    ...generated,
    version: newVersion,
    parentBudgetId: parentBudget.parentBudgetId || parentBudget.id,
    previousVersionId: parentBudget.id,
    status: 'draft'
  };
}

/**
 * Recalcula o orçamento com base em novos dados realizados sem alterar o baselineSnapshot nem forecastSnapshot
 */
export function recalculateCommercialBudgetActuals(
  existingBudget: CommercialBudget,
  params: {
    orders: any[];
    expenses?: any[];
    investments?: any[];
    traffic?: any[];
    productCatalog: any[];
    asOfDate?: string;
    forecast?: CommercialForecast;
    goal?: CommercialGoal;
    goals?: CommercialGoal[];
  }
): CommercialBudget {
  const {
    orders = [],
    expenses = [],
    investments = [],
    traffic = [],
    productCatalog = [],
    asOfDate,
    forecast,
    goal,
    goals
  } = params;

  const sStart = existingBudget.startDate.split('T')[0];
  const sEnd = existingBudget.endDate.split('T')[0];

  const { daysElapsed, totalDays } = calculateActualDaysElapsed(sStart, sEnd, asOfDate);

  const toDate = calculateBudgetToDateProRata(
    {
      targetRevenue: existingBudget.targetRevenue,
      targetOperatingProfit: existingBudget.targetOperatingProfit,
      targetContributionMargin: existingBudget.targetContributionMargin,
      targetOrders: existingBudget.targetOrders,
      targetUnits: existingBudget.targetUnits,
      allocations: existingBudget.allocations
    },
    daysElapsed,
    totalDays
  );

  const currentActuals = calculateBudgetCurrentActuals({
    orders,
    expenses,
    investments,
    traffic,
    productCatalog,
    budgetStartDate: sStart,
    budgetEndDate: sEnd,
    asOfDate
  });

  const confidence = evaluateBudgetConfidence(orders, productCatalog, totalDays);

  const reconciliation = evaluateBudgetReconciliation({
    budget: {
      targetRevenue: existingBudget.targetRevenue,
      targetOperatingProfit: existingBudget.targetOperatingProfit,
      targetContributionMargin: existingBudget.targetContributionMargin,
      targetOrders: existingBudget.targetOrders,
      targetUnits: existingBudget.targetUnits,
      targetAverageTicket: existingBudget.targetAverageTicket,
      allocations: existingBudget.allocations,
      guardrails: existingBudget.guardrails
    },
    actuals: currentActuals,
    toDate,
    forecast,
    goal,
    goals,
    confidence
  });

  return {
    ...existingBudget,
    currentActuals,
    reconciliation,
    confidence,
    updatedAt: new Date().toISOString()
  };
}
