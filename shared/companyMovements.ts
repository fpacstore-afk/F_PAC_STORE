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
