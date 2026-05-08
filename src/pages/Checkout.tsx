import React, { useState, useEffect, useMemo } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, ArrowRight, Loader2, LogIn, AlertTriangle, CheckCircle, Package, QrCode, Smartphone, Timer, Gift, CreditCard, MapPin, Mail, User, Hash, Info, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { doc, setDoc, serverTimestamp, getDocs, query, where, orderBy, limit, Timestamp, collection, runTransaction, getDoc } from 'firebase/firestore';
import { auth, db, OperationType, handleFirestoreError } from '../lib/firebase';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import toast from 'react-hot-toast';

// Initialize MP with Public Key
const getMPPublicKey = () => {
  const env = import.meta.env;
  
  // 1. Try explicit names
  const prioritizedKey = env.VITE_MP_PUBLIC_KEY || 
                        env.VITE_MP_PUBLIC_K || 
                        env.VITE_MP_CHAVE_P ||
                        env.VITE_MP_PUBLIC_KEY_ ||
                        env.VITE_PUBLIC_MP_K ||
                        env.VITE_MP_PUBLIC_KEY_TEST ||
                        env.MP_PUBLIC_KEY;
  
  if (prioritizedKey && prioritizedKey.length > 10) return prioritizedKey;

  // 2. Try to find ANY VITE_MP key by searching the object (if Vite allows)
  try {
    const foundKeyName = Object.keys(env).find(k => k.includes('MP_PUBLIC') || (k.startsWith('VITE_MP') && env[k]?.length > 10));
    if (foundKeyName) return env[foundKeyName];
  } catch (e) {
    // Some environments block Object.keys(import.meta.env)
  }

  return null;
};

const mpPublicKey = getMPPublicKey();

import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../data/shipping';

import { getApiUrl, getBaseUrl } from '../lib/api';

// Isolated timer component to avoid full page re-renders
const CountdownDisplay = ({ initialValue, onComplete }: { initialValue: number, onComplete: () => void }) => {
  const [count, setCount] = useState(initialValue);
  useEffect(() => {
    if (count <= 0) {
      onComplete();
      return;
    }
    const timer = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, onComplete]);
  return <span>({count}s)</span>;
};

