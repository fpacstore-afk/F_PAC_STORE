import { authenticatedFetch, parseApiJson } from '../lib/api';
import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { ClipboardCheck, RefreshCw, Save, AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, PackageSearch } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../lib/firebase';
import { useInventory } from '../hooks/useInventory';
import { adjustMultipleVariantStocksInDb, updateVariantStockInDb } from '../services/inventory/inventoryService';

type InventoryRow = {
  productSlug: string;
  productName: string;
  productCode: string;
  variantKey: string;
  color: string;
  size: string;
  systemQuantity: number;
  countVerified: boolean;
  reservedQuantity: number;
  availableQuantity: number;
  minimumQuantity: number;
  stockType: 'plain' | 'printed';
};

type StockMovement = { id: string; productSlug?: string; variantKey?: string; type?: string; quantity?: number; createdAt?: unknown; timestamp?: unknown; reason?: string; };

const numberOrZero = (value: string) => Math.max(0, Math.trunc(Number(value) || 0));

/** Monthly physical count. Adjustments use the canonical stock-movement API,
 * so every difference remains traceable in the inventory audit trail. */
export function InventoryAuditCenter({ operator = 'Administrador' }: { operator?: string }) {
  const { inventory, products, loading } = useInventory({ administrative: true });
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [reference, setReference] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()));
  const [stockType, setStockType] = useState<'all' | 'plain' | 'printed'>('all');
  const [production, setProduction] = useState<any[]>([]);
  const [overviewError, setOverviewError] = useState('');
  const [latestCount, setLatestCount] = useState<any>(null);
  const [savingCount, setSavingCount] = useState(false);
  const [resettingStock, setResettingStock] = useState(false);
  const [resetProgress, setResetProgress] = useState('');
  const [movements, setMovements] = useState<StockMovement[]>([]);

  useEffect(() => onSnapshot(collection(db, 'stock_movements'), snapshot => {
    setMovements(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as StockMovement)));
  }, () => setMovements([])), []);

  useEffect(() => {
    if (resettingStock) return;
    let active = true;
    authenticatedFetch(`/api/admin/stock/inventory-overview?reference=${encodeURIComponent(reference)}`).then(async response => {
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.message || data.error);
      if (active) { setProduction(data.production || []); setLatestCount(data.latestCount); setOverviewError(''); }
    }).catch(error => { if (active) setOverviewError(error.message || 'Inventário de produção indisponível.'); });
    return () => { active = false; };
  }, [reference, inventory, resettingStock]);

  const rows = useMemo<InventoryRow[]>(() => {
    const knownProducts = new Map(products.map((product: any) => [String(product.slug || product.id), product]));
    const entries: InventoryRow[] = [];
    const added = new Set<string>();

    const addRow = (productSlug: string, product: any, variantKey: string, quantity: unknown, variant?: any) => {
      const systemQuantity = Math.max(0, Number(quantity) || 0);
      // The initial audit must not resurrect old placeholder matrices. A row
      // becomes countable only when it belongs to an identified product and
      // currently carries physical stock.
      if (!product) return;
      const key = `${productSlug}:${variantKey}`;
      if (added.has(key)) return;
      added.add(key);
      entries.push({
        productSlug,
        productName: String(product?.name || productSlug),
        // The name is intentionally human-readable, while this second line
        // exposes the real catalogue identity when many variants share it.
        productCode: String(product?.sku || product?.reference || product?.slug || product?.id || productSlug),
        variantKey,
        color: String(variant?.color || variantKey.split('_')[0] || 'Sem cor'),
        size: String(variant?.size || variantKey.split('_').slice(1).join('_') || 'Único'),
        systemQuantity,
        countVerified: product?.productFinish !== 'printed' || variant?.physicalCountVerified === true,
        reservedQuantity: Math.max(0, Number(variant?.reservedQuantity) || 0),
        availableQuantity: Math.max(0, systemQuantity - (Number(variant?.reservedQuantity) || 0)),
        minimumQuantity: Math.max(1, Number(product?.minStock) || 1),
        stockType: product?.productFinish === 'plain' || /\b(lisa|liso|base|sem estampa)\b/i.test(`${product?.name || ''} ${(product?.tags || []).join(' ')}`) ? 'plain' : 'printed',
      });
    };

    Object.entries(inventory).forEach(([productSlug, item]: [string, any]) => {
      const product = knownProducts.get(productSlug);
      const variants = item?.variants || {};
      Object.entries(variants).forEach(([variantKey, variant]: [string, any]) => {
        addRow(productSlug, product, variantKey, variant?.physicalQuantity ?? variant?.stock ?? 0, variant);
      });
    });

    // Physical counts use only authoritative inventory, never duplicated catalog capacity.
    return entries.sort((a, b) => [a.productName, a.color, a.size].join('|').localeCompare([b.productName, b.color, b.size].join('|')));
  }, [inventory, products]);

  const visibleRows = useMemo(() => rows.filter(row => stockType === 'all' || row.stockType === stockType), [rows, stockType]);
  const periodTotals = useMemo(() => {
    const now = Date.now();
    const periods = [7, 30, 90, 365];
    const timeOf = (movement: StockMovement) => {
      const raw: any = movement.createdAt || movement.timestamp;
      if (typeof raw === 'string') return Date.parse(raw) || 0;
      if (raw?.toDate) return raw.toDate().getTime();
      if (typeof raw?.seconds === 'number') return raw.seconds * 1000;
      return 0;
    };
    const isOutbound = (movement: StockMovement) => ['sale', 'subtract', 'production_consumption', 'consume', 'shipped', 'reservation_consumption'].includes(String(movement.type || '').toLowerCase());
    const matching = movements.filter(movement => {
      const row = rows.find(item => item.productSlug === movement.productSlug && item.variantKey === movement.variantKey);
      return Boolean(row) && (stockType === 'all' || row?.stockType === stockType) && isOutbound(movement);
    });
    const totals = Object.fromEntries(periods.map(days => [days, matching.filter(movement => timeOf(movement) >= now - days * 86_400_000).reduce((sum, movement) => sum + Math.max(0, Number(movement.quantity) || 0), 0)]));
    const top = matching
      .filter(movement => timeOf(movement) >= now - 30 * 86_400_000)
      .reduce<Record<string, number>>((acc, movement) => {
        const key = `${movement.productSlug}:${movement.variantKey}`;
        acc[key] = (acc[key] || 0) + Math.max(0, Number(movement.quantity) || 0);
        return acc;
      }, {});
    const topKey = Object.entries(top).sort(([, a], [, b]) => b - a)[0]?.[0];
    return { totals, topRow: rows.find(row => `${row.productSlug}:${row.variantKey}` === topKey) || null, recent: [...movements].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, 12) };
  }, [movements, rows, stockType]);

  const countedRows = visibleRows.filter(row => counts[row.variantKey ? `${row.productSlug}:${row.variantKey}` : row.productSlug] !== undefined);
  const differences = countedRows.filter(row => numberOrZero(counts[`${row.productSlug}:${row.variantKey}`]) !== row.systemQuantity);

  const resetStockForInitialCount = async () => {
    if (rows.some(row => row.reservedQuantity > 0)) {
      toast.error('Há peças reservadas. Confira os pedidos antes de reiniciar os saldos.');
      return;
    }
    const pending = rows.filter(row => row.systemQuantity > 0);
    if (!pending.length) { toast.success('Todos os produtos cadastrados já estão com saldo zero.'); return; }
    if (!window.confirm(`Zerar os saldos de ${pending.length} variações em todos os produtos cadastrados? Os cadastros, pedidos, produção e histórico serão preservados. Esta operação não registra uma contagem física.`)) return;
    const groups = new Map<string, InventoryRow[]>();
    pending.forEach(row => groups.set(row.productSlug, [...(groups.get(row.productSlug) || []), row]));
    setResettingStock(true);
    setResetProgress('Preparando zeragem...');
    let completed = 0;
    try {
      const reason = `Zeragem inicial para inventário ${reference} — aguardando contagem física — ${operator}`;
      const operationId = `inventory-reset-${crypto.randomUUID()}`;
      let batchIndex = 0;
      for (const [slug, variants] of groups) {
        for (let offset = 0; offset < variants.length; offset += 100) {
          const batch = variants.slice(offset, offset + 100);
          await adjustMultipleVariantStocksInDb(slug, batch.map(row => ({ variantKey: row.variantKey, quantity: 0, reason })), reason, `${operationId}-${batchIndex++}`);
          completed += batch.length;
          setResetProgress(`${completed} de ${pending.length} variações zeradas`);
        }
      }
      setCounts({});
      toast.success('Saldos zerados com histórico. Agora informe as quantidades da contagem física.');
    } catch (error: any) {
      toast.error(`${completed} variações zeradas. ${error.message || 'Falha na zeragem.'} Confira o saldo antes de continuar.`);
    } finally { setResettingStock(false); }
  };

  const saveMonthlyCount = async () => {
    setSavingCount(true);
    try {
      const response = await authenticatedFetch('/api/admin/stock/inventory-counts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reference, counts: countedRows.map(row => ({ productSlug: row.productSlug, variantKey: row.variantKey, counted: numberOrZero(counts[`${row.productSlug}:${row.variantKey}`]) })) }) });
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.message);
      setLatestCount(data); toast.success('Contagem mensal salva com histórico.');
    } catch (error: any) { toast.error(error.message || 'Falha ao salvar a contagem.'); }
    finally { setSavingCount(false); }
  };

  const setSystemAsCount = () => {
    const next: Record<string, string> = {};
    visibleRows.filter(row => row.countVerified).forEach(row => { next[`${row.productSlug}:${row.variantKey}`] = String(row.systemQuantity); });
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
          <input aria-label="Referência do inventário" type="month" disabled={resettingStock} value={reference} onChange={event => setReference(event.target.value)} className="block mt-1 bg-white text-black px-3 py-2 font-mono" />
        </label>
      </header>

      <div className="border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">Conte as lisas uma única vez por modelo, cor e tamanho. A capacidade compartilhada dos desenhos não entra na soma física. Peças enviadas à estamparia aparecem em produção, separadamente. Quantidades antigas de estampadas ficam fora do saldo físico confirmado até a contagem; informe zero quando não existir peça pronta.</div>
      <div className="border border-black/10 bg-white p-4 space-y-2">
        <button type="button" disabled={loading || resettingStock || savingCount || savingKey !== null} onClick={resetStockForInitialCount} className="border border-black px-4 py-3 text-xs font-black uppercase disabled:opacity-40">{resettingStock ? 'Zerando saldos...' : 'Zerar saldos para reinício'}</button>
        <p className="text-xs text-gray-600">Use somente para começar uma nova base de estoque. Zera os produtos cadastrados em lotes por produto, preservando cadastros e histórico. A contagem física será informada depois; não zere novamente nas conferências mensais.</p>
        {resetProgress && <p role="status" className="text-xs font-bold">{resetProgress}</p>}
      </div>
      {overviewError && <p role="alert" className="text-red-700 text-sm">{overviewError}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric label="Variações cadastradas" value={visibleRows.length} />
        <Metric label="Variações contadas" value={countedRows.length} />
        <Metric label="Divergências" value={differences.length} danger={differences.length > 0} />
      </div>

      <section className="border border-black/10 bg-white p-4 space-y-3">
        <h2 className="font-black uppercase text-sm">Peças personalizadas vinculadas aos pedidos</h2>
        <div className="grid grid-cols-3 gap-3">{[['in_production', 'Em produção'], ['ready', 'Prontas aguardando envio'], ['cancelled', 'Personalizadas de pedidos cancelados']].map(([status, label]) => <Metric key={status} label={label} value={production.filter(item => item.status === status).reduce((sum, item) => sum + item.items.reduce((total: number, line: any) => total + Number(line.quantity || 0), 0), 0)} />)}</div>
        {production.map(item => <p className="text-xs" key={item.id}>Pedido #{item.orderId}: {item.items.map((line: any) => `${line.quantity} × ${line.name} · ${line.color} ${line.size}`).join('; ')} · {item.status === 'ready' ? 'Pronto' : item.status === 'cancelled' ? 'Cancelado — peça preservada' : 'Em produção'}</p>)}
      </section>
      <section className="border border-black/10 bg-white p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-[#a17a00]">Consulta operacional</p><h2 className="text-base font-black uppercase">Saldo, reposição e giro</h2></div>
          <div className="flex gap-2"><FilterButton active={stockType === 'all'} onClick={() => setStockType('all')}>Todos</FilterButton><FilterButton active={stockType === 'plain'} onClick={() => setStockType('plain')}>Peças lisas</FilterButton><FilterButton active={stockType === 'printed'} onClick={() => setStockType('printed')}>Peças estampadas</FilterButton></div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Saldo físico" value={visibleRows.reduce((sum, row) => sum + (row.countVerified ? row.systemQuantity : 0), 0)} />
          <Metric label="Repor agora" value={visibleRows.filter(row => row.systemQuantity <= row.minimumQuantity).length} danger={visibleRows.some(row => row.systemQuantity <= row.minimumQuantity)} />
          <Metric label="Saídas · 7 dias" value={periodTotals.totals[7] || 0} />
          <Metric label="Saídas · 30 dias" value={periodTotals.totals[30] || 0} />
        </div>
        <div className="grid gap-3 text-xs sm:grid-cols-3"><Insight icon={<TrendingDown size={16} />} label="Repor" text={`${visibleRows.filter(row => row.systemQuantity <= row.minimumQuantity).length} variação(ões) no mínimo ou abaixo.`} /><Insight icon={<TrendingUp size={16} />} label="Mais saiu em 30 dias" text={periodTotals.topRow ? `${periodTotals.topRow.productName} · ${periodTotals.topRow.color} ${periodTotals.topRow.size}` : 'Ainda não há saídas registradas no período.'} /><Insight icon={<PackageSearch size={16} />} label="Visão anual" text={`${periodTotals.totals[90] || 0} saídas em 90 dias · ${periodTotals.totals[365] || 0} em 1 ano.`} /></div>
      </section>

      {visibleRows.length === 0 && !loading ? (
        <div className="border-2 border-dashed border-amber-400 bg-amber-50 p-8 text-center">
          <AlertTriangle className="mx-auto text-amber-700 mb-2" />
          <p className="font-black uppercase text-sm">Cadastre os produtos e as variações primeiro</p>
          <p className="text-xs text-amber-900 mt-1">Depois, esta tela vira a rotina mensal de conferência física.</p>
        </div>
      ) : (
        <div className="bg-white border border-black/10 overflow-x-auto">
          <div className="p-3 border-b border-black/10 flex justify-end">
            <button disabled={resettingStock} onClick={setSystemAsCount} className="inline-flex items-center gap-2 border border-black px-3 py-2 text-[10px] font-black uppercase hover:bg-black hover:text-white"><RefreshCw size={14} /> Preencher saldos já conferidos</button>
          </div>
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-black text-white text-[10px] uppercase tracking-wider"><tr><th className="p-3">Produto</th><th className="p-3">Cor</th><th className="p-3">Tam.</th><th className="p-3">Físico</th><th className="p-3">Reservado</th><th className="p-3">Disponível</th><th className="p-3">Contagem física</th><th className="p-3">Diferença</th><th className="p-3">Ação</th></tr></thead>
            <tbody className="divide-y divide-black/10 text-sm">
              {visibleRows.map(row => {
                const key = `${row.productSlug}:${row.variantKey}`;
                const hasCount = counts[key] !== undefined;
                const counted = hasCount ? numberOrZero(counts[key]) : null;
                const difference = counted === null ? null : counted - row.systemQuantity;
                return <tr key={key} className={difference === null || difference === 0 ? '' : 'bg-amber-50'}>
                  <td className="p-3"><span className="block font-black">{row.productName}</span><span className="mt-0.5 block font-mono text-[10px] text-gray-500">{row.productCode}</span></td><td className="p-3">{row.color}</td><td className="p-3">{row.size}</td><td className="p-3 font-mono">{row.systemQuantity}{!row.countVerified && <span className="block text-[9px] text-amber-700">Cadastro anterior · não conferido</span>}</td><td className="p-3 font-mono">{row.reservedQuantity}</td><td className="p-3 font-mono">{row.availableQuantity}</td>
                  <td className="p-3"><input aria-label={`Contagem física ${row.productName} ${row.color} ${row.size}`} disabled={resettingStock} inputMode="numeric" min="0" type="number" value={counts[key] ?? ''} onChange={event => setCounts(current => ({ ...current, [key]: event.target.value }))} className="w-24 border border-black/20 px-2 py-1.5 font-mono" /></td>
                  <td className="p-3 font-mono font-black">{difference === null ? '—' : difference === 0 ? <span className="text-emerald-700">Confere</span> : `${difference > 0 ? '+' : ''}${difference}`}</td>
                  <td className="p-3"><button disabled={resettingStock || !hasCount || difference === 0 || savingKey === key} onClick={() => saveRow(row)} className="inline-flex items-center gap-1 bg-black text-[#eab308] disabled:opacity-40 px-3 py-2 text-[9px] font-black uppercase"><Save size={13} /> {savingKey === key ? 'Salvando' : 'Ajustar'}</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
      <section className="border border-black/10 bg-white overflow-x-auto">
        <div className="border-b border-black/10 p-4"><h2 className="text-sm font-black uppercase">Histórico recente de estoque</h2><p className="text-[10px] text-gray-500">Últimos lançamentos oficiais: entradas, reservas, consumo, saídas e ajustes.</p></div>
        <table className="w-full min-w-[650px] text-left text-xs"><thead className="bg-black text-white text-[9px] uppercase"><tr><th className="p-3">Data</th><th className="p-3">Produto / variação</th><th className="p-3">Movimento</th><th className="p-3">Qtd.</th><th className="p-3">Motivo</th></tr></thead><tbody className="divide-y divide-black/10">{periodTotals.recent.map(movement => <tr key={movement.id}><td className="p-3">{formatMovementDate(movement.createdAt || movement.timestamp)}</td><td className="p-3 font-bold">{movement.productSlug || '—'} · {movement.variantKey || '—'}</td><td className="p-3 uppercase">{String(movement.type || 'ajuste').replace(/_/g, ' ')}</td><td className="p-3 font-mono">{Number(movement.quantity || 0)}</td><td className="p-3 text-gray-500">{movement.reason || '—'}</td></tr>)}</tbody></table>
      </section>
      <div className="border border-black/10 bg-white p-4 space-y-2"><button disabled={resettingStock || savingCount || countedRows.length === 0 || Boolean(overviewError)} onClick={saveMonthlyCount} className="bg-black text-[#eab308] px-4 py-3 text-xs font-black uppercase disabled:opacity-40">{savingCount ? 'Salvando contagem...' : 'Salvar contagem mensal'}</button><p className="text-xs text-gray-500">Salva as variações contadas e as peças em produção. O saldo físico só muda quando você usa “Ajustar”.</p>{latestCount && <p className="text-xs">Última contagem salva: {formatMovementDate(latestCount.capturedAt)} · {latestCount.countedVariants ?? latestCount.lines?.length ?? 0} variações · {latestCount.differenceCount} diferenças.</p>}</div>
      <p className="text-[10px] text-gray-500">Cada ajuste é registrado como inventário físico de {reference || 'referência não informada'} no histórico de estoque.</p>
    </section>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`px-3 py-2 text-[9px] font-black uppercase ${active ? 'bg-black text-[#eab308]' : 'border border-black/10 text-gray-600'}`}>{children}</button>; }
function Insight({ icon, label, text }: { icon: React.ReactNode; label: string; text: string }) { return <div className="flex gap-2 border border-black/10 p-3"><span className="text-[#a17a00]">{icon}</span><div><p className="text-[9px] font-black uppercase">{label}</p><p className="mt-1 text-gray-600">{text}</p></div></div>; }
function formatMovementDate(value: unknown) { const raw: any = value; const date = typeof raw === 'string' ? new Date(raw) : raw?.toDate ? raw.toDate() : typeof raw?.seconds === 'number' ? new Date(raw.seconds * 1000) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : '—'; }

function Metric({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className={`border p-4 ${danger ? 'border-amber-400 bg-amber-50' : 'border-black/10 bg-white'}`}><span className="text-[9px] font-black uppercase tracking-wider text-gray-500">{label}</span><strong className="block text-2xl font-mono mt-1">{value}</strong></div>;
}
