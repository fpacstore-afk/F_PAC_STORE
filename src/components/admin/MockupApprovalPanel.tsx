import React, { useEffect, useState } from 'react';
import { authenticatedFetch, parseApiJson } from '../../lib/api';
import { uploadArtworkToCloudinary } from '../../services/cloudinary';

const labels: Record<string, string> = { pending: 'Aguardando aprovação', approved: 'Aprovado pelo link', revoked: 'Link cancelado', superseded: 'Versão substituída / pedido alterado', expired: 'Link expirado' };
export function MockupApprovalPanel({ order }: { order: any }) {
  const [data, setData] = useState<any>(null), [images, setImages] = useState<string[]>([]), [notes, setNotes] = useState('');
  const [link, setLink] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const path = `/api/admin/orders/${encodeURIComponent(order.id)}/mockup-approvals`;
  async function api(suffix = '', method = 'GET', body?: any) {
    const response = await authenticatedFetch(path + suffix, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const value = await parseApiJson<any>(response);
    if (!response.ok) throw new Error(value.message || 'Não foi possível consultar o mockup.');
    return value;
  }
  const load = async () => setData(await api());
  const run = async (action: () => Promise<void>) => { setBusy(true); setMessage(''); try { await action(); } catch (error: any) { setMessage(error.message); } finally { setBusy(false); } };
  useEffect(() => { void run(load); }, [order.id, order.mockupApproval?.revision, order.mockupApproval?.status, order.customEditRevision]);
  return <details className="border border-black/15 bg-white p-3 text-xs">
    <summary className="cursor-pointer font-bold">Aprovação do mockup {data?.history?.[0] ? `· v${data.history[0].revision} · ${labels[data.history[0].status]}` : ''}</summary>
    <div className="mt-3 space-y-3">
      <p>Anexe a prévia completa da peça para o cliente conferir. Cada novo link substitui o anterior. A aprovação fica registrada com as imagens e a versão.</p>
      {message && <p role="status" className="border border-amber-300 bg-amber-50 p-2">{message}</p>}
      {!data && <button type="button" disabled={busy} onClick={() => void run(load)}>Carregar aprovação</button>}
      <label className="block font-bold">Imagens do mockup (até 4)
        <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy || images.length >= 4 || !data} className="mt-1 block w-full text-xs" onChange={event => {
          const files = Array.from(event.target.files || []); event.target.value = '';
          void run(async () => {
            if (files.length + images.length > 4) throw new Error('Use até quatro imagens por versão.');
            for (const file of files) { const uploaded = await uploadArtworkToCloudinary(file); setImages(current => [...current, uploaded.secure_url]); }
          });
        }} />
      </label>
      {images.length > 0 && <div className="grid grid-cols-2 gap-2">{images.map((image, index) => <figure key={image} className="border p-2"><img src={image} referrerPolicy="no-referrer" alt={`Mockup a enviar ${index + 1}`} className="max-h-48 w-full object-contain" /><button type="button" disabled={busy} onClick={() => setImages(current => current.filter((_, i) => i !== index))} className="mt-1 underline">Remover imagem {index + 1}</button></figure>)}</div>}
      <label className="block font-bold">Detalhes para conferir<textarea value={notes} maxLength={2000} disabled={busy} onChange={event => setNotes(event.target.value)} className="mt-1 block w-full border border-black/20 p-2 font-normal" placeholder="Posição, tamanho e cores da estampa, conforme esta prévia." /></label>
      <button type="button" disabled={busy || !data || !images.length} className="min-h-11 bg-black px-4 py-2 font-bold text-white disabled:opacity-40" onClick={() => void run(async () => {
        const issued = await api('', 'POST', { images, notes, expectedRevision: data.current?.revision || 0, expectedRecipeFingerprint: data.recipeFingerprint });
        setLink(issued.url); setImages([]); setNotes(''); await load(); setMessage(`Versão ${issued.revision} pronta. O link vale por 7 dias. Copie e envie ao cliente.`);
      })}>{busy ? 'Salvando…' : 'Gerar link desta versão'}</button>
      {link && <div className="space-y-2 border border-green-200 bg-green-50 p-2"><label className="block font-bold">Link para compartilhar<input readOnly value={link} onFocus={event => event.target.select()} className="mt-1 w-full border p-2 text-xs font-normal" /></label><button type="button" className="underline" onClick={() => void run(async () => { await navigator.clipboard.writeText(link); setMessage('Link copiado.'); })}>Copiar link</button><p>Guarde o link antes de fechar. Ele não será enviado automaticamente.</p></div>}
      {data?.history?.length > 0 && <div className="space-y-2"><h4 className="font-bold">Versões preservadas</h4>{data.history.map((entry: any) => <details key={entry.requestId} className="border border-black/15 p-2"><summary className="cursor-pointer">Versão {entry.revision} · {labels[entry.status]}{entry.approvedAt ? ` · ${new Date(entry.approvedAt).toLocaleString('pt-BR')}` : ''}</summary><p className="my-2 whitespace-pre-wrap">{entry.notes}</p><div className="grid grid-cols-2 gap-2">{entry.images.map((image: string, index: number) => <a key={image} href={image} target="_blank" rel="noreferrer"><img src={image} referrerPolicy="no-referrer" alt={`Mockup v${entry.revision}, imagem ${index + 1}`} loading="lazy" className="max-h-48 w-full object-contain" /></a>)}</div>{entry.recipe.map((item: any, index: number) => <p key={index} className="mt-1">{item.quantity} × {item.name} · {item.color} · {item.size}</p>)}{data.current?.requestId === entry.requestId && !['revoked', 'superseded', 'expired'].includes(entry.status) && <button type="button" disabled={busy} className="mt-2 underline" onClick={() => void run(async () => { await api(`/${entry.requestId}/revoke`, 'POST', {}); setLink(''); await load(); setMessage('Link cancelado. O histórico permanece registrado.'); })}>Cancelar link desta versão</button>}</details>)}</div>}
    </div>
  </details>;
}
