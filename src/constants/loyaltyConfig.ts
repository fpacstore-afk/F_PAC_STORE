import { aggregateCustomerPurchases, comparePurchaseTotals, orderDate, purchasedQuantity } from '../../shared/customerPurchases';

export interface LoyaltyTierConfig {
  id: 'bronze' | 'prata' | 'ouro' | 'diamante';
  name: string;
  badge: string;
  symbol: string;
  color: string;
  bgColor: string;
  borderColor: string;
  minAmount: number;
  maxAmount: number | null;
  tagline: string;
  description: string;
  benefits: string[];
  animatedBadge?: boolean;
}

export interface LoyaltyRuleConfig {
  xpPerReais: number;
  xpPerOrder: number;
  xpPerReview: number;
  xpPerReferral: number;
  xpPerShare: number;
  xpPerBirthday: number;
  inactivityDaysThreshold: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  icon: string;
  desc: string;
  category: 'purchases' | 'engagement' | 'tier' | 'community';
  xpBonus: number;
}

export interface MissionDef {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  icon: string;
  category: string;
  actionType: 'buy' | 'vote' | 'review' | 'profile' | 'refer' | 'share';
  actionUrl?: string;
}

export const DEFAULT_TIERS: LoyaltyTierConfig[] = [
  { id:'bronze', name:'Bronze', badge:'🥉', symbol:'🥉', color:'#cd7f32', bgColor:'bg-amber-900/10', borderColor:'border-amber-700/30', minAmount:0, maxAmount:299, tagline:'Você entrou para o Clube F PAC.', description:'Seu primeiro nível de relacionamento com a F PAC.', benefits:['Perfil de membro do Clube F PAC','Acompanhamento do seu nível pelas compras','Acesso às ações e novidades do Clube'] },
  { id:'prata', name:'Prata', badge:'🥈', symbol:'🥈', color:'#c0c0c0', bgColor:'bg-slate-200/20', borderColor:'border-slate-300', minAmount:300, maxAmount:799, tagline:'Você já faz parte da comunidade F PAC.', description:'Mais relacionamento e acesso antecipado à marca.', benefits:['Todos os benefícios Bronze','Acesso antecipado a lançamentos selecionados','Reserva antecipada de produtos selecionados','Participação em votações de novas estampas'] },
  { id:'ouro', name:'Ouro', badge:'🥇', symbol:'🥇', color:'#eab308', bgColor:'bg-[#eab308]/10', borderColor:'border-[#eab308]/40', minAmount:800, maxAmount:1999, tagline:'Sua presença já faz parte da história F PAC.', description:'Prioridade e participação maior nas novidades da marca.', benefits:['Todos os benefícios Bronze + Prata','Prioridade em reposições de produtos','Acesso antecipado a drops selecionados','Participação em decisões e votações especiais da marca','Atendimento prioritário'] },
  { id:'diamante', name:'Diamante', badge:'💎', symbol:'💎', color:'#38bdf8', bgColor:'bg-sky-500/10', borderColor:'border-sky-400/40', minAmount:2000, maxAmount:null, tagline:'O nível máximo do Clube F PAC.', description:'O maior nível de relacionamento e prioridade dentro do Clube.', benefits:['Todos os benefícios dos níveis anteriores','Prioridade máxima em lançamentos e reposições','Acesso antecipado a drops e edições limitadas selecionadas','Acesso a ações exclusivas para membros Diamante','Atendimento prioritário','Destaque entre os principais clientes do Clube'], animatedBadge:true }
];

export const DEFAULT_LOYALTY_RULES: LoyaltyRuleConfig = { xpPerReais:1, xpPerOrder:100, xpPerReview:50, xpPerReferral:80, xpPerShare:30, xpPerBirthday:150, inactivityDaysThreshold:30 };

export const DEFAULT_ACHIEVEMENTS: AchievementDef[] = [
  { id:'first_buy', title:'Primeira Compra', icon:'🥇', desc:'Realizou sua primeira compra F PAC', category:'purchases', xpBonus:100 },
  { id:'buy_5', title:'5 Compras', icon:'👕', desc:'Realizou 5 pedidos válidos', category:'purchases', xpBonus:250 },
  { id:'buy_10', title:'10 Compras', icon:'👑', desc:'Realizou 10 pedidos válidos', category:'purchases', xpBonus:500 },
  { id:'became_diamond', title:'Nível Diamante', icon:'💎', desc:'Alcançou o nível Diamante pelas compras', category:'tier', xpBonus:1000 }
];

