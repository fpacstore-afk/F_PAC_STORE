import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, Calendar, 
  AlertTriangle, CheckCircle2, Clock, ShieldCheck, 
  ArrowUpRight, ArrowDownRight, RefreshCw, BarChart3,
  CalendarRange, Layers, Info
} from 'lucide-react';
import { authenticatedFetch } from '../../../lib/api';
import { useFinancialPrivacy } from '../../../context/FinancialPrivacyContext';
import { CashForecastSummary } from '../../../types/financial';
import toast from 'react-hot-toast';

export function CashForecastView() {
  const { formatMoney } = useFinancialPrivacy();
  const [summary, setSummary] = useState<CashForecastSummary | null>(null);
  const [payablesCount, setPayablesCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [selectedHorizon, setSelectedHorizon] = useState<'7' | '15' | '30' | '60' | '90'>('30');

  const fetchForecast = async () => {
    try {
      setLoading(true);
      const res = await authenticatedFetch('/api/admin/financial/forecast');
      const data = await res.json();
      if (data.success && data.summary) {
        setSummary(data.summary);
        setPayablesCount(data.payablesCount || 0);
      }
    } catch (err: any) {
      console.error('Erro ao buscar previsão de caixa:', err);
      toast.error('Erro ao calcular projeção de caixa.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, []);

  if (loading) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center text-neutral-400">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-amber-400" />
        <p className="text-sm font-medium">Calculando fluxo e projeções financeiras em tempo real...</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center text-neutral-400">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-amber-400" />
        <p className="text-sm">Não foi possível carregar a projeção de caixa.</p>
        <button
          onClick={fetchForecast}
          className="mt-4 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  const getHorizonMetrics = () => {
    switch (selectedHorizon) {
      case '7':
        return {
          days: '7 Dias',
          receivables: summary.expectedReceivables7Days,
          payables: summary.expectedPayables7Days,
          projected: summary.projectedBalance7Days
        };
      case '15':
        return {
          days: '15 Dias',
          receivables: summary.expectedReceivables15Days,
          payables: summary.expectedPayables15Days,
          projected: summary.projectedBalance15Days
        };
      case '60':
        return {
          days: '60 Dias',
          receivables: summary.expectedReceivables60Days,
          payables: summary.expectedPayables60Days,
          projected: summary.projectedBalance60Days
        };
      case '90':
        return {
          days: '90 Dias',
          receivables: summary.expectedReceivables90Days,
          payables: summary.expectedPayables90Days,
          projected: summary.projectedBalance90Days
        };
      case '30':
      default:
        return {
          days: '30 Dias',
          receivables: summary.expectedReceivables30Days,
          payables: summary.expectedPayables30Days,
          projected: summary.projectedBalance30Days
        };
    }
  };

  const currentHorizon = getHorizonMetrics();
  const isProjectedPositive = currentHorizon.projected >= 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 p-5 rounded-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-amber-400" />
            Previsão & Projeção de Fluxo de Caixa
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Simulador de liquidez futura, cruzando recebíveis de pedidos confirmados vs contas e despesas a pagar.
          </p>
        </div>
        <button
          onClick={fetchForecast}
          className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-2 rounded-lg text-xs font-semibold transition self-start md:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          Recalcular Previsão
        </button>
      </div>

      {/* Critical Alerts Banner (If overdue payables or tight cash) */}
      {summary.overduePayablesCount > 0 && (
        <div className="bg-red-950/40 border border-red-800/60 p-4 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-900/50 text-red-400 rounded-lg shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-red-200">
                Atenção: {summary.overduePayablesCount} conta(s) a pagar estão vencidas!
              </div>
              <div className="text-xs text-red-300/80 mt-0.5">
                Total vencido: {formatMoney(summary.overduePayablesAmount)}. Regularize para evitar juros e bloqueio de crédito.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Core Current Cash & Horizon Spotlight */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Current Realized Cash */}
        <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Saldo em Caixa Realizado (Hoje)
            </span>
            <div className="text-3xl font-black text-white mt-2">
              {formatMoney(summary.currentCashBalance)}
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Entradas líquidas confirmadas menos saídas e liquidações efetuadas.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-neutral-800 text-xs flex justify-between text-neutral-300">
            <span>Vencendo hoje:</span>
            <span className="font-bold text-amber-400">{formatMoney(summary.dueTodayPayablesAmount)}</span>
          </div>
        </div>

        {/* Projected Horizon Card */}
        <div className={`col-span-1 lg:col-span-2 p-5 rounded-xl border ${isProjectedPositive ? 'bg-gradient-to-br from-neutral-900 via-neutral-900 to-emerald-950/30 border-emerald-900/50' : 'bg-gradient-to-br from-neutral-900 via-neutral-900 to-red-950/30 border-red-900/50'} flex flex-col justify-between`}>
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Projeção de Saldo Disponível ({currentHorizon.days})
              </span>

              {/* Horizon Selector */}
              <div className="flex items-center bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs">
                {(['7', '15', '30', '60', '90'] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => setSelectedHorizon(h)}
                    className={`px-2.5 py-1 rounded-md font-semibold transition ${selectedHorizon === h ? 'bg-amber-500 text-black shadow' : 'text-neutral-400 hover:text-white'}`}
                  >
                    {h}d
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-baseline gap-3">
              <div className={`text-4xl font-black ${isProjectedPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatMoney(currentHorizon.projected)}
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${isProjectedPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {isProjectedPositive ? 'Superávit Previsto' : 'Déficit Previsto'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6 pt-4 border-t border-neutral-800/80 text-xs">
            <div>
              <div className="text-neutral-500">Recebíveis Previstos</div>
              <div className="font-bold text-white text-sm mt-0.5 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
                {formatMoney(currentHorizon.receivables)}
              </div>
            </div>

            <div>
              <div className="text-neutral-500">Contas a Pagar no Período</div>
              <div className="font-bold text-white text-sm mt-0.5 flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5 text-amber-400" />
                {formatMoney(currentHorizon.payables)}
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <div className="text-neutral-500">Variação Projetada</div>
              <div className={`font-bold text-sm mt-0.5 ${(currentHorizon.receivables - currentHorizon.payables) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatMoney(currentHorizon.receivables - currentHorizon.payables)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline Forecast Grid */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
        <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
          <CalendarRange className="w-4 h-4 text-amber-400" />
          Quadro Comparativo de Horizontes Financeiros
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { days: '7 Dias', rec: summary.expectedReceivables7Days, pay: summary.expectedPayables7Days, proj: summary.projectedBalance7Days },
            { days: '15 Dias', rec: summary.expectedReceivables15Days, pay: summary.expectedPayables15Days, proj: summary.projectedBalance15Days },
            { days: '30 Dias', rec: summary.expectedReceivables30Days, pay: summary.expectedPayables30Days, proj: summary.projectedBalance30Days },
            { days: '60 Dias', rec: summary.expectedReceivables60Days, pay: summary.expectedPayables60Days, proj: summary.projectedBalance60Days },
            { days: '90 Dias', rec: summary.expectedReceivables90Days, pay: summary.expectedPayables90Days, proj: summary.projectedBalance90Days },
          ].map((item, idx) => (
            <div
              key={idx}
              className="bg-neutral-950 border border-neutral-800/80 p-4 rounded-xl flex flex-col justify-between space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-300">{item.days}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.proj >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                  {item.proj >= 0 ? 'Positivo' : 'Alerta'}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-neutral-400">
                  <span>Receber:</span>
                  <span className="text-emerald-400 font-mono">{formatMoney(item.rec)}</span>
                </div>
                <div className="flex justify-between text-neutral-400">
                  <span>Pagar:</span>
                  <span className="text-amber-400 font-mono">{formatMoney(item.pay)}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-800">
                <div className="text-[11px] text-neutral-500">Saldo Projetado:</div>
                <div className={`font-bold font-mono text-sm ${item.proj >= 0 ? 'text-white' : 'text-red-400'}`}>
                  {formatMoney(item.proj)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cashflow Guidance & Insights */}
      <div className="bg-neutral-900/60 border border-neutral-800 p-5 rounded-xl flex items-start gap-3">
        <Info className="w-5 h-5 text-neutral-400 shrink-0 mt-0.5" />
        <div className="text-xs text-neutral-300 space-y-1">
          <p className="font-semibold text-white">Como esta projeção é calculada?</p>
          <p className="text-neutral-400 leading-relaxed">
            O saldo projetado parte do <strong className="text-white">Saldo em Caixa Realizado</strong>, soma todos os recebíveis de pedidos aguardando compensação/pix e subtrai as <strong className="text-white">Contas a Pagar</strong> abertas de acordo com suas datas de vencimento em cada intervalo.
          </p>
        </div>
      </div>
    </div>
  );
}
