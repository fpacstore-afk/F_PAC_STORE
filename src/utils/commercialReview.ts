/**
 * Utilitários Puros para Pós-Mortem Comercial, Variance Bridge, Calibração de Forecast e Aprendizado Contínuo (FASE 9.6.8)
 * FPAC Store — Motor de Inteligência & Execução Comercial
 *
 * REGRAS DE ARQUITETURA:
 * 1. Funções estritamente puras e determinísticas (sem Firestore, sem side-effects).
 * 2. Variance Bridge cent-exact: Volume Effect + Ticket Effect + Residual === Total Revenue Variance (tolerância R$ 0.01).
 * 3. Planning Residual explícito quando a meta de receita difere de Orders × Average Ticket.
 * 4. Respeito rigoroso a linguagem de atribuição (Direct = "atribuído", Correlated = "observado/associado", Insufficient = "insuficiente").
 * 5. Governança de amostra histórica (<3 reviews = insufficient, 3-5 = medium, >5 = high).
 */

import {
  CommercialExecutionReview,
  CommercialVarianceBridge,
  CommercialVarianceDriver,
  CommercialVarianceDriverType,
  CommercialMetricComparison,
  CommercialGoalComparison,
  CommercialForecastCalibration,
  CommercialForecastCalibrationMetric,
  CommercialActionEffectiveness,
  CommercialActionEffectivenessStatus,
  CommercialLearningInsight,
  CommercialLearningInsightType,
  CommercialLearningConfidence,
  CommercialHistoricalLearningSummary,
  CommercialLineOutcome,
  CommercialExecutionOutcomeSnapshot
} from '../types/commercialReview';
import { roundMoney, roundPercent } from '../config/financialDefaults';

/**
 * Compara uma Meta Comercial (CommercialGoal) contra os dados realizados do ciclo.
 */
export function compareGoalVsActual(
  goal: any,
  finalActuals: CommercialExecutionOutcomeSnapshot['finalActuals']
): CommercialGoalComparison {
  const goalId = String(goal.goalId || goal.id || 'unknown_goal');
  const title = String(goal.title || 'Meta Comercial');
  const type = String(goal.type || 'revenue');
  const targetValue = roundMoney(Number(goal.targetValue || 0));

  let actualValue = 0;
  switch (type) {
    case 'revenue':
      actualValue = finalActuals.revenue;
      break;
    case 'operating_profit':
      actualValue = finalActuals.operatingProfit;
      break;
    case 'contribution_margin':
      actualValue = finalActuals.contributionMargin;
      break;
    case 'units':
      actualValue = finalActuals.units;
      break;
    case 'average_ticket':
      actualValue = finalActuals.averageTicket;
      break;
    default:
      actualValue = finalActuals.revenue;
      break;
  }
  actualValue = roundMoney(actualValue);

  const gapAbsolute = roundMoney(actualValue - targetValue);
  const gapPercent = targetValue !== 0 ? roundPercent((gapAbsolute / Math.abs(targetValue)) * 100) : null;
  const attained = actualValue >= targetValue;

  return {
    goalId,
    title,
    type,
    targetValue,
    actualValue,
    gapAbsolute,
    gapPercent,
    attained,
    confidence: finalActuals.confidence
  };
}

/**
 * Calcula a ponte de variação de receita (Variance Bridge) com decomposição em Volume, Ticket e Residual de Planejamento.
 * Garante que: orderVolumeEffect + ticketEffect + planningResidual === totalRevenueVariance (cent-exact).
 */
