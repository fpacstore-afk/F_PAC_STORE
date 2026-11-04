import { useMemo, useState } from 'react';
import { summarizeReceipts, type ReceiptRange } from '../../../../shared/financialReceipts';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';

export function FinancialReceiptsView({ orders, range, onOpenOrder }: { orders: any[]; range: ReceiptRange; onOpenOrder: (order: any) => void }) {
  const { formatMoney } = useFinancialPrivacy();
  const [page, setPage] = useState(0);
  const rows = useMemo(() => orders.map(order => ({ order, ...summarizeReceipts([order], range) }))
    .filter(row => row.received > 0 || row.refunded > 0), [orders, range]);
  const last = Math.max(0, Math.ceil(rows.length / 20) - 1);
  const current = Math.min(page, last);
  return <section className="space-y-3 rounded-xl border border-black/10 bg-white p-4 sm:p-6">
    <h3 className="text-xl font-black">Recebimentos e estornos</h3>
    <p className="text-sm text-gray-600">Valores por pedido conforme a data de cada recebimento ou estorno.</p>
    {!rows.length && <p className="text-sm">Nenhum recebimento ou estorno no período.</p>}
    {rows.slice(current * 20, current * 20 + 20).map(({ order, received, refunded }) => <button type="button" key={order.id} onClick={() => onOpenOrder(order)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded border p-3 text-left text-sm hover:bg-amber-50">
      <span className="min-w-0 break-all"><strong>{order.customerName || 'Pedido'}</strong> · {order.id}</span>
      <span>Recebido {formatMoney(received)} · Estornado {formatMoney(refunded)}</span>
    </button>)}
    {last > 0 && <div className="flex items-center gap-3 text-sm"><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button><span>{current + 1}/{last + 1}</span><button type="button" disabled={current === last} onClick={() => setPage(current + 1)}>Próxima</button></div>}
  </section>;
}
