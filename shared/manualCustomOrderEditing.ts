export interface EditableManualArtwork {
  id: string;
  catalogStampId?: string;
  name: string;
  location: string;
  color: string;
  artSize: string;
  stockPrintSize?: string;
  image?: string;
  notes?: string;
  costRuleId?: string;
}

export interface EditableManualLine {
  lineId: string;
  sourceLineId: string;
  size: string;
  quantity: number;
  artworks: EditableManualArtwork[];
  confirmManualCost?: boolean;
}

export function manualEditLineId(item: any, index: number): string {
  return String(item.manualLineId || `legacy-line-${index}`);
}

export function manualEditProductKey(item: any): string {
  return JSON.stringify([item.customDetails?.productName || item.name, item.customDetails?.model || '', item.color || '', Number(item.price) || 0, item.customDetails?.costRecipe || null]);
}

export function manualOrderEditLines(order: any): EditableManualLine[] {
  return (order.items || []).map((item: any, index: number) => {
    const source = Array.isArray(item.customDetails?.artworks) ? item.customDetails.artworks : (item.printConfigs || []);
    const lineId = manualEditLineId(item, index);
    return {
      lineId, sourceLineId: lineId, size: String(item.size || ''), quantity: Number(item.quantity) || 1,
      artworks: source.map((art: any, artIndex: number) => {
        const stampId = String(art.catalogStampId || art.stampId || art.id || '');
        const catalog = art.source === 'catalog' || (!art.source && stampId && !stampId.startsWith('own_art_'));
        return {
          id: `${String(art.id || 'art').replace(/^own_art_/, '')}-${artIndex}`,
          ...(catalog ? { catalogStampId: stampId } : {}),
          name: String(art.name || art.stamp || ''), location: String(art.location || ''),
          color: String(art.color || ''), artSize: String(art.artSize || art.printSize || ''),
          stockPrintSize: String(art.stockPrintSize || (catalog ? art.printSize || '' : '')),
          image: String(art.image || ''), notes: String(art.notes || ''),
          ...(art.costRuleId ? { costRuleId: String(art.costRuleId) } : {}),
        };
      }),
    };
  });
}

export function editedManualSubtotal(order: any, lines: EditableManualLine[]): number {
  const sources = new Map<string, any>((order.items || []).map((item: any, index: number) => [manualEditLineId(item, index), item]));
  return Math.round(lines.reduce((sum, line) => sum + Number(sources.get(line.sourceLineId)?.price || 0) * Number(line.quantity || 0), 0) * 100) / 100;
}

/** Preserve receipts and due dates; only redistribute the outstanding schedule. */
export function resizeManualInstallments(installments: any[], total: number): any[] {
  if (!Array.isArray(installments) || !installments.length) return [];
  const rows = installments.map(row => ({ ...row }));
  const paidCents = rows.map(row => Math.max(0, Math.round(Number(row.paidAmount ?? (row.status === 'paid' ? row.amount : 0)) * 100)));
  const totalCents = Math.round(total * 100);
  const paidTotal = paidCents.reduce((a, b) => a + b, 0);
  if (paidTotal > totalCents) throw new Error('O total não pode ficar abaixo das parcelas já pagas.');
  let open = rows.map((row, index) => ({ index, weight: Math.max(0, Math.round(Number(row.amount || 0) * 100) - paidCents[index]) })).filter(row => row.weight > 0);
  if (!open.length && totalCents > paidTotal) {
    rows.push({ number: Math.max(...rows.map(row => Number(row.number) || 0)) + 1, amount: 0, paidAmount: 0, status: 'pending' });
    paidCents.push(0);
    open = [{ index: rows.length - 1, weight: 1 }];
  }
  const weightTotal = open.reduce((sum, row) => sum + row.weight, 0);
  let unallocated = totalCents - paidTotal;
  const remaining = unallocated;
  const amounts = new Map<number, number>();
  open.forEach((row, index) => {
    const amount = index === open.length - 1 ? unallocated : Math.floor(remaining * row.weight / weightTotal);
    amounts.set(row.index, amount);
    unallocated -= amount;
  });
  return rows.map((row, index) => {
    const amount = (paidCents[index] + (amounts.get(index) || 0)) / 100;
    return { ...row, amount, paidAmount: paidCents[index] / 100, status: paidCents[index] >= Math.round(amount * 100) ? 'paid' : 'pending' };
  });
}
