import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, doc, setDoc, deleteDoc, getDocs, writeBatch } from 'firebase/firestore';
import { 
  Users, CheckCircle2, TrendingUp, Clock, Tag, Mail, MessageSquare, Download, Search, 
  Trash2, Sparkles, Filter, ChevronRight, Share2, HelpCircle, ArrowUpDown, Database, AlertCircle 
} from 'lucide-react';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';

interface SvgStyleQuizChartProps {
  data: { date: string; iniciados: number; concluidos: number }[];
}

function SvgStyleQuizChart({ data }: SvgStyleQuizChartProps) {
  const maxVal = Math.max(...data.flatMap(d => [d.iniciados, d.concluidos]), 5);
  const width = 500;
  const height = 200;
  const paddingLeft = 30;
  const paddingRight = 10;
  const paddingTop = 20;
  const paddingBottom = 25;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const pointsIniciados = data.map((d, index) => {
    const x = paddingLeft + (index / Math.max(1, data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.iniciados / maxVal) * chartHeight;
    return { x, y, label: d.date, val: d.iniciados };
  });

  const pointsConcluidos = data.map((d, index) => {
    const x = paddingLeft + (index / Math.max(1, data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.concluidos / maxVal) * chartHeight;
    return { x, y, label: d.date, val: d.concluidos };
  });

  const pathIniciados = pointsIniciados.length > 0 
    ? `M ${pointsIniciados[0].x} ${pointsIniciados[0].y} ` + pointsIniciados.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : '';

  const pathConcluidos = pointsConcluidos.length > 0 
    ? `M ${pointsConcluidos[0].x} ${pointsConcluidos[0].y} ` + pointsConcluidos.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : '';

  const areaIniciados = pointsIniciados.length > 0
    ? `${pathIniciados} L ${pointsIniciados[pointsIniciados.length - 1].x} ${paddingTop + chartHeight} L ${pointsIniciados[0].x} ${paddingTop + chartHeight} Z`
    : '';

  const areaConcluidos = pointsConcluidos.length > 0
    ? `${pathConcluidos} L ${pointsConcluidos[pointsConcluidos.length - 1].x} ${paddingTop + chartHeight} L ${pointsConcluidos[0].x} ${paddingTop + chartHeight} Z`
    : '';

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative w-full h-full flex flex-col justify-between">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="colorIniciados" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.15}/>
            <stop offset="95%" stopColor="#9ca3af" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="colorConcluidos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#eab308" stopOpacity={0.25}/>
            <stop offset="95%" stopColor="#eab308" stopOpacity={0}/>
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {gridLines.map((ratio, idx) => {
          const y = paddingTop + ratio * chartHeight;
          const val = Math.round(maxVal * (1 - ratio));
          return (
            <g key={idx}>
              <line 
                x1={paddingLeft} 
                y1={y} 
                x2={width - paddingRight} 
                y2={y} 
                stroke="rgba(0,0,0,0.05)" 
                strokeDasharray="3 3"
              />
              <text 
                x={paddingLeft - 8} 
                y={y + 3} 
                fill="rgba(0,0,0,0.4)" 
                fontSize={8} 
                textAnchor="end"
                className="font-mono font-bold"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Areas */}
        {areaIniciados && (
          <path d={areaIniciados} fill="url(#colorIniciados)" />
        )}
        {areaConcluidos && (
          <path d={areaConcluidos} fill="url(#colorConcluidos)" />
        )}

        {/* Lines */}
        {pathIniciados && (
          <path 
            d={pathIniciados} 
            fill="none" 
            stroke="#9ca3af" 
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {pathConcluidos && (
          <path 
            d={pathConcluidos} 
            fill="none" 
            stroke="#ca8a04" 
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Labels for Dates */}
        {data.map((d, index) => {
          const x = paddingLeft + (index / Math.max(1, data.length - 1)) * chartWidth;
          return (
            <text
              key={index}
              x={x}
              y={height - 2}
              fill="rgba(0,0,0,0.5)"
              fontSize={8}
              textAnchor="middle"
              className="font-black"
            >
              {d.date}
            </text>
          );
        })}

        {/* Dots with interactive titles or hover tooltips */}
        {pointsIniciados.map((p, idx) => (
          <g key={`init-${idx}`} className="group cursor-pointer">
            <circle 
              cx={p.x} 
              cy={p.y} 
              r={3} 
              fill="#9ca3af" 
              className="transition-all duration-200 group-hover:r-4 group-hover:fill-black"
            />
            <title>{`Iniciados em ${p.label}: ${p.val}`}</title>
          </g>
        ))}

        {pointsConcluidos.map((p, idx) => (
          <g key={`conc-${idx}`} className="group cursor-pointer">
            <circle 
              cx={p.x} 
              cy={p.y} 
              r={3.5} 
              fill="#ca8a04" 
              className="transition-all duration-200 group-hover:r-4.5 group-hover:fill-[#eab308]"
            />
            <title>{`Concluídos em ${p.label}: ${p.val}`}</title>
          </g>
        ))}
      </svg>
      
      {/* Legend */}
      <div className="flex justify-center gap-6 mt-2 text-[10px] font-black uppercase tracking-wider text-black/60">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#9ca3af] inline-block" />
          <span>Iniciados</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ca8a04] inline-block" />
          <span>Concluídos</span>
        </div>
      </div>
    </div>
  );
}

interface QuizSession {
  id: string;
  status: 'started' | 'completed';
  createdAt: string;
  updatedAt: string;
  answers: Record<string, string>;
  lead?: {
    name: string;
    email: string;
    whatsapp: string;
    optIn: boolean;
  };
  generatedProfile?: 'lobo' | 'street_king' | 'black_force' | 'alpha' | 'minimal' | 'elite';
  recommendedCollection?: 'force' | 'mark' | 'prime';
  durationSeconds?: number;
  scores?: {
    force: number;
    mark: number;
    prime: number;
  };
}

const PROFILE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  lobo: { label: 'Lobo', emoji: '🐺', color: '#64748b' },
  street_king: { label: 'Street King', emoji: '👑', color: '#f59e0b' },
  black_force: { label: 'Black Force', emoji: '⚫', color: '#111827' },
  alpha: { label: 'Alpha', emoji: '🦅', color: '#dc2626' },
  minimal: { label: 'Minimal', emoji: '◼️', color: '#4b5563' },
  elite: { label: 'Elite', emoji: '⚜️', color: '#d97706' }
};

export function AdminCustomerIdentity() {
  const [sessions, setSessions] = useState<QuizSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('7d');
  const [searchQuery, setSearchQuery] = useState('');
  const [profileFilter, setProfileFilter] = useState<string>('all');
  const [optInFilter, setOptInFilter] = useState<'all' | 'yes' | 'no'>('all');

  // Real-time listener for quiz sessions
  useEffect(() => {
    const q = query(collection(db, 'identity_quiz_sessions'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: QuizSession[] = [];
      snapshot.forEach((doc) => {
        data.push(doc.data() as QuizSession);
      });
      // Sort chronologically (newest first)
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSessions(data);
      setLoading(false);
    }, (error) => {
      console.error("Error reading sessions:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filtered Sessions for rendering
  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
      // Time constraint
      if (timeRange !== 'all') {
        const days = timeRange === '7d' ? 7 : 30;
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        if (new Date(session.createdAt).getTime() < cutoff) return false;
      }

      // Search (Name, email, whatsapp)
      if (searchQuery) {
        const queryLower = searchQuery.toLowerCase();
        const matchesName = session.lead?.name?.toLowerCase().includes(queryLower);
        const matchesEmail = session.lead?.email?.toLowerCase().includes(queryLower);
        const matchesPhone = session.lead?.whatsapp?.includes(queryLower);
        if (!matchesName && !matchesEmail && !matchesPhone) return false;
      }

      // Profile filter
      if (profileFilter !== 'all' && session.generatedProfile !== profileFilter) {
        return false;
      }

      // OptIn filter
      if (optInFilter !== 'all') {
        const wantsOptIn = optInFilter === 'yes';
        if (session.lead?.optIn !== wantsOptIn) return false;
      }

      return true;
    });
  }, [sessions, timeRange, searchQuery, profileFilter, optInFilter]);

  // Statistics Computations
  const stats = useMemo(() => {
    const totalStarted = filteredSessions.length;
    const completed = filteredSessions.filter(s => s.status === 'completed');
    const totalCompleted = completed.length;
    const completionRate = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0;

    // Time calculations
    const durations = completed.filter(s => s.durationSeconds && s.durationSeconds > 0).map(s => s.durationSeconds!);
    const avgDuration = durations.length > 0 
      ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length) 
      : 0;

    // Leads count
    const totalLeads = completed.filter(s => s.lead?.name).length;

    // Profile distributions
    const profilesCount: Record<string, number> = { lobo: 0, street_king: 0, black_force: 0, alpha: 0, minimal: 0, elite: 0 };
    completed.forEach(s => {
      if (s.generatedProfile && profilesCount[s.generatedProfile] !== undefined) {
        profilesCount[s.generatedProfile]++;
      }
    });

    // Collection distributions
    const collectionsCount = { force: 0, mark: 0, prime: 0 };
    completed.forEach(s => {
      if (s.recommendedCollection && collectionsCount[s.recommendedCollection] !== undefined) {
        collectionsCount[s.recommendedCollection]++;
      }
    });

    return {
      totalStarted,
      totalCompleted,
      completionRate,
      avgDuration,
      totalLeads,
      profilesCount,
      collectionsCount
    };
  }, [filteredSessions]);

  // Chart data: Chronology
  const chartData = useMemo(() => {
    const dayMap: Record<string, { date: string; iniciados: number; concluidos: number }> = {};
    
    // Fill last 7 days with zeros as base
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      dayMap[dateStr] = { date: dateStr, iniciados: 0, concluidos: 0 };
    }

    filteredSessions.forEach(s => {
      const dateStr = new Date(s.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      if (dayMap[dateStr]) {
        dayMap[dateStr].iniciados += 1;
        if (s.status === 'completed') {
          dayMap[dateStr].concluidos += 1;
        }
      } else {
        dayMap[dateStr] = {
          date: dateStr,
          iniciados: 1,
          concluidos: s.status === 'completed' ? 1 : 0
        };
      }
    });

    return Object.values(dayMap).slice(-7); // Keep chronologically aligned 7 days
  }, [filteredSessions]);

  // Seeding engine helper
  const seedSampleSessions = async () => {
    try {
      const toastId = toast.loading('Gerando sessões de teste...');
      const profilesKeys = ['lobo', 'street_king', 'black_force', 'alpha', 'minimal', 'elite'];
      const collectionsKeys = ['force', 'mark', 'prime'];
      const namesList = [
        'Arthur Ramos', 'Juliana Mendes', 'Rodrigo Santos', 'Fernanda Lima', 'Mateus Costa', 
        'Beatriz Almeida', 'Lucas Ribeiro', 'Carla Souza', 'Vinicius Guedes', 'Marina Ferreira'
      ];

      for (let i = 0; i < 18; i++) {
        const randId = 'seed_' + Math.random().toString(36).substring(2, 11);
        const createdAt = new Date();
        createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 6)); // last 6 days

        const randProfile = profilesKeys[Math.floor(Math.random() * profilesKeys.length)];
        const randCollection = collectionsKeys[Math.floor(Math.random() * collectionsKeys.length)];
        const completed = Math.random() > 0.15; // 85% completion rate
        const hasLead = completed && Math.random() > 0.3; // 70% lead generation rate

        const sessDoc: QuizSession = {
          id: randId,
          status: completed ? 'completed' : 'started',
          createdAt: createdAt.toISOString(),
          updatedAt: createdAt.toISOString(),
          answers: {
            '1': 'streetwear',
            '2': 'roles',
            '3': 'preto',
            '4': 'estampas_grandes',
            '5': 'qualidade',
            '6': 'costas',
            '7': 'oversized',
            '8': 'nao_e_so_roupa_e_identidade'
          }
        };

        if (completed) {
          sessDoc.generatedProfile = randProfile as any;
          sessDoc.recommendedCollection = randCollection as any;
          sessDoc.durationSeconds = 15 + Math.floor(Math.random() * 45);
          sessDoc.scores = {
            force: 30 + Math.floor(Math.random() * 60),
            mark: 30 + Math.floor(Math.random() * 60),
            prime: 30 + Math.floor(Math.random() * 60)
          };
        }

        if (hasLead) {
          const randName = namesList[Math.floor(Math.random() * namesList.length)];
          sessDoc.lead = {
            name: randName,
            email: `${randName.toLowerCase().replace(' ', '.')}@exemplo.com`,
            whatsapp: `(47) 99${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`,
            optIn: Math.random() > 0.1
          };
        }

        await setDoc(doc(db, 'identity_quiz_sessions', randId), sessDoc);
      }

      toast.success('18 Sessões de teste geradas com sucesso!', { id: toastId });
    } catch (err) {
      toast.error('Erro ao gerar dados de teste.');
      console.error(err);
    }
  };

  // Erase all seed data helper
  const purgeSeeds = async () => {
    if (!window.confirm('Tem certeza de que deseja apagar os dados gerados pelo seed?')) return;
    const toastId = toast.loading('Expurgando dados de teste...');
    try {
      const q = query(collection(db, 'identity_quiz_sessions'));
      const querySnapshot = await getDocs(q);
      let count = 0;
      querySnapshot.forEach(async (document) => {
        if (document.id.startsWith('seed_')) {
          await deleteDoc(doc(db, 'identity_quiz_sessions', document.id));
          count++;
        }
      });
      toast.success(`Expurgo concluído! ${count} registros de teste removidos.`, { id: toastId });
    } catch (err) {
      toast.error('Erro ao expurgar dados.');
      console.error(err);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const csvRows = [
      ['ID', 'Data', 'Status', 'Nome', 'Email', 'WhatsApp', 'Opt-In Novidades', 'Perfil Gerado', 'Coleção Recomendada', 'Tempo (s)'].join(';')
    ];

    sessions.forEach(s => {
      const row = [
        s.id,
        new Date(s.createdAt).toLocaleDateString('pt-BR'),
        s.status === 'completed' ? 'CONCLUÍDO' : 'INICIADO',
        s.lead?.name || '-',
        s.lead?.email || '-',
        s.lead?.whatsapp || '-',
        s.lead?.optIn ? 'SIM' : 'NÃO',
        s.generatedProfile ? PROFILE_LABELS[s.generatedProfile]?.label : '-',
        s.recommendedCollection?.toUpperCase() || '-',
        s.durationSeconds || '-'
      ];
      csvRows.push(row.join(';'));
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csvRows.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `leads_identidade_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Relatório de leads exportado com sucesso!');
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-4">
        <div className="w-10 h-10 border-4 border-[#eab308] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs uppercase tracking-widest font-black text-gray-400">Carregando painel de identidade...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-black" id="admin-customer-identity-dashboard">
      
      {/* 1. HERO HEADER - ESTAMPAS STANDARD PATTERN */}
      <div className="bg-black text-white px-4 md:px-8 py-4 md:py-6 border-b-2 border-[#eab308] relative overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#eab308] text-black px-2 py-0.5 text-[8px] font-black uppercase tracking-widest font-mono">
                SGC v2.4
              </span>
              <span className="text-gray-400 text-[9px] font-bold uppercase tracking-[0.2em] font-sans">
                • CENTRAL DE IDENTIDADE DE CLIENTES
              </span>
            </div>
            
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight italic font-sans">
              IDENTIDADE DOS <span className="text-[#eab308]">CLIENTES</span>
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <button 
              onClick={seedSampleSessions}
              className="bg-black text-[#eab308] border border-[#eab308] hover:bg-[#eab308] hover:text-black transition-all px-4 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Database size={13} /> Gerar Seed
            </button>
            <button 
              onClick={handleExportCSV}
              className="bg-[#eab308] text-black hover:bg-white transition-all px-4 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={13} /> Exportar CSV
            </button>
          </div>
        </div>
      </div>

      {/* 2. INDICATOR CARDS (KPIs) - ESTAMPAS STANDARD PATTERN */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 -translate-y-3 relative z-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 block font-sans">Sessões Iniciadas</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block">{stats.totalStarted}</span>
            </div>
            <span className="text-[8px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Sessões</span>
          </div>

          <div className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 block font-sans">Taxa Conclusão</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-emerald-700">{stats.completionRate}%</span>
            </div>
            <span className="text-[8px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Engajamento</span>
          </div>

          <div className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-amber-500 block font-sans">Tempo Médio</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-amber-600">{stats.avgDuration}s</span>
            </div>
            <span className="text-[8px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase font-mono">Segundos</span>
          </div>

          <div className="bg-white border border-black/10 p-3 shadow-sm hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-blue-600 block font-sans">Leads Capturados</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-blue-700">{stats.totalLeads}</span>
            </div>
            <span className="text-[8px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-sm font-black font-sans uppercase">Leads</span>
          </div>
        </div>
      </div>

      {/* Charts & Histograms */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Time Series Area Chart */}
        <div className="bg-white border p-6 lg:col-span-8 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-black uppercase tracking-widest">Fluxo Chronológico de Sessões (7 Dias)</h4>
            <div className="flex gap-1.5 border border-black/5 p-1 bg-black/[0.01]">
              <button 
                onClick={() => setTimeRange('7d')}
                className={cn("px-3 py-1 text-[8px] font-black uppercase tracking-widest", timeRange === '7d' ? "bg-black text-white" : "text-gray-400 hover:text-black")}
              >
                7 Dias
              </button>
              <button 
                onClick={() => setTimeRange('30d')}
                className={cn("px-3 py-1 text-[8px] font-black uppercase tracking-widest", timeRange === '30d' ? "bg-black text-white" : "text-gray-400 hover:text-black")}
              >
                30 Dias
              </button>
              <button 
                onClick={() => setTimeRange('all')}
                className={cn("px-3 py-1 text-[8px] font-black uppercase tracking-widest", timeRange === 'all' ? "bg-black text-white" : "text-gray-400 hover:text-black")}
              >
                Tudo
              </button>
            </div>
          </div>

          <div className="h-64 w-full">
            <SvgStyleQuizChart data={chartData} />
          </div>
        </div>

        {/* Collection recommendation preferences */}
        <div className="bg-white border p-6 lg:col-span-4 flex flex-col justify-between">
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-widest">Sintonias de Coleções</h4>
            <p className="text-[10px] text-gray-400 uppercase font-bold">Distribuição de recomendações das linhas da loja</p>
          </div>

          <div className="space-y-4 py-4">
            {Object.entries(stats.collectionsCount).map(([coll, count]) => {
              const total = Math.max(1, stats.collectionsCount.force + stats.collectionsCount.mark + stats.collectionsCount.prime);
              const pct = Math.round((count / total) * 100);
              return (
                <div key={coll} className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-black uppercase">
                    <span>Linha {coll.toUpperCase()}</span>
                    <span>{count} recomendados ({pct}%)</span>
                  </div>
                  <div className="w-full h-2.5 bg-black/[0.04]">
                    <div 
                      className="h-full bg-[#ca8a04] transition-all duration-300" 
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-black/5 pt-4 text-[9px] text-gray-400 font-black uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles size={11} className="text-[#eab308]" />
            Coleções ideais sincronizadas por score
          </div>
        </div>
      </div>

      {/* Profile distribution histogram */}
      <div className="bg-white border p-6 space-y-6">
        <div>
          <h4 className="text-xs font-black uppercase tracking-widest mb-1">Distribuição de Perfis de Identidade</h4>
          <p className="text-[10px] text-gray-400 uppercase font-bold">Controle volumétrico de cada arquétipo streetwear mapeado</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4">
          {Object.entries(PROFILE_LABELS).map(([profileId, config]) => {
            const count = stats.profilesCount[profileId] || 0;
            const pct = stats.totalCompleted > 0 ? Math.round((count / stats.totalCompleted) * 100) : 0;
            return (
              <div key={profileId} className="border border-black/5 p-4 flex flex-col justify-between h-[130px] relative overflow-hidden group hover:border-[#eab308]/40 transition-colors">
                <span className="text-2xl select-none">{config.emoji}</span>
                <div>
                  <h5 className="text-[11px] font-black uppercase tracking-wider text-gray-800">{config.label}</h5>
                  <div className="flex justify-between items-baseline mt-1.5">
                    <span className="text-2xl font-black italic leading-none">{count}</span>
                    <span className="text-[10px] font-mono font-bold text-gray-400">{pct}%</span>
                  </div>
                </div>
                {/* Horizontal slide bar in bottom */}
                <div className="absolute bottom-0 left-0 h-1 bg-[#eab308]" style={{ width: `${pct}%` }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Captured Leads Table list */}
      <div className="bg-white border p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h4 className="text-xs font-black uppercase tracking-widest">Leads Capturados pela Experiência</h4>
            <p className="text-[10px] text-gray-400 uppercase font-bold mt-0.5">Disparar atendimento, promoções e prospecção ativa de novos perfis</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                <Search size={14} />
              </span>
              <input 
                type="text"
                placeholder="Buscar por nome, email ou fone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-black/10 text-[10px] focus:outline-none focus:border-[#eab308]"
              />
            </div>

            {/* Profile filter dropdown */}
            <select
              value={profileFilter}
              onChange={(e) => setProfileFilter(e.target.value)}
              className="px-3 py-2 border border-black/10 text-[10px] uppercase font-bold focus:outline-none focus:border-[#eab308]"
            >
              <option value="all">Filtro: Todos Perfis</option>
              {Object.entries(PROFILE_LABELS).map(([id, p]) => (
                <option key={id} value={id}>{p.label.toUpperCase()}</option>
              ))}
            </select>

            {/* OptIn filter dropdown */}
            <select
              value={optInFilter}
              onChange={(e) => setOptInFilter(e.target.value as 'all' | 'yes' | 'no')}
              className="px-3 py-2 border border-black/10 text-[10px] uppercase font-bold focus:outline-none focus:border-[#eab308]"
            >
              <option value="all">Filtro: Todos Opt-In</option>
              <option value="yes">Apenas Opt-In Sim</option>
              <option value="no">Apenas Opt-In Não</option>
            </select>
          </div>
        </div>

        {/* Real table layout */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-black/10 text-[9px] font-black uppercase tracking-widest text-gray-400 bg-black/[0.01]">
                <th className="py-3 px-4">Data</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">WhatsApp</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Perfil</th>
                <th className="py-3 px-4">Coleção</th>
                <th className="py-3 px-4">Receber Novidades</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 text-[10px]">
              {filteredSessions.filter(s => s.lead?.name).length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center uppercase tracking-widest font-black text-gray-300">
                    Nenhum lead encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredSessions.filter(s => s.lead?.name).map((session) => {
                  const labelObj = session.generatedProfile ? PROFILE_LABELS[session.generatedProfile] : null;
                  const formattedPhone = session.lead?.whatsapp?.replace(/\D/g, '') || '';
                  const whatsappLink = `https://api.whatsapp.com/send?phone=55${formattedPhone}&text=Olá%20${encodeURIComponent(session.lead?.name || '')}!%20Vimos%20seu%20resultado%20no%20nosso%20teste%20de%20identidade%20F%20PAC%20STORE%20e%20liberamos%20seu%20desconto.`;

                  return (
                    <tr key={session.id} className="hover:bg-black/[0.01] transition-colors font-semibold">
                      <td className="py-3 px-4 text-gray-500">
                        {new Date(session.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 uppercase font-bold text-gray-900">
                        {session.lead?.name}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {session.lead?.whatsapp}
                      </td>
                      <td className="py-3 px-4 text-gray-600 font-mono">
                        {session.lead?.email}
                      </td>
                      <td className="py-3 px-4">
                        {labelObj ? (
                          <span className="inline-flex items-center gap-1">
                            <span>{labelObj.emoji}</span>
                            <span>{labelObj.label.toUpperCase()}</span>
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        {session.recommendedCollection ? (
                          <span className="bg-black/5 px-2 py-0.5 font-bold uppercase tracking-widest">
                            {session.recommendedCollection}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="py-3 px-4">
                        {session.lead?.optIn ? (
                          <span className="text-green-600 font-bold">✔ SIM</span>
                        ) : (
                          <span className="text-red-500 font-bold">✖ NÃO</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <a 
                          href={whatsappLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 bg-[#25D366] text-white hover:bg-black hover:text-[#25D366] transition-all px-3 py-1.5 font-black uppercase tracking-widest text-[8px]"
                        >
                          <MessageSquare size={10} />
                          Falar no Zap
                        </a>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
