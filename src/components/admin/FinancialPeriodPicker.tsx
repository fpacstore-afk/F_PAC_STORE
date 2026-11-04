import { financialDateKey } from '../../../shared/cashFlow';

const periods = [
  ['all', 'Todo o histórico'], ['today', 'Hoje'], ['7days', 'Últimos 7 dias'],
  ['current_month', 'Mês atual'], ['previous_month', 'Mês anterior'], ['quarter', 'Últimos 90 dias'],
  ['year', 'Ano atual'], ['previous_year', 'Ano anterior'], ['month', 'Escolher mês'], ['calendar-year', 'Escolher ano'],
] as const;

export function FinancialPeriodPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const today = financialDateKey(new Date())!;
  const [kind, selected] = value.split(':');
  const mode = kind === 'year' && selected ? 'calendar-year' : kind;
  const field = 'min-h-10 rounded border border-black/15 bg-white px-2 text-sm';
  return <div className="flex flex-wrap items-center gap-2">
    <select aria-label="Período de análise" className={field} value={mode} onChange={event => {
      const next = event.target.value;
      onChange(next === 'month' ? `month:${today.slice(0, 7)}` : next === 'calendar-year' ? `year:${today.slice(0, 4)}` : next);
    }}>
      {periods.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      {mode === 'range' && <option value="range">Período do painel</option>}
    </select>
    {mode === 'month' && <input aria-label="Mês de referência" type="month" max={today.slice(0, 7)} className={field} value={selected}
      onChange={event => { if (event.target.value && event.target.validity.valid) onChange(`month:${event.target.value}`); }} />}
    {mode === 'calendar-year' && <select aria-label="Ano de referência" className={field} value={selected} onChange={event => onChange(`year:${event.target.value}`)}>
      {Array.from({ length: Math.max(1, Number(today.slice(0, 4)) - 2026 + 1) }, (_, index) => Number(today.slice(0, 4)) - index)
        .map(year => <option key={year} value={year}>{year}</option>)}
    </select>}
  </div>;
}
