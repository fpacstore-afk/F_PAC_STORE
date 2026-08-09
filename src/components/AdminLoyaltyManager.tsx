import React, { useState, useEffect } from 'react';
import { 
  Trophy, Award, Crown, Shield, Star, Zap, ShoppingBag, 
  Search, Filter, Send, MessageSquare, Mail, Gift, Tag, 
  ArrowUpRight, AlertCircle, Sparkles, RefreshCw, ChevronDown, 
  Sliders, TrendingUp, Users, Check, Copy, ExternalLink, Settings
} from 'lucide-react';
import { 
  DEFAULT_TIERS, 
  processCustomerLoyaltyList, 
  CustomerLoyaltyData, 
  LoyaltyTierConfig,
  getTierByAmount
} from '../constants/loyaltyConfig';
import { cn } from '../lib/utils';
import { useFinancialPrivacy } from '../context/FinancialPrivacyContext';

interface AdminLoyaltyManagerProps {
  orders: any[];
}

export default function AdminLoyaltyManager({ orders }: AdminLoyaltyManagerProps) {
  const { formatMoney, formatPercent, maskFinancial, showFinancialValues } = useFinancialPrivacy();
  const [tierConfigs, setTierConfigs] = useState<LoyaltyTierConfig[]>(() => {
    const saved = localStorage.getItem('fpac_loyalty_tiers');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return DEFAULT_TIERS;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>('all');
  const [selectedInactivityFilter, setSelectedInactivityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'total_spent' | 'order_count' | 'last_purchase' | 'average_ticket'>('total_spent');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLoyaltyData | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'table' | 'campaigns' | 'configs' | 'analytics'>('dashboard');

  // Modal / Message composer state
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerCustomer, setComposerCustomer] = useState<CustomerLoyaltyData | null>(null);
  const [composerType, setComposerType] = useState<'coupon' | 'launch' | 'return' | 'benefit' | 'custom'>('coupon');
  const [customMessage, setCustomMessage] = useState('');

  // Save configs handler
  const handleSaveConfigs = (newTiers: LoyaltyTierConfig[]) => {
    setTierConfigs(newTiers);
    localStorage.setItem('fpac_loyalty_tiers', JSON.stringify(newTiers));
    alert('Configurações do Programa de Fidelidade salvas com sucesso!');
  };

  // Process customer loyalty list
  const customers = processCustomerLoyaltyList(orders, tierConfigs);

  // Filtered & Sorted customers
  const filteredCustomers = customers.filter(c => {
    const query = searchTerm.toLowerCase().trim();
    const matchesSearch = !query || 
      c.customerName.toLowerCase().includes(query) || 
      c.email.toLowerCase().includes(query) || 
      c.phone.includes(query) ||
      c.city.toLowerCase().includes(query);

    if (!matchesSearch) return false;

    // Tier filter
    if (selectedTierFilter !== 'all') {
      if (selectedTierFilter === 'vip') {
        if (!c.isVip) return false;
      } else if (selectedTierFilter === 'prestes_a_subir') {
        if (!c.isPrestesASubir) return false;
      } else if (c.tier.id !== selectedTierFilter) {
        return false;
      }
    }

    // Inactivity filter
    if (selectedInactivityFilter === '30') {
      if (c.daysSinceLastPurchase < 30 || c.daysSinceLastPurchase >= 60) return false;
    } else if (selectedInactivityFilter === '60') {
      if (c.daysSinceLastPurchase < 60 || c.daysSinceLastPurchase >= 90) return false;
    } else if (selectedInactivityFilter === '90') {
      if (c.daysSinceLastPurchase < 90) return false;
    }

    return true;
  }).sort((a, b) => {
    if (sortBy === 'total_spent') return b.totalSpent - a.totalSpent;
    if (sortBy === 'order_count') return b.orderCount - a.orderCount;
    if (sortBy === 'average_ticket') return b.averageTicket - a.averageTicket;
    if (sortBy === 'last_purchase') {
      const timeA = a.lastPurchaseDate ? a.lastPurchaseDate.getTime() : 0;
      const timeB = b.lastPurchaseDate ? b.lastPurchaseDate.getTime() : 0;
      return timeB - timeA;
    }
    return 0;
  });

  // Key Dashboard Statistics
  const totalClients = customers.length;
  const bronzeCount = customers.filter(c => c.tier.id === 'bronze').length;
  const prataCount = customers.filter(c => c.tier.id === 'prata').length;
  const ouroCount = customers.filter(c => c.tier.id === 'ouro').length;
  const diamanteCount = customers.filter(c => c.tier.id === 'diamante').length;
  const topBuyer = customers.length > 0 ? customers[0] : null;
  const avgTicketGeneral = totalClients > 0 ? (customers.reduce((acc, c) => acc + c.totalSpent, 0) / customers.reduce((acc, c) => acc + c.orderCount, 0) || 0) : 0;
  const inactiveCount = customers.filter(c => c.isInactive).length;
  const prestesASubirCount = customers.filter(c => c.isPrestesASubir).length;
  const vipCount = customers.filter(c => c.isVip).length;

  // Smart suggestions generator
  const smartCampaigns = customers.filter(c => c.isPrestesASubir || c.daysSinceLastPurchase >= 45 || c.tier.id === 'diamante').slice(0, 8);

  // Helper to trigger WhatsApp with custom templates
  const triggerWhatsAppMessage = (customer: CustomerLoyaltyData, type: 'tier_up' | 'coupon' | 'launch' | 'return' | 'benefit' | 'custom', customMsgText?: string) => {
    const name = customer.customerName.split(' ')[0] || 'Cliente';
    let text = '';

    if (customMsgText) {
      text = customMsgText.replace(/{{nome_cliente}}/g, name);
    } else {
      switch (type) {
        case 'tier_up':
          text = `👕 *F PAC STORE • CLUBE F PAC* 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nParabéns *${name}*!\n\n🏆 *VOCÊ SUBIU DE NÍVEL!* 🏆\nVocê acaba de alcançar o nível *${customer.tier.name.toUpperCase()}* ${customer.tier.badge} no nosso programa de fidelidade!\n\nAgora você possui novos benefícios exclusivos:\n${customer.tier.benefits.map(b => `• ${b}`).join('\n')}\n\nAproveite no nosso site oficial:\nhttps://www.fpacstore.com.br/#/clube\n━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
          break;
        case 'coupon':
          text = `👕 *F PAC STORE • CUPOM ESPECIAL* 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nFala *${name}*!\n\nVocê é um cliente especial do nível *${customer.tier.name}* ${customer.tier.badge} e liberamos um cupom exclusivo de presente para sua próxima compra:\n\n🎟️ *CUPOM: FIDELIDADE10*\n👉 10% OFF em todo o site!\n\nGaranta no link:\nhttps://www.fpacstore.com.br/#/catalog\n━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
          break;
        case 'launch':
          text = `👕 *F PAC STORE • LANÇAMENTO EXCLUSIVO* 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nFala *${name}*!\n\nComo você é cliente VIP no nível *${customer.tier.name}* ${customer.tier.badge}, estamos te avisando em *PRIMEIRA MÃO* do novo Drop exclusivo de estampas da F PAC STORE!\n\n🔥 Confira antes de todo mundo no site:\nhttps://www.fpacstore.com.br/#/catalog\n━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
          break;
        case 'return':
          text = `👕 *F PAC STORE • SAUDADES!* 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nFala *${name}*! Tudo certo?\n\nSentimos sua falta nas últimas semanas! Preparamos um presente para você renovar seu kit de camisetas na F PAC STORE:\n\n🎁 *FRETE GRÁTIS + CUPOM VOLTAFPAC*\n\nAcesse e confira as novidades:\nhttps://www.fpacstore.com.br/#/catalog\n━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
          break;
        case 'benefit':
          text = `👕 *F PAC STORE • BENEFÍCIO DO NÍVEL ${customer.tier.name.toUpperCase()}* 👕\n━━━━━━━━━━━━━━━━━━━━━━━━━━━\nOlá *${name}*!\n\nLembrete especial: como membro do nível *${customer.tier.name}* ${customer.tier.badge}, você tem direito aos seguintes benefícios ativos:\n${customer.tier.benefits.map(b => `• ${b}`).join('\n')}\n\nDúvidas ou pedidos? Responda a esta mensagem para atendimento prioritário!\n━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
          break;
      }
    }

    const cleanPhone = customer.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-black text-white p-4 border-2 border-black">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            🏆 PROGRAMA DE FIDELIDADE <span className="text-[#eab308]">CLUBE F PAC</span>
          </h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            Gestão estratégica de clientes, níveis, gamificação e comunicação VIP
          </p>
        </div>

        {/* Subtab Navigation */}
        <div className="flex flex-wrap gap-1 bg-white/10 p-1 border border-white/10">
          <button 
            onClick={() => setActiveSubTab('dashboard')}
            className={cn("px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer", activeSubTab === 'dashboard' ? "bg-[#eab308] text-black font-black" : "text-white hover:bg-white/10")}
          >
            📊 Dashboard
          </button>
          <button 
            onClick={() => setActiveSubTab('table')}
            className={cn("px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer", activeSubTab === 'table' ? "bg-[#eab308] text-black font-black" : "text-white hover:bg-white/10")}
          >
            👥 Tabela ({customers.length})
          </button>
          <button 
            onClick={() => setActiveSubTab('campaigns')}
            className={cn("px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer", activeSubTab === 'campaigns' ? "bg-[#eab308] text-black font-black" : "text-white hover:bg-white/10")}
          >
            ⚡ Campanhas ({smartCampaigns.length})
          </button>
          <button 
            onClick={() => setActiveSubTab('configs')}
            className={cn("px-3 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer", activeSubTab === 'configs' ? "bg-[#eab308] text-black font-black" : "text-white hover:bg-white/10")}
          >
            ⚙️ Regras & Níveis
          </button>
        </div>
      </div>

      {/* SUBTAB 1: DASHBOARD OVERVIEW */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Tiers Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-amber-900/10 border-2 border-amber-700/40 p-4 relative overflow-hidden">
              <span className="text-3xl absolute right-2 top-2">🥉</span>
              <span className="text-[9px] font-black uppercase text-amber-800 tracking-widest block mb-1">Clientes Bronze</span>
              <span className="text-3xl font-black font-mono text-amber-900">{bronzeCount}</span>
              <span className="text-[8px] font-bold text-gray-500 block mt-1">Até R$ {tierConfigs[0]?.maxAmount}</span>
            </div>

            <div className="bg-slate-100 border-2 border-slate-300 p-4 relative overflow-hidden">
              <span className="text-3xl absolute right-2 top-2">🥈</span>
              <span className="text-[9px] font-black uppercase text-slate-700 tracking-widest block mb-1">Clientes Prata</span>
              <span className="text-3xl font-black font-mono text-slate-900">{prataCount}</span>
              <span className="text-[8px] font-bold text-gray-500 block mt-1">R$ {tierConfigs[1]?.minAmount} a R$ {tierConfigs[1]?.maxAmount}</span>
            </div>

            <div className="bg-amber-50 border-2 border-[#eab308] p-4 relative overflow-hidden">
              <span className="text-3xl absolute right-2 top-2">🥇</span>
              <span className="text-[9px] font-black uppercase text-amber-800 tracking-widest block mb-1">Clientes Ouro</span>
              <span className="text-3xl font-black font-mono text-black">{ouroCount}</span>
              <span className="text-[8px] font-bold text-gray-600 block mt-1">R$ {tierConfigs[2]?.minAmount} a R$ {tierConfigs[2]?.maxAmount}</span>
            </div>

            <div className="bg-sky-50 border-2 border-sky-400 p-4 relative overflow-hidden">
              <span className="text-3xl absolute right-2 top-2">💎</span>
              <span className="text-[9px] font-black uppercase text-sky-800 tracking-widest block mb-1">Clientes Diamante</span>
              <span className="text-3xl font-black font-mono text-sky-950">{diamanteCount}</span>
              <span className="text-[8px] font-bold text-sky-700 block mt-1">Acima de R$ {tierConfigs[3]?.minAmount}</span>
            </div>
          </div>

          {/* Secondary Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-black/10 p-4">
              <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest block mb-1">Total de Clientes</span>
              <span className="text-2xl font-black font-mono text-black">{totalClients}</span>
            </div>

            <div className="bg-white border border-black/10 p-4">
              <span className="text-[9px] font-black uppercase text-gray-500 tracking-widest block mb-1">Ticket Médio Geral</span>
              <span className="text-2xl font-black font-mono text-emerald-700">{formatMoney(avgTicketGeneral)}</span>
            </div>

            <div className="bg-amber-50 border border-amber-300 p-4">
              <span className="text-[9px] font-black uppercase text-amber-800 tracking-widest block mb-1">Prestes a Subir</span>
              <span className="text-2xl font-black font-mono text-amber-900">{prestesASubirCount}</span>
              <span className="text-[8px] font-bold text-amber-700 block">Faltam &lt; R$ 150</span>
            </div>

            <div className="bg-red-50 border border-red-200 p-4">
              <span className="text-[9px] font-black uppercase text-red-800 tracking-widest block mb-1">Inativos (+30 dias)</span>
              <span className="text-2xl font-black font-mono text-red-900">{inactiveCount}</span>
            </div>
          </div>

          {/* Top Buyer Banner */}
          {topBuyer && (
            <div className="bg-black text-[#eab308] border-2 border-black p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
              <div className="flex items-center gap-3">
                <span className="text-4xl">👑</span>
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/70 block">MAIOR COMPRADOR HISTÓRICO</span>
                  <h3 className="text-lg font-black uppercase text-white tracking-tight">{topBuyer.customerName}</h3>
                  <p className="text-xs text-gray-300 font-mono">
                    {topBuyer.email} • {topBuyer.city} • Nível {topBuyer.tier.name} {topBuyer.tier.badge}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 border-l border-white/20 pl-4">
                <div className="text-right">
                  <span className="text-[9px] font-black uppercase text-white/70 block">Total Gasto</span>
                  <span className="text-xl font-black font-mono text-[#eab308]">{formatMoney(topBuyer.totalSpent)}</span>
                </div>
                <button
                  onClick={() => triggerWhatsAppMessage(topBuyer, 'tier_up')}
                  className="bg-[#eab308] text-black px-4 py-2 text-[9px] font-black uppercase tracking-wider hover:bg-white transition-colors"
                >
                  Mensagem VIP WhatsApp
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: INTERACTIVE CUSTOMER TABLE & FILTERS */}
      {(activeSubTab === 'table' || activeSubTab === 'dashboard') && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white p-3 border border-black/10 shadow-xs flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input 
                type="text" 
                placeholder="Buscar por Nome, E-mail, Telefone ou Cidade..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-black/10 text-xs focus:outline-none focus:border-[#eab308]"
              />
            </div>

            {/* Tier Filter */}
            <select 
              value={selectedTierFilter}
              onChange={(e) => setSelectedTierFilter(e.target.value)}
              className="py-1.5 px-2.5 border border-black/10 text-[10px] font-black uppercase tracking-wider focus:outline-none cursor-pointer bg-white"
            >
              <option value="all">⚡ TODAS AS CATEGORIAS</option>
              <option value="bronze">🥉 BRONZE</option>
              <option value="prata">🥈 PRATA</option>
              <option value="ouro">🥇 OURO</option>
              <option value="diamante">💎 DIAMANTE</option>
              <option value="prestes_a_subir">🔥 PRESTES A SUBIR (&lt; R$ 150)</option>
              <option value="vip">⚜️ APENAS VIPs</option>
            </select>

            {/* Inactivity Filter */}
            <select 
              value={selectedInactivityFilter}
              onChange={(e) => setSelectedInactivityFilter(e.target.value)}
              className="py-1.5 px-2.5 border border-black/10 text-[10px] font-black uppercase tracking-wider focus:outline-none cursor-pointer bg-white"
            >
              <option value="all">⏳ TODOS OS TEMPOS DE RECORRÊNCIA</option>
              <option value="30">⏳ SEM COMPRA (30 A 59 DIAS)</option>
              <option value="60">⏳ SEM COMPRA (60 A 89 DIAS)</option>
              <option value="90">⚠️ INATIVOS (+90 DIAS)</option>
            </select>

            {/* Sort Filter */}
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="py-1.5 px-2.5 border border-black/10 text-[10px] font-black uppercase tracking-wider focus:outline-none cursor-pointer bg-white"
            >
              <option value="total_spent">📊 ORDENAR: MAIOR VALOR GASTO</option>
              <option value="order_count">📦 ORDENAR: MAIOR QTD PEDIDOS</option>
              <option value="average_ticket">💰 ORDENAR: MAIOR TICKET MÉDIO</option>
              <option value="last_purchase">📅 ORDENAR: COMPRA MAIS RECENTE</option>
            </select>
          </div>

          {/* Customer Table */}
          <div className="bg-white border border-black/10 overflow-x-auto shadow-xs">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-black text-white text-[9px] font-black uppercase tracking-widest border-b border-black">
                  <th className="p-3">Cliente</th>
                  <th className="p-3">Categoria & XP</th>
                  <th className="p-3">Pedidos / Total Gasto</th>
                  <th className="p-3">Ticket Médio</th>
                  <th className="p-3">Última Compra</th>
                  <th className="p-3">Evolução</th>
                  <th className="p-3 text-right">Ações WhatsApp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-gray-500 text-xs font-bold uppercase">
                      Nenhum cliente encontrado com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => (
                    <tr key={cust.key} className="hover:bg-gray-50/80 transition-colors">
                      <td className="p-3">
                        <div className="font-black text-black uppercase">{cust.customerName}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{cust.email}</div>
                        <div className="text-[10px] text-gray-400">{cust.phone} • {cust.city}</div>
                      </td>

                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 font-black text-xs uppercase px-2 py-0.5 rounded border" style={{ backgroundColor: `${cust.tier.color}15`, color: cust.tier.color, borderColor: cust.tier.color }}>
                          {cust.tier.badge} {cust.tier.name}
                        </span>
                        <div className="text-[9px] text-gray-500 font-mono font-bold mt-1">{cust.xp} XP acumulados</div>
                      </td>

                      <td className="p-3 font-mono">
                        <div className="font-black text-black text-xs">{cust.orderCount} {cust.orderCount === 1 ? 'pedido' : 'pedidos'}</div>
                        <div className="text-emerald-700 font-bold">{formatMoney(cust.totalSpent)}</div>
                      </td>

                      <td className="p-3 font-mono font-bold text-gray-800">
                        {formatMoney(cust.averageTicket)}
                      </td>

                      <td className="p-3">
                        <div className="font-bold text-xs">
                          {cust.lastPurchaseDate ? cust.lastPurchaseDate.toLocaleDateString('pt-BR') : 'Sem data'}
                        </div>
                        <div className={cn("text-[9px] font-mono font-bold", cust.isInactive ? "text-red-600" : "text-gray-500")}>
                          {cust.daysSinceLastPurchase} dias atrás
                        </div>
                      </td>

                      <td className="p-3 w-40">
                        <div className="text-[8px] font-bold uppercase text-gray-500 mb-0.5">
                          {cust.nextTier ? `Faltam R$ ${cust.amountNeededForNextTier.toFixed(0)} para ${cust.nextTier.name}` : 'Nível Máximo'}
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-[#eab308]" style={{ width: `${cust.progressPercent}%` }} />
                        </div>
                        <div className="text-[8px] text-right font-mono text-gray-400 mt-0.5">{cust.progressPercent}%</div>
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => triggerWhatsAppMessage(cust, 'tier_up')}
                            className="bg-emerald-600 text-white p-1.5 hover:bg-black transition-colors"
                            title="Notificar Nível / Categoria no WhatsApp"
                          >
                            <MessageSquare size={13} />
                          </button>
                          <button
                            onClick={() => triggerWhatsAppMessage(cust, 'coupon')}
                            className="bg-black text-[#eab308] p-1.5 hover:bg-[#eab308] hover:text-black transition-colors"
                            title="Enviar Cupom de Desconto Exclusivo"
                          >
                            <Tag size={13} />
                          </button>
                          <button
                            onClick={() => triggerWhatsAppMessage(cust, 'launch')}
                            className="bg-blue-600 text-white p-1.5 hover:bg-black transition-colors"
                            title="Avisar sobre Novo Lançamento"
                          >
                            <Sparkles size={13} />
                          </button>
                          <button
                            onClick={() => triggerWhatsAppMessage(cust, 'return')}
                            className="bg-amber-600 text-white p-1.5 hover:bg-black transition-colors"
                            title="Convidar para Nova Compra (Retorno)"
                          >
                            <Gift size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 3: SMART CAMPAIGN SUGGESTIONS */}
      {activeSubTab === 'campaigns' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-300 p-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-2">
              <Zap size={16} /> OPORTUNIDADES INTELIGENTES DE VENDAS RECORRENTES
            </h3>
            <p className="text-[10px] text-amber-800 mt-1">
              O sistema identifica automaticamente clientes prestes a subir de nível, inativos ou membros VIP para você disparar a oferta perfeita com 1 clique.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {smartCampaigns.map((cust) => (
              <div key={cust.key} className="bg-white border-2 border-black p-4 flex flex-col justify-between shadow-xs">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-black text-[#eab308]">
                      {cust.tier.badge} {cust.tier.name}
                    </span>
                    <span className="text-[9px] font-mono font-bold text-gray-500">
                      {cust.daysSinceLastPurchase} dias sem comprar
                    </span>
                  </div>

                  <h4 className="text-sm font-black uppercase text-black">{cust.customerName}</h4>
                  <p className="text-[10px] text-gray-500 font-mono mb-3">{cust.phone} • {cust.city}</p>

                  <div className="bg-gray-50 p-2.5 border border-gray-200 mb-4">
                    <span className="text-[8px] font-black uppercase tracking-wider text-[#eab308] block mb-0.5">Sugestão Automática:</span>
                    <p className="text-xs text-gray-800 font-bold leading-tight">
                      {cust.isPrestesASubir 
                        ? `Faltam apenas R$ ${cust.amountNeededForNextTier.toFixed(2)} para virar ${cust.nextTier?.name}! Sugestão: Enviar cupom de incentivo de 10%.`
                        : cust.daysSinceLastPurchase >= 45 
                          ? `Sem comprar há ${cust.daysSinceLastPurchase} dias. Sugestão: Convite de retorno com Frete Grátis.`
                          : `Membro Diamante altamente engajado! Sugestão: Convidar para acesso antecipado.`}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => triggerWhatsAppMessage(cust, cust.isPrestesASubir ? 'coupon' : 'return')}
                    className="flex-1 bg-emerald-600 text-white text-[9px] font-black uppercase py-2 hover:bg-black transition-colors flex items-center justify-center gap-1"
                  >
                    <MessageSquare size={12} /> Disparar WhatsApp
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUBTAB 4: CONFIGURATIONS & RULES */}
      {activeSubTab === 'configs' && (
        <div className="bg-white p-6 border-2 border-black space-y-6">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-black flex items-center gap-2">
              <Settings size={16} /> CONFIGURAR REGRAS E VALORES DE CATEGORIA
            </h3>
            <p className="text-[10px] text-gray-500 mt-1">
              Ajuste as metas financeiras para atingir cada nível do Programa de Fidelidade F PAC.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {tierConfigs.map((t, index) => (
              <div key={t.id} className="p-4 border border-black/20 bg-gray-50 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-300 pb-2">
                  <span className="text-xl">{t.badge}</span>
                  <span className="text-xs font-black uppercase text-black">{t.name}</span>
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-gray-600 block mb-1">Valor Mínimo Acumulado (R$):</label>
                  <input 
                    type="number"
                    value={t.minAmount}
                    onChange={(e) => {
                      const updated = [...tierConfigs];
                      updated[index].minAmount = Number(e.target.value);
                      setTierConfigs(updated);
                    }}
                    className="w-full p-2 border border-black/20 text-xs font-mono bg-white font-bold"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-gray-600 block mb-1">Descrição do Nível:</label>
                  <textarea 
                    value={t.description}
                    onChange={(e) => {
                      const updated = [...tierConfigs];
                      updated[index].description = e.target.value;
                      setTierConfigs(updated);
                    }}
                    rows={2}
                    className="w-full p-2 border border-black/20 text-xs bg-white"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-gray-200 text-right">
            <button
              onClick={() => handleSaveConfigs(tierConfigs)}
              className="bg-black text-[#eab308] border-2 border-black px-6 py-3 text-xs font-black uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-colors"
            >
              Salvar Configurações
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
