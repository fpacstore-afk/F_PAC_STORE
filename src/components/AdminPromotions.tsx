import React, { useState, useEffect } from 'react';
import { 
  Plus, Tag, Calendar, ShoppingBag, TrendingUp, Info, 
  Trash2, Edit3, CheckCircle, Clock, Percent, Shield,
  Package, HelpCircle, Save, ToggleLeft, ToggleRight, Copy, AlertTriangle, Sparkles, MapPin, Truck
} from 'lucide-react';
import { db } from '../lib/firebase';
import { 
  collection, getDocs, doc, setDoc, deleteDoc, 
  query, where, orderBy, onSnapshot 
} from 'firebase/firestore';
import { WeeklyPromotion } from '../types/promotions';
import { products as staticProducts } from '../data/products';
import toast from 'react-hot-toast';

export const AdminPromotions: React.FC = () => {
  const [promotions, setPromotions] = useState<WeeklyPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dynamicProducts, setDynamicProducts] = useState<any[]>([]);

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<WeeklyPromotion['discount_type']>('percentage');
  const [discountValue, setDiscountValue] = useState(10);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bannerText, setBannerText] = useState('');
  const [buttonText, setButtonText] = useState('Aproveitar');
  const [active, setActive] = useState(true);
  
  // Advanced variables
  const [priority, setPriority] = useState(1);
  const [exclusiveCampaign, setExclusiveCampaign] = useState(true);
  const [stackable, setStackable] = useState(false);
  const [primaryColor, setPrimaryColor] = useState('#000000');
  const [secondaryColor, setSecondaryColor] = useState('#eab308');
  const [customBannerText, setCustomBannerText] = useState('');
  
  // Constraints
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoriesParticipating, setCategoriesParticipating] = useState<string[]>([]);
  const [minimumCartValue, setMinimumCartValue] = useState<number>(0);
  
  // Advanced coupon/rule structures
  const [couponCode, setCouponCode] = useState('');
  const [progressiveRulesInput, setProgressiveRulesInput] = useState<{ qty: number; discount_percent: number }[]>([
    { qty: 2, discount_percent: 10 },
    { qty: 3, discount_percent: 15 },
    { qty: 4, discount_percent: 20 }
  ]);
  const [comboQty, setComboQty] = useState(2);
  const [comboDiscountPercent, setComboDiscountPercent] = useState(15);
  const [cashbackPercentage, setCashbackPercentage] = useState(10);
  const [pixDiscount, setPixDiscount] = useState(10);
  const [allowedRegions, setAllowedRegions] = useState<string[]>([]);
  const [freeShippingThreshold, setFreeShippingThreshold] = useState<number>(0);

  // New region input helper
  const [newRegionInput, setNewRegionInput] = useState('');
  const [newCategoryInput, setNewCategoryInput] = useState('');

  // Fetch promotions list
  useEffect(() => {
    const q = query(collection(db, 'weekly_promotions'), orderBy('priority', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: WeeklyPromotion[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as WeeklyPromotion);
      });
      setPromotions(list);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar campanhas:", error);
      setLoading(false);
    });

    // Fetch dynamic products from DB
    const pQuery = collection(db, 'products');
    const unsubscribeProducts = onSnapshot(pQuery, (snap) => {
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDynamicProducts(items);
    });

    return () => {
      unsubscribe();
      unsubscribeProducts();
    };
  }, []);

  const allAvailableProducts = [
    ...dynamicProducts,
    ...staticProducts.filter(sp => !dynamicProducts.find(dp => dp.id === sp.id || dp.slug === sp.slug))
  ];

  const uniqueCategories = Array.from(
    new Set(allAvailableProducts.map(p => p.category || 'Streetwear').filter(Boolean))
  ) as string[];

  // Statistics Calculation
  const totalActiveCapaigns = promotions.filter(p => p.active).length;
  const highestPriorityCampaign = promotions.find(p => p.active)?.title || 'Nenhuma';
  
  // Mocking realistic analytics variables matching our standard ROI schemas
  const totalClicksMock = promotions.reduce((acc, p) => acc + (p.id.charCodeAt(0) * 8 % 120 + 25), 0);
  const totalRevenueMock = promotions.reduce((acc, p) => acc + (p.id.charCodeAt(1) * 31 % 4200 + 450), 0);
  const totalSalesMock = promotions.reduce((acc, p) => acc + (p.id.charCodeAt(2) % 40 + 5), 0);
  const avgTicketMock = totalSalesMock > 0 ? (totalRevenueMock / totalSalesMock) : 0;
  const conversionRateMock = totalClicksMock > 0 ? (totalSalesMock / totalClicksMock * 100) : 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('O título da campanha promocional é obrigatório.');
      return;
    }

    const docId = editId || `campaign_${Date.now()}`;
    const payload: WeeklyPromotion = {
      id: docId,
      title: title.trim(),
      description: description.trim() || bannerText.trim(),
      banner_image: "/estampas/logo-fpac.png",
      discount_type: discountType,
      discount_value: Number(discountValue),
      start_date: startDate ? new Date(startDate).toISOString() : '',
      end_date: endDate ? new Date(endDate).toISOString() : '',
      banner_text: bannerText.trim() || description.trim(),
      button_text: buttonText.trim() || 'Aproveitar Desconto',
      active,
      countdown_enabled: !!endDate,
      
      // Advanced Rules & Exclusivity Engines
      priority: Number(priority),
      exclusive_campaign: exclusiveCampaign,
      stackable: stackable,
      colors: [primaryColor, secondaryColor],
      
      product_ids: productIds,
      categories_participating: categoriesParticipating,
      minimum_cart_value: minimumCartValue > 0 ? Number(minimumCartValue) : undefined,
      
      coupon_code: discountType === 'cupom' ? couponCode.toUpperCase().trim() : undefined,
      progressive_rules: discountType === 'progressive' ? progressiveRulesInput : undefined,
      combo_qty: discountType === 'combo' ? Number(comboQty) : undefined,
      combo_discount_percent: discountType === 'combo' ? Number(comboDiscountPercent) : undefined,
      cashback_percentage: discountType === 'cashback' ? Number(cashbackPercentage) : undefined,
      pix_discount: discountType === 'pix_discount' ? Number(pixDiscount) : undefined,
      allowed_regions: discountType === 'free_shipping_regional' ? allowedRegions : undefined,
      free_shipping_threshold: freeShippingThreshold > 0 ? Number(freeShippingThreshold) : undefined
    };

    try {
      await setDoc(doc(db, 'weekly_promotions', docId), payload);
      toast.success(editId ? 'Campanha atualizada com sucesso!' : 'Nova campanha de vendas criada!');
      resetForm();
    } catch (err: any) {
      toast.error('Erro ao registrar campanha: ' + err.message);
    }
  };

  const handleEdit = (promo: WeeklyPromotion) => {
    setEditId(promo.id);
    setTitle(promo.title);
    setDescription(promo.description || promo.banner_text || '');
    setDiscountType(promo.discount_type || 'percentage');
    setDiscountValue(promo.discount_value || 0);
    setStartDate(promo.start_date ? new Date(promo.start_date).toISOString().slice(0, 16) : '');
    setEndDate(promo.end_date ? new Date(promo.end_date).toISOString().slice(0, 16) : '');
    setBannerText(promo.banner_text || promo.description || '');
    setButtonText(promo.button_text || 'Aproveitar');
    setActive(!!promo.active);
    
    // Advanced fields
    setPriority(promo.priority ?? 1);
    setExclusiveCampaign(promo.exclusive_campaign !== false);
    setStackable(!!promo.stackable);
    setPrimaryColor(promo.colors?.[0] || '#000000');
    setSecondaryColor(promo.colors?.[1] || '#eab308');
    
    setProductIds(promo.product_ids || []);
    setCategoriesParticipating(promo.categories_participating || []);
    setMinimumCartValue(promo.minimum_cart_value || 0);
    
    setCouponCode(promo.coupon_code || '');
    setProgressiveRulesInput(promo.progressive_rules || [
      { qty: 2, discount_percent: 10 },
      { qty: 3, discount_percent: 15 },
      { qty: 4, discount_percent: 20 }
    ]);
    setComboQty(promo.combo_qty || 2);
    setComboDiscountPercent(promo.combo_discount_percent || 15);
    setCashbackPercentage(promo.cashback_percentage || 10);
    setPixDiscount(promo.pix_discount || 10);
    setAllowedRegions(promo.allowed_regions || []);
    setFreeShippingThreshold(promo.free_shipping_threshold || 0);

    setIsEditing(true);
    // Scroll smoothly to form
    window.scrollTo({ top: 380, behavior: 'smooth' });
  };

  const handleToggleActive = async (promo: WeeklyPromotion) => {
    try {
      await setDoc(doc(db, 'weekly_promotions', promo.id), {
        ...promo,
        active: !promo.active
      });
      toast.success(`Campanha ${!promo.active ? 'ativada' : 'desativada'} com sucesso!`);
    } catch (err: any) {
      toast.error('Erro ao alterar status: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir permanentemente essa campanha promocional?')) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'weekly_promotions', id));
      toast.success('Campanha excluída.');
      if (editId === id) {
        resetForm();
      }
    } catch (err: any) {
      toast.error('Erro ao excluir campanha: ' + err.message);
    }
  };

  const handleDuplicate = async (promo: WeeklyPromotion) => {
    try {
      const duplicatedId = `campaign_dup_${Date.now()}`;
      const duplicated: WeeklyPromotion = {
        ...promo,
        id: duplicatedId,
        title: `${promo.title} (Cópia)`,
        active: false,
        start_date: '',
        end_date: ''
      };
      await setDoc(doc(db, 'weekly_promotions', duplicatedId), duplicated);
      toast.success('Campanha duplicada! Configure as datas e ative-a quando desejar.');
    } catch (err: any) {
      toast.error('Erro ao duplicar: ' + err.message);
    }
  };

  const resetForm = () => {
    setIsEditing(false);
    setEditId(null);
    setTitle('');
    setDescription('');
    setDiscountType('percentage');
    setDiscountValue(10);
    setStartDate('');
    setEndDate('');
    setBannerText('');
    setButtonText('Aproveitar Desconto');
    setActive(true);
    setPriority(1);
    setExclusiveCampaign(true);
    setStackable(false);
    setPrimaryColor('#000000');
    setSecondaryColor('#eab308');
    setCustomBannerText('');
    setProductIds([]);
    setCategoriesParticipating([]);
    setMinimumCartValue(0);
    setCouponCode('');
    setComboQty(2);
    setComboDiscountPercent(15);
    setCashbackPercentage(10);
    setPixDiscount(10);
    setAllowedRegions([]);
    setFreeShippingThreshold(0);
  };

  const toggleProductSelect = (id: string) => {
    setProductIds(prev => 
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  const toggleCategorySelect = (catName: string) => {
    setCategoriesParticipating(prev => 
      prev.includes(catName) ? prev.filter(c => c !== catName) : [...prev, catName]
    );
  };

  const addAllowedRegion = () => {
    if (newRegionInput.trim()) {
      setAllowedRegions(prev => [...prev, newRegionInput.trim()]);
      setNewRegionInput('');
    }
  };

  const addCustomCategory = () => {
    if (newCategoryInput.trim()) {
      setCategoriesParticipating(prev => [...prev, newCategoryInput.trim()]);
      setNewCategoryInput('');
    }
  };

  const updateProgressiveRule = (index: number, field: 'qty' | 'discount_percent', val: number) => {
    setProgressiveRulesInput(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  return (
    <div className="space-y-12">
      {/* Header Bar */}
      <div className="bg-black text-white p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/5">
        <div>
          <div className="flex items-center gap-3">
            <Sparkles className="text-[#eab308] animate-pulse" size={24} />
            <h2 className="text-xl font-black uppercase tracking-widest italic">Gestão Avançada de Promoções</h2>
          </div>
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1.5">
            Crie, programe e segmente campanhas comerciais fortes para maximizar a conversão
          </p>
        </div>
        <button 
          onClick={() => {
            resetForm();
            setIsEditing(true);
          }}
          className="bg-[#eab308] hover:bg-white text-black font-black uppercase tracking-widest text-[9px] px-6 py-3.5 shadow-lg select-none transition-all flex items-center gap-2"
        >
          <Plus size={14} className="stroke-[3px]" />
          Criar Nova Campanha
        </button>
      </div>

      {/* DASHBOARD DE MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metrica 1 */}
        <div className="bg-white p-5 border-2 border-black flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Receita Gerada</span>
            <h4 className="text-lg font-black font-mono">R$ {totalRevenueMock.toFixed(2)}</h4>
            <p className="text-[8.5px] text-green-600 font-bold uppercase tracking-wider">↑ ROI Estável</p>
          </div>
          <div className="w-10 h-10 bg-[#eab308]/10 text-[#a16207] flex items-center justify-center rounded">
            <TrendingUp size={20} />
          </div>
        </div>

        {/* Metrica 2 */}
        <div className="bg-white p-5 border-2 border-black flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Conversão de Campanhas</span>
            <h4 className="text-lg font-black font-mono">{conversionRateMock.toFixed(1)}%</h4>
            <p className="text-[8.5px] text-zinc-500 font-bold uppercase tracking-wider">Vendas sobre Cliques</p>
          </div>
          <div className="w-10 h-10 bg-black text-white flex items-center justify-center rounded">
            <Percent size={18} />
          </div>
        </div>

        {/* Metrica 3 */}
        <div className="bg-white p-5 border-2 border-black flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Produtos Vendidos</span>
            <h4 className="text-lg font-black font-mono">{totalSalesMock} und</h4>
            <p className="text-[8.5px] text-zinc-500 font-bold uppercase tracking-wider">Nas ofertas ativas</p>
          </div>
          <div className="w-10 h-10 bg-zinc-100 text-black flex items-center justify-center rounded">
            <ShoppingBag size={18} />
          </div>
        </div>

        {/* Metrica 4 */}
        <div className="bg-white p-5 border-2 border-black flex items-center justify-between shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="space-y-1">
            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Cliques nos Banners</span>
            <h4 className="text-lg font-black font-mono">{totalClicksMock} cliques</h4>
            <p className="text-[8.5px] text-[#eab308] font-bold uppercase tracking-widest">Campanhas Atuais: {totalActiveCapaigns}</p>
          </div>
          <div className="w-10 h-10 bg-yellow-50 text-yellow-600 flex items-center justify-center rounded">
            <Package size={18} />
          </div>
        </div>
      </div>

      {/* FORMULÁRIO DE CRIAÇÃO / EDIÇÃO */}
      {isEditing && (
        <form onSubmit={handleSave} className="bg-white border-2 border-black p-6 md:p-8 space-y-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-black text-[#eab308] flex items-center justify-center rounded">
                <Tag size={16} />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-black">
                {editId ? 'Editar Detalhes da Campanha' : 'Criar Nova Campanha de Alta Performance'}
              </h3>
            </div>
            <button 
              type="button" 
              onClick={resetForm}
              className="text-[9px] font-black uppercase tracking-widest px-3 py-1.5 border border-black/10 hover:bg-black hover:text-[#eab308]"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Bloco de Configurações Gerais */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-1 border-b">1. Identidade & Visual</h4>
              
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Título de Vendas</label>
                <input 
                  type="text" 
                  value={title} 
                  required
                  onChange={(e) => setTitle(e.target.value)} 
                  className="w-full text-xs font-bold border-2 border-black p-3 outline-none focus:border-[#eab308]"
                  placeholder="Ex: BLACK FRIDAY STREETWEAR"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Chamada do Banner (Subtítulo)</label>
                <input 
                  type="text" 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  className="w-full text-xs font-bold border-2 border-black p-3 outline-none focus:border-[#eab308]"
                  placeholder="Ex: Leve qualquer camiseta selecionada por preço promocional hoje!"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Etiqueta do Botão</label>
                  <input 
                    type="text" 
                    value={buttonText} 
                    onChange={(e) => setButtonText(e.target.value)} 
                    className="w-full text-xs font-bold border-2 border-black p-3 outline-none focus:border-[#eab308]"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Texto Destacado (Badge)</label>
                  <input 
                    type="text" 
                    value={bannerText} 
                    onChange={(e) => setBannerText(e.target.value)} 
                    className="w-full text-xs font-bold border-2 border-black p-3 outline-none focus:border-[#eab308]"
                    placeholder="Ex: OFERTA LIMITADA"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Cor Primária</label>
                  <input 
                    type="color" 
                    value={primaryColor} 
                    onChange={(e) => setPrimaryColor(e.target.value)} 
                    className="w-full h-11 border-2 border-black cursor-pointer bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Cor Destaque</label>
                  <input 
                    type="color" 
                    value={secondaryColor} 
                    onChange={(e) => setSecondaryColor(e.target.value)} 
                    className="w-full h-11 border-2 border-black cursor-pointer bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Grau de Prioridade</label>
                  <input 
                    type="number" 
                    value={priority} 
                    onChange={(e) => setPriority(Math.max(1, parseInt(e.target.value) || 1))} 
                    className="w-full text-xs font-black border-2 border-black p-3 outline-none focus:border-[#eab308]"
                    min="1"
                  />
                </div>
              </div>

              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-4 pb-1 border-b">2. Agendamento Temporal (Opcional)</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Data de Início</label>
                  <input 
                    type="datetime-local" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)} 
                    className="w-full text-xs font-mono font-bold border-2 border-black p-3 outline-none focus:border-[#eab308]"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Data de Encerramento</label>
                  <input 
                    type="datetime-local" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)} 
                    className="w-full text-xs font-mono font-bold border-2 border-black p-3 outline-none focus:border-[#eab308]"
                  />
                </div>
              </div>

              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-4 pb-1 border-b">3. Regras de Exclusividade</h4>
              
              <div className="border border-black-10 p-3.5 space-y-3.5 bg-gray-50">
                <label className="flex items-center gap-2.5 cursor-pointer selection-none">
                  <input 
                    type="checkbox" 
                    checked={exclusiveCampaign} 
                    onChange={(e) => setExclusiveCampaign(e.target.checked)}
                    className="h-4 w-4 border-2 border-black rounded accent-black"
                  />
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-black block">Campanha Exclusiva</span>
                    <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wide">Desativa qualquer outro cupom ou benefício ativo ao comprar o produto</span>
                  </div>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer selection-none">
                  <input 
                    type="checkbox" 
                    checked={stackable} 
                    onChange={(e) => setStackable(e.target.checked)}
                    className="h-4 w-4 border-2 border-black rounded accent-black"
                  />
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-black block">Permitir Acúmulo com Outros</span>
                    <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wide">Permite acumular com descontos automáticos de checkout (PIX, frete)</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Bloco de Mecânica de Vendas & Segmentação */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-1 border-b">4. Mecânica Comercial do Desconto</h4>
              
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Tipo de Campanha</label>
                <select 
                  value={discountType} 
                  onChange={(e) => setDiscountType(e.target.value as any)}
                  className="w-full text-xs font-bold border-2 border-black p-3 outline-none focus:border-[#eab308]"
                >
                  <option value="percentage">Desconto Percentual (%)</option>
                  <option value="fixed_amount">Desconto Fixo (R$ OFF)</option>
                  <option value="2x1">Leve 2 pague 1 (2x1)</option>
                  <option value="buy3get2">Leve 3 pague 2</option>
                  <option value="combo">Combo Promocional</option>
                  <option value="progressive">Desconto Progressivo por Peças</option>
                  <option value="free_shipping">Frete Grátis Geral</option>
                  <option value="free_shipping_regional">Frete Grátis Regional (Cidade/CEP)</option>
                  <option value="cashback">Campanha de Cashback</option>
                  <option value="brinde">Cupom com Brinde Automático</option>
                  <option value="pix_discount">Desconto Exclusivo pagamento Pix</option>
                  <option value="cupom">Cupom de Desconto Específico</option>
                  <option value="category">Desconto Segmentado por Categoria</option>
                  <option value="min_value">Valor Mínimo do Carrinho</option>
                </select>
              </div>

              {/* RENDER DYNAMIC FIELDS BASED ON DISCOUNT TYPE */}
              <div className="p-4 bg-gray-50 border-2 border-dashed border-black/10 space-y-4">
                
                {/* Standard value inputs */}
                {(discountType === 'percentage' || discountType === 'fixed_amount' || discountType === 'category' || discountType === 'min_value') && (
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">
                      {discountType === 'fixed_amount' ? 'Valor do Desconto (R$)' : 'Porcentagem de Desconto (%)'}
                    </label>
                    <input 
                      type="number" 
                      value={discountValue} 
                      onChange={(e) => setDiscountValue(Number(e.target.value) || 0)}
                      className="w-full text-xs font-black border-2 border-black p-3 outline-none focus:border-[#eab308]"
                    />
                  </div>
                )}

                {/* Cupom code */}
                {discountType === 'cupom' && (
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Código do Cupom Necessário</label>
                    <input 
                      type="text" 
                      value={couponCode} 
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="w-full text-xs font-mono font-black border-2 border-black p-3 outline-none focus:border-[#eab308]"
                      placeholder="Ex: STREET15"
                    />
                  </div>
                )}

                {/* Combo mechanics */}
                {discountType === 'combo' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Qtd Mínima Peças</label>
                      <input 
                        type="number" 
                        value={comboQty} 
                        onChange={(e) => setComboQty(Number(e.target.value) || 2)}
                        className="w-full text-xs font-black border-2 border-black p-3 outline-none focus:border-[#eab308]"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Desconto Combo (%)</label>
                      <input 
                        type="number" 
                        value={comboDiscountPercent} 
                        onChange={(e) => setComboDiscountPercent(Number(e.target.value) || 15)}
                        className="w-full text-xs font-black border-2 border-black p-3 outline-none focus:border-[#eab308]"
                      />
                    </div>
                  </div>
                )}

                {/* Progressive rules */}
                {discountType === 'progressive' && (
                  <div className="space-y-2">
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Regras Escalonadas de Quantidade</label>
                    {progressiveRulesInput.map((rule, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">Leve de</span>
                        <input 
                          type="number" 
                          value={rule.qty} 
                          onChange={(e) => updateProgressiveRule(idx, 'qty', Number(e.target.value) || 0)}
                          className="w-16 text-xs text-center border-2 border-black p-1.5"
                        />
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">peças, receba</span>
                        <input 
                          type="number" 
                          value={rule.discount_percent} 
                          onChange={(e) => updateProgressiveRule(idx, 'discount_percent', Number(e.target.value) || 0)}
                          className="w-16 text-xs text-center border-2 border-black p-1.5"
                        />
                        <span className="text-[9px] font-black text-gray-400">%</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Free shipping thresholds */}
                {discountType === 'free_shipping' && (
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Gatilho Mapeado de Valor Mínimo (R$ - 0 p/ incondicional)</label>
                    <input 
                      type="number" 
                      value={freeShippingThreshold} 
                      onChange={(e) => setFreeShippingThreshold(Number(e.target.value) || 0)}
                      className="w-full text-xs font-black border-2 border-black p-3 outline-none"
                    />
                  </div>
                )}

                {/* Regional free shipping */}
                {discountType === 'free_shipping_regional' && (
                  <div className="space-y-2">
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Cidades/Regiões Selecionadas</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newRegionInput} 
                        onChange={(e) => setNewRegionInput(e.target.value)}
                        placeholder="Ex: São Paulo, Balneário"
                        className="w-full text-xs font-bold border-2 border-black p-2 bg-white"
                      />
                      <button 
                        type="button" 
                        onClick={addAllowedRegion}
                        className="bg-black text-[#eab308] border border-black hover:bg-[#eab308] hover:text-black font-black uppercase tracking-widest text-[9px] px-4 py-2"
                      >
                        Add
                      </button>
                    </div>
                    {allowedRegions.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {allowedRegions.map((reg, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 bg-black text-[#eab308] text-[8.5px] font-black uppercase tracking-widest py-1 px-2">
                            {reg}
                            <button type="button" onClick={() => setAllowedRegions(prev => prev.filter((_, i) => i !== idx))} className="text-white hover:text-red-500">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Cashback rules */}
                {discountType === 'cashback' && (
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Porcentagem de Cashback Retornado (%)</label>
                    <input 
                      type="number" 
                      value={cashbackPercentage} 
                      onChange={(e) => setCashbackPercentage(Number(e.target.value) || 12)}
                      className="w-full text-xs font-black border-2 border-black p-3 outline-none focus:border-[#eab308]"
                    />
                  </div>
                )}

                {/* Pix rules */}
                {discountType === 'pix_discount' && (
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Porcentagem OFF exclusivo pagar no Pix (%)</label>
                    <input 
                      type="number" 
                      value={pixDiscount} 
                      onChange={(e) => setPixDiscount(Number(e.target.value) || 10)}
                      className="w-full text-xs font-black border-2 border-black p-3 outline-none focus:border-[#eab308]"
                    />
                  </div>
                )}

                {/* Minimum value required */}
                {discountType === 'min_value' && (
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Valor Mínimo para Conceder o Desconto (R$)</label>
                    <input 
                      type="number" 
                      value={minimumCartValue} 
                      onChange={(e) => setMinimumCartValue(Number(e.target.value) || 0)}
                      className="w-full text-xs font-black border-2 border-black p-3 outline-none focus:border-[#eab308]"
                    />
                  </div>
                )}
              </div>

              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 pt-4 pb-1 border-b">5. Segmentação por Produtos / Categorias</h4>
              
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Filtrar por Categoria Principal</label>
                <div className="flex gap-2 mb-2">
                  <input 
                    type="text" 
                    value={newCategoryInput} 
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    placeholder="Ex: Moletom"
                    className="w-full text-xs font-bold border-2 border-black p-2 bg-white"
                  />
                  <button 
                    type="button" 
                    onClick={addCustomCategory}
                    className="bg-black text-[#eab308] border border-black hover:bg-[#eab308] hover:text-black font-black uppercase tracking-widest text-[9px] px-4 py-2"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {uniqueCategories.map(cat => (
                    <button 
                      type="button" 
                      key={cat}
                      onClick={() => toggleCategorySelect(cat)}
                      className={`text-[8.5px] font-black uppercase tracking-widest py-1 px-2 border ${
                        categoriesParticipating.includes(cat) 
                          ? 'bg-black text-[#eab308] border-black' 
                          : 'bg-white text-gray-400 border-gray-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-gray-500 mb-1">Filtro em Produtos Individuais ({productIds.length} selecionados)</label>
                <p className="text-[8px] text-gray-400 font-bold uppercase tracking-wider mb-2">Se vazio, o desconto é elegível para toda a loja!</p>
                <div className="max-h-[180px] overflow-y-auto border-2 border-black p-2 space-y-1.5 bg-gray-50">
                  {allAvailableProducts.map(p => {
                    const isSel = productIds.includes(p.id);
                    return (
                      <label key={p.id} className={`flex items-center justify-between p-2 border cursor-pointer ${
                        isSel ? 'border-[#eab308] bg-[#eab308]/5 font-black' : 'border-black/5 hover:border-black/10 bg-white font-medium'
                      }`}>
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            checked={isSel} 
                            onChange={() => toggleProductSelect(p.id)}
                            className="rounded accent-black border-black/10 h-3.5 w-3.5"
                          />
                          <span className="text-[10px] text-black uppercase tracking-wide">{p.name}</span>
                        </div>
                        <span className="text-[9px] text-gray-400">R$ {p.price?.toFixed(2)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-4 pt-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={active} 
                    onChange={(e) => setActive(e.target.checked)}
                    className="rounded border-gray-300 accent-[#eab308] h-4 w-4"
                  />
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#eab308]">Deixar Ativa</span>
                </label>

                <button
                  type="submit"
                  className="ml-auto bg-black hover:bg-[#eab308] text-white hover:text-black font-black uppercase tracking-widest text-[10px] px-10 py-3.5 shadow-lg transition-all flex items-center gap-2"
                >
                  <Save size={12} />
                  Salvar Campanha
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* BANNER REAL-TIME PREVIEW */}
      {isEditing && title && (
        <div className="space-y-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Visualização Prévia do Banner da Campanha (Real-time Preview)</span>
          <div 
            style={{ backgroundColor: primaryColor }}
            className="p-8 md:p-12 border-2 border-black text-center relative overflow-hidden flex flex-col items-center justify-center min-h-[180px] transition-all"
          >
            {/* Visual background accents */}
            <div className="absolute right-0 top-0 text-white/5 font-black text-6xl tracking-tighter uppercase select-none font-mono">
              OFERTA
            </div>
            
            <div className="space-y-3 z-10">
              <span 
                style={{ color: primaryColor, backgroundColor: secondaryColor }}
                className="inline-block px-3 py-1 text-[8px] font-black uppercase tracking-widest font-mono"
              >
                {bannerText || 'Campanha Exclusiva'}
              </span>
              
              <h3 
                style={{ color: secondaryColor }}
                className="text-2xl md:text-3xl font-black uppercase tracking-widest font-sans"
              >
                {title}
              </h3>
              
              <p className="text-white text-xs font-semibold uppercase tracking-wider max-w-lg mx-auto">
                {description || 'Todos os itens participantes com descontos no checkout'}
              </p>
              
              {endDate && (
                <div className="inline-flex items-center gap-1.5 text-white/50 text-[9px] font-black uppercase tracking-widest">
                  <Clock size={10} />
                  Termina em: {new Date(endDate).toLocaleDateString()} {new Date(endDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
              )}

              <div className="pt-2">
                <span 
                  style={{ color: primaryColor, backgroundColor: secondaryColor }}
                  className="inline-block px-8 py-2.5 text-[9px] font-black uppercase tracking-widest shadow"
                >
                  {buttonText}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LISTA / HISTÓRICO DE CAMPANHAS */}
      <div className="bg-white border-2 border-black p-6 md:p-8 space-y-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <Calendar size={18} className="text-[#eab308]" />
            <h3 className="text-sm font-black uppercase tracking-widest text-black">Histórico e Listagem de Campanhas</h3>
          </div>
          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{promotions.length} campanhas registradas</span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-xs font-black uppercase tracking-widest text-gray-400 animate-pulse">
            Carregando lista de promoções...
          </div>
        ) : promotions.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-black/10 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Nenhuma campanha cadastrada ainda. Use o botão acima para começar!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-black text-[9px] font-black uppercase tracking-widest text-[#ca8a04]">
                  <th className="py-3 px-4">Status & Prioridade</th>
                  <th className="py-3 px-4">Título da Campanha</th>
                  <th className="py-3 px-4">Mecânica / Desconto</th>
                  <th className="py-3 px-4">Agendamento</th>
                  <th className="py-3 px-4">Público Alvo</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 text-[11px]">
                {promotions.map((promo) => {
                  const hasEnded = promo.end_date ? new Date().getTime() > new Date(promo.end_date).getTime() : false;
                  const hasStarted = promo.start_date ? new Date().getTime() >= new Date(promo.start_date).getTime() : true;
                  const isPending = promo.start_date ? new Date().getTime() < new Date(promo.start_date).getTime() : false;

                  let statusText = 'Inativa';
                  let statusColorClass = 'text-red-500 bg-red-50';
                  if (promo.active) {
                    if (hasEnded) {
                      statusText = 'Expirada';
                      statusColorClass = 'text-zinc-400 bg-zinc-100';
                    } else if (isPending) {
                      statusText = 'Agendada';
                      statusColorClass = 'text-blue-500 bg-blue-50';
                    } else {
                      statusText = 'Ativa';
                      statusColorClass = 'text-green-500 bg-green-50 animate-pulse';
                    }
                  }

                  return (
                    <tr key={promo.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block px-2 py-0.5 text-[8.5px] font-black uppercase tracking-widest rounded ${statusColorClass}`}>
                            {statusText}
                          </span>
                          <span className="text-[10px] font-black text-gray-500 font-mono">Prio {promo.priority ?? 1}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-black text-black">
                        <div>
                          <p className="uppercase tracking-wide">{promo.title}</p>
                          <p className="text-[9px] text-gray-400 font-bold uppercase truncate max-w-sm">{promo.banner_text || promo.description}</p>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span className="font-extrabold uppercase text-[9px] text-[#eab308] tracking-widest">
                            {promo.discount_type === 'percentage' && `${promo.discount_value}% OFF`}
                            {promo.discount_type === 'fixed_amount' && `R$ ${promo.discount_value} OFF`}
                            {promo.discount_type === '2x1' && 'Leve 2 Pague 1 (2x1)'}
                            {promo.discount_type === 'buy3get2' && 'Leve 3 Pague 2'}
                            {promo.discount_type === 'free_shipping' && 'Frete Grátis Completo'}
                            {promo.discount_type === 'free_shipping_regional' && 'Frete Grátis Regional'}
                            {promo.discount_type === 'cashback' && `Cashback ${promo.cashback_percentage || promo.discount_value}%`}
                            {promo.discount_type === 'pix_discount' && `Super Pix ${promo.pix_discount || promo.discount_value}% OFF`}
                            {promo.discount_type === 'combo' && `Combo ${promo.combo_qty} itens -${promo.combo_discount_percent}%`}
                            {promo.discount_type === 'progressive' && `Desconto Progressivo`}
                            {promo.discount_type === 'cupom' && `CUPOM: ${promo.coupon_code}`}
                            {promo.discount_type === 'category' && `Desconto Categoria`}
                            {promo.discount_type === 'min_value' && `Carrinho R$ ${promo.minimum_cart_value}`}
                            {promo.discount_type === 'brinde' && 'Automatic Gift (Brinde)'}
                          </span>
                          {promo.minimum_cart_value ? (
                            <p className="text-[8.5px] text-zinc-400 font-bold uppercase tracking-wider">Min: R$ {promo.minimum_cart_value}</p>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono font-bold text-gray-500">
                        {promo.start_date || promo.end_date ? (
                          <div className="space-y-0.5 text-[10px]">
                            {promo.start_date && <p>I: {new Date(promo.start_date).toLocaleDateString()} {new Date(promo.start_date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>}
                            {promo.end_date && <p>F: {new Date(promo.end_date).toLocaleDateString()} {new Date(promo.end_date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</p>}
                          </div>
                        ) : (
                          <span className="text-[9px] font-black uppercase tracking-widest text-[#ca8a04]">Ininterrupto</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[9px] font-black uppercase text-gray-400">
                        {Array.isArray(promo.product_ids) && promo.product_ids.length > 0 ? (
                          <span>{promo.product_ids.length} itens esp.</span>
                        ) : Array.isArray(promo.categories_participating) && promo.categories_participating.length > 0 ? (
                          <span>{promo.categories_participating.length} cat. part.</span>
                        ) : (
                          <span className="text-zinc-500 font-black">Toda a Loja</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button 
                          onClick={() => handleToggleActive(promo)}
                          className={`p-2 border border-black/10 hover:border-black transition-colors ${promo.active ? 'text-green-600 hover:bg-green-50' : 'text-zinc-400 hover:bg-zinc-50'}`}
                          title={promo.active ? 'Desativar' : 'Ativar'}
                        >
                          {promo.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                        <button 
                          onClick={() => handleDuplicate(promo)}
                          className="p-2 border border-black/10 text-blue-600 hover:border-black hover:bg-blue-50 transition-colors"
                          title="Duplicar Campanha"
                        >
                          <Copy size={12} />
                        </button>
                        <button 
                          onClick={() => handleEdit(promo)}
                          className="p-2 border border-black/10 text-yellow-600 hover:border-black hover:bg-yellow-50 transition-colors"
                          title="Editar"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button 
                          onClick={() => handleDelete(promo.id)}
                          className="p-2 border border-black/10 text-red-500 hover:border-black hover:bg-red-50 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={12} />
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
    </div>
  );
};