// Missões mantidas somente quando podem ser relacionadas a compras reais registradas.
export const DEFAULT_MISSIONS: MissionDef[] = [
  { id:'m_first_buy', title:'Faça sua primeira compra', description:'Conclua seu primeiro pedido válido na F PAC.', xpReward:100, icon:'🛒', category:'Compras', actionType:'buy', actionUrl:'/catalog' },
  { id:'m_second_buy', title:'Faça sua segunda compra', description:'Volte à F PAC e conclua seu segundo pedido válido.', xpReward:100, icon:'👕', category:'Compras', actionType:'buy', actionUrl:'/catalog' },
  { id:'m_repeat_30d', title:'Compre novamente em até 30 dias', description:'Faça um novo pedido válido em até 30 dias após sua última compra.', xpReward:120, icon:'⚡', category:'Recorrência', actionType:'buy', actionUrl:'/catalog' }
];

export function sanitizePublicName(fullName:string):string { if(!fullName) return 'Cliente F PAC'; const parts=fullName.trim().split(/\s+/); if(parts.length===1) return parts[0]; return `${parts[0]} ${parts[parts.length-1].charAt(0)}.`; }
export function calculateXpLevel(xp:number){ const level=Math.floor(xp/250)+1; const xpForCurrentLevel=(level-1)*250; const xpForNextLevel=level*250; return {level,xpForCurrentLevel,xpForNextLevel,progressPercent:Math.min(100,Math.round(((xp-xpForCurrentLevel)/250)*100))}; }
export function generateMemberNumber(tierId:string,index:number):string { return `${tierId.toUpperCase()} #${String(index+1).padStart(3,'0')}`; }
export function normalizeLoyaltyTiers(tiers:LoyaltyTierConfig[]=DEFAULT_TIERS):LoyaltyTierConfig[] {
 const ordered=[...tiers].map(t=>({...t,minAmount:Math.max(0,Number(t.minAmount)||0)})).sort((a,b)=>a.minAmount-b.minAmount);
 return ordered.map((tier,index)=>({
   ...tier,
   // A faixa sempre termina antes do próximo nível. Isso impede mínimo maior
   // que máximo e elimina faixas sobrepostas no Clube.
   maxAmount:index===ordered.length-1?null:Math.max(tier.minAmount,ordered[index+1].minAmount-0.01),
 }));
}
export function getTierByAmount(totalSpent:number, customTiers:LoyaltyTierConfig[]=DEFAULT_TIERS):LoyaltyTierConfig {
 const tiers=normalizeLoyaltyTiers(customTiers);
 return [...tiers].reverse().find(t=>totalSpent>=t.minAmount)||tiers[0]||DEFAULT_TIERS[0];
}

export interface CustomerLoyaltyData { identityAliases?:string[]; nameVariants?:string[]; key:string; memberNumber:string; customerName:string; email:string; phone:string; city:string; orders:any[]; orderCount:number; totalSpent:number; averageTicket:number; lastPurchaseDate:Date|null; firstPurchaseDate:Date|null; daysSinceLastPurchase:number; tier:LoyaltyTierConfig; nextTier:LoyaltyTierConfig|null; amountNeededForNextTier:number; progressPercent:number; xp:number; xpLevel:number; xpForNextLevel:number; xpProgressPercent:number; achievements:{id:string;title:string;icon:string;desc:string;unlocked:boolean}[]; completedMissions:string[]; isInactive:boolean; isPrestesASubir:boolean; isVip:boolean; itemsBoughtCount:number; purchasedProducts:{name:string;qty:number;image?:string}[]; rankPositions:{spent:number;xp:number;items:number;achievements:number}; }

