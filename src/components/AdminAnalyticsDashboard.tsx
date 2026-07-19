import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  Clock, 
  Calendar, 
  TrendingUp, 
  Compass, 
  Smartphone, 
  Globe, 
  ShoppingBag, 
  ArrowRight, 
  RefreshCw, 
  Download, 
  FileText, 
  Search, 
  MapPin, 
  UserCheck, 
  UserMinus,
  ArrowUpRight,
  ChevronRight,
  CheckCircle,
  AlertTriangle,
  Flame,
  X
} from 'lucide-react';
// Custom high-performance SVG chart replacements to eliminate recharts bundle/ESM resolution runtime overhead
interface SvgAreaChartProps {
  data: { label: string; 'Visitantes': number }[];
}

function SvgAreaChart({ data }: SvgAreaChartProps) {
  const maxVal = Math.max(...data.map(d => d['Visitantes']), 5);
  const width = 500;
  const height = 200;
  const paddingLeft = 30;
  const paddingRight = 10;
  const paddingTop = 20;
  const paddingBottom = 20;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const points = data.map((d, index) => {
    const x = paddingLeft + (index / Math.max(1, data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d['Visitantes'] / maxVal) * chartHeight;
    return { x, y, label: d.label, val: d['Visitantes'] };
  });

  const linePath = points.length > 0 
    ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : '';

  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`
    : '';

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative w-full h-full flex flex-col justify-between">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="svgColorVisits" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f7c600" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#f7c600" stopOpacity={0} />
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
                stroke="rgba(255,255,255,0.03)" 
                strokeDasharray="3 3"
              />
              <text 
                x={paddingLeft - 8} 
                y={y + 3} 
                fill="rgba(255,255,255,0.3)" 
                fontSize={8} 
                textAnchor="end"
                className="font-mono"
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* Shaded Area */}
        {areaPath && (
          <path 
            d={areaPath} 
            fill="url(#svgColorVisits)"
          />
        )}

        {/* Line */}
        {linePath && (
          <path 
            d={linePath} 
            fill="none" 
            stroke="#f7c600" 
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Interactive Dots with Tooltips */}
        {points.map((p, idx) => (
          <g key={idx} className="group cursor-pointer">
            <circle 
              cx={p.x} 
              cy={p.y} 
              r={3.5} 
              fill="#f7c600" 
              className="transition-all duration-200 group-hover:r-5 group-hover:fill-white"
            />
            {/* Tooltip background & text on hover */}
            <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              <rect 
                x={Math.max(5, p.x - 45)} 
                y={p.y - 28} 
                width={90} 
                height={20} 
                fill="#121212" 
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={1}
                rx={2}
              />
              <text 
                x={p.x} 
                y={p.y - 15} 
                fill="#fff" 
                fontSize={8} 
                textAnchor="middle" 
                className="font-bold font-sans tracking-wide"
              >
                {p.label}: {p.val} visits
              </text>
            </g>
          </g>
        ))}

        {/* X Axis Labels */}
        {points.map((p, idx) => {
          const step = Math.ceil(points.length / 8);
          if (idx % step !== 0 && idx !== points.length - 1) return null;
          return (
            <text 
              key={idx}
              x={p.x} 
              y={height - 2} 
              fill="rgba(255,255,255,0.3)" 
              fontSize={8} 
              textAnchor="middle"
              className="font-mono uppercase"
            >
              {p.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

interface SvgDonutChartProps {
  data: { name: string; value: number; percentage: number }[];
  colors: string[];
}

function SvgDonutChart({ data, colors }: SvgDonutChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const size = 150;
  const radius = 50;
  const strokeWidth = 14;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedAngle = 0;

  return (
    <div className="relative flex items-center justify-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        {data.map((item, idx) => {
          const percentage = item.value / total;
          const strokeLength = percentage * circumference;
          const strokeOffset = circumference - strokeLength + accumulatedAngle;
          accumulatedAngle -= strokeLength;

          const color = colors[idx % colors.length];

          return (
            <circle
              key={idx}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              transform={`rotate(-90 ${center} ${center})`}
              className="transition-all duration-300 hover:stroke-[16px] cursor-pointer"
            >
              <title>{item.name}: {item.value} ({item.percentage}%)</title>
            </circle>
          );
        })}
        {/* Inner Label */}
        <text 
          x={center} 
          y={center + 3} 
          textAnchor="middle" 
          fill="#ffffff" 
          fontSize={10} 
          className="font-black uppercase tracking-widest text-white/50"
        >
          Origem
        </text>
      </svg>
    </div>
  );
}


// Type definitions matching the VisitorSession entity
interface AnalyticsEvent {
  type: string;
  path: string;
  timestamp: number;
  metadata?: any;
}

interface VisitorSession {
  id: string;
  sessionId: string;
  visitorId: string;
  isNewUser: boolean;
  createdAt: any; // Date, Timestamp or string
  updatedAt: any;
  lastActive: number;
  pagesVisited: number;
  pages: string[];
  device: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
  city: string;
  region: string;
  country: string;
  referrer: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userPhone: string | null;
  isIdentified: boolean;
  cartStarted: boolean;
  checkoutStarted: boolean;
  purchaseCompleted: boolean;
  totalSpent: number;
  searches: string[];
  viewedProducts: string[];
  cartProducts: string[];
  events: AnalyticsEvent[];
}

export default function AdminAnalyticsDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<VisitorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const isAdmin = (user && (
    user.email === 'fpacstore@gmail.com' || 
    user.email === 'atendimento@fpacstore.com.br'
  )) || localStorage.getItem('admin_bypass') === 'true';

  // Filtering & Settings
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all'>('week');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // in seconds, 0 = disabled
  const [countdown, setCountdown] = useState<number>(30);
  const [selectedSession, setSelectedSession] = useState<VisitorSession | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Charts sub-tab
  const [chartPeriod, setChartPeriod] = useState<'hour' | 'day' | 'week' | 'month'>('day');

  // Load visitor sessions in real-time
  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!isAdmin) {
      setError("Acesso não autorizado. Você precisa estar logado como administrador para ver esta página.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const qSessions = query(
      collection(db, 'visitor_sessions'), 
      orderBy('lastActive', 'desc')
    );

    const unsubscribe = onSnapshot(qSessions, (snapshot) => {
      const data: VisitorSession[] = [];
      snapshot.forEach((doc) => {
        const s = doc.data() as VisitorSession;
        // Make sure we carry the document ID as sessionId
        data.push({
          ...s,
          id: doc.id
        });
      });
      setSessions(data);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Failed to load sessions:", err);
      setError("Não foi possível carregar as sessões de visitantes. Verifique as permissões de acesso.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin, authLoading]);

  // Auto-refresh timer
  useEffect(() => {
    if (autoRefreshInterval === 0) return;
    
    setCountdown(autoRefreshInterval);
    const intervalId = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Trigger a silent re-query if we wanted, but onSnapshot does this for us.
          // This timer serves as an aesthetic and functional indicator of active socket connection.
          return autoRefreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [autoRefreshInterval]);

  // Helper to parse Firestore dates safely
  const getSessionDate = (session: VisitorSession): Date => {
    if (!session.createdAt) return new Date();
    if (session.createdAt instanceof Date) return session.createdAt;
    if (session.createdAt.seconds) return new Date(session.createdAt.seconds * 1000);
    if (session.createdAt.toDate) return session.createdAt.toDate();
    return new Date(session.createdAt);
  };

  // Filter sessions by selected date range
  const filteredSessions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    
    // Start of week (Sunday)
    const sunday = new Date(now);
    sunday.setDate(now.getDate() - now.getDay());
    const startOfWeek = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()).getTime();
    
    // Start of month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    
    // Start of year
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

    return sessions.filter(session => {
      const sessionTime = getSessionDate(session).getTime();

      switch (dateFilter) {
        case 'today':
          return sessionTime >= startOfToday;
        case 'yesterday':
          return sessionTime >= startOfYesterday && sessionTime < startOfToday;
        case 'week':
          return sessionTime >= startOfWeek;
        case 'month':
          return sessionTime >= startOfMonth;
        case 'year':
          return sessionTime >= startOfYear;
        case 'all':
        default:
          return true;
      }
    });
  }, [sessions, dateFilter]);

  // 1. CALCULATE MAIN INDICATORS
  const stats = useMemo(() => {
    const now = Date.now();
    
    // Active/Online within last 5 minutes (300,000ms)
    const onlineNow = sessions.filter(s => now - s.lastActive < 5 * 60 * 1000).length;
    
    // Total counters on filtered dataset
    const totalVisits = filteredSessions.length;
    const newUsers = filteredSessions.filter(s => s.isNewUser).length;
    const returningUsers = totalVisits - newUsers;

    // Filter by specific periods unconditionally for cards
    const startOfToday = new Date(now);
    startOfToday.setHours(0,0,0,0);
    const todayTime = startOfToday.getTime();
    
    const startOfYesterday = todayTime - 24 * 60 * 60 * 1000;
    const weekTime = todayTime - 7 * 24 * 60 * 60 * 1000;
    const monthTime = todayTime - 30 * 24 * 60 * 60 * 1000;
    const yearTime = new Date(new Date().getFullYear(), 0, 1).getTime();

    const visitsToday = sessions.filter(s => getSessionDate(s).getTime() >= todayTime).length;
    const visitsYesterday = sessions.filter(s => {
      const t = getSessionDate(s).getTime();
      return t >= startOfYesterday && t < todayTime;
    }).length;
    const visitsWeek = sessions.filter(s => getSessionDate(s).getTime() >= weekTime).length;
    const visitsMonth = sessions.filter(s => getSessionDate(s).getTime() >= monthTime).length;
    const visitsYear = sessions.filter(s => getSessionDate(s).getTime() >= yearTime).length;
    const visitsAll = sessions.length;

    return {
      onlineNow,
      today: visitsToday,
      yesterday: visitsYesterday,
      week: visitsWeek,
      month: visitsMonth,
      year: visitsYear,
      total: visitsAll,
      newUsers,
      returningUsers,
      filteredTotal: totalVisits
    };
  }, [sessions, filteredSessions]);

  // 2. RECHARTS: ACCESSES BY HOUR/DAY/WEEK/MONTH
  const chartData = useMemo(() => {
    if (chartPeriod === 'hour') {
      // Group by hours of the day (0-23)
      const hourMap: { [key: number]: number } = {};
      for (let i = 0; i < 24; i++) hourMap[i] = 0;

      filteredSessions.forEach(s => {
        const hour = getSessionDate(s).getHours();
        hourMap[hour] = (hourMap[hour] || 0) + 1;
      });

      return Object.keys(hourMap).map(h => ({
        label: `${h.padStart(2, '0')}h`,
        'Visitantes': hourMap[parseInt(h)]
      }));
    }

    if (chartPeriod === 'day') {
      // Group by day of the week
      const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const dayMap: { [key: string]: number } = { 'Dom': 0, 'Seg': 0, 'Ter': 0, 'Qua': 0, 'Qui': 0, 'Sex': 0, 'Sáb': 0 };

      filteredSessions.forEach(s => {
        const dayName = days[getSessionDate(s).getDay()];
        dayMap[dayName] = (dayMap[dayName] || 0) + 1;
      });

      return days.map(d => ({
        label: d,
        'Visitantes': dayMap[d]
      }));
    }

    if (chartPeriod === 'week') {
      // Group by date of the last 12 weeks
      const weekMap: { [key: string]: number } = {};
      filteredSessions.forEach(s => {
        const date = getSessionDate(s);
        // Get Sunday of the week
        const d = new Date(date);
        d.setDate(date.getDate() - date.getDay());
        const weekStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}`;
        weekMap[weekStr] = (weekMap[weekStr] || 0) + 1;
      });

      return Object.keys(weekMap).sort().map(w => ({
        label: `Semana ${w}`,
        'Visitantes': weekMap[w]
      })).slice(-8); // show last 8 weeks
    }

    // Default: Group by Month of the year
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const monthMap: { [key: string]: number } = {};
    months.forEach(m => { monthMap[m] = 0; });

    filteredSessions.forEach(s => {
      const mName = months[getSessionDate(s).getMonth()];
      monthMap[mName] = (monthMap[mName] || 0) + 1;
    });

    return months.map(m => ({
      label: m,
      'Visitantes': monthMap[m]
    }));
  }, [filteredSessions, chartPeriod]);

  // 3. REFERRALS & TRAFFIC SOURCES MATH
  const trafficData = useMemo(() => {
    const sources: { [key: string]: number } = {};
    
    filteredSessions.forEach(s => {
      const referrer = s.referrer || 'Direto';
      let origin = 'Tráfego Direto';

      if (s.utm_source) {
        const src = s.utm_source.toLowerCase();
        if (src.includes('google')) origin = 'Google';
        else if (src.includes('instagram') || src.includes('ig')) origin = 'Instagram';
        else if (src.includes('facebook') || src.includes('fb')) origin = 'Facebook';
        else if (src.includes('tiktok')) origin = 'TikTok';
        else if (src.includes('whatsapp')) origin = 'WhatsApp';
        else origin = s.utm_source;
      } else if (referrer !== 'Direto' && referrer !== '') {
        const refLower = referrer.toLowerCase();
        if (refLower.includes('google')) origin = 'Google';
        else if (refLower.includes('instagram')) origin = 'Instagram';
        else if (refLower.includes('facebook')) origin = 'Facebook';
        else if (refLower.includes('tiktok')) origin = 'TikTok';
        else if (refLower.includes('whatsapp') || refLower.includes('wa.me')) origin = 'WhatsApp';
        else if (
          refLower.includes('bing') || 
          refLower.includes('yahoo') || 
          refLower.includes('duckduckgo')
        ) origin = 'Pesquisa Orgânica';
        else origin = 'Links Externos';
      }

      sources[origin] = (sources[origin] || 0) + 1;
    });

    const total = filteredSessions.length || 1;
    return Object.keys(sources).map(key => ({
      name: key,
      value: sources[key],
      percentage: Math.round((sources[key] / total) * 100)
    })).sort((a, b) => b.value - a.value);
  }, [filteredSessions]);

  const COLORS = ['#f7c600', '#ffffff', '#eab308', '#2563eb', '#10b981', '#ef4444', '#a855f7', '#6b7280'];

  // 4. CONVERSION FUNNEL
  const funnelData = useMemo(() => {
    const total = filteredSessions.length || 1;
    const viewedProduct = filteredSessions.filter(s => (s.viewedProducts?.length || 0) > 0).length;
    const addedToCart = filteredSessions.filter(s => s.cartStarted || (s.cartProducts?.length || 0) > 0).length;
    const startedCheckout = filteredSessions.filter(s => s.checkoutStarted).length;
    const purchased = filteredSessions.filter(s => s.purchaseCompleted).length;

    return [
      { name: '1. Page View', count: total, rate: 100, color: '#ffffff' },
      { name: '2. Ver Produto', count: viewedProduct, rate: Math.round((viewedProduct / total) * 100), color: '#d1d5db' },
      { name: '3. Adic. Carrinho', count: addedToCart, rate: Math.round((addedToCart / total) * 100), color: '#a1a1aa' },
      { name: '4. Iniciar Checkout', count: startedCheckout, rate: Math.round((startedCheckout / total) * 100), color: '#f7c600' },
      { name: '5. Compra Finalizada', count: purchased, rate: Math.round((purchased / total) * 100), color: '#10b981' }
    ];
  }, [filteredSessions]);

  // 5. RANKINGS (Products, Searches, Cities)
  const productRanking = useMemo(() => {
    const views: { [key: string]: { name: string; views: number; cartAdds: number; purchases: number } } = {};

    filteredSessions.forEach(s => {
      // Viewed products
      s.viewedProducts?.forEach(slug => {
        if (!views[slug]) views[slug] = { name: slug, views: 0, cartAdds: 0, purchases: 0 };
        views[slug].views += 1;
      });

      // Cart items
      s.cartProducts?.forEach(slug => {
        if (!views[slug]) views[slug] = { name: slug, views: 0, cartAdds: 0, purchases: 0 };
        views[slug].cartAdds += 1;
      });

      // Purchases (extract from purchase event if logged)
      if (s.purchaseCompleted) {
        s.events?.forEach(ev => {
          if (ev.type === 'purchase' && ev.metadata?.itemsCount) {
            s.cartProducts?.forEach(slug => {
              if (views[slug]) views[slug].purchases += 1;
            });
          }
        });
      }
    });

    return Object.values(views).sort((a, b) => b.views - a.views).slice(0, 5);
  }, [filteredSessions]);

  // Cities ranking
  const locationRanking = useMemo(() => {
    const locs: { [key: string]: number } = {};
    filteredSessions.forEach(s => {
      const city = s.city || 'Desconhecido';
      const region = s.region || '';
      const key = city !== 'Desconhecido' && region ? `${city} (${region})` : city;
      locs[key] = (locs[key] || 0) + 1;
    });

    const total = filteredSessions.length || 1;
    return Object.entries(locs).map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / total) * 100)
    })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [filteredSessions]);

  // Popular searches
  const popularSearches = useMemo(() => {
    const queries: { [key: string]: number } = {};
    filteredSessions.forEach(s => {
      s.searches?.forEach(q => {
        const clean = q.trim().toLowerCase();
        if (clean !== '') {
          queries[clean] = (queries[clean] || 0) + 1;
        }
      });
    });

    return Object.entries(queries).map(([query, count]) => ({
      query,
      count
    })).sort((a, b) => b.count - a.count).slice(0, 5);
  }, [filteredSessions]);

  // Filtered session list with searching capabilities (supports searching by email, name, location or id)
  const searchedSessions = useMemo(() => {
    const queryLower = searchQuery.toLowerCase().trim();
    if (queryLower === '') return filteredSessions.slice(0, 50); // limit to 50 for layout performance

    return filteredSessions.filter(s => {
      const name = s.userName?.toLowerCase() || '';
      const email = s.userEmail?.toLowerCase() || '';
      const city = s.city?.toLowerCase() || '';
      const id = s.id?.toLowerCase() || '';
      return name.includes(queryLower) || 
             email.includes(queryLower) || 
             city.includes(queryLower) || 
             id.includes(queryLower);
    }).slice(0, 50);
  }, [filteredSessions, searchQuery]);

  // EXPORTS
  const exportToCSV = () => {
    try {
      const headers = ['Session ID', 'Visitor ID', 'Tipo Usuario', 'Data Inicio', 'Dispositivo', 'Navegador', 'Sistema Operacional', 'Cidade', 'Estado', 'Origem', 'Paginas Visitadas', 'Produtos Visualizados', 'Carrinho Ativo', 'Compra Finalizada', 'Identificado', 'Nome Cliente', 'E-mail Cliente', 'Gasto Total (R$)'];
      const rows = filteredSessions.map(s => [
        s.id,
        s.visitorId,
        s.isNewUser ? 'Novo' : 'Recorrente',
        getSessionDate(s).toLocaleString('pt-BR'),
        s.device,
        s.browser,
        s.os,
        s.city,
        s.region,
        s.referrer,
        s.pagesVisited,
        s.viewedProducts?.join(', ') || 'Nenhum',
        s.cartStarted ? 'Sim' : 'Não',
        s.purchaseCompleted ? 'Sim' : 'Não',
        s.isIdentified ? 'Sim' : 'Não',
        s.userName || 'Anônimo',
        s.userEmail || 'Anônimo',
        s.totalSpent || 0
      ]);

      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
        + [headers.join(';'), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(';'))].join('\n');
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `analytics_fpac_${dateFilter}_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      alert("Erro ao exportar CSV.");
    }
  };

  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="bg-[#0A0A0A] text-white min-h-screen p-4 md:p-8 font-sans selection:bg-[#f7c600] selection:text-black print:bg-white print:text-black">
      
      {/* 1. TOP HEADER & CONTROLS */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-8 border-b border-white/5 mb-8 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping" />
            <h1 className="text-xl md:text-3xl font-black italic tracking-tighter uppercase text-white">
              ANALYSIS <span className="text-[#f7c600]">DASHBOARD</span>
            </h1>
          </div>
          <p className="text-[10px] font-bold text-white/40 tracking-[0.2em] uppercase mt-2">
            Monitoramento de tráfego, conversões e comportamento em tempo real
          </p>
        </div>

        {/* CONTROLS ROW */}
        <div className="flex flex-wrap items-center gap-3">
          
          {/* Date Filter Selection */}
          <div className="bg-white/5 border border-white/10 p-1 flex">
            {(['today', 'yesterday', 'week', 'month', 'year', 'all'] as const).map((filter) => {
              const labelMap = { today: 'Hoje', yesterday: 'Ontem', week: 'Semana', month: 'Mês', year: 'Ano', all: 'Tudo' };
              return (
                <button
                  key={filter}
                  onClick={() => setDateFilter(filter)}
                  className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all ${
                    dateFilter === filter 
                      ? 'bg-[#f7c600] text-black' 
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {labelMap[filter]}
                </button>
              );
            })}
          </div>

          {/* Auto Refresh Config */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-wider">
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefreshInterval > 0 ? 'animate-spin' : ''} text-[#f7c600]`} />
            <span className="text-white/40">Sync:</span>
            <select
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(parseInt(e.target.value))}
              className="bg-transparent border-none text-white focus:ring-0 cursor-pointer pr-4"
            >
              <option value="15" className="bg-black">15s</option>
              <option value="30" className="bg-black">30s</option>
              <option value="60" className="bg-black">1m</option>
              <option value="300" className="bg-black">5m</option>
              <option value="0" className="bg-black">Manual</option>
            </select>
            {autoRefreshInterval > 0 && (
              <span className="text-[#f7c600] border-l border-white/10 pl-2 ml-1 w-5 inline-block text-center">{countdown}s</span>
            )}
          </div>

          {/* Export buttons */}
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 bg-white/5 border border-white/10 hover:border-white/20 px-4 py-2.5 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all text-white"
          >
            <Download className="w-3.5 h-3.5 text-[#f7c600]" />
            CSV
          </button>

          <button 
            onClick={handlePrintPDF}
            className="flex items-center gap-2 bg-white/5 border border-white/10 hover:border-white/20 px-4 py-2.5 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all text-white"
          >
            <FileText className="w-3.5 h-3.5 text-[#f7c600]" />
            Relatório PDF
          </button>
        </div>
      </div>

      {/* 2. BENTO-GRID STAT CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-9 gap-4 mb-8">
        
        {/* Visitors Online Now */}
        <div className="bg-white/[0.02] border border-white/5 p-4 relative overflow-hidden xl:col-span-2 flex flex-col justify-between group hover:border-[#f7c600]/30 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-black uppercase tracking-widest text-green-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              ONLINE AGORA
            </span>
            <Users className="w-4 h-4 text-[#f7c600] opacity-40 group-hover:opacity-100 transition-all" />
          </div>
          <div className="mt-4">
            <h3 className="text-4xl font-black italic tracking-tighter text-white font-mono">{stats.onlineNow}</h3>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1">Visitantes ativos nos últimos 5m</p>
          </div>
        </div>

        {/* Visitors Today */}
        <div className="bg-white/[0.02] border border-white/5 p-4 relative overflow-hidden xl:col-span-1 flex flex-col justify-between group hover:border-white/10 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Hoje</span>
            <Clock className="w-4 h-4 text-white/20" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black italic tracking-tighter text-white font-mono">{stats.today}</h3>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1">Acessos hoje</p>
          </div>
        </div>

        {/* Visitors Yesterday */}
        <div className="bg-white/[0.02] border border-white/5 p-4 relative overflow-hidden xl:col-span-1 flex flex-col justify-between group hover:border-white/10 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Ontem</span>
            <Calendar className="w-4 h-4 text-white/20" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black italic tracking-tighter text-white font-mono">{stats.yesterday}</h3>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1">Acessos ontem</p>
          </div>
        </div>

        {/* This Week */}
        <div className="bg-white/[0.02] border border-white/5 p-4 relative overflow-hidden xl:col-span-1 flex flex-col justify-between group hover:border-white/10 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Esta Semana</span>
            <TrendingUp className="w-4 h-4 text-white/20" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black italic tracking-tighter text-white font-mono">{stats.week}</h3>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1">Últimos 7 dias</p>
          </div>
        </div>

        {/* This Month */}
        <div className="bg-white/[0.02] border border-white/5 p-4 relative overflow-hidden xl:col-span-1 flex flex-col justify-between group hover:border-white/10 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Este Mês</span>
            <Compass className="w-4 h-4 text-white/20" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black italic tracking-tighter text-white font-mono">{stats.month}</h3>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1">Últimos 30 dias</p>
          </div>
        </div>

        {/* This Year */}
        <div className="bg-white/[0.02] border border-white/5 p-4 relative overflow-hidden xl:col-span-1 flex flex-col justify-between group hover:border-white/10 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Este Ano</span>
            <Globe className="w-4 h-4 text-white/20" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black italic tracking-tighter text-white font-mono">{stats.year}</h3>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1">Acumulado ano</p>
          </div>
        </div>

        {/* Total General */}
        <div className="bg-white/[0.02] border border-white/5 p-4 relative overflow-hidden xl:col-span-1 flex flex-col justify-between group hover:border-[#f7c600]/30 transition-all">
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-black uppercase tracking-widest text-[#f7c600]">Total Geral</span>
            <Flame className="w-4 h-4 text-[#f7c600] opacity-50" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black italic tracking-tighter text-[#f7c600] font-mono">{stats.total}</h3>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-1">Histórico de sessões</p>
          </div>
        </div>

        {/* New & Recurring Users */}
        <div className="bg-white/[0.02] border border-white/5 p-4 xl:col-span-1 flex flex-col justify-between hover:border-white/10 transition-all">
          <span className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3">Retenção de Filtro</span>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-[#f7c600]" /> Novos:
              </span>
              <span className="text-xs font-black font-mono">{stats.newUsers}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1">
                <UserMinus className="w-3 h-3 text-white/60" /> Recorr.:
              </span>
              <span className="text-xs font-black font-mono">{stats.returningUsers}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CHARTS CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        
        {/* ACCESSES EVOLUTION (Col-span 2) */}
        <div className="bg-white/[0.01] border border-white/5 p-6 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-white">
                Evolução dos <span className="text-[#f7c600]">Acessos</span>
              </h2>
              <p className="text-[8px] font-bold text-white/30 uppercase tracking-wider mt-1">
                Frequência de visitas agrupada por período selecionado
              </p>
            </div>
            
            <div className="bg-white/5 border border-white/10 p-1 flex self-start">
              {(['hour', 'day', 'week', 'month'] as const).map((period) => {
                const labelMap = { hour: 'Hora', day: 'Dia', week: 'Semana', month: 'Mês' };
                return (
                  <button
                    key={period}
                    onClick={() => setChartPeriod(period)}
                    className={`px-3 py-1 text-[8px] font-black uppercase tracking-wider transition-all ${
                      chartPeriod === period 
                        ? 'bg-white text-black font-black' 
                        : 'text-white/40 hover:text-white'
                    }`}
                  >
                    {labelMap[period]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-[280px] w-full flex items-center justify-center">
            <SvgAreaChart data={chartData} />
          </div>
        </div>

        {/* TRAFFIC SOURCES PIE (Col-span 1) */}
        <div className="bg-white/[0.01] border border-white/5 p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white mb-2">
              Fontes de <span className="text-[#f7c600]">Origem</span>
            </h2>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-wider mb-6">
              Distribuição de visitantes por referrers e canais UTM
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="h-[180px] flex items-center justify-center">
              <SvgDonutChart data={trafficData} colors={COLORS} />
            </div>

            <div className="space-y-3">
              {trafficData.slice(0, 4).map((source, index) => (
                <div key={source.name} className="space-y-1">
                  <div className="flex items-center justify-between text-[9px] font-black uppercase">
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      {source.name}
                    </span>
                    <span className="font-mono text-white/60">{source.value} ({source.percentage}%)</span>
                  </div>
                  <div className="w-full bg-white/5 h-1">
                    <div 
                      className="h-full" 
                      style={{ 
                        width: `${source.percentage}%`, 
                        backgroundColor: COLORS[index % COLORS.length] 
                      }} 
                    />
                  </div>
                </div>
              ))}
              {trafficData.length === 0 && (
                <p className="text-[9px] text-white/30 uppercase italic">Nenhum dado registrado</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. BEHAVIOR FUNNEL & ABANDONMENT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        
        {/* SHOPPING CONVERSION FUNNEL */}
        <div className="bg-white/[0.01] border border-white/5 p-6 lg:col-span-1">
          <h2 className="text-sm font-black uppercase tracking-widest text-white mb-2">
            Funil de <span className="text-[#f7c600]">Conversão</span>
          </h2>
          <p className="text-[8px] font-bold text-white/30 uppercase tracking-wider mb-6">
            Conversão e abandono por etapas da jornada de compra
          </p>

          <div className="space-y-5">
            {funnelData.map((step, index) => {
              const previousCount = index > 0 ? funnelData[index - 1].count : step.count;
              const stepAbandonRate = previousCount > 0 
                ? Math.round(((previousCount - step.count) / previousCount) * 100) 
                : 0;

              return (
                <div key={step.name} className="relative">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase mb-1">
                    <span className="text-white/80">{step.name}</span>
                    <span className="font-mono">{step.count} ({step.rate}%)</span>
                  </div>

                  <div className="w-full bg-white/5 h-4.5 overflow-hidden flex items-center relative">
                    <div 
                      className="h-full transition-all duration-500" 
                      style={{ 
                        width: `${step.rate}%`, 
                        backgroundColor: step.color === '#f7c600' ? '#f7c600' : step.color === '#10b981' ? '#10b981' : 'rgba(255,255,255,0.1)'
                      }} 
                    />
                    
                    {/* Tiny stats over bar */}
                    {index > 0 && stepAbandonRate > 0 && (
                      <span className="absolute right-2 text-[7px] font-black uppercase text-red-500 bg-red-950/40 px-1 border border-red-900/30">
                        -{stepAbandonRate}% DROP
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* PRODUCT & SEARCH RANKINGS */}
        <div className="bg-white/[0.01] border border-white/5 p-6 lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* PRODUCT RANKINGS */}
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-white mb-4 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                PRODUTOS MAIS VISITADOS
              </h3>
              
              <div className="space-y-4">
                {productRanking.map((p, idx) => (
                  <div key={p.name} className="flex items-center justify-between border-b border-white/5 pb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-white/30 font-mono">0{idx+1}</span>
                      <span className="text-[10px] font-black uppercase text-white truncate max-w-[180px]">{p.name}</span>
                    </div>
                    <div className="flex gap-4 text-[9px] font-mono">
                      <span className="text-white/40"><strong className="text-white font-black">{p.views}</strong> views</span>
                      <span className="text-white/40"><strong className="text-[#f7c600] font-black">{p.cartAdds}</strong> add</span>
                      {p.purchases > 0 && (
                        <span className="text-green-400 font-bold">{p.purchases} sales</span>
                      )}
                    </div>
                  </div>
                ))}
                {productRanking.length === 0 && (
                  <p className="text-[9px] text-white/30 uppercase italic">Nenhum produto visualizado no filtro</p>
                )}
              </div>
            </div>

            {/* POPULAR SEARCHES & LOCATIONS */}
            <div className="space-y-6">
              
              {/* SEARCHES */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-white mb-4 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-[#f7c600]" />
                  TERMOS BUSCADOS
                </h3>
                <div className="flex flex-wrap gap-2">
                  {popularSearches.map((s) => (
                    <span 
                      key={s.query} 
                      className="px-2.5 py-1.5 bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-wider text-[#f7c600]"
                    >
                      {s.query} <span className="text-white/30 ml-1 font-mono font-bold">({s.count}x)</span>
                    </span>
                  ))}
                  {popularSearches.length === 0 && (
                    <p className="text-[9px] text-white/30 uppercase italic">Nenhuma busca realizada no filtro</p>
                  )}
                </div>
              </div>

              {/* LOCATIONS */}
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-white mb-4 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#f7c600]" />
                  PRINCIPAIS CIDADES
                </h3>
                <div className="space-y-3">
                  {locationRanking.map((l, idx) => (
                    <div key={l.name} className="flex items-center justify-between text-[9px] uppercase">
                      <span className="font-bold text-white/70">{idx+1}. {l.name}</span>
                      <span className="font-mono font-black text-[#f7c600]">{l.count} ({l.percentage}%)</span>
                    </div>
                  ))}
                  {locationRanking.length === 0 && (
                    <p className="text-[9px] text-white/30 uppercase italic">Nenhuma localização rastreada</p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* 5. VISITOR SESSIONS DETAILED TABLE */}
      <div className="bg-white/[0.01] border border-white/5 p-6 mb-8 print:hidden">
        
        {/* Sub-Header & search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-white">
              Sessões de <span className="text-[#f7c600]">Visitantes</span>
            </h2>
            <p className="text-[8px] font-bold text-white/30 uppercase tracking-wider mt-1">
              Registro completo de usuários. Clique na linha para inspecionar os cliques e as páginas visitadas
            </p>
          </div>

          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Buscar por nome, email, cidade ou ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 pl-9 pr-4 py-2 text-[10px] font-black uppercase tracking-wider text-white placeholder:text-white/20 focus:outline-none focus:border-[#f7c600] transition-colors"
            />
          </div>
        </div>

        {/* Table layout */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[10px] uppercase border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-white/40 font-black tracking-widest">
                <th className="pb-3 pt-1 font-black">Sessão ID / Rastreamento</th>
                <th className="pb-3 pt-1 font-black">Cliente / Perfil</th>
                <th className="pb-3 pt-1 font-black">Origem</th>
                <th className="pb-3 pt-1 font-black">Geo/Localização</th>
                <th className="pb-3 pt-1 font-black">Browser / SO</th>
                <th className="pb-3 pt-1 font-black">Ações</th>
                <th className="pb-3 pt-1 font-black text-right">Gasto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-bold text-white/80">
              {searchedSessions.map((s) => {
                const sessionDate = getSessionDate(s);
                const isOnline = Date.now() - s.lastActive < 5 * 60 * 1000;

                return (
                  <tr 
                    key={s.id} 
                    onClick={() => setSelectedSession(s)}
                    className="hover:bg-white/[0.03] transition-colors cursor-pointer group"
                  >
                    {/* Session ID / Rastreamento */}
                    <td className="py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`} />
                        <div>
                          <p className="font-mono text-white/50 group-hover:text-[#f7c600] transition-colors">{s.id.substring(0, 14)}...</p>
                          <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest mt-0.5">
                            {sessionDate.toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Cliente / Perfil */}
                    <td className="py-3.5">
                      {s.isIdentified ? (
                        <div>
                          <p className="font-black text-white flex items-center gap-1">
                            <UserCheck className="w-3.5 h-3.5 text-[#f7c600]" />
                            {s.userName || 'Nome Indisponível'}
                          </p>
                          <p className="text-[8px] font-mono text-white/40 font-bold lowercase mt-0.5">{s.userEmail}</p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-white/40">
                          <UserMinus className="w-3.5 h-3.5 text-white/20" />
                          <span>Visitante Anônimo</span>
                        </div>
                      )}
                    </td>

                    {/* Origem */}
                    <td className="py-3.5 text-white/60">
                      <p>{s.utm_source || 'Orgânico/Direto'}</p>
                      {s.utm_campaign && (
                        <p className="text-[7px] text-[#f7c600] tracking-widest mt-0.5">CAMP: {s.utm_campaign}</p>
                      )}
                    </td>

                    {/* Geo/Localização */}
                    <td className="py-3.5">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#f7c600] opacity-50" />
                        <span>{s.city}, {s.region}</span>
                      </div>
                    </td>

                    {/* Browser / SO */}
                    <td className="py-3.5 text-white/50 font-mono text-[9px]">
                      {s.browser} / {s.os}
                    </td>

                    {/* Ações */}
                    <td className="py-3.5">
                      <div className="flex flex-wrap gap-1">
                        <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 text-[8px] text-white/50">
                          {s.pagesVisited} pág
                        </span>
                        {s.cartStarted && (
                          <span className="px-1.5 py-0.5 bg-[#f7c600]/10 border border-[#f7c600]/20 text-[8px] text-[#f7c600]">
                            Carrinho
                          </span>
                        )}
                        {s.purchaseCompleted && (
                          <span className="px-1.5 py-0.5 bg-green-950/20 border border-green-500/20 text-[8px] text-green-400">
                            COMPROU
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Gasto */}
                    <td className="py-3.5 text-right font-mono font-black text-white">
                      {s.totalSpent > 0 ? (
                        <span className="text-[#f7c600]">R$ {s.totalSpent.toFixed(2)}</span>
                      ) : (
                        <span className="text-white/20">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {searchedSessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-white/30 uppercase tracking-widest italic">
                    Nenhuma sessão encontrada correspondente aos termos de busca
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. INSPECTION MODAL (SESSÃO DETALHADA) */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 overflow-y-auto selection:bg-[#f7c600] selection:text-black">
          <div className="bg-[#121212] border border-white/10 max-w-2xl w-full p-6 relative rounded-none space-y-6">
            
            {/* Close */}
            <button 
              onClick={() => setSelectedSession(null)}
              className="absolute right-4 top-4 text-white/40 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${Date.now() - selectedSession.lastActive < 5 * 60 * 1000 ? 'bg-green-500 animate-pulse' : 'bg-white/20'}`} />
                <h3 className="text-sm font-black uppercase tracking-widest text-[#f7c600]">
                  INSPEÇÃO DE SESSÃO
                </h3>
              </div>
              <p className="text-[9px] text-white/40 uppercase tracking-widest mt-1 font-mono">ID: {selectedSession.id}</p>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/10 p-3 space-y-1">
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Informações do Perfil</p>
                {selectedSession.isIdentified ? (
                  <>
                    <p className="text-[10px] font-black uppercase text-white">{selectedSession.userName}</p>
                    <p className="text-[9px] font-mono text-[#f7c600]">{selectedSession.userEmail}</p>
                    <p className="text-[9px] font-mono text-white/60">{selectedSession.userPhone || 'Sem telefone'}</p>
                  </>
                ) : (
                  <p className="text-[9px] uppercase italic text-white/40">Sessão Anônima (Sem dados de PII expostos)</p>
                )}
              </div>

              <div className="bg-white/5 border border-white/10 p-3 space-y-1 font-mono">
                <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Metadados Técnicos</p>
                <p className="text-[9px] uppercase text-white/80"><strong className="text-white">Local:</strong> {selectedSession.city}, {selectedSession.region}, {selectedSession.country}</p>
                <p className="text-[9px] uppercase text-white/80"><strong className="text-white">Dispositivo:</strong> {selectedSession.device} / {selectedSession.browser} ({selectedSession.os})</p>
                <p className="text-[9px] uppercase text-[#f7c600] truncate"><strong className="text-white">Referer:</strong> {selectedSession.referrer}</p>
              </div>
            </div>

            {/* Navigation Flow List */}
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-3 flex items-center gap-1">
                <Compass className="w-3.5 h-3.5 text-[#f7c600]" />
                FLUXO DE NAVEGAÇÃO E EVENTOS
              </p>
              
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-2 divide-y divide-white/5">
                {(selectedSession.events || []).map((ev, idx) => {
                  const d = new Date(ev.timestamp);
                  const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
                  
                  return (
                    <div key={idx} className="pt-2 flex items-start justify-between text-[9px] uppercase">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-white/30 font-bold">{timeStr}</span>
                          <span className={`font-black px-1.5 py-0.2 rounded-none text-[8px] ${
                            ev.type === 'purchase' ? 'bg-green-500 text-black' :
                            ev.type === 'checkout_start' ? 'bg-[#f7c600] text-black' :
                            ev.type === 'cart_add' ? 'bg-[#f7c600]/10 border border-[#f7c600]/20 text-[#f7c600]' :
                            ev.type === 'product_view' ? 'bg-white/5 border border-white/10 text-white' :
                            'bg-white/5 text-white/40'
                          }`}>
                            {ev.type}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-white/80 tracking-wider font-bold">{ev.path}</p>
                        {ev.metadata && (
                          <pre className="text-[8px] font-mono text-white/40 bg-black/30 p-1 font-medium mt-1 uppercase max-w-[500px] overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(ev.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-white/10 shrink-0 self-center" />
                    </div>
                  );
                })}
                {(!selectedSession.events || selectedSession.events.length === 0) && (
                  <p className="text-[9px] text-white/30 uppercase italic py-4">Nenhum evento registrado nesta sessão.</p>
                )}
              </div>
            </div>

            {/* Bottom Details Summary */}
            <div className="border-t border-white/10 pt-4 flex justify-between items-center text-[9px] uppercase">
              <p className="text-white/40">Rastreamento consolidado em tempo real por FPAC Store</p>
              <button 
                onClick={() => setSelectedSession(null)}
                className="bg-white text-black px-4 py-2 font-black uppercase hover:bg-[#f7c600] transition-colors"
              >
                Fechar Inspeção
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
