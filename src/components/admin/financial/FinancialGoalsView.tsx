import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Calendar, Save, Target, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../../lib/firebase';
import { summarizeReceipts, receiptGoalRanges } from '../../../../shared/financialReceipts';
import { financialDateKey } from '../../../../shared/cashFlow';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';

const parseCurrency = (value: string) => {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100) / 100) : 0;
};

interface FinancialGoalsViewProps { orders: any[]; }
interface FinancialGoalSummaryProps extends FinancialGoalsViewProps { onOpenGoals: () => void; }

export function FinancialGoalSummary({ orders, onOpenGoals }: FinancialGoalSummaryProps) {
  const { formatMoney } = useFinancialPrivacy();
  const now = new Date(`${financialDateKey(new Date())}T12:00:00`);
  const goalId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [goal, setGoal] = useState({ monthlyGoal: 0, annualGoal: 0 });

  useEffect(() => onSnapshot(doc(db, 'financial_goals', goalId), snapshot => {
    const data = snapshot.data();
    setGoal({ monthlyGoal: Number(data?.monthlyGoal || 0), annualGoal: Number(data?.annualGoal || 0) });
  }), [goalId]);

  const actual = useMemo(() => {
    const ranges = receiptGoalRanges(now.getFullYear(), now.getMonth());
    const month = summarizeReceipts(orders, ranges.month);
    const year = summarizeReceipts(orders, ranges.year);
    return { month: month.netReceived, year: year.netReceived, review: month.ordersNeedingReview };

  }, [orders, now.getFullYear(), now.getMonth(), now.getDate()]);

  const monthPercent = goal.monthlyGoal > 0 ? (actual.month / goal.monthlyGoal) * 100 : 0;
  const yearPercent = goal.annualGoal > 0 ? (actual.year / goal.annualGoal) * 100 : 0;
  const daysRemaining = Math.max(0, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate());

  return (
    <section className="rounded-2xl bg-black p-5 text-white shadow-lg">
      {actual.review > 0 && <p role="status" className="mb-3 text-xs text-amber-200">{actual.review} pedido(s) com histórico financeiro incompleto ou divergente. Valores sem data confiável ficam fora da meta até conferência.</p>}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308]">Meta de faturamento do mês</p><span className="text-xs font-bold text-white/60">{daysRemaining} dias restantes</span></div>
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
  const goalId = `${year}-${String(month + 1).padStart(2, '0')}`;

  useEffect(() => onSnapshot(doc(db, 'financial_goals', goalId), snapshot => {
    const data = snapshot.data();
    const monthly = Number(data?.monthlyGoal || 0);
    const annual = Number(data?.annualGoal || 0);
    setMonthlyGoal(monthly);
    setAnnualGoal(annual);
    setMonthlyGoalInput(monthly ? monthly.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
    setAnnualGoalInput(annual ? annual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');
  }), [goalId]);

  const actual = useMemo(() => {
    const ranges = receiptGoalRanges(year, month);
    const monthly = summarizeReceipts(orders, ranges.month);
    const yearly = summarizeReceipts(orders, ranges.year);
    return { month: monthly.netReceived, year: yearly.netReceived, review: monthly.ordersNeedingReview };

  }, [orders, year, month, now.getFullYear(), now.getMonth(), now.getDate()]);

  const monthPercent = monthlyGoal > 0 ? (actual.month / monthlyGoal) * 100 : 0;
  const yearPercent = annualGoal > 0 ? (actual.year / annualGoal) * 100 : 0;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const daysRemaining = isCurrentMonth ? Math.max(0, new Date(year, month + 1, 0).getDate() - now.getDate()) : 0;
  const missing = Math.max(0, monthlyGoal - actual.month);
  const dailyNeeded = daysRemaining > 0 ? missing / daysRemaining : missing;

  const save = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'financial_goals', goalId), {
        year,
        month: month + 1,
        monthlyGoal: Math.max(0, monthlyGoal),
        annualGoal: Math.max(0, annualGoal),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      toast.success('Metas salvas.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar as metas.');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">Recebimentos menos estornos, nas respectivas datas registradas. A criação ou entrega do pedido não define o mês de recebimento.</p>
      {actual.review > 0 && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{actual.review} pedido(s) precisam de conferência do histórico. Valores sem data confiável não foram distribuídos entre meses.</p>}
      <div className="flex flex-col gap-3 rounded-2xl bg-black p-5 text-white sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#eab308]">Metas financeiras</p><h2 className="mt-1 text-2xl font-black uppercase italic">Faturamento recebido</h2></div>
        <div className="flex gap-2">
          <select value={month} onChange={event => setMonth(Number(event.target.value))} className="rounded-lg border border-white/20 bg-neutral-900 px-3 py-2 text-xs font-bold">
            {Array.from({ length: 12 }, (_, index) => <option key={index} value={index}>{new Date(2024, index, 1).toLocaleDateString('pt-BR', { month: 'long' })}</option>)}
          </select>
          <input type="number" value={year} onChange={event => setYear(Number(event.target.value) || now.getFullYear())} className="w-24 rounded-lg border border-white/20 bg-neutral-900 px-3 py-2 text-xs font-bold" />
        </div>
      </div>

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
            <input type="text" inputMode="decimal" placeholder="0,00" value={card.input} onChange={event => {
              const value = event.target.value.replace(/[^0-9,.]/g, '');
              card.setInput(value);
              card.setGoal(parseCurrency(value));
            }} onBlur={() => card.setInput(card.goal ? card.goal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '')} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm font-bold" />
          </section>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4"><Calendar className="text-[#eab308]" size={18} /><p className="mt-2 text-[9px] font-black uppercase text-gray-500">Dias restantes</p><p className="text-xl font-black">{daysRemaining}</p></div>
        <div className="rounded-xl border bg-white p-4"><TrendingUp className="text-[#eab308]" size={18} /><p className="mt-2 text-[9px] font-black uppercase text-gray-500">Média diária necessária</p><p className="text-xl font-black">{formatMoney(dailyNeeded)}</p></div>
        <button type="button" disabled={saving} onClick={save} className="flex min-h-24 items-center justify-center gap-2 rounded-xl bg-[#eab308] px-5 font-black uppercase text-black disabled:opacity-50"><Save size={18} />{saving ? 'Salvando...' : 'Salvar metas'}</button>
      </div>
    </div>
  );
}
