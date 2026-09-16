import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Gift,
  Lock,
  Medal,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trophy,
  UserCheck,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import {
  CustomerLoyaltyData,
  DEFAULT_ACHIEVEMENTS,
  DEFAULT_MISSIONS,
  DEFAULT_TIERS,
  LoyaltyTierConfig,
  processCustomerLoyaltyList,
  sanitizePublicName,
} from '../constants/loyaltyConfig';

type ClubSection = 'ranking' | 'benefits' | 'profile';

const EXCLUDED_ORDER_STATUSES = new Set([
  'cancelled',
  'canceled',
  'refused',
  'rejected',
  'refunded',
  'returned',
]);

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

const isEligibleOrder = (order: any) => {
  const statuses = [
    order?.status,
    order?.paymentStatus,
    order?.payment?.status,
  ].map(value => String(value || '').toLowerCase());

  return !statuses.some(status => EXCLUDED_ORDER_STATUSES.has(status));
};

export default function ClubeFPAC() {
  const { user } = useAuth();
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [activeSection, setActiveSection] = useState<ClubSection>('ranking');
  const [searchKey, setSearchKey] = useState('');
  const [foundCustomer, setFoundCustomer] = useState<CustomerLoyaltyData | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'orders'),
      snapshot => {
        setAllOrders(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
        setLoadError(false);
        setLoading(false);
      },
      error => {
        console.warn('Firestore fallback on loyalty page:', error);
        setLoadError(true);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const eligibleOrders = useMemo(() => allOrders.filter(isEligibleOrder), [allOrders]);

  const loyaltyList = useMemo(
    () => processCustomerLoyaltyList(
      eligibleOrders,
      DEFAULT_TIERS,
      DEFAULT_ACHIEVEMENTS,
      DEFAULT_MISSIONS,
    ),
    [eligibleOrders],
  );

  const purchaseRanking = useMemo(
    () => [...loyaltyList]
      .filter(customer => customer.totalSpent > 0)
      .sort((a, b) => {
        const spendDifference = b.totalSpent - a.totalSpent;
        if (spendDifference !== 0) return spendDifference;
        return (a.firstPurchaseDate?.getTime() || Number.MAX_SAFE_INTEGER)
          - (b.firstPurchaseDate?.getTime() || Number.MAX_SAFE_INTEGER);
      })
      .slice(0, 10),
    [loyaltyList],
  );

  const topBuyer = purchaseRanking[0] || null;

  useEffect(() => {
    const email = String(user?.email || '').toLowerCase().trim();
    if (!email) return;

    const match = loyaltyList.find(customer => customer.email.toLowerCase().trim() === email);
    if (match) setFoundCustomer(match);
  }, [user?.email, loyaltyList]);

  const handleSearchCustomer = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchKey.trim();
    if (!query) return;

    const normalizedEmail = query.toLowerCase();
    const normalizedPhone = query.replace(/\D/g, '');
    const match = loyaltyList.find(customer => {
      const emailMatches = customer.email.toLowerCase().trim() === normalizedEmail;
      const phoneMatches = normalizedPhone.length >= 8
        && customer.phone.replace(/\D/g, '') === normalizedPhone;
      return emailMatches || phoneMatches;
    });

    setSearchAttempted(true);
    setFoundCustomer(match || null);
  };

  const sections: Array<{ id: ClubSection; label: string; icon: React.ElementType }> = [
    { id: 'ranking', label: 'Hall de compras', icon: Trophy },
    { id: 'benefits', label: 'Benefícios', icon: Gift },
    { id: 'profile', label: 'Meu clube', icon: UserCheck },
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
                    <p className="text-2xl font-black uppercase text-white md:text-3xl">
                      {sanitizePublicName(topBuyer.customerName)}
                    </p>
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
              Este destaque independe do nível Bronze, Prata, Ouro ou Diamante: ele pertence a quem lidera o total de compras válidas acumuladas.
            </p>
          </section>

          <section className="border border-white/10 bg-[#111115]">
            <div className="flex flex-col gap-3 border-b border-white/10 p-5 sm:flex-row sm:items-end sm:justify-between md:p-6">
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#eab308]">Hall da fama principal</span>
                <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">Ranking de compras</h2>
              </div>
              <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-white/40">
                <RefreshCw size={12} aria-hidden="true" /> Atualização automática
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
              </div>
            ) : purchaseRanking.length === 0 ? (
              <div className="p-10 text-center">
                <Medal size={24} className="mx-auto mb-3 text-[#eab308]/60" />
                <p className="text-sm font-bold uppercase text-white/60">O Hall de Compras está começando</p>
                <p className="mt-1 text-xs text-white/35">As posições aparecerão quando houver compras válidas registradas.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.07]">
                {purchaseRanking.map((customer, index) => {
                  const position = index + 1;
                  return (
                    <div key={customer.key} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-white/[0.025] sm:px-6">
                      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center border text-sm font-black sm:h-11 sm:w-11 ${positionTone(position)}`}>
                          {positionMedal(position)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black uppercase tracking-wide text-white sm:text-base">
                            {sanitizePublicName(customer.customerName)}
                          </p>
                          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-white/35">
                            Posição #{position} no Clube F PAC
                          </p>
                        </div>
                      </div>
                      <span className={`shrink-0 border px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider sm:px-3 ${tierTone[customer.tier.id]}`}>
                        {customer.tier.badge} <span className="hidden sm:inline">{customer.tier.name}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-start gap-2 border-t border-white/10 bg-black/35 p-4 text-[9px] leading-relaxed text-white/35">
              <ShieldCheck size={13} className="mt-0.5 shrink-0 text-[#eab308]" aria-hidden="true" />
              Nomes protegidos e valores ocultos. Pedidos cancelados, recusados, rejeitados, devolvidos ou reembolsados não entram na classificação.
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
              Seu nível é definido pelo total de compras válidas acumuladas. Cada avanço mantém os benefícios anteriores e adiciona novas vantagens.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {DEFAULT_TIERS.map((tier, index) => (
              <article key={tier.id} className={`flex flex-col border bg-[#111115] p-5 ${tier.borderColor}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/35">Nível {String(index + 1).padStart(2, '0')}</span>
                    <h3 className="mt-1 text-2xl font-black uppercase" style={{ color: tier.color }}>
                      {tier.name}
                    </h3>
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

      {activeSection === 'profile' && (
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 md:py-12 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#eab308]">Consulta individual</span>
            <h2 className="mt-1 text-2xl font-black uppercase tracking-tight md:text-4xl">Veja seu nível no Clube</h2>
            <p className="mt-3 text-xs leading-relaxed text-white/45 sm:text-sm">
              Use exatamente o e-mail ou WhatsApp informado em suas compras. A consulta não aceita busca pública por nome.
            </p>
          </div>

          <form onSubmit={handleSearchCustomer} className="mx-auto mt-7 flex max-w-2xl flex-col gap-3 border border-white/10 bg-[#111115] p-4 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">E-mail ou WhatsApp usado na compra</span>
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" aria-hidden="true" />
              <input
                type="text"
                value={searchKey}
                onChange={event => setSearchKey(event.target.value)}
                placeholder="E-mail ou WhatsApp usado na compra"
                autoComplete="email"
                className="w-full border border-white/15 bg-black py-3 pl-10 pr-4 text-xs text-white outline-none transition-colors placeholder:text-white/25 focus:border-[#eab308]"
              />
            </label>
            <button type="submit" className="bg-[#eab308] px-6 py-3 text-[10px] font-black uppercase tracking-wider text-black transition-colors hover:bg-white">
              Consultar
            </button>
          </form>

          {foundCustomer ? (
            <section className="mx-auto mt-6 max-w-2xl border border-[#eab308]/45 bg-[#111115] p-5 sm:p-7">
              <div className="flex flex-col gap-5 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center border border-[#eab308]/40 bg-black text-3xl">
                    {foundCustomer.tier.badge}
                  </div>
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#eab308]">Membro F PAC</span>
                    <h3 className="mt-1 text-xl font-black uppercase">{sanitizePublicName(foundCustomer.customerName)}</h3>
                    <p className="text-[10px] uppercase tracking-wider text-white/35">Nível {foundCustomer.tier.name}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 border border-white/10 bg-black px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white/60">
                  <Trophy size={13} className="text-[#eab308]" /> #{foundCustomer.rankPositions.spent} no ranking
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 py-5">
                <div className="border border-white/10 bg-black/45 p-4">
                  <span className="text-[9px] font-black uppercase tracking-wider text-white/35">Compras válidas</span>
                  <p className="mt-1 text-2xl font-black">{foundCustomer.orderCount}</p>
                </div>
                <div className="border border-white/10 bg-black/45 p-4">
                  <span className="text-[9px] font-black uppercase tracking-wider text-white/35">Peças adquiridas</span>
                  <p className="mt-1 text-2xl font-black">{foundCustomer.itemsBoughtCount}</p>
                </div>
              </div>

              {foundCustomer.nextTier ? (
                <div className="border-t border-white/10 pt-5">
                  <div className="mb-2 flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
                    <span>Progresso para {foundCustomer.nextTier.name}</span>
                    <span className="text-[#eab308]">{foundCustomer.progressPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden bg-white/10">
                    <div className="h-full bg-[#eab308]" style={{ width: `${foundCustomer.progressPercent}%` }} />
                  </div>
                </div>
              ) : (
                <div className="border-t border-white/10 pt-5 text-xs font-bold uppercase text-sky-300">
                  Você alcançou o nível máximo do Clube F PAC.
                </div>
              )}

              <div className="mt-6">
                <h4 className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#eab308]">
                  <Gift size={14} /> Seus benefícios
                </h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  {foundCustomer.tier.benefits.map(benefit => (
                    <div key={benefit} className="flex items-start gap-2 border border-white/10 bg-black/35 p-3 text-xs leading-relaxed text-white/65">
                      <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#eab308]" />
                      {benefit}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : searchAttempted ? (
            <section className="mx-auto mt-6 max-w-2xl border border-white/10 bg-[#111115] p-7 text-center">
              <Lock size={22} className="mx-auto mb-3 text-white/30" />
              <p className="text-sm font-black uppercase">Nenhuma compra encontrada</p>
              <p className="mt-2 text-xs text-white/40">Confira o e-mail ou WhatsApp usado no pedido. Nenhum perfil fictício será exibido.</p>
            </section>
          ) : (
            <section className="mx-auto mt-6 flex max-w-2xl items-center gap-4 border border-white/10 bg-white/5 p-5">
              <ShoppingBag size={24} className="shrink-0 text-[#eab308]" />
              <div>
                <p className="text-xs font-black uppercase">Seu histórico forma seu nível</p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/40">Após localizar sua compra, você verá somente as informações essenciais do seu relacionamento com a marca.</p>
              </div>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