export function calculateRevenueVarianceBridge(params: {
  budgetRevenue: number;
  budgetOrders: number;
  budgetAverageTicket: number;
  actualRevenue: number;
  actualOrders: number;
  actualAverageTicket: number;
  // Custos e despesas para drivers adicionais
  budgetCogs?: number;
  actualCogs?: number;
  budgetGateway?: number;
  actualGateway?: number;
  budgetShipping?: number;
  actualShipping?: number;
  budgetMarketing?: number;
  actualMarketing?: number;
  budgetFixedExpenses?: number;
  actualFixedExpenses?: number;
}): CommercialVarianceBridge {
  const budgetRevenue = roundMoney(params.budgetRevenue || 0);
  const budgetOrders = Math.max(0, params.budgetOrders || 0);
  const budgetAverageTicket = roundMoney(params.budgetAverageTicket || (budgetOrders > 0 ? budgetRevenue / budgetOrders : 0));

  const actualRevenue = roundMoney(params.actualRevenue || 0);
  const actualOrders = Math.max(0, params.actualOrders || 0);
  const actualAverageTicket = roundMoney(params.actualAverageTicket || (actualOrders > 0 ? actualRevenue / actualOrders : 0));

  const totalVariance = roundMoney(actualRevenue - budgetRevenue);

  // Efeito Volume de Pedidos = (Actual Orders - Budget Orders) * Budget Average Ticket
  const orderVolumeEffect = roundMoney((actualOrders - budgetOrders) * budgetAverageTicket);

  // Efeito Ticket Médio = Actual Orders * (Actual Average Ticket - Budget Average Ticket)
  const ticketEffect = roundMoney(actualOrders * (actualAverageTicket - budgetAverageTicket));

  // Residual = Total Variance - Volume Effect - Ticket Effect
  const planningResidual = roundMoney(totalVariance - (orderVolumeEffect + ticketEffect));

  let residualExplanation: string | undefined = undefined;
  if (Math.abs(planningResidual) > 0.01) {
    residualExplanation = 'Inconsistência entre meta de receita e composição Orders × Average Ticket.';
  }

  const isCentExact = Math.abs((orderVolumeEffect + ticketEffect + planningResidual) - totalVariance) <= 0.01;

  const drivers: CommercialVarianceDriver[] = [];

  // 1. Order Volume Driver
  if (Math.abs(orderVolumeEffect) > 0.01) {
    const favorable = orderVolumeEffect >= 0;
    drivers.push({
      driver: 'ORDER_VOLUME',
      amount: orderVolumeEffect,
      direction: favorable ? 'favorable' : 'unfavorable',
      favorable,
      explanation: `Variação de ${actualOrders - budgetOrders} pedidos vs meta com ticket base de R$ ${budgetAverageTicket.toFixed(2)}.`
    });
  }

  // 2. Average Ticket Driver
  if (Math.abs(ticketEffect) > 0.01) {
    const favorable = ticketEffect >= 0;
    drivers.push({
      driver: 'AVERAGE_TICKET',
      amount: ticketEffect,
      direction: favorable ? 'favorable' : 'unfavorable',
      favorable,
      explanation: `Variação de R$ ${(actualAverageTicket - budgetAverageTicket).toFixed(2)} no ticket médio sobre ${actualOrders} pedidos realizados.`
    });
  }

  // 3. Planning Residual Driver (se houver)
  if (Math.abs(planningResidual) > 0.01) {
    drivers.push({
      driver: 'PLANNING_RESIDUAL',
      amount: planningResidual,
      direction: planningResidual >= 0 ? 'favorable' : 'unfavorable',
      favorable: planningResidual >= 0,
      explanation: residualExplanation || 'Ajuste residual matemático de planejamento.'
    });
  }

  // 4. COGS Driver (se informado)
  if (params.budgetCogs !== undefined && params.actualCogs !== undefined) {
    const cogsDiff = roundMoney(params.budgetCogs - params.actualCogs); // Menos custo = favorável
    if (Math.abs(cogsDiff) > 0.01) {
      drivers.push({
        driver: 'COGS',
        amount: cogsDiff,
        direction: cogsDiff >= 0 ? 'favorable' : 'unfavorable',
        favorable: cogsDiff >= 0,
        explanation: `CPV realizado R$ ${params.actualCogs.toFixed(2)} vs orçado R$ ${params.budgetCogs.toFixed(2)}.`
      });
    }
  }

  // 5. Gateway Driver (se informado)
  if (params.budgetGateway !== undefined && params.actualGateway !== undefined) {
    const gwDiff = roundMoney(params.budgetGateway - params.actualGateway);
    if (Math.abs(gwDiff) > 0.01) {
      drivers.push({
        driver: 'GATEWAY_FEES',
        amount: gwDiff,
        direction: gwDiff >= 0 ? 'favorable' : 'unfavorable',
        favorable: gwDiff >= 0,
        explanation: `Taxas de gateway realizadas R$ ${params.actualGateway.toFixed(2)} vs orçadas R$ ${params.budgetGateway.toFixed(2)}.`
      });
    }
  }

  // 6. Shipping Subsidy Driver (se informado)
  if (params.budgetShipping !== undefined && params.actualShipping !== undefined) {
    const shipDiff = roundMoney(params.budgetShipping - params.actualShipping);
    if (Math.abs(shipDiff) > 0.01) {
      drivers.push({
        driver: 'SHIPPING',
        amount: shipDiff,
        direction: shipDiff >= 0 ? 'favorable' : 'unfavorable',
        favorable: shipDiff >= 0,
        explanation: `Subsídio de frete realizado R$ ${params.actualShipping.toFixed(2)} vs orçado R$ ${params.budgetShipping.toFixed(2)}.`
      });
    }
  }

  // 7. Marketing Driver (se informado)
  if (params.budgetMarketing !== undefined && params.actualMarketing !== undefined) {
    const mktDiff = roundMoney(params.budgetMarketing - params.actualMarketing);
    if (Math.abs(mktDiff) > 0.01) {
      drivers.push({
        driver: 'MARKETING',
        amount: mktDiff,
        direction: mktDiff >= 0 ? 'favorable' : 'unfavorable',
        favorable: mktDiff >= 0,
        explanation: `Investimento em tráfego/marketing realizado R$ ${params.actualMarketing.toFixed(2)} vs orçado R$ ${params.budgetMarketing.toFixed(2)}.`
      });
    }
  }

  // 8. Fixed Expenses Driver (se informado)
  if (params.budgetFixedExpenses !== undefined && params.actualFixedExpenses !== undefined) {
    const expDiff = roundMoney(params.budgetFixedExpenses - params.actualFixedExpenses);
    if (Math.abs(expDiff) > 0.01) {
      drivers.push({
        driver: 'FIXED_EXPENSES',
        amount: expDiff,
        direction: expDiff >= 0 ? 'favorable' : 'unfavorable',
        favorable: expDiff >= 0,
        explanation: `Despesas fixas realizadas R$ ${params.actualFixedExpenses.toFixed(2)} vs orçadas R$ ${params.budgetFixedExpenses.toFixed(2)}.`
      });
    }
  }

  return {
    budgetRevenue,
    actualRevenue,
    totalVariance,
    orderVolumeEffect,
    ticketEffect,
    planningResidual,
    residualExplanation,
    isCentExact,
    drivers
  };
}

