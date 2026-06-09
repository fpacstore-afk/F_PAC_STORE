import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  ShoppingBag, Trash2, Plus, Minus, ArrowRight, ShieldCheck, 
  Truck, Ticket, MessageSquare, CreditCard, Wallet, QrCode,
  MapPin, User, Mail, Smartphone, Hash, AlertTriangle, Loader2, Zap, RefreshCw, Tag, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../hooks/useCart';
import { useAuth } from '../context/AuthContext';
import { useInventory } from '../hooks/useInventory';
import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../data/shipping';
import { isJoinvilleCEP, JOINVILLE_DELIVERY_TIME, JOINVILLE_SHIPPING_NAME } from '../lib/shipping';
import { isValidCPF, isValidCNPJ } from '../lib/validation';
import { cn } from '../lib/utils';
import { getDailyPromoCode } from '../lib/promo';
import toast from 'react-hot-toast';
import { getActivePromotion } from '../services/promotions/getActivePromotion';
import { WeeklyPromotion } from '../types/promotions';

export default function Bag() {
  const navigate = useNavigate();
  const { 
    items, subtotal, couponDiscount, pixDiscount, pixDiscountRate, flashSaleDiscount, weeklyPromotionDiscount, weeklyPromotionLabel, total, coupon, shipping, observations, paymentMethod,
    customerInfo,
    addItem, removeItem, updateQuantity, setCoupon, setShipping, setObservations, setPaymentMethod,
    updateCustomer
  } = useCart();
  const { user, profile } = useAuth();

  // --- Inventory Validation ---
  const { getStock, loading: loadingInventory } = useInventory();

  // Stringify cart items to keep track of changes without triggers re-renders loops
  const itemsCheckString = useMemo(() => {
    return items.map(item => `${item.id}_${item.color}_${item.size}_${item.quantity}`).join('|');
  }, [items]);

  // Adjust bag quantities if real-time stock is dynamic
  useEffect(() => {
    if (loadingInventory || items.length === 0) return;

    // Check one item at a time from end to start per render cycle
    // This is safe, avoids index-shifting bugs, and processes updates sequentially
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const variantKey = `${item.color}_${item.size}`;
      const availableStock = getStock(item.slug || item.id, variantKey);

      if (availableStock <= 0) {
        removeItem(i);
        toast.error(`O produto "${item.name}" (${item.color} - ${item.size}) esgotou e foi removido da sua sacola.`);
        break; // Stop and let next render loop check remaining items
      } else if (item.quantity > availableStock) {
        updateQuantity(i, availableStock);
        toast.error(`A quantidade de "${item.name}" (${item.color} - ${item.size}) foi reduzida para o limite disponível de ${availableStock} ${availableStock === 1 ? 'unidade' : 'unidades'}.`);
        break; // Stop and let next render loop check remaining items
      }
    }
  }, [loadingInventory, itemsCheckString, getStock, removeItem, updateQuantity]);

  // --- Local State ---
  const [loadingCep, setLoadingCep] = useState(false);
  const [couponInput, setCouponInput] = useState(coupon || '');
  const [activePromo, setActivePromo] = useState<WeeklyPromotion | null>(null);
  const [externalShippingPrice, setExternalShippingPrice] = useState<number>(24.90);
  const [shippingMethodName, setShippingMethodName] = useState<string>('PAC Correios');
  const [shippingOptions, setShippingOptions] = useState<any[]>([]);

  useEffect(() => {
    getActivePromotion().then((promo) => {
      setActivePromo(promo);
    });
  }, []);

  const calculateForCep = async (numericPart: string) => {
    if (numericPart.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${numericPart}/json/`);
      const data = await res.json();
      if (!data.erro) {
        const updatedCity = data.localidade || 'Joinville';
        const updatedState = data.uf || 'SC';
        
        const isJoinvilleVal = numericPart.startsWith('8920') || numericPart.startsWith('8921') || numericPart.startsWith('8922') || numericPart.startsWith('8923') || updatedCity.toLowerCase() === 'joinville';

        // Pre-calculate local price first if local
        let localOption: any = null;
        if (isJoinvilleVal) {
          const userNeighborhood = normalize(data.bairro || '');
          const matchingKey = Object.keys(JOINVILLE_NEIGHBORHOOD_TIERS).find(
            key => normalize(key) === userNeighborhood
          );
          const localPrice = matchingKey ? JOINVILLE_NEIGHBORHOOD_TIERS[matchingKey] : DEFAULT_SHIPPING_PRICE;
          localOption = {
            id: 0,
            name: JOINVILLE_SHIPPING_NAME,
            price: String(localPrice),
            delivery_time: 5 // 1 to 5 days
          };
        }

        // Calculate freight via Melhor Envio
        let apiOptions: any[] = [];
        try {
          const calculateItems = items.map(item => ({
            id: item.id,
            width: item.width || 17,
            height: item.height || 5,
            length: item.length || 11,
            weight: item.weight || 0.3,
            insurance_value: item.price,
            quantity: item.quantity
          }));

          const calcRes = await fetch('/api/shipping/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: numericPart, items: calculateItems })
          });

          if (calcRes.ok) {
            const calcData = await calcRes.json();
            if (Array.isArray(calcData) && calcData.length > 0) {
              apiOptions = calcData
                .filter((s: any) => !s.error && s.price)
                .sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price));
            }
          }
        } catch (calcErr) {
          console.warn("Melhor Envio API calculation failed, using regional backup.", calcErr);
        }

        // If api options are empty and it is NOT Joinville, create regional fallback
        if (apiOptions.length === 0 && !isJoinvilleVal) {
          const fallbackState = updatedState.toUpperCase();
          let fallbackPrice = 24.90;
          let mName = "PAC Correios";
          if (fallbackState === 'SC') {
            fallbackPrice = 16.90;
            mName = "PAC Correios (SC)";
          } else if (['PR', 'SP', 'RS'].includes(fallbackState)) {
            fallbackPrice = 22.90;
            mName = "PAC Correios (Sul/SP)";
          } else if (['RJ', 'MG', 'ES'].includes(fallbackState)) {
            fallbackPrice = 24.90;
            mName = "PAC Correios (Sudeste)";
          } else {
            fallbackPrice = 32.90;
            mName = "PAC Correios (Nacional)";
          }

          apiOptions = [
            { id: 1, name: mName, price: String(fallbackPrice), delivery_time: fallbackState === 'SC' ? 4 : 7 },
            { id: 2, name: "SEDEX " + (mName.includes('PAC') ? mName.replace('PAC ', '') : mName), price: String(fallbackPrice + 12.00), delivery_time: fallbackState === 'SC' ? 2 : 3 }
          ];
        }

        const finalOptions = localOption ? [localOption, ...apiOptions] : apiOptions;
        setShippingOptions(finalOptions);

        if (finalOptions.length > 0) {
          const defaultOpt = localOption || finalOptions[0];
          const bestPrice = parseFloat(defaultOpt.price);
          setExternalShippingPrice(bestPrice);
          const name = `${defaultOpt.name} (${defaultOpt.delivery_time} dias)`;
          setShippingMethodName(name);
          updateCustomer({
            shippingMethodName: name,
            shippingServiceId: Number(defaultOpt.id),
            address: data.logradouro || customerInfo.address,
            neighborhood: data.bairro || customerInfo.neighborhood,
            city: updatedCity,
            state: updatedState
          });
          toast.success(`Opções de frete carregadas para ${updatedCity}!`);
        } else {
          updateCustomer({
            address: data.logradouro || customerInfo.address,
            neighborhood: data.bairro || customerInfo.neighborhood,
            city: updatedCity,
            state: updatedState
          });
        }
      }
    } catch (err) {
      toast.error("Erro ao buscar CEP");
    } finally {
      setLoadingCep(false);
    }
  };
  
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

  // Rule: 2+ items = Free Shipping
  const currentShipping = useMemo(() => {
    if (totalQty >= 2) return 0;
    
    const isLocalService = customerInfo.shippingServiceId === 0 || !customerInfo.shippingServiceId;
    
    if (customerInfo.city.toLowerCase() === 'joinville' && isLocalService) {
      const userNeighborhood = normalize(customerInfo.neighborhood);
      // Find matching tier
      const matchingKey = Object.keys(JOINVILLE_NEIGHBORHOOD_TIERS).find(
        key => normalize(key) === userNeighborhood
      );
      return matchingKey ? JOINVILLE_NEIGHBORHOOD_TIERS[matchingKey] : DEFAULT_SHIPPING_PRICE;
    } else {
      return externalShippingPrice;
    }
  }, [customerInfo.neighborhood, customerInfo.city, customerInfo.shippingServiceId, totalQty, externalShippingPrice]);

  useEffect(() => {
    setShipping(currentShipping);
  }, [currentShipping, setShipping]);

  // --- Handlers ---
  useEffect(() => {
    const cleanCep = (customerInfo.cep || '').replace(/\D/g, '');
    if (cleanCep.length === 8 && items.length > 0 && shippingOptions.length === 0) {
      calculateForCep(cleanCep);
    }
  }, [customerInfo.cep, items.length]);

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const originalVal = e.target.value;
    const numericPart = originalVal.replace(/\D/g, '').slice(0, 8);
    
    let maskedCep = numericPart;
    if (numericPart.length > 5) {
      maskedCep = `${numericPart.slice(0, 5)}-${numericPart.slice(5, 8)}`;
    }
    
    updateCustomer({ cep: maskedCep });

    if (numericPart.length === 8) {
      calculateForCep(numericPart);
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

  const handlePhone2Change = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    updateCustomer({ phone2: masked });
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
      (isValidCPF(cleanCpf) || isValidCNPJ(cleanCpf)) &&
      cleanPhone.length >= 10 &&
      customerInfo.email.includes('@') &&
      cleanCep.length === 8 &&
      customerInfo.address.trim().length > 2 &&
      customerInfo.neighborhood.trim().length > 1 &&
      customerInfo.number.trim().length > 0 &&
      customerInfo.city.trim().length > 1
    );
  }, [customerInfo]);

  const handleCheckout = () => {
    const cleanCpf = String(customerInfo.cpf || '').replace(/\D/g, '');
    if (cleanCpf && !isValidCPF(cleanCpf) && !isValidCNPJ(cleanCpf)) {
      toast.error("Por favor, informe um CPF ou CNPJ matematicamente válido.");
      return;
    }
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
    <div className="min-h-screen pt-[108px] sm:pt-[124px] md:pt-[132px] pb-16 bg-[#fafafa]">
      {/* Aviso amarelo de frete grátis colado no topo da página (abaixo da barra de menu) */}
      {totalQty < 2 && (
        <div className="w-full bg-[#eab308] border-b border-black/10 py-3 px-4 md:px-10 flex items-center animate-in slide-in-from-top duration-500 shadow-md">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-black p-2 shrink-0">
                <Truck size={18} className="text-[#eab308]" />
              </div>
              <div>
                <p className="text-[10px] md:text-xs font-black uppercase tracking-widest text-black leading-tight">
                  Adicione mais <span className="underline font-black">{2 - totalQty} {2 - totalQty === 1 ? 'peça' : 'peças'}</span> para ganhar <span className="bg-black text-white px-2 py-0.5 rounded ml-1 font-mono tracking-[0.1em] text-[9px] md:text-[10px] shadow-lg border border-white/25 font-black">FRETE GRÁTIS</span>
                </p>
                <div className="w-36 md:w-56 h-1 bg-black/20 mt-1.5 rounded-full overflow-hidden">
                  <div className="h-full bg-black" style={{ width: `${(totalQty / 2) * 100}%` }} />
                </div>
              </div>
            </div>
            <Link to="/catalog" className="text-[9px] md:text-xs font-black uppercase border-2 border-black px-3.5 py-1.5 hover:bg-black hover:text-white transition-all shrink-0">
              Ver Produtos
            </Link>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-10 mt-6 md:mt-8">
        {/* Breadcrumbs - Desktop Only */}
        <div className="hidden md:flex items-center gap-2 text-[8px] md:text-[9px] text-gray-500 uppercase tracking-widest mb-6">
           <Link to="/" className="hover:text-black">INÍCIO</Link>
           <ChevronRight size={10} />
           <span className="text-[#eab308]">SACOLA</span>
        </div>

        <div className="flex flex-col lg:flex-row gap-10">
          
            {/* Main List */}
          <div className="flex-1 space-y-8">
            <div className="bg-white border border-black/5 p-4 md:p-8">
              <h1 className="text-2xl font-black uppercase tracking-tighter mb-6 flex items-center gap-3">
                <ShoppingBag size={28} strokeWidth={2.5} />
                Sua Sacola
              </h1>

              <div className="space-y-8">
                {items.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="flex flex-col sm:flex-row gap-6 pb-8 border-b border-black/5 last:border-0 last:pb-0">
                    <div className="w-full sm:w-24 aspect-[3/4] bg-black/5 flex-shrink-0">
                      <img src={item.image || undefined} alt={item.name} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-0.5">
                          <h3 className="font-black text-base uppercase tracking-tight">{item.name}</h3>
                          <button onClick={() => removeItem(index)} className="text-red-500 hover:bg-red-50 p-1.5 transition-colors">
                            <Trash2 size={16} />
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
                        <div className="flex items-center border border-black/10 min-h-[44px]">
                          <button 
                            onClick={() => updateQuantity(index, item.quantity - 1)}
                            className="p-4 hover:bg-black/5 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-10 text-center font-bold">{item.quantity}</span>
                           <button 
                            onClick={() => {
                              const variantKey = `${item.color}_${item.size}`;
                              const availableStock = getStock(item.slug || item.id, variantKey);
                              if (item.quantity + 1 > availableStock) {
                                toast.error(`Apenas ${availableStock} ${availableStock === 1 ? 'unidade' : 'unidades'} em estoque para esta cor e tamanho.`);
                                return;
                              }
                              updateQuantity(index, item.quantity + 1);
                            }}
                            className="p-4 hover:bg-black/5 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-black">R$ {(item.price * item.quantity).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Customer Data */}
            <div className="bg-white border border-black/5 p-5 md:p-8">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2">
                  <User size={20} />
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
                        phone2: maskPhone(profile.phone2 || '') || customerInfo.phone2,
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
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-3 font-bold transition-all"
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
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-3 font-bold transition-all"
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
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-3 font-bold transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="phone2" className="text-[10px] font-black uppercase tracking-widest text-black/40">WhatsApp 2 (Opcional)</label>
                  <input 
                    id="phone2"
                    name="phone2"
                    type="text" 
                    value={customerInfo.phone2 || ''}
                    onChange={handlePhone2Change}
                    placeholder="(47) 99999-9999"
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-3 font-bold transition-all"
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
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-3 font-bold transition-all"
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
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-3 font-bold transition-all"
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
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-3 font-bold transition-all"
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
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-3 font-bold transition-all"
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
                    className="w-full border-b-2 border-black/10 focus:border-[#eab308] outline-none py-3 font-bold transition-all"
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

            {/* Escolha do Envio / Transportadora */}
            {customerInfo.cep && (
              <div className="bg-white border border-black/5 p-6 md:p-10">
                <h2 className="text-xl font-black uppercase tracking-tighter mb-4 flex items-center gap-2">
                  <Truck size={20} />
                  Escolha a Transportadora
                </h2>
                {shippingOptions.length > 0 ? (
                  <div className="space-y-3">
                    {shippingOptions.map((opt: any) => {
                      const isSelected = customerInfo.shippingServiceId === Number(opt.id) || (shippingOptions.length === 1);
                      return (
                        <div 
                          key={opt.id} 
                          onClick={() => {
                            const val = parseFloat(opt.price);
                            setExternalShippingPrice(val);
                            const name = `${opt.name} (${opt.delivery_time} dias)`;
                            setShippingMethodName(name);
                            updateCustomer({
                              shippingMethodName: name,
                              shippingServiceId: Number(opt.id)
                            });
                          }}
                          className={cn(
                            "border p-4 flex items-center justify-between cursor-pointer transition-all hover:border-black",
                            isSelected ? "border-2 border-[#eab308] bg-[#eab308]/5" : "border-black/10"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-4 h-4 rounded-full border flex items-center justify-center",
                              isSelected ? "border-[#eab308]" : "border-black/30"
                            )}>
                              {isSelected && <div className="w-2 h-2 rounded-full bg-[#eab308]" />}
                            </div>
                            <div>
                              <p className="font-black uppercase text-xs tracking-wider text-black">{opt.name}</p>
                              <p className="text-[10px] text-gray-400 font-bold uppercase">Prazo: {opt.delivery_time} dias úteis</p>
                            </div>
                          </div>
                          <span className="font-black text-sm text-black">
                            R$ {parseFloat(opt.price).toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wide">
                    Calculando opções de frete... ou digite um CEP válido fora de Joinville.
                  </p>
                )}
              </div>
            )}

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
          <div className="w-full lg:w-[360px] space-y-5">
            <div className="bg-black text-white p-6 sticky top-28">
              <h2 className="text-lg font-black uppercase tracking-widest mb-6 border-b border-white/10 pb-3">Sumário do Pedido</h2>
              
              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Subtotal ({totalQty} itens)</span>
                  <span className="font-bold">R$ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm items-center py-3 border-y border-white/5 bg-white/5 px-2 my-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-white font-black uppercase tracking-[0.2em] text-[10px]">
                      {customerInfo.cep 
                        ? (isJoinvilleCEP(customerInfo.cep) && (!customerInfo.shippingServiceId || customerInfo.shippingServiceId === 0) 
                            ? JOINVILLE_SHIPPING_NAME 
                            : shippingMethodName) 
                        : "Entrega Estimada"}
                    </span>
                    {customerInfo.cep ? (
                      isJoinvilleCEP(customerInfo.cep) && (!customerInfo.shippingServiceId || customerInfo.shippingServiceId === 0) ? (
                        <span className="text-[9px] text-[#eab308] font-bold uppercase tracking-wide">
                          Prazo: {JOINVILLE_DELIVERY_TIME}
                        </span>
                      ) : (
                        <span className="text-[9px] text-[#eab308] font-bold uppercase tracking-wide">
                          Prazo: {shippingMethodName}
                        </span>
                      )
                    ) : (
                      <span className="text-[9px] bg-black text-white px-3 py-1 font-mono font-black uppercase tracking-widest inline-block w-fit rounded border border-white/10">
                        2+ PEÇAS = GRÁTIS
                      </span>
                    )}
                  </div>
                  <span className={cn("text-xl font-black", shipping === 0 ? "text-[#eab308]" : "text-white")}>
                    {shipping === 0 ? 'GRÁTIS' : `R$ ${shipping.toFixed(2)}`}
                  </span>
                </div>
                {weeklyPromotionDiscount > 0 && (
                  <div className="flex justify-between text-sm items-center py-2 border-b border-white/5">
                    <span className="text-[#eab308] font-black uppercase tracking-wider text-[10px] flex items-center gap-1">
                      <Tag size={12} className="stroke-[3]" /> {weeklyPromotionLabel || 'PROMOÇÃO DA SEMANA'}
                    </span>
                    <span className="text-[#eab308] font-black">- R$ {weeklyPromotionDiscount.toFixed(2)}</span>
                  </div>
                )}
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
                    <span className="text-[#eab308] font-bold uppercase tracking-widest text-[10px]">Desconto PIX ({pixDiscountRate || 5}%)</span>
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
                    <span className="text-[10px] font-bold uppercase tracking-tighter">PIX ({pixDiscountRate || 5}% OFF)</span>
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
                {activePromo && activePromo.active && activePromo.discount_type !== 'cupom' ? (
                  <div className="p-3 bg-[#eab308]/10 border border-[#eab308]/20 flex items-center gap-2 text-[#eab308]">
                    <Tag size={14} className="shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      Promoção Ativa: {activePromo.title} aplicada automaticamente!
                    </span>
                  </div>
                ) : (
                  !coupon && (
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
                  )
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
