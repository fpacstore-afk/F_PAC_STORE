import React, { useState, useEffect } from 'react';
import { 
  Send, 
  RefreshCw, 
  MessageCircle, 
  Mail, 
  Smartphone, 
  Save, 
  RotateCcw, 
  Eye, 
  Sliders, 
  Clock, 
  Search, 
  Layers,
  Sparkles
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { PRODUCTION_STAGES } from '../constants/productionStages';
import { 
  DEFAULT_STAGE_TEMPLATES, 
  DEFAULT_NOTIFICATION_CONFIG, 
  renderStageTemplate,
  ProductionNotificationConfig 
} from '../constants/notificationTemplates';
import { authenticatedFetch } from '../lib/api';
import { manualWhatsAppUrl, notificationChannelStatus, normalizeNotificationEmail, normalizeNotificationPhone } from '../../shared/notificationContacts';

const NOTIFICATION_STAGES = [
  { id: 'received', label: 'Pedido recebido', emoji: '✅', progress: null },
  { id: 'payment_pending', label: 'Aguardando pagamento', emoji: '💳', progress: null },
  { id: 'payment_approved', label: 'Pagamento confirmado', emoji: '✅', progress: null },
  ...PRODUCTION_STAGES,
  { id: 'shipped', label: 'Pedido enviado', emoji: '🚚', progress: null },
  { id: 'delivered', label: 'Pedido entregue', emoji: '🎉', progress: null },
  { id: 'payment_rejected', label: 'Pagamento não aprovado', emoji: '💳', progress: null },
  { id: 'payment_refunded', label: 'Estorno registrado', emoji: '💳', progress: null },
  { id: 'cancelled', label: 'Pedido cancelado', emoji: '⚠️', progress: null },
];

export function ProductionNotificationsAdmin() {
  const [integration, setIntegration] = useState<any>(null);
  const [config, setConfig] = useState<ProductionNotificationConfig>(DEFAULT_NOTIFICATION_CONFIG);
  const [activeStageId, setActiveStageId] = useState<string>(PRODUCTION_STAGES[0].id);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Test Modal
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [testPhone, setTestPhone] = useState<string>('');
  const [testEmail, setTestEmail] = useState<string>('');
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string>('');

  // Active stage template local state
  const [currentTemplate, setCurrentTemplate] = useState<string>('');

  useEffect(() => {
    fetchSettingsAndLogs();
  }, []);

  useEffect(() => {
    if (config?.templates) {
      setCurrentTemplate(config.templates[activeStageId] || DEFAULT_STAGE_TEMPLATES[activeStageId] || '');
    }
  }, [activeStageId, config]);

  const fetchSettingsAndLogs = async () => {
    setIsLoading(true);
    try {
      const res = await authenticatedFetch('/api/automation/production-settings', {
        headers: { 'Accept': 'application/json' }
      });
      const contentType = res.headers.get('content-type') || '';
      
      if (res.ok && contentType.includes('application/json')) {
        try {
          const data = await res.json();
          if (data && typeof data === 'object') {
            setIntegration(data.integration || null);
            setTestEmail(data.testEmail || '');
            setTestPhone(data.testPhone || '');
            setConfig(prev => ({
              ...prev,
              ...data,
              activeStages: { ...prev.activeStages, ...(data.activeStages || {}) },
              templates: { ...prev.templates, ...(data.templates || {}) }
            }));
            setCurrentTemplate(data.templates?.[activeStageId] || DEFAULT_STAGE_TEMPLATES[activeStageId] || '');
          }
        } catch (jsonErr) {
          console.warn('Could not parse production settings JSON:', jsonErr);
        }
      }
      
      // Fetch telemetry/logs
      const dashRes = await authenticatedFetch('/api/automation/dashboard', {
        headers: { 'Accept': 'application/json' }
      });
      const dashContentType = dashRes.headers.get('content-type') || '';
      if (dashRes.ok && dashContentType.includes('application/json')) {
        try {
          const dashData = await dashRes.json();
          const stageLogs = (dashData.logs || []).filter((l: any) => 
            l.event === 'production.stage_notification' || l.stageId || l.whatsappStatus
          );
          setLogs(stageLogs);
        } catch (dashJsonErr) {
          console.warn('Could not parse dashboard telemetry JSON:', dashJsonErr);
        }
      }
    } catch (error) {
      console.warn('Network or server warning loading notification settings, using default config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAll = async (updatedConfig?: ProductionNotificationConfig) => {
    setIsSaving(true);
    const targetConfig = {
      ...config,
      ...updatedConfig,
      testEmail: updatedConfig?.testEmail ?? testEmail,
      testPhone: updatedConfig?.testPhone ?? testPhone,
      templates: { ...config.templates, [activeStageId]: currentTemplate, ...(updatedConfig?.templates || {}) }
    };

    try {
      const res = await authenticatedFetch('/api/automation/production-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(targetConfig)
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const resData = await res.json();
        if (resData.settings) {
          setConfig(resData.settings);
          setTestEmail(resData.settings.testEmail || '');
          setTestPhone(resData.settings.testPhone || '');
        }
        toast.success('Configurações de notificação salvas com sucesso!');
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Erro ao salvar no servidor.');
      }
    } catch (error: any) {
      toast.error('Erro de conexão ao salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreStageDefault = () => {
    const defaultTpl = DEFAULT_STAGE_TEMPLATES[activeStageId] || '';
    setCurrentTemplate(defaultTpl);
    setConfig(prev => ({
      ...prev,
      templates: {
        ...prev.templates,
        [activeStageId]: defaultTpl
      }
    }));
    toast.success('Modelo restaurado para o padrão oficial F PAC');
  };

  const handleRestoreAllDefaults = async () => {
    if (!window.confirm('Tem certeza que deseja restaurar TODOS os modelos de todas as etapas para a mensagem oficial?')) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await authenticatedFetch('/api/automation/production-settings/restore-defaults', {
        method: 'POST',
        headers: { 'Accept': 'application/json' }
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const resData = await res.json();
        if (resData.settings) {
          setConfig(resData.settings);
          setCurrentTemplate(resData.settings.templates?.[activeStageId] || DEFAULT_STAGE_TEMPLATES[activeStageId]);
        }
        toast.success('Todos os modelos foram restaurados com sucesso!');
      }
    } catch (err) {
      toast.error('Erro ao restaurar padrões.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTestContacts = async () => {
    try {
      const email = normalizeNotificationEmail(testEmail);
      const phone = normalizeNotificationPhone(testPhone);
      await handleSaveAll({ ...config, testEmail: email, testPhone: phone });
    } catch (error: any) { toast.error(error.message); }
  };

  const handleOpenWhatsAppTest = () => {
    try {
      const message = '[TESTE • PEDIDO DE EXEMPLO]\n\n' + renderStageTemplate(currentTemplate, { ...sampleOrderData, id: 'TESTE-999', customerName: 'Cliente Teste F PAC' });
      window.open(manualWhatsAppUrl(testPhone, message), '_blank', 'noopener,noreferrer');
      setTestResult('Conversa de teste aberta. Confira a mensagem e toque em Enviar no WhatsApp.');
    } catch (error: any) { toast.error(error.message); }
  };

  const handleSendTest = async () => {
    let email: string;
    try {
      email = normalizeNotificationEmail(testEmail);
      if (!email) throw new Error('Cadastre o e-mail de teste antes de enviar.');
    } catch (error: any) { toast.error(error.message); return; }
    setIsSendingTest(true);
    setTestResult('');
    try {
      const res = await authenticatedFetch('/api/automation/stage-notification/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ stageId: activeStageId, channel: 'email', email, customTemplate: currentTemplate })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.emailSent) throw new Error(data.error || 'O provedor não confirmou o envio do teste.');
      const message = 'Provedor aceitou o e-mail de teste para ' + email + '. Confira o recebimento e a pasta de spam.';
      setTestResult(message);
      toast.success('E-mail de teste aceito pelo provedor.');
    } catch (error: any) {
      setTestResult('Teste não confirmado: ' + error.message);
      toast.error(error.message);
    } finally { setIsSendingTest(false); }
  };

  // Sample order for live preview
  const sampleOrderData = {
    id: '1024',
    customerName: 'GABRIEL SILVA',
    total: 219.90,
    items: [
      { name: 'CAMISETA OVERSIZED F PAC - IDENTIDADE', quantity: 1, price: 159.90 },
      { name: 'BONÉ STRAPBACK STREETWEAR BLACK', quantity: 1, price: 60.00 }
    ],
    createdAt: new Date().toISOString(),
    deliveryDate: '3 a 5 dias úteis',
    paymentMethod: 'PIX — exemplo',
    trackingCode: 'EXEMPLO-SEM-RASTREIO',
    shippingCompany: 'Transportadora de exemplo',
    trackingUrl: 'https://fpacstore.com.br/tracking'
  };

  const activeStageConfig = NOTIFICATION_STAGES.find(s => s.id === activeStageId) || NOTIFICATION_STAGES[0];
  const renderedPreview = renderStageTemplate(currentTemplate, sampleOrderData);

  if (isLoading) {
    return (
      <div className="bg-white border border-black/10 p-12 text-center my-6 space-y-3">
        <RefreshCw className="animate-spin text-[#eab308] mx-auto" size={32} />
        <p className="text-xs font-black uppercase tracking-widest text-gray-600">Carregando painel de notificações automáticas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans my-4">
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-gradient-to-r from-zinc-950 via-black to-zinc-900 text-white p-6 md:p-8 border-b-4 border-[#eab308] shadow-2xl relative overflow-hidden">
        <div className="absolute right-[-20px] bottom-[-20px] text-white/5 rotate-12">
          <MessageCircle size={180} />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-[#eab308] text-black text-[9px] font-black uppercase tracking-widest">
                AUTOMATION ENGINE 2.0
              </span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={12} className="text-[#eab308]" /> Notificações da Produção
              </span>
            </div>
            {integration && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-neutral-800">
            <p>WhatsApp automático: {integration.whatsappConfigured ? 'integração configurada — confira o resultado de cada envio' : 'integração não configurada'}</p>
            <p>E-mail automático: {integration.emailConfigured ? 'integração configurada — confira o resultado de cada envio' : 'integração não configurada'}</p>
            <p>Enviado indica aceite pelo serviço; não confirma entrega ou leitura.</p>
          </div>}
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
              🤖 Automações de Produção F PAC
            </h1>
            <p className="text-xs text-gray-300 max-w-2xl leading-relaxed">
              E-mails automáticos nas etapas ativas. WhatsApp manual com mensagem pronta; envio automático disponível quando a integração for configurada e ativada.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={handleRestoreAllDefaults}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all"
            >
              <RotateCcw size={14} /> Restaurar Padrões
            </button>
            <button
              onClick={() => handleSaveAll()}
              disabled={isSaving}
              className="px-6 py-2.5 bg-[#eab308] text-black hover:bg-amber-400 font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-lg hover:scale-105 transition-all cursor-pointer"
            >
              {isSaving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
              Salvar Todas as Configurações
            </button>
          </div>
        </div>
      </div>

      {/* 2. CHANNELS CONTROL & GLOBAL TOGGLES */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* WhatsApp Channel Card */}
        <div className={`p-5 border-2 transition-all ${config.whatsappEnabled ? 'bg-emerald-50/40 border-emerald-500/50' : 'bg-gray-50 border-gray-200 opacity-80'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-[#25D366] text-white flex items-center justify-center rounded">
                <MessageCircle size={20} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-tight text-black">Canal WhatsApp</h3>
                <p className="text-[9px] text-gray-500 font-bold uppercase">Evolution API Integration</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                aria-label="Envio automático por WhatsApp"
                disabled={!integration?.whatsappConfigured}
                checked={config.whatsappEnabled}
                onChange={e => {
                  const updated = { ...config, whatsappEnabled: e.target.checked };
                  setConfig(updated);
                  handleSaveAll(updated);
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#25D366]"></div>
            </label>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-black/5 text-[10px]">
            <span className="text-gray-500 font-bold uppercase">Status da Conexão:</span>
            <span className="font-black bg-gray-100 px-2 py-0.5 uppercase tracking-wider">
              {integration?.whatsappConfigured ? (config.whatsappEnabled ? 'Automático ativado' : 'API configurada · manual ativo') : 'Manual · API não configurada'}
            </span>
          </div>
        </div>

        {/* E-mail Channel Card */}
        <div className={`p-5 border-2 transition-all ${config.emailEnabled ? 'bg-blue-50/40 border-blue-500/50' : 'bg-gray-50 border-gray-200 opacity-80'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-black text-white flex items-center justify-center rounded">
                <Mail size={20} />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-tight text-black">Canal E-mail</h3>
                <p className="text-[9px] text-gray-500 font-bold uppercase">Resend API Integration</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                aria-label="Envio automático por e-mail"
                checked={config.emailEnabled}
                onChange={e => {
                  const updated = { ...config, emailEnabled: e.target.checked };
                  setConfig(updated);
                  handleSaveAll(updated);
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-black/5 text-[10px]">
            <span className="text-gray-500 font-bold uppercase">Provedor:</span>
            <span className="font-black text-blue-700 bg-blue-100 px-2 py-0.5 uppercase tracking-wider">
              Resend (atendimento@fpacstore.com.br)
            </span>
          </div>
        </div>

        {/* Re-entry Policy & Idempotency */}
        <div className="p-5 border-2 bg-amber-50/30 border-amber-400/50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black uppercase tracking-tight text-black flex items-center gap-1.5">
                <Sliders size={14} className="text-amber-600" /> Política de Reenvio
              </h3>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.allowResendOnStageReentry}
                  onChange={e => {
                    const updated = { ...config, allowResendOnStageReentry: e.target.checked };
                    setConfig(updated);
                    handleSaveAll(updated);
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
            <p className="text-[10px] text-gray-600 leading-relaxed font-medium">
              Se o operador recuar a etapa de um pedido e avançá-lo novamente, reenviar a notificação para essa etapa?
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-black/5 text-[9px] font-black uppercase tracking-wider text-amber-800">
            {config.allowResendOnStageReentry ? '⚡ Reenvio em alteração manual ATIVADO' : '🛡️ Anti-duplicação Ativo (Apenas 1 disparo por etapa)'}
          </div>
        </div>

      </div>

      <section className="border border-black/10 bg-white p-5 space-y-4" aria-label="Destinatários fixos dos testes">
        <h2 className="text-sm font-black uppercase">Destinatários fixos dos testes</h2>
        <p className="text-xs text-gray-600">Salve seu e-mail e seu próprio WhatsApp. Os testes usam dados de exemplo e o texto atual da etapa selecionada.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold" htmlFor="notification-test-email">E-mail de teste
            <input id="notification-test-email" type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="Seu e-mail secundário" className="mt-1 block w-full border border-black/20 p-3 font-normal" />
          </label>
          <label className="text-xs font-bold" htmlFor="notification-test-phone">Seu WhatsApp de teste
            <input id="notification-test-phone" type="tel" value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="DDD e número" className="mt-1 block w-full border border-black/20 p-3 font-normal" />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isSaving} onClick={handleSaveTestContacts} className="border border-black px-4 py-3 text-xs font-bold disabled:opacity-50">Salvar destinatários de teste</button>
          <button type="button" onClick={handleOpenWhatsAppTest} className="bg-[#25D366] px-4 py-3 text-xs font-bold text-white">Testar WhatsApp manual</button>
          <button type="button" disabled={isSendingTest} onClick={handleSendTest} className="bg-black px-4 py-3 text-xs font-bold text-[#eab308] disabled:opacity-50">{isSendingTest ? 'Enviando teste…' : 'Enviar e-mail de teste'}</button>
        </div>
        {testResult && <p role="status" className="border-l-4 border-[#eab308] bg-amber-50 p-3 text-sm">{testResult}</p>}
      </section>

      {/* 3. STAGE TABS SELECTOR */}
      <div className="bg-white border border-black/10 shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-black/10 pb-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
            <Layers size={16} className="text-[#eab308]" /> Modelos de Mensagem por Etapa do Pedido
          </h2>
          <span className="text-[10px] font-bold text-gray-500 uppercase">
            Clique na etapa para editar o texto correspondente
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pb-2">
          {NOTIFICATION_STAGES.map(stage => {
            const isActive = stage.id === activeStageId;
            const isStageEnabled = config.activeStages?.[stage.id] !== false;

            return (
              <button
                key={stage.id}
                onClick={() => setActiveStageId(stage.id)}
                className={`px-4 py-3 border text-left transition-all shrink-0 flex items-center gap-2.5 cursor-pointer ${
                  isActive 
                    ? 'bg-black text-white border-black shadow-md' 
                    : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border-black/10'
                }`}
              >
                <span className="text-base">{stage.emoji}</span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-black uppercase tracking-tight ${isActive ? 'text-[#eab308]' : 'text-black'}`}>
                      {stage.label}
                    </span>
                    {!isStageEnabled && (
                      <span className="text-[8px] bg-red-100 text-red-700 px-1 font-black rounded">OFF</span>
                    )}
                  </div>
                  <span className={`text-[8px] font-mono font-bold ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
                    {stage.progress === null ? 'Atualização do pedido' : `Progresso: ${stage.progress}%`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. ACTIVE STAGE EDITOR & LIVE PREVIEW GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: EDITOR & VARIABLES */}
        <div className="lg:col-span-7 bg-white border border-black/10 p-6 space-y-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-black/10 pb-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl p-2 bg-gray-100 border border-black/10 rounded">{activeStageConfig.emoji}</span>
              <div>
                <h3 className="text-base font-black uppercase tracking-tight text-black flex items-center gap-2">
                  Etapa: {activeStageConfig.label}
                </h3>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Gatilho: Quando o pedido muda para status '{activeStageConfig.id}'
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer bg-gray-100 px-3 py-1.5 border border-black/10">
              <input
                type="checkbox"
                checked={config.activeStages?.[activeStageId] !== false}
                onChange={e => {
                  const updatedActive = {
                    ...config.activeStages,
                    [activeStageId]: e.target.checked
                  };
                  const updated = { ...config, activeStages: updatedActive };
                  setConfig(updated);
                  handleSaveAll(updated);
                }}
                className="w-4 h-4 accent-[#eab308]"
              />
              <span className="text-[10px] font-black uppercase tracking-wider text-black">
                {config.activeStages?.[activeStageId] !== false ? '✅ Notificação Ativa' : '❌ Notificação Pausada'}
              </span>
            </label>
          </div>

          {/* TEXTAREA EDITOR */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black uppercase tracking-wider text-black">
                Conteúdo do Modelo de Mensagem (WhatsApp / E-mail)
              </label>
              <button
                type="button"
                onClick={handleRestoreStageDefault}
                className="text-[9px] text-amber-700 font-black uppercase tracking-wider hover:underline flex items-center gap-1"
              >
                <RotateCcw size={10} /> Restaurar Padrão desta Etapa
              </button>
            </div>
            <textarea
              rows={16}
              value={currentTemplate}
              onChange={e => { const text = e.target.value; setCurrentTemplate(text); setConfig(prev => ({ ...prev, templates: { ...prev.templates, [activeStageId]: text } })); }}
              className="w-full p-4 border border-black/20 text-xs font-mono bg-zinc-950 text-emerald-400 focus:outline-none focus:border-[#eab308] leading-relaxed selection:bg-[#eab308] selection:text-black shadow-inner"
              placeholder="Digite a mensagem padrão da etapa..."
            />
          </div>

          {/* EDITOR ACTION BUTTONS */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-black/10">
            <button
              type="button"
              onClick={() => setIsTestModalOpen(true)}
              className="px-4 py-2.5 bg-black text-white hover:bg-zinc-800 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-black transition-all cursor-pointer"
            >
              <Send size={13} className="text-[#eab308]" /> Enviar Mensagem de Teste
            </button>

            <button
              type="button"
              onClick={() => handleSaveAll()}
              disabled={isSaving}
              className="px-6 py-2.5 bg-[#eab308] text-black hover:bg-amber-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md hover:scale-105 transition-all cursor-pointer"
            >
              {isSaving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
              Salvar Este Modelo
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE WHATSAPP PREVIEW */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-black/10 p-4 shadow-sm flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
              <Eye size={16} className="text-[#25D366]" /> Pré-visualização em Tempo Real
            </h3>
            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 uppercase tracking-wider">
              Visão do Cliente no WhatsApp
            </span>
          </div>

          <div className="bg-zinc-900 border-4 border-zinc-800 p-4 shadow-2xl rounded-2xl max-w-md mx-auto">
            <div className="bg-[#075E54] text-white p-3 rounded-t-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-black text-[#eab308] font-black flex items-center justify-center text-xs border border-white/20">
                  FP
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-tight">F PAC STORE OFICIAL</p>
                  <p className="text-[8px] text-emerald-200 font-bold uppercase">Online • Atendimento Automático</p>
                </div>
              </div>
              <Smartphone size={18} className="text-emerald-200 opacity-80" />
            </div>

            <div className="bg-[#e5ddd5] p-4 min-h-[420px] max-h-[520px] overflow-y-auto space-y-3 rounded-b-lg border-t border-black/10">
              <div className="text-center my-2">
                <span className="bg-white/80 text-gray-600 text-[8px] font-black px-2 py-0.5 rounded shadow-2xs uppercase tracking-wider">
                  HOJE • MENSAGEM AUTOMÁTICA
                </span>
              </div>

              <div className="bg-white p-3.5 rounded-lg shadow-md border-l-4 border-[#25D366] text-black space-y-2 relative max-w-[95%] ml-auto">
                <div className="text-[11px] font-sans leading-relaxed whitespace-pre-line text-zinc-900 selection:bg-amber-200">
                  {renderedPreview}
                </div>
                <div className="text-[8px] text-gray-400 font-bold text-right pt-1 flex items-center justify-end gap-1 border-t border-gray-100">
                  <span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-[#34B7F1] font-black">✓✓</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 5. HISTORY & DISPATCH LOGS TABLE */}
      <div className="bg-white border border-black/10 p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 pb-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-black flex items-center gap-2">
              <Clock size={16} className="text-[#eab308]" /> Histórico de Disparos de Notificação da Produção
            </h2>
            <p className="text-[10px] text-gray-500 font-bold uppercase">
              Registro auditável de todas as mensagens automáticas e manuais enviadas aos clientes
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Buscar por ID, Nome, Etapa..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-black/15 text-xs font-medium focus:outline-none focus:border-[#eab308]"
              />
            </div>
            <button
              onClick={fetchSettingsAndLogs}
              className="p-2 border border-black/15 hover:bg-black hover:text-[#eab308] transition-all cursor-pointer"
              title="Atualizar Histórico"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Logs Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-100 border-b border-black/10 text-[9px] font-black uppercase tracking-wider text-gray-600">
                <th className="p-3">Data / Hora</th>
                <th className="p-3">Pedido</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Etapa Notificada</th>
                <th className="p-3">WhatsApp</th>
                <th className="p-3">E-mail</th>
                <th className="p-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 font-medium">
              {logs.filter(l => {
                if (!searchTerm) return true;
                const search = searchTerm.toLowerCase();
                return (
                  String(l.id || '').toLowerCase().includes(search) ||
                  String(l.details || '').toLowerCase().includes(search) ||
                  String(l.recipient || '').toLowerCase().includes(search) ||
                  String(l.stageLabel || '').toLowerCase().includes(search)
                );
              }).length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400 text-xs font-bold uppercase tracking-wider">
                    Nenhum disparo de notificação registrado no histórico ainda.
                  </td>
                </tr>
              ) : (
                logs.slice(0, 25).map((log, idx) => (
                  <tr key={log.id || idx} className="hover:bg-gray-50/80 transition-colors">
                    <td className="p-3 font-mono text-[10px] text-gray-500 whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('pt-BR') : 'Recentemente'}
                    </td>
                    <td className="p-3 font-black text-black uppercase">
                      {log.orderId ? '#' + log.orderId : '—'}
                    </td>
                    <td className="p-3 font-bold uppercase text-gray-800">
                      {log.recipient || log.target || '—'}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-black text-[#eab308] text-[9px] font-black uppercase tracking-wider rounded-2xs">
                        {log.stageLabel || 'Notificação'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 w-fit ${
                        ['Enviado', 'Já enviado'].includes(notificationChannelStatus(log, 'whatsapp'))
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        <MessageCircle size={10} /> {notificationChannelStatus(log, 'whatsapp')}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 w-fit ${
                        ['Enviado', 'Já enviado'].includes(notificationChannelStatus(log, 'email'))
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        <Mail size={10} /> {notificationChannelStatus(log, 'email')}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => toast(log.details || log.message || 'Disparo registrado com sucesso', { icon: 'ℹ️' })}
                        className="text-[9px] font-black uppercase tracking-wider text-black hover:text-[#eab308] underline"
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. TEST NOTIFICATION MODAL */}
      {isTestModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border-2 border-black p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-black/10 pb-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
                <Send size={16} className="text-[#eab308]" /> Disparar Mensagem de Teste
              </h3>
              <button
                onClick={() => setIsTestModalOpen(false)}
                className="text-gray-400 hover:text-black font-bold text-base"
              >
                ✕
              </button>
            </div>

            <p className="text-[10px] text-gray-600 leading-relaxed font-medium">
              Teste o texto atual da etapa <strong className="uppercase font-black">"{activeStageConfig.label}"</strong> com os destinatários salvos. O WhatsApp abre a conversa para envio manual; o e-mail usa o serviço da loja.
            </p>

            <p className="text-xs">E-mail: {testEmail || 'Cadastre o destinatário na seção de testes.'}</p>
            <p className="text-xs">WhatsApp: {testPhone || 'Cadastre seu número na seção de testes.'}</p>
            <button type="button" onClick={handleOpenWhatsAppTest} className="bg-[#25D366] text-white px-4 py-3 text-xs font-bold">Testar WhatsApp manual</button>
            {testResult && <p role="status" className="text-sm">{testResult}</p>}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/10">
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="px-4 py-2 border border-black/20 text-[10px] font-black uppercase tracking-wider hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={isSendingTest}
                className="px-6 py-2 bg-black text-[#eab308] hover:bg-[#eab308] hover:text-black font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer"
              >
                {isSendingTest ? <RefreshCw className="animate-spin" size={14} /> : <Send size={14} />}
                Enviar e-mail de teste
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
