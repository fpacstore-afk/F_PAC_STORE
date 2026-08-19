/**
 * UTILITÁRIOS E MOTOR PURO DE EXECUÇÃO COMERCIAL & GOVERNANÇA OPERACIONAL
 * FASE 9.6.7 — FPAC Store
 *
 * Módulo de funções puras e determinísticas para:
 * - Cálculo de progresso de ações (calculateExecutionProgress)
 * - Identificação rigorosa de ações atrasadas (overdue) e críticas bloqueadas
 * - Reconciliação temporal canônica MTD vs Expected to Date (calculateBudgetExecutionProgress)
 * - Diagnóstico de Saúde Operacional transparente (calculateExecutionHealth)
 * - Geração de Alertas Canônicos (generateExecutionAlerts)
 * - Priorização transparente com explicação de critérios (prioritizeCommercialActions)
 * - Normalização resiliente de datas sem quebras
 */

import {
  CommercialExecutionActionItem,
  CommercialExecutionProgress,
  CommercialMetricExecutionProgress,
  CommercialExecutionHealth,
  CommercialExecutionHealthStatus,
  CommercialExecutionAlert,
  CommercialActionPrioritization,
  CommercialActionPriority,
  CommercialActionExecutionStatus,
  CommercialImpactAttribution
} from '../types/commercialExecution.js';

import { roundMoney, roundPercent } from './commercialBudget.js';

/**
 * Normaliza qualquer formato de data (ISO string, Timestamp, Date, seconds) para objeto Date
 * Preserva estritamente datas comerciais no formato YYYY-MM-DD sem recuo de fuso (ex: America/Sao_Paulo)
 */
export function normalizeDateToObj(d: any): Date {
  if (!d) return new Date();
  if (d instanceof Date) return isNaN(d.getTime()) ? new Date() : d;
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      return new Date(year, month - 1, day, 12, 0, 0);
    }
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  if (typeof d === 'object' && d !== null) {
    if (typeof d.toDate === 'function') return d.toDate();
    if (typeof d._seconds === 'number') return new Date(d._seconds * 1000);
    if (typeof d.seconds === 'number') return new Date(d.seconds * 1000);
  }
  if (typeof d === 'number') return d < 10000000000 ? new Date(d * 1000) : new Date(d);
  return new Date();
}

/**
 * Normaliza para formato YYYY-MM-DD sem sofrer deslocamento de fuso horário
 */