export function processCustomerLoyaltyList(allOrders:any[],customTiers:LoyaltyTierConfig[]=DEFAULT_TIERS,customAchievements:AchievementDef[]=DEFAULT_ACHIEVEMENTS,customMissions:MissionDef[]=DEFAULT_MISSIONS):CustomerLoyaltyData[]{
 const tiers=normalizeLoyaltyTiers(customTiers);
 const list:CustomerLoyaltyData[]=aggregateCustomerPurchases(allOrders).map((customer,index)=>{
   const {orders,firstPurchaseDate,lastPurchaseDate}=customer,totalSpent=customer.netPaid;
   const tier=getTierByAmount(totalSpent,tiers),ti=tiers.findIndex(t=>t.id===tier.id),nextTier=ti>=0&&ti<tiers.length-1?tiers[ti+1]:null;
   const amountNeededForNextTier=nextTier?Math.max(0,nextTier.minAmount-totalSpent):0;
   const range=nextTier?nextTier.minAmount-tier.minAmount:1;
   const progressPercent=nextTier?Math.min(100,Math.round(((totalSpent-tier.minAmount)/range)*100)):100;
   const itemsBoughtCount=orders.reduce((sum,o)=>sum+(Array.isArray(o.items)?o.items:[]).reduce((qty:number,item:any)=>qty+purchasedQuantity(item),0),0);
   const xp=Math.round(totalSpent)+orders.length*100,xl=calculateXpLevel(xp);
   const completedMissions:string[]=[];
   if(orders.length>=1)completedMissions.push('m_first_buy');
   if(orders.length>=2)completedMissions.push('m_second_buy');
   const dates=orders.map(o=>orderDate(o)).filter((d):d is Date=>Boolean(d)).sort((a,b)=>a.getTime()-b.getTime());
   if(dates.some((date,i)=>i>0&&date.getTime()-dates[i-1].getTime()<=30*86400000))completedMissions.push('m_repeat_30d');
   const achievements=customAchievements.map(a=>({...a,unlocked:a.id==='first_buy'?orders.length>=1:a.id==='buy_5'?orders.length>=5:a.id==='buy_10'?orders.length>=10:a.id==='became_diamond'?tier.id==='diamante':false}));
   const daysSinceLastPurchase=lastPurchaseDate?Math.max(0,Math.floor((Date.now()-lastPurchaseDate.getTime())/86400000)):0;
   return {key:customer.key,identityAliases:[...customer.aliases],nameVariants:[...customer.names],memberNumber:generateMemberNumber(tier.id,index),customerName:customer.name,email:customer.email,phone:customer.phone,city:customer.city||'Não informada',orders,orderCount:orders.length,totalSpent,averageTicket:orders.length?totalSpent/orders.length:0,lastPurchaseDate,firstPurchaseDate,daysSinceLastPurchase,tier,nextTier,amountNeededForNextTier,progressPercent,xp,xpLevel:xl.level,xpForNextLevel:xl.xpForNextLevel,xpProgressPercent:xl.progressPercent,achievements,completedMissions,isInactive:!!lastPurchaseDate&&daysSinceLastPurchase>=DEFAULT_LOYALTY_RULES.inactivityDaysThreshold,isPrestesASubir:!!nextTier&&amountNeededForNextTier<=100,isVip:tier.id==='ouro'||tier.id==='diamante',itemsBoughtCount,purchasedProducts:[],rankPositions:{spent:0,xp:0,items:0,achievements:0}};
 });
 const ranking=(value:(c:CustomerLoyaltyData)=>number)=>[...list].sort((a,b)=>value(b)-value(a)||a.key.localeCompare(b.key));
 const bySpent=[...list].sort((a,b)=>comparePurchaseTotals({...a,netPaid:a.totalSpent},{...b,netPaid:b.totalSpent})),byXp=ranking(c=>c.xp),byItems=ranking(c=>c.itemsBoughtCount),byAchievements=ranking(c=>c.achievements.filter(a=>a.unlocked).length);
 list.forEach(c=>{c.rankPositions={spent:bySpent.indexOf(c)+1,xp:byXp.indexOf(c)+1,items:byItems.indexOf(c)+1,achievements:byAchievements.indexOf(c)+1};});
 return list;
}

export function getMultiRankings(allOrders:any[],customTiers:LoyaltyTierConfig[]=DEFAULT_TIERS,limit=10){
 const list=processCustomerLoyaltyList(allOrders,customTiers);
 const compradores=[...list].sort((a,b)=>a.rankPositions.spent-b.rankPositions.spent).slice(0,limit);
 const xp=[...list].sort((a,b)=>b.xp-a.xp).slice(0,limit);
 const produtos=[...list].sort((a,b)=>b.itemsBoughtCount-a.itemsBoughtCount).slice(0,limit);
 const historicos=[...list].sort((a,b)=>(a.firstPurchaseDate?.getTime()||Infinity)-(b.firstPurchaseDate?.getTime()||Infinity)).slice(0,limit);
 const conquistas=[...list].sort((a,b)=>b.achievements.filter(x=>x.unlocked).length-a.achievements.filter(x=>x.unlocked).length).slice(0,limit);
 return {
   compradores,
   xp,
   produtos,
   historicos,
   conquistas,
   // Aliases temporários para compatibilidade com a tela atual enquanto o Clube é simplificado.
   topCompradores: compradores,
   maiorXp: xp,
   maisProdutos: produtos,
   membrosHistoricos: historicos,
   maisConquistas: conquistas,
 };
}
