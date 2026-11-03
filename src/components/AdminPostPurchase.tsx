import React, { useEffect, useState } from 'react';
import { authenticatedFetch, parseApiJson } from '../lib/api';
import { Download, Image, MessageCircle, RefreshCw, Save, Search, Send, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';

type FollowupOrder = {
  id: string; customerName: string; phone: string; email: string; createdAt: string;
  items: Array<{ name: string; color: string; size: string; quantity: number }>;
  surveyStatus: string; repurchaseStatus: string; surveyEmailStatus: string; repurchaseEmailStatus: string;
  marketingConsent: boolean; emailConsent: boolean; whatsappConsent: boolean;
  satisfaction?: { productRating: number; serviceRating: number; checkoutDifficulty: string; difficultyDetails?: string; notes?: string } | null;
};
type Settings = { surveyEmailAutomatic: boolean; repurchaseEmailAutomatic: boolean; surveyWhatsAppAutomatic: boolean; repurchaseWhatsAppAutomatic: boolean; discountPercent: number; couponValidityDays: number };
type PreparedWhatsApp = { orderId: string; kind: 'survey' | 'repurchase'; whatsappUrl: string; message: string; imageBase64: string; imageFileName: string; imageMimeType: string };
const defaults: Settings = { surveyEmailAutomatic: true, repurchaseEmailAutomatic: true, surveyWhatsAppAutomatic: false, repurchaseWhatsAppAutomatic: false, discountPercent: 5, couponValidityDays: 7 };

export default function AdminPostPurchase() {
  const [settings, setSettings] = useState(defaults);
  const [orders, setOrders] = useState<FollowupOrder[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [emailAutomaticAvailable, setEmailAutomaticAvailable] = useState(false);
  const [whatsappAutomaticAvailable, setWhatsappAutomaticAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, any>>({});
  const [preparedWhatsApp, setPreparedWhatsApp] = useState<PreparedWhatsApp | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/admin/post-purchase');
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.error || 'Falha ao carregar a aba.');
      setSettings({ ...defaults, ...data.settings }); setOrders(data.orders || []); setEmailAutomaticAvailable(data.emailAutomaticAvailable === true); setWhatsappAutomaticAvailable(data.whatsappAutomaticAvailable === true);
    } catch (error: any) { toast.error(error.message || 'Não foi possível carregar.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await authenticatedFetch('/api/admin/post-purchase/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      setSettings({ ...defaults, ...data }); toast.success('Configurações salvas.');
    } catch (error: any) { toast.error(error.message || 'Erro ao salvar.'); }
    finally { setSaving(false); }
  };

  const prepareWhatsApp = async (order: FollowupOrder, kind: 'survey' | 'repurchase') => {
    try {
      const response = await authenticatedFetch(`/api/admin/post-purchase/${encodeURIComponent(order.id)}/send/${kind}`, { method: 'POST' });
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.error || 'Não foi possível preparar a mensagem.');
      setPreparedWhatsApp({ orderId: order.id, kind, ...data });
      toast.success(kind === 'survey' ? 'Pesquisa e imagem prontas para compartilhar.' : 'Cupom, imagem e mensagem prontos para compartilhar.');
      await load();
    } catch (error: any) { toast.error(error.message || 'Não foi possível preparar.'); }
  };

  const preparedBlob = (prepared: PreparedWhatsApp) => {
    const binary = atob(prepared.imageBase64);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new Blob([bytes], { type: prepared.imageMimeType || 'image/png' });
  };
  const downloadPreparedImage = (prepared: PreparedWhatsApp) => {
    const url = URL.createObjectURL(preparedBlob(prepared));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = prepared.imageFileName; anchor.click();
    URL.revokeObjectURL(url);
  };
  const sharePreparedWhatsApp = async (prepared: PreparedWhatsApp) => {
    const blob = preparedBlob(prepared);
    const file = new File([blob], prepared.imageFileName, { type: prepared.imageMimeType || 'image/png' });
    try {
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        setSharing(true);
        await navigator.share({ files: [file], title: prepared.kind === 'survey' ? 'Pesquisa F PAC STORE' : 'Bônus F PAC STORE', text: prepared.message });
        toast.success('Compartilhamento aberto. Confira o destinatário antes de enviar.');
      } else {
        downloadPreparedImage(prepared);
        window.open(prepared.whatsappUrl, '_blank', 'noopener,noreferrer');
        toast('Imagem baixada. Anexe-a na conversa do WhatsApp antes de enviar.');
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') toast.error('Não foi possível abrir o compartilhamento. Você pode baixar a imagem e anexá-la no WhatsApp.');
    } finally { setSharing(false); }
  };

  const saveResponse = async (order: FollowupOrder) => {
    const draft = responseDrafts[order.id] || order.satisfaction || {};
    try {
      const response = await authenticatedFetch(`/api/admin/post-purchase/${encodeURIComponent(order.id)}/survey`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.error || 'Confira as respostas da pesquisa.');
      toast.success('Resposta registrada.'); await load();
    } catch (error: any) { toast.error(error.message || 'Não foi possível salvar a resposta.'); }
  };

  const filtered = orders.filter(order => `${order.customerName} ${order.id} ${order.phone}`.toLowerCase().includes(search.toLowerCase()));
  const draftFor = (order: FollowupOrder) => responseDrafts[order.id] || order.satisfaction || { productRating: '', serviceRating: '', checkoutDifficulty: 'no', difficultyDetails: '', notes: '' };
  const updateDraft = (order: FollowupOrder, patch: any) => setResponseDrafts(prev => ({ ...prev, [order.id]: { ...draftFor(order), ...patch } }));

  return <main className="space-y-5 p-3 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#eab308] bg-black p-5 text-white">
      <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#eab308]">Relacionamento pós-compra</p><h1 className="mt-1 text-xl font-black uppercase">Clima & satisfação</h1></div>
      <button onClick={() => void load()} className="flex items-center gap-2 border border-white/30 px-3 py-2 text-xs font-bold"><RefreshCw size={14}/> Atualizar</button>
    </header>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 border border-black/10 bg-white p-4">
        <h2 className="font-black uppercase">Automação e bônus de recompra</h2>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={settings.surveyEmailAutomatic} onChange={e => setSettings(s => ({ ...s, surveyEmailAutomatic: e.target.checked }))}/> Enviar pesquisa por e-mail após 7 dias (com consentimento)</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={settings.repurchaseEmailAutomatic} onChange={e => setSettings(s => ({ ...s, repurchaseEmailAutomatic: e.target.checked }))}/> Enviar oferta por e-mail após 30 dias (com consentimento)</label>
        {!emailAutomaticAvailable && <p className="text-xs text-amber-800">Envio automático de e-mail não pronto: falta configurar RESEND_API_KEY no servidor. Os e-mails não serão marcados como enviados.</p>}
        <div className="border-t pt-3">
          <p className="mb-2 text-xs font-black uppercase">WhatsApp com imagem + texto · manual por padrão</p>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={settings.surveyWhatsAppAutomatic} disabled={!whatsappAutomaticAvailable} onChange={e => setSettings(s => ({ ...s, surveyWhatsAppAutomatic: e.target.checked }))}/> Enviar pesquisa pelo WhatsApp após 7 dias (com consentimento)</label>
          <label className="mt-2 flex gap-2 text-sm"><input type="checkbox" checked={settings.repurchaseWhatsAppAutomatic} disabled={!whatsappAutomaticAvailable} onChange={e => setSettings(s => ({ ...s, repurchaseWhatsAppAutomatic: e.target.checked }))}/> Enviar recompra pelo WhatsApp após 30 dias (com consentimento)</label>
          {!whatsappAutomaticAvailable && <p className="mt-2 text-xs text-amber-800">Automação indisponível: falta configurar a integração Evolution API no servidor.</p>}
        </div>
        <div className="rounded border bg-gray-50 p-3 text-sm"><strong>Bônus:</strong> +5% adicional sobre cupons ativos · <strong>validade:</strong> 7 dias · <strong>limite:</strong> 1 uso a cada 6 meses por cliente.</div>
        <p className="text-xs text-gray-600">As mensagens manuais abrem uma prévia da arte e permitem compartilhar imagem + texto no celular. O envio automático do WhatsApp começa desativado e exige integração e consentimento do cliente.</p>
        <button disabled={saving} onClick={() => void saveSettings()} className="flex items-center gap-2 bg-black px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50"><Save size={14}/> {saving ? 'Salvando…' : 'Salvar regras'}</button>
      </div>
      <div className="border border-black/10 bg-white p-4 text-sm leading-relaxed text-gray-700">
        <h2 className="mb-2 flex items-center gap-2 font-black uppercase"><MessageCircle size={16}/> Pesquisa rápida</h2>
        <p>Após 7 dias: nota do produto (1–5), nota do atendimento (1–5) e dificuldade no checkout.</p>
        <p className="mt-2">Após 30 dias: e-mail automático de recompra, somente para quem autorizar e tiver e-mail válido. O cupom soma +5% a um cupom ativo, vale 7 dias e pode ser usado uma vez a cada 6 meses.</p>
        <p className="mt-2 text-xs text-gray-500">Os botões manuais abrem uma conversa pré-preenchida; a mensagem só é enviada quando você confirmar no WhatsApp.</p>
      </div>
    </section>

    <div className="flex items-center gap-2 border border-black/10 bg-white px-3"><Search size={16}/><input className="min-h-11 w-full outline-none" placeholder="Buscar cliente ou pedido" value={search} onChange={e => setSearch(e.target.value)}/></div>
    {loading ? <p className="p-8 text-center">Carregando pedidos pagos…</p> : filtered.length === 0 ? <p className="border border-black/10 bg-white p-8 text-center text-sm">Nenhum pedido pago com telefone ou e-mail encontrado.</p> : <section className="space-y-3">
      {filtered.map(order => <article key={order.id} className="space-y-4 border border-black/10 bg-white p-4">
        <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-black">{order.customerName}</h3><p className="text-xs text-gray-500">Pedido #{order.id} · {new Date(order.createdAt).toLocaleDateString('pt-BR')} · {order.phone || order.email}</p><p className="mt-1 text-xs">{order.items.map(item => `${item.quantity}× ${item.name} (${item.color}, ${item.size})`).join(' · ')}</p><p className="mt-1 text-xs text-gray-600">Consentimento: e-mail {order.emailConsent ? 'sim' : 'não'} · WhatsApp {order.whatsappConsent ? 'sim' : 'não'}</p></div><span className={`h-fit px-2 py-1 text-[10px] font-bold ${order.marketingConsent ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{order.marketingConsent ? 'Opt-in registrado' : 'Sem aceite para automação'}</span></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void prepareWhatsApp(order, 'survey')} disabled={!order.phone} className="flex items-center gap-2 border border-black px-3 py-2 text-xs font-bold disabled:opacity-40"><Send size={14}/> Preparar pesquisa 7 dias <span className="text-gray-500">· {order.surveyStatus}</span></button>
          <button onClick={() => void prepareWhatsApp(order, 'repurchase')} disabled={!order.phone || !settings.discountPercent} className="flex items-center gap-2 border border-black px-3 py-2 text-xs font-bold disabled:opacity-40"><MessageCircle size={14}/> Cupom + WhatsApp 30 dias <span className="text-gray-500">· {order.repurchaseStatus}</span></button>
          <span className="self-center text-xs text-gray-600">E-mail pesquisa: {order.surveyEmailStatus} · recompra: {order.repurchaseEmailStatus}</span>
        </div>
        {preparedWhatsApp?.orderId === order.id && <div className="grid gap-3 rounded border border-[#eab308] bg-[#f4f2ec] p-3 md:grid-cols-[minmax(0,220px)_1fr]">
          <img src={`data:${preparedWhatsApp.imageMimeType};base64,${preparedWhatsApp.imageBase64}`} alt={preparedWhatsApp.kind === 'survey' ? 'Prévia da pesquisa de satisfação F PAC STORE' : 'Prévia do bônus de recompra F PAC STORE'} className="w-full max-w-[220px] rounded border bg-white" />
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-black"><Image size={16}/> Imagem pronta para WhatsApp</div>
            <p className="text-xs text-gray-700">No celular, compartilhe a imagem e o texto e escolha o WhatsApp. Se o compartilhamento de arquivo não estiver disponível, baixe a imagem e anexe-a na conversa.</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void sharePreparedWhatsApp(preparedWhatsApp)} disabled={sharing} className="flex items-center gap-2 bg-black px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Share2 size={14}/> {sharing ? 'Abrindo…' : 'Compartilhar imagem + texto'}</button>
              <button onClick={() => { downloadPreparedImage(preparedWhatsApp); window.open(preparedWhatsApp.whatsappUrl, '_blank', 'noopener,noreferrer'); }} className="flex items-center gap-2 border border-black px-3 py-2 text-xs font-bold"><Download size={14}/> Baixar e abrir WhatsApp</button>
              <button onClick={() => setPreparedWhatsApp(null)} className="border border-black/20 px-3 py-2 text-xs">Fechar prévia</button>
            </div>
          </div>
        </div>}
        <div className="grid gap-2 md:grid-cols-4">
          <label className="text-[10px] font-bold uppercase">Produto (1–5)<select className="mt-1 w-full border p-2 text-sm" value={draftFor(order).productRating} onChange={e => updateDraft(order, { productRating: Number(e.target.value) })}><option value="">—</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} ★</option>)}</select></label>
          <label className="text-[10px] font-bold uppercase">Atendimento (1–5)<select className="mt-1 w-full border p-2 text-sm" value={draftFor(order).serviceRating} onChange={e => updateDraft(order, { serviceRating: Number(e.target.value) })}><option value="">—</option>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n} ★</option>)}</select></label>
          <label className="text-[10px] font-bold uppercase">Dificuldade?<select className="mt-1 w-full border p-2 text-sm" value={draftFor(order).checkoutDifficulty} onChange={e => updateDraft(order, { checkoutDifficulty: e.target.value })}><option value="no">Não</option><option value="yes">Sim</option></select></label>
          <button onClick={() => void saveResponse(order)} className="self-end bg-[#eab308] px-3 py-2 text-xs font-black uppercase">Registrar resposta</button>
        </div>
        {draftFor(order).checkoutDifficulty === 'yes' && <input className="w-full border p-2 text-sm" placeholder="Qual foi a dificuldade?" value={draftFor(order).difficultyDetails || ''} onChange={e => updateDraft(order, { difficultyDetails: e.target.value })}/>}
      </article>)}
    </section>}
  </main>;
}
