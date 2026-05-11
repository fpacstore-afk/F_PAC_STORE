import React, { useState } from 'react';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import { getApiUrl } from '../lib/api';
import toast from 'react-hot-toast';
import { Loader2, ShieldCheck, Lock } from 'lucide-react';

interface TransparentCheckoutProps {
  publicKey: string;
  preferenceId: string | null;
  orderId: string;
  amount: number;
  paymentMethod: string;
  customerInfo: {
    email: string;
    name: string;
    cpf?: string;
  };
  onSuccess: (paymentId: string) => void;
  onFailure: (error: any) => void;
}

export function TransparentCheckout({ 
  publicKey, 
  preferenceId,
  orderId, 
  amount, 
  paymentMethod,
  customerInfo,
  onSuccess,
  onFailure
}: TransparentCheckoutProps) {
  const [loading, setLoading] = useState(true);

  // Initialize MP inside useEffect
  React.useEffect(() => {
    try {
      console.log("🛠️ [MP] Initializing with preferenceId:", preferenceId);
      initMercadoPago(publicKey, { locale: 'pt-BR' });
      
      // Safety timeout
      const timeout = setTimeout(() => {
        if (loading) {
          console.warn("⚠️ [MP] onReady demorou muito, forçando exibição.");
          setLoading(false);
        }
      }, 15000);

      return () => clearTimeout(timeout);
    } catch (err) {
      console.error("MP Init error:", err);
    }
  }, [publicKey, preferenceId]);

  const initialization = React.useMemo(() => {
    const base = {
      amount: Number(amount),
      payer: {
        email: customerInfo.email || '',
        firstName: customerInfo.name.split(' ')[0] || 'Cliente',
        lastName: customerInfo.name.split(' ').slice(1).join(' ') || 'PAC',
        identification: {
          type: 'CPF',
          number: customerInfo.cpf?.replace(/\D/g, '') || '',
        },
      },
    };

    if (preferenceId) {
      return { ...base, preferenceId };
    }
    return base;
  }, [amount, preferenceId, customerInfo]);

  const customization = React.useMemo(() => ({
    paymentMethods: {
      ticket: [] as any, 
      bankTransfer: ['pix'] as any,
      creditCard: ['all'] as any,
      debitCard: ['all'] as any,
      mercadoPago: ['all'] as any,
      maxInstallments: 12,
    },
    visual: {
      style: {
        theme: 'flat' as const,
      }
    }
  }), []);

  const onSubmit = async ({ selectedPaymentMethod, formData }: any) => {
    // Adiciona o external_reference ao formData para o servidor saber qual pedido é
    formData.external_reference = orderId;
    
    console.log("📤 [Checkout] Submit Data:", { 
      method: selectedPaymentMethod, 
      amount: formData.transaction_amount,
      orderId,
      hasToken: !!formData.token,
      payment_method_id: formData.payment_method_id
    });
    
    return new Promise<void>(async (resolve, reject) => {
      try {
        const response = await fetch(getApiUrl('/api/process_payment'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ formData }),
        });

        const result = await response.json();

        if (response.ok) {
          toast.success("Pagamento processado com sucesso!");
          onSuccess(result.id);
          resolve();
        } else {
          // Extrair mensagem de erro detalhada e amigável
          console.error("❌ [Checkout] Erro retornado pelo servidor:", result);
          const message = result.message || "Pagamento recusado: Verifique os dados do cartão.";
          toast.error(message, { duration: 6000 });
          reject();
        }
      } catch (error) {
        console.error("❌ [Checkout] Falha na rede ou erro de código:", error);
        toast.error("Erro de conexão. Verifique sua internet.");
        reject();
      }
    });
  };

  const onError = (error: any) => {
    console.error("Brick Error:", error);
    onFailure(error);
  };

  const onReady = () => {
    setLoading(false);
  };

  return (
    <div className="w-full">
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 bg-white border border-black/5">
          <Loader2 className="animate-spin text-[#eab308] mb-4" size={32} />
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Iniciando Checkout Seguro...</p>
        </div>
      )}
      
      <div className={loading ? "hidden" : "block animate-in fade-in duration-700"} key={orderId}>
        <div className="bg-black text-[#eab308] p-4 flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Lock size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Ambiente 100% Seguro</span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Processado por Mercado Pago</span>
          </div>
        </div>

        <Payment
          initialization={initialization}
          customization={customization}
          onSubmit={onSubmit}
          onReady={onReady}
          onError={onError}
        />
      </div>
    </div>
  );
}
