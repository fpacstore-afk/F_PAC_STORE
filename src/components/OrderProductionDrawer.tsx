import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, Clock, Truck, Package, MessageCircle, Mail, MapPin, 
  Printer, Trash2, ArrowLeft, ArrowRight, Save, Calendar, FileText, 
  AlertCircle, ChevronRight, ExternalLink, RefreshCw, Check, Sparkles,
  ShieldAlert, Send, DollarSign, Edit3, ShoppingBag, Eye, Plus, X
} from 'lucide-react';
import { PRODUCTION_STAGES, getStageFromStatus, ProductionStage } from '../constants/productionStages';
import { DEFAULT_STAGE_TEMPLATES, renderStageTemplate } from '../constants/notificationTemplates';
import { isJoinvilleCEP } from '../lib/shipping';
import { getApiUrl, getBaseUrl, authenticatedFetch } from '../lib/api';
import { registerPartialPayment } from '../services/orders/orderService';
import { getOrderAmountPaid, getOrderBalanceDue } from './AdminAccountsReceivable';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';

interface OrderProductionDrawerProps {
  order: any;
  onStatusUpdate: (orderId: string, newStatus: string) => Promise<void>;
  onPrintLocalLabel: (order: any) => void;
  onDeleteOrder: (orderId: string) => Promise<void>;
  onRevertStock?: (order: any) => Promise<void>;
  onSaveObservations?: (orderId: string, obs: string) => Promise<void>;
  onSaveDeliveryDate?: (orderId: string, dateStr: string) => Promise<void>;
}

type TabType = 'resumo' | 'produtos' | 'producao' | 'envio' | 'historico' | 'acoes';

