/**
 * GOVERNANÇA COMERCIAL — MÁQUINA DE ESTADOS, FINGERPRINT & AVALIAÇÃO DE METAS
 * FASE 9.6.4 — FPAC Store
 *
 * Módulo puro, determinístico e auditável.
 */

import {
  CommercialActionStatus,
  CommercialActionType,
  CommercialActionPriority,
  CommercialGoal,
  CommercialGoalEvaluation,
  CommercialGoalType
} from '../types/commercialGovernance';
import { roundMoney, roundPercent } from '../config/financialDefaults';
import {
  type OrderProfitability,
  type ProductProfitabilityItem,
  calculateProductProfitability,
  calculateOrderProfitability,
  calculateProfitabilityOverviewStats
} from './profitability';
import { type FinancialDREResult, calculateFinancialDRE } from './orderFinancial';

/**
 * Converte qualquer representação de data/tempo suportada em timestamp em milissegundos (number).
 * Suporta:
 * 1. Firebase Timestamp: value.toMillis()
 * 2. Firebase Timestamp: value.toDate()
 * 3. JavaScript Date
 * 4. Objeto { seconds, nanoseconds }
 * 5. String ISO / data
 * 6. Number timestamp
 * 7. null / undefined / valor inválido -> null
 */
export function toTimestampMillis(value: any): number | null {
  if (value === null || value === undefined) return null;

  if (typeof value.toMillis === 'function') {
    const ms = value.toMillis();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value.toDate === 'function') {
    const date = value.toDate();
    const ms = date?.getTime?.();
    return Number.isFinite(ms) ? ms : null;
  }

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  if (typeof value.seconds === 'number') {
    return value.seconds * 1000 +
      Math.floor(Number(value.nanoseconds || 0) / 1_000_000);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Tabela Canônica de Transições de Estado Válidas
 */
export const VALID_ACTION_TRANSITIONS: Record<CommercialActionStatus, CommercialActionStatus[]> = {
  draft: ['approved', 'dismissed', 'cancelled'],
  approved: ['in_progress', 'cancelled', 'dismissed'],
  in_progress: ['completed', 'cancelled'],
  completed: [], // Terminal — não permite reabertura automática
  dismissed: [], // Terminal
  cancelled: [], // Terminal
  expired: []    // Terminal
};

/**
 * Valida se uma transição de status de Ação Comercial é permitida
 */
export function canTransitionActionStatus(
  currentStatus: CommercialActionStatus,
  targetStatus: CommercialActionStatus
): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = VALID_ACTION_TRANSITIONS[currentStatus];
  return Boolean(allowed && allowed.includes(targetStatus));
}

/**
 * Gera fingerprint determinístico do problema da recomendação para prevenção de duplicidade
 * NÃO usa métricas mutáveis (preço, margem) no fingerprint.
 */
export function generateRecommendationFingerprint(
  recommendationType: string,
  entityId: string = 'global',
  reasonCodes: string[] = []
): string {
  const sortedCodes = [...reasonCodes].sort().join(',');
  const raw = `${recommendationType.trim().toLowerCase()}|${entityId.trim().toLowerCase()}|${sortedCodes}`;
  return raw;
}

/**
 * Verifica se uma ação está vencida (overdue)
 * Overdue é conceito puramente DERIVADO (não é status persistido duplicado)
 */
export function isActionOverdue(dueDate?: string, status?: CommercialActionStatus): boolean {
  if (!dueDate || !status) return false;
  // Apenas status abertos podem ser considerados vencidos
  const isOpen = status === 'draft' || status === 'approved' || status === 'in_progress';
  if (!isOpen) return false;

  const dueTime = new Date(dueDate).getTime();
  if (isNaN(dueTime)) return false;

  return dueTime < Date.now();
}

/**
 * Cálculo visual de progresso não financeiro com proteção total contra divisão por zero e NaN/Infinity
 */
export function calculateGoalProgressPercent(current: number, target: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) {
    return 0;
  }
  const pct = (current / target) * 100;
  return Math.max(0, Math.min(1000, roundPercent(pct)));
}

/**
 * Avalia o progresso de uma meta comercial (Read-Only)
 * Utiliza EXCLUSIVAMENTE os valores canônicos correspondentes ao intervalo [goal.startDate, goal.endDate].
 * Sem fórmulas financeiras paralelas ou distorção temporal.
 */
