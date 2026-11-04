import { useEffect, useState } from 'react';
import { financialDateKey } from '../../../../shared/cashFlow';
import { receiptPeriodRange } from '../../../../shared/financialReceipts';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import { authenticatedFetch, parseApiJson } from '../../../lib/api';

type Position = {
  opening: number; closing: number; movements: { cashIn: number; cashOut: number };
  sales: number; received: number; refunded: number;
  undated: { cashIn: number; cashOut: number }; reviewCount: number;
  inventory: { id: string; capturedAt: string; variants: number; divergences: number } | null;
};
type Closeout = {
  revision: number; recordedBy: string; recordedAt: string; position: Position;
  bankAndCashBalance: number; receivables: number; payables: number; note: string;
};
type Preview = {
  position: Position; token: string; saved: Closeout | null; versions: (Closeout & { id: string })[];
  annual: { month: string; sales: number; received: number; refunded: number; expenses: number }[];
};
const fields = [
  ['bankAndCashBalance', 'Banco e caixa conciliados no fim do mês'],
  ['receivables', 'Contas a receber no fim do mês'],
  ['payables', 'Contas a pagar no fim do mês'],
] as const;
const emptyBalances = { bankAndCashBalance: '', receivables: '', payables: '' };

export function MonthlyCloseout() {
  const { formatMoney } = useFinancialPrivacy();
  const lastMonth = receiptPeriodRange('previous_month')!.start.slice(0, 7);
  const [month, setMonth] = useState(lastMonth);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [balances, setBalances] = useState(emptyBalances);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const abort = new AbortController();
    setPreview(null); setError(''); setConfirmed(false);
    authenticatedFetch(`/api/admin/financial/monthly-closeout?month=${encodeURIComponent(month)}`, { signal: abort.signal })
      .then(async response => {
        const data = await parseApiJson(response);
        if (!response.ok) throw new Error(data.message || 'Não foi possível consultar o fechamento.');
        if (abort.signal.aborted) return;
        setPreview(data);
        const saved = data.saved as Closeout | null;
        setBalances(saved ? { bankAndCashBalance: String(saved.bankAndCashBalance), receivables: String(saved.receivables), payables: String(saved.payables) } : emptyBalances);
        setNote('');
      }).catch(error => { if (!abort.signal.aborted) setError(error.message); });
    return () => abort.abort();
  }, [month, reload]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!preview || !confirmed || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await authenticatedFetch('/api/admin/financial/monthly-closeout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, token: preview.token, requestId, reconciled: confirmed, note,
          bankAndCashBalance: Number(balances.bankAndCashBalance), receivables: Number(balances.receivables), payables: Number(balances.payables) })
      });
      const result = await parseApiJson(response);
      if (!response.ok) throw new Error(result.message || 'Não foi possível salvar.');
      setNotice(`Fechamento salvo · versão ${result.revision}`);
      setRequestId(crypto.randomUUID());
      setReload(current => current + 1);
    } catch (error: any) { setError(error.message); }
    finally { setSaving(false); }
  }

  const position = preview?.position;
  const moneyRows = (position: Position) => [
    ['Saldo inicial registrado', position.opening], ['Vendas confirmadas', position.sales],
    ['Recebimentos', position.received], ['Estornos', position.refunded],
    ['Entradas de caixa', position.movements.cashIn], ['Saídas de caixa', position.movements.cashOut],
    ['Saldo final registrado', position.closing],
  ] as const;
  const field = 'min-h-11 rounded border border-black/20 px-3 text-sm';
  return <section className="space-y-5 rounded-xl border border-black/10 bg-white p-4 sm:p-6">
    <h3 className="text-xl font-black">Fechamento mensal</h3>
    <p className="text-sm text-gray-600">Confira a posição na data de encerramento. O site guarda cada versão para comparar com os números recalculados.</p>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-sm font-bold">Mês encerrado
        <input type="month" min="2026-01" max={lastMonth} className={field} value={month} disabled={saving}
          onChange={event => { if (event.target.value && event.target.validity.valid) { setMonth(event.target.value); setRequestId(crypto.randomUUID()); setNotice(''); } }} />
      </label>
      <button type="button" className={field} disabled={saving} onClick={() => setReload(current => current + 1)}>Atualizar apuração</button>
    </div>
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    {!position && !error && <p role="status">Calculando fechamento…</p>}
    {preview && position && <>
      <div className="rounded-lg bg-neutral-50 p-3">
        <h4 className="mb-2 font-bold">Apuração atual do site</h4>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{moneyRows(position).map(([label, amount]) => <div key={label}><dt>{label}</dt><dd className="font-black">{formatMoney(amount)}</dd></div>)}</dl>
        <p className="mt-3 text-sm">{position.inventory ? `Inventário salvo em ${financialDateKey(position.inventory.capturedAt)?.split('-').reverse().join('/')} · ${position.inventory.variants} variações · ${position.inventory.divergences} divergências.` : 'Sem inventário salvo para o mês. Explique na observação.'}</p>
        {(position.reviewCount > 0 || position.undated.cashIn > 0 || position.undated.cashOut > 0) && <p className="mt-2 text-sm text-amber-900">Confira {position.reviewCount} divergência(s) e valores sem data. Entradas {formatMoney(position.undated.cashIn)} · saídas {formatMoney(position.undated.cashOut)}. Esses valores estão fora da apuração por mês.</p>}
      </div>
      {preview.saved && <p className="text-sm">Última versão salva: <strong>{preview.saved.revision}</strong>. Diferença atual no saldo registrado: <strong>{formatMoney(position.closing - preview.saved.position.closing)}</strong>.</p>}
      <form className="space-y-3" onSubmit={save}>
        <div className="grid gap-3 sm:grid-cols-3">{fields.map(([key, label]) => <label key={key} className="grid gap-1 text-xs font-bold">{label}
          <input required type="number" step="0.01" min={key === 'bankAndCashBalance' ? undefined : '0'} inputMode="decimal" value={balances[key]}
            onChange={event => setBalances(current => ({ ...current, [key]: event.target.value }))} className={field} />
        </label>)}</div>
        <label className="grid gap-1 text-xs font-bold">Observação{preview.saved || !position.inventory ? ' obrigatória' : ''}
          <textarea required={Boolean(preview.saved || !position.inventory)} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} className={`${field} py-2`} rows={2} />
        </label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required /> Conferi extratos, caixa, contas em aberto e a contagem de estoque ou registrei a pendência na observação.</label>
        <button type="submit" disabled={!confirmed || saving} className="min-h-11 rounded bg-black px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Salvando…' : preview.saved ? 'Salvar nova versão' : 'Salvar fechamento'}</button>
      </form>
      {!!preview.versions.length && <details className="border-t pt-3"><summary className="cursor-pointer font-bold">Versões salvas do mês</summary>
        <div className="mt-3 grid gap-2">{preview.versions.map(version => <article key={version.id} className="rounded border p-3 text-sm">
          <strong>Versão {version.revision}</strong> · {new Date(version.recordedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {version.recordedBy}
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{[...moneyRows(version.position), ...fields.map(([key, label]) => [label, version[key]] as const)].map(([label, amount]) => <div key={label}><dt>{label}</dt><dd className="font-bold">{formatMoney(amount)}</dd></div>)}</dl>
          {version.position.inventory && <p className="mt-2">Inventário {version.position.inventory.variants} variações · {version.position.inventory.divergences} divergências</p>}
          {version.note && <p className="mt-2 whitespace-pre-wrap break-words">{version.note}</p>}
        </article>)}</div>
      </details>}
      <div className="border-t pt-3 text-sm">
        <h4 className="font-bold">Resumo de {month.slice(0, 4)} · {preview.annual.length}/12 meses com fechamento</h4>
        <p>Vendas {formatMoney(preview.annual.reduce((sum, row) => sum + row.sales, 0))} · Recebido líquido {formatMoney(preview.annual.reduce((sum, row) => sum + row.received - row.refunded, 0))} · Saídas {formatMoney(preview.annual.reduce((sum, row) => sum + row.expenses, 0))}</p>
        <p className="mt-1 text-gray-600">{preview.annual.map(row => row.month.split('-').reverse().join('/')).join(' · ') || 'Nenhum mês fechado neste ano.'}</p>
      </div>
    </>}
  </section>;
}
