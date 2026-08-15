import { PaymentStatus } from './order';

export type AccountPlanCategory =
  | 'RECEITA'
  | 'COGS'
  | 'DESPESA_VARIAVEL'
  | 'DESPESA_FIXA'
  | 'MARKETING'
  | 'FRETE'
  | 'TAXA_GATEWAY'
  | 'INVESTIMENTO'
  | 'IMPOSTO'
  | 'FORNECEDOR'
  | 'OUTROS'
  | 'AJUSTE';

export interface FinancialMetrics {
  totalRevenue: number;
  totalOrders: number;
  averageTicket: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  pixRevenue: number;
  cardRevenue: number;
  grossProfit?: number;
}

export interface FinancialOverviewMetrics {
  grossSales: number;           // Vendas brutas / Faturamento Bruto de pedidos válidos
  totalPaid: number;            // Recebido (paidAmount)
  totalPending: number;         // A receber (pendingAmount)
  totalRefunded: number;        // Reembolsado (refundedAmount)
  netReceived: number;          // Receita líquida recebida (paidAmount - refundedAmount)
  overdueOrdersCount: number;   // Pedidos atrasados (quantidade)
  overdueOrdersAmount: number;  // Pedidos atrasados (valor a receber)
  totalOrders: number;
  approvedCount: number;
  partialCount: number;
  pendingCount: number;
  refundedCount: number;
}

export interface FinancialDREStatement {
  // 1. Receita
  grossRevenue: number;         // Faturamento Bruto (pedidos válidos)
  totalPaid: number;            // Receita Recebida efetivamente
  totalRefunded: number;        // Reembolsos / Estornos
  netReceived: number;          // Receita Líquida Recebida (totalPaid - totalRefunded)
  pendingReceivables: number;   // Saldo a Receber (pendingAmount)

  // 2. Custos Diretos (COGS / CPV)
  cogs: number;                 // Custo das Mercadorias Vendidas (soma dos snapshots)
  cogsCompleteOrders: number;   // Pedidos com custo histórico 100% conhecido
  cogsEstimatedOrders: number;  // Pedidos com custo estimado
  costCoveragePercent: number;  // Cobertura de Custo (% de itens/pedidos com snapshot real)
  isCostEstimated: boolean;     // Flag: true se cobertura < 100%

  // 3. Lucro Bruto
  grossProfit: number;          // Receita Líquida Recebida - COGS
  grossMarginPercent: number;   // (grossProfit / netReceived) * 100

  // 4. Custos e Despesas Variáveis
  gatewayFees: number;          // Taxas de Pagamento (Mercado Pago, PIX, Cartão)
  shippingCharged: number;      // Frete cobrado dos clientes
  shippingActualCost: number;   // Frete real pago pela loja
  shippingSubsidy: number;      // Subsídio de Frete (max(0, shippingActualCost - shippingCharged))
  variableExpenses: number;     // Embalagens, insumos, terceirizações, comissões
  totalVariableCosts: number;   // gatewayFees + shippingSubsidy + variableExpenses

  // 5. Despesas Operacionais Fixas
  fixedExpenses: number;        // Aluguel, energia, internet, software, hospedagem, etc.

  // 6. Marketing / Tráfego
  marketingExpenses: number;    // Meta Ads, Google Ads, impulsionamentos

  // 7. Lucro Operacional & Margem
  operatingProfit: number;      // Lucro Bruto - totalVariableCosts - fixedExpenses - marketingExpenses
  operatingMarginPercent: number; // (operatingProfit / netReceived) * 100

  // 8. Fluxo de Caixa (Visão de Entradas e Saídas)
  cashIn: number;               // Entradas no caixa (Recebimentos de pedidos + Aportes)
  cashOut: number;              // Saídas no caixa (Reembolsos + Despesas Pagas + Custos + Investimentos)
  netCashFlow: number;          // cashIn - cashOut
  capexInvestments: number;     // Investimentos em máquinas, computadores, etc. (CAPEX)
}

export interface ProductProfitability {
  id: string;
  slug: string;
  name: string;
  line: string;                 // 'FORCE' | 'MARK' | 'PRIME' | 'OUTROS'
  stock: number;
  unitPrice: number;
  unitCost: number;
  isCostSnapshot: boolean;
  unitsSold: number;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  marginPercent: number;
}

export type FinancialEventType =
  | 'payment_created'
  | 'payment_approved'
  | 'partial_payment'
  | 'manual_payment'
  | 'refund'
  | 'partial_refund'
  | 'payment_cancelled'
  | 'payment_rejected'
  | 'manual_adjustment'
  | 'expense_created'
  | 'expense_voided'
  | 'investment_created'
  | 'investment_voided'
  | 'traffic_expense_created'
  | 'traffic_voided'
  | 'gateway_fee_adjusted'
  | 'shipping_cost_recorded'
  | 'payable_created'
  | 'payable_partial_payment'
  | 'payable_paid'
  | 'payable_voided'
  | 'supplier_created'
  | 'supplier_updated'
  | 'supplier_deactivated';

