import React, { useMemo, useRef, useState } from 'react';
import { auditExpenseSources } from '../../../../shared/expenseAudit';
import { financialDateKey } from '../../../../shared/cashFlow';
import { parseCurrencyInput } from '../../../../shared/currencyInput';
import { QUICK_EXPENSE_CATEGORIES } from '../../../../shared/cashFlowOptions';
import { authenticatedFetch } from '../../../lib/api';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import toast from 'react-hot-toast';

const CATEGORIES: readonly string[] = QUICK_EXPENSE_CATEGORIES;
const SOURCE_PATH: Record<string, string> = {
  financial_cashflow: 'cashflow',
  financial_investments: 'investments',
  financial_traffic: 'traffic'
};
const SOURCE_LABEL: Record<string, string> = {
  financial_cashflow: 'Movimentações',
  financial_investments: 'Investimentos antigos',
  financial_traffic: 'Tráfego Ads'
};

type ExpenseForm = { category: string; amount: string; date: string; description: string; paymentMethod: string };
const freshForm = (): ExpenseForm => ({
  category: 'Combustível', amount: '', date: financialDateKey(new Date()) || '', description: '', paymentMethod: ''
});

export function ExpenseCenter({ cashflow, investments, traffic }: {
  cashflow: any[]; investments: any[]; traffic: any[];
}) {
  const { formatMoney } = useFinancialPrivacy();
  const [form, setForm] = useState<ExpenseForm>(freshForm);
  const [saving, setSaving] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<ExpenseForm>(freshForm);
  const [busyId, setBusyId] = useState('');
  // Keep the same key on a failed/uncertain network response; new input gets a new key.
  const submissionKey = useRef<string | null>(null);

  const audit = useMemo(() => auditExpenseSources(cashflow, investments, traffic), [cashflow, investments, traffic]);
  const rows = useMemo(() => [...audit.rows]
    .sort((a, b) => {
      const aDate = financialDateKey(a.date || a.createdAt) || '';
      const bDate = financialDateKey(b.date || b.createdAt) || '';
      return bDate.localeCompare(aDate) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    }), [audit]);
  const possibleDuplicateIds = useMemo(() => new Set(audit.possibleDuplicates.flatMap(group =>
    group.map(row => `${row.source}:${row.id}`))), [audit]);
  const filtered = useMemo(() => rows.filter(row => {
    const day = financialDateKey(row.date || row.createdAt) || '';
    if (start && (!day || day < start)) return false;
    if (end && (!day || day > end)) return false;
    if (category && String(row.category || '').toLowerCase() !== category.toLowerCase()) return false;
    if (query && !`${row.description || ''} ${row.category || ''}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))) return false;
    return true;
  }), [rows, start, end, category, query]);
  const today = financialDateKey(new Date()) || '';
  const sum = (entries: any[]) => entries.reduce((total, entry) => total + Number(entry.amount || 0), 0);
  const todayTotal = sum(rows.filter(entry => financialDateKey(entry.date || entry.createdAt) === today));
  const monthTotal = sum(rows.filter(entry => financialDateKey(entry.date || entry.createdAt)?.startsWith(today.slice(0, 7))));
  const filteredTotal = sum(filtered);
  const categories = [...new Set(rows.map(row => String(row.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const totalsFor = (length: number) => {
    const groups = new Map<string, { count: number; amount: number }>();
    for (const row of filtered) {
      const period = financialDateKey(row.date || row.createdAt)?.slice(0, length);
      if (!period) continue;
      const previous = groups.get(period) || { count: 0, amount: 0 };
      groups.set(period, { count: previous.count + 1, amount: previous.amount + Number(row.amount || 0) });
    }
    return [...groups].sort(([a], [b]) => b.localeCompare(a));
  };
  const byDay = totalsFor(10);
  const byMonth = totalsFor(7);

  const changeForm = (update: Partial<ExpenseForm>) => {
    submissionKey.current = null;
    setAllowDuplicate(false);
    setForm(previous => ({ ...previous, ...update }));
  };

  const createExpense = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const amount = parseCurrencyInput(form.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !financialDateKey(form.date)) {
      toast.error('Informe valor e data válidos.');
      return;
    }
    setSaving(true);
    submissionKey.current ||= `quick_expense_${crypto.randomUUID()}`;
    try {
      const response = await authenticatedFetch('/api/admin/financial/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'out', category: form.category, amount, date: form.date,
          description: form.description.trim() || form.category,
          paymentMethod: form.paymentMethod.trim(), sourceType: 'quick_expense',
          preventSameDayDuplicate: !allowDuplicate, idempotencyKey: submissionKey.current
        })
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.error === 'POSSIBLE_DUPLICATE') {
        setAllowDuplicate(true);
        toast.error('Já existe um gasto da mesma categoria, valor e data. Confira o histórico antes de registrar outro.');
        return;
      }
      if (!response.ok) throw new Error(result.message || result.error || 'Não foi possível salvar a despesa.');
      submissionKey.current = null;
      setAllowDuplicate(false);
      setForm(freshForm());
      toast.success(result.idempotentReplay ? 'Lançamento já registrado.' : 'Despesa registrada no histórico.');
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível salvar a despesa.');
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (row: any) => {
    setEditing(row);
    setEditForm({
      category: String(row.category || 'Outros'), amount: Number(row.amount || 0).toFixed(2).replace('.', ','),
      date: financialDateKey(row.date || row.createdAt) || '', description: String(row.description || ''),
      paymentMethod: String(row.paymentMethod || '')
    });
  };

  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || busyId) return;
    const amount = parseCurrencyInput(editForm.amount);
    if (amount <= 0 || !financialDateKey(editForm.date) || !editForm.description.trim()) {
      toast.error('Confira valor, data e descrição.');
      return;
    }
    if (!window.confirm('Salvar as alterações desta despesa? O valor e os indicadores serão atualizados, com registro da alteração.')) return;
    setBusyId(editing.id);
    try {
      const response = await authenticatedFetch(`/api/admin/financial/expenses/${SOURCE_PATH[editing.recordSource]}/${encodeURIComponent(editing.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount, date: editForm.date, description: editForm.description.trim(),
          category: editForm.category, paymentMethod: editForm.paymentMethod.trim(),
          expectedUpdatedAt: typeof editing.updatedAt === 'string' ? editing.updatedAt : '',
          idempotencyKey: `edit_expense_${crypto.randomUUID()}`
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || 'Erro ao editar despesa.');
      setEditing(null);
      toast.success('Despesa atualizada.');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao editar despesa.');
    } finally {
      setBusyId('');
    }
  };

  const voidExpense = async (row: any) => {
    if (busyId || !window.confirm(`Anular ${row.description} de ${formatMoney(Number(row.amount || 0))}? O registro será preservado para auditoria.`)) return;
    setBusyId(row.id);
    const source = SOURCE_PATH[row.recordSource];
    const field = source === 'traffic' ? 'trafficId' : source === 'investments' ? 'investmentId' : 'expenseId';
    try {
      const response = await authenticatedFetch(`/api/admin/financial/${source === 'cashflow' ? 'expenses' : source}/void`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: row.id, reason: 'Anulação confirmada na Central de Despesas', idempotencyKey: `void_expense_${crypto.randomUUID()}` })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || 'Erro ao anular despesa.');
      toast.success('Despesa anulada, com histórico preservado.');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao anular despesa.');
    } finally {
      setBusyId('');
    }
  };

  const inputClass = 'w-full rounded-lg border border-black/15 bg-white px-3 py-3 text-sm text-black focus:border-[#eab308] focus:outline-none';
  return <section className="space-y-5" aria-label="Central de despesas">
    <header className="rounded-xl bg-black p-5 text-white">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308]">Financeiro · Central de despesas</p>
      <h2 className="mt-1 text-xl font-black uppercase">Lançamento Rápido</h2>
      <p className="mt-2 text-xs text-white/70">Registre o custo e acompanhe as despesas antigas e novas em um único histórico.</p>
    </header>
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <form onSubmit={createExpense} className="h-fit space-y-4 rounded-xl border border-black/10 bg-white p-5 shadow-sm">
        <label className="block text-xs font-bold">Categoria
          <select className={`${inputClass} mt-1`} value={form.category} onChange={event => changeForm({ category: event.target.value })}>
            {CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-bold">Valor (R$)
            <input required inputMode="decimal" className={`${inputClass} mt-1`} placeholder="0,00" value={form.amount} onChange={event => changeForm({ amount: event.target.value.replace(/[^0-9,.]/g, '') })} />
          </label>
          <label className="block text-xs font-bold">Data
            <input required type="date" className={`${inputClass} mt-1`} value={form.date} onChange={event => changeForm({ date: event.target.value })} />
          </label>
        </div>
        <label className="block text-xs font-bold">Descrição <span className="font-normal text-gray-500">(opcional)</span>
          <input className={`${inputClass} mt-1`} placeholder="Ex.: Custo de combustível" value={form.description} onChange={event => changeForm({ description: event.target.value })} />
        </label>
        <label className="block text-xs font-bold">Forma de pagamento <span className="font-normal text-gray-500">(opcional)</span>
          <input className={`${inputClass} mt-1`} placeholder="Pode deixar em branco" value={form.paymentMethod} onChange={event => changeForm({ paymentMethod: event.target.value })} />
        </label>
        {allowDuplicate && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">Já existe um lançamento com esta data, categoria e valor. Confira a lista. Se foi outra compra real, confirme para registrar mesmo assim.</p>}
        <button disabled={saving} className="w-full rounded-lg bg-[#eab308] px-4 py-3 text-sm font-black uppercase text-black disabled:opacity-50">{saving ? 'Salvando…' : allowDuplicate ? 'Confirmar novo lançamento' : 'Salvar despesa'}</button>
      </form>
      <div className="min-w-0 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            ['Hoje', todayTotal], ['Mês atual', monthTotal], ['Resultado dos filtros', filteredTotal]
          ].map(([label, amount]) => <div key={String(label)} className="rounded-xl border border-black/10 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
            <p className="mt-1 text-xl font-black">{formatMoney(Number(amount))}</p>
          </div>)}
        </div>
        <div className="rounded-xl border border-black/10 bg-white p-4">
          <h3 className="text-sm font-black uppercase">Histórico de despesas</h3>
          <p className="mt-1 text-xs text-gray-500">Registros das movimentações, investimentos e tráfego, exibidos pela origem original. Nenhuma cópia é criada.</p>
          {audit.possibleDuplicates.length > 0 && <p role="status" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            {audit.possibleDuplicates.length} grupo(s) com mesma data, categoria e valor merecem conferência. Esses registros continuam separados até confirmar se são pagamentos distintos.
          </p>}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <input aria-label="Filtrar por descrição" className={inputClass} placeholder="Buscar descrição" value={query} onChange={event => setQuery(event.target.value)} />
            <select aria-label="Filtrar categoria" className={inputClass} value={category} onChange={event => setCategory(event.target.value)}>
              <option value="">Todas as categorias</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
            <input aria-label="Data inicial" type="date" className={inputClass} value={start} onChange={event => setStart(event.target.value)} />
            <input aria-label="Data final" type="date" className={inputClass} value={end} onChange={event => setEnd(event.target.value)} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {([
              ['Totais por dia', byDay, true], ['Totais por mês', byMonth, false]
            ] as const).map(([title, groups, daily]) => <details key={title} className="rounded-lg border border-black/10 p-3 text-xs">
              <summary className="cursor-pointer font-bold">{title} ({groups.length})</summary>
              <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                {groups.map(([period, item]) => <div key={period} className="flex items-center justify-between gap-3 border-b border-black/5 pb-2">
                  <span>{daily ? period.split('-').reverse().join('/') : `${period.slice(5, 7)}/${period.slice(0, 4)}`} · {item.count} {item.count === 1 ? 'despesa' : 'despesas'}</span>
                  <strong>{formatMoney(item.amount)}</strong>
                </div>)}
                {groups.length === 0 && <p className="text-gray-500">Nenhum gasto no período filtrado.</p>}
              </div>
            </details>)}
          </div>
          <p className="mt-3 text-xs text-gray-500">{filtered.length} {filtered.length === 1 ? 'lançamento' : 'lançamentos'} · ordem do mais recente ao mais antigo</p>
          <div className="mt-3 max-h-[600px] space-y-2 overflow-y-auto">
            {filtered.length === 0 && <p className="py-10 text-center text-sm text-gray-500">Nenhuma despesa encontrada.</p>}
            {filtered.map(row => <article key={`${row.recordSource}:${row.id}`} className="rounded-lg border border-black/10 p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold">{row.description}</p>
                  <p className="mt-1 text-xs text-gray-600">{financialDateKey(row.date || row.createdAt)?.split('-').reverse().join('/') || 'Data não informada'} · {row.category} · {SOURCE_LABEL[row.recordSource]}{row.sourceType === 'quick_expense' ? ' · Lançamento rápido' : ''}</p>
                  {possibleDuplicateIds.has(`${row.recordSource}:${row.id}`) && <p className="mt-1 text-xs font-bold text-amber-800">Possível repetição — conferir origem e comprovante</p>}
                  {row.paymentMethod && <p className="mt-1 text-xs text-gray-500">Pagamento: {row.paymentMethod}</p>}
                </div>
                <strong className="text-base">{formatMoney(Number(row.amount || 0))}</strong>
              </div>
              {row.sourceType !== 'accounts_payable' && <div className="mt-3 flex gap-2 text-xs font-bold">
                <button className="rounded border px-3 py-2 hover:bg-gray-100 disabled:opacity-50" disabled={Boolean(busyId)} onClick={() => beginEdit(row)}>Editar</button>
                <button className="rounded border border-red-200 px-3 py-2 text-red-700 hover:bg-red-50 disabled:opacity-50" disabled={Boolean(busyId)} onClick={() => voidExpense(row)}>Anular</button>
              </div>}
            </article>)}
          </div>
        </div>
      </div>
    </div>
    {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Editar despesa">
      <form onSubmit={saveEdit} className="w-full max-w-md space-y-3 rounded-xl bg-white p-5">
        <h3 className="text-lg font-black">Editar despesa</h3>
        <p className="text-xs text-gray-500">Origem: {SOURCE_LABEL[editing.recordSource]}. O histórico original será preservado.</p>
        {editing.recordSource === 'financial_cashflow' ? <label className="block text-xs font-bold">Categoria
          <select className={`${inputClass} mt-1`} value={editForm.category} onChange={event => setEditForm(previous => ({ ...previous, category: event.target.value }))}>
            {!CATEGORIES.some(value => value.toLowerCase() === editForm.category.toLowerCase()) && <option value={editForm.category}>{editForm.category}</option>}
            {CATEGORIES.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label> : <p className="text-xs font-bold">Categoria: {editForm.category}</p>}
        <label className="block text-xs font-bold">Descrição<input required className={`${inputClass} mt-1`} value={editForm.description} onChange={event => setEditForm(previous => ({ ...previous, description: event.target.value }))} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-bold">Valor (R$)<input required inputMode="decimal" className={`${inputClass} mt-1`} value={editForm.amount} onChange={event => setEditForm(previous => ({ ...previous, amount: event.target.value.replace(/[^0-9,.]/g, '') }))} /></label>
          <label className="block text-xs font-bold">Data<input required type="date" className={`${inputClass} mt-1`} value={editForm.date} onChange={event => setEditForm(previous => ({ ...previous, date: event.target.value }))} /></label>
        </div>
        <label className="block text-xs font-bold">Forma de pagamento (opcional)<input className={`${inputClass} mt-1`} value={editForm.paymentMethod} onChange={event => setEditForm(previous => ({ ...previous, paymentMethod: event.target.value }))} /></label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => setEditing(null)} className="rounded border px-4 py-3 text-xs font-bold">Cancelar</button>
          <button disabled={Boolean(busyId)} className="rounded bg-[#eab308] px-4 py-3 text-xs font-black disabled:opacity-50">Salvar alterações</button>
        </div>
      </form>
    </div>}
  </section>;
}
