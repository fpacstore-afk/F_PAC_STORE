import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, Award, Crown, Shield, Star, Zap, ShoppingBag, 
  ChevronRight, ArrowRight, CheckCircle2, Lock, Sparkles, 
  Flame, Search, UserCheck, Gift, Truck, Tag, ExternalLink, HelpCircle,
  Share2, Users, Target, Check, RefreshCw, ShieldCheck
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { 
  DEFAULT_TIERS, 
  DEFAULT_ACHIEVEMENTS,
  DEFAULT_MISSIONS,
  processCustomerLoyaltyList, 
  getMultiRankings, 
  CustomerLoyaltyData,
  LoyaltyTierConfig,
  AchievementDef,
  MissionDef
} from '../constants/loyaltyConfig';
import { Link } from 'react-router-dom';
import DigitalMemberCard from '../components/DigitalMemberCard';

export default function ClubeFPAC() {
  const { user } = useAuth();
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKey, setSearchKey] = useState('');
  const [foundCustomer, setFoundCustomer] = useState<CustomerLoyaltyData | null>(null);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'rankings' | 'hall' | 'missions' | 'tiers'>('profile');
  const [selectedRankingCategory, setSelectedRankingCategory] = useState<'compradores' | 'xp' | 'produtos' | 'historicos' | 'conquistas'>('compradores');

  // Claim mission feedback message
  const [missionClaimedMsg, setMissionClaimedMsg] = useState<string | null>(null);

  // Fetch orders from Firestore for real-time ranking & client profile
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'orders'), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllOrders(docs);
      setLoading(false);
    }, (error) => {
      console.warn('Firestore fallback on loyalty page:', error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const loyaltyList = processCustomerLoyaltyList(allOrders, DEFAULT_TIERS, DEFAULT_ACHIEVEMENTS, DEFAULT_MISSIONS);
  const rankings = getMultiRankings(allOrders, DEFAULT_TIERS, 10);

  // Auto-detect logged in user profile
  useEffect(() => {
    if (user && loyaltyList.length > 0) {
      const uEmail = (user.email || '').toLowerCase().trim();
      const matched = loyaltyList.find(c => c.email.toLowerCase().trim() === uEmail || c.customerName.toLowerCase().includes(uEmail));
      if (matched) {
        setFoundCustomer(matched);
      }
    }
  }, [user, allOrders]);

  const handleSearchCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchKey.trim()) return;

    setSearchAttempted(true);
    const query = searchKey.toLowerCase().trim();
    const matched = loyaltyList.find(c => 
      c.email.toLowerCase().trim() === query || 
      c.phone.replace(/\D/g, '') === query.replace(/\D/g, '') ||
      c.customerName.toLowerCase().includes(query)
    );

    setFoundCustomer(matched || null);
  };

  const handleClaimMission = (mission: MissionDef) => {
    setMissionClaimedMsg(`🎯 Missão "${mission.title}" ativada! +${mission.xpReward} XP adicionados ao seu saldo.`);
    setTimeout(() => setMissionClaimedMsg(null), 4000);
  };

  // Filter VIP Wall members (Gold & Diamond)
  const vipWallMembers = loyaltyList.filter(c => c.tier.id === 'diamante' || c.tier.id === 'ouro');

  return (
    <div className="min-h-screen bg-[#0d0d12] text-white pt-8 md:pt-12 pb-16 selection:bg-[#eab308] selection:text-black">
      {/* STREETWEAR GAMIFIED HERO BANNER */}
      <section className="relative overflow-hidden border-b border-white/10 bg-gradient-to-b from-black via-[#121218] to-[#0d0d12] py-10 md:py-16 px-4 sm:px-6 lg:px-8">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-[#eab308]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto relative z-10 text-center">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 bg-white/5 border border-[#eab308]/40 px-3.5 py-1 rounded-full text-[10px] md:text-xs font-black uppercase tracking-[0.25em] text-[#eab308] mb-4 shadow-lg shadow-[#eab308]/10"
          >
            <Crown size={14} className="animate-bounce" />
            SISTEMA GAMIFICADO DE FIDELIDADE PREMIUM
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-3xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight text-white mb-3 leading-none"
          >
            CLUBE <span className="text-[#eab308] underline decoration-4 underline-offset-4">F PAC</span>
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-gray-400 text-xs md:text-sm max-w-2xl mx-auto font-medium uppercase tracking-wider mb-6"
          >
            Muito além de um clube de descontos. Um universo de status, evolução, conquistas, privilégios exclusivos e pertencimento à elite F PAC STORE.
          </motion.p>

          {/* Evolution Flow Bar */}
          <div className="max-w-3xl mx-auto bg-black/60 border border-white/10 p-3 sm:p-4 rounded-2xl mb-8 flex items-center justify-between gap-2 text-center text-[10px] sm:text-xs font-black uppercase tracking-widest">
            <div className="flex-1 text-amber-600 font-bold">🥉 BRONZE</div>
            <div className="text-gray-600">→</div>
            <div className="flex-1 text-slate-300 font-bold">🥈 PRATA</div>
            <div className="text-gray-600">→</div>
            <div className="flex-1 text-[#eab308] font-bold">🥇 OURO</div>
            <div className="text-gray-600">→</div>
            <div className="flex-1 text-sky-400 font-bold animate-pulse">💎 DIAMANTE</div>
          </div>

          {/* Tab Navigation Controls */}
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-4xl mx-auto">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'profile' ? 'bg-[#eab308] text-black shadow-lg shadow-[#eab308]/20' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              }`}
            >
              <UserCheck size={14} /> Meu Perfil & Cartão
            </button>

            <button
              onClick={() => setActiveTab('rankings')}
              className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'rankings' ? 'bg-[#eab308] text-black shadow-lg shadow-[#eab308]/20' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              }`}
            >
              <Trophy size={14} /> Multi-Rankings
            </button>

            <button
              onClick={() => setActiveTab('hall')}
              className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'hall' ? 'bg-[#eab308] text-black shadow-lg shadow-[#eab308]/20' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              }`}
            >
              <Crown size={14} /> Hall da Fama
            </button>

            <button
              onClick={() => setActiveTab('missions')}
              className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'missions' ? 'bg-[#eab308] text-black shadow-lg shadow-[#eab308]/20' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              }`}
            >
              <Target size={14} /> Central de Missões
            </button>

            <button
              onClick={() => setActiveTab('tiers')}
              className={`px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'tiers' ? 'bg-[#eab308] text-black shadow-lg shadow-[#eab308]/20' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              }`}
            >
              <Award size={14} /> Níveis & Benefícios
            </button>
          </div>
        </div>
      </section>

      {/* MISSION CLAIM FEEDBACK TOAST */}
      <AnimatePresence>
        {missionClaimedMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#eab308] text-black px-6 py-3 rounded-full font-black text-xs uppercase tracking-wider shadow-2xl border-2 border-black flex items-center gap-2"
          >
            <Zap size={16} /> {missionClaimedMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SECTION 1: PROFILE & DIGITAL CARD LOOKUP */}
      {activeTab === 'profile' && (
        <section className="py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#eab308] block mb-1">PERFIL VIP DO MEMBRO</span>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Consulte Seu Status & Cartão Digital</h2>
            <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
              Digite seu e-mail ou WhatsApp para acessar seu perfil completo, nível de XP, conquistas desbloqueadas e cartão digital oficial.
            </p>
          </div>

          {/* Search Bar Input */}
          <div className="bg-white/5 border border-white/10 p-6 rounded-2xl mb-8 max-w-2xl mx-auto shadow-xl">
            <form onSubmit={handleSearchCustomer} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text"
                  placeholder="E-mail ou WhatsApp de compra..."
                  value={searchKey}
                  onChange={(e) => setSearchKey(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-black/60 border border-white/20 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#eab308] uppercase tracking-wider rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="bg-[#eab308] text-black font-black uppercase tracking-widest px-6 py-3 text-xs hover:bg-white transition-all cursor-pointer shrink-0 rounded-lg"
              >
                Consultar
              </button>
            </form>
          </div>

          {/* FOUND CUSTOMER FULL PROFILE DISPLAY */}
          {foundCustomer ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              {/* TOP HEADER CARD */}
              <div className="bg-gradient-to-b from-[#161622] to-[#0f0f18] border-2 border-[#eab308] rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-[#eab308] text-black text-[9px] font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-xl flex items-center gap-1">
                  <ShieldCheck size={12} /> MEMBRO VERIFICADO #{foundCustomer.rankPositions.spent}
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8 pb-6 border-b border-white/10">
                  <div className="flex items-center gap-4">
                    {/* Animated Avatar / Badge ring */}
                    <div className="relative">
                      <div className="w-16 h-16 rounded-2xl bg-black border-2 border-[#eab308] flex items-center justify-center text-3xl shadow-lg">
                        {foundCustomer.tier.badge}
                      </div>
                      <span className="absolute -bottom-1 -right-1 bg-[#eab308] text-black text-[9px] font-black font-mono px-1.5 py-0.5 rounded">
                        L{foundCustomer.xpLevel}
                      </span>
                    </div>

                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#eab308] mb-0.5">Membro Oficial F PAC</p>
                      <h3 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white">{foundCustomer.customerName}</h3>
                      <p className="text-xs text-gray-400 font-mono">{foundCustomer.email} • {foundCustomer.city}</p>
                    </div>
                  </div>

                  <div className="bg-black/60 border border-white/10 p-4 rounded-2xl flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Número de Membro</span>
                      <span className="text-lg font-black font-mono text-[#eab308]">{foundCustomer.memberNumber}</span>
                      <span className="text-[9px] text-gray-500 block uppercase">{foundCustomer.tier.tagline}</span>
                    </div>
                  </div>
                </div>

                {/* DUAL PROGRESS BARS (Financial Tier & XP Level) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  {/* Financial Tier Progress */}
                  <div className="bg-black/40 border border-white/10 p-5 rounded-2xl">
                    <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider mb-2">
                      <span className="text-amber-400">Progresso de Categoria</span>
                      <span className="font-mono text-white">{foundCustomer.progressPercent}%</span>
                    </div>

                    <div className="h-3 bg-white/10 rounded-full overflow-hidden p-0.5 mb-3">
                      <div 
                        className="h-full bg-gradient-to-r from-amber-600 to-[#eab308] rounded-full transition-all duration-1000"
                        style={{ width: `${foundCustomer.progressPercent}%` }}
                      />
                    </div>

                    <p className="text-xs text-gray-300">
                      {foundCustomer.nextTier ? (
                        <>
                          Você está a apenas <strong className="text-[#eab308] font-mono">R$ {foundCustomer.amountNeededForNextTier.toFixed(0)}</strong> do próximo nível <strong>{foundCustomer.nextTier.name} {foundCustomer.nextTier.badge}</strong>.
                        </>
                      ) : (
                        <>
                          🎉 Você atingiu o nível supremo <strong>Diamante</strong>!
                        </>
                      )}
                    </p>
                  </div>

                  {/* XP Level Progress */}
                  <div className="bg-black/40 border border-white/10 p-5 rounded-2xl">
                    <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider mb-2">
                      <span className="text-sky-400">Nível de XP ({foundCustomer.xpLevel})</span>
                      <span className="font-mono text-white">{foundCustomer.xpProgressPercent}%</span>
                    </div>

                    <div className="h-3 bg-white/10 rounded-full overflow-hidden p-0.5 mb-3">
                      <div 
                        className="h-full bg-gradient-to-r from-sky-500 to-cyan-400 rounded-full transition-all duration-1000"
                        style={{ width: `${foundCustomer.xpProgressPercent}%` }}
                      />
                    </div>

                    <p className="text-xs text-gray-300">
                      Saldo total: <strong className="text-sky-300 font-mono">{foundCustomer.xp.toLocaleString('pt-BR')} XP</strong>. Faltam <strong className="text-sky-300 font-mono">{foundCustomer.xpForNextLevel - foundCustomer.xp} XP</strong> para alcançar o Nível {foundCustomer.xpLevel + 1}!
                    </p>
                  </div>
                </div>

                {/* METRICS GRID */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                  <div className="bg-black/40 border border-white/10 p-3.5 rounded-xl text-center">
                    <span className="text-[9px] font-black uppercase text-gray-400 block mb-1">Total XP</span>
                    <span className="text-xl font-black font-mono text-[#eab308]">{foundCustomer.xp} XP</span>
                  </div>
                  <div className="bg-black/40 border border-white/10 p-3.5 rounded-xl text-center">
                    <span className="text-[9px] font-black uppercase text-gray-400 block mb-1">Pedidos</span>
                    <span className="text-xl font-black font-mono text-white">{foundCustomer.orderCount}</span>
                  </div>
                  <div className="bg-black/40 border border-white/10 p-3.5 rounded-xl text-center">
                    <span className="text-[9px] font-black uppercase text-gray-400 block mb-1">Peças Oficial</span>
                    <span className="text-xl font-black font-mono text-[#eab308]">{foundCustomer.itemsBoughtCount}</span>
                  </div>
                  <div className="bg-black/40 border border-white/10 p-3.5 rounded-xl text-center">
                    <span className="text-[9px] font-black uppercase text-gray-400 block mb-1">Ranking Gasto</span>
                    <span className="text-xl font-black font-mono text-sky-400">#{foundCustomer.rankPositions.spent}</span>
                  </div>
                </div>

                {/* ACHIEVEMENTS GRID */}
                <div className="mb-8">
                  <h4 className="text-xs font-black uppercase tracking-widest text-[#eab308] mb-4 flex items-center gap-2">
                    <Award size={16} /> Suas Conquistas & Selos Desbloqueados ({foundCustomer.achievements.filter(a => a.unlocked).length}/{foundCustomer.achievements.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                    {foundCustomer.achievements.map((ach) => (
                      <div 
                        key={ach.id}
                        className={`p-3 border rounded-xl flex flex-col items-center text-center transition-all ${
                          ach.unlocked ? 'bg-white/10 border-[#eab308]/60 text-white shadow-lg shadow-[#eab308]/5' : 'bg-black/40 border-white/5 opacity-40 grayscale'
                        }`}
                      >
                        <span className="text-2xl mb-1">{ach.icon}</span>
                        <span className="text-[10px] font-black uppercase tracking-tight">{ach.title}</span>
                        <span className="text-[8px] text-gray-400 mt-1 leading-tight">{ach.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* UNLOCKED BENEFITS LIST */}
                <div>
                  <h4 className="text-xs font-black uppercase tracking-widest text-[#eab308] mb-3 flex items-center gap-2">
                    <Sparkles size={16} /> Benefícios Ativos do Seu Nível ({foundCustomer.tier.name})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {foundCustomer.tier.benefits.map((benefit, bIdx) => (
                      <div key={bIdx} className="bg-black/40 border border-white/10 p-2.5 rounded-lg flex items-center gap-2 text-xs text-gray-200">
                        <CheckCircle2 size={14} className="text-[#eab308] shrink-0" />
                        <span>{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* DIGITAL CARD PREVIEW CONTAINER */}
              <div className="bg-[#12121c] border border-white/10 p-6 rounded-3xl text-center space-y-4">
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#eab308] block">CARTÃO DIGITAL INTERATIVO</span>
                <h3 className="text-xl font-black uppercase tracking-tight">Seu Passaporte Digital de Membro</h3>
                <p className="text-xs text-gray-400 max-w-lg mx-auto">
                  Exiba seu status na comunidade F PAC. Copie as informações e compartilhe seu cartão digital nas redes sociais ou com amigos.
                </p>

                <DigitalMemberCard customer={foundCustomer} />
              </div>
            </motion.div>
          ) : searchAttempted ? (
            <div className="bg-red-950/30 border border-red-800/50 p-6 text-center rounded-2xl max-w-xl mx-auto">
              <p className="text-sm font-bold text-red-200 uppercase tracking-wide">Nenhum histórico de compras encontrado.</p>
              <p className="text-xs text-gray-400 mt-1">Verifique se utilizou o e-mail/telefone correto ou realize seu primeiro pedido para ingressar no movimento F PAC!</p>
              <Link to="/catalog" className="inline-block mt-4 bg-[#eab308] text-black font-black uppercase tracking-widest px-6 py-2.5 text-xs font-bold rounded-lg">
                Fazer Primeira Compra
              </Link>
            </div>
          ) : null}
        </section>
      )}

      {/* SECTION 2: MULTI-RANKINGS (TOP 10) */}
      {activeTab === 'rankings' && (
        <section className="py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#eab308] block mb-1">CLASSIFICAÇÃO OFICIAL</span>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Multi-Rankings da Comunidade</h2>
            <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
              Confira os líderes da comunidade F PAC divididos por categorias de engajamento e prestígio.
            </p>
          </div>

          {/* Ranking Category Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
            <button
              onClick={() => setSelectedRankingCategory('compradores')}
              className={`px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                selectedRankingCategory === 'compradores' ? 'bg-[#eab308] text-black' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              }`}
            >
              👑 Top Compradores
            </button>
            <button
              onClick={() => setSelectedRankingCategory('xp')}
              className={`px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                selectedRankingCategory === 'xp' ? 'bg-[#eab308] text-black' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              }`}
            >
              ⚡ Maior XP
            </button>
            <button
              onClick={() => setSelectedRankingCategory('produtos')}
              className={`px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                selectedRankingCategory === 'produtos' ? 'bg-[#eab308] text-black' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              }`}
            >
              👕 Mais Produtos
            </button>
            <button
              onClick={() => setSelectedRankingCategory('historicos')}
              className={`px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                selectedRankingCategory === 'historicos' ? 'bg-[#eab308] text-black' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              }`}
            >
              ⭐ Membros Históricos
            </button>
            <button
              onClick={() => setSelectedRankingCategory('conquistas')}
              className={`px-3.5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                selectedRankingCategory === 'conquistas' ? 'bg-[#eab308] text-black' : 'bg-white/5 border border-white/10 text-white hover:bg-white/10'
              }`}
            >
              🏆 Mais Conquistas
            </button>
          </div>

          {/* Ranking List Table */}
          <div className="bg-[#12121a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="divide-y divide-white/5">
              {loading ? (
                <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase animate-pulse">
                  Carregando rankings oficiais...
                </div>
              ) : (() => {
                let currentList: any[] = [];
                if (selectedRankingCategory === 'compradores') currentList = rankings.topCompradores;
                else if (selectedRankingCategory === 'xp') currentList = rankings.maiorXp;
                else if (selectedRankingCategory === 'produtos') currentList = rankings.maisProdutos;
                else if (selectedRankingCategory === 'historicos') currentList = rankings.membrosHistoricos;
                else if (selectedRankingCategory === 'conquistas') currentList = rankings.maisConquistas;

                if (currentList.length === 0) {
                  return (
                    <div className="p-8 text-center text-gray-500 text-xs font-bold uppercase">
                      Nenhum membro registrado na categoria ainda.
                    </div>
                  );
                }

                return currentList.map((rank) => (
                  <div 
                    key={rank.position}
                    className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-black font-mono w-8 text-center">
                        {rank.medalSymbol}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black uppercase text-white tracking-wide">
                            {rank.publicName}
                          </span>
                          <span className="text-xs" title={rank.tierName}>
                            {rank.badge}
                          </span>
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                          {rank.memberNumber} • {rank.city}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="bg-white/5 border border-white/10 px-3 py-1 rounded-md text-xs font-mono font-black text-[#eab308] uppercase tracking-wider">
                        {rank.metricValue}
                      </span>
                    </div>
                  </div>
                ));
              })()}
            </div>

            <div className="p-3 bg-black/40 border-t border-white/5 text-center text-[9px] uppercase tracking-widest text-gray-500 font-bold">
              🛡️ Por privacidade e conformidade, os nomes são exibidos no formato público protegido.
            </div>
          </div>
        </section>
      )}

      {/* SECTION 3: HALL DA FAMA & PAREDE DIGITAL */}
      {activeTab === 'hall' && (
        <section className="py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#eab308] block mb-1">RECONHECIMENTO MÁXIMO</span>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Hall da Fama F PAC</h2>
            <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
              Membros de elite das categorias Ouro e Diamante eternizados na Parede Digital oficial da marca.
            </p>
          </div>

          {/* Diamond Elite Cards */}
          <div className="mb-10">
            <h3 className="text-xs font-black uppercase tracking-widest text-sky-400 mb-4 flex items-center gap-2">
              <Sparkles size={16} /> Membros da Elite Diamante
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {vipWallMembers.filter(m => m.tier.id === 'diamante').length === 0 ? (
                <div className="col-span-2 bg-sky-950/20 border border-sky-800/40 p-6 rounded-2xl text-center text-xs text-sky-300 uppercase font-bold">
                  💎 Torne-se o primeiro membro da Elite Diamante atingindo R$ 2.000 em compras acumuladas!
                </div>
              ) : (
                vipWallMembers.filter(m => m.tier.id === 'diamante').map((member) => (
                  <div key={member.key} className="bg-gradient-to-r from-sky-950/40 via-slate-900 to-black border-2 border-sky-400 p-5 rounded-2xl shadow-xl flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-sky-400 text-black flex items-center justify-center font-black text-2xl shrink-0">
                      💎
                    </div>
                    <div>
                      <span className="text-[9px] font-mono font-bold text-sky-400 block">{member.memberNumber}</span>
                      <h4 className="text-base font-black uppercase text-white">{member.customerName}</h4>
                      <p className="text-[10px] text-gray-400 font-mono">{member.xp.toLocaleString('pt-BR')} XP • {member.city}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Parede Digital de Membros Ouro e Diamante */}
          <div className="bg-[#12121a] border border-white/10 p-6 rounded-2xl">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#eab308] mb-2 flex items-center gap-2">
              <Crown size={16} /> Parede Digital de Membros VIP (Ouro & Diamante)
            </h3>
            <p className="text-xs text-gray-400 mb-6">
              Membros que ajudam a construir a história da F PAC STORE.
            </p>

            <div className="flex flex-wrap gap-2">
              {vipWallMembers.length === 0 ? (
                <p className="text-xs text-gray-500 uppercase font-bold">Em breve, novos membros Ouro e Diamante figurarão aqui.</p>
              ) : (
                vipWallMembers.map((vip) => (
                  <span 
                    key={vip.key} 
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-black uppercase tracking-wider font-mono ${
                      vip.tier.id === 'diamante' ? 'bg-sky-500/10 border-sky-400 text-sky-300' : 'bg-amber-500/10 border-[#eab308] text-[#eab308]'
                    }`}
                  >
                    <span>{vip.tier.badge}</span>
                    <span>{vip.customerName}</span>
                    <span className="opacity-60 text-[9px]">({vip.memberNumber})</span>
                  </span>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {/* SECTION 4: MISSIONS CENTER */}
      {activeTab === 'missions' && (
        <section className="py-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#eab308] block mb-1">CONQUISTE XP DIÁRIO</span>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Central de Missões & Recompensas</h2>
            <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
              Complete missões interativas no site para acumular XP, evoluir de nível e desbloquear novas vantagens.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEFAULT_MISSIONS.map((mission) => (
              <div 
                key={mission.id}
                className="bg-white/5 border border-white/10 p-5 rounded-2xl flex flex-col justify-between hover:border-[#eab308]/50 transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-2xl">{mission.icon}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-[#eab308]/10 text-[#eab308] border border-[#eab308]/30 font-mono font-black text-xs">
                      +{mission.xpReward} XP
                    </span>
                  </div>

                  <h3 className="text-base font-black uppercase text-white mb-1">{mission.title}</h3>
                  <p className="text-xs text-gray-400 leading-relaxed mb-4">{mission.description}</p>
                </div>

                <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider">
                    Categoria: {mission.category}
                  </span>

                  {mission.actionUrl ? (
                    <Link
                      to={mission.actionUrl}
                      className="bg-white/10 hover:bg-[#eab308] hover:text-black transition-colors text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg flex items-center gap-1"
                    >
                      Realizar Missão <ArrowRight size={12} />
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleClaimMission(mission)}
                      className="bg-[#eab308] text-black hover:bg-white transition-colors text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg cursor-pointer flex items-center gap-1"
                    >
                      Ativar Missão <Zap size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* SECTION 5: FULL CATEGORY TIERS & PRIVILEGES */}
      {activeTab === 'tiers' && (
        <section className="py-10 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#eab308] block mb-1">PRIVILÉGIOS CUMULATIVOS</span>
            <h2 className="text-2xl md:text-4xl font-black uppercase tracking-tight">Estrutura Completa de Níveis</h2>
            <p className="text-xs text-gray-400 max-w-lg mx-auto mt-1">
              Nenhum benefício é perdido ao subir de nível. Cada nova patente mantém os privilégios anteriores e adiciona novas vantagens exclusivas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {DEFAULT_TIERS.map((tier) => (
              <div 
                key={tier.id}
                className={`bg-white/5 border ${tier.borderColor} p-6 rounded-2xl flex flex-col justify-between relative group hover:scale-[1.01] transition-all duration-300`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-3xl">{tier.badge}</span>
                    <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded bg-white/10 text-white font-mono">
                      {tier.maxAmount ? `Até R$ ${tier.maxAmount}` : `Acima de R$ ${tier.minAmount}`}
                    </span>
                  </div>

                  <h3 className="text-xl font-black uppercase tracking-tight mb-0.5" style={{ color: tier.color }}>
                    {tier.name}
                  </h3>
                  <span className="text-[10px] font-bold text-[#eab308] block mb-2">{tier.tagline}</span>

                  <p className="text-[10px] text-gray-400 mb-4 leading-relaxed">
                    {tier.description}
                  </p>

                  <div className="space-y-2 border-t border-white/10 pt-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[#eab308] block mb-1">
                      Benefícios do Nível:
                    </span>
                    {tier.benefits.map((b, idx) => (
                      <div key={idx} className="flex items-start gap-1.5 text-xs text-gray-300">
                        <CheckCircle2 size={13} className="text-[#eab308] shrink-0 mt-0.5" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 pt-3 border-t border-white/10 text-center">
                  <Link 
                    to="/catalog" 
                    className="inline-block w-full py-2.5 bg-white/10 hover:bg-[#eab308] hover:text-black transition-colors text-[10px] font-black uppercase tracking-widest text-white rounded-lg"
                  >
                    Evoluir Para Este Nível
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
