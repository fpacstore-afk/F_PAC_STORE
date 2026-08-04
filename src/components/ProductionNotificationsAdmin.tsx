import React, { useState, useEffect } from 'react';
import { 
  Send, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  MessageCircle, 
  Mail, 
  Smartphone, 
  Save, 
  RotateCcw, 
  Eye, 
  Sliders, 
  Copy, 
  Clock, 
  Search, 
  Info,
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
import { getApiUrl } from '../lib/api';

const AVAILABLE_VARIABLES = [
  { tag: '{{nome_cliente}}', label: 'Primeiro Nome', desc: 'Ex: JOÃO' },
  { tag: '{{numero_pedido}}', label: 'Nº do Pedido', desc: 'Ex: 1024' },
  { tag: '{{valor_pedido}}', label: 'Valor Total', desc: 'Ex: R$ 189,90' },
  { tag: '{{produto}}', label: 'Lista de Peças', desc: 'Ex: 1x CAMISETA OVERSIZED' },
  { tag: '{{quantidade}}', label: 'Qtd Total', desc: 'Ex: 2' },
  { tag: '{{data}}', label: 'Data do Pedido', desc: 'Ex: 24/07/2026' },
  { tag: '{{previsao}}', label: 'Previsão de Entrega', desc: 'Ex: 3 a 7 dias úteis' },
  { tag: '{{forma_pagamento}}', label: 'Forma Pgto', desc: 'Ex: PIX / CARTÃO' },
  { tag: '{{codigo_rastreio}}', label: 'Cód Rastreio', desc: 'Ex: BR123456789PAC' },
  { tag: '{{transportadora}}', label: 'Transportadora', desc: 'Ex: Correios / Jadlog' },
  { tag: '{{link_rastreio}}', label: 'Link Rastreio', desc: 'Ex: https://...' }
];

export function ProductionNotificationsAdmin() {
  const [config, setConfig] = useState<ProductionNotificationConfig>(DEFAULT_NOTIFICATION_CONFIG);
  const [activeStageId, setActiveStageId] = useState<string>('received');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Test Modal
  const [isTestModalOpen, setIsTestModalOpen] = useState<boolean>(false);
  const [testPhone, setTestPhone] = useState<string>('');
  const [testEmail, setTestEmail] = useState<string>('');
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);

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
      const res = await fetch(getApiUrl('/api/automation/production-settings'));
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setCurrentTemplate(data.templates?.[activeStageId] || DEFAULT_STAGE_TEMPLATES[activeStageId] || '');
      }
      
      // Fetch telemetry/logs
      const dashRes = await fetch(getApiUrl('/api/automation/dashboard'));
      if (dashRes.ok) {
        const dashData = await dashRes.json();
        const stageLogs = (dashData.logs || []).filter((l: any) => 
          l.event === 'production.stage_notification' || l.stageId || l.whatsappStatus
        );
        setLogs(stageLogs);
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
      toast.error('Erro ao carregar configurações de notificações.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAll = async (updatedConfig?: ProductionNotificationConfig) => {
    setIsSaving(true);
    const targetConfig = updatedConfig || {
      ...config,
      templates: {
        ...config.templates,
        [activeStageId]: currentTemplate
      }
    };

    try {
      const res = await fetch(getApiUrl('/api/automation/production-settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetConfig)
      });

      if (res.ok) {
        const resData = await res.json();
        setConfig(resData.settings);
        toast.success('Configurações de notificação salvas com sucesso!');
      } else {
        toast.error('Erro ao salvar no servidor.');
      }
    } catch (error: any) {
      toast.error('Erro de conexão ao salvar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInsertVariable = (varTag: string) => {
    setCurrentTemplate(prev => prev + ' ' + varTag);
    toast.success(`Variável ${varTag} inserida`);
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
      const res = await fetch(getApiUrl('/api/automation/production-settings/restore-defaults'), {
        method: 'POST'
      });
      if (res.ok) {
        const resData = await res.json();
        setConfig(resData.settings);
        setCurrentTemplate(resData.settings.templates[activeStageId] || DEFAULT_STAGE_TEMPLATES[activeStageId]);
        toast.success('Todos os modelos foram restaurados com sucesso!');
      }
    } catch (err) {
      toast.error('Erro ao restaurar padrões.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testPhone && !testEmail) {
      toast.error('Informe ao menos um telefone ou e-mail para o teste');
      return;
    }

    setIsSendingTest(true);
    try {
      const res = await fetch(getApiUrl('/api/automation/stage-notification/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageId: activeStageId,
          phone: testPhone,
          email: testEmail,
          customTemplate: currentTemplate
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Mensagem de teste enviada com sucesso!');
        setIsTestModalOpen(false);
      } else {
        toast.error(`Falha no teste: ${data.error || 'Verifique as chaves do WhatsApp/Email'}`);
      }
    } catch (error: any) {
      toast.error('Erro de rede ao enviar teste.');
    } finally {
      setIsSendingTest(false);
    }
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
    paymentMethod: 'PIX (Aprovação Imediata)',
    trackingCode: 'BR987654321PAC',
    shippingCompany: 'Correios SEDEX',
    trackingUrl: 'https://www.fpacstore.com.br/#/order/1024'
  };

  const activeStageConfig = PRODUCTION_STAGES.find(s => s.id === activeStageId) || PRODUCTION_STAGES[0];
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
            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-white flex items-center gap-3">
              🤖 Automações de Produção F PAC
            </h1>
            <p className="text-xs text-gray-300 max-w-2xl leading-relaxed">
              Disparo automático e instantâneo de mensagens via WhatsApp e E-mail a cada avanço no fluxo de produção dos pedidos.
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
            <span className="font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Conectado
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

      {/* 3. STAGE TABS SELECTOR */}
      <div className="bg-white border border-black/10 shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-black/10 pb-3">
          <h2 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
            <Layers size={16} className="text-[#eab308]" /> Modelos de Mensagem por Etapa de Produção
          </h2>
          <span className="text-[10px] font-bold text-gray-500 uppercase">
            Clique na etapa para editar o texto correspondente
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {PRODUCTION_STAGES.map(stage => {
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
                    Progresso: {stage.progress}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. ACTIVE STAGE EDITOR & LIVE PREVIEW GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: EDITOR & VARIABLES (7 COLS) */}
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

            {/* Toggle stage active */}
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

          {/* VARIABLE INSERTION CHIPS */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-black flex items-center gap-1">
                <Info size={12} className="text-[#eab308]" /> Variáveis Dinâmicas Disponíveis
              </span>
              <span className="text-[9px] text-gray-400 font-bold uppercase">Clique no botão para inserir na mensagem</span>
            </div>
            <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50 border border-black/10">
              {AVAILABLE_VARIABLES.map(v => (
                <button
                  key={v.tag}
                  type="button"
                  onClick={() => handleInsertVariable(v.tag)}
                  className="px-2.5 py-1 bg-white hover:bg-black hover:text-[#eab308] border border-black/15 text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                  title={v.desc}
                >
                  <Copy size={10} /> {v.label} <span className="text-gray-400 text-[8px] font-mono font-normal">({v.tag})</span>
                </button>
              ))}
            </div>
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
              onChange={e => setCurrentTemplate(e.target.value)}
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

        {/* RIGHT COLUMN: LIVE WHATSAPP PREVIEW (5 COLS) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-black/10 p-4 shadow-sm flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
              <Eye size={16} className="text-[#25D366]" /> Pré-visualização em Tempo Real
            </h3>
            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 uppercase tracking-wider">
              Visão do Cliente no WhatsApp
            </span>
          </div>

          {/* SIMULATED MOBILE PHONE CONTAINER */}
          <div className="bg-zinc-900 border-4 border-zinc-800 p-4 shadow-2xl rounded-2xl max-w-md mx-auto">
            {/* Phone Header */}
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

            {/* Phone Chat Screen */}
            <div className="bg-[#e5ddd5] p-4 min-h-[420px] max-h-[520px] overflow-y-auto space-y-3 rounded-b-lg border-t border-black/10">
              <div className="text-center my-2">
                <span className="bg-white/80 text-gray-600 text-[8px] font-black px-2 py-0.5 rounded shadow-2xs uppercase tracking-wider">
                  HOJE • MENSAGEM AUTOMÁTICA
                </span>
              </div>

              {/* Chat Bubble */}
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
                      #{log.orderId || log.recipient || 'M-ORD'}
                    </td>
                    <td className="p-3 font-bold uppercase text-gray-800">
                      {log.recipient || log.details?.split(' ')[1] || 'Cliente'}
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-black text-[#eab308] text-[9px] font-black uppercase tracking-wider rounded-2xs">
                        {log.stageLabel || 'Notificação'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 w-fit ${
                        log.whatsappStatus === 'Enviado' || log.event?.includes('sent')
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        <MessageCircle size={10} /> {log.whatsappStatus || 'Enviado'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 w-fit ${
                        log.emailStatus === 'Enviado'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        <Mail size={10} /> {log.emailStatus || 'Enviado'}
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
              Envie o modelo atual da etapa <strong className="uppercase font-black">"{activeStageConfig.label}"</strong> para o seu WhatsApp ou e-mail de teste para validar o formato.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-black mb-1">
                  Telefone / WhatsApp de Teste
                </label>
                <input
                  type="text"
                  placeholder="Ex: 47997465602"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  className="w-full p-2.5 border border-black/20 text-xs font-mono focus:outline-none focus:border-[#eab308]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-black mb-1">
                  E-mail de Teste
                </label>
                <input
                  type="email"
                  placeholder="Ex: seu-email@gmail.com"
                  value={testEmail}
                  onChange={e => setTestEmail(e.target.value)}
                  className="w-full p-2.5 border border-black/20 text-xs font-mono focus:outline-none focus:border-[#eab308]"
                />
              </div>
            </div>

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
                Enviar Teste Agora
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
