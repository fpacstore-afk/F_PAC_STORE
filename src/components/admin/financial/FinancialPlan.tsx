import { useEffect, useState } from 'react';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { financialDateKey } from '../../../../shared/cashFlow';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import { db } from '../../../lib/firebase';

const fields = [
  ['fixed', 'Custos fixos do mês (R$)', 'Ex.: domínio rateado, assinatura e internet da loja.'],
  ['withdrawal', 'Pró-labore planejado (R$)', 'Valor que você quer reservar para sua remuneração.'],
  ['buffer', 'Reserva adicional de caixa (R$)', 'Meta de formação de reserva no mês.'],
  ['margin', 'Margem de contribuição (%)', 'Quanto sobra das vendas após mercadorias, descontos, taxas e demais custos variáveis.'],
  ['ticket', 'Ticket médio planejado (R$)', 'Valor médio dos pedidos. Opcional para calcular o volume de vendas.'],
] as const;
type Key = typeof fields[number][0];
type Draft = Record<Key, string>;
const empty: Draft = { fixed: '', withdrawal: '', buffer: '', margin: '', ticket: '' };
const input = 'min-h-11 rounded border border-neutral-300 px-3 text-sm';
const decode = (value: string) => /^\d+(?:[,.]\d{1,2})?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : NaN;

function MonthPlan({ month }: { month: string }) {
  const { formatMoney } = useFinancialPrivacy();
  const [form, setForm] = useState<Draft>(empty);
  const [revision, setRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => onSnapshot(doc(db, 'settings', 'financial_plan_' + month), snapshot => {
    if (dirty) return;
    const data = snapshot.data();
    const next = { ...empty };
    for (const [key] of fields) if (typeof data?.[key] === 'number') next[key] = String(data[key]).replace('.', ',');
    setForm(next);
    setRevision(data?.revision ?? 0);
  }, () => { setError('Não foi possível carregar o plano do mês.'); setRevision(null); }), [month, dirty]);
  const values = {
    fixed: decode(form.fixed), withdrawal: decode(form.withdrawal),
    buffer: decode(form.buffer), margin: decode(form.margin),
    ticket: form.ticket.trim() ? decode(form.ticket) : null,
  };
  const canCalculate = [values.fixed, values.withdrawal, values.buffer].every(value => Number.isFinite(value) && value <= 10000000)
    && values.margin > 0 && values.margin <= 100 && (values.ticket === null || values.ticket > 0 && values.ticket <= 10000000);
  const operating = values.fixed / (values.margin / 100);
  const target = (values.fixed + values.withdrawal + values.buffer) / (values.margin / 100);
  async function save() {
    if (!canCalculate || revision === null || busy || !dirty) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const ref = doc(db, 'settings', 'financial_plan_' + month);
      await runTransaction(db, async transaction => {
        const current = (await transaction.get(ref)).data();
        if ((current?.revision ?? 0) !== revision) throw new Error('O plano deste mês mudou em outra sessão. Recarregue antes de salvar.');
        transaction.set(ref, { ...values, month, revision: revision + 1, updatedAt: serverTimestamp() });
      });
      setDirty(false);
      setNotice('Plano mensal salvo.');
    } catch (failure) { setError((failure as Error).message || 'Não foi possível salvar o plano.'); }
    finally { setBusy(false); }
  }
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
    <fieldset disabled={busy || revision === null} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map(([key, label, help]) => <label className="grid content-start gap-1 text-sm font-bold" key={key}>{label}
        <input className={input} value={form[key]} required={key !== 'ticket'} inputMode="decimal"
          onChange={event => { setForm({ ...form, [key]: event.target.value }); setDirty(true); setNotice(''); }} />
        <span className="text-xs font-normal text-neutral-600">{help}</span>
      </label>)}
    </fieldset>
    <dl className="grid gap-3 sm:grid-cols-3">
      <div className="rounded bg-neutral-100 p-4"><dt>Cobrir a operação</dt><dd className="font-black">{canCalculate ? formatMoney(Math.ceil(operating * 100) / 100) : '—'}</dd></div>
      <div className="rounded bg-neutral-950 p-4 text-white"><dt>Meta com pró-labore e reserva</dt><dd className="font-black">{canCalculate ? formatMoney(Math.ceil(target * 100) / 100) : '—'}</dd></div>
      <div className="rounded bg-neutral-100 p-4"><dt>Pedidos para alcançar a meta</dt><dd className="font-black">{canCalculate && values.ticket ? Math.ceil(target / values.ticket) : '—'}</dd></div>
    </dl>
    <p className="text-xs text-neutral-600">Use a mesma base de vendas para a margem e o ticket. Confira o caixa e os compromissos do mês antes de realizar a retirada.</p>
    <div className="flex flex-wrap items-center gap-3">
      <button className="min-h-11 rounded bg-black px-4 font-bold text-white disabled:opacity-50" disabled={!canCalculate || revision === null || busy || !dirty}>Salvar plano do mês</button>
      {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  </form>;
}

export function FinancialPlan() {
  const { showFinancialValues } = useFinancialPrivacy();
  const [month, setMonth] = useState(() => (financialDateKey(new Date()) || '').slice(0, 7));
  return <section className="space-y-4 rounded-xl border border-black/10 bg-white p-4 sm:p-6">
    <header><h2 className="text-xl font-black text-black">Planejamento financeiro</h2><p className="mt-1 text-sm text-neutral-600">Defina quanto a loja precisa vender para cobrir a operação, remunerar o proprietário e formar reserva.</p></header>
    {showFinancialValues ? <>
      <label className="grid max-w-xs gap-1 text-sm font-bold">Mês do plano<input type="month" className={input} value={month} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value); }} /></label>
      <MonthPlan key={month} month={month} />
    </> : <p className="text-sm text-neutral-600">Ative “Mostrar informações financeiras” no topo para abrir o planejamento.</p>}
  </section>;
}
