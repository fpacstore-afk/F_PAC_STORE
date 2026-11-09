export function stockMovementDisplay(record: any, products: any[]) {
  const product = products.find(item => item.id === record.productId || item.slug === record.productSlug);
  const types: Record<string, string> = { entry: 'Entrada', purchase_entry: 'Entrada', manual_entry: 'Entrada', adjustment_increase: 'Entrada', add: 'Entrada', exit: 'Saída', production_consumption: 'Saída', loss: 'Saída', damage: 'Saída', adjustment_decrease: 'Saída', subtract: 'Saída', sale: 'Saída', adjust: 'Ajuste', return: 'Devolução', reservation_create: 'Reserva', reservation_release: 'Liberação de reserva', reservation_confirm: 'Confirmação de reserva' };
  const physicalBefore = record.previousPhysicalQuantity;
  const physicalAfter = record.newPhysicalQuantity;
  const physicalDelta = typeof physicalBefore === 'number' && typeof physicalAfter === 'number'
    ? physicalAfter - physicalBefore : null;
  const fallback = Number(record.quantity) || 0;
  return {
    ...record,
    type: types[record.type] || record.type || 'Movimentação',
    productName: record.productName || product?.name || record.sku || record.productSlug || 'Produto sem referência',
    operator: record.operator || record.performedBy || 'Não informado',
    notes: record.notes || record.reason || '',
    quantity: physicalDelta ?? (['Saída', 'Venda Local'].includes(types[record.type] || record.type) ? -Math.abs(fallback) : fallback),
  };
}
