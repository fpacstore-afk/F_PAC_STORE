import React, { useState, useEffect } from 'react';
import { 
  Activity, CheckCircle, AlertTriangle, MessageSquare, 
  RefreshCw, Smartphone, Mail, Sliders, Calendar, Play, Tag, Edit, Save, Trash2, Percent, DollarSign, Clock, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
import { getApiUrl } from '../lib/api';
import { db } from '../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { products as staticProducts } from '../data/products';
import { WeeklyPromotion } from '../types/promotions';

interface AutomationMetric {
  totalAbandoned: number;
  totalRecovered: number;
  recoveryRate: number;
  recoveredValue: number;
  whatsappSentCount: number;
  whatsappStatus: 'CONNECTED' | 'DISCONNECTED';
}

interface LeadItem {
  id: string;
  customer_name: string;
  email: string;
  phone: string;
  cep: string;
  total: number;
  payment_status: string;
  recovery_status: 'pending' | 'abandoned' | 'recovered' | 'failed';
  recovery_attempts: number;
  last_interaction: string;
  created_at?: any;
  cart_items?: any[];
  address?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

interface LogEntry {
  id: string;
  event: string;
  type: 'info' | 'warn' | 'error' | 'success';
  message: string;
  target: string;
  timestamp: string;
}

export function AdminAutomations() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ metrics: AutomationMetric; checkouts: LeadItem[]; logs: LogEntry[] } | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<'HOJE' | '7_DIAS' | '30_DIAS' | 'TOTAL'>('TOTAL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [cronRunning, setCronRunning] = useState(false);

  const fetchData = async () => {
    try {
      const response = await fetch(getApiUrl('/api/automation/dashboard'));
      if (!response.ok) throw new Error("Failed to load automation dashboard");
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar automações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll data every 45s for live terminal logs experience
    const interval = setInterval(fetchData, 45000);
    return () => clearInterval(interval);
  }, []);

  const handleManualResend = async (leadId: string) => {
    setActionLoadingId(leadId);
    try {
      const response = await fetch(getApiUrl('/api/automation/resend'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: leadId })
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || "Failed to trigger resend");
      toast.success(resData.message || "Automação disparada!");
      fetchData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleForceCronCheck = async () => {
    setCronRunning(true);
    try {
      const response = await fetch(getApiUrl('/api/checkout/trigger-cron'), {
        method: 'POST'
      });
      const resData = await response.json();
      if (!response.ok) throw new Error();
      toast.success(`Check finalizado! Abandonos taggeados: ${resData.results?.marked || 0}`);
      fetchData();
    } catch (err) {
      toast.error("Falha ao rodar verificação forçada.");
    } finally {
      setCronRunning(false);
    }
  };

  // Dynamic filter logic
  const filteredLeads = React.useMemo(() => {
    if (!data?.checkouts) return [];
    
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    return data.checkouts.filter((lead) => {
      let leadTime = now;
      if (lead.last_interaction) {
        leadTime = new Date(lead.last_interaction).getTime();
      }

      const diffMs = now - leadTime;

      switch (filterPeriod) {
        case 'HOJE':
          return diffMs <= oneDay;
        case '7_DIAS':
          return diffMs <= 7 * oneDay;
        case '30_DIAS':
          return diffMs <= 30 * oneDay;
        case 'TOTAL':
        default:
          return true;
      }
    });
  }, [data?.checkouts, filterPeriod]);

  // Calculate dynamic metrics based on filtered leads list (to make filters fully responsive!)
  const filteredMetrics = React.useMemo(() => {
    if (!data) return null;
    
    let totalAbandoned = 0;
    let totalRecovered = 0;
    let recoveredValue = 0;

    filteredLeads.forEach(l => {
      if (l.recovery_status === 'recovered') {
        totalRecovered++;
        recoveredValue += l.total;
      } else {
        totalAbandoned++;
      }
    });

    const totalLeadsCount = totalAbandoned + totalRecovered;
    const recoveryRate = totalLeadsCount > 0 ? (totalRecovered / totalLeadsCount) * 100 : 0;

    return {
      totalAbandoned,
      totalRecovered,
      recoveredValue,
      recoveryRate: Number(recoveryRate.toFixed(1))
    };
  }, [filteredLeads, data]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 text-gray-500 font-bold uppercase tracking-widest text-[10px]">
        <RefreshCw className="animate-spin text-[#eab308] mb-4" size={24} />
         Lendo Central de Automação...
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {/* Upper Action Bar */}
      <div className="bg-black text-white p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5">
        <div>
          <h2 className="text-xl font-black uppercase tracking-widest italic">Aba de Automações & CRM</h2>
          <p className="text-[9px] text-[#eab308] font-black uppercase tracking-widest mt-1">
             Recuperação automática de sacolas e alertas via e-mail & WhatsApp
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <button 
            disabled={cronRunning}
            onClick={handleForceCronCheck}
            className="bg-white/10 text-white px-5 py-3 text-[9px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all flex items-center gap-2"
          >
            <Activity className={cn("shrink-0", cronRunning && "animate-pulse")} size={12} />
            {cronRunning ? "Analisando..." : "Forçar Varredura (1h de Inação)"}
          </button>
          
          <button 
            onClick={fetchData}
            className="p-3 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Local Filter Pills */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-gray-50 p-4 border border-black/5">
        <div className="flex items-center gap-2">
          <Sliders size={12} className="text-gray-400" />
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Filtrar por Período:</span>
        </div>
        <div className="flex gap-1">
          {(['HOJE', '7_DIAS', '30_DIAS', 'TOTAL'] as const).map((period) => (
            <button
              key={period}
              onClick={() => setFilterPeriod(period)}
              className={cn(
                "px-4 py-2 text-[9px] font-black uppercase tracking-widest transition-all",
                filterPeriod === period 
                  ? "bg-black text-[#eab308]" 
                  : "bg-white text-gray-400 hover:text-black border border-black/5"
              )}
            >
              {period.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Metric 1 */}
        <div className="bg-white border p-6 flex flex-col justify-between min-h-[140px] relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Carrinhos Abandonados</span>
            <AlertTriangle className="text-red-500 shrink-0" size={16} />
          </div>
          <div>
            <h3 className="text-3xl font-black tracking-tight">{filteredMetrics?.totalAbandoned || 0}</h3>
            <p className="text-[8px] text-gray-400 uppercase tracking-widest mt-1">Perda Potencial Estimada</p>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white border p-6 flex flex-col justify-between min-h-[140px] relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Carrinhos Recuperados</span>
            <CheckCircle className="text-green-500 shrink-0" size={16} />
          </div>
          <div>
            <h3 className="text-3xl font-black tracking-tight text-green-600">{filteredMetrics?.totalRecovered || 0}</h3>
            <p className="text-[8px] text-green-500/70 uppercase tracking-widest font-black mt-1">
              R$ {filteredMetrics?.recoveredValue.toFixed(2) || '0.00'} Recuperados
            </p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white border p-6 flex flex-col justify-between min-h-[140px] relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Taxa de Conversão</span>
            <Activity className="text-blue-500 shrink-0" size={16} />
          </div>
          <div>
            <h3 className="text-3xl font-black tracking-tight">{filteredMetrics?.recoveryRate || 0}%</h3>
            <p className="text-[8px] text-gray-400 uppercase tracking-widest mt-1">Sucesso de Campanhas</p>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white border p-6 flex flex-col justify-between min-h-[140px] relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">WhatsApp Gateway</span>
            <Smartphone className={cn("shrink-0", data?.metrics.whatsappStatus === 'CONNECTED' ? "text-green-500" : "text-gray-400")} size={16} />
          </div>
          <div>
            <h3 className="text-xl font-bold tracking-tight uppercase">
              {data?.metrics.whatsappStatus === 'CONNECTED' ? '● OPERACIONAL' : '● SIMULADOR'}
            </h3>
            <p className="text-[8px] text-gray-400 uppercase tracking-widest mt-1">
               {data?.metrics.whatsappStatus === 'CONNECTED' ? 'Evolution API Online' : 'No Keys; Logs Disparos'}
            </p>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white border">
        <div className="p-6 border-b border-black/[0.06] flex items-center justify-between bg-gray-50/50">
          <h3 className="text-xs font-black uppercase tracking-widest">Controle de Leads de Sacola</h3>
          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">
            Exibindo {filteredLeads.length} leads
          </span>
        </div>
        
        {filteredLeads.length === 0 ? (
          <div className="p-16 text-center text-[10px] font-bold uppercase tracking-widest text-gray-400">
             Nenhum lead de abandono registrado para o período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-black/[0.06] bg-gray-50 text-gray-400 text-[9px] uppercase tracking-widest font-black">
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Contato / CEP</th>
                  <th className="p-4">Itens Sacola</th>
                  <th className="p-4">Valor Total</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Interações</th>
                  <th className="p-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => {
                  const statusColors = {
                    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
                    abandoned: 'bg-red-50 text-red-700 border-red-200',
                    recovered: 'bg-green-50 text-green-700 border-green-200',
                    failed: 'bg-gray-100 text-gray-600 border-gray-300'
                  };

                  return (
                    <tr key={lead.id} className="border-b border-black/[0.03] hover:bg-black/[0.01] transition-colors">
                      {/* Name / Date */}
                      <td className="p-4">
                        <div className="font-extrabold uppercase text-xs text-black">{lead.customer_name}</div>
                        <div className="text-[9px] text-gray-400 font-bold mt-0.5">
                          Iniciou: {lead.created_at ? (lead.created_at.toDate ? lead.created_at.toDate().toLocaleString('pt-BR') : new Date(lead.created_at).toLocaleString('pt-BR')) : new Date(lead.last_interaction).toLocaleString('pt-BR')}
                        </div>
                      </td>
                      
                      {/* Contact Info */}
                      <td className="p-4">
                        <div className="font-medium text-xs flex items-center gap-1.5"><Mail size={11} className="text-gray-400" /> {lead.email || 'Não informado'}</div>
                        <div className="font-medium text-xs flex items-center gap-1.5 mt-1"><Smartphone size={11} className="text-gray-400" /> {lead.phone || 'Não informado'}</div>
                        <div className="text-[9px] font-black text-gray-400 uppercase tracking-wider mt-1">CEP: {lead.cep || 'Pend'}</div>
                      </td>

                      {/* Items */}
                      <td className="p-4 max-w-[200px]">
                        <div className="space-y-1">
                          {lead.cart_items?.map((item: any, i: number) => (
                            <div key={i} className="text-[10px] text-gray-600 truncate font-bold uppercase">
                              {item.quantity}x {item.name} {item.size ? `(${item.size})` : ''}
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Total */}
                      <td className="p-4 font-black text-black text-xs">
                        R$ {Number(lead.total || 0).toFixed(2)}
                      </td>

                      {/* Status */}
                      <td className="p-4">
                        <span className={cn(
                          "px-2 py-1 text-[8px] font-black uppercase tracking-widest border shrink-0",
                          statusColors[lead.recovery_status] || 'bg-gray-150 text-gray-500'
                        )}>
                          {lead.recovery_status === 'pending' ? 'Digitando' : lead.recovery_status}
                        </span>
                      </td>

                      {/* Interaction Counts */}
                      <td className="p-4">
                        <div className="text-[10px] font-bold text-gray-600 uppercase">
                          Tentativas: <span className="font-black text-black">{lead.recovery_attempts || 0}</span>
                        </div>
                        <div className="text-[8px] text-gray-400 uppercase font-bold mt-0.5">
                          Int: {new Date(lead.last_interaction).toLocaleTimeString('pt-BR')}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="p-4 text-right">
                        <button
                          disabled={actionLoadingId === lead.id || lead.recovery_status === 'recovered'}
                          onClick={() => handleManualResend(lead.id)}
                          className={cn(
                            "px-3 py-2 text-[8px] font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-all border border-black text-black shrink-0 disabled:border-gray-200 disabled:text-gray-300 disabled:hover:bg-transparent",
                            lead.recovery_status === 'recovered' && "border-green-200 text-green-300 pointer-events-none"
                          )}
                        >
                          {actionLoadingId === lead.id ? 'Disparando...' : 'Reenviar Automação'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Terminal Realtime Logs View */}
      <div className="bg-black text-[#5dd39e] p-6 font-mono border border-black rounded-sm shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#5dd39e] animate-pulse"></span>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5dd39e]">Terminal de Eventos do Robô (Live)</span>
          </div>
          <span className="text-[8px] uppercase tracking-widest text-gray-500 font-bold">Histórico Recente</span>
        </div>

        <div className="max-h-[220px] overflow-y-auto space-y-2 text-xs scrollbar-none scroll-smooth">
          {data?.logs.length === 0 ? (
            <div className="text-gray-500 text-[10px] text-center py-6">
              [AGUARDANDO EVENTOS AUTOMÁTICOS...]
            </div>
          ) : (
            data?.logs.map((log) => {
              const dateStr = new Date(log.timestamp).toLocaleTimeString('pt-BR');
              const logColors = {
                success: 'text-green-400',
                warn: 'text-yellow-400',
                error: 'text-red-400',
                info: 'text-blue-300'
              };

              return (
                <div key={log.id} className="flex gap-2 leading-relaxed">
                  <span className="text-gray-500 shrink-0">[{dateStr}]</span>
                  <span className={cn("font-bold uppercase tracking-wider shrink-0", logColors[log.type])}>
                    [{log.event}]
                  </span>
                  <span className="text-white">{log.message}</span>
                  <span className="text-gray-500 truncate ml-auto">({log.target})</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
