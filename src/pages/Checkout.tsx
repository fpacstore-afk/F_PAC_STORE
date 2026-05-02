import type React from 'react';
import { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../data/shipping';

export function Checkout() {
  const { items, total, clearCart } = useCart();
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    cep: ''
  });
  const [loadingCep, setLoadingCep] = useState(false);
  
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoPromoDiscount, setAutoPromoDiscount] = useState(0);

  useEffect(() => {
    window.scrollTo(0, 0);
    const now = Date.now();
    const endTime = Number(localStorage.getItem('f_pac_promo_end') || 0);
    if (endTime > now) {
      setAutoPromoDiscount(Number(localStorage.getItem('f_pac_promo_value') || 0));
    }

    // Auto-apply promo from localStorage if available
    const savedPromo = localStorage.getItem('promoAutoApply');
    if (savedPromo) {
      setPromoCode(savedPromo);
      setPromoApplied(true);
    }
  }, []);

  const today = new Date();
  const dynamicCode = `FPAC${today.getDate()}${today.getMonth() + 1}`;

  const fetchCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      setLoadingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            address: data.logradouro || '',
            neighborhood: data.bairro || '',
            city: data.localidade || '',
            state: data.uf || '',
            number: '',
            complement: '',
            cep: cleanCep.replace(/(\d{5})(\d{3})/, '$1-$2') // Format CEP
          }));
        }
      } catch (error) {
        console.error("Erro ao buscar CEP:", error);
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'cep') {
      const formattedCep = value.replace(/\D/g, '').slice(0, 8);
      if (formattedCep.length === 8) {
        // Clear address fields immediately to reset and provide visual feedback
        setFormData(prev => ({ 
          ...prev, 
          [name]: formattedCep,
          address: '',
          neighborhood: '',
          city: '',
          state: '',
          number: '',
          complement: ''
        }));
        fetchCep(formattedCep);
      } else {
        setFormData(prev => ({ ...prev, [name]: formattedCep }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) return;

    if (formData.city.trim().toLowerCase() !== 'joinville') {
      alert('Pedimos desculpas pelo transtorno, mas não temos disponibilidade de entrega na sua região.');
      return;
    }

    setIsSubmitting(true);

    const totalQty = items.reduce((acc, item) => acc + item.quantity, 0);
    const neighborhoodKey = formData.neighborhood.trim().toUpperCase();
    const neighborhoodPrice = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhoodKey] || DEFAULT_SHIPPING_PRICE;
    const frete = totalQty >= 2 ? 0 : neighborhoodPrice;
    const isPix = paymentMethod === 'PIX';
    
    // Original Promo Code (5% PIX)
    const pixDiscount = (promoApplied && isPix) ? total * 0.05 : 0;
    
    // New Auto Promo (Fixed value from timer)
    const autoDiscount = autoPromoDiscount;
    
    const discountAmount = pixDiscount + autoDiscount;
    const finalTotal = Math.max(0, total - discountAmount + frete);

    const orderId = `PAC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // Save to Firestore
    try {
      await setDoc(doc(db, 'orders', orderId), {
        customerName: formData.name,
        customerPhone: formData.phone,
        address: formData.address,
        number: formData.number,
        complement: formData.complement,
        neighborhood: formData.neighborhood,
        city: formData.city,
        state: formData.state,
        cep: formData.cep,
        items: items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          size: item.size,
          color: item.color,
          printConfigs: item.printConfigs || []
        })),
        subtotal: total,
        frete,
        discount: discountAmount,
        total: finalTotal,
        paymentMethod,
        status: 'pending',
        createdAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
    }

    // Build WhatsApp message
    let message = `*NOVO PEDIDO - F PAC STORE*%0A%0A`;
    
    message += `*CLIENTE:*%0A`;
    message += `Nome: ${formData.name.toUpperCase()}%0A`;
    message += `WhatsApp: ${formData.phone}%0A%0A`;
    
    message += `*ENDEREÇO:*%0A`;
    message += `${formData.address}, ${formData.number}${formData.complement ? ` - ${formData.complement}` : ''}%0A`;
    message += `${formData.neighborhood}, ${formData.city} - ${formData.state}%0A`;
    message += `CEP: ${formData.cep}%0A%0A`;
    
    message += `*ITENS:*%0A`;
    items.forEach(item => {
      message += ` · ${item.quantity}x ${item.name.toUpperCase()} (Cor: ${item.color}, Tam: ${item.size}) | R$ ${(item.price * item.quantity).toFixed(2)}%0A`;
      if (item.printConfigs && item.printConfigs.length > 0) {
        item.printConfigs.forEach(cfg => {
          message += `   - Personalização: ${cfg.stamp.toUpperCase()} (${cfg.location.toUpperCase()})%0A`;
        });
      }
    });
    
    message += `%0A*FRETE:* R$ ${frete.toFixed(2)}%0A`;
    message += `*TOTAL: R$ ${finalTotal.toFixed(2)}*%0A%0A`;
    
    message += `*FORMA DE PAGAMENTO:* ${paymentMethod.toUpperCase()}%0A`;
    
    if (isPix) {
      message += `*CHAVE PIX:* fpacstore@gmail.com%0A`;
    } else {
      message += `*LINK DE PAGAMENTO:* https://link.mercadopago.com.br/fpacstore%0A`;
    }

    message += `%0A_ID DO PEDIDO: ${orderId}_%0A`;
    message += `_Acompanhe seu pedido:_ ${window.location.origin}/order/${orderId}`;
    message += `%0A%0A*#PEDIDO*`;

    // Replace with real store number
    const wppNumber = '5547997465602'; 
    const url = `https://wa.me/${wppNumber}?text=${message}`;

    window.open(url, '_blank');
    clearCart();
    setIsSubmitting(false);
  };

  const totalQty = items.reduce((acc, item) => acc + item.quantity, 0);
  const isJoinville = formData.city.trim().toLowerCase() === 'joinville';
  const neighborhoodKey = formData.neighborhood.trim().toUpperCase();
  const neighborhoodPrice = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhoodKey] || DEFAULT_SHIPPING_PRICE;
  const frete = totalQty >= 2 ? 0 : neighborhoodPrice;
  const isPix = paymentMethod === 'PIX';
  
  const pixDiscount = (promoApplied && isPix) ? total * 0.05 : 0;
  const autoDiscount = autoPromoDiscount;
  const discountAmount = pixDiscount + autoDiscount;
  
  const isAddressFilled = formData.cep.replace(/\D/g, '').length === 8 && formData.address.length > 0 && formData.number.length > 0;
  const shippingAvailable = !isAddressFilled || isJoinville;
  const currentFrete = isAddressFilled && isJoinville ? frete : 0;
  const finalTotal = total - discountAmount + currentFrete;

  const handleApplyPromo = () => {
    if (promoCode.trim().toUpperCase() === dynamicCode) {
      setPromoApplied(true);
    } else {
      alert('Código promocional inválido ou expirado.');
      setPromoApplied(false);
    }
  };


  if (items.length === 0) {
    return (
      <div className="min-h-screen pt-32 pb-24 flex flex-col items-center justify-center max-w-xl mx-auto text-center">
        <h1 className="text-3xl font-heading font-black uppercase mb-4">Sua sacola está vazia</h1>
        <p className="text-gray-600 mb-8">Adicione peças ao seu carrinho antes de prosseguir para o checkout.</p>
        <Link to="/catalog" className="bg-[#eab308] text-black font-bold uppercase px-8 py-3 rounded-none hover:bg-white transition-colors">
          Voltar para loja
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-40 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <h1 className="text-3xl md:text-5xl font-heading font-black tracking-tighter uppercase mb-12">
        Checkout <span className="text-[#eab308]">Express</span>
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
        
        {/* Form */}
        <div className="md:col-span-7">
          <form 
            id="checkout-form" 
            onSubmit={handleCheckout} 
            onKeyDown={(e) => { 
              if (e.key === 'Enter') e.preventDefault(); 
            }}
            className="space-y-8 p-6 md:p-8 bg-black/5 border border-black/10 rounded-none"
          >
             <div>
                <h3 className="font-bold text-xl mb-4 font-heading uppercase tracking-wide">Dados Pessoais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="md:col-span-2">
                     <input required type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="NOME COMPLETO" />
                   </div>
                   <div className="md:col-span-2">
                     <input required type="text" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="WHATSAPP / TELEFONE" />
                   </div>
                </div>
             </div>

             <div className="border-t border-black/5 pt-8">
                <h3 className="font-bold text-xl mb-4 font-heading uppercase tracking-wide">Endereço de Entrega</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="md:col-span-2 relative">
                      <input 
                        required 
                        type="text" 
                        name="cep" 
                        value={formData.cep} 
                        onChange={handleInputChange} 
                        className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" 
                        placeholder="CEP" 
                      />
                      {loadingCep && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <div className="w-4 h-4 border-2 border-[#eab308] border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                   </div>
                   <div className="md:col-span-2">
                     <input required type="text" name="address" value={formData.address} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="RUA / LOGRADOURO" />
                   </div>
                   <div>
                     <input required type="text" name="number" value={formData.number} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="NÚMERO" />
                   </div>
                   <div>
                     <input required type="text" name="complement" value={formData.complement} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="COMPLEMENTO (APTO, BLOCO...)" />
                   </div>
                   <div className="md:col-span-2">
                     <input required type="text" name="neighborhood" value={formData.neighborhood} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="BAIRRO" />
                   </div>
                   <div>
                     <input required type="text" name="city" value={formData.city} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="CIDADE" />
                   </div>
                   <div>
                     <input required type="text" name="state" value={formData.state} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="ESTADO (UF)" />
                   </div>
                </div>
             </div>
          </form>
        </div>

        {/* Order Summary */}
        <div className="md:col-span-5">
           <div className="sticky top-32 p-6 md:p-8 bg-[#f9fafb] border border-black/10 rounded-none shadow-2xl">
              <h3 className="font-bold text-xl mb-6 font-heading uppercase tracking-wide">Resumo do Pedido</h3>
              
              <div className="space-y-4 mb-6 max-h-60 overflow-y-auto pr-2">
                 {items.map((item, idx) => (
                    <div key={idx} className="flex gap-4">
                       <img src={item.image} alt={item.name} className="w-16 h-20 object-cover bg-black/5 rounded-none" />
                       <div className="flex-1">
                          <h4 className="font-bold text-sm">{item.name} <span className="font-normal text-gray-500">x{item.quantity}</span></h4>
                          <p className="text-[10px] uppercase font-bold tracking-widest text-black/40 mt-1">Cor: {item.color} | Tam: {item.size}</p>
                          
                          {item.printConfigs && item.printConfigs.length > 0 && (
                            <div className="mt-1 pt-1 border-t border-black/5 space-y-1">
                               <p className="text-[9px] text-[#eab308] uppercase tracking-widest font-bold">Personalização ({item.printConfigs.length}):</p>
                               {item.printConfigs.map((cfg, cidx) => (
                                 <p key={cidx} className="text-[9px] text-black/50 uppercase tracking-widest">
                                    {cfg.stamp} ({cfg.location})
                                 </p>
                               ))}
                            </div>
                          )}

                          <p className="font-bold text-sm mt-2">R$ {(item.price * item.quantity).toFixed(2)}</p>
                       </div>
                    </div>
                 ))}
              </div>

              <div className="border-t border-black/10 pt-4 mb-4">
                 <div className="flex gap-2">
                   <input 
                     type="text" 
                     value={promoCode} 
                     onChange={(e) => setPromoCode(e.target.value)} 
                     disabled={promoApplied}
                     placeholder="CÓDIGO PROMOCIONAL" 
                     className="w-full bg-black/5 border border-black/10 rounded-none p-2 text-xs focus:outline-none focus:border-[#eab308] uppercase"
                   />
                   <button 
                     type="button" 
                     onClick={handleApplyPromo}
                     disabled={promoApplied || !promoCode}
                     className="bg-black text-white px-4 py-2 text-[10px] font-bold uppercase disabled:opacity-50"
                   >
                     Aplicar
                   </button>
                 </div>
              </div>

              <div className="border-t border-black/10 pt-4 mb-4">
                 <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Forma de Pagamento</h3>
                 <div className="flex flex-col gap-2">
                   <label className="flex items-center gap-2 text-sm cursor-pointer">
                     <input type="radio" name="paymentMethod" value="PIX" checked={paymentMethod === 'PIX'} onChange={(e) => setPaymentMethod(e.target.value)} className="accent-[#eab308]" />
                     <span className="font-medium text-gray-700">PIX</span>
                   </label>
                   <label className="flex items-center gap-2 text-sm cursor-pointer">
                     <input type="radio" name="paymentMethod" value="Cartão de Crédito" checked={paymentMethod === 'Cartão de Crédito'} onChange={(e) => setPaymentMethod(e.target.value)} className="accent-[#eab308]" />
                     <span className="font-medium text-gray-700">Cartão de Crédito</span>
                   </label>
                   <label className="flex items-center gap-2 text-sm cursor-pointer">
                     <input type="radio" name="paymentMethod" value="Cartão de Débito" checked={paymentMethod === 'Cartão de Débito'} onChange={(e) => setPaymentMethod(e.target.value)} className="accent-[#eab308]" />
                     <span className="font-medium text-gray-700">Cartão de Débito</span>
                   </label>
                 </div>
              </div>

              <div className="border-t border-black/10 pt-4 space-y-3 mb-6">
                 <div className="flex justify-between text-gray-600 text-sm">
                    <span>Subtotal</span>
                    <span>R$ {total.toFixed(2)}</span>
                 </div>
                 {autoPromoDiscount > 0 && (
                   <div className="flex justify-between text-[#eab308] text-sm font-medium">
                      <span>🏷️ Oferta Especial (Desconto Direto)</span>
                      <span>- R$ {autoPromoDiscount.toFixed(2)}</span>
                   </div>
                 )}
                 {promoApplied && (
                   <div className="flex flex-col gap-1 mb-2">
                     <div className="flex justify-between text-[#eab308] text-sm font-medium">
                        <span>🏷️ Cupom: {promoCode} (5% OFF PIX)</span>
                        <span className={cn(!isPix && "text-gray-400")}>
                          {isPix ? `- R$ ${pixDiscount.toFixed(2)}` : 'R$ 0.00'}
                        </span>
                     </div>
                     {!isPix && (
                       <p className="text-[9px] text-red-500 italic uppercase font-bold tracking-widest">
                         ⚠️ Mude para PIX para ativar este cupom.
                       </p>
                     )}
                   </div>
                 )}
                 <div className="flex justify-between text-[#eab308] text-sm font-medium">
                    <span>Frete: Joinville (Grátis a partir de 2 peças)</span>
                    <span>
                      {isAddressFilled ? (
                        isJoinville ? (frete === 0 ? 'Grátis' : `R$ ${frete.toFixed(2)}`) : 'Indisponível'
                      ) : '--'}
                    </span>
                 </div>
                 {!shippingAvailable && (
                   <p className="text-[10px] text-red-500 font-bold italic mt-1">
                     Desculpe, frete indisponível para aquela região no momento. Pedimos desculpas pelo transtorno.
                   </p>
                 )}
                 <div className="flex justify-between font-bold text-xl pt-4 border-t border-black/10 mt-2">
                    <span>Total</span>
                    <span>R$ {finalTotal.toFixed(2)}</span>
                 </div>
              </div>

              <button 
                type="submit"
                form="checkout-form"
                disabled={!shippingAvailable || isSubmitting}
                className="w-full bg-[#eab308] text-black font-black py-5 text-sm uppercase tracking-[0.2em] hover:bg-white transition-all transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                 {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Finalizar via WhatsApp'} <ArrowRight size={18} />
              </button>
              
              <p className="text-xs text-center text-gray-500 mt-4 flex items-center justify-center gap-1">
                 <ShieldCheck size={14} /> Pedido validado pelo sistema de gestão.
              </p>
           </div>
        </div>

      </div>
    </div>
  );
}
