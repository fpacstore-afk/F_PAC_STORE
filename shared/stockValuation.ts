export type StockComponent = {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  unitCostCents: number | null;
  archived: boolean;
  revision: number;
};

export type ValuationRow = {
  id: string;
  name: string;
  reference: string;
  category: string;
  unit: string;
  quantity: number;
  unitCostCents: number | null;
  costStatus: 'recorded' | 'partial' | 'missing';
  type: 'product' | 'component';
};

export function readStockComponent(value: any) {
  const name = typeof value?.name === 'string' ? value.name.trim() : '';
  const category = typeof value?.category === 'string' ? value.category.trim() : '';
  const unit = typeof value?.unit === 'string' ? value.unit.trim() : '';
  const { quantity, unitCostCents, archived } = value || {};
  if (!name || name.length > 120 || !category || category.length > 60 || !unit || unit.length > 24
    || typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0 || quantity > 1000000
    || Number(quantity.toFixed(4)) !== quantity
    || (unitCostCents !== null && (!Number.isSafeInteger(unitCostCents) || unitCostCents < 0 || unitCostCents > 100000000))
    || typeof archived !== 'boolean') {
    throw new Error('Confira nome, categoria, unidade, quantidade e custo do componente.');
  }
  return { name, category, unit, quantity, unitCostCents: unitCostCents as number | null, archived };
}

export const stockLineCents = (row: ValuationRow) =>
  row.unitCostCents === null ? null : Math.round(row.quantity * row.unitCostCents);

export function summarizeValuation(rows: ValuationRow[]) {
  let recordedCents = 0, partialCents = 0, missing = 0, partial = 0;
  for (const row of rows) {
    if (row.quantity <= 0) continue;
    const amount = stockLineCents(row);
    if (amount === null || row.costStatus === 'missing') missing++;
    else if (row.costStatus === 'partial') {
      partial++;
      partialCents += amount;
    } else recordedCents += amount;
  }
  return { recordedCents, partialCents, missing, partial, subtotalCents: recordedCents + partialCents };
}

export function productionUnitCost(parts: { unitCostCents: number | null; usage: number }[]): number | null {
  if (!parts.length || parts.some(part => part.unitCostCents === null || !Number.isFinite(part.usage) || part.usage <= 0 || part.usage > 1000000)) return null;
  return Math.round(parts.reduce((sum, part) => sum + part.unitCostCents! * part.usage, 0));
}

export function readProductionUsage(value: any) {
  if (!Array.isArray(value?.usage) || value.usage.length > 30 || !Number.isSafeInteger(value.extraCents)
    || value.extraCents < 0 || value.extraCents > 100000000) {
    throw new Error('Confira os componentes e os custos adicionais da peça.');
  }
  const seen = new Set<string>();
  const usage = value.usage.map((row: any) => {
    const key = row?.kind + ':' + row?.reference;
    if (!['component', 'base'].includes(row?.kind) || typeof row.reference !== 'string'
      || !/^[a-zA-Z0-9_-]{1,128}$/.test(row.reference) || typeof row.quantity !== 'string'
      || !/^\d+(?:[,.]\d{1,4})?$/.test(row.quantity) || seen.has(key)) {
      throw new Error('Use cada insumo uma vez e informe o consumo por peça.');
    }
    seen.add(key);
    const amount = Number(row.quantity.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) throw new Error('Consumo por peça inválido.');
    return { kind: row.kind as 'component' | 'base', reference: row.reference as string, quantity: row.quantity as string, amount };
  });
  return { usage: usage as { kind: 'component' | 'base'; reference: string; quantity: string; amount: number }[], extraCents: value.extraCents as number };
}
