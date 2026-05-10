import React, { useState } from 'react';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import { getApiUrl } from '../lib/api';
import toast from 'react-hot-toast';
import { Loader2, ShieldCheck, Lock } from 'lucide-react';

interface TransparentCheckoutProps {
  publicKey: string;
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
      initMercadoPago(publicKey, { locale: 'pt-BR' });
      
      // Safety timeout
      const timeout = setTimeout(() => {
        if (loading) {
          console.warn("⚠️ [MP] onReady demorou muito, forçando exibição.");
          setLoading(false);
        }
      }, 10000);

      return () => clearTimeout(timeout);
    } catch (err) {
      console.error("MP Init error:", err);
    }
  }, [publicKey]);

  const initialization = {
    amount: amount,
    payer: {
      email: customerInfo.email,
      firstName: customerInfo.name.split(' ')[0],
      lastName: customerInfo.name.split(' ').slice(1).join(' ') || customerInfo.name.split(' ')[0],
      identification: {
        type: 'CPF',
        number: customerInfo.cpf?.replace(/\D/g, '') || '',
      }
    },
  };

  const customization = {
    paymentMethods: {
      ticket: 'all' as const,
      bankTransfer: ['pix' as const],
      creditCard: paymentMethod === 'PIX' ? [] : 'all' as const,
      debitCard: paymentMethod === 'PIX' ? [] : 'all' as const,
      mercadoPago: paymentMethod === 'PIX' ? [] : 'all' as const,
      maxInstallments: 12
    },
    visual: {
      style: {
        theme: 'flat' as const,
        customVariables: {
          fontWeightSemiBold: '900',
          fontWeightBold: '900',
          borderRadiusSmall: '0px',
          borderRadiusMedium: '0px',
          borderRadiusLarge: '0px',
          colorPrimary: '#eab308',
          colorBackground: '#ffffff',
          colorText: '#000000',
        }
      }
    }
  };

  const onSubmit = async ({ selectedPaymentMethod, formData }: any) => {
    // Adiciona o external_reference ao formData para o servidor saber qual pedido é
    formData.external_reference = orderId;
    
    console.log("📤 [Checkout] Enviando para o servidor:", { 
      method: selectedPaymentMethod, 
      amount: formData.transaction_amount,
      orderId 
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
          toast.success("Pagamento processado!");
          onSuccess(result.id);
          resolve();
        } else {
          // Extrair mensagem de erro detalhada do Mercado Pago se disponível
          let errorMessage = result.message || "Erro no pagamento";
          
          if (result.error?.message) {
            errorMessage = result.error.message;
          }
          
          if (result.error?.cause && Array.isArray(result.error.cause)) {
            const descriptions = result.error.cause
              .map((c: any) => c.description)
              .filter(Boolean)
              .join(', ');
            if (descriptions) errorMessage = `${errorMessage}: ${descriptions}`;
          }
          
          console.error("Payment API Error Detail:", result);
          toast.error(errorMessage, { duration: 8000 });
          reject();
        }
      } catch (error) {
        console.error("Payment error:", error);
        toast.error("Erro de conexão com o servidor");
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
      
      <div className={loading ? "hidden" : "block animate-in fade-in duration-700"}>
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
