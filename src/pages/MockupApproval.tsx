import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getPublicApiUrl, parseApiJson } from '../lib/api';

export default function MockupApproval() {
  const { requestId = '' } = useParams();
  const { hash } = useLocation();
  const token = new URLSearchParams(hash.slice(1)).get('token') || '';
  const [record, setRecord] = useState<any>(null), [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState(''), [busy, setBusy] = useState(true), [consent, setConsent] = useState(false), [failedImage, setFailedImage] = useState(false);
  const path = `/api/mockup-approvals/${encodeURIComponent(requestId)}`;
  const headers = { Authorization: `Bearer ${token}` };
  const call = async (suffix = '', body?: any) => {
    const response = await fetch(getPublicApiUrl(path + suffix), { method: body ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await parseApiJson<any>(response);
    if (!response.ok) throw new Error(value.message || 'Não foi possível abrir o mockup.');
    return value;
  };
  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const controller = new AbortController();
    setBusy(true); setRecord(null); setImages([]); setError(''); setConsent(false); setFailedImage(false);
    void (async () => {
      try {
        if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('O link está incompleto. Abra o link completo enviado pela F PAC.');
        const current = await call();
        for (let index = 0; index < current.imageCount; index++) {
          const response = await fetch(getPublicApiUrl(`${path}/images/${index}`), { headers, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
          if (!response.ok) throw new Error('Não foi possível carregar todas as imagens. Reabra o link antes de aprovar.');
          const image = URL.createObjectURL(await response.blob()); urls.push(image);
        }
        if (!cancelled) { setRecord(current); setImages([...urls]); }
      } catch (reason: any) { if (!cancelled) setError(reason.message); }
      finally { if (!cancelled) setBusy(false); else urls.forEach(url => URL.revokeObjectURL(url)); }
    })();
    return () => { cancelled = true; controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [requestId, token]);
  return <section className="mx-auto max-w-4xl px-5 py-10 pb-32">
    <Helmet><title>Aprovação do mockup | F PAC STORE</title><meta name="robots" content="noindex, nofollow" /><meta name="referrer" content="no-referrer" /></Helmet>
    <p className="mb-2 text-xs font-bold tracking-widest">F PAC STORE</p><h1 className="text-2xl font-black">Confira seu mockup</h1>
    {busy && <p role="status" className="my-5">Carregando…</p>}{error && <p role="alert" className="my-5 border border-amber-300 bg-amber-50 p-4">{error}</p>}
    {record && <div className="mt-5 space-y-5"><p>Versão {record.revision} · {record.status === 'approved' ? 'Aprovada' : 'Aguardando sua aprovação'}</p>
      <div className="grid gap-4 sm:grid-cols-2">{images.map((image, index) => <a key={image} href={image} target="_blank" rel="noreferrer" className="block border border-black/10 bg-gray-50 p-2"><img src={image} alt={`Mockup versão ${record.revision}, imagem ${index + 1}. Toque para ampliar.`} className="h-auto w-full object-contain" onError={() => setFailedImage(true)} /></a>)}</div>
      {record.notes && <p className="whitespace-pre-wrap border-l-4 border-[#eab308] pl-4">{record.notes}</p>}
      <div className="space-y-1">{record.recipe.map((item: any, index: number) => <p key={index}>{item.quantity} × {item.name} · {item.color} · {item.size}</p>)}</div>
      {record.status === 'approved' ? <p role="status" className="border border-green-300 bg-green-50 p-4 font-bold">Aprovação registrada em {new Date(record.approvedAt).toLocaleString('pt-BR')}. A F PAC recebeu a confirmação desta versão.</p> : <div className="space-y-4 rounded border border-black/15 p-4">
        {failedImage && <p role="alert">Uma imagem não abriu. Recarregue o link antes de aprovar.</p>}
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={consent} disabled={busy || failedImage} onChange={event => setConsent(event.target.checked)} /><span>Conferi as imagens, os detalhes e a versão deste mockup e aprovo a produção conforme esta versão.</span></label>
        <button type="button" disabled={busy || !consent || failedImage || images.length !== record.imageCount} className="min-h-12 w-full bg-black px-5 py-3 font-bold text-white disabled:opacity-40" onClick={() => void (async () => {
          setBusy(true); setError('');
          try { const approved = await call('/approve', { revision: record.revision, consent: true }); setRecord({ ...record, status: 'approved', approvedAt: approved.approvedAt }); }
          catch (reason: any) { setError(reason.message); setConsent(false); }
          finally { setBusy(false); }
        })()}>Aprovar esta versão</button>
        <p className="text-sm text-black/60">Precisa ajustar algo? Fale com a F PAC pelo canal em que recebeu o link antes de aprovar.</p>
      </div>}
    </div>}
  </section>;
}
