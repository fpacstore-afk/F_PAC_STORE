import React from 'react';
import { financialDateKey } from '../../../../shared/cashFlow';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';

export function LegacySalesHistory({ entries }: { entries: any[] }) {
  const { formatMoney } = useFinancialPrivacy();
  if (!entries.length) return null;
  return (
    <details className="border border-amber-200 bg-white">
      <summary className="cursor-pointer p-4 text-sm font-bold">Registros antigos de vendas ({entries.length})</summary>
      <p className="px-4 pb-4 text-sm text-gray-600">
        Histórico preservado dos lançamentos que antes apareciam nas movimentações da empresa.
        Os recebimentos são calculados pelos pedidos; estes registros não são somados novamente.
        Confira cada registro com o pedido correspondente antes de considerar o histórico conciliado.
      </p>
      <ul className="max-h-[440px] overflow-y-auto divide-y divide-black/5">
        {entries.map(entry => {
          const date = financialDateKey(entry.date || entry.createdAt);
          return <li key={entry.id} className="p-4 flex flex-wrap justify-between gap-3 text-sm">
            <div className="min-w-0 break-words">
              <p className="font-bold">{entry.description || entry.category || 'Venda antiga'}</p>
              <p className="text-gray-500">{date ? date.split('-').reverse().join('/') : 'Data não informada'} · {entry.category || 'Venda'}</p>
              <p className="text-xs text-amber-800">{entry.orderId ? `Referência: pedido ${entry.orderId}` : 'Sem vínculo automático com um pedido — conferir'}</p>
            </div>
            <span className="font-bold">{formatMoney(Number(entry.amount))}</span>
          </li>;
        })}
      </ul>
    </details>
  );
}