export function formatDateToYMD(d: any): string {
  if (!d) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }
  if (d instanceof Date && !isNaN(d.getTime())) {
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
      return d.toISOString().slice(0, 10);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const dt = normalizeDateToObj(d);
  if (dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 && dt.getUTCSeconds() === 0 && dt.getUTCMilliseconds() === 0) {
    return dt.toISOString().slice(0, 10);
  }
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Verifica se uma ação está atrasada (overdue)
 * Ação é overdue quando: plannedEndDate < hoje AND status NOT IN ['completed', 'cancelled']
 */
export function isActionOverdue(action: CommercialExecutionActionItem, referenceDate: Date = new Date()): boolean {
  if (action.executionStatus === 'completed' || action.executionStatus === 'cancelled') {
    return false;
  }
  if (!action.plannedEndDate) return false;
  
  const end = normalizeDateToObj(action.plannedEndDate);
  // Considerar o final do dia da data planejada (23:59:59.999)
  const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  
  return endOfDay.getTime() < referenceDate.getTime();
}

/**
 * Calcula o progresso quantitativo das ações de um ciclo
 */
export function calculateExecutionProgress(
  actions: CommercialExecutionActionItem[],
  referenceDate: Date = new Date()
): CommercialExecutionProgress {
  const totalActions = actions.length;
  let plannedActions = 0;
  let readyActions = 0;
  let inProgressActions = 0;
  let blockedActions = 0;
  let completedActions = 0;
  let cancelledActions = 0;
  let overdueActions = 0;
  let criticalBlockedActions = 0;

  for (const a of actions) {
    switch (a.executionStatus) {
      case 'planned':
        plannedActions++;
        break;
      case 'ready':
        readyActions++;
        break;
      case 'in_progress':
        inProgressActions++;
        break;
      case 'blocked':
        blockedActions++;
        if (a.priority === 'critical') {
          criticalBlockedActions++;
        }
        break;
      case 'completed':
        completedActions++;
        break;
      case 'cancelled':
        cancelledActions++;
        break;
    }

    if (isActionOverdue(a, referenceDate)) {
      overdueActions++;
    }
  }

  // O percentual de conclusão considera ações ativas (excluindo canceladas do denominador caso desejado, ou sobre total elegível)
  const activeDenominator = totalActions - cancelledActions;
  let completionPercent = 0;
  if (activeDenominator > 0) {
    // Pode somar percentual de cada ação ou ações concluídas
    const totalPercentSum = actions
      .filter(a => a.executionStatus !== 'cancelled')
      .reduce((sum, a) => sum + (a.executionStatus === 'completed' ? 100 : (a.completionPercent || 0)), 0);
    completionPercent = roundPercent(totalPercentSum / activeDenominator);
  }

  return {
    totalActions,
    plannedActions,
    readyActions,
    inProgressActions,
    blockedActions,
    completedActions,
    cancelledActions,
    completionPercent,
    overdueActions,
    criticalBlockedActions
  };
}

/**
 * Cálculo temporal de progresso do Budget vs Real vs Forecast vs Goal
 * NÃO compara MTD com o período inteiro de forma ingênua:
 * expectedToDate = budgetTarget * (daysElapsed / totalDays)
 */
export function calculateBudgetExecutionProgress(params: {
  periodStart: string | Date;
  periodEnd: string | Date;
  referenceDate?: string | Date;
  budget: {
    revenue: number;
    units: number;
    averageTicket: number;
    contributionMargin: number;
    operatingProfit: number;
  };
  actuals: {
    revenue: number;
    orders?: number;
    units: number;
    contributionMargin: number;
    operatingProfit: number;
  };
  forecast?: {
    revenue?: number;
    units?: number;
    contributionMargin?: number;
    operatingProfit?: number;
  };
  goals?: {
    revenue?: number;
    units?: number;
    contributionMargin?: number;
    operatingProfit?: number;
    averageTicket?: number;
  };
}) {
  const ref = params.referenceDate ? normalizeDateToObj(params.referenceDate) : new Date();
  const startStr = formatDateToYMD(params.periodStart);
  const endStr = formatDateToYMD(params.periodEnd);
  const refStr = formatDateToYMD(ref);

  const [sY, sM, sD] = startStr.split('-').map(Number);
  const [eY, eM, eD] = endStr.split('-').map(Number);
  const [rY, rM, rD] = refStr.split('-').map(Number);

  const startUtc = Date.UTC(sY, sM - 1, sD);
  const endUtc = Date.UTC(eY, eM - 1, eD);
  const refUtc = Date.UTC(rY, rM - 1, rD);

  const totalDays = Math.max(1, Math.round((endUtc - startUtc) / 86400000) + 1);
  
  // Se a data de referência for anterior ao início do período, decorreram 0 dias (sem projeção forçada)
  let daysElapsed = 0;
  let timeProgressPercent = 0;
  let timeRatio = 0;

  if (refUtc < startUtc) {
    daysElapsed = 0;
    timeProgressPercent = 0;
    timeRatio = 0;
  } else if (refUtc > endUtc) {
    daysElapsed = totalDays;
    timeProgressPercent = 100;
    timeRatio = 1;
  } else {
    daysElapsed = Math.min(totalDays, Math.round((refUtc - startUtc) / 86400000) + 1);
    timeProgressPercent = roundPercent((daysElapsed / totalDays) * 100);
    timeRatio = totalDays > 0 ? (daysElapsed / totalDays) : 1;
  }

  function buildMetric(
    metric: 'revenue' | 'units' | 'averageTicket' | 'contributionMargin' | 'operatingProfit',
    budgetTarget: number,
    actualToDate: number,
    forecastVal: number,
    goalVal: number
  ): CommercialMetricExecutionProgress {
    let expectedToDate = 0;
    if (metric === 'averageTicket') {
      // Ticket médio esperado é a taxa unitária quando há progresso temporal, 0 se pré-período
      expectedToDate = timeRatio > 0 ? budgetTarget : 0;
    } else {
      expectedToDate = roundMoney(budgetTarget * timeRatio);
    }

    const varianceToBudget = roundMoney(actualToDate - budgetTarget);
    const varianceToExpected = roundMoney(actualToDate - expectedToDate);
    const varianceToExpectedPercent = expectedToDate > 0 
      ? roundPercent(((actualToDate - expectedToDate) / expectedToDate) * 100)
      : 0;
    const gapToGoal = roundMoney(actualToDate - goalVal);

    return {
      metric,
      budgetTarget: roundMoney(budgetTarget),
      actualToDate: roundMoney(actualToDate),
      expectedToDate,
      forecast: roundMoney(forecastVal),
      goalTarget: roundMoney(goalVal),
      varianceToBudget,
      varianceToExpected,
      varianceToExpectedPercent,
      gapToGoal
    };
  }

  const actualsObj = params.actuals as any;
  const actualAvgTicket = actualsObj.orders && actualsObj.orders > 0
    ? roundMoney(params.actuals.revenue / actualsObj.orders)
    : 0;

  const revenueMetric = buildMetric(
    'revenue',
    params.budget.revenue,
    params.actuals.revenue,
    params.forecast?.revenue ?? params.budget.revenue,
    params.goals?.revenue ?? params.budget.revenue
  );

  const unitsMetric = buildMetric(
    'units',
    params.budget.units,
    params.actuals.units,
    params.forecast?.units ?? params.budget.units,
    params.goals?.units ?? params.budget.units
  );

  const forecastObj = params.forecast as any;
  let forecastAvgTicket = params.budget.averageTicket;
  if (forecastObj?.averageTicket !== undefined && forecastObj.averageTicket !== null) {
    forecastAvgTicket = forecastObj.averageTicket;
  } else if (forecastObj?.orders && forecastObj.orders > 0 && forecastObj?.revenue) {
    forecastAvgTicket = roundMoney(forecastObj.revenue / forecastObj.orders);
  } else if (forecastObj?.projectedOrders && forecastObj.projectedOrders > 0 && forecastObj?.revenue) {
    forecastAvgTicket = roundMoney(forecastObj.revenue / forecastObj.projectedOrders);
  }

  const avgTicketMetric = buildMetric(
    'averageTicket',
    params.budget.averageTicket,
    actualAvgTicket,
    forecastAvgTicket,
    params.goals?.averageTicket ?? params.budget.averageTicket
  );

  const cmMetric = buildMetric(
    'contributionMargin',
    params.budget.contributionMargin,
    params.actuals.contributionMargin,
    params.forecast?.contributionMargin ?? params.budget.contributionMargin,
    params.goals?.contributionMargin ?? params.budget.contributionMargin
  );

  const opMetric = buildMetric(
    'operatingProfit',
    params.budget.operatingProfit,
    params.actuals.operatingProfit,
    params.forecast?.operatingProfit ?? params.budget.operatingProfit,
    params.goals?.operatingProfit ?? params.budget.operatingProfit
  );

  return {
    revenue: revenueMetric,
    units: unitsMetric,
    averageTicket: avgTicketMetric,
    contributionMargin: cmMetric,
    operatingProfit: opMetric,
    timeProgressPercent,
    daysElapsed,
    totalDays
  };
}

/**
 * Avalia a Saúde Operacional (CommercialExecutionHealth) de forma transparente
 */
export function calculateExecutionHealth(params: {
  progress: CommercialExecutionProgress;
  budgetExecution: {
    revenue: CommercialMetricExecutionProgress;
    units?: CommercialMetricExecutionProgress;
    averageTicket?: CommercialMetricExecutionProgress;
    contributionMargin: CommercialMetricExecutionProgress;
    operatingProfit: CommercialMetricExecutionProgress;
    timeProgressPercent: number;
  };
  costCoveragePercent?: number;
  confidence?: 'high' | 'medium' | 'low' | 'insufficient';
  hasSufficientData?: boolean;
}): CommercialExecutionHealth {
  const reasons: string[] = [];
  const signals: Array<{ name: string; level: 'ok' | 'warning' | 'critical'; description: string }> = [];

  const isDataInsufficient = 
    params.hasSufficientData === false || 
    params.confidence === 'insufficient' || 
    (typeof params.costCoveragePercent === 'number' && params.costCoveragePercent < 50);

  if (isDataInsufficient) {
    return {
      status: 'insufficient',
      reasons: ['Dados insuficientes ou baixa cobertura de custos cadastrados para diagnóstico de saúde operacional.'],
      signals: [{ name: 'Dados', level: 'warning', description: 'Amostra de dados insuficiente (<50% cobertura)' }]
    };
  }

  let criticalPoints = 0;
  let warningPoints = 0;

  // 1. Ações Críticas Bloqueadas
  if (params.progress.criticalBlockedActions > 0) {
    criticalPoints += 2;
    reasons.push(`${params.progress.criticalBlockedActions} ação(ões) de prioridade crítica bloqueada(s).`);
    signals.push({
      name: 'Ações Críticas',
      level: 'critical',
      description: `${params.progress.criticalBlockedActions} crítica(s) bloqueada(s)`
    });
  } else if (params.progress.blockedActions > 0) {
    warningPoints += 1;
    reasons.push(`${params.progress.blockedActions} ação(ões) operacional(is) bloqueada(s).`);
    signals.push({
      name: 'Ações Bloqueadas',
      level: 'warning',
      description: `${params.progress.blockedActions} bloqueada(s)`
    });
  } else {
    signals.push({ name: 'Ações Bloqueadas', level: 'ok', description: 'Nenhuma ação bloqueada' });
  }

  // 2. Ações Atrasadas
  if (params.progress.overdueActions > 0) {
    if (params.progress.overdueActions >= 3) {
      criticalPoints += 1;
      signals.push({
        name: 'Atrasos no Plano',
        level: 'critical',
        description: `${params.progress.overdueActions} ações com prazo expirado`
      });
    } else {
      warningPoints += 1;
      signals.push({
        name: 'Atrasos no Plano',
        level: 'warning',
        description: `${params.progress.overdueActions} ação(ões) atrasada(s)`
      });
    }
    reasons.push(`${params.progress.overdueActions} ação(ões) com prazo de conclusão expirado.`);
  } else {
    signals.push({ name: 'Atrasos no Plano', level: 'ok', description: 'Todas as ações dentro do prazo' });
  }

  // 3. Desvio de Receita vs Expected To Date
  const revVarPercent = params.budgetExecution.revenue.varianceToExpectedPercent;
  if (params.budgetExecution.timeProgressPercent > 10) {
    if (revVarPercent < -15) {
      criticalPoints += 2;
      reasons.push(`Receita realizada ${Math.abs(revVarPercent)}% abaixo do ritmo esperado pro-rata.`);
      signals.push({
        name: 'Receita Pro-Rata',
        level: 'critical',
        description: `${revVarPercent}% vs ritmo esperado`
      });
    } else if (revVarPercent < -5) {
      warningPoints += 1;
      reasons.push(`Receita realizada ${Math.abs(revVarPercent)}% abaixo do ritmo planejado.`);
      signals.push({
        name: 'Receita Pro-Rata',
        level: 'warning',
        description: `${revVarPercent}% vs ritmo esperado`
      });
    } else {
      signals.push({
        name: 'Receita Pro-Rata',
        level: 'ok',
        description: `Dentro ou acima do ritmo esperado (${revVarPercent >= 0 ? '+' : ''}${revVarPercent}%)`
      });
    }
  }

  // 4. Margem de Contribuição vs Ritmo
  const cmVarPercent = params.budgetExecution.contributionMargin.varianceToExpectedPercent;
  if (params.budgetExecution.timeProgressPercent > 10) {
    if (cmVarPercent < -20) {
      criticalPoints += 1;
      reasons.push(`Margem de contribuição ${Math.abs(cmVarPercent)}% abaixo do esperado.`);
      signals.push({
        name: 'Margem de Contribuição',
        level: 'critical',
        description: `${cmVarPercent}% vs esperado`
      });
    } else if (cmVarPercent < -8) {
      warningPoints += 1;
      reasons.push(`Margem de contribuição ${Math.abs(cmVarPercent)}% abaixo da meta pro-rata.`);
      signals.push({
        name: 'Margem de Contribuição',
        level: 'warning',
        description: `${cmVarPercent}% vs esperado`
      });
    } else {
      signals.push({
        name: 'Margem de Contribuição',
        level: 'ok',
        description: 'Margem saudável no período'
      });
    }
  }

  // 5. Lucro Operacional vs Ritmo
  const opVarPercent = params.budgetExecution.operatingProfit.varianceToExpectedPercent;
  if (params.budgetExecution.timeProgressPercent > 10) {
    if (opVarPercent < -25) {
      criticalPoints += 1;
      reasons.push(`Lucro operacional ${Math.abs(opVarPercent)}% abaixo do ritmo orçado.`);
      signals.push({
        name: 'Lucro Operacional',
        level: 'critical',
        description: `${opVarPercent}% vs esperado`
      });
    }
  }

  let status: CommercialExecutionHealthStatus = 'healthy';
  if (criticalPoints >= 2 || (criticalPoints >= 1 && warningPoints >= 2)) {
    status = 'critical';
  } else if (criticalPoints >= 1 || warningPoints >= 1) {
    status = 'attention';
  }

  if (reasons.length === 0) {
    reasons.push('Execução do plano dentro das tolerâncias e guardrails estabelecidos.');
  }

  return { status, reasons, signals };
}

/**
 * Gera Alertas Operacionais Canônicos baseados em fatos e métricas (Cobre todos os 13 códigos canônicos)
 */
export function generateExecutionAlerts(params: {
  actions: CommercialExecutionActionItem[];
  progress: CommercialExecutionProgress;
  budgetExecution: {
    revenue: CommercialMetricExecutionProgress;
    units: CommercialMetricExecutionProgress;
    averageTicket: CommercialMetricExecutionProgress;
    contributionMargin: CommercialMetricExecutionProgress;
    operatingProfit: CommercialMetricExecutionProgress;
    timeProgressPercent: number;
  };
  costCoveragePercent?: number;
  hasSufficientData?: boolean;
  now?: Date;
}): CommercialExecutionAlert[] {
  const alerts: CommercialExecutionAlert[] = [];
  const timestamp = (params.now || new Date()).toISOString();

  // 1. INSUFFICIENT_DATA
  if (params.hasSufficientData === false) {
    alerts.push({
      code: 'INSUFFICIENT_DATA',
      severity: 'high',
      title: 'Amostra de Dados Insuficiente',
      message: 'Volume de dados histórico ou recente insuficiente para cálculos estatísticos robustos.',
      timestamp
    });
  }

  // 2. LOW_COST_COVERAGE
  if (typeof params.costCoveragePercent === 'number' && params.costCoveragePercent < 70) {
    alerts.push({
      code: 'LOW_COST_COVERAGE',
      severity: params.costCoveragePercent < 50 ? 'critical' : 'high',
      title: 'Baixa Cobertura de Custos no Catálogo',
      message: `Apenas ${params.costCoveragePercent}% dos produtos vendidos possuem custo unitário cadastrado.`,
      metric: 'costCoveragePercent',
      timestamp
    });
  }

  // 3. Alertas de Ações Bloqueadas Críticas e Gerais
  for (const a of params.actions) {
    if (a.executionStatus === 'blocked') {
      if (a.priority === 'critical') {
        alerts.push({
          code: 'CRITICAL_ACTION_BLOCKED',
          severity: 'critical',
          title: `Ação Crítica Bloqueada: ${a.title}`,
          message: a.blockingReason || 'Ação de prioridade crítica está com execução impedida.',
          actionId: a.id,
          timestamp
        });
      } else {
        alerts.push({
          code: 'ACTION_BLOCKED',
          severity: 'medium',
          title: `Ação Bloqueada: ${a.title}`,
          message: a.blockingReason || 'Ação operacional aguardando resolução de impedimento.',
          actionId: a.id,
          timestamp
        });
      }
    }

    if (isActionOverdue(a, params.now)) {
      alerts.push({
        code: 'ACTION_OVERDUE',
        severity: a.priority === 'critical' ? 'critical' : 'high',
        title: `Ação Atrasada: ${a.title}`,
        message: `Prazo limite ${a.plannedEndDate} expirou sem conclusão.`,
        actionId: a.id,
        timestamp
      });
    }
  }

  // 4. EXECUTION_BEHIND_PLAN
  if (params.budgetExecution.timeProgressPercent >= 30 && params.progress.completionPercent < (params.budgetExecution.timeProgressPercent - 25)) {
    alerts.push({
      code: 'EXECUTION_BEHIND_PLAN',
      severity: 'high',
      title: 'Plano Comercial em Descompasso Temporal',
      message: `Ciclo em ${params.budgetExecution.timeProgressPercent}% do período com apenas ${params.progress.completionPercent}% das ações concluídas.`,
      timestamp
    });
  }

  // 5. Desvios de Métricas Financeiras
  if (params.budgetExecution.timeProgressPercent > 10) {
    if (params.budgetExecution.revenue.varianceToExpectedPercent < -10) {
      alerts.push({
        code: 'REVENUE_BELOW_EXPECTED',
        severity: params.budgetExecution.revenue.varianceToExpectedPercent < -20 ? 'critical' : 'high',
        title: 'Receita Realizada Abaixo do Ritmo',
        message: `Receita atual (R$ ${params.budgetExecution.revenue.actualToDate}) está ${Math.abs(params.budgetExecution.revenue.varianceToExpectedPercent)}% abaixo do esperado para a data (R$ ${params.budgetExecution.revenue.expectedToDate}).`,
        metric: 'revenue',
        timestamp
      });
    }

    if (params.budgetExecution.units.varianceToExpectedPercent < -12) {
      alerts.push({
        code: 'UNITS_BELOW_EXPECTED',
        severity: 'medium',
        title: 'Volume de Unidades Abaixo do Planejado',
        message: `Unidades vendidas (${params.budgetExecution.units.actualToDate}) abaixo do ritmo pro-rata (${params.budgetExecution.units.expectedToDate}).`,
        metric: 'units',
        timestamp
      });
    }

    if (params.budgetExecution.averageTicket.varianceToExpectedPercent < -10) {
      alerts.push({
        code: 'AVERAGE_TICKET_BELOW_EXPECTED',
        severity: 'medium',
        title: 'Ticket Médio Abaixo do Planejado',
        message: `Ticket médio atual (R$ ${params.budgetExecution.averageTicket.actualToDate}) está abaixo do alvo planejado (R$ ${params.budgetExecution.averageTicket.expectedToDate}).`,
        metric: 'averageTicket',
        timestamp
      });
    }

    if (params.budgetExecution.contributionMargin.varianceToExpectedPercent < -15) {
      alerts.push({
        code: 'CONTRIBUTION_MARGIN_BELOW_EXPECTED',
        severity: 'critical',
        title: 'Margem de Contribuição Comprometida',
        message: `Margem realizada está ${Math.abs(params.budgetExecution.contributionMargin.varianceToExpectedPercent)}% abaixo do piso orçado pro-rata.`,
        metric: 'contributionMargin',
        timestamp
      });
    }

    if (params.budgetExecution.operatingProfit.varianceToExpectedPercent < -20) {
      alerts.push({
        code: 'OPERATING_PROFIT_BELOW_EXPECTED',
        severity: 'critical',
        title: 'Lucro Operacional Abaixo do Orçado',
        message: `Resultado operacional realizado está ${Math.abs(params.budgetExecution.operatingProfit.varianceToExpectedPercent)}% abaixo do ritmo esperado.`,
        metric: 'operatingProfit',
        timestamp
      });
    }
  }

  // 6. FORECAST_BELOW_BUDGET
  if (params.budgetExecution.revenue.forecast < params.budgetExecution.revenue.budgetTarget * 0.95) {
    alerts.push({
      code: 'FORECAST_BELOW_BUDGET',
      severity: 'high',
      title: 'Projeção Forecast Abaixo do Budget',
      message: `Projeção atual (R$ ${params.budgetExecution.revenue.forecast}) sinaliza não atingimento do orçamento (R$ ${params.budgetExecution.revenue.budgetTarget}).`,
      metric: 'forecast',
      timestamp
    });
  }

  // 7. GOAL_AT_RISK
  if (params.budgetExecution.revenue.gapToGoal < -params.budgetExecution.revenue.goalTarget * 0.15) {
    alerts.push({
      code: 'GOAL_AT_RISK',
      severity: 'high',
      title: 'Meta Comercial em Risco',
      message: `Gap expressivo de R$ ${Math.abs(params.budgetExecution.revenue.gapToGoal)} para a meta comercial estabelecida.`,
      metric: 'goal',
      timestamp
    });
  }

  return alerts;
}

/**
 * Prioriza Ações Comerciais com base em critérios transparentes e explicáveis
 */
export function prioritizeCommercialActions(
  actions: CommercialExecutionActionItem[],
  context: {
    revenueVarianceToExpected?: number;
    goalGap?: number;
    referenceDate?: Date;
  } = {}
): CommercialActionPrioritization[] {
  const refDate = context.referenceDate || new Date();

  return actions.map(action => {
    let score = 0;
    const reasons: string[] = [];

    // 1. Prioridade intrínseca
    switch (action.priority) {
      case 'critical':
        score += 40;
        reasons.push('Prioridade definida como Crítica (+40 pts)');
        break;
      case 'high':
        score += 25;
        reasons.push('Prioridade definida como Alta (+25 pts)');
        break;
      case 'medium':
        score += 15;
        reasons.push('Prioridade Média (+15 pts)');
        break;
      case 'low':
        score += 5;
        reasons.push('Prioridade Baixa (+5 pts)');
        break;
    }

    // 2. Status e Bloqueio
    if (action.executionStatus === 'blocked') {
      score += 30;
      reasons.push('Ação Bloqueada necessita de resolução urgente (+30 pts)');
    } else if (action.executionStatus === 'in_progress') {
      score += 15;
      reasons.push('Ação já iniciada em andamento (+15 pts)');
    } else if (action.executionStatus === 'ready') {
      score += 10;
      reasons.push('Ação pronta para início imediato (+10 pts)');
    }

    // 3. Proximidade ou estouro do prazo (Deadlines)
    if (isActionOverdue(action, refDate)) {
      score += 35;
      reasons.push('Prazo limite expirado / Atrasada (+35 pts)');
    } else if (action.plannedEndDate) {
      const end = normalizeDateToObj(action.plannedEndDate);
      const daysUntil = (end.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysUntil <= 2 && daysUntil >= 0) {
        score += 20;
        reasons.push('Vencimento próximo em menos de 48h (+20 pts)');
      } else if (daysUntil <= 7 && daysUntil > 2) {
        score += 10;
        reasons.push('Vencimento na semana corrente (+10 pts)');
      }
    }

    // 4. Impacto financeiro esperado
    if (action.expectedImpact?.revenueImpact && action.expectedImpact.revenueImpact > 5000) {
      score += 15;
      reasons.push('Alto impacto financeiro esperado (> R$ 5.000) (+15 pts)');
    } else if (action.expectedImpact?.contributionMarginImpact && action.expectedImpact.contributionMarginImpact > 2000) {
      score += 15;
      reasons.push('Alto impacto de margem esperado (> R$ 2.000) (+15 pts)');
    }

    // 5. Gap contextual
    if (context.revenueVarianceToExpected && context.revenueVarianceToExpected < 0) {
      if (action.expectedImpact?.revenueImpact && action.expectedImpact.revenueImpact > 0) {
        score += 10;
        reasons.push('Contribui para recuperação do gap de receita (+10 pts)');
      }
    }

    // Classificação em faixas (Bands)
    let priorityBand: 'critical' | 'high' | 'medium' | 'low' = 'low';
    if (score >= 70) {
      priorityBand = 'critical';
    } else if (score >= 45) {
      priorityBand = 'high';
    } else if (score >= 25) {
      priorityBand = 'medium';
    }

    return {
      actionId: action.id,
      priorityScore: score,
      priorityBand,
      reasons
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore);
}
