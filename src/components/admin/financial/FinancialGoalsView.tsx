import React, { useEffect, useMemo, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { Calendar, Save, Target, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../../lib/firebase';
import { salesGoalProgress } from '../../../../shared/financialDashboard';
import { financialDateKey } from '../../../../shared/cashFlow';
import { parseCurrencyInput } from '../../../../shared/currencyInput';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import { useFinancialGoalSettings } from '../../../hooks/useFinancialGoalSettings';

interface FinancialGoalsViewProps { orders: any[]; }
interface FinancialGoalSummaryProps extends FinancialGoalsViewProps { onOpenGoals: () => void; }

export function FinancialGoalSummary({ orders, onOpenGoals }: FinancialGoalSummaryProps) {
  const { formatMoney } = useFinancialPrivacy();
  const now = new Date(`${financialDateKey(new Date())}T12:00:00`);
  const monthlyGoalId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const annualGoalId = `${now.getFullYear()}-annual`;
  const goal = useFinancialGoalSettings(monthlyGoalId, annualGoalId);

  const actual = useMemo(() => {
    return salesGoalProgress(orders, now.getFullYear(), now.getMonth());

  }, [orders, now.getFullYear(), now.getMonth(), now.getDate()]);

  if (!goal.loaded) return <section className="rounded-2xl bg-black p-5 text-white" aria-label="Metas de vendas">
    <p role="status">{goal.error || 'Carregando metas…'}</p>
    {goal.error && <button type="button" onClick={goal.retry} className="mt-3 min-h-11 rounded-lg bg-[#eab308] px-4 text-sm font-bold text-black">Tentar carregar metas novamente</button>}
  </section>;

  const monthPercent = goal.monthlyGoal > 0 ? (actual.month / goal.monthlyGoal) * 100 : 0;
  const yearPercent = goal.annualGoal > 0 ? (actual.year / goal.annualGoal) * 100 : 0;
  const daysRemaining = Math.max(0, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate());

  return (
    <section className="rounded-2xl bg-black p-5 text-white shadow-lg">
      {actual.review > 0 && <p role="status" className="mb-3 text-xs text-amber-200">{actual.review} pedido(s) com data da venda ou valores inconsistentes ficam fora da meta até conferência.</p>}
      <p className="mb-3 text-xs text-white/60">Vendas confirmadas pelo mês do pedido. Pagamentos posteriores entram no caixa na data recebida.</p>
      {actual.pendingConfirmation > 0 && <p className="mb-3 text-xs text-amber-200">Pedidos online sem confirmação no mês: {formatMoney(actual.pendingConfirmation)}. Não entram no realizado da meta.</p>}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308]">Meta de vendas do mês</p><span className="text-xs font-bold text-white/60">{daysRemaining} dias restantes</span></div>
          <p className="mt-2 text-2xl font-black">{formatMoney(actual.month)} <span className="text-sm text-white/50">/ {goal.monthlyGoal > 0 ? formatMoney(goal.monthlyGoal) : 'meta não definida'}</span></p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#eab308] transition-all" style={{ width: `${Math.max(0, Math.min(100, monthPercent))}%` }} /></div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs font-bold text-white/60"><span>{monthPercent.toFixed(1)}% atingido</span><span>Faltam {formatMoney(Math.max(0, goal.monthlyGoal - actual.month))}</span></div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-4 md:min-w-64">
          <Target className="text-[#eab308]" size={24} />
          <div className="flex-1"><p className="text-[9px] font-black uppercase tracking-widest text-white/50">Meta anual</p><p className="font-black">{yearPercent.toFixed(1)}% <span className="text-xs text-white/50">({formatMoney(actual.year)})</span></p></div>
          <button type="button" onClick={onOpenGoals} className="rounded-lg bg-[#eab308] px-3 py-2 text-xs font-black uppercase text-black">Editar metas</button>
        </div>
      </div>
    </section>
  );
}

export function FinancialGoalsView({ orders }: FinancialGoalsViewProps) {
  const { formatMoney } = useFinancialPrivacy();
  const now = new Date(`${financialDateKey(new Date())}T12:00:00`);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [monthlyGoal, setMonthlyGoal] = useState(0);
  const [annualGoal, setAnnualGoal] = useState(0);
  const [monthlyGoalInput, setMonthlyGoalInput] = useState('');
  const [annualGoalInput, setAnnualGoalInput] = useState('');
  const [saving, setSaving] = useState(false);
  const monthlyGoalId = `${year}-${String(month + 1).padStart(2, '0')}`;
  const annualGoalId = `${year}-annual`;
  const settings = useFinancialGoalSettings(monthlyGoalId, annualGoalId);

  useEffect(() => {
    const monthly = settings.loaded ? settings.monthlyGoal : 0;
    const annual = settings.loaded ? settings.annualGoal : 0;
    setMonthlyGoal(monthly);
    setAnnualGoal(annual);
    setMonthlyGoalInput(monthly ? monthly.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    setAnnualGoalInput(annual ? annual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  }, [monthlyGoalId, annualGoalId, settings.loaded, settings.monthlyGoal, settings.annualGoal]);

  const actual = useMemo(() => {
    return salesGoalProgress(orders, year, month);

  }, [orders, year, month, now.getFullYear(), now.getMonth(), now.getDate()]);

  const monthPercent = monthlyGoal > 0 ? (actual.month / monthlyGoal) * 100 : 0;
  const yearPercent = annualGoal > 0 ? (actual.year / annualGoal) * 100 : 0;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const daysRemaining = isCurrentMonth ? Math.max(0, new Date(year, month + 1, 0).getDate() - now.getDate()) : 0;
  const missing = Math.max(0, monthlyGoal - actual.month);
  const dailyNeeded = daysRemaining > 0 ? missing / daysRemaining : missing;

  const save = async () => {
    if (!settings.loaded || saving) return;
    setSaving(true);
    try {
      const batch = writeBatch(db);
      const updatedAt = new Date().toISOString();
      batch.set(doc(db, 'financial_goals', monthlyGoalId), {
          year,
          month: month + 1,
          monthlyGoal: Math.max(0, monthlyGoal),
          basis: 'order_month',
          updatedAt
        }, { merge: true });
      batch.set(doc(db, 'financial_goals', annualGoalId), {
          year,
          annualGoal: Math.max(0, annualGoal),
          basis: 'order_month',
          updatedAt
        }, { merge: true });
      await batch.commit();
      toast.success('Metas salvas.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar as metas.');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">A venda conta uma única vez na meta do mês em que o pedido foi criado, mesmo com pagamento posterior ou parcelado. Vendas manuais confirmadas pela loja entram nesse mês; tentativas online sem confirmação ficam separadas. Cancelamentos e estornos ajustam a venda original. O caixa usa as datas reais de pagamento.</p>
      {actual.review > 0 && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{actual.review} pedido(s) precisam de conferência da data da venda ou dos valores e não entraram nas metas.</p>}
      {actual.pendingConfirmation > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Pedidos online sem confirmação no mês: {formatMoney(actual.pendingConfirmation)}. Fora do realizado da meta.</p>}
      <div className="flex flex-col gap-3 rounded-2xl bg-black p-5 text-white sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#eab308]">Metas comerciais</p><h2 className="mt-1 text-2xl font-black uppercase italic">Vendas por mês do pedido</h2></div>
        <div className="flex gap-2">
          <select aria-label="Mês da meta" value={month} onChange={event => setMonth(Number(event.target.value))} className="min-h-11 rounded-lg border border-white/20 bg-neutral-900 px-3 py-2 text-xs font-bold">
            {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{new Date(2024, index, 1).toLocaleDateString('pt-BR', { month: 'long' })}</option>)}
          </select>
          <input aria-label="Ano da meta" type="number" inputMode="numeric" value={year} onChange={event => setYear(Number(event.target.value) || now.getFullYear())} className="min-h-11 w-24 rounded-lg border border-white/20 bg-neutral-900 px-3 py-2 text-xs font-bold" />
        </div>
      </div>

      {!settings.loaded && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p role="status">{settings.error || 'Carregando metas…'}</p>
        {settings.error && <button type="button" onClick={settings.retry} className="mt-3 min-h-11 rounded-lg border border-black px-4 text-sm font-bold">Tentar carregar metas novamente</button>}
      </div>}
      {settings.loaded && <>
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { label: 'Meta do mês', goal: monthlyGoal, input: monthlyGoalInput, setGoal: setMonthlyGoal, setInput: setMonthlyGoalInput, done: actual.month, percent: monthPercent },
          { label: 'Meta anual', goal: annualGoal, input: annualGoalInput, setGoal: setAnnualGoal, setInput: setAnnualGoalInput, done: actual.year, percent: yearPercent }
        ].map(card => (
          <section key={card.label} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{card.label}</span><Target size={18} className="text-[#eab308]" /></div>
            <p className="mt-3 text-2xl font-black">{formatMoney(card.done)} <span className="text-sm text-gray-400">/ {formatMoney(card.goal)}</span></p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-[#eab308] transition-all" style={{ width: `${Math.max(0, Math.min(100, card.percent))}%` }} /></div>
            <div className="mt-2 flex justify-between text-[10px] font-bold text-gray-500"><span>{card.percent.toFixed(1)}% atingido</span><span>Faltam {formatMoney(Math.max(0, card.goal - card.done))}</span></div>
            <label className="mt-4 block text-[9px] font-black uppercase tracking-wider text-gray-500">Definir meta</label>
            <input aria-label={card.label} type="text" inputMode="decimal" placeholder="0,00" value={card.input} onChange={event => {
              const value = event.target.value.replace(/[^0-9,.]/g, '');
              card.setInput(value);
              card.setGoal(parseCurrencyInput(value));
            }} onBlur={() => card.setInput(card.goal ? card.goal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')} className="mt-1 min-h-11 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm font-bold" />
          </section>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><Calendar className="text-[#eab308]" size={18} /><p className="mt-2 text-[9px] font-black uppercase text-gray-500">Dias restantes</p><p className="text-xl font-black">{daysRemaining}</p></div>
        <div className="rounded-xl border bg-white p-4"><TrendingUp className="text-[#eab308]" size={18} /><p className="mt-2 text-[9px] font-black uppercase text-gray-500">Média diária necessária</p><p className="text-xl font-black">{formatMoney(dailyNeeded)}</p></div>
        <button type="button" disabled={saving || !settings.loaded} onClick={save} className="flex min-h-24 items-center justify-center gap-2 rounded-xl bg-[#eab308] px-5 font-black uppercase text-black disabled:opacity-50"><Save size={18} />{saving ? 'Salvando...' : 'Salvar metas'}</button>
      </div>
      </>}
    </div>
  );
}
