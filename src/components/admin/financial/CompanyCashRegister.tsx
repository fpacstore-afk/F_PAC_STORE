import React, { useEffect, useState, useRef } from 'react';
import { authenticatedFetch } from '../../../lib/api';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import toast from 'react-hot-toast';

type Props = { revisionKey: object; onMovement: () => void; onWithdrawal: () => void; onProLabore: () => void; onPayables: () => void };
export function CompanyCashRegister({ revisionKey, onMovement, onWithdrawal, onProLabore, onPayables }: Props) {
  const { formatMoney } = useFinancialPrivacy();
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [period, setPeriod] = useState('week');
  const [error, setError] = useState('');
  const generation = useRef(0);
  async function refresh() {
    const request = ++generation.current;
    setLoading(true); setConfirmReset(false);
    try {
      const response = await authenticatedFetch('/api/admin/financial/cash-register');
      const data = await response.json();
      if (!response.ok || !data.summary) throw new Error(data.error || 'Não foi possível carregar o caixa.');
      if (request === generation.current) { setSummary(data.summary); setError(''); }
    } catch (err: any) { if (request === generation.current) { setSummary(null); setError(err.message); } }
    finally { if (request === generation.current) setLoading(false); }
  }
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, [revisionKey]);
  async function reset() {
    if (!summary || resetting) return;
    setResetting(true);
    try {
      const response = await authenticatedFetch('/api/admin/financial/cash-register/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID(), revision: summary.revision, expectedBalance: summary.cycle.balance })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível zerar o indicador.');
      toast.success('Novo ciclo de caixa iniciado. Histórico preservado.');
      await refresh();
    } catch (err: any) { toast.error(err.message); setConfirmReset(false); }
    finally { setResetting(false); }
  }
  const button = 'rounded-lg border border-black/20 px-4 py-3 text-sm font-bold disabled:opacity-50';
  const selected = summary?.periods?.[period];
  return <section aria-label="Caixa da empresa" className="space-y-5 rounded-xl border border-black/10 bg-white p-4 md:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-black">Caixa da empresa</h2><p className="text-sm text-gray-600">Controle interno atualizado pelos recebimentos e lançamentos. Sem conexão bancária.</p></div>
      <button type="button" className={button} disabled={loading || resetting} onClick={refresh}>Atualizar caixa</button>
    </div>
    {loading && <p role="status">Carregando caixa…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!loading && summary && <>
      <div className="rounded-xl bg-black p-5 text-white">
        <p className="text-sm">Saldo do ciclo atual</p><p className="text-3xl font-black break-words">{formatMoney(summary.cycle.balance)}</p>
        <p className="mt-2 text-xs text-white/70">{summary.lastResetAt ? `Desde ${new Date(summary.lastResetAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : 'Desde o início dos registros'}. Correções de lançamentos também atualizam o saldo.</p>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Período do caixa">
        {[['today', 'Hoje'], ['week', 'Esta semana'], ['month', 'Este mês']].map(([id, label]) => <button key={id} type="button" aria-pressed={period === id} onClick={() => setPeriod(id)} className={`${button} ${period === id ? 'bg-black text-white' : ''}`}>{label}</button>)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {selected && [['Entradas', selected.cashIn], ['Saídas', selected.cashOut], ['Resultado do período', selected.balance]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-black/10 p-4"><p className="text-sm text-gray-600">{label}</p><p className="text-xl font-black break-words">{formatMoney(Number(value))}</p></div>)}
      </div>
      <p className="text-xs text-gray-600">Semana de segunda a domingo, horário de Brasília. Inclui recebimentos, estornos, despesas, fornecedores e retiradas. Custos de mercadorias e taxas estimadas não são descontados como pagamentos; registre as saídas efetivas em Entradas e saídas.</p>
      {(summary.undated.cashIn > 0 || summary.undated.cashOut > 0 || summary.reviewCount > 0) && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Conferir registros: entradas sem data {formatMoney(summary.undated.cashIn)}; saídas sem data {formatMoney(summary.undated.cashOut)}; {summary.reviewCount} divergência(s). Valores sem data entram no ciclo, mas ficam fora dos períodos.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={onMovement}>Registrar entrada ou saída</button>
        <button type="button" className={button} onClick={onWithdrawal}>Registrar retirada pessoal</button>
        <button type="button" className={button} onClick={onProLabore}>Registrar pró-labore</button>
        <button type="button" className={button} onClick={onPayables}>Pagar fornecedor</button>
      </div>
      <details><summary className="cursor-pointer text-sm font-bold">Últimas movimentações registradas</summary>
        <div className="mt-3 space-y-2">{summary.recent.length ? summary.recent.map((entry: any) => <div key={entry.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span className="break-words min-w-0">{entry.date.split('-').reverse().join('/')} · {entry.description}</span><strong>{entry.type === 'in' ? '+' : '−'} {formatMoney(entry.amount)}</strong></div>) : <p className="text-sm">Nenhuma movimentação com data registrada.</p>}</div>
      </details>
      {confirmReset ? <div className="rounded-lg border border-amber-400 bg-amber-50 p-4 space-y-3"><p className="text-sm">Zerar o indicador de {formatMoney(summary.cycle.balance)} e iniciar um novo ciclo? O histórico de vendas, despesas e pagamentos será preservado.</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={resetting} onClick={reset}>{resetting ? 'Iniciando…' : 'Confirmar novo ciclo'}</button><button type="button" className={button} disabled={resetting} onClick={() => setConfirmReset(false)}>Cancelar</button></div></div>
        : <button type="button" className={`${button} text-gray-600`} onClick={() => setConfirmReset(true)}>Zerar indicador e iniciar novo ciclo</button>}
    </>}
  </section>;
}