/**
 * Compara uma métrica do Budget contra o Realizado respeitando sinais e natureza de receita vs despesa.
 * Se o budget estiver ausente (undefined/null), marca como available: false para evitar falsa variância contra zero.
 */
export function compareMetricBudgetVsActual(
  budgetVal: number | undefined | null,
  actualVal: number,
  isExpense: boolean = false
): CommercialMetricComparison {
  if (budgetVal === undefined || budgetVal === null) {
    return {
      budget: 0,
      actual: roundMoney(actualVal || 0),
      varianceAbsolute: 0,
      variancePercent: null,
      favorable: true,
      available: false,
      unavailableReason: 'TARGET_UNAVAILABLE'
    };
  }

  const budget = roundMoney(budgetVal);
  const actual = roundMoney(actualVal || 0);

  // Para receita/lucro: actual > budget é favorável (+), variance = actual - budget
  // Para custo/despesa: actual < budget é favorável (+), variance = budget - actual
  let varianceAbsolute = isExpense ? roundMoney(budget - actual) : roundMoney(actual - budget);
  const favorable = varianceAbsolute >= 0;

  let variancePercent: number | null = null;
  if (budget !== 0) {
    // Percentual de variação em relação ao orçado
    variancePercent = roundPercent((varianceAbsolute / Math.abs(budget)) * 100);
  }

  return {
    budget,
    actual,
    varianceAbsolute,
    variancePercent,
    favorable,
    available: true
  };
}

/**
 * Realiza calibração determinística de Forecast vs Actual para todas as métricas financeiras.
 */
export function calibrateForecastVsActual(params: {
  forecastId?: string;
  forecastTitle?: string;
  forecastRevenue: number;
  actualRevenue: number;
  forecastOrders: number;
  actualOrders: number;
  forecastUnits: number;
  actualUnits: number;
  forecastAverageTicket: number;
  actualAverageTicket: number;
  forecastContributionMargin?: number;
  actualContributionMargin?: number;
  forecastOperatingProfit?: number;
  actualOperatingProfit?: number;
}): CommercialForecastCalibration {
  const metrics: CommercialForecastCalibrationMetric[] = [];

  const addMetric = (
    metricName: CommercialForecastCalibrationMetric['metric'],
    fcVal: number,
    actVal: number
  ) => {
    const forecast = roundMoney(fcVal || 0);
    const actual = roundMoney(actVal || 0);
    const error = roundMoney(actual - forecast);
    const absoluteError = Math.abs(error);
    const errorPercent = forecast !== 0 ? roundPercent((error / Math.abs(forecast)) * 100) : null;

    let direction: 'over_forecast' | 'under_forecast' | 'accurate' = 'accurate';
    // Margem de tolerância de 1.5% para precisão
    if (errorPercent !== null) {
      if (errorPercent > 1.5) {
        direction = 'under_forecast'; // Real superou o previsto (previsão foi subestimada)
      } else if (errorPercent < -1.5) {
        direction = 'over_forecast'; // Real foi menor que o previsto (previsão foi superestimada)
      }
    } else {
      if (error > 0.5) direction = 'under_forecast';
      else if (error < -0.5) direction = 'over_forecast';
    }

    metrics.push({
      metric: metricName,
      forecastValue: forecast,
      actualValue: actual,
      error,
      absoluteError,
      errorPercent,
      direction
    });
  };

  addMetric('revenue', params.forecastRevenue, params.actualRevenue);
  addMetric('orders', params.forecastOrders, params.actualOrders);
  addMetric('units', params.forecastUnits, params.actualUnits);
  addMetric('averageTicket', params.forecastAverageTicket, params.actualAverageTicket);

  if (params.forecastContributionMargin !== undefined && params.actualContributionMargin !== undefined) {
    addMetric('contributionMargin', params.forecastContributionMargin, params.actualContributionMargin);
  }
  if (params.forecastOperatingProfit !== undefined && params.actualOperatingProfit !== undefined) {
    addMetric('operatingProfit', params.forecastOperatingProfit, params.actualOperatingProfit);
  }

  // Calcular MAPE (Mean Absolute Percentage Error)
  const validPercents = metrics.map(m => m.errorPercent !== null ? Math.abs(m.errorPercent) : null).filter((p): p is number => p !== null);
  const mape = validPercents.length > 0 ? roundPercent(validPercents.reduce((a, b) => a + b, 0) / validPercents.length) : null;

  // Viés geral (baseado no erro de receita e lucro)
  const revMetric = metrics.find(m => m.metric === 'revenue');
  let overallBias: 'over_forecast' | 'under_forecast' | 'balanced' = 'balanced';
  if (revMetric) {
    if (revMetric.direction === 'over_forecast') overallBias = 'over_forecast';
    else if (revMetric.direction === 'under_forecast') overallBias = 'under_forecast';
  }

  let calibrationRecommendation: string | undefined = undefined;
  if (overallBias === 'over_forecast') {
    calibrationRecommendation = `Forecast superestimou a receita em ${Math.abs(revMetric?.errorPercent || 0)}%. Sugere-se calibrar premissas de conversão e ticket médio para o próximo ciclo.`;
  } else if (overallBias === 'under_forecast') {
    calibrationRecommendation = `Forecast subestimou a receita em ${Math.abs(revMetric?.errorPercent || 0)}%. Oportunidade de elevar metas de volume no próximo ciclo.`;
  } else {
    calibrationRecommendation = 'Forecast apresentou aderência precisa aos dados realizados.';
  }

  return {
    forecastId: params.forecastId,
    forecastTitle: params.forecastTitle,
    metrics,
    meanAbsolutePercentageError: mape,
    overallBias,
    calibrationRecommendation
  };
}

