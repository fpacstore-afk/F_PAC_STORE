import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Gift,
  Lock,
  Medal,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DEFAULT_TIERS, LoyaltyTierConfig } from '../constants/loyaltyConfig';
import { getPublicApiUrl } from '../lib/api';

type ClubSection = 'ranking' | 'benefits';

interface PublicRankingEntry {
  position: number;
  publicName: string;
  tier: {
    id: LoyaltyTierConfig['id'];
    name: string;
    badge: string;
  };
}

interface PublicRankingPayload {
  ranking: PublicRankingEntry[];
  topBuyer: PublicRankingEntry | null;
  updatedAt: string | null;
}

const tierTone: Record<LoyaltyTierConfig['id'], string> = {
  bronze: 'border-amber-700/50 bg-amber-950/25 text-amber-400',
  prata: 'border-slate-300/40 bg-slate-200/10 text-slate-200',
  ouro: 'border-[#eab308]/50 bg-[#eab308]/10 text-[#eab308]',
  diamante: 'border-sky-400/50 bg-sky-400/10 text-sky-300',
};

const positionTone = (position: number) => {
  if (position === 1) return 'border-[#eab308] bg-[#eab308] text-black';
  if (position === 2) return 'border-slate-300 bg-slate-200 text-black';
  if (position === 3) return 'border-amber-700 bg-amber-800 text-white';
  return 'border-white/10 bg-black text-white/55';
};

const positionMedal = (position: number) => {
  if (position === 1) return '🥇';
  if (position === 2) return '🥈';
  if (position === 3) return '🥉';
  return `#${position}`;
};

const formatTierRange = (tier: LoyaltyTierConfig) => {
  if (tier.maxAmount === null) return `A partir de R$ ${tier.minAmount.toLocaleString('pt-BR')}`;
  if (tier.minAmount === 0) return `Até R$ ${tier.maxAmount.toLocaleString('pt-BR')}`;
  return `De R$ ${tier.minAmount.toLocaleString('pt-BR')} a R$ ${tier.maxAmount.toLocaleString('pt-BR')}`;
};

