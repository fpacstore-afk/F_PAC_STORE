import type React from 'react';
import { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { ShieldCheck, ArrowRight, Loader2, LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { doc, setDoc, serverTimestamp, getDocs, query, where, orderBy, limit, Timestamp, collection, runTransaction, getDoc } from 'firebase/firestore';
import { auth, db, OperationType, handleFirestoreError } from '../lib/firebase';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import toast from 'react-hot-toast';

// Initialize MP with Public Key
const mpPublicKey = import.meta.env.VITE_MP_PUBLIC_KEY;
if (mpPublicKey) {
  initMercadoPago(mpPublicKey, { locale: 'pt-BR' });
} else {
  console.warn("⚠️ VITE_MP_PUBLIC_KEY não configurada. O checkout do Mercado Pago não funcionará até que você adicione as chaves nas configurações.");
}





import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../data/shipping';

export function Checkout() {
  const { items, total, clearCart } = useCart();
  const { user, profile, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  
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
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoPromoDiscount, setAutoPromoDiscount] = useState(0);

  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [showPaymentBrick, setShowPaymentBrick] = useState(false);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState('');
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (showSuccessModal && countdown > 0) {
      timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    } else if (showSuccessModal && countdown === 0) {
      setShowPaymentBrick(true);
      setShowSuccessModal(false);
    }
    return () => clearTimeout(timer);
  }, [showSuccessModal, countdown]);

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
    console.log(`[EMAIL DEBUG] 🚀 Tentando disparar e-mail para pedido: ${orderId} (Status: ${status})`);
    
    // Fallback para totals se não passados
    const neighborhoodKey = formData.neighborhood.trim().toUpperCase();
    const neighborhoodPrice = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhoodKey] || DEFAULT_SHIPPING_PRICE;
    const totalQty = items.reduce((acc, it) => acc + it.quantity, 0);
    const freteCalculated = totalQty >= 2 ? 0 : neighborhoodPrice;
    
    // Se temos descontos calculados no momento da chamada (como no PIX), usamos eles
    const pixDiscountVal = (promoApplied && paymentMethod === 'PIX') ? total * 0.05 : 0;
    const totalDiscount = pixDiscountVal + autoPromoDiscount;

    const emailTotals = customTotals || {
      subtotal: total,
      frete: freteCalculated,
      discount: totalDiscount,
      finalTotal: total - totalDiscount + freteCalculated
    };
    
    try {
      const response = await fetch('/api/send-confirmation', {
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
          paymentMethod,
          paymentLink
        })
      });

      const result = await response.json();
      if (!result.success) {
        console.error("[EMAIL DEBUG] ❌ Erro ao enviar:", result.error);
        if (result.error?.message?.includes("sandbox")) {
          toast.error("Serviço de e-mail em modo teste. O e-mail só será enviado se seu domínio estiver verificado no Resend.");
        } else {
          toast.error(`Aviso: E-mail de confirmação não pôde ser enviado: ${result.error?.message || 'Erro no servidor'}`);
        }
      } else {
        console.log("[EMAIL DEBUG] ✅ E-mail disparado com sucesso!");
        toast.success("E-mail de confirmação enviado!");
      }
    } catch (err) {
      console.error("[EMAIL DEBUG] 💥 Erro na chamada da API:", err);
      toast.error("Erro de conexão ao enviar e-mail de confirmação.");
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
    
    // Original Promo Code (5% PIX)
    const pixDiscount = (promoApplied && isPix) ? total * 0.05 : 0;
    
    const autoDiscount = autoPromoDiscount;
    const discountAmount = pixDiscount + autoDiscount;
    const finalTotal = Math.max(0, total - discountAmount + frete);

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
          discount: discountAmount,
          total: finalTotal,
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
    clearCart();

    // Add a manual link just in case popup was blocked
    const manualLink = document.createElement('div');
    manualLink.innerHTML = `
      <div id="manual-whatsapp-modal" style="position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:white; padding:30px; border:4px solid black; z-index:9999; text-align:center; box-shadow: 0 20px 50px rgba(0,0,0,0.3); max-width: 90%; width: 400px;">
        <h3 style="font-weight:900; text-transform:uppercase; margin-bottom:15px;">Quase lá!</h3>
        <p style="font-size:14px; margin-bottom:20px;">O WhatsApp não abriu automaticamente? Clique no botão abaixo para finalizar:</p>
        <a href="${url}" target="_blank" style="display:block; background:#25D366; color:white; padding:15px; text-decoration:none; font-weight:bold; text-transform:uppercase; margin-bottom:10px;">Clique aqui para abrir WhatsApp</a>
        <button onclick="document.getElementById('manual-whatsapp-modal').remove()" style="font-size:10px; color:gray; text-decoration:underline;">Fechar este aviso</button>
      </div>
    `;
    document.body.appendChild(manualLink.firstElementChild!);

    setTimeout(() => {
      setIsSubmitting(false);
      navigate(`/order/${orderId}`);
    }, 4000);
  };

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
          paymentMethod: 'Mercado Pago',
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
      setCountdown(10); // Reset timer
      
      // Clear cart immediately after creating the order
      clearCart();

      // Trigger Email Flow (Initial)
      await triggerEmail(orderId, 'pending', {
        subtotal: total,
        frete: currentFrete,
        discount: discountAmount,
        finalTotal: finalTotal
      });
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
      const response = await fetch('/api/process_payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          formData: {
            ...mpFormData,
            description: `Pedido F PAC STORE - ${formData.name}`,
          }
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setPaymentResult(result);
        
        // Trigger Email Flow (Update with payment status)
        const paymentUrl = result.point_of_interaction?.transaction_data?.ticket_url || 
                          result.transaction_details?.external_resource_url;

        const orderId = await finalizeOrder(result.id, result.status, createdOrderId, paymentUrl);
        
        await triggerEmail(orderId, result.status, {
          frete: currentFrete,
          discount: discountAmount,
          finalTotal: finalTotal
        }, paymentUrl);

        // If it's approved (Credit Card normally), redirects to status page which will show the success modal
        if (result.status === 'approved') {
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

  const finalizeOrder = async (mpId: string, mpStatus: string, existingOrderId?: string, paymentLink?: string) => {
    const totalQty = items.reduce((acc, item) => acc + item.quantity, 0);
    const neighborhoodKey = formData.neighborhood.trim().toUpperCase();
    const neighborhoodPrice = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhoodKey] || DEFAULT_SHIPPING_PRICE;
    const freteVal = totalQty >= 2 ? 0 : neighborhoodPrice;
    
    const discountAmountVal = discountAmount;
    const finalTotalVal = Math.max(0, total - discountAmountVal + freteVal);

    const orderId = existingOrderId || `PAC-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

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
    <div className="min-h-screen pt-28 md:pt-44 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
            className="space-y-8 p-6 md:p-8 bg-black/5 border border-black/10 rounded-none"
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
                 <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Informações Adicionais</h3>
                 <p className="text-[10px] text-gray-400">Ao clicar em "Ir para o Pagamento", você poderá escolher entre PIX ou Cartão de Crédito com o Checkout Seguro do Mercado Pago.</p>
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

               {showSuccessModal && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-white max-w-md w-full p-8 text-center relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 w-full h-1 bg-black/10">
                        <motion.div 
                          initial={{ width: "100%" }}
                          animate={{ width: "0%" }}
                          transition={{ duration: 10, ease: "linear" }}
                          className="h-full bg-[#eab308]"
                        />
                      </div>

                      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShieldCheck size={40} />
                      </div>
                      
                      <h2 className="text-2xl font-black uppercase tracking-tighter mb-2 italic">Pedido Recebido!</h2>
                      <p className="text-gray-500 text-xs uppercase tracking-widest font-bold mb-6">ID: {createdOrderId}</p>
                      
                      <p className="text-sm text-gray-600 mb-8">
                        Seu pedido foi registrado com sucesso. Escolha uma opção abaixo ou aguarde o redirecionamento automático para o pagamento.
                      </p>

                      <div className="flex flex-col gap-3">
                        <button 
                          onClick={() => {
                            navigate(`/order/${createdOrderId}`);
                          }}
                          className="w-full bg-black text-white py-4 text-[10px] font-black uppercase tracking-widest hover:bg-gray-900 transition-all"
                        >
                          Acompanhar Pedido
                        </button>
                        <button 
                          onClick={() => {
                            setShowPaymentBrick(true);
                            setShowSuccessModal(false);
                          }}
                          className="w-full bg-[#eab308] text-black py-4 text-[10px] font-black uppercase tracking-widest hover:bg-white border border-[#eab308] transition-all"
                        >
                          Ir para o Pagamento ({countdown}s)
                        </button>
                      </div>
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
               ) : showPaymentBrick ? (
                 <div className="bg-white p-4 border border-black/10 mb-6">
                    <h4 className="font-black uppercase text-xs mb-4 flex items-center justify-between">
                      <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-green-600" /> Pagamento Seguro</span>
                      <button onClick={() => setShowPaymentBrick(false)} className="text-[10px] text-gray-400 hover:text-black underline">Voltar</button>
                    </h4>
                    <Payment
                      initialization={{ 
                        amount: finalTotal,
                        payer: {
                          email: formData.email,
                        }
                      }}
                      customization={{
                        paymentMethods: {
                          bankTransfer: ['pix'],
                          creditCard: 'all',
                        },
                      }}
                      onSubmit={handlePaymentSubmit}
                    />
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