export const OrderProductionDrawer: React.FC<OrderProductionDrawerProps> = ({
  order,
  onStatusUpdate,
  onPrintLocalLabel,
  onDeleteOrder,
  onRevertStock,
  onSaveObservations,
  onSaveDeliveryDate,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('resumo');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [observations, setObservations] = useState(order.observations || '');
  const [deliveryDate, setDeliveryDate] = useState(order.deliveryDate || '');
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedShippingService, setSelectedShippingService] = useState(order.shippingServiceId || 2);
  const [notifyWaOnStageChange, setNotifyWaOnStageChange] = useState(true);
  const [notifyEmailOnStageChange, setNotifyEmailOnStageChange] = useState(true);
  
  // Notification communication card states
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const [isPreviewMessageOpen, setIsPreviewMessageOpen] = useState(false);
  const [previewMessageText, setPreviewMessageText] = useState('');

  // Partial Payment Modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmountInput, setPayAmountInput] = useState<string>('');
  const [payMethodInput, setPayMethodInput] = useState<string>('PIX');
  const [payOperatorInput, setPayOperatorInput] = useState<string>('Admin');
  const [payIdempotencyKey, setPayIdempotencyKey] = useState<string>('');
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  const handleOpenPayModal = () => {
    const due = getOrderBalanceDue(order);
    setPayAmountInput(due > 0 ? String(due) : '');
    setPayMethodInput('PIX');
    setPayOperatorInput('Admin');
    setPayIdempotencyKey(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `prod_pay_${order.id}_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`);
    setShowPaymentModal(true);
  };

  const handleConfirmPartialPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(payAmountInput);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Informe um valor válido maior que zero');
      return;
    }

    const currentPaid = getOrderAmountPaid(order);
    const total = Number(order.total) || 0;

    setIsSubmittingPay(true);
    try {
      await registerPartialPayment(
        order.id,
        amountNum,
        payMethodInput,
        currentPaid,
        total,
        payOperatorInput || 'Admin',
        payIdempotencyKey
      );
      toast.success(`Pagamento parcial de R$ ${amountNum.toFixed(2)} registrado com sucesso!`);
      setShowPaymentModal(false);
    } catch (err: any) {
      toast.error(`Erro ao registrar pagamento: ${err.message || 'Erro de conexão'}`);
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const currentStage = getStageFromStatus(order.production?.status || order.productionStatus || order.status || 'waiting');
  const currentStageIndex = PRODUCTION_STAGES.findIndex(s => s.id === currentStage.id);

  // Latest notification sent data
  const sentNotifs = order.sentStageNotifications || {};
  const currentStageNotif = sentNotifs[currentStage.id];
  const lastLogs = Array.isArray(order.notificationLogs) ? order.notificationLogs : [];
  const latestLog = lastLogs[0];

  const handleStageChange = async (newStage: ProductionStage) => {
    setIsUpdatingStatus(true);
    try {
      await onStatusUpdate(order.id, newStage.id);
      
      // Auto notification dispatch to backend (WhatsApp + Email)
      authenticatedFetch('/api/automation/stage-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          newStageId: newStage.id,
          previousStageId: currentStage.id,
          changedBy: 'Painel Pedidos (Avanço de Etapa)'
        })
      }).then(async res => {
        const d = await res.json();
        if (d.success && !d.skipped) {
          toast.success(`Notificação enviada ao cliente (${newStage.label})!`);
        }
      }).catch(err => console.warn("Stage notification error:", err));

      toast.success(`Etapa alterada para: ${newStage.emoji} ${newStage.label}`);
    } catch (err: any) {
      toast.error(`Erro ao atualizar etapa: ${err.message || 'Falha na conexão'}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getCompiledMessage = () => {
    if (currentStageNotif?.lastMessage) return currentStageNotif.lastMessage;
    if (latestLog?.message) return latestLog.message;
    const rawTpl = DEFAULT_STAGE_TEMPLATES[currentStage.id] || DEFAULT_STAGE_TEMPLATES.received;
    return renderStageTemplate(rawTpl, order);
  };

  const handleManualResendNotification = async () => {
    setIsSendingNotif(true);
    try {
      const res = await authenticatedFetch('/api/automation/stage-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          newStageId: currentStage.id,
          previousStageId: currentStage.id,
          changedBy: 'Operador (Reenvio Manual)',
          forceResend: true
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Notificação reenviada com sucesso via API para a etapa ${currentStage.label}!`);
      } else {
        toast.error(`Falha ao reenviar: ${data.reason || 'Erro no servidor'}`);
      }
    } catch (error: any) {
      toast.error('Erro ao conectar com o servidor para reenviar.');
    } finally {
      setIsSendingNotif(false);
    }
  };

  const handleOpenWhatsAppManual = () => {
    const cleanPhone = String(order.customerPhone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      toast.error('Telefone do cliente não cadastrado no pedido');
      return;
    }
    const msg = getCompiledMessage();
    const waUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
    toast.success('Abrindo WhatsApp Web com a mensagem preenchida...');
  };

  const handlePrevStage = () => {
    if (currentStageIndex > 0) {
      const prev = PRODUCTION_STAGES[currentStageIndex - 1];
      handleStageChange(prev);
    }
  };

  const handleNextStage = () => {
    if (currentStageIndex < PRODUCTION_STAGES.length - 1) {
      const next = PRODUCTION_STAGES[currentStageIndex + 1];
      handleStageChange(next);
    }
  };

  const handleSaveProductionMeta = async () => {
    setIsSavingMeta(true);
    try {
      if (onSaveObservations) await onSaveObservations(order.id, observations);
      if (onSaveDeliveryDate) await onSaveDeliveryDate(order.id, deliveryDate);
      toast.success('Informações de produção salvas!');
    } catch (e: any) {
      toast.error('Erro ao salvar observações');
    } finally {
      setIsSavingMeta(false);
    }
  };

  const isJoinvilleLocal = (order.cep && isJoinvilleCEP(order.cep)) || String(order.city || '').toLowerCase() === 'joinville';

  const totalItemsCount = (order.items || []).reduce((acc: number, item: any) => acc + (Number(item.quantity) || 1), 0);

  return (
    <div className="bg-white border-t border-black/10 shadow-2xl overflow-hidden font-sans text-xs">
      {/* 1. TOP SPEED BAR: Progress Bar & Direct Stage Navigation */}
      <div className="bg-gradient-to-r from-zinc-900 via-black to-zinc-900 text-white p-4 border-b border-black/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Current Stage Indicator */}
          <div className="flex items-center gap-3">
            <span className="text-2xl shrink-0 bg-white/10 p-2 rounded border border-white/10">{currentStage.emoji}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#eab308]">Etapa de Produção Atual</span>
                <span className="text-[9px] font-bold text-gray-400 font-mono">({currentStage.progress}% concluído)</span>
              </div>
              <h3 className="text-base font-black uppercase tracking-tight text-white flex items-center gap-2">
                {currentStage.label}
              </h3>
            </div>
          </div>

          {/* Quick Action Navigation Buttons: Prev / Next */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handlePrevStage}
              disabled={currentStageIndex <= 0 || isUpdatingStatus}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border border-white/10"
              title="Recuar 1 Etapa"
            >
              <ArrowLeft size={14} /> Voltar Etapa
            </button>

            <button
              onClick={handleNextStage}
              disabled={currentStageIndex >= PRODUCTION_STAGES.length - 1 || isUpdatingStatus}
              className="px-4 py-2 bg-[#eab308] hover:bg-[#ca8a04] text-black disabled:opacity-30 disabled:cursor-not-allowed text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md"
              title="Avançar 1 Etapa"
            >
              {isUpdatingStatus ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <>Avançar Etapa <ArrowRight size={14} /></>
              )}
            </button>
          </div>

        </div>

        {/* Dynamic Progress Bar */}
        <div className="mt-3">
          <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden p-0.5 border border-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${currentStage.progress}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className={cn(
                "h-full rounded-full transition-all",
                currentStage.id === 'cancelled' ? 'bg-red-500' : 'bg-gradient-to-r from-amber-400 to-[#eab308]'
              )}
            />
          </div>
        </div>
      </div>

      {/* 1.5. SECOND SPEED BAR: GESTÃO FINANCEIRA (DARK STREETWEAR PANEL) */}
      {(() => {
        const total = Number(order.total) || 0;
        const paid = getOrderAmountPaid(order);
        const due = getOrderBalanceDue(order);
        const rawPayStatus = (order.paymentStatus || '').toLowerCase();
        const isApproved = due <= 0 || rawPayStatus === 'aprovado' || rawPayStatus === 'approved' || rawPayStatus === 'paid';
        const isPartial = due > 0 && paid > 0;

        return (
          <div className="bg-zinc-950 text-white p-4 border-b border-black/30 shadow-inner font-sans">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Financial Title & Status Badge */}
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#eab308]/10 border border-[#eab308]/30 text-[#eab308] rounded">
                  <DollarSign size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Painel Financeiro F PAC</span>
                    {due <= 0 ? (
                      <span className="px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        ✅ PAGAMENTO APROVADO
                      </span>
                    ) : isPartial ? (
                      <span className="px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        🟡 PAGAMENTO PARCIAL (Falta: R$ {due.toFixed(2)})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/40">
                        🔴 PAGAMENTO PENDENTE (Falta: R$ {due.toFixed(2)})
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-white mt-0.5">
                    Gestão Financeira
                  </h3>
                </div>
              </div>

              {/* Metrics Display */}
              <div className="grid grid-cols-3 gap-3 bg-zinc-900/80 p-2.5 border border-zinc-800 rounded">
                <div>
                  <span className="text-[8px] font-bold text-zinc-400 uppercase block">Valor Total</span>
                  <span className="text-xs font-black font-mono text-white">R$ {total.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-zinc-400 uppercase block">Valor Já Pago</span>
                  <span className="text-xs font-black font-mono text-emerald-400">R$ {paid.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[8px] font-bold text-zinc-400 uppercase block">Saldo Devedor</span>
                  <span className={cn("text-xs font-black font-mono", due > 0 ? "text-amber-400" : "text-zinc-500")}>
                    R$ {due.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <div className="shrink-0">
                {due > 0 ? (
                  <button
                    onClick={handleOpenPayModal}
                    type="button"
                    className="w-full md:w-auto px-4 py-2.5 bg-[#eab308] hover:bg-amber-400 text-black font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer border border-[#eab308]"
                  >
                    <Plus size={14} /> REGISTRAR PAGAMENTO
                  </button>
                ) : (
                  <div className="px-3 py-2 bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-[9.5px] font-black uppercase flex items-center gap-1">
                    <CheckCircle2 size={13} /> Quitado / 100% Pago
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 2. TAB CONTROLS (6 Tabs) */}
      <div className="flex border-b border-black/10 bg-gray-50/80 overflow-x-auto scrollbar-none px-4 pt-2 gap-1">
        <button
          onClick={() => setActiveTab('resumo')}
          className={cn(
            "px-4 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 shrink-0",
            activeTab === 'resumo'
              ? "border-[#eab308] text-black bg-white shadow-sm font-black"
              : "border-transparent text-gray-500 hover:text-black hover:bg-black/5"
          )}
        >
          <FileText size={13} /> 📋 Resumo
        </button>

        <button
          onClick={() => setActiveTab('produtos')}
          className={cn(
            "px-4 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 shrink-0",
            activeTab === 'produtos'
              ? "border-[#eab308] text-black bg-white shadow-sm font-black"
              : "border-transparent text-gray-500 hover:text-black hover:bg-black/5"
          )}
        >
          <ShoppingBag size={13} /> 👕 Produtos ({totalItemsCount})
        </button>

        <button
          onClick={() => setActiveTab('producao')}
          className={cn(
            "px-4 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 shrink-0",
            activeTab === 'producao'
              ? "border-[#eab308] text-black bg-white shadow-sm font-black"
              : "border-transparent text-gray-500 hover:text-black hover:bg-black/5"
          )}
        >
          <Sparkles size={13} /> 🏭 Produção ({currentStage.progress}%)
        </button>

        <button
          onClick={() => setActiveTab('envio')}
          className={cn(
            "px-4 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 shrink-0",
            activeTab === 'envio'
              ? "border-[#eab308] text-black bg-white shadow-sm font-black"
              : "border-transparent text-gray-500 hover:text-black hover:bg-black/5"
          )}
        >
          <Truck size={13} /> 🚚 Envio {isJoinvilleLocal ? '(Local)' : '(Correios)'}
        </button>

        <button
          onClick={() => setActiveTab('historico')}
          className={cn(
            "px-4 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 shrink-0",
            activeTab === 'historico'
              ? "border-[#eab308] text-black bg-white shadow-sm font-black"
              : "border-transparent text-gray-500 hover:text-black hover:bg-black/5"
          )}
        >
          <MessageCircle size={13} /> 💬 Histórico & WhatsApp
        </button>

        <button
          onClick={() => setActiveTab('acoes')}
          className={cn(
            "px-4 py-2.5 text-[10px] font-black uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 shrink-0",
            activeTab === 'acoes'
              ? "border-[#eab308] text-black bg-white shadow-sm font-black"
              : "border-transparent text-gray-500 hover:text-black hover:bg-black/5"
          )}
        >
          <Edit3 size={13} /> ⚙️ Ações
        </button>
      </div>

      {/* 3. TAB CONTENT VIEWS */}
      <div className="p-3 sm:p-4 bg-white min-h-[300px]">
        {/* TAB 1: RESUMO (MAXIMUM INFORMATION DENSITY) */}
        {activeTab === 'resumo' && (
          <div className="space-y-3.5">
            {/* Compact Visual Timeline of Active Stages */}
            <div className="bg-gray-50/80 p-2.5 border border-black/10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-1">
                  <Sparkles size={11} className="text-[#eab308]" /> Linha do Tempo de Produção
                </span>
                <span className="text-[9px] font-mono font-bold text-gray-500">
                  Etapa {currentStageIndex + 1} de {PRODUCTION_STAGES.length} ({currentStage.progress}%)
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1 text-center">
                {PRODUCTION_STAGES.map((stage, sIdx) => {
                  const isPassed = currentStageIndex >= sIdx;
                  const isCurrent = currentStage.id === stage.id;
                  return (
                    <button
                      key={stage.id}
                      onClick={() => handleStageChange(stage)}
                      className={cn(
                        "p-1.5 text-[8px] font-black uppercase tracking-tight transition-all border flex flex-col items-center justify-center gap-0.5 rounded-2xs cursor-pointer",
                        isCurrent
                          ? "bg-black text-[#eab308] border-black ring-2 ring-[#eab308] shadow-sm scale-[1.02] z-10"
                          : isPassed
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                          : "bg-white text-gray-400 border-gray-200 opacity-60 hover:opacity-100"
                      )}
                    >
                      <span className="text-xs">{stage.emoji}</span>
                      <span className="line-clamp-1 leading-tight">{stage.label}</span>
                      <span className="text-[7px] font-mono opacity-80">{stage.progress}%</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4-COLUMN HIGH-DENSITY INFO GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Box 1: Customer */}
              <div className="bg-white border border-black/10 p-3 space-y-2 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b pb-1.5 border-black/5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-black flex items-center gap-1">
                      👤 Cliente
                    </span>
                    <span className="text-[8px] font-bold text-gray-400 uppercase bg-gray-100 px-1 py-0.5">{order.origin || 'SITE'}</span>
                  </div>
                  <div className="mt-1.5">
                    <h4 className="text-xs font-black text-black uppercase truncate">{order.customerName}</h4>
                    <p className="text-[9px] text-gray-500 font-bold truncate">{order.customerEmail || 'Sem e-mail'}</p>
                    <p className="text-[9px] font-mono text-gray-600 font-bold mt-0.5">{order.customerPhone || 'Sem telefone'}</p>
                  </div>
                </div>
                <div className="flex gap-1.5 pt-1.5 border-t border-black/5">
                  <a
                    href={`https://wa.me/${String(order.customerPhone || '').replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-emerald-600 text-white py-1 px-1.5 text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 hover:bg-black transition-colors"
                  >
                    <MessageCircle size={10} /> WhatsApp
                  </a>
                  {order.customerEmail && (
                    <a
                      href={`mailto:${order.customerEmail}`}
                      className="bg-black text-white py-1 px-1.5 text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 hover:bg-[#eab308] hover:text-black transition-colors"
                    >
                      <Mail size={10} /> Email
                    </a>
                  )}
                </div>
              </div>

              {/* Box 2: Shipping */}
              <div className="bg-white border border-black/10 p-3 space-y-2 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b pb-1.5 border-black/5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-black flex items-center gap-1">
                      🚚 Entrega
                    </span>
                    <span className={cn(
                      "px-1 py-0.5 text-[7px] font-black uppercase border",
                      isJoinvilleLocal ? "bg-[#eab308]/10 text-black border-[#eab308]/30" : "bg-blue-50 text-blue-700 border-blue-200"
                    )}>
                      {isJoinvilleLocal ? 'Local Joinville' : 'Correios / Jadlog'}
                    </span>
                  </div>
                  <div className="text-[9px] font-bold uppercase leading-snug text-gray-700 mt-1.5">
                    {typeof order.address === 'object' ? (
                      <>
                        <p className="font-black text-black truncate">{order.address.street || 'Rua'}, {order.address.number || 'S/N'}</p>
                        <p className="truncate">{order.address.neighborhood || ''} - {order.address.city || ''}/{order.address.state || ''}</p>
                        <p className="text-gray-400 font-mono text-[8px]">CEP: {order.address.cep || ''}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-black text-black truncate">{order.address || 'Endereço'}, {order.number || 'S/N'}</p>
                        <p className="truncate">{order.neighborhood || ''} - {order.city || ''}/{order.state || ''}</p>
                        <p className="text-gray-400 font-mono text-[8px]">CEP: {order.cep || ''}</p>
                      </>
                    )}
                  </div>
                </div>
                {order.trackingCode && (
                  <div className="pt-1 border-t border-black/5 flex items-center justify-between text-[8px] font-bold">
                    <span className="text-gray-400 uppercase">Rastreio:</span>
                    <span className="font-mono text-black font-black bg-gray-100 px-1 py-0.5">{order.trackingCode}</span>
                  </div>
                )}
              </div>

              {/* Box 3: Financial Summary */}
              <div className="bg-white border border-black/10 p-3 space-y-2 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b pb-1.5 border-black/5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-black flex items-center gap-1">
                      💰 Financeiro
                    </span>
                    <span className="text-[8px] font-black text-emerald-700 bg-emerald-50 px-1 py-0.5 border border-emerald-200 uppercase">
                      {order.paymentMethod || 'PIX'}
                    </span>
                  </div>
                  <div className="space-y-0.5 mt-1.5 text-[9px]">
                    <div className="flex justify-between text-gray-500 font-bold">
                      <span>Subtotal ({totalItemsCount} it):</span>
                      <span>R$ {(order.subtotal || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500 font-bold">
                      <span>Frete:</span>
                      <span>R$ {(order.shipping || 0).toFixed(2)}</span>
                    </div>
                    {Number(order.couponDiscount || 0) > 0 && (
                      <div className="flex justify-between text-red-600 font-bold">
                        <span>Desconto:</span>
                        <span>- R$ {Number(order.couponDiscount).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="pt-1.5 border-t border-black/10 flex justify-between items-center text-black font-black">
                  <span className="text-[9px]">TOTAL:</span>
                  <span className="font-mono text-sm text-emerald-600">R$ {(order.total || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Box 4: Dispatch Communication Control */}
              <div className="bg-zinc-950 text-white border border-zinc-800 p-3 space-y-2 shadow-md flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between border-b pb-1.5 border-zinc-800">
                    <span className="text-[9px] font-black uppercase tracking-wider text-[#eab308] flex items-center gap-1">
                      💬 Notificação ({currentStage.emoji})
                    </span>
                    <span className={cn(
                      "px-1 py-0.5 text-[7px] font-black uppercase rounded-2xs",
                      latestLog?.whatsappStatus === 'Enviado' || currentStageNotif?.whatsappSent
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                        : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    )}>
                      {latestLog?.whatsappStatus || (currentStageNotif?.whatsappSent ? 'Enviado' : 'Pendente')}
                    </span>
                  </div>
                  <p className="text-[8px] text-gray-300 font-mono line-clamp-2 mt-1.5 leading-tight">
                    {currentStageNotif?.lastMessage || latestLog?.message || `Mensagem para ${currentStage.label}`}
                  </p>
                </div>

                <div className="space-y-1 pt-1.5 border-t border-zinc-800">
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={handleManualResendNotification}
                      disabled={isSendingNotif}
                      className="bg-[#eab308] hover:bg-amber-400 text-black py-1.5 px-1 text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs truncate"
                      title="Envia a mensagem automaticamente via API"
                    >
                      {isSendingNotif ? <RefreshCw className="animate-spin" size={10} /> : <Send size={10} />}
                      ⚡ Automático
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenWhatsAppManual}
                      className="bg-[#25D366] hover:bg-emerald-600 text-white py-1.5 px-1 text-[8px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer shadow-xs truncate"
                      title="Abre o WhatsApp com mensagem pronta"
                    >
                      <MessageCircle size={10} />
                      💬 Manual WA
                    </button>
                  </div>

                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewMessageText(getCompiledMessage());
                        setIsPreviewMessageOpen(true);
                      }}
                      className="flex-1 bg-white/10 hover:bg-white/20 text-white border border-white/10 py-1 px-1 text-[7px] font-black uppercase tracking-wider flex items-center justify-center gap-0.5 transition-all cursor-pointer"
                    >
                      <Eye size={9} /> Ver Texto
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        window.location.hash = '#/admin?tab=notifications';
                        toast('Redirecionando para Notificações...', { icon: '⚙️' });
                      }}
                      className="flex-1 bg-white/10 hover:bg-white/20 text-white border border-white/10 py-1 px-1 text-[7px] font-black uppercase tracking-wider flex items-center justify-center gap-0.5 transition-all cursor-pointer"
                    >
                      <Edit3 size={9} /> Modelos
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* INSTANT PRODUCTS TABLE (SHOWN DIRECTLY ON RESUMO FOR MAXIMUM VISIBILITY) */}
            <div className="bg-gray-50/50 border border-black/10 p-3 space-y-2">
              <div className="flex items-center justify-between border-b pb-1.5 border-black/10">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-black flex items-center gap-1.5">
                  <ShoppingBag size={12} className="text-[#eab308]" /> 
                  Itens do Pedido para Produção ({totalItemsCount} Peças)
                </h4>
                <span className="text-[8px] font-bold text-gray-500 uppercase">
                  Visualize tamanhos, cores e estampas sem trocar de aba
                </span>
              </div>

              <div className="divide-y divide-black/5 bg-white border border-black/5">
                {(order.items || []).map((item: any, idx: number) => (
                  <div key={idx} className="p-2 flex items-center justify-between gap-3 text-[10px] hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-10 h-10 bg-white border border-black/10 p-0.5 shrink-0 flex items-center justify-center overflow-hidden">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <ShoppingBag size={14} className="text-gray-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black uppercase text-black truncate leading-tight">{item.name}</p>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5 text-[8px] font-bold">
                          {item.size && (
                            <span className="bg-black text-white px-1.5 py-0.2 uppercase">
                              Tam: {item.size}
                            </span>
                          )}
                          {item.color && (
                            <span className="bg-gray-200 text-black px-1.5 py-0.2 uppercase">
                              Cor: {item.color}
                            </span>
                          )}
                          {(item.stampId || item.stampName) && (
                            <span className="bg-[#eab308]/20 text-black border border-[#eab308]/40 px-1.5 py-0.2 uppercase font-mono">
                              Estampa: #{item.stampId || item.stampName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-right shrink-0">
                      <div>
                        <span className="text-[8px] text-gray-400 uppercase font-bold block">Qtd</span>
                        <span className="font-black text-xs text-black font-mono">{item.quantity || 1}x</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-gray-400 uppercase font-bold block">Total</span>
                        <span className="font-bold text-xs text-black font-mono">
                          R$ {((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRODUTOS */}
        {activeTab === 'produtos' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-black/10">
              <h4 className="text-xs font-black uppercase tracking-wider text-black">
                Itens para Produção ({totalItemsCount} Unidades)
              </h4>
              <span className="text-[9px] font-bold text-gray-400 uppercase">Verifique a cor, tamanho e estampa de cada peça</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {(order.items || []).map((item: any, idx: number) => (
                <div key={idx} className="bg-gray-50/50 border border-black/10 p-4 hover:border-black/30 transition-all flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                  
                  {/* Item Image & Description */}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-16 h-16 bg-white border border-black/10 p-1 shrink-0 flex items-center justify-center overflow-hidden">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                      ) : (
                        <ShoppingBag size={24} className="text-gray-300" />
                      )}
                    </div>
                    <div>
                      <h5 className="text-sm font-black uppercase text-black leading-tight">{item.name}</h5>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="bg-black text-white text-[8px] font-black uppercase px-2 py-0.5">
                          Tamanho: {item.size}
                        </span>
                        <span className="bg-gray-200 text-black text-[8px] font-black uppercase px-2 py-0.5">
                          Cor: {item.color}
                        </span>
                        <span className="bg-[#eab308] text-black text-[8px] font-black uppercase px-2 py-0.5">
                          Qtd: {item.quantity} un.
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Prime Custom Print Configs */}
                  {Array.isArray(item.printConfigs) && item.printConfigs.length > 0 && (
                    <div className="w-full md:w-1/2 bg-white border border-amber-300/60 p-3 space-y-2 rounded-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-[#ca8a04] flex items-center gap-1">
                          <Sparkles size={11} /> Estampas Personalizadas ({item.printConfigs.length})
                        </span>
                        <a
                          href="/prime"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[8px] bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black px-2 py-0.5 font-black uppercase transition-all flex items-center gap-1"
                        >
                          Construtor ↗
                        </a>
                      </div>
                      <div className="space-y-1.5">
                        {item.printConfigs.map((pc: any, pIdx: number) => (
                          <div key={pIdx} className="bg-gray-50 border border-black/5 p-2 flex items-center justify-between text-[9px] font-bold">
                            <div className="flex items-center gap-2">
                              {pc.image && <img src={pc.image} alt={pc.stamp} className="w-6 h-6 object-cover bg-black rounded-xs" />}
                              <span className="font-black text-black uppercase">{pc.stamp || 'Estampa'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="bg-gray-200 px-1.5 py-0.5 font-mono text-[8px]">{pc.location || 'Peito'}</span>
                              <span className="bg-gray-200 px-1.5 py-0.5 font-mono text-[8px]">{pc.printSize || '10x10'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Item Price */}
                  <div className="text-right shrink-0">
                    <span className="text-xs text-gray-400 font-bold block">R$ {(item.price || 0).toFixed(2)} / un</span>
                    <span className="text-sm font-black font-mono text-black">
                      Total: R$ {((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                    </span>
                  </div>

                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: PRODUÇÃO */}
        {activeTab === 'producao' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-black mb-1">
                Seletor Rápido de Etapa da Produção
              </h4>
              <p className="text-[9px] text-gray-500 font-bold uppercase mb-4">
                Clique para alterar a etapa instantaneamente no banco de dados sem recarregar a página.
              </p>

              {/* Stage Switcher Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {PRODUCTION_STAGES.map((stage) => {
                  const isSelected = currentStage.id === stage.id;
                  return (
                    <button
                      key={stage.id}
                      onClick={() => handleStageChange(stage)}
                      disabled={isUpdatingStatus}
                      className={cn(
                        "p-3 border text-left flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden group",
                        isSelected
                          ? "bg-black text-[#eab308] border-black shadow-lg scale-105 ring-2 ring-[#eab308] z-10"
                          : "bg-white hover:bg-gray-50 text-gray-800 border-black/10 hover:border-black/30"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xl">{stage.emoji}</span>
                        <span className={cn(
                          "text-[8px] font-black px-1.5 py-0.5 rounded font-mono uppercase",
                          isSelected ? "bg-[#eab308] text-black" : "bg-gray-100 text-gray-600"
                        )}>
                          {stage.progress}%
                        </span>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-tight leading-tight">
                        {stage.label}
                      </span>
                      {isSelected && (
                        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#eab308] animate-ping" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Production Notes & Delivery Date */}
            <div className="bg-gray-50 border border-black/10 p-5 space-y-4">
              <h5 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-2">
                <FileText size={14} /> Observações da Produção & Prazo de Entrega
              </h5>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black uppercase text-gray-500 block mb-1">
                    📅 Data Prevista para Entrega/Pronto
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full bg-white border border-black/10 px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase text-gray-500 block mb-1">
                    📝 Anotações Internas de Produção
                  </label>
                  <textarea
                    rows={3}
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    placeholder="Ex: Camisa GG preta separada do lote Force. Estampa costuma atrasar 10 min."
                    className="w-full bg-white border border-black/10 p-3 text-xs focus:outline-none focus:border-[#eab308]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveProductionMeta}
                  disabled={isSavingMeta}
                  className="bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black px-6 py-2.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow"
                >
                  {isSavingMeta ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />} Salvar Anotações
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ENVIO */}
        {activeTab === 'envio' && (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 border border-black/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-black tracking-wider flex items-center gap-2">
                  <MapPin size={14} /> Triagem Logística Inteligente
                </span>
                <span className={cn(
                  "px-2 py-0.5 text-[9px] font-black uppercase border",
                  isJoinvilleLocal ? "bg-[#eab308] text-black border-black" : "bg-orange-500 text-white border-orange-600"
                )}>
                  {isJoinvilleLocal ? "🏍️ TRILHA LOCAL (JOINVILLE)" : "📦 TRILHA NACIONAL (CORREIOS / JADLOG)"}
                </span>
              </div>
              <p className="text-[9px] text-gray-500 font-bold uppercase">
                {isJoinvilleLocal
                  ? "CEP de Joinville detectado. Recomendado imprimir etiqueta A simplificada para entrega local."
                  : "CEP de fora de Joinville. Recomendado usar o envio via Correios ou Jadlog (Melhor Envio)."
                }
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Modelo A: Local */}
              <div className={cn(
                "p-5 border space-y-3",
                isJoinvilleLocal ? "border-[#eab308] bg-[#eab308]/5" : "border-black/10 bg-white opacity-80"
              )}>
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-black uppercase text-black">
                    🏍️ Modelo A: Etiqueta de Entrega Local
                  </h5>
                  {isJoinvilleLocal && <span className="bg-black text-[#eab308] text-[8px] font-black px-2 py-0.5">RECOMENDADO</span>}
                </div>
                <p className="text-[9px] text-gray-600 leading-relaxed font-medium">
                  Imprime cupom térmico para caixa/sacola contendo remetente F PAC Store, destinatário, endereço completo e lista de itens. Não consome saldo de APIs.
                </p>
                <button
                  onClick={() => onPrintLocalLabel(order)}
                  className="w-full bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black py-3 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow"
                >
                  <Printer size={14} /> Imprimir Etiqueta A (Local)
                </button>
              </div>

              {/* Modelo B: Melhor Envio */}
              <div className={cn(
                "p-5 border space-y-3",
                !isJoinvilleLocal ? "border-orange-500 bg-orange-50/20" : "border-black/10 bg-white opacity-80"
              )}>
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-black uppercase text-black">
                    📦 Modelo B: Melhor Envio (Nacional)
                  </h5>
                  {!isJoinvilleLocal && <span className="bg-orange-500 text-white text-[8px] font-black px-2 py-0.5">RECOMENDADO</span>}
                </div>
                <p className="text-[9px] text-gray-600 leading-relaxed font-medium">
                  Integração direta com o carrinho do Melhor Envio para cotar e emitir etiquetas de SEDEX, PAC ou Jadlog.
                </p>
                <div className="space-y-1">
                  <label className="text-[8px] font-black uppercase text-gray-500">Serviço de Frete Selecionado</label>
                  <select
                    value={selectedShippingService}
                    onChange={(e) => setSelectedShippingService(Number(e.target.value))}
                    className="w-full bg-white border border-black/10 p-2 text-[10px] font-bold uppercase focus:outline-none focus:border-[#eab308]"
                  >
                    <option value={1}>Correios PAC</option>
                    <option value={2}>Correios SEDEX</option>
                    <option value={3}>Jadlog Package</option>
                    <option value={4}>Jadlog .COM</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: HISTÓRICO & WHATSAPP */}
        {activeTab === 'historico' && (
          <div className="space-y-6 font-sans">
            <div className="flex items-center justify-between pb-2 border-b border-black/10">
              <h4 className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-2">
                <MessageCircle size={14} /> Históricos, Pagamentos & Automações
              </h4>
              <button
                onClick={async () => {
                  toast.promise(
                    authenticatedFetch('/api/automation/send-manual-order-whatsapp', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ orderId: order.id })
                    }).then(r => r.json()),
                    {
                      loading: 'Enviando WhatsApp...',
                      success: 'Notificação enviada com sucesso!',
                      error: 'Falha ao enviar WhatsApp'
                    }
                  );
                }}
                className="bg-green-600 text-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wider hover:bg-black transition-colors"
              >
                💬 Reenviar WhatsApp de Confirmação
              </button>
            </div>

            {/* Financial Partial Payment Logs */}
            <div className="bg-zinc-950 text-white border border-zinc-800 p-4 space-y-3">
              <h5 className="text-[11px] font-black uppercase tracking-wider text-[#eab308] flex items-center gap-2 border-b border-zinc-800 pb-2">
                <DollarSign size={14} /> Histórico de Pagamentos Parciais ({Array.isArray(order.paymentLogs) ? order.paymentLogs.length : 0})
              </h5>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {Array.isArray(order.paymentLogs) && order.paymentLogs.length > 0 ? (
                  order.paymentLogs.map((pay: any, pIdx: number) => (
                    <div key={pIdx} className="bg-zinc-900 p-2.5 border border-zinc-800 flex items-center justify-between text-[10px]">
                      <div>
                        <span className="font-black text-emerald-400 font-mono text-xs">
                          + R$ {(Number(pay.amount) || 0).toFixed(2)}
                        </span>
                        <span className="ml-2 px-1.5 py-0.2 bg-zinc-800 text-zinc-300 font-bold uppercase text-[8px]">
                          Via: {pay.method || 'Manual'}
                        </span>
                        <span className="ml-2 text-zinc-400 text-[8px]">
                          Op: {pay.operator || 'Admin'}
                        </span>
                      </div>
                      <span className="text-[8px] text-zinc-400 font-mono">
                        {pay.date ? (pay.date.toDate ? pay.date.toDate().toLocaleString('pt-BR') : new Date(pay.date).toLocaleString('pt-BR')) : ''}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-zinc-500 italic py-2 text-center">
                    Nenhum pagamento parcial registrado individualmente.
                  </p>
                )}
              </div>
            </div>

            {/* General History Logs */}
            <div className="bg-white border border-black/10 p-4 space-y-3">
              <h5 className="text-[11px] font-black uppercase tracking-wider text-black flex items-center gap-2 border-b border-black/10 pb-2">
                <Clock size={14} /> Histórico Geral de Operações ({Array.isArray(order.historyLogs) ? order.historyLogs.length : 0})
              </h5>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {Array.isArray(order.historyLogs) && order.historyLogs.length > 0 ? (
                  order.historyLogs.map((log: any, hIdx: number) => (
                    <div key={hIdx} className="bg-gray-50 p-2 border border-black/5 flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-black">{log.action}</span>
                        {log.operator && <span className="text-[8px] text-gray-500 uppercase">({log.operator})</span>}
                      </div>
                      <span className="text-[8px] text-gray-400 font-mono">
                        {log.date ? (log.date.toDate ? log.date.toDate().toLocaleString('pt-BR') : new Date(log.date).toLocaleString('pt-BR')) : ''}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-gray-400 italic py-2 text-center">
                    Nenhum histórico geral gravado.
                  </p>
                )}
              </div>
            </div>

            {/* WA Logs */}
            <div className="bg-gray-50 border border-black/10 p-4 space-y-2 max-h-48 overflow-y-auto">
              <h5 className="text-[11px] font-black uppercase tracking-wider text-gray-700 border-b border-black/5 pb-1">
                Logs de Envio de WhatsApp
              </h5>
              {Array.isArray(order.whatsappLogs) && order.whatsappLogs.length > 0 ? (
                order.whatsappLogs.map((log: any, lIdx: number) => (
                  <div key={lIdx} className="bg-white p-2 border border-black/5 flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-2">
                      <span className={log.status === 'success' ? 'text-green-600' : 'text-red-600'}>
                        {log.status === 'success' ? '✅' : '❌'}
                      </span>
                      <span className="font-bold text-gray-800">{log.message || 'Envio realizado'}</span>
                    </div>
                    <span className="text-[8px] text-gray-400 font-mono">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : ''}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-gray-400 font-bold uppercase italic text-center py-4">
                  Nenhum registro de WhatsApp automático enviado até o momento.
                </p>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: AÇÕES */}
        {activeTab === 'acoes' && (
          <div className="space-y-6">
            <h4 className="text-xs font-black uppercase tracking-wider text-black border-b pb-2">
              Ações Críticas do Pedido
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Print Local Label */}
              <div className="bg-gray-50 border border-black/10 p-4 space-y-2">
                <span className="text-[10px] font-black uppercase text-black block">🖨️ Etiqueta de Remessa</span>
                <p className="text-[8px] text-gray-500 font-bold">Imprime comprovante para caixa em Joinville</p>
                <button
                  onClick={() => onPrintLocalLabel(order)}
                  className="w-full bg-black text-white text-[9px] font-black uppercase py-2 hover:bg-[#eab308] hover:text-black transition-all"
                >
                  Imprimir Etiqueta
                </button>
              </div>

              {/* Revert Stock */}
              <div className="bg-gray-50 border border-black/10 p-4 space-y-2">
                <span className="text-[10px] font-black uppercase text-black block">📦 Estorno de Estoque</span>
                <p className="text-[8px] text-gray-500 font-bold">Retorna os itens do pedido ao inventário</p>
                <button
                  onClick={async () => {
                    if (onRevertStock) {
                      await onRevertStock(order);
                    } else {
                      try {
                        const res = await authenticatedFetch(`/api/admin/orders/${order.id}/payment-status`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ newStatus: 'cancelled', reason: 'Estorno manual via painel' })
                        });
                        if (res.ok) {
                          toast.success('Reserva de estoque liberada com sucesso!');
                          await onStatusUpdate(order.id, 'cancelado');
                        } else {
                          toast.error('Erro ao devolver estoque.');
                        }
                      } catch (err) {
                        toast.error('Erro de conexão ao devolver estoque.');
                      }
                    }
                  }}
                  className="w-full bg-amber-600 text-white text-[9px] font-black uppercase py-2 hover:bg-black transition-all"
                >
                  Devolver ao Estoque
                </button>
              </div>

              {/* Delete Order */}
              <div className="bg-red-50/50 border border-red-200 p-4 space-y-2">
                <span className="text-[10px] font-black uppercase text-red-700 block">🛑 Excluir Pedido</span>
                <p className="text-[8px] text-red-500 font-bold">Remove o pedido permanentemente do sistema</p>
                {showDeleteConfirm ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onDeleteOrder(order.id)}
                      className="flex-1 bg-red-600 text-white text-[8px] font-black uppercase py-2 hover:bg-black transition-all"
                    >
                      Confirmar
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 bg-gray-200 text-black text-[8px] font-black uppercase py-2"
                    >
                      Não
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full bg-red-600 text-white text-[9px] font-black uppercase py-2 hover:bg-black transition-all"
                  >
                    Excluir Pedido
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MESSAGE PREVIEW MODAL */}
      {isPreviewMessageOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-2 border-black p-6 max-w-lg w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-black/10 pb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
                <MessageCircle size={16} className="text-[#25D366]" /> Conteúdo da Mensagem ao Cliente
              </h3>
              <button
                onClick={() => setIsPreviewMessageOpen(false)}
                className="text-gray-400 hover:text-black font-bold text-base"
              >
                ✕
              </button>
            </div>

            <div className="bg-zinc-950 p-4 border border-black/20 text-emerald-400 text-xs font-mono whitespace-pre-line leading-relaxed max-h-80 overflow-y-auto">
              {previewMessageText}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-black/10 text-[9px] font-bold uppercase text-gray-500">
              <span>Destinatário: {order.customerName}</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(previewMessageText);
                  toast.success('Texto copiado para a área de transferência!');
                }}
                className="text-black hover:text-[#eab308] underline font-black flex items-center gap-1"
              >
                Copiar Texto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PARTIAL PAYMENT REGISTRATION MODAL */}
      <AnimatePresence>
        {showPaymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-950 text-white border-2 border-[#eab308] p-6 max-w-md w-full shadow-2xl font-sans"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-[#eab308]/20 border border-[#eab308] text-[#eab308] rounded">
                    <DollarSign size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase text-white tracking-wider">
                      Registrar Pagamento Parcial
                    </h3>
                    <p className="text-[9px] text-zinc-400 font-bold uppercase">
                      Pedido #{order.id}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleConfirmPartialPayment} className="space-y-4">
                <div className="bg-zinc-900 p-3 border border-zinc-800 space-y-1.5 text-[10px]">
                  <div className="flex justify-between text-zinc-400 font-bold">
                    <span>Valor Total do Pedido:</span>
                    <span className="text-white font-mono font-black">R$ {(Number(order.total) || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-400 font-bold">
                    <span>Valor Já Pago:</span>
                    <span className="text-emerald-400 font-mono font-black">R$ {getOrderAmountPaid(order).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-200 font-black border-t border-zinc-800 pt-1.5 mt-1">
                    <span>Saldo Devedor Atual:</span>
                    <span className="text-amber-400 font-mono text-xs">R$ {getOrderBalanceDue(order).toFixed(2)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300 mb-1">
                    Valor Recebido (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={getOrderBalanceDue(order)}
                    value={payAmountInput}
                    onChange={(e) => setPayAmountInput(e.target.value)}
                    required
                    className="w-full bg-black border border-zinc-700 text-white px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:border-[#eab308]"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300 mb-1">
                    Método de Pagamento *
                  </label>
                  <select
                    value={payMethodInput}
                    onChange={(e) => setPayMethodInput(e.target.value)}
                    className="w-full bg-black border border-zinc-700 text-white px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308] cursor-pointer"
                  >
                    <option value="PIX">PIX</option>
                    <option value="Cartão">Cartão</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Link de Pagamento">Link de Pagamento</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-300 mb-1">
                    Operador / Responsável
                  </label>
                  <input
                    type="text"
                    value={payOperatorInput}
                    onChange={(e) => setPayOperatorInput(e.target.value)}
                    className="w-full bg-black border border-zinc-700 text-white px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#eab308]"
                    placeholder="Admin"
                  />
                </div>

                <div className="flex gap-2 pt-2 border-t border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white py-2.5 text-[10px] font-black uppercase tracking-wider cursor-pointer transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPay}
                    className="flex-1 bg-[#eab308] hover:bg-amber-400 text-black py-2.5 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {isSubmittingPay ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <>Confirmar Pagamento</>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
