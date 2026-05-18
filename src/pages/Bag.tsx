import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ShoppingBag, Trash2, Plus, Minus, ArrowRight, ShieldCheck, 
  Truck, Ticket, MessageSquare, CreditCard, Wallet, QrCode,
  MapPin, User, Mail, Smartphone, Hash, AlertTriangle, Loader2, Zap, RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../context/AuthContext';
import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../data/shipping';
import { cn } from '../lib/utils';
import { getDailyPromoCode } from '../lib/promo';
import toast from 'react-hot-toast';

export default function Bag() {
  const navigate = useNavigate();
  const { 
    items, subtotal, couponDiscount, pixDiscount, flashSaleDiscount, total, coupon, shipping, observations, paymentMethod,
    customerInfo,
    addItem, removeItem, updateQuantity, setCoupon, setShipping, setObservations, setPaymentMethod,
    updateCustomer
  } = useCart();
  const { user, profile } = useAuth();

  // --- Local State ---
  const [loadingCep, setLoadingCep] = useState(false);
  const [couponInput, setCouponInput] = useState(coupon || '');
  
  // Listen for promo auto-apply from Navbar
  useEffect(() => {
    // 1. Check if there was already a pending apply
    const dailyCode = getDailyPromoCode();
    const pendingCode = localStorage.getItem('promoAutoApply') || dailyCode;
    if (!coupon && pendingCode) {
      setCoupon(pendingCode);
      setCouponInput(pendingCode);
    }
  }, [setCoupon, coupon]);
  
  // Load profile data into store if empty
  useEffect(() => {
    if (profile) {
      // Helper to mask phone
      const maskPhone = (val: string) => {
        const v = val.replace(/\D/g, '');
        if (v.length === 0) return '';
        let m = `(${v.slice(0, 2)}`;
        if (v.length > 2) m += `) ${v.slice(2, 7)}${v.length > 7 ? `-${v.slice(7, 11)}` : ''}`;
        return m;
      };

      // Helper to mask CPF
      const maskCpf = (val: string) => {
        const v = val.replace(/\D/g, '');
        if (v.length <= 3) return v;
        let m = `${v.slice(0, 3)}.${v.slice(3, 6)}`;
        if (v.length > 6) m += `.${v.slice(6, 9)}${v.length > 9 ? `-${v.slice(9, 11)}` : ''}`;
        return m;
      };

      // Helper to mask CEP
      const maskCep = (val: string) => {
        const v = val.replace(/\D/g, '');
        if (v.length <= 5) return v;
        return `${v.slice(0, 5)}-${v.slice(5, 8)}`;
      };

      const updates: any = {};
      
      const cleanValue = (val: string) => (val || '').replace(/\s+/g, ' ').trim();

      if (!customerInfo.name && profile.name) updates.name = cleanValue(profile.name);
      if (!customerInfo.email && (profile.email || user?.email)) {
        updates.email = cleanValue(profile.email || user?.email || '');
      }
      if (!customerInfo.phone && profile.phone) updates.phone = maskPhone(profile.phone);
      if (!customerInfo.cpf && profile.cpf) updates.cpf = maskCpf(profile.cpf);
      if (!customerInfo.cep && profile.cep) updates.cep = maskCep(profile.cep);
      
      const shouldUpdateAddress = !customerInfo.address && profile.address;
      if (shouldUpdateAddress) {
        updates.address = cleanValue(profile.address);
        if (profile.number) updates.number = profile.number;
        if (profile.complement) updates.complement = profile.complement;
        if (profile.neighborhood) updates.neighborhood = profile.neighborhood;
        if (profile.city) updates.city = profile.city;
        if (profile.state) updates.state = profile.state;
      }

      if (Object.keys(updates).length > 0) {
        console.log("🔄 [Bag] Auto-preenchendo dados do perfil:", updates);
        updateCustomer(updates);
      }
    } else if (user && !customerInfo.email) {
       updateCustomer({ email: user.email || '' });
    }
  }, [profile, user]); // Reduzi dependências para evitar loops

  // --- Calculations ---
  const totalQty = items.reduce((acc, item) => acc + item.quantity, 0);
  
  // Helper to normalize strings (remove accents and lower case)
  const normalize = (str: string) => 
    str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  // Rule: 2+ items = Free Shipping in Joinville
  const currentShipping = useMemo(() => {
    if (customerInfo.city.toLowerCase() !== 'joinville') return 0;
    if (totalQty >= 2) return 0;
    
    const userNeighborhood = normalize(customerInfo.neighborhood);
    
    // Find matching tier
    const matchingKey = Object.keys(JOINVILLE_NEIGHBORHOOD_TIERS).find(
      key => normalize(key) === userNeighborhood
    );
    
    return matchingKey ? JOINVILLE_NEIGHBORHOOD_TIERS[matchingKey] : DEFAULT_SHIPPING_PRICE;
  }, [customerInfo.neighborhood, customerInfo.city, totalQty]);

  useEffect(() => {
    setShipping(currentShipping);
  }, [currentShipping, setShipping]);

  // --- Handlers ---
  const handleCepChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const originalVal = e.target.value;
    const numericPart = originalVal.replace(/\D/g, '').slice(0, 8);
    
    let maskedCep = numericPart;
    if (numericPart.length > 5) {
      maskedCep = `${numericPart.slice(0, 5)}-${numericPart.slice(5, 8)}`;
    }
    
    updateCustomer({ cep: maskedCep });

    if (numericPart.length === 8) {
      setLoadingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${numericPart}/json/`);
        const data = await res.json();
        if (!data.erro) {
          updateCustomer({
            address: data.logradouro || customerInfo.address,
            neighborhood: data.bairro || customerInfo.neighborhood,
            city: data.localidade || 'Joinville',
            state: data.uf || 'SC'
          });
          if (data.localidade && data.localidade.toLowerCase() !== 'joinville') {
            toast.error("Desculpe, entregamos apenas em Joinville no momento.");
          }
        }
      } catch (err) {
        toast.error("Erro ao buscar CEP");
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
    let masked = val;
    if (val.length > 0) {
      masked = `(${val.slice(0, 2)}`;
      if (val.length > 2) {
        masked += `) ${val.slice(2, 7)}`;
        if (val.length > 7) {
          masked += `-${val.slice(7, 11)}`;
        }
      }
    }
    updateCustomer({ phone: masked });
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 11);
    let masked = val;
    if (val.length > 3) {
      masked = `${val.slice(0, 3)}.${val.slice(3, 6)}`;
      if (val.length > 6) {
        masked += `.${val.slice(6, 9)}`;
        if (val.length > 9) {
          masked += `-${val.slice(9, 11)}`;
        }
      }
    }
    updateCustomer({ cpf: masked });
  };

  const handleApplyCoupon = () => {
    const code = String(couponInput || '').toUpperCase().trim().replace(/\s/g, '');
    const dailyCode = getDailyPromoCode();
    
    if (code === dailyCode) {
      setCoupon(code);
      toast.success("Cupom diário aplicado!");
    } else if (code.startsWith('FPAC')) {
      toast.error("Este cupom não é mais válido hoje.");
    } else {
      toast.error("Cupom inválido");
    }
  };

  const isFormValid = useMemo(() => {
    const cleanCpf = String(customerInfo.cpf || '').replace(/\D/g, '');
    const cleanPhone = String(customerInfo.phone || '').replace(/\D/g, '');
    const cleanCep = String(customerInfo.cep || '').replace(/\D/g, '');

    return (
      customerInfo.name.trim().length > 3 &&
      cleanCpf.length >= 11 &&
      cleanPhone.length >= 10 &&
      customerInfo.email.includes('@') &&
      cleanCep.length === 8 &&
      customerInfo.address.trim().length > 2 &&
      customerInfo.neighborhood.trim().length > 1 &&
      customerInfo.number.trim().length > 0 &&
      customerInfo.city.toLowerCase() === 'joinville'
    );
  }, [customerInfo]);

  const handleCheckout = () => {
    if (!isFormValid) {
      toast.error("Preencha todos os campos obrigatórios corretamente.");
      return;
    }
    // No need to save to local storage explicitly, it's in the store
    navigate('/checkout');
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-40 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-24 h-24 bg-black/5 rounded-full flex items-center justify-center mb-6">
          <ShoppingBag size={40} className="text-black/20" />
        </div>
        <h1 className="text-3xl font-black uppercase tracking-tighter mb-2">Sua sacola está vazia</h1>
        <p className="text-gray-500 mb-8 max-w-xs">Parece que você ainda não adicionou produtos de atitude à sua sacola.</p>
        <Link to="/catalog" className="bg-black text-white px-10 py-4 font-black uppercase text-sm tracking-widest hover:bg-[#eab308] hover:text-black transition-all">
          Começar a Comprar
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 pb-24 bg-[#fafafa]">
      <div className="max-w-7xl mx-auto px-4 md:px-10">
        <div className="flex flex-col lg:flex-row gap-10">
          
          {/* Main List */}
          <div className="flex-1 space-y-8">
            <div className="bg-white border border-black/5 p-6 md:p-10">
              <h1 className="text-3xl font-black uppercase tracking-tighter mb-8 flex items-center gap-3">
                <ShoppingBag size={32} strokeWidth={2.5} />
                Sua Sacola
              </h1>

              <div className="space-y-8">
                {items.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="flex flex-col sm:flex-row gap-6 pb-8 border-b border-black/5 last:border-0 last:pb-0">
                    <div className="w-full sm:w-32 aspect-[3/4] bg-black/5 flex-shrink-0">
                      <img src={item.image || undefined} alt={item.name} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-black text-lg uppercase tracking-tight">{item.name}</h3>
                          <button onClick={() => removeItem(index)} className="text-red-500 hover:bg-red-50 p-2 transition-colors">
                            <Trash2 size={18} />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-4 text-[10px] uppercase font-bold tracking-widest text-black/40 mb-4">
                          <span className="bg-black/5 px-2 py-1">TAM: {item.size}</span>
                          <span className="bg-black/5 px-2 py-1">COR: {item.color}</span>
                        </div>
                        
                        {item.printConfigs && item.printConfigs.length > 0 && (
                          <div className="bg-[#fffcf0] border border-[#eab308]/20 p-3 mb-4 rounded-sm">
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#854d0e] mb-2">Personalização inclusa</p>
                            <div className="space-y-3">
                              {item.printConfigs.map((cfg, cfgIdx) => (
                                <div key={cfgIdx} className="flex items-center gap-3">
                                  {cfg.image && (
                                    <div className="w-14 h-14 bg-white border border-black/5 flex-shrink-0 p-1 mb-1">
                                      <img src={cfg.image} alt={cfg.stamp} className="w-full h-full object-contain" />
                                    </div>
                                  )}
                                  <p className="text-xs text-black/60 italic leading-tight">
                                    "{cfg.stamp}" em {cfg.location} ({cfg.printSize})
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-end">
                        <div className="flex items-center border border-black/10">
                          <button 
                            onClick={() => updateQuantity(index, item.quantity - 1)}
                            className="p-3 hover:bg-black/5 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-10 text-center font-bold">{item.quantity}</span>
                          <button 
                            onClick={() => updateQuantity(index, item.quantity + 1)}
                            className="p-3 hover:bg-black/5 transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-black">R$ {(item.price * item.quantity).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Customer Data */}
            <div className="bg-white border border-black/5 p-6 md:p-10">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
                  <User size={22} />
                  Seus Dados
                </h2>
                {user && profile && (
                  <button 
                    onClick={() => {
                      const maskPhone = (val: string) => {
                        const v = val.replace(/\D/g, '');
                        if (v.length === 0) return '';
                        let m = `(${v.slice(0, 2)}`;
                        if (v.length > 2) m += `) ${v.slice(2, 7)}${v.length > 7 ? `-${v.slice(7, 11)}` : ''}`;
                        return m;
                      };
                      const maskCpf = (val: string) => {
                        const v = val.replace(/\D/g, '');
                        if (v.length <= 3) return v;
                        let m = `${v.slice(0, 3)}.${v.slice(3, 6)}`;
                        if (v.length > 6) m += `.${v.slice(6, 9)}${v.length > 9 ? `-${v.slice(9, 11)}` : ''}`;
                        return m;
                      };
                      const maskCep = (val: string) => {
                        const v = val.replace(/\D/g, '');
                        if (v.length <= 5) return v;
                        return `${v.slice(0, 5)}-${v.slice(5, 8)}`;
                      };

                      updateCustomer({
                        name: profile.name || customerInfo.name,
                        email: profile.email || user.email || customerInfo.email,
                        phone: maskPhone(profile.phone || '') || customerInfo.phone,
                        cpf: maskCpf(profile.cpf || '') || customerInfo.cpf,
                        cep: maskCep(profile.cep || '') || customerInfo.cep,
                        address: profile.address || customerInfo.address,
                        number: profile.number || customerInfo.number,
                        complement: profile.complement || customerInfo.complement,
                        neighborhood: profile.neighborhood || customerInfo.neighborhood,
                        city: profile.city || customerInfo.city,
                        state: profile.state || customerInfo.state
                      });
                      toast.success("Dados sincronizados com seu perfil!");
                    }}
                    className="text-[9px] font-black uppercase tracking-widest text-[#eab308] hover:text-black transition-colors flex items-center gap-1 bg-[#eab308]/5 px-3 py-1.5 border border-[#eab308]/10"
                  >
                    <RefreshCw size={10} /> Sincronizar Perfil
                  </button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-[10px] font-black uppercase tracking-widest text-black/40">Nome Completo</label>
                  <input 
                    id="name"
                    name="name"
                    type="text" 
                    value={customerInfo.name}
                    onChange={e => updateCustomer({ name: e.target.value })}
                    placeholder="Como na sua identidade"
                    autoComplete="name"
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-2 font-bold transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-black/40">E-mail</label>
                  <input 
                    id="email"
                    name="email"
                    type="email" 
                    value={customerInfo.email}
                    onChange={e => updateCustomer({ email: e.target.value })}
                    placeholder="seu@email.com"
                    autoComplete="email"
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-2 font-bold transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-[10px] font-black uppercase tracking-widest text-black/40">WhatsApp</label>
                  <input 
                    id="phone"
                    name="phone"
                    type="text" 
                    value={customerInfo.phone}
                    onChange={handlePhoneChange}
                    placeholder="(47) 99999-9999"
                    autoComplete="tel"
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-2 font-bold transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="cpf" className="text-[10px] font-black uppercase tracking-widest text-black/40">CPF / CNPJ</label>
                  <input 
                    id="cpf"
                    name="cpf"
                    type="text" 
                    value={customerInfo.cpf}
                    onChange={handleCpfChange}
                    placeholder="000.000.000-00"
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-2 font-bold transition-all"
                  />
                </div>
              </div>

              <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label htmlFor="cep" className="text-[10px] font-black uppercase tracking-widest text-black/40 flex items-center gap-1">
                    CEP {loadingCep && <Loader2 size={12} className="animate-spin" />}
                  </label>
                  <input 
                    id="cep"
                    name="cep"
                    type="text" 
                    value={customerInfo.cep}
                    onChange={handleCepChange}
                    placeholder="89200-000"
                    autoComplete="postal-code"
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-2 font-bold transition-all"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label htmlFor="address" className="text-[10px] font-black uppercase tracking-widest text-black/40">Endereço</label>
                  <input 
                    id="address"
                    name="address"
                    type="text" 
                    value={customerInfo.address}
                    onChange={e => updateCustomer({ address: e.target.value })}
                    placeholder="Rua, Avenida, etc."
                    autoComplete="street-address"
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-2 font-bold transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="number" className="text-[10px] font-black uppercase tracking-widest text-black/40">Número</label>
                  <input 
                    id="number"
                    name="number"
                    type="text" 
                    value={customerInfo.number}
                    onChange={e => updateCustomer({ number: e.target.value })}
                    placeholder="123"
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-2 font-bold transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="neighborhood" className="text-[10px] font-black uppercase tracking-widest text-black/40">Bairro</label>
                  <input 
                    id="neighborhood"
                    name="neighborhood"
                    type="text" 
                    list="neighborhoods"
                    value={customerInfo.neighborhood}
                    onChange={e => updateCustomer({ neighborhood: e.target.value })}
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-2 font-bold transition-all"
                  />
                  <datalist id="neighborhoods">
                    {Object.keys(JOINVILLE_NEIGHBORHOOD_TIERS).map(n => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <label htmlFor="city" className="text-[10px] font-black uppercase tracking-widest text-black/40">Cidade</label>
                  <input 
                    id="city"
                    name="city"
                    readOnly
                    type="text" 
                    value={customerInfo.city}
                    className="w-full border-b-2 border-black/5 bg-black/5 py-2 px-1 font-bold text-black/30"
                  />
                </div>
              </div>
            </div>

            {/* Observations */}
            <div className="bg-white border border-black/5 p-6 md:p-10">
              <h2 className="text-xl font-black uppercase tracking-tighter mb-4 flex items-center gap-2">
                <MessageSquare size={20} />
                Observações
              </h2>
              <textarea 
                value={observations}
                onChange={e => setObservations(e.target.value)}
                placeholder="Algo que precisamos saber sobre o seu pedido?"
                className="w-full border-2 border-black/5 focus:border-[#eab308] outline-none p-4 font-medium transition-all min-h-[100px] resize-none"
              />
            </div>
          </div>

          {/* Sidebar / Summary */}
          <div className="w-full lg:w-[400px] space-y-6">
            <div className="bg-black text-white p-8 sticky top-32">
              <h2 className="text-xl font-black uppercase tracking-widest mb-8 border-b border-white/10 pb-4">Sumário do Pedido</h2>
              
              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Subtotal ({totalQty} itens)</span>
                  <span className="font-bold">R$ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="text-white/60">Entrega Estimada</span>
                    <span className="text-[9px] text-[#eab308] font-black uppercase tracking-tighter italic">Frete grátis a partir de 2 peças</span>
                  </div>
                  <span className={cn("font-bold", shipping === 0 ? "text-[#eab308]" : "text-white")}>
                    {shipping === 0 ? 'GRÁTIS' : `R$ ${shipping.toFixed(2)}`}
                  </span>
                </div>
                {flashSaleDiscount > 0 && (
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-[#eab308] font-bold flex items-center gap-1 italic uppercase tracking-tighter">
                      <Zap size={14} className="fill-current" /> Drop Relâmpago
                    </span>
                    <span className="text-[#eab308] font-black">- R$ {flashSaleDiscount}</span>
                  </div>
                )}
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-sm items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-[#eab308] font-bold">Cupom: {coupon}</span>
                      <button onClick={() => setCoupon(null)} className="text-white/30 hover:text-white">
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <span className="text-[#eab308] font-black">- R$ {couponDiscount.toFixed(2)}</span>
                  </div>
                )}
                {pixDiscount > 0 && (
                  <div className="flex justify-between text-sm items-center">
                    <span className="text-[#eab308] font-bold uppercase tracking-widest text-[10px]">Desconto PIX (5%)</span>
                    <span className="text-[#eab308] font-black">- R$ {pixDiscount.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="mb-10 space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Forma de Pagamento</p>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setPaymentMethod('CREDIT_CARD')}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 border transition-all text-center",
                      paymentMethod === 'CREDIT_CARD' ? "border-[#eab308] bg-[#eab308] text-black" : "border-white/10 opacity-50 hover:opacity-100"
                    )}
                  >
                    <CreditCard size={20} />
                    <span className="text-[10px] font-bold uppercase tracking-tighter">Cartão</span>
                  </button>
                  <button 
                    onClick={() => setPaymentMethod('PIX')}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 border transition-all text-center",
                      paymentMethod === 'PIX' ? "border-[#eab308] bg-[#eab308] text-black" : "border-white/10 opacity-50 hover:opacity-100"
                    )}
                  >
                    <QrCode size={20} />
                    <span className="text-[10px] font-bold uppercase tracking-tighter">PIX (5% OFF)</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-end mb-10 pt-6 border-t border-white/10">
                <span className="text-white/60 uppercase font-black tracking-widest text-xs">Total Final</span>
                <span className="text-4xl font-black text-[#eab308] leading-none">R$ {total.toFixed(2)}</span>
              </div>

              <button 
                onClick={handleCheckout}
                disabled={items.length === 0}
                className="w-full bg-[#eab308] text-black py-5 font-black uppercase text-sm tracking-[0.2em] hover:bg-white transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
              >
                Finalizar Pedido <ArrowRight size={20} />
              </button>

              <div className="mt-8 space-y-4">
                {/* Coupon Input */}
                {!coupon && (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={couponInput}
                      onChange={e => setCouponInput(e.target.value)}
                      placeholder="CUPOM"
                      className="flex-1 bg-white/5 border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest outline-none focus:border-[#eab308]"
                    />
                    <button 
                      onClick={handleApplyCoupon}
                      className="bg-white/10 px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/20"
                    >
                      OK
                    </button>
                  </div>
                )}
                
                <p className="text-[10px] text-white/40 flex items-center justify-center gap-2 pt-4">
                  <ShieldCheck size={14} className="text-[#eab308]" /> 
                  Ambiente 100% Criptografado e Seguro
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
