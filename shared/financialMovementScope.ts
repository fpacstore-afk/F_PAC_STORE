const normalize = (value: unknown) => String(value ?? '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

/** Old manual orders also wrote a sales receipt into financial_cashflow.
 * Keep those records for review, but orders are the source of sales receipts.
 * Never infer a matching order from a customer's name or an equal amount.
 */
export function isSalesCashFlowEntry(entry: any): boolean {
  const type = normalize(entry?.type);
  // Freight, supplies and other expenses can reference an order without being a sale.
  if (['out', 'expense', 'saida'].includes(type)) return false;
  if (['in', 'income', 'entrada'].includes(type) && String(entry?.orderId || '').trim()) return true;
  const source = normalize(entry?.sourceType);
  if (['sale', 'sales', 'order', 'order payment', 'manual payment', 'venda', 'pedido'].includes(source)) return true;
  return [entry?.category, entry?.description].some(value =>
    /^(vendas?|sales?)(\b|$)/.test(normalize(value))
  );
}

export const SALES_MOVEMENT_MESSAGE = 'Registre vendas e recebimentos na aba Vendas e pedidos. Movimentações da empresa são apenas entradas e saídas que não são vendas.';