/**
 * Avalia a eficácia de uma ação comercial individual de forma canônica e estruturada.
 */
export function evaluateActionEffectiveness(action: any): CommercialActionEffectiveness {
  const actionId = String(action.id || action.actionId || 'act_unknown');
  const executionCycleId = String(action.executionCycleId || 'cycle_unknown');
  const title = String(action.title || 'Ação Comercial');
  const priority = action.priority || 'medium';
  const productLine = action.productLine;
  const channel = action.channel;
  const owner = action.owner || action.assignedTo;

  const expectedRevenue = action.targetRevenue !== undefined ? Number(action.targetRevenue) : action.expectedImpact?.revenue;
  const expectedUnits = action.targetUnits !== undefined ? Number(action.targetUnits) : action.expectedImpact?.units;
  const expectedContributionMargin = action.targetContributionMargin !== undefined ? Number(action.targetContributionMargin) : action.expectedImpact?.contributionMargin;

  const actualImpact = action.actualImpact || {};
  const actualRevenue = roundMoney(Number(actualImpact.revenue || 0));
  const actualUnits = Math.max(0, Number(actualImpact.units || 0));
  const actualContributionMargin = actualImpact.contributionMargin !== undefined ? roundMoney(Number(actualImpact.contributionMargin)) : undefined;

  let revenueVarianceAbsolute: number | undefined = undefined;
  let revenueVariancePercent: number | null = null;

  if (expectedRevenue !== undefined && expectedRevenue !== null) {
    revenueVarianceAbsolute = roundMoney(actualRevenue - Number(expectedRevenue));
    if (Number(expectedRevenue) > 0) {
      revenueVariancePercent = roundPercent((revenueVarianceAbsolute / Number(expectedRevenue)) * 100);
    }
  }

  const impactAttribution = (actualImpact.impactAttribution || action.impactAttribution || 'insufficient') as CommercialActionEffectiveness['impactAttribution'];
  const confidence = (actualImpact.confidence || action.confidence || 'insufficient') as CommercialActionEffectiveness['confidence'];
  const costCoveragePercent = actualImpact.costCoveragePercent !== undefined ? Number(actualImpact.costCoveragePercent) : undefined;
  const executionStatus = action.executionStatus || action.status || 'planned';
  const completedAt = action.completedAt;

  let effectivenessStatus: CommercialActionEffectivenessStatus = 'insufficient';

  if (executionStatus === 'cancelled') {
    effectivenessStatus = 'cancelled';
  } else if (impactAttribution === 'insufficient' || confidence === 'insufficient') {
    effectivenessStatus = 'insufficient';
  } else if (expectedRevenue !== undefined && Number(expectedRevenue) > 0) {
    const ratio = actualRevenue / Number(expectedRevenue);
    if (ratio >= 1.05) {
      effectivenessStatus = 'exceeded';
    } else if (ratio >= 0.90) {
      effectivenessStatus = 'met';
    } else {
      effectivenessStatus = 'below_expected';
    }
  } else if (actualRevenue > 0) {
    effectivenessStatus = 'met';
  } else {
    effectivenessStatus = 'below_expected';
  }

  let attributionNote = '';
  switch (impactAttribution) {
    case 'direct':
      attributionNote = 'Resultado atribuído diretamente à ação comercial através de identificador determinístico.';
      break;
    case 'correlated':
      attributionNote = 'Resultado observado/associado à linha/janela no período.';
      break;
    case 'estimated':
      attributionNote = 'Impacto estimado com base em modelagem paramétrica.';
      break;
    case 'insufficient':
    default:
      attributionNote = 'Dados insuficientes para atribuição causal conclusiva.';
      break;
  }

  return {
    actionId,
    executionCycleId,
    title,
    priority,
    productLine,
    channel,
    owner,
    expectedRevenue,
    expectedUnits,
    expectedContributionMargin,
    actualRevenue,
    actualUnits,
    actualContributionMargin,
    revenueVarianceAbsolute,
    revenueVariancePercent,
    impactAttribution,
    confidence,
    costCoveragePercent,
    executionStatus,
    completedAt,
    effectivenessStatus,
    attributionNote
  };
}

/**
 * Gera insights de aprendizado contínuo estruturados com evidências obrigatórias e passos acionáveis.
 */