export function evaluateCommercialGoal(
  goal: CommercialGoal,
  context: {
    ordersProfitability?: OrderProfitability[];
    productsProfitability?: ProductProfitabilityItem[];
    dre?: any;
    rawOrders?: any[];
    productCatalog?: any[];
    expenses?: any[];
    investments?: any[];
    traffic?: any[];
    now?: Date;
  }
): CommercialGoalEvaluation {
  const {
    ordersProfitability = [],
    productsProfitability = [],
    dre,
    rawOrders,
    productCatalog = [],
    expenses = [],
    investments = [],
    traffic = [],
    now = new Date()
  } = context;

  // 1. Delimitação estrita do intervalo da meta
  const startTimestamp = toTimestampMillis(goal.startDate) ?? new Date(goal.startDate).getTime();
  const rawEndTime = toTimestampMillis(goal.endDate) ?? new Date(goal.endDate).getTime();
  // Se a data final não incluir horário (ex: '2026-08-31'), considera o fim do dia (23:59:59.999)
  const endTimestamp = typeof goal.endDate === 'string' && !goal.endDate.includes('T')
    ? (toTimestampMillis(`${goal.endDate}T23:59:59.999Z`) ?? new Date(`${goal.endDate}T23:59:59.999Z`).getTime())
    : rawEndTime;

  let activeDRE = dre;
  let activeProducts = productsProfitability;
  let activeOrdersProf = ordersProfitability;

  const isItemInPeriod = (item: any) => {
    const rawVal = item.date ?? item.createdAt ?? item.timestamp ?? item.dueDate ?? item.paymentDate;
    if (rawVal === undefined || rawVal === null) return false;
    const t = toTimestampMillis(rawVal);
    if (t === null) return false;
    return (!isNaN(startTimestamp) ? t >= startTimestamp : true) &&
           (!isNaN(endTimestamp) ? t <= endTimestamp : true);
  };

  // 2. Se rawOrders for fornecido (ou expenses/investments/traffic precisarem de apuração delimitada no período da meta)
  if (Array.isArray(rawOrders)) {
    const periodOrders = rawOrders.filter(order => {
      const rawVal = order.createdAt ?? order.date ?? order.orderDate ?? order.placedAt;
      if (rawVal === undefined || rawVal === null) return false;
      const orderTime = toTimestampMillis(rawVal);
      if (orderTime === null) return false;
      return (!isNaN(startTimestamp) ? orderTime >= startTimestamp : true) &&
             (!isNaN(endTimestamp) ? orderTime <= endTimestamp : true);
    });

    const periodExpenses = expenses.filter(isItemInPeriod);
    const periodInvestments = investments.filter(isItemInPeriod);
    const periodTraffic = traffic.filter(isItemInPeriod);

    activeDRE = calculateFinancialDRE(
      periodOrders,
      periodExpenses,
      periodInvestments,
      periodTraffic,
      productCatalog
    );
    activeProducts = calculateProductProfitability(periodOrders, productCatalog);
    activeOrdersProf = periodOrders.map(order => calculateOrderProfitability(order, productCatalog));
  }

  let currentValue = 0;

  switch (goal.type) {
    case 'revenue':
      // Receita Líquida canônica apurada do período
      currentValue = activeDRE?.revenue?.netRevenue ?? activeDRE?.netReceived ?? 0;
      break;

    case 'operating_profit':
      // Lucro Operacional canônico apurado do período
      currentValue = activeDRE?.operatingProfit ?? 0;
      break;

    case 'contribution_margin': {
      // Margem de Contribuição apurada diretamente do motor certificado 9.6.1 (calculateProfitabilityOverviewStats)
      const profStats = calculateProfitabilityOverviewStats(activeOrdersProf);
      currentValue = profStats.contributionMargin;
      break;
    }

    case 'units':
      // Unidades reais vendidas agregadas dos produtos no período
      currentValue = activeProducts.reduce((sum, p) => sum + (p.unitsSold || 0), 0);
      break;

    case 'average_ticket': {
      // Ticket Médio canônico apurado diretamente da DRE (sem fórmula paralela)
      currentValue = activeDRE?.summary?.averageTicket ?? activeDRE?.averageTicket ?? 0;
      break;
    }

    default:
      currentValue = 0;
  }

  currentValue = roundMoney(currentValue);
  const targetValue = roundMoney(goal.targetValue);
  const progressPercent = calculateGoalProgressPercent(currentValue, targetValue);
  const remainingValue = roundMoney(Math.max(0, targetValue - currentValue));

  const isMathematicallyAchieved = targetValue > 0 && currentValue >= targetValue;
  const isOverdue = !isNaN(endTimestamp) && endTimestamp < now.getTime() && !isMathematicallyAchieved;

  let calculatedStatus: 'on_track' | 'achieved' | 'behind' | 'missed';
  if (isMathematicallyAchieved) {
    calculatedStatus = 'achieved';
  } else if (isOverdue) {
    calculatedStatus = 'missed';
  } else if (progressPercent >= 50) {
    calculatedStatus = 'on_track';
  } else {
    calculatedStatus = 'behind';
  }

  return {
    goalId: goal.id,
    type: goal.type,
    targetValue,
    currentValue,
    progressPercent,
    remainingValue,
    calculatedStatus,
    isMathematicallyAchieved,
    isOverdue
  };
}

