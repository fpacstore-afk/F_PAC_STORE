import React, { useMemo, useState } from 'react';
import { ClipboardCheck, RefreshCw, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useInventory } from '../hooks/useInventory';
import { updateVariantStockInDb } from '../services/inventory/inventoryService';

type InventoryRow = {
  productSlug: string;
  productName: string;
  variantKey: string;
  color: string;
  size: string;
  systemQuantity: number;
};

const numberOrZero = (value: string) => Math.max(0, Math.trunc(Number(value) || 0));

/** Monthly physical count. Adjustments use the canonical stock-movement API,
 * so every difference remains traceable in the inventory audit trail. */
export function InventoryAuditCenter({ operator = 'Administrador' }: { operator?: string }) {
  const { inventory, products, loading } = useInventory({ administrative: true });
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [reference, setReference] = useState(() => new Date().toISOString().slice(0, 7));

  const rows = useMemo<InventoryRow[]>(() => {
    const knownProducts = new Map(products.map((product: any) => [String(product.slug || product.id), product]));
    const entries: InventoryRow[] = [];

    Object.entries(inventory).forEach(([productSlug, item]: [string, any]) => {
      const product = knownProducts.get(productSlug);
      const variants = item?.variants || {};
      Object.entries(variants).forEach(([variantKey, variant]: [string, any]) => {
        entries.push({
          productSlug,
          productName: String(product?.name || productSlug),
          variantKey,
          color: String(variant?.color || variantKey.split('_')[0] || 'Sem cor'),
          size: String(variant?.size || variantKey.split('_').slice(1).join('_') || 'Único'),
          systemQuantity: Math.max(0, Number(variant?.physicalQuantity ?? variant?.stock ?? 0) || 0),
        });
      });
    });

    return entries.sort((a, b) => [a.productName, a.color, a.size].join('|').localeCompare([b.productName, b.color, b.size].join('|')));
  }, [inventory, products]);

  const countedRows = rows.filter(row => counts[row.variantKey ? `${row.productSlug}:${row.variantKey}` : row.productSlug] !== undefined);
  const differences = countedRows.filter(row => numberOrZero(counts[`${row.productSlug}:${row.variantKey}`]) !== row.systemQuantity);

  const setSystemAsCount = () => {
    const next: Record<string, string> = {};
    rows.forEach(row => { next[`${row.productSlug}:${row.variantKey}`] = String(row.systemQuantity); });
    setCounts(next);
  };

  const saveRow = async (row: InventoryRow) => {
    const key = `${row.productSlug}:${row.variantKey}`;
    const counted = numberOrZero(counts[key]);
    if (counted === row.systemQuantity) {
      toast.success('Contagem confere com o sistema.');
      return;
    }
    setSavingKey(key);
    try {
      await updateVariantStockInDb(
        row.productSlug,
        row.variantKey,
        counted,
        operator,
        `Inventário físico mensal — referência ${reference || 'não informada'}`
      );
      toast.success('Ajuste de inventário registrado no histórico.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível registrar o ajuste.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section className="space-y-5">
      <header className="bg-black text-white p-5 border-2 border-black flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[#eab308]"><ClipboardCheck size={20} /><span className="text-[10px] font-black uppercase tracking-widest">Conferência mensal</span></div>
          <h1 className="text-xl font-black uppercase tracking-tight mt-1">Inventário físico</h1>
          <p className="text-xs text-white/70 mt-1">Conte o estoque real, compare com o sistema e ajuste somente o que divergir.</p>
        </div>
        <label className="text-[10px] font-black uppercase tracking-wider text-white/70">Referência
          <input aria-label="Referência do inventário" type="month" value={reference} onChange={event => setReference(event.target.value)} className="block mt-1 bg-white text-black px-3 py-2 font-mono" />
        </label>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric label="Variações cadastradas" value={rows.length} />
        <Metric label="Variações contadas" value={countedRows.length} />
        <Metric label="Divergências" value={differences.length} danger={differences.length > 0} />
      </div>

      {rows.length === 0 && !loading ? (
        <div className="border-2 border-dashed border-amber-400 bg-amber-50 p-8 text-center">
          <AlertTriangle className="mx-auto text-amber-700 mb-2" />
          <p className="font-black uppercase text-sm">Cadastre os produtos e as variações primeiro</p>
          <p className="text-xs text-amber-900 mt-1">Depois, esta tela vira a rotina mensal de conferência física.</p>
        </div>
      ) : (
        <div className="bg-white border border-black/10 overflow-x-auto">
          <div className="p-3 border-b border-black/10 flex justify-end">
            <button onClick={setSystemAsCount} className="inline-flex items-center gap-2 border border-black px-3 py-2 text-[10px] font-black uppercase hover:bg-black hover:text-white"><RefreshCw size={14} /> Preencher com saldo do sistema</button>
          </div>
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-black text-white text-[10px] uppercase tracking-wider"><tr><th className="p-3">Produto</th><th className="p-3">Cor</th><th className="p-3">Tam.</th><th className="p-3">Sistema</th><th className="p-3">Contagem física</th><th className="p-3">Diferença</th><th className="p-3">Ação</th></tr></thead>
            <tbody className="divide-y divide-black/10 text-sm">
              {rows.map(row => {
                const key = `${row.productSlug}:${row.variantKey}`;
                const hasCount = counts[key] !== undefined;
                const counted = hasCount ? numberOrZero(counts[key]) : null;
                const difference = counted === null ? null : counted - row.systemQuantity;
                return <tr key={key} className={difference === null || difference === 0 ? '' : 'bg-amber-50'}>
                  <td className="p-3 font-black">{row.productName}</td><td className="p-3">{row.color}</td><td className="p-3">{row.size}</td><td className="p-3 font-mono">{row.systemQuantity}</td>
                  <td className="p-3"><input aria-label={`Contagem física ${row.productName} ${row.color} ${row.size}`} inputMode="numeric" min="0" type="number" value={counts[key] ?? ''} onChange={event => setCounts(current => ({ ...current, [key]: event.target.value }))} className="w-24 border border-black/20 px-2 py-1.5 font-mono" /></td>
                  <td className="p-3 font-mono font-black">{difference === null ? '—' : difference === 0 ? <span className="text-emerald-700">Confere</span> : `${difference > 0 ? '+' : ''}${difference}`}</td>
                  <td className="p-3"><button disabled={!hasCount || difference === 0 || savingKey === key} onClick={() => saveRow(row)} className="inline-flex items-center gap-1 bg-black text-[#eab308] disabled:opacity-40 px-3 py-2 text-[9px] font-black uppercase"><Save size={13} /> {savingKey === key ? 'Salvando' : 'Ajustar'}</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-gray-500">Cada ajuste é registrado como inventário físico de {reference || 'referência não informada'} no histórico de estoque.</p>
    </section>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className={`border p-4 ${danger ? 'border-amber-400 bg-amber-50' : 'border-black/10 bg-white'}`}><span className="text-[9px] font-black uppercase tracking-wider text-gray-500">{label}</span><strong className="block text-2xl font-mono mt-1">{value}</strong></div>;
}
