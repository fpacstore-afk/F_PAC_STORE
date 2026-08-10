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

export interface FinancialTransaction {
  id: string;
  orderId?: string;
  type: 'income' | 'expense';
  description: string;
  amount: number;
  method: string;
  status: 'paid' | 'pending' | 'cancelled';
  category: string;
  date: string;
  gatewayFee?: number;
  netAmount?: number;
}
