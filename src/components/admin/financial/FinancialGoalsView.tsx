import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { Calendar, Save, Target, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../../lib/firebase';
import { getOrderNetReceived } from '../../../utils/orderFinancial';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';

interface FinancialGoalsViewProps { orders: any[]; }
interface FinancialGoalSummaryProps extends FinancialGoalsViewProps { onOpenGoals: () => void; }

function paymentDate(value: any): Date | null {
  if (!value) return null;
  const parsed = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function receivedInPeriod(order: any, start: Date, end: Date): number {
  const logs = Array.isArray(order.paymentLogs) ? order.paymentLogs : [];
  if (logs.length > 0) {
    return logs.reduce((sum: number, log: any) => {
      const date = paymentDate(log.date || log.paidAt || log.createdAt);
      return date && date >= start && date <= end ? sum + Math.max(0, Number(log.amount || 0)) : sum;
    }, 0);
  }
  const paidAt = paymentDate(order.payment?.paidAt || order.paidAt || order.createdAt);
  return paidAt && paidAt >= start && paidAt <= end ? getOrderNetReceived(order) : 0;
}

export function FinancialGoalSummary({ orders, onOpenGoals }: FinancialGoalSummaryProps) {
  const { formatMoney } = useFinancialPrivacy();
  const now = new Date();
  const goalId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [goal, setGoal] = useState({ monthlyGoal: 0, annualGoal: 0 });

  useEffect(() => onSnapshot(doc(db, 'financial_goals', goalId), snapshot => {
    const data = snapshot.data();
    setGoal({ monthlyGoal: Number(data?.monthlyGoal || 0), annualGoal: Number(data?.annualGoal || 0) });
  }), [goalId]);

  const actual = useMemo(() => {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return {
      month: orders.reduce((sum, order) => sum + receivedInPeriod(order, monthStart, monthEnd), 0),
      year: orders.reduce((sum, order) => sum + receivedInPeriod(order, yearStart, yearEnd), 0)
    };
  }, [orders, now.getFullYear(), now.getMonth()]);

  const monthPercent = goal.monthlyGoal > 0 ? Math.min(100, (actual.month / goal.monthlyGoal) * 100) : 0;
  const yearPercent = goal.annualGoal > 0 ? Math.min(100, (actual.year / goal.annualGoal) * 100) : 0;
  const daysRemaining = Math.max(0, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate());

  return (
    <section className="rounded-2xl bg-black p-5 text-white shadow-lg">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#eab308]">Meta de faturamento do mês</p><span className="text-xs font-bold text-white/60">{daysRemaining} dias restantes</span></div>
          <p className="mt-2 text-2xl font-black">{formatMoney(actual.month)} <span className="text-sm text-white/50">/ {goal.monthlyGoal > 0 ? formatMoney(goal.monthlyGoal) : 'meta não definida'}</span></p>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#eab308] transition-all" style={{ width: `${monthPercent}%` }} /></div>
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
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [monthlyGoal, setMonthlyGoal] = useState(0);
  const [annualGoal, setAnnualGoal] = useState(0);
  const [saving, setSaving] = useState(false);
  const goalId = `${year}-${String(month + 1).padStart(2, '0')}`;

  useEffect(() => onSnapshot(doc(db, 'financial_goals', goalId), snapshot => {
    const data = snapshot.data();
    setMonthlyGoal(Number(data?.monthlyGoal || 0));
    setAnnualGoal(Number(data?.annualGoal || 0));
  }), [goalId]);

  const actual = useMemo(() => {
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    return {
      month: orders.reduce((sum, order) => sum + receivedInPeriod(order, monthStart, monthEnd), 0),
      year: orders.reduce((sum, order) => sum + receivedInPeriod(order, yearStart, yearEnd), 0)
    };
  }, [orders, year, month]);

  const monthPercent = monthlyGoal > 0 ? Math.min(100, (actual.month / monthlyGoal) * 100) : 0;
  const yearPercent = annualGoal > 0 ? Math.min(100, (actual.year / annualGoal) * 100) : 0;
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
        {[{ label: 'Meta do mês', goal: monthlyGoal, setGoal: setMonthlyGoal, done: actual.month, percent: monthPercent }, { label: 'Meta anual', goal: annualGoal, setGoal: setAnnualGoal, done: actual.year, percent: yearPercent }].map(card => (
          <section key={card.label} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{card.label}</span><Target size={18} className="text-[#eab308]" /></div>
            <p className="mt-3 text-2xl font-black">{formatMoney(card.done)} <span className="text-sm text-gray-400">/ {formatMoney(card.goal)}</span></p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-[#eab308] transition-all" style={{ width: `${card.percent}%` }} /></div>
            <div className="mt-2 flex justify-between text-[10px] font-bold text-gray-500"><span>{card.percent.toFixed(1)}% atingido</span><span>Faltam {formatMoney(Math.max(0, card.goal - card.done))}</span></div>
            <label className="mt-4 block text-[9px] font-black uppercase tracking-wider text-gray-500">Definir meta</label>
            <input type="number" min={0} step="0.01" value={card.goal} onChange={event => card.setGoal(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm font-bold" />
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