export interface FinancialEvent {
  id: string;
  orderId?: string;
  type: FinancialEventType;
  amount: number;
  previousStatus?: string;
  newStatus?: string;
  previousPaidAmount?: number;
  newPaidAmount?: number;
  previousPendingAmount?: number;
  newPendingAmount?: number;
  previousRefundedAmount?: number;
  newRefundedAmount?: number;
  paymentMethod?: string;
  provider?: string;
  providerPaymentId?: string;
  actorId?: string;
  actorEmail?: string;
  reason?: string;
  category?: AccountPlanCategory | string;
  idempotencyKey?: string;
  createdAt: string;
  recordedAt?: any;
}

export interface CashflowEntry {
  id: string;
  type: 'in' | 'out';
  category: AccountPlanCategory;
  subcategory?: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod?: string;
  status: 'paid' | 'pending' | 'voided';
  orderId?: string;
  idempotencyKey?: string;
  createdAt?: string;
  updatedAt?: string;
  voidedAt?: string;
  voidReason?: string;
  actorEmail?: string;
}

export interface InvestmentEntry {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  description?: string;
  supplier?: string;
  assetType?: 'maquina_dtf' | 'prensa' | 'computador' | 'infraestrutura' | 'outro';
  status: 'active' | 'voided';
  idempotencyKey?: string;
  createdAt?: string;
  voidedAt?: string;
  voidReason?: string;
  actorEmail?: string;
}

export interface TrafficExpenseEntry {
  id: string;
  platform: 'Meta Ads' | 'Google Ads' | 'TikTok' | 'Outro';
  campaignName: string;
  amountSpent: number;
  date: string;
  clicks?: number;
  conversions?: number;
  notes?: string;
  idempotencyKey?: string;
  createdAt?: string;
}

export interface FinancialTransaction {
  id: string;
  orderId?: string;
  type: 'income' | 'expense';
  description: string;
  amount: number;
  method: string;
  status: 'paid' | 'pending' | 'cancelled' | 'voided';
  category: string;
  date: string;
  gatewayFee?: number;
  netAmount?: number;
}

export type FinancialPeriodFilter =
  | 'today'
  | '7days'
  | 'current_month'
  | 'previous_month'
  | 'quarter'
  | 'year'
  | 'custom'
  | 'all';

export type FinancialStatusFilter =
  | 'all'
  | 'pending'
  | 'partial'
  | 'overdue'
  | 'approved'
  | 'refunded';

export type AccountsPayableStatus =
  | 'pending'
  | 'partially_paid'
  | 'paid'
  | 'cancelled'
  | 'voided';

export interface AccountsPayableEntry {
  id: string;
  supplierId?: string;
  supplierName?: string;
  description: string;
  category: AccountPlanCategory | string;
  amount: number;
  amountPaid: number;
  amountOpen: number;
  status: AccountsPayableStatus;
  dueDate: string; // YYYY-MM-DD
  competencyDate?: string; // YYYY-MM-DD
  paymentDate?: string;
  paymentMethod?: string;
  recurrence?: 'none' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  priority?: 'normal' | 'alta' | 'urgente';
  sourceType?: 'manual' | 'inventory_purchase' | 'investment' | 'tax' | 'operational';
  sourceReferenceId?: string;
  notes?: string;
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  idempotencyKey?: string;
  actorEmail?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  recordedAt?: any;
}

export interface Supplier {
  id: string;
  name: string;
  legalName?: string;
  document?: string; // CNPJ / CPF
  contactName?: string;
  email?: string;
  phone?: string;
  pixKey?: string;
  bankInfo?: string;
  category?: string;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CashForecastSummary {
  currentCashBalance: number;
  expectedReceivables7Days: number;
  expectedReceivables15Days: number;
  expectedReceivables30Days: number;
  expectedReceivables60Days: number;
  expectedReceivables90Days: number;
  expectedPayables7Days: number;
  expectedPayables15Days: number;
  expectedPayables30Days: number;
  expectedPayables60Days: number;
  expectedPayables90Days: number;
  projectedBalance7Days: number;
  projectedBalance15Days: number;
  projectedBalance30Days: number;
  projectedBalance60Days: number;
  projectedBalance90Days: number;
  overduePayablesCount: number;
  overduePayablesAmount: number;
  dueTodayPayablesCount: number;
  dueTodayPayablesAmount: number;
  due3DaysPayablesCount: number;
  due3DaysPayablesAmount: number;
}