export function generateCommercialLearningInsights(params: {
  reviewId: string;
  varianceBridge: CommercialVarianceBridge;
  budgetComparison: {
    revenue: CommercialMetricComparison;
    contributionMargin: CommercialMetricComparison;
    operatingProfit: CommercialMetricComparison;
    orders: CommercialMetricComparison;
    averageTicket: CommercialMetricComparison;
  };
  forecastCalibration?: CommercialForecastCalibration;
  lineOutcomes: CommercialLineOutcome[];
  actionEffectivenessList: CommercialActionEffectiveness[];
  costCoveragePercent: number;
  overallConfidence: CommercialLearningConfidence;
}): CommercialLearningInsight[] {
  const insights: CommercialLearningInsight[] = [];
  const { reviewId, varianceBridge, budgetComparison, forecastCalibration, lineOutcomes, actionEffectivenessList, costCoveragePercent, overallConfidence } = params;

  let insightIndex = 1;

  // 1. Insight de Variance Bridge de Receita (Volume vs Ticket)
  if (Math.abs(varianceBridge.totalVariance) > 10) {
    const isRevPositive = varianceBridge.totalVariance > 0;
    const mainDriver = Math.abs(varianceBridge.orderVolumeEffect) >= Math.abs(varianceBridge.ticketEffect)
      ? 'volume de pedidos'
      : 'ticket médio';

    const evidence = [
      {
        metric: 'Receita Orçada',
        referenceValue: `R$ ${varianceBridge.budgetRevenue.toFixed(2)}`,
        actualValue: `R$ ${varianceBridge.actualRevenue.toFixed(2)}`,
        variance: `R$ ${varianceBridge.totalVariance.toFixed(2)}`,
        source: 'Budget vs Actual'
      },
      {
        metric: 'Efeito Volume',
        referenceValue: `${budgetComparison.orders.budget} pedidos`,
        actualValue: `${budgetComparison.orders.actual} pedidos`,
        variance: `R$ ${varianceBridge.orderVolumeEffect.toFixed(2)}`,
        source: 'Variance Bridge'
      },
      {
        metric: 'Efeito Ticket Médio',
        referenceValue: `R$ ${budgetComparison.averageTicket.budget.toFixed(2)}`,
        actualValue: `R$ ${budgetComparison.averageTicket.actual.toFixed(2)}`,
        variance: `R$ ${varianceBridge.ticketEffect.toFixed(2)}`,
        source: 'Variance Bridge'
      }
    ];

    if (Math.abs(varianceBridge.planningResidual) > 0.01) {
      evidence.push({
        metric: 'Residual de Planejamento',
        referenceValue: 'R$ 0.00',
        actualValue: `R$ ${varianceBridge.planningResidual.toFixed(2)}`,
        variance: `R$ ${varianceBridge.planningResidual.toFixed(2)}`,
        source: 'Planning Math Gap'
      });
    }

    insights.push({
      id: `ins_${reviewId}_${insightIndex++}`,
      type: 'BUDGET_PLANNING',
      title: isRevPositive
        ? `Receita superou o orçado impulsionada por ${mainDriver}`
        : `Desvio na receita orçada decorrente principalmente de ${mainDriver}`,
      description: `A receita total apresentou variação de R$ ${varianceBridge.totalVariance.toFixed(2)} (${budgetComparison.revenue.variancePercent}% vs orçado). O efeito de volume contribuiu com R$ ${varianceBridge.orderVolumeEffect.toFixed(2)} e o ticket médio com R$ ${varianceBridge.ticketEffect.toFixed(2)}.`,
      evidence,
      metrics: {
        totalVariance: varianceBridge.totalVariance,
        orderVolumeEffect: varianceBridge.orderVolumeEffect,
        ticketEffect: varianceBridge.ticketEffect,
        planningResidual: varianceBridge.planningResidual
      },
      confidence: overallConfidence,
      recommendedNextStep: isRevPositive
        ? 'Incorporar a taxa de conversão observada como premissa base no próximo ciclo.'
        : 'Revisar elasticidade de preços e investimento em atração de tráfego para corrigir o gap de volume.',
      canCreateAction: !isRevPositive,
      sourceReviewId: reviewId
    });
  }

  // 2. Insight de Calibração de Forecast
  if (forecastCalibration && forecastCalibration.metrics.length > 0) {
    const revMetric = forecastCalibration.metrics.find(m => m.metric === 'revenue');
    if (revMetric && Math.abs(revMetric.error) > 10) {
      const isUnder = revMetric.direction === 'under_forecast';
      insights.push({
        id: `ins_${reviewId}_${insightIndex++}`,
        type: 'FORECAST_CALIBRATION',
        title: isUnder
          ? 'Forecast subestimou a demanda realizada'
          : 'Forecast superestimou o faturamento no ciclo',
        description: `O modelo de Forecast projetou R$ ${revMetric.forecastValue.toFixed(2)}, enquanto o realizado foi R$ ${revMetric.actualValue.toFixed(2)} (erro de ${revMetric.errorPercent}%).`,
        evidence: [
          {
            metric: 'Receita Prevista no Forecast',
            referenceValue: `R$ ${revMetric.forecastValue.toFixed(2)}`,
            actualValue: `R$ ${revMetric.actualValue.toFixed(2)}`,
            variance: `R$ ${revMetric.error.toFixed(2)}`,
            source: 'Forecast Model Calibration'
          },
          {
            metric: 'MAPE do Modelo',
            referenceValue: '0.00%',
            actualValue: `${forecastCalibration.meanAbsolutePercentageError || 0}%`,
            variance: `${forecastCalibration.meanAbsolutePercentageError || 0}%`,
            source: 'Forecast Metrics'
          }
        ],
        metrics: {
          forecastError: revMetric.error,
          forecastErrorPercent: revMetric.errorPercent,
          overallBias: forecastCalibration.overallBias
        },
        confidence: overallConfidence,
        recommendedNextStep: forecastCalibration.calibrationRecommendation || 'Ajustar calibradores de sazonalidade e taxa de conversão.',
        canCreateAction: false,
        sourceReviewId: reviewId
      });
    }
  }

  // 3. Insight de Eficácia de Ações Comerciais
  const completedActions = actionEffectivenessList.filter(a => a.executionStatus === 'completed');
  const directActions = completedActions.filter(a => a.impactAttribution === 'direct');
  const exceededActions = completedActions.filter(a => a.effectivenessStatus === 'exceeded');

  if (completedActions.length > 0) {
    const topAction = completedActions.sort((a, b) => b.actualRevenue - a.actualRevenue)[0];
    insights.push({
      id: `ins_${reviewId}_${insightIndex++}`,
      type: 'ACTION_EFFECTIVENESS',
      title: `Eficácia de Ações: ${completedActions.length} concluídas (${exceededActions.length} superaram a meta)`,
      description: `${directActions.length} ação(ões) tiveram atribuição direta comprovada. Ação mais impactante: "${topAction.title}" com R$ ${topAction.actualRevenue.toFixed(2)} (${topAction.attributionNote}).`,
      evidence: [
        {
          metric: 'Total de Ações Concluídas',
          referenceValue: `${actionEffectivenessList.length} planejadas`,
          actualValue: `${completedActions.length} concluídas`,
          variance: `${completedActions.length - actionEffectivenessList.length}`,
          source: 'Execution Engine'
        },
        {
          metric: 'Receita da Top Ação',
          referenceValue: `R$ ${(topAction.expectedRevenue || 0).toFixed(2)} esperada`,
          actualValue: `R$ ${topAction.actualRevenue.toFixed(2)} realizada`,
          variance: `R$ ${(topAction.revenueVarianceAbsolute || 0).toFixed(2)}`,
          source: 'Action Impact Attribution'
        }
      ],
      metrics: {
        completedCount: completedActions.length,
        directCount: directActions.length,
        topActionRevenue: topAction.actualRevenue
      },
      confidence: topAction.confidence,
      recommendedNextStep: topAction.effectivenessStatus === 'exceeded'
        ? `Escalar campanha da ação "${topAction.title}" para o próximo ciclo.`
        : 'Avaliar gargalos de execução nas ações com resultado abaixo do esperado.',
      canCreateAction: true,
      sourceReviewId: reviewId
    });
  }

  // 4. Insight de Performance por Linha de Produto
  if (lineOutcomes.length > 0) {
    const bestMarginLine = [...lineOutcomes].sort((a, b) => Number(b.contributionMarginPercent || 0) - Number(a.contributionMarginPercent || 0))[0];
    const topRevenueLine = [...lineOutcomes].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))[0];

    const bestMarginPercent = Number(bestMarginLine.contributionMarginPercent || 0);
    const bestMargin = Number(bestMarginLine.contributionMargin || 0);
    const topRev = Number(topRevenueLine.revenue || 0);
    const topShare = Number(topRevenueLine.shareOfRevenuePercent || 0);

    insights.push({
      id: `ins_${reviewId}_${insightIndex++}`,
      type: 'PRODUCT_LINE',
      title: `Linha ${bestMarginLine.line} liderou em Margem (${bestMarginPercent.toFixed(1)}%)`,
      description: `A linha ${topRevenueLine.line} gerou a maior receita (R$ ${topRev.toFixed(2)} - ${topShare.toFixed(1)}% do total), enquanto a linha ${bestMarginLine.line} entregou a melhor margem de contribuição.`,
      evidence: [
        {
          metric: `Margem Linha ${bestMarginLine.line}`,
          referenceValue: 'Meta 45.00%',
          actualValue: `${bestMarginPercent.toFixed(2)}%`,
          variance: `R$ ${bestMargin.toFixed(2)}`,
          source: 'Line Profitability Engine'
        },
        {
          metric: `Share Linha ${topRevenueLine.line}`,
          referenceValue: '33.00%',
          actualValue: `${topShare.toFixed(2)}%`,
          variance: `R$ ${topRev.toFixed(2)}`,
          source: 'Revenue Breakdown'
        }
      ],
      metrics: {
        topRevenueLine: topRevenueLine.line,
        topRevenue: topRev,
        bestMarginLine: bestMarginLine.line,
        bestMarginPercent: bestMarginPercent
      },
      confidence: bestMarginLine.confidence || 'medium',
      recommendedNextStep: `Priorizar mix de produtos da linha ${bestMarginLine.line} em campanhas de alta conversão.`,
      canCreateAction: true,
      sourceReviewId: reviewId
    });
  }

  // 5. Insight de Governança e Qualidade de Custos
  if (costCoveragePercent < 100) {
    const cov = Number(costCoveragePercent || 0);
    insights.push({
      id: `ins_${reviewId}_${insightIndex++}`,
      type: 'COST_QUALITY',
      title: `Cobertura de Custo em ${cov.toFixed(1)}% exige saneamento cadastral`,
      description: `Foram detectados itens vendidos sem snapshot de custo histórico imutável ou cadastro de custo de produção, reduzindo a precisão da margem apurada.`,
      evidence: [
        {
          metric: 'Cobertura de Custo Real',
          referenceValue: '100.00%',
          actualValue: `${cov.toFixed(2)}%`,
          variance: `${(cov - 100).toFixed(2)}%`,
          source: 'Cost Governance Engine'
        }
      ],
      metrics: {
        costCoveragePercent: cov
      },
      confidence: 'medium',
      recommendedNextStep: 'Cadastrar custos de corte e produção faltantes antes do encerramento do próximo ciclo.',
      canCreateAction: true,
      sourceReviewId: reviewId
    });
  }

  return insights;
}