// SuccessModalContent moved out to prevent re-definition and doubling of scripts
const SuccessModalContent = memo(({ orderId, onBackToHome, isMpConfigured, mpInitialization, mpCustomization, handlePaymentSubmit, clearCart }: any) => {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  return (
    <div className="p-8 text-center flex flex-col items-center">
      <motion.div 
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-6"
      >
        <CheckCircle className="text-green-500" size={32} />
      </motion.div>
      
      <div className="mb-6">
        <h3 className="text-xl font-black uppercase tracking-tighter mb-1 italic text-black">Pedido #{orderId}</h3>
        <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-4">Seu pedido foi registrado e está em análise.</p>
      </div>

      <div className="w-full max-w-sm mx-auto mb-8 border border-black/5 p-4 bg-gray-50/50 min-h-[300px] flex flex-col items-center justify-center relative rounded-sm">
        <div className="absolute inset-0 bg-white/50 z-0 pointer-events-none" />
        <div className="w-full relative z-10">
          {!isMpConfigured ? (
            <div className="p-6 bg-red-50 border border-red-200 text-red-700 text-center">
              <p className="text-[10px] font-black uppercase tracking-widest mb-2">Chave não configurada</p>
              <p className="text-[10px]">Aguarde alguns segundos ou clique em pagar via WhatsApp.</p>
            </div>
          ) : mounted && (
            <div key={`${orderId}-payment-brick`}>
              <Payment
                initialization={mpInitialization}
                customization={mpCustomization}
                onSubmit={handlePaymentSubmit}
              />
            </div>
          )}
        </div>
      </div>

      <div className="w-full max-w-sm mx-auto space-y-3 pt-6 border-t border-black/5">
         <a 
           href={`https://wa.me/5547997465602?text=${encodeURIComponent(`Olá, realizei o pedido #${orderId} e gostaria de confirmar o pagamento.`)}`}
           target="_blank"
           onClick={() => clearCart()}
           className="w-full bg-[#25D366] text-white py-4 text-[10px] font-black uppercase tracking-widest hover:bg-green-600 transition-all flex items-center justify-center gap-2"
         >
           Confirmar / Pagar via WhatsApp
         </a>
         <p className="text-[9px] text-center text-gray-400 uppercase font-bold tracking-widest pt-4">
            Ambiente seguro protegido por criptografia SSL.
         </p>
         <button 
            onClick={onBackToHome}
            className="w-full text-[10px] font-black uppercase tracking-widest text-black/40 hover:text-black transition-colors pt-4 flex items-center justify-center gap-1"
          >
            Voltar para Loja <CountdownDisplay initialValue={30} onComplete={onBackToHome} />
          </button>
      </div>
    </div>
  );
});

export function Checkout() {
  const { items, total, clearCart } = useCart();
  const { user, profile, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  
  const [activePublicKey, setActivePublicKey] = useState(mpPublicKey);

  useEffect(() => {
    // If key not found in import.meta.env, try fetching from server
    if (!activePublicKey) {
      console.log("🔍 [MP] Buscando configuração no servidor...");
      fetch(getApiUrl('/api/payment-config'))
        .then(res => res.json())
        .then(data => {
          if (data && data.publicKey) {
            console.log("✅ [MP] Chave encontrada no servidor:", data.publicKey.substring(0, 8) + "...");
            setActivePublicKey(data.publicKey);
            try {
              initMercadoPago(data.publicKey, { locale: 'pt-BR' });
            } catch (err) {
              console.error("❌ [MP] Erro ao inicializar Mercado Pago:", err);
            }
          } else {
            console.warn("⚠️ [MP] Chave não retornada pelo servidor.");
          }
        })
        .catch(err => console.error("❌ [MP] Erro na rede ao buscar config:", err));
    } else {
      // Primary key found, ensuring it's initialized
      console.log("✅ [MP] Chave encontrada localmente:", activePublicKey.substring(0, 8) + "...");
      try {
        initMercadoPago(activePublicKey, { locale: 'pt-BR' });
      } catch (err) {
        console.error("❌ [MP] Erro ao inicializar MP local:", err);
      }
    }
  }, []);

  const isMpConfigured = !!(activePublicKey && activePublicKey.length > 5);
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    cpf: '',
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
  const [promoValidating, setPromoValidating] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CREDIT_CARD');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoPromoDiscount, setAutoPromoDiscount] = useState(0);

  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [showPaymentBrick, setShowPaymentBrick] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState('');
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    window.scrollTo(0, 0);
    
    // Check auto-timer promo
    const now = Date.now();
    const endTime = Number(localStorage.getItem('f_pac_promo_end') || 0);
    if (endTime > now) {
      setAutoPromoDiscount(Number(localStorage.getItem('f_pac_promo_value') || 0));
    }

    // Check Coupon Validation Session (1 hour)
    const validAt = Number(localStorage.getItem('promo_validated_at') || 0);
    const savedPromo = localStorage.getItem('promoAutoApply');
    
    if (savedPromo) {
      setPromoCode(savedPromo);
      if (now - validAt < 3600000) { // 1 hour = 3600000ms
        setPromoApplied(true);
      }
    } else {
      localStorage.removeItem('promo_validated_at');
    }
  }, []);

  useEffect(() => {
    if (profile) {
      setFormData(prev => ({
        ...prev,
        name: profile.name || prev.name,
        email: profile.email || prev.email,
        phone: profile.phone || prev.phone,
        cpf: profile.cpf || prev.cpf,
        address: profile.address || prev.address,
        number: profile.number || prev.number,
        complement: profile.complement || prev.complement,
        neighborhood: profile.neighborhood || prev.neighborhood,
        city: profile.city || prev.city,
        state: profile.state || prev.state,
        cep: profile.cep || prev.cep,
      }));
    }
  }, [profile]);

  const [dynamicCode] = useState(() => {
    return sessionStorage.getItem('f_pac_dynamic_code') || `FPAC${new Date().getDate()}${new Date().getMonth() + 1}`;
  });

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
    
    if (name === 'phone') {
      const numericValue = value.replace(/\D/g, '').slice(0, 11);
      let maskedValue = numericValue;
      if (numericValue.length > 0) {
        maskedValue = `(${numericValue.slice(0, 2)}`;
        if (numericValue.length > 2) {
          maskedValue += `) ${numericValue.slice(2, 7)}`;
          if (numericValue.length > 7) {
            maskedValue += `-${numericValue.slice(7, 11)}`;
          }
        }
      }
      setFormData(prev => ({ ...prev, [name]: maskedValue }));
    } else if (name === 'cep') {
      const formattedCep = value.replace(/\D/g, '').slice(0, 8);
      if (formattedCep.length === 8) {
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

  const checkCouponRestriction = async () => {
    if (!formData.address || !formData.number) {
       toast.error("Por favor, preencha seu endereço completo para validar o cupom.");
       return false;
    }

    const fullAddress = `${formData.address}, ${formData.number}`.trim().toLowerCase();
    const phone = formData.phone.replace(/\D/g, '');

    // Check for orders in the last 7 days with same address or phone
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const qTime = Timestamp.fromDate(sevenDaysAgo);

    try {
      // Check address
      const qAddr = query(
        collection(db, 'orders'), 
        where('address_search', '==', fullAddress),
        where('createdAt', '>', qTime),
        limit(1)
      );
      const snapAddr = await getDocs(qAddr);
      
      if (!snapAddr.empty) {
        toast.error("Este endereço já utilizou um cupom nos últimos 7 dias.");
        return false;
      }

      // Check phone
      const qPhone = query(
        collection(db, 'orders'),
        where('customerPhoneDigits', '==', phone),
        where('createdAt', '>', qTime),
        limit(1)
      );
      const snapPhone = await getDocs(qPhone);

      if (!snapPhone.empty) {
        toast.error("Este WhatsApp já utilizou um cupom nos últimos 7 dias.");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Erro ao validar restrições do cupom:", error);
      // If error (like missing index), we allow for now but log it
      return true;
    }
  };

  // Email Flow
  const triggerEmail = async (orderId: string, status: string = 'pending', customTotals?: any, paymentLink?: string) => {
    // Determine the base URL for links
    const baseUrl = getBaseUrl();

    console.log(`[EMAIL] Preparando envio. Base URL: ${baseUrl}`);
    
    // Build binary link
    const orderPageLink = `${baseUrl}/#/order/${orderId}`;
    const finalPaymentLink = paymentLink || orderPageLink;
    
    // Fallback totals
    const neighborhoodKey = formData.neighborhood.trim().toUpperCase();
    const neighborhoodPrice = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhoodKey] || DEFAULT_SHIPPING_PRICE;
    const totalQty = items.reduce((acc, it) => acc + it.quantity, 0);
    const freteCalculated = totalQty >= 2 ? 0 : neighborhoodPrice;
    const totalDiscount = (promoApplied && paymentMethod === 'PIX') ? total * 0.05 : 0 + autoPromoDiscount;

    const emailTotals = customTotals || {
      subtotal: total,
      frete: freteCalculated,
      discount: totalDiscount,
      finalTotal: total - totalDiscount + freteCalculated
    };
    
    try {
      const response = await fetch(getApiUrl('/api/send-confirmation'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim(),
          customerName: formData.name.toUpperCase(),
          orderId,
          items: items.map(item => ({
            name: item.name,
            color: item.color,
            size: item.size,
            quantity: item.quantity,
            price: item.price,
          })),
          totals: emailTotals,
          status,
          address: {
            street: formData.address,
            number: formData.number,
            complement: formData.complement,
            neighborhood: formData.neighborhood,
            city: formData.city,
            state: formData.state,
            cep: formData.cep
          },
          paymentMethod: paymentMethod === 'Mercado Pago' ? 'Cartão / PIX' : paymentMethod,
          paymentLink: finalPaymentLink
        })
      });

      let result;
      const text = await response.text();
      try {
        result = JSON.parse(text);
      } catch (e) {
        console.error("[EMAIL] Erro ao analisar resposta:", text);
        return; // Silently fail to not block user experience, but log it
      }

      if (!result.success) {
        console.error("[EMAIL DEBUG] ❌ Erro ao enviar:", result.error);
        // ...
      } else {
        console.log("[EMAIL DEBUG] ✅ E-mail disparado com sucesso!");
        toast.success("E-mail de confirmação enviado!");
      }
    } catch (err: any) {
      console.error("[EMAIL DEBUG] 💥 Falha crítica na chamada da API:", err);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();

    if (items.length === 0) return;

    if (formData.city.trim().toLowerCase() !== 'joinville') {
      toast.error('Pedimos desculpas pelo transtorno, mas não temos disponibilidade de entrega na sua região.');
      return;
    }

    // Final Coupon Session Check
    const validAt = Number(localStorage.getItem('promo_validated_at') || 0);
    const now = Date.now();
    if (promoApplied && (now - validAt > 3600000)) {
       toast.error("Sua validação de cupom expirou (1 hora).");
       setPromoApplied(false);
       localStorage.removeItem('promoAutoApply');
       localStorage.removeItem('promo_validated_at');
       setIsSubmitting(false);
       return;
    }

    setIsSubmitting(true);

    const totalQty = items.reduce((acc, item) => acc + item.quantity, 0);
    const neighborhoodKey = formData.neighborhood.trim().toUpperCase();
    const neighborhoodPrice = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhoodKey] || DEFAULT_SHIPPING_PRICE;
    const frete = totalQty >= 2 ? 0 : neighborhoodPrice;
    const isPix = paymentMethod === 'PIX';
    
    // All PIX payments get 5% off automatic as per banner
    // We check if a 5% discount is already applied via a "PIX" coupon to avoid duplication
    const pixDiscount = isPix ? total * 0.05 : 0;
    
    // If promo is applied, we assume it might be the 5% PIX promo or some other coupon
    // To prevent stacking the 5% PIX automatic with a 5% PIX coupon:
    const autoDiscount = autoPromoDiscount;
    let couponDiscount = 0;
    if (promoApplied) {
       // All our currently configured coupons are 5% for now
       couponDiscount = total * 0.05;
    }

    // Use the maximum of the two if they are both active and seem to be the same "PIX" promo
    // Or just apply them normally if they are different. 
    // The requirement says "CLIQUE E GANHE 5% OFF NO PIX".
    // If they click AND select PIX, it should be 5% TOTAL for pix.
    const effectivePromoDiscount = promoApplied ? Math.max(couponDiscount, pixDiscount) : pixDiscount;
    const totalDiscountAmount = effectivePromoDiscount + autoDiscount;
    const finalTotalValue = Math.max(0, total - totalDiscountAmount + frete);

    const orderId = `PAC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // Save to Firestore
    try {
      // Inventory Check and Update
      await runTransaction(db, async (transaction) => {
        // First check all items
        for (const item of items) {
          const invRef = doc(db, 'inventory', item.id);
          const invSnap = await transaction.get(invRef);
          
          if (invSnap.exists()) {
            const invData = invSnap.data();
            const currentStock = invData.stock ?? 0;
            if (!invData.available || currentStock < item.quantity) {
              throw new Error(`Sinto muito, mas o item "${item.name}" não possui estoque suficiente para sua compra no momento.`);
            }
            transaction.update(invRef, {
              stock: currentStock - item.quantity,
              available: (currentStock - item.quantity) > 0,
              updatedAt: serverTimestamp()
            });
          }
          // If product is not in inventory collection yet, we allow it (backward compatibility or system items)
        }

        // 1. Update User Profile
        if (user) {
          const userRef = doc(db, 'users', user.uid);
          transaction.set(userRef, {
            name: formData.name,
            phone: formData.phone,
            cpf: formData.cpf,
            email: formData.email,
            address: formData.address,
            number: formData.number,
            complement: formData.complement,
            neighborhood: formData.neighborhood,
            city: formData.city,
            state: formData.state,
            cep: formData.cep,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }

        // 2. Create Order
        const orderRef = doc(db, 'orders', orderId);
        transaction.set(orderRef, {
          userId: user?.uid || null,
          cpf: formData.cpf,
          customerName: formData.name,
          customerPhone: formData.phone,
          customerPhoneDigits: formData.phone.replace(/\D/g, ''),
          customerEmail: formData.email,
          address: formData.address,
          address_search: `${formData.address}, ${formData.number}`.trim().toLowerCase(),
          number: formData.number,
          complement: formData.complement,
          neighborhood: formData.neighborhood,
          city: formData.city,
          state: formData.state,
          cep: formData.cep,
          items: items.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            size: item.size,
            color: item.color,
            printConfigs: item.printConfigs || []
          })),
          subtotal: total,
          frete,
          discount: totalDiscountAmount,
          total: finalTotalValue,
          paymentMethod,
          status: 'pending',
          createdAt: serverTimestamp()
        });
      });
    } catch (error: any) {
      if (error.message && error.message.includes('estoque')) {
        toast.error(error.message);
        setIsSubmitting(false);
        return;
      }
      handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
    }

    // Trigger Email Flow
    triggerEmail(orderId, 'pending');

    // Build WhatsApp message
    let message = `Olá, *${formData.name.toUpperCase()}*!%0A%0A`;
    message += `Seu pedido *${orderId}* foi recebido com sucesso.%0A`;
    message += `Por segurança, não compartilhe este código com terceiros. Ele é exclusivo para a sua compra e garante a identificação correta do seu pedido.%0A%0A`;
    message += `Obrigado pela compra! Em breve, enviaremos novas atualizações.`;

    if (paymentMethod === 'PIX') {
      message += `%0A%0A⚠️ *IMPORTANTE:*%0A%0AApós realizar o pagamento via PIX, envie o comprovante para confirmação do seu pedido.%0ASem o envio do comprovante, não conseguimos dar andamento na separação e envio.`;
    }

    const customerPhone = formData.phone.replace(/\D/g, '');
    const url = `https://wa.me/${customerPhone}?text=${message}`;

    window.open(url, '_blank');
    
    toast.success("Pedido realizado! Redirecionando...", { duration: 4000 });
    
    // Clear cart immediately after success
    setTimeout(() => {
      clearCart();
      setIsSubmitting(false);
      navigate(`/order/${orderId}`);
    }, 4000);
  };

  const totalQty = items.reduce((acc, item) => acc + item.quantity, 0);
  const isJoinville = formData.city.trim().toLowerCase() === 'joinville';
  const neighborhoodKey = formData.neighborhood.trim().toUpperCase();
  const neighborhoodPrice = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhoodKey] || DEFAULT_SHIPPING_PRICE;
  const frete = totalQty >= 2 ? 0 : neighborhoodPrice;
  const isPixSelected = paymentMethod === 'PIX';
  
  // All PIX payments get 5% off automatic
  const pixDiscountSelected = isPixSelected ? total * 0.05 : 0;
  const autoDiscountSelected = autoPromoDiscount;
  
  // Logical check for PIX stacking
  const couponDiscountSelected = promoApplied ? total * 0.05 : 0;
  const effectivePromoDiscountSelected = promoApplied ? Math.max(couponDiscountSelected, pixDiscountSelected) : pixDiscountSelected;
  const totalDiscountAmountSelected = effectivePromoDiscountSelected + autoDiscountSelected;
  
  const isAddressFilled = formData.cep.replace(/\D/g, '').length === 8 && formData.address.length > 0 && formData.number.length > 0;
  const shippingAvailable = !isAddressFilled || isJoinville;

  const isFormValid = 
    formData.name.trim().length > 3 &&
    formData.phone.replace(/\D/g, '').length === 11 &&
    formData.email.includes('@') &&
    formData.cpf.replace(/\D/g, '').length === 11 &&
    formData.cep.replace(/\D/g, '').length === 8 && 
    formData.address.length > 0 && 
    formData.number.length > 0 &&
    formData.neighborhood.length > 0 &&
    formData.city.length > 0;

  const currentFrete = isAddressFilled && isJoinville ? frete : 0;
  const finalTotalAmount = total - totalDiscountAmountSelected + currentFrete;

  const mpInitialization = useMemo(() => ({ 
    amount: Number(finalTotalAmount.toFixed(2)),
    payer: {
      email: formData.email || user?.email || 'vendas@fpacstore.com.br',
    }
  }), [finalTotalAmount, formData.email, user?.email]);

  const mpCustomization = useMemo(() => ({
    paymentMethods: {
      bankTransfer: paymentMethod === 'PIX' ? ['pix' as const] : [],
      creditCard: paymentMethod === 'CREDIT_CARD' ? 'all' as const : [],
    },
    visual: {
      style: {
        theme: 'flat' as const,
      }
    }
  }), [paymentMethod]);

  const handleStartCheckout = async () => {
    if (!isFormValid) {
      toast.error("Preencha todos os campos corretamente (incluindo CPF e Celular).");
      return;
    }
    if (!shippingAvailable) {
      toast.error("Infelizmente não entregamos nesta região.");
      return;
    }

    setIsSubmitting(true);
    const orderId = `PAC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    
    try {
      await runTransaction(db, async (transaction) => {
        // Initial Order Creation (status: pending)
        const orderRef = doc(db, 'orders', orderId);
        transaction.set(orderRef, {
          userId: user?.uid || null,
          cpf: formData.cpf,
          customerName: formData.name,
          customerPhone: formData.phone,
          customerPhoneDigits: formData.phone.replace(/\D/g, ''),
          customerEmail: formData.email,
          address: formData.address,
          address_search: `${formData.address}, ${formData.number}`.trim().toLowerCase(),
          number: formData.number,
          complement: formData.complement,
          neighborhood: formData.neighborhood,
          city: formData.city,
          state: formData.state,
          cep: formData.cep,
          items: items.map(item => ({
            id: item.id,
            name: item.name,
            image: item.image,
            quantity: item.quantity,
            price: item.price,
            size: item.size,
            color: item.color,
            printConfigs: item.printConfigs || []
          })),
          subtotal: total,
          frete: currentFrete,
          discount: discountAmount,
          total: finalTotal,
          paymentMethod: isPix ? 'PIX' : 'CREDIT_CARD',
          promoApplied: promoApplied,
          promoCode: promoApplied ? promoCode : null,
          autoDiscount: autoDiscount,
          status: 'pending',
          createdAt: serverTimestamp()
        });

        // Update profile
        if (user) {
          const userRef = doc(db, 'users', user.uid);
          transaction.set(userRef, {
            name: formData.name,
            phone: formData.phone,
            cpf: formData.cpf,
            email: formData.email,
            address: formData.address,
            number: formData.number,
            complement: formData.complement,
            neighborhood: formData.neighborhood,
            city: formData.city,
            state: formData.state,
            cep: formData.cep,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      });

      setCreatedOrderId(orderId);
      setShowSuccessModal(true);
      setCountdown(30); // Reset timer to 30
      
      const orderLink = `${getBaseUrl()}/#/order/${orderId}`;
      
      // Trigger Email Flow (Initial)
      await triggerEmail(orderId, 'pending', {
        subtotal: total,
        frete: currentFrete,
        discount: discountAmount,
        finalTotal: finalTotal
      }, orderLink); // Sending order link as fallback payment link

    // Build WhatsApp message
    let message = `Olá, *${formData.name.toUpperCase()}*!%0A%0A`;
    message += `Seu pedido *#${orderId}* na *F PAC STORE* foi recebido com sucesso.%0A%0A`;
    message += `🔗 *LINK PARA PAGAMENTO E ACOMPANHAMENTO:*%0A${orderLink}%0A%0A`;
    message += `Obrigado pela compra! Qualquer dúvida, estamos aqui.`;

    const customerPhone = formData.phone.replace(/\D/g, '');
    const url = `https://wa.me/${customerPhone}?text=${message}`;
    
    // Non-auto clearing of cart here to avoid R$ 0.00 payment brick
    // clearCart() will be called when user chooses to exit this flow or after payment success
    } catch (error) {
      console.error("Erro ao iniciar pedido:", error);
      toast.error("Erro ao criar seu pedido. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSubmit = async ({ formData: mpFormData }: any) => {
    setIsSubmitting(true);
    try {
      const response = await fetch(getApiUrl('/api/process_payment'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formData: {
            ...mpFormData,
            external_reference: createdOrderId,
            description: `Pedido F PAC STORE - ${formData.name}`,
          }
        }),
      });

      let result;
      const text = await response.text();
      try {
        result = JSON.parse(text);
      } catch (e) {
        console.error("Erro ao analisar resposta do servidor:", text);
        toast.error("O servidor enviou uma resposta inválida. Verifique se as chaves nos Secrets estão corretas e reinicie o servidor.");
        setIsSubmitting(false);
        return;
      }

      if (response.ok) {
        setPaymentResult(result);
        
        // Detect actual payment method from MP
        const mpMethodId = mpFormData.payment_method_id;
        const actualMethod = mpMethodId === 'pix' ? 'PIX' : 'Cartão de Crédito';
        setPaymentMethod(actualMethod);

        // Trigger Email Flow (Update with payment status)
        const paymentUrl = result.point_of_interaction?.transaction_data?.ticket_url || 
                          result.transaction_details?.external_resource_url;

        const orderId = await finalizeOrder(result.id, result.status, createdOrderId, paymentUrl, actualMethod);
        
        await triggerEmail(orderId, result.status, {
          frete: currentFrete,
          discount: discountAmount,
          finalTotal: finalTotal
        }, paymentUrl);

        // If it's approved (Credit Card normally), redirects to status page which will show the success modal
        if (result.status === 'approved') {
          clearCart();
          setTimeout(() => {
            navigate(`/order/${orderId}`);
          }, 3000);
        }
      } else {
        toast.error("Pagamento não processado. Confira os dados do cartão.");
      }
    } catch (error) {
      console.error("Erro no checkout MP:", error);
      toast.error("Erro ao conectar com o processador de pagamentos.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const finalizeOrder = async (mpId: string, mpStatus: string, existingOrderId?: string, paymentLink?: string, paymentMethodName?: string) => {
    const totalQty = items.reduce((acc, item) => acc + item.quantity, 0);
    const neighborhoodKey = formData.neighborhood.trim().toUpperCase();
    const neighborhoodPrice = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhoodKey] || DEFAULT_SHIPPING_PRICE;
    const freteVal = totalQty >= 2 ? 0 : neighborhoodPrice;
    
    const discountAmountVal = discountAmount;
    const finalTotalVal = Math.max(0, total - discountAmountVal + freteVal);

    const orderId = existingOrderId || `PAC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    const actualPaymentMethod = paymentMethodName || paymentMethod;

    // Build Detailed Summary
    let summary = `*PEDIDO FINALIZADO - F PAC STORE*\n\n`;
    summary += `ID: ${orderId}\n`;
    summary += `Status Pagamento: ${mpStatus.toUpperCase()}\n`;
    summary += `MP ID: ${mpId}\n\n`;
    summary += `*CLIENTE: ${formData.name.toUpperCase()}*\n`;
    summary += `WhatsApp: ${formData.phone}\n\n`;
    summary += `*ITENS:*\n`;
    items.forEach(item => {
      summary += `· ${item.quantity}x ${item.name.toUpperCase()} (${item.color}/${item.size}) - R$ ${(item.price * item.quantity).toFixed(2)}\n`;
    });
    summary += `\n*TOTAL:* R$ ${finalTotalVal.toFixed(2)}\n`;

    try {
      await runTransaction(db, async (transaction) => {
        // Stock check and decrement
        for (const item of items) {
          const invRef = doc(db, 'inventory', item.id);
          const invSnap = await transaction.get(invRef);
          if (invSnap.exists()) {
            const invData = invSnap.data();
            const currentStock = invData.stock ?? 0;
            // We allow finalizeOrder to proceed even if stock is low, as payment was already attempted
            // but we update the stock level safely
            const newStock = Math.max(0, currentStock - item.quantity);
            transaction.update(invRef, {
              stock: newStock,
              available: newStock > 0,
              updatedAt: serverTimestamp()
            });
          }
        }

        // Update profile
        if (user) {
          const userRef = doc(db, 'users', user.uid);
          transaction.set(userRef, {
            name: formData.name,
            phone: formData.phone,
            cpf: formData.cpf,
            email: formData.email,
            address: formData.address,
            number: formData.number,
            complement: formData.complement,
            neighborhood: formData.neighborhood,
            city: formData.city,
            state: formData.state,
            cep: formData.cep,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }

        // Create order
        const orderRef = doc(db, 'orders', orderId);
        transaction.set(orderRef, {
          userId: user?.uid || null,
          cpf: formData.cpf,
          customerName: formData.name,
          customerPhone: formData.phone,
          customerPhoneDigits: formData.phone.replace(/\D/g, ''),
          customerEmail: formData.email,
          address: formData.address,
          address_search: `${formData.address}, ${formData.number}`.trim().toLowerCase(),
          number: formData.number,
          complement: formData.complement,
          neighborhood: formData.neighborhood,
          city: formData.city,
          state: formData.state,
          cep: formData.cep,
          items: items.map(item => ({
            id: item.id,
            name: item.name,
            image: item.image,
            quantity: item.quantity,
            price: item.price,
            size: item.size,
            color: item.color,
            printConfigs: item.printConfigs || []
          })),
          subtotal: total,
          frete: freteVal,
          discount: discountAmountVal,
          total: finalTotalVal,
          paymentStatus: mpStatus,
          paymentId: mpId,
          paymentMethod: actualPaymentMethod,
          paymentLink: paymentLink || null,
          status: mpStatus === 'approved' ? 'validated' : 'pending',
          createdAt: serverTimestamp()
        });
      });

      return orderId;
    } catch (error) {
      console.error("Erro ao salvar pedido após pagamento:", error);
      handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
    }
  };

  const handleApplyPromo = async () => {
    if (promoCode.trim().toUpperCase() === dynamicCode) {
      setPromoValidating(true);
      const allowed = await checkCouponRestriction();
      if (allowed) {
        setPromoApplied(true);
        localStorage.setItem('promoAutoApply', promoCode.trim().toUpperCase());
        localStorage.setItem('promo_validated_at', Date.now().toString());
      }
      setPromoValidating(false);
    } else {
      toast.error('Código promocional inválido ou expirado.');
      setPromoApplied(false);
    }
  };


  if (items.length === 0 && !showSuccessModal && !createdOrderId && !isSubmitting) {
    return (
      <div className="min-h-screen pt-32 pb-24 flex flex-col items-center justify-center max-w-xl mx-auto text-center">
        <h1 className="text-3xl font-heading font-black uppercase mb-4 text-black">Sua sacola está vazia</h1>
        <p className="text-gray-600 mb-8">Adicione peças ao seu carrinho antes de prosseguir para o checkout.</p>
        <Link to="/catalog" className="bg-[#eab308] text-black font-bold uppercase px-8 py-3 rounded-none hover:bg-white transition-colors">
          Voltar para loja
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-32 md:pt-48 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <h1 className="text-3xl md:text-5xl font-heading font-black tracking-tighter uppercase mb-12">
        Checkout <span className="text-[#eab308]">Express</span>
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
        
        {/* Form */}
        <div className="md:col-span-7">
          {!user && (
            <div className="mb-6 p-6 border border-[#eab308] bg-[#eab308]/5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-[#eab308] p-2 rounded-none text-black">
                  <LogIn size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Já possui conta?</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-widest">Entre para preencher seus dados automaticamente.</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={loginWithGoogle}
                className="bg-black text-[#eab308] font-black text-[10px] uppercase tracking-widest px-6 py-3 hover:bg-[#eab308] hover:text-black transition-all"
              >
                Entrar com Google
              </button>
            </div>
          )}
          <form 
            id="checkout-form" 
            onSubmit={handleCheckout} 
            onKeyDown={(e) => { 
              if (e.key === 'Enter') e.preventDefault(); 
            }}
            className="space-y-8 p-6 md:p-8 bg-black/5 border border-black/10 rounded-none font-bold"
          >
             <div>
                <h3 className="font-bold text-xl mb-4 font-heading uppercase tracking-wide">Dados Pessoais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="md:col-span-2">
                     <input required type="text" name="name" value={formData.name} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="NOME COMPLETO" />
                   </div>
                   <div className="md:col-span-1">
                     <input required type="text" name="phone" value={formData.phone} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="WHATSAPP (DDD + NÚMERO)" maxLength={15} />
                      <p className="text-[8px] text-gray-400 mt-1 uppercase font-bold tracking-widest">Obrigatório 11 dígitos com DDD</p>
                   </div>
                   <div className="md:col-span-1">
                     <input required type="text" name="cpf" value={formData.cpf} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="CPF (PARA O PAGAMENTO)" />
                   </div>
                   <div className="md:col-span-2">
                     <input required type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="E-MAIL" />
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
                     <input type="text" name="complement" value={formData.complement} onChange={handleInputChange} className="w-full bg-black/5 border border-black/10 rounded-none p-3 text-[10px] focus:outline-none focus:border-[#eab308]" placeholder="COMPLEMENTO (APTO, BLOCO...)" />
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

              <div className="border-t border-black/5 pt-8 mt-8">
                <h3 className="font-bold text-xl mb-6 font-heading uppercase tracking-wide italic">Meios de pagamento</h3>
                <div className="space-y-3">
                  <label className={cn(
                    "flex items-center gap-4 p-5 border-2 cursor-pointer transition-all hover:bg-gray-50",
                    paymentMethod === 'CREDIT_CARD' ? "border-[#eab308] bg-[#eab308]/5" : "border-black/5 bg-white"
                  )}>
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="CREDIT_CARD" 
                      checked={paymentMethod === 'CREDIT_CARD'}
                      onChange={() => setPaymentMethod('CREDIT_CARD')}
                      className="w-5 h-5 accent-[#eab308]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                         <CreditCard size={18} className="text-black/60" />
                         <span className="text-[11px] font-black uppercase tracking-widest">Cartão de Crédito</span>
                      </div>
                      <p className="text-[9px] text-gray-400 uppercase font-black opacity-60 mt-1">Parcelamento em até 12x</p>
                    </div>
                  </label>

                  <label className={cn(
                    "flex items-center gap-4 p-5 border-2 cursor-pointer transition-all hover:bg-gray-50",
                    paymentMethod === 'PIX' ? "border-[#eab308] bg-[#eab308]/5" : "border-black/5 bg-white"
                  )}>
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="PIX" 
                      checked={paymentMethod === 'PIX'}
                      onChange={() => setPaymentMethod('PIX')}
                      className="w-5 h-5 accent-[#eab308]"
                    />
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <div className="flex items-center gap-2">
                           <QrCode size={18} className="text-black/60" />
                           <span className="text-[11px] font-black uppercase tracking-widest">Pix</span>
                        </div>
                        <span className="bg-green-600 text-white text-[8px] font-black px-2 py-0.5 uppercase tracking-widest text-center self-start">5% OFF EXCLUSIVO</span>
                      </div>
                      <p className="text-[9px] text-gray-400 uppercase font-black opacity-60 mt-1">Aprovação imediata</p>
                    </div>
                  </label>
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
                     disabled={promoApplied || !promoCode || promoValidating}
                     className="bg-black text-white px-4 py-2 text-[10px] font-bold uppercase disabled:opacity-50 flex items-center justify-center min-w-[100px]"
                   >
                     {promoValidating ? <Loader2 size={12} className="animate-spin" /> : (promoApplied ? 'Validado' : 'Validar')}
                   </button>
                 </div>
                 {promoApplied && (
                   <p className="text-[9px] text-[#eab308] font-bold uppercase tracking-widest mt-1">
                     ✅ cupom ativo (válido por 1 hora)
                   </p>
                 )}
              </div>

              <div className="border-t border-black/10 pt-4 mb-4">
                 <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3 font-black">Informações Adicionais</h3>
                 <p className="text-[10px] text-gray-400 font-black">Clique em "Finalizar Pedido" para completar sua compra com segurança via Mercado Pago.</p>
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
                 {(effectivePromoDiscountSelected > 0) && (
                   <div className="flex flex-col gap-1">
                     <div className="flex justify-between text-[#eab308] text-sm font-medium">
                        <span>🏷️ Desconto PIX / Cupom (5% OFF)</span>
                        <span>- R$ {effectivePromoDiscountSelected.toFixed(2)}</span>
                     </div>
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
                    <span>R$ {finalTotalAmount.toFixed(2)}</span>
                 </div>
              </div>

        {/* Success Modal */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
            <motion.div 
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-white max-w-lg w-full max-h-[90vh] overflow-y-auto rounded-none relative"
            >
              <div className="sticky top-0 z-10 bg-white border-b border-black/5 p-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <ShieldCheck size={18} className="text-[#eab308]" />
                   <h2 className="text-sm font-black uppercase tracking-tighter italic">Checkout Seguro</h2>
                </div>
                <button 
                  onClick={() => {
                    clearCart();
                    navigate(`/order/${createdOrderId}`);
                  }}
                  className="text-[10px] font-bold uppercase underline text-gray-400 hover:text-black"
                >
                  Pagar Depois
                </button>
              </div>

              <SuccessModalContent 
                orderId={createdOrderId}
                onBackToHome={() => {
                  clearCart();
                  navigate('/');
                }}
                isMpConfigured={isMpConfigured}
                mpInitialization={mpInitialization}
                mpCustomization={mpCustomization}
                handlePaymentSubmit={handlePaymentSubmit}
                clearCart={clearCart}
              />
            </motion.div>
          </div>
        )}

               {paymentResult ? (
                  <div className="bg-white border border-black/10 p-6 space-y-4 mb-6">
                    <h4 className="font-black uppercase text-center text-green-600">Pedido Recebido!</h4>
                    
                    {paymentResult.status === 'pending' && (paymentResult.qr_code_base64 || paymentResult.qr_code) && (
                      <div className="flex flex-col items-center">
                        <p className="text-[10px] text-center mb-4 font-bold uppercase tracking-widest text-gray-500">Escaneie o QR Code ou copie a chave abaixo para pagar via PIX</p>
                        {paymentResult.qr_code_base64 && (
                          <img 
                            src={`data:image/jpeg;base64,${paymentResult.qr_code_base64}`} 
                            alt="QR Code PIX" 
                            className="w-48 h-48 mb-4 border border-black/10 shadow-lg"
                          />
                        )}
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(paymentResult.qr_code);
                            toast.success("Código PIX copiado!");
                          }}
                          className="w-full bg-black text-white text-[10px] font-bold py-3 uppercase tracking-widest hover:bg-[#eab308] hover:text-black transition-colors mb-4"
                        >
                          Copiar Código PIX
                        </button>
                        <button 
                          onClick={() => {
                            navigate('/');
                          }}
                          className="w-full bg-[#eab308] text-black text-[10px] font-bold py-3 uppercase tracking-widest hover:bg-black hover:text-white transition-colors"
                        >
                          Ir para o Início
                        </button>
                      </div>
                    )}

                    {paymentResult.status === 'approved' && (
                      <div className="text-center py-4 bg-green-50 rounded-none border border-green-200">
                        <p className="text-sm font-bold text-green-800">Seu pagamento foi aprovado!</p>
                        <p className="text-[10px] text-green-600 uppercase mt-1">Você receberá a confirmação por e-mail.</p>
                      </div>
                    )}

                    <div className="pt-4 border-t border-black/5">
                      <button 
                        onClick={() => {
                          navigate('/catalog');
                        }}
                        className="w-full bg-[#eab308] text-black font-black py-4 text-[10px] uppercase tracking-widest"
                      >
                        Continuar Comprando
                      </button>
                    </div>
                  </div>
                ) : (showPaymentBrick && !showSuccessModal) ? (
                  <div className="bg-white p-4 border border-black/10 mb-6">
    </div>
               ) : showPaymentBrick ? (
                 <div className="bg-white p-4 border border-black/10 mb-6">
                    <h4 className="font-black uppercase text-xs mb-4 flex items-center justify-between">
                      <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-green-600" /> Pagamento Seguro</span>
                      <button onClick={() => setShowPaymentBrick(false)} className="text-[10px] text-gray-400 hover:text-black underline">Voltar</button>
                    </h4>
                    
                    {!isMpConfigured ? (
                      <div className="p-6 bg-red-50 border border-red-200 text-red-700 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle size={16} />
                          <span className="text-[11px] font-black uppercase tracking-widest">Configuração Pendente</span>
                        </div>
                        <p className="text-[10px] leading-relaxed mb-3">
                          O módulo de pagamento automático ainda não detectou sua chave. 
                          Certifique-se de que adicionou <strong>VITE_MP_PUBLIC_KEY</strong> nos Secrets e reiniciou o servidor.
                        </p>
                        <div className="pt-2 border-t border-red-200 space-y-2">
                          <p className="text-[9px] font-bold uppercase mb-1">Ações:</p>
                          <button 
                            onClick={async () => {
                              console.log("🔄 [MP] Tentando forçar recarregamento da chave...");
                              try {
                                const res = await fetch(getApiUrl('/api/payment-config'));
                                const data = await res.json();
                                if (data.publicKey) {
                                  setActivePublicKey(data.publicKey);
                                  initMercadoPago(data.publicKey, { locale: 'pt-BR' });
                                  toast.success("Configuração detectada!");
                                } else {
                                  toast.error("Ainda não detectado no servidor.");
                                }
                              } catch (err) {
                                toast.error("Erro ao conectar com servidor.");
                              }
                            }}
                            className="w-full bg-black text-white py-2 text-[9px] font-black uppercase hover:bg-slate-800 transition-colors"
                          >
                            Tentar Detectar Agora
                          </button>
                          <button 
                            onClick={() => setPaymentMethod('pix')}
                            className="w-full bg-white border border-red-200 py-2 text-[9px] font-black uppercase hover:bg-red-100 transition-colors"
                          >
                            Pagar via PIX Direto
                          </button>
                        </div>
                      </div>
                    ) : (
                      <Payment
                        initialization={mpInitialization}
                        customization={mpCustomization}
                        onSubmit={handlePaymentSubmit}
                      />
                    )}
                 </div>
               ) : (
                 <button 
                   type="button"
                   onClick={handleStartCheckout}
                   disabled={isSubmitting}
                   className="w-full bg-[#eab308] text-black font-black py-5 text-sm uppercase tracking-[0.2em] hover:bg-white transition-all transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mb-6"
                 >
                    {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : 'Finalizar Pedido'} <ArrowRight size={18} />
                 </button>
               )}
              
              <p className="text-xs text-center text-gray-500 mt-4 flex items-center justify-center gap-1 opacity-10">
                 Confiança F PAC Store.
              </p>
           </div>
        </div>

      </div>
    </div>
  );
}
