import React, { useEffect, useState } from 'react';
import { authenticatedFetch, parseApiJson } from '../lib/api';
import { MessageCircle, RefreshCw, Save, Search, Send } from 'lucide-react';
import toast from 'react-hot-toast';

type FollowupOrder = {
  id: string; customerName: string; phone: string; email: string; createdAt: string;
  items: Array<{ name: string; color: string; size: string; quantity: number }>;
  surveyStatus: string; repurchaseStatus: string; marketingConsent: boolean;
  satisfaction?: { productRating: number; serviceRating: number; checkoutDifficulty: string; difficultyDetails?: string; notes?: string } | null;
};
type Settings = { surveyAutomatic: boolean; repurchaseAutomatic: boolean; discountPercent: number; couponValidityDays: number };
const defaults: Settings = { surveyAutomatic: false, repurchaseAutomatic: false, discountPercent: 0, couponValidityDays: 30 };

export default function AdminPostPurchase() {
  const [settings, setSettings] = useState(defaults);
  const [orders, setOrders] = useState<FollowupOrder[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [whatsappAutomaticAvailable, setWhatsappAutomaticAvailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, any>>({});

  const load = async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/admin/post-purchase');
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.error || 'Falha ao carregar a aba.');
      setSettings({ ...defaults, ...data.settings }); setOrders(data.orders || []); setWhatsappAutomaticAvailable(data.whatsappAutomaticAvailable === true);
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
    const tab = window.open('about:blank', '_blank');
    try {
      const response = await authenticatedFetch(`/api/admin/post-purchase/${encodeURIComponent(order.id)}/send/${kind}`, { method: 'POST' });
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.error || 'Não foi possível preparar a mensagem.');
      if (tab) tab.location.href = data.whatsappUrl;
      else window.location.href = data.whatsappUrl;
      toast.success(kind === 'survey' ? 'Pesquisa pronta no WhatsApp.' : 'Cupom criado e mensagem pronta no WhatsApp.');
      await load();
    } catch (error: any) { tab?.close(); toast.error(error.message || 'Não foi possível preparar.'); }
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
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={settings.surveyAutomatic} disabled={!whatsappAutomaticAvailable} onChange={e => setSettings(s => ({ ...s, surveyAutomatic: e.target.checked }))}/> Enviar pesquisa automaticamente após 7 dias</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={settings.repurchaseAutomatic} disabled={!settings.discountPercent || !whatsappAutomaticAvailable} onChange={e => setSettings(s => ({ ...s, repurchaseAutomatic: e.target.checked }))}/> Enviar oferta de recompra automaticamente após 30 dias</label>
        {!whatsappAutomaticAvailable && <p className="text-xs text-amber-800">O envio automático precisa da integração WhatsApp configurada. Os botões manuais seguem disponíveis.</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold">Cupom de desconto (%)<input className="mt-1 w-full border p-2 text-sm" type="number" min="0" max="50" value={settings.discountPercent} onChange={e => setSettings(s => ({ ...s, discountPercent: Number(e.target.value) }))}/></label>
          <label className="text-xs font-bold">Validade (dias)<input className="mt-1 w-full border p-2 text-sm" type="number" min="1" max="180" value={settings.couponValidityDays} onChange={e => setSettings(s => ({ ...s, couponValidityDays: Number(e.target.value) }))}/></label>
        </div>
        {!settings.discountPercent && <p className="text-xs text-amber-800">Defina o percentual do bônus para ativar o envio automático ou emitir cupons manuais.</p>}
        <button disabled={saving} onClick={() => void saveSettings()} className="flex items-center gap-2 bg-black px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50"><Save size={14}/> {saving ? 'Salvando…' : 'Salvar regras'}</button>
      </div>
      <div className="border border-black/10 bg-white p-4 text-sm leading-relaxed text-gray-700">
        <h2 className="mb-2 flex items-center gap-2 font-black uppercase"><MessageCircle size={16}/> Pesquisa rápida</h2>
        <p>Após 7 dias: nota do produto (1–5), nota do atendimento (1–5) e dificuldade no checkout.</p>
        <p className="mt-2">Após 30 dias: cupom individual, válido para o telefone ou e-mail do pedido. A oferta automática depende do aceite de WhatsApp no checkout.</p>
        <p className="mt-2 text-xs text-gray-500">Os botões manuais abrem uma conversa pré-preenchida; a mensagem só é enviada quando você confirmar no WhatsApp.</p>
      </div>
    </section>

    <div className="flex items-center gap-2 border border-black/10 bg-white px-3"><Search size={16}/><input className="min-h-11 w-full outline-none" placeholder="Buscar cliente ou pedido" value={search} onChange={e => setSearch(e.target.value)}/></div>
    {loading ? <p className="p-8 text-center">Carregando pedidos pagos…</p> : filtered.length === 0 ? <p className="border border-black/10 bg-white p-8 text-center text-sm">Nenhum pedido pago com telefone ou e-mail encontrado.</p> : <section className="space-y-3">
      {filtered.map(order => <article key={order.id} className="space-y-4 border border-black/10 bg-white p-4">
        <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-black">{order.customerName}</h3><p className="text-xs text-gray-500">Pedido #{order.id} · {new Date(order.createdAt).toLocaleDateString('pt-BR')} · {order.phone || order.email}</p><p className="mt-1 text-xs">{order.items.map(item => `${item.quantity}× ${item.name} (${item.color}, ${item.size})`).join(' · ')}</p></div><span className={`h-fit px-2 py-1 text-[10px] font-bold ${order.marketingConsent ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{order.marketingConsent ? 'Aceitou mensagens pós-compra' : 'Sem aceite para automação'}</span></div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void prepareWhatsApp(order, 'survey')} disabled={!order.phone} className="flex items-center gap-2 border border-black px-3 py-2 text-xs font-bold disabled:opacity-40"><Send size={14}/> Preparar pesquisa 7 dias <span className="text-gray-500">· {order.surveyStatus}</span></button>
          <button onClick={() => void prepareWhatsApp(order, 'repurchase')} disabled={!order.phone || !settings.discountPercent} className="flex items-center gap-2 border border-black px-3 py-2 text-xs font-bold disabled:opacity-40"><MessageCircle size={14}/> Cupom + WhatsApp 30 dias <span className="text-gray-500">· {order.repurchaseStatus}</span></button>
        </div>
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