/**
 * Calcula sumário de aprendizado histórico agregado a partir de reviews aprovados.
 * Aplica governança estrita de tamanho de amostra (Sample Size Rule).
 */
export function calculateHistoricalLearningSummary(params: {
  reviews: CommercialExecutionReview[];
  periodStart: string;
  periodEnd: string;
  productLineFilter?: string;
}): CommercialHistoricalLearningSummary {
  const { reviews, periodStart, periodEnd, productLineFilter } = params;

  // Filtrar apenas reviews aprovados que intersectam o período
  const approvedReviews = reviews.filter(r => {
    if (r.status !== 'approved' || !r.outcomeSnapshot) return false;
    if (periodStart && r.periodEnd && r.periodEnd < periodStart) return false;
    if (periodEnd && r.periodStart && r.periodStart > periodEnd) return false;
    return true;
  });
  const reviewCount = approvedReviews.length;

  // Governança de Amostra: < 3 = insufficient, 3-5 = medium, > 5 = high
  let confidence: CommercialLearningConfidence = 'insufficient';
  let confidenceReason = '';

  if (reviewCount < 3) {
    confidence = 'insufficient';
    confidenceReason = `Amostra de ${reviewCount} ciclo(s) aprovado(s) é insuficiente para estabelecer padrões históricos conclusivos (mínimo exigido: 3).`;
  } else if (reviewCount <= 5) {
    confidence = 'medium';
    confidenceReason = `Amostra moderada de ${reviewCount} ciclos aprovados confere confiabilidade média às tendências observadas.`;
  } else {
    // Verificar se a maioria tem cost coverage alta
    const avgCostCoverage = approvedReviews.reduce((acc, r) => acc + (r.outcomeSnapshot?.costCoveragePercent || 0), 0) / reviewCount;
    if (avgCostCoverage >= 90) {
      confidence = 'high';
      confidenceReason = `Amostra robusta de ${reviewCount} ciclos aprovados com cobertura média de custos de ${avgCostCoverage.toFixed(1)}%.`;
    } else {
      confidence = 'medium';
      confidenceReason = `Amostra de ${reviewCount} ciclos, mas cobertura média de custos (${avgCostCoverage.toFixed(1)}%) limita a confiança a medium.`;
    }
  }

  // 1. Variância média de Budget
  const budgetVariances = approvedReviews
    .map(r => r.outcomeSnapshot?.budgetComparisons?.revenue?.variancePercent)
    .filter((v): v is number => typeof v === 'number');
  const averageBudgetVariancePercent = budgetVariances.length > 0
    ? roundPercent(budgetVariances.reduce((a, b) => a + b, 0) / budgetVariances.length)
    : null;

  // 2. Erro e viés médio de Forecast (Mean Error)
  const forecastErrors: number[] = [];
  const forecastPercentages: number[] = [];

  approvedReviews.forEach(r => {
    const fcMetric = r.outcomeSnapshot?.forecastCalibration?.metrics?.find(m => m.metric === 'revenue');
    if (fcMetric) {
      forecastErrors.push(fcMetric.error);
      if (fcMetric.errorPercent !== null) forecastPercentages.push(fcMetric.errorPercent);
    }
  });

  const meanError = forecastErrors.length > 0
    ? roundMoney(forecastErrors.reduce((a, b) => a + b, 0) / forecastErrors.length)
    : 0;

  const averageForecastErrorPercent = forecastPercentages.length > 0
    ? roundPercent(forecastPercentages.reduce((a, b) => a + b, 0) / forecastPercentages.length)
    : null;

  let biasDirection: 'over_forecast' | 'under_forecast' | 'balanced' = 'balanced';
  let biasDescription = 'Previsões equilibradas sem viés sistemático detectado.';

  if (forecastErrors.length > 0) {
    if (meanError > 0) {
      biasDirection = 'under_forecast';
      biasDescription = `Historicamente houve under-forecast (receita média realizada superou previsão em R$ ${meanError.toFixed(2)}).`;
    } else if (meanError < 0) {
      biasDirection = 'over_forecast';
      biasDescription = `Historicamente houve over-forecast (receita média realizada ficou abaixo da previsão em R$ ${Math.abs(meanError).toFixed(2)}).`;
    } else {
      biasDirection = 'balanced';
      biasDescription = 'Previsões perfeitamente equilibradas.';
    }
  }

  // 3. Taxa de conclusão de ações e eficácia de ações com impacto DIRETO
  let totalActionsAll = 0;
  let completedActionsAll = 0;
  let directActionsCompletedAll = 0;
  let directActionsSuccessAll = 0;

  approvedReviews.forEach(r => {
    const summary = r.outcomeSnapshot?.actionEffectivenessSummary;
    if (summary) {
      totalActionsAll += summary.totalActions;
      completedActionsAll += summary.completedActions;
      if (summary.directActionsCompleted !== undefined && summary.directActionsSuccess !== undefined) {
        directActionsCompletedAll += summary.directActionsCompleted;
        directActionsSuccessAll += summary.directActionsSuccess;
      }
    }
  });

  const actionCompletionRate = totalActionsAll > 0
    ? roundPercent((completedActionsAll / totalActionsAll) * 100)
    : 0;

  const directActionEffectivenessRate = directActionsCompletedAll > 0
    ? roundPercent((directActionsSuccessAll / directActionsCompletedAll) * 100)
    : 0;

  // 4. Performance por linha de produto
  const lineStatsMap: Record<string, { totalRevenue: number; totalContributionMargin: number; count: number }> = {};

  approvedReviews.forEach(r => {
    const lineOutcomes = r.outcomeSnapshot?.lineOutcomes || [];
    lineOutcomes.forEach(l => {
      if (productLineFilter && l.line.toUpperCase() !== productLineFilter.toUpperCase()) return;
      if (!lineStatsMap[l.line]) {
        lineStatsMap[l.line] = { totalRevenue: 0, totalContributionMargin: 0, count: 0 };
      }
      lineStatsMap[l.line].totalRevenue = roundMoney(lineStatsMap[l.line].totalRevenue + l.revenue);
      lineStatsMap[l.line].totalContributionMargin = roundMoney(lineStatsMap[l.line].totalContributionMargin + l.contributionMargin);
      lineStatsMap[l.line].count += 1;
    });
  });

  const grandTotalRevenue = Object.values(lineStatsMap).reduce((acc, s) => acc + s.totalRevenue, 0);

  const linePerformanceSummary = Object.keys(lineStatsMap).map(line => {
    const s = lineStatsMap[line];
    const avgMarginPercent = s.totalRevenue > 0
      ? roundPercent((s.totalContributionMargin / s.totalRevenue) * 100)
      : 0;
    const shareOfRevenuePercent = grandTotalRevenue > 0
      ? roundPercent((s.totalRevenue / grandTotalRevenue) * 100)
      : 0;

    return {
      line,
      totalRevenue: s.totalRevenue,
      averageContributionMarginPercent: avgMarginPercent,
      shareOfRevenuePercent,
      reviewsCount: s.count
    };
  }).sort((a, b) => b.totalRevenue - a.totalRevenue);

  // 5. Sugestão de Calibração (se houver amostra e viés)
  let suggestedCalibrationAdjustment: CommercialHistoricalLearningSummary['suggestedCalibrationAdjustment'] = undefined;
  if (reviewCount >= 3 && averageForecastErrorPercent !== null && Math.abs(averageForecastErrorPercent) > 2) {
    suggestedCalibrationAdjustment = {
      revenueAdjustmentPercent: roundPercent(-averageForecastErrorPercent * 0.5), // Fator de amortecimento prudente de 50%
      notes: `Recomendação de ajuste moderado de ${(-averageForecastErrorPercent * 0.5).toFixed(1)}% nas projeções de receita para compensar o viés histórico de ${biasDirection}.`,
      evidence: [
        {
          metric: 'Viés Histórico de Forecast',
          referenceValue: '0.00%',
          actualValue: `${averageForecastErrorPercent.toFixed(2)}%`,
          variance: `R$ ${meanError.toFixed(2)}`,
          source: `${reviewCount} Reviews Aprovados`
        }
      ]
    };
  }

  // 6. Taxa histórica de alcance de Metas Comerciais (Goal Attainment Rate)
  let totalGoalsEvaluated = 0;
  let totalGoalsAttained = 0;

  approvedReviews.forEach(r => {
    const comparisons = r.outcomeSnapshot?.goalComparisons || [];
    comparisons.forEach(g => {
      totalGoalsEvaluated += 1;
      if (g.attained) {
        totalGoalsAttained += 1;
      }
    });
  });

  const goalAttainmentRate = totalGoalsEvaluated > 0
    ? roundPercent((totalGoalsAttained / totalGoalsEvaluated) * 100)
    : null;

  return {
    reviewCount,
    periodStart,
    periodEnd,
    productLineFilter,
    averageBudgetVariancePercent,
    averageForecastErrorPercent,
    forecastBias: {
      meanError,
      direction: biasDirection,
      biasDescription,
      sampleSize: reviewCount
    },
    goalAttainmentRate,
    actionCompletionRate,
    directActionEffectivenessRate,
    linePerformanceSummary,
    suggestedCalibrationAdjustment,
    confidence,
    confidenceReason
  };
}
