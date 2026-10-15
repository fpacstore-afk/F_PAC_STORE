import { isSalesCashFlowEntry } from './financialMovementScope';

/** A single view of company movements, preserving each source document's identity.
 * Only explicit source references deduplicate records; equal amounts/names do not.
 */
export function companyMovements(cashflow: any[] = [], investments: any[] = []): any[] {
  const movements = cashflow.filter(entry => !isSalesCashFlowEntry(entry)).map(entry => ({
    ...entry,
    recordSource: entry.recordSource === 'financial_investments' ? 'financial_investments' : 'financial_cashflow'
  }));
  const represented = new Set(movements.filter(entry =>
    entry.sourceType === 'investment' || entry.recordSource === 'financial_investments'
  ).map(entry => String(entry.sourceReferenceId || entry.id)));
  for (const investment of investments) {
    if (investment.id && represented.has(String(investment.id))) continue;
    movements.push({
      ...investment,
      description: investment.description || investment.title || 'Gasto de estrutura',
      type: 'out',
      recordSource: 'financial_investments',
      sourceType: 'investment',
      sourceReferenceId: investment.id,
      financialNature: 'structure'
    });
    if (investment.id) represented.add(String(investment.id));
  }
  return movements;
}

/** Read-only expense history across the three existing collections. Documents
 * retain their original IDs and collection; no copy or destructive migration.
 * A mirrored traffic document is represented once only when an explicit source
 * reference identifies it. Similar amounts on the same day are not evidence
 * that two independent payments are the same expense.
 */
export function companyExpenses(cashflow: any[] = [], investments: any[] = [], traffic: any[] = []): any[] {
  const movements = companyMovements(cashflow, investments)
    .filter(entry => String(entry.type || '').toLowerCase() === 'out')
    .filter(entry => !['voided', 'cancelled', 'canceled', 'cancelado'].includes(String(entry.status || '').toLowerCase()));
  const representedTraffic = new Set(movements.filter(entry =>
    entry.sourceType === 'traffic' && entry.sourceReferenceId
  ).map(entry => String(entry.sourceReferenceId)));
  const trafficRows = traffic.filter(entry =>
    !representedTraffic.has(String(entry.id)) &&
    !['voided', 'cancelled', 'canceled', 'cancelado'].includes(String(entry.status || '').toLowerCase())
  ).map(entry => ({
    ...entry,
    amount: entry.amountSpent ?? entry.amount,
    description: entry.campaignName || entry.description || 'Tráfego pago',
    category: 'Tráfego Pago',
    type: 'out',
    recordSource: 'financial_traffic'
  }));
  return [...movements, ...trafficRows];
}

export function isStructureMovement(entry: any): boolean {
  return entry?.recordSource === 'financial_investments' || entry?.sourceType === 'investment'
    || entry?.financialNature === 'structure'
    || ['INVESTIMENTO', 'EQUIPAMENTOS', 'CAPEX'].includes(String(entry?.category || '').trim().toUpperCase());
}

/** Prefix only at the export boundary so a Sheet round-trip updates the original. */
export function companyMovementExportId(entry: any): string {
  return entry.recordSource === 'financial_investments' ? `investment:${entry.id}` : String(entry.id);
}

export function companyMovementReference(id: string) {
  return id.startsWith('investment:')
    ? { collection: 'financial_investments', id: id.slice('investment:'.length) }
    : { collection: 'financial_cashflow', id };
}
