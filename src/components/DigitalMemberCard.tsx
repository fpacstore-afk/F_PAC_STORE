import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Sparkles, Share2, Copy, Check, Download, ShieldCheck, Zap } from 'lucide-react';
import { CustomerLoyaltyData } from '../constants/loyaltyConfig';

interface DigitalMemberCardProps {
  customer: CustomerLoyaltyData;
}

export default function DigitalMemberCard({ customer }: DigitalMemberCardProps) {
  const [copied, setCopied] = useState(false);

  const getTierStyles = (tierId: string) => {
    switch (tierId) {
      case 'diamante':
        return {
          cardBg: 'bg-gradient-to-tr from-slate-950 via-sky-950 to-cyan-900 border-2 border-sky-400/80 shadow-[0_0_30px_rgba(56,189,248,0.3)]',
          badgeColor: 'bg-sky-400 text-black',
          textColor: 'text-sky-300',
          foilEffect: 'from-sky-400/20 via-cyan-300/10 to-transparent',
          neonGlow: 'shadow-sky-500/50'
        };
      case 'ouro':
        return {
          cardBg: 'bg-gradient-to-tr from-stone-950 via-amber-950 to-yellow-900 border-2 border-[#eab308]/80 shadow-[0_0_30px_rgba(234,179,8,0.25)]',
          badgeColor: 'bg-[#eab308] text-black',
          textColor: 'text-[#eab308]',
          foilEffect: 'from-[#eab308]/20 via-yellow-200/10 to-transparent',
          neonGlow: 'shadow-amber-500/50'
        };
      case 'prata':
        return {
          cardBg: 'bg-gradient-to-tr from-slate-950 via-slate-900 to-gray-800 border-2 border-slate-300/80 shadow-[0_0_20px_rgba(203,213,225,0.2)]',
          badgeColor: 'bg-slate-200 text-black',
          textColor: 'text-slate-200',
          foilEffect: 'from-slate-200/20 via-gray-100/10 to-transparent',
          neonGlow: 'shadow-slate-400/30'
        };
      default: // bronze
        return {
          cardBg: 'bg-gradient-to-tr from-neutral-950 via-stone-900 to-amber-950 border-2 border-amber-800/80 shadow-[0_0_20px_rgba(180,83,9,0.2)]',
          badgeColor: 'bg-amber-700 text-white',
          textColor: 'text-amber-500',
          foilEffect: 'from-amber-700/20 via-orange-300/10 to-transparent',
          neonGlow: 'shadow-amber-800/30'
        };
    }
  };

  const style = getTierStyles(customer.tier.id);

  const handleShareCard = () => {
    const cardText = `═══════════════════════\n👕 F PAC STORE • CLUBE VIP 👕\n${customer.tier.badge} ${customer.memberNumber}\n\n👤 Nome: ${customer.customerName}\n🏆 Nível: ${customer.tier.name.toUpperCase()}\n⭐ XP Total: ${customer.xp.toLocaleString('pt-BR')} XP (Nív. ${customer.xpLevel})\n🥇 Ranking: #${customer.rankPositions.spent} Top Compradores\n📅 Membro desde: ${customer.firstPurchaseDate ? customer.firstPurchaseDate.getFullYear() : '2026'}\n\nFaça parte da comunidade streetwear F PAC!\nhttps://www.fpacstore.com.br/#/clube\n═══════════════════════`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(cardText);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="space-y-4">
      {/* CARD FRAME */}
      <motion.div 
        whileHover={{ scale: 1.01, rotateY: 2 }}
        transition={{ type: "spring", stiffness: 300 }}
        className={`relative w-full max-w-md mx-auto aspect-[1.586/1] rounded-2xl p-5 sm:p-6 text-white flex flex-col justify-between overflow-hidden select-none cursor-pointer ${style.cardBg}`}
      >
        {/* Holographic foil shimmer */}
        <div className={`absolute inset-0 bg-gradient-to-tr ${style.foilEffect} pointer-events-none opacity-60 mix-blend-overlay`} />
        
        {/* TOP ROW */}
        <div className="flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-black/60 border border-white/20 flex items-center justify-center font-black text-sm">
              F
            </div>
            <div>
              <span className="text-[10px] font-black tracking-[0.25em] text-white/90 block leading-tight">CLUBE F PAC</span>
              <span className="text-[8px] font-mono uppercase text-white/60 tracking-widest block">MEMBRO OFICIAL</span>
            </div>
          </div>

          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider font-mono flex items-center gap-1 ${style.badgeColor}`}>
            {customer.tier.badge} {customer.tier.name}
          </span>
        </div>

        {/* MIDDLE SECTION - CHIP & MEMBER NUMBER */}
        <div className="my-auto py-2 relative z-10 flex items-center justify-between">
          <div>
            <span className="text-[8px] font-mono uppercase text-gray-400 block tracking-widest mb-0.5">IDENTIFICAÇÃO DE MEMBRO</span>
            <div className={`text-xl sm:text-2xl font-black font-mono tracking-wider ${style.textColor}`}>
              {customer.memberNumber}
            </div>
          </div>

          {/* Hologram Emblem */}
          <div className="w-10 h-10 rounded-full border border-white/30 bg-gradient-to-br from-white/20 via-transparent to-black/80 flex items-center justify-center text-lg shadow-inner">
            <Sparkles size={18} className="text-white/80 animate-pulse" />
          </div>
        </div>

        {/* BOTTOM ROW - DETAILS */}
        <div className="relative z-10 pt-2 border-t border-white/10 flex items-end justify-between text-left">
          <div>
            <span className="text-[8px] font-mono text-gray-400 uppercase tracking-wider block">NOME DO MEMBRO</span>
            <h4 className="text-sm font-black uppercase tracking-tight text-white line-clamp-1">
              {customer.customerName}
            </h4>
          </div>

          <div className="text-right font-mono">
            <span className="text-[8px] font-mono text-gray-400 uppercase tracking-wider block">XP & NÍVEL</span>
            <span className="text-xs font-black text-white">
              {customer.xp.toLocaleString('pt-BR')} XP <span className={style.textColor}>(Nível {customer.xpLevel})</span>
            </span>
          </div>
        </div>
      </motion.div>

      {/* SHARE ACTIONS */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={handleShareCard}
          className="bg-[#eab308] text-black font-black uppercase tracking-widest px-5 py-2.5 text-xs hover:bg-white transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-[#eab308]/20"
        >
          {copied ? <Check size={14} /> : <Share2 size={14} />}
          {copied ? 'Cartão Copiado!' : 'Compartilhar Cartão Digital'}
        </button>
      </div>
    </div>
  );
}