export default function ClubeFPAC() {
  const [activeSection, setActiveSection] = useState<ClubSection>('ranking');
  const [ranking, setRanking] = useState<PublicRankingEntry[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    let hasSuccessfulLoad = false;

    const loadRanking = async (showLoading = false) => {
      if (showLoading) {
        setLoading(true);
        setLoadError(false);
      }

      try {
        const response = await fetch(getPublicApiUrl('/api/club/ranking?limit=10'), {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`Club ranking request failed: ${response.status}`);

        const payload = await response.json() as PublicRankingPayload;
        setRanking(Array.isArray(payload.ranking) ? payload.ranking : []);
        setUpdatedAt(payload.updatedAt || null);
        setLoadError(false);
        hasSuccessfulLoad = true;
      } catch (error: any) {
        if (error?.name !== 'AbortError' && !hasSuccessfulLoad) {
          console.warn('Public Club ranking unavailable:', error);
          setLoadError(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadRanking(true);
    const refreshInterval = window.setInterval(() => void loadRanking(), 60_000);
    return () => {
      controller.abort();
      window.clearInterval(refreshInterval);
    };
  }, [reloadKey]);

  const topBuyer = ranking[0] || null;
  const sections: Array<{ id: ClubSection; label: string; icon: React.ElementType }> = [
    { id: 'ranking', label: 'Hall de compras', icon: Trophy },
    { id: 'benefits', label: 'Benefícios', icon: Gift },
  ];

  return (
    <div className="min-h-screen bg-[#0b0b0e] text-white pb-20 selection:bg-[#eab308] selection:text-black">
      <section className="relative overflow-hidden border-b border-white/10 bg-black px-4 py-10 sm:px-6 md:py-14 lg:px-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#eab308]/10 blur-3xl" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="max-w-3xl">
            <span className="mb-3 inline-flex items-center gap-2 border border-[#eab308]/40 bg-[#eab308]/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.24em] text-[#eab308]">
              <Crown size={13} aria-hidden="true" /> Clube de relacionamento F PAC
            </span>
            <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-[-0.045em] sm:text-5xl md:text-6xl">
              Compre. Evolua.<br />
              <span className="text-[#eab308]">Ocupe seu lugar.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-xs leading-relaxed text-white/55 sm:text-sm">
              Suas compras válidas definem sua posição no Hall de Compras e liberam novos benefícios dentro do Clube F PAC.
            </p>
          </div>

          <div className="mt-8 flex gap-2 overflow-x-auto pb-1 scrollbar-none" aria-label="Seções do Clube F PAC">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                aria-current={activeSection === id ? 'page' : undefined}
                className={`flex min-w-max items-center gap-2 border px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
                  activeSection === id
                    ? 'border-[#eab308] bg-[#eab308] text-black'
                    : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white'
                }`}
              >
                <Icon size={14} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {activeSection === 'ranking' && (
        <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 md:py-12 lg:px-8">
          <section className="relative overflow-hidden border border-[#eab308]/45 bg-gradient-to-br from-[#211c08] via-[#111115] to-black p-6 md:p-8">
            <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-[#eab308]/10 blur-3xl" />
            <div className="relative z-10 grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-[#eab308]">
                  <Sparkles size={14} aria-hidden="true" /> Destaque máximo do clube
                </span>
                <h2 className="mt-2 text-2xl font-black uppercase tracking-tight md:text-4xl">Maior comprador atual</h2>

                {loading ? (
                  <div className="mt-5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/45">
                    <RefreshCw size={15} className="animate-spin" /> Atualizando posição
                  </div>
                ) : loadError ? (
                  <p className="mt-4 text-sm text-white/50">Não foi possível carregar o ranking agora.</p>
                ) : topBuyer ? (
                  <div className="mt-5">
                    <p className="text-2xl font-black uppercase text-white md:text-3xl">{topBuyer.publicName}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${tierTone[topBuyer.tier.id]}`}>
                        {topBuyer.tier.badge} Nível {topBuyer.tier.name}
                      </span>
                      <span className="border border-white/10 bg-black/45 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/60">
                        1º lugar em compras
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-white/50">O primeiro nome entrará aqui assim que houver uma compra válida registrada.</p>
                )}
              </div>

              <div className="flex h-28 w-28 items-center justify-center border border-[#eab308]/40 bg-black/45 text-6xl shadow-2xl shadow-[#eab308]/10 md:h-36 md:w-36 md:text-7xl">
                🏆
              </div>
            </div>

            <p className="relative z-10 mt-6 border-t border-white/10 pt-4 text-[10px] leading-relaxed text-white/45">
              Este destaque independe do nível Bronze, Prata, Ouro ou Diamante: ele pertence a quem lidera o total líquido de compras pagas acumuladas.
            </p>
          </section>

          <section className="border border-white/10 bg-[#111115]">
            <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-end sm:justify-between md:p-6">
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#eab308]">Hall da fama principal</span>
                <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Ranking de compras</h2>
              </div>
              <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-white/40">
                <RefreshCw size={12} aria-hidden="true" />
                {updatedAt
                  ? `Atualizado às ${new Date(updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Atualização automática'}
              </span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 p-12 text-xs font-bold uppercase tracking-wider text-white/40">
                <RefreshCw size={16} className="animate-spin" /> Carregando ranking real
              </div>
            ) : loadError ? (
              <div className="p-10 text-center">
                <Lock size={22} className="mx-auto mb-3 text-white/30" />
                <p className="text-sm font-bold uppercase text-white/60">Ranking temporariamente indisponível</p>
                <p className="mt-1 text-xs text-white/35">Tente novamente em alguns instantes.</p>
                <button type="button" onClick={() => setReloadKey(value => value + 1)} className="mt-4 border border-white/15 px-4 py-2 text-[9px] font-black uppercase tracking-wider text-white/65 hover:border-[#eab308] hover:text-[#eab308]">
                  Tentar novamente
                </button>
              </div>
            ) : ranking.length === 0 ? (
              <div className="p-10 text-center">
                <Medal size={24} className="mx-auto mb-3 text-[#eab308]/60" />
                <p className="text-sm font-bold uppercase text-white/60">O Hall de Compras está começando</p>
                <p className="mt-1 text-xs text-white/35">As posições aparecerão quando houver compras pagas registradas.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.07]">
                {ranking.map(entry => (
                  <div key={`${entry.position}-${entry.publicName}`} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-white/[0.025] sm:px-6">
                    <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center border text-sm font-black sm:h-11 sm:w-11 ${positionTone(entry.position)}`}>
                        {positionMedal(entry.position)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase tracking-wide text-white sm:text-base">{entry.publicName}</p>
                        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-white/35">
                          Posição #{entry.position} no Clube F PAC
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 border px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider sm:px-3 ${tierTone[entry.tier.id]}`}>
                      {entry.tier.badge} <span className="hidden sm:inline">{entry.tier.name}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-start gap-2 border-t border-white/10 bg-black/35 p-4 text-[9px] leading-relaxed text-white/35">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-[#eab308]" aria-hidden="true" />
              O servidor publica somente posição, nome protegido e nível. E-mail, telefone, valor e dados dos pedidos nunca são enviados ao navegador.
            </div>
          </section>
        </main>
      )}

      {activeSection === 'benefits' && (
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12 lg:px-8">
          <div className="mb-7 max-w-2xl">
            <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#eab308]">Benefícios por nível</span>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight md:text-4xl">Quanto mais você veste, mais você acessa.</h2>
            <p className="mt-3 text-xs leading-relaxed text-white/45 sm:text-sm">
              Seu nível é definido pelo total líquido de compras pagas acumuladas. Cada avanço mantém os benefícios anteriores e adiciona novas vantagens.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {DEFAULT_TIERS.map((tier, index) => (
              <article key={tier.id} className={`flex flex-col border bg-[#111115] p-5 ${tier.borderColor}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/35">Nível {String(index + 1).padStart(2, '0')}</span>
                    <h3 className="mt-1 text-2xl font-black uppercase" style={{ color: tier.color }}>{tier.name}</h3>
                  </div>
                  <span className="text-4xl" aria-hidden="true">{tier.badge}</span>
                </div>

                <p className="mt-3 border-y border-white/10 py-3 text-[10px] font-black uppercase tracking-wider text-white/65">
                  {formatTierRange(tier)}
                </p>
                <p className="mt-4 text-xs leading-relaxed text-white/45">{tier.description}</p>

                <div className="mt-5 flex-1 space-y-3">
                  {tier.benefits.map(benefit => (
                    <div key={benefit} className="flex items-start gap-2 text-xs leading-relaxed text-white/70">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#eab308]" aria-hidden="true" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="mt-7 flex flex-col gap-4 border border-white/10 bg-white/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase">Pronto para avançar?</p>
              <p className="mt-1 text-xs text-white/40">Escolha sua próxima peça e evolua dentro do Clube F PAC.</p>
            </div>
            <Link to="/catalog" className="inline-flex items-center justify-center gap-2 bg-[#eab308] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-black transition-colors hover:bg-white">
              Ver produtos <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </main>
      )}
    </div>
  );
}
