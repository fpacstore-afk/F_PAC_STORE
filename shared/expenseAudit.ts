import { companyExpenses } from './companyMovements';
import { financialDateKey } from './cashFlow';

/** The audit never writes or assumes two similar payments are the same record. */
export function auditExpenseSources(cashflow: any[] = [], investments: any[] = [], traffic: any[] = []) {
  const rows = companyExpenses(cashflow, investments, traffic);
  const perSource = ['financial_cashflow', 'financial_investments', 'financial_traffic'].map(source => {
    const sourceRows = rows.filter(row => row.recordSource === source);
    return { source, count: sourceRows.length, total: Number(sourceRows.reduce((sum, row) => sum + Number(row.amount || 0), 0).toFixed(2)) };
  });
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const date = financialDateKey(row.date || row.createdAt);
    const amount = Number(row.amount);
    if (!date || !Number.isFinite(amount) || amount <= 0) continue;
    let normalizedCategory = String(row.category || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (normalizedCategory === 'MARKETING') normalizedCategory = 'TRAFEGO PAGO';
    const signature = `${date}|${Math.round(amount * 100)}|${normalizedCategory}`;
    groups.set(signature, [...(groups.get(signature) || []), row]);
  }
  const possibleDuplicates = [...groups.values()].filter(group => group.length > 1).map(group =>
    group.map(row => ({ id: row.id, source: row.recordSource, description: row.description, date: financialDateKey(row.date || row.createdAt), amount: Number(row.amount) }))
  );
  return {
    rows, perSource, count: rows.length,
    total: Number(perSource.reduce((sum, source) => sum + source.total, 0).toFixed(2)),
    possibleDuplicates
  };
}
