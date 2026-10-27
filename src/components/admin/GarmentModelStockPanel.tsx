import React, { useEffect, useRef, useState } from 'react';
import { authenticatedFetch, parseApiJson } from '../../lib/api';
import { garmentFamily } from '../../../shared/garmentModels';

export function GarmentModelStockPanel() {
  const [data, setData] = useState<any>(null), [sourceId, setSourceId] = useState(''), [modelId, setModelId] = useState(''), [variantKey, setVariantKey] = useState(''), [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const pending = useRef<any>(null), running = useRef(false);
  const pendingUnification = useRef<any>(null);
  const load = async () => {
    const response = await authenticatedFetch('/api/admin/garment-models');
    const next = await parseApiJson<any>(response);
    if (!response.ok) throw new Error(next.error || 'Não foi possível carregar os modelos.');
    setData(next);
  };
  useEffect(() => { void load().catch(error => setMessage(error.message)); }, []);
  const run = async (action: () => Promise<void>) => { if (running.current) return; running.current = true; setBusy(true); setMessage(''); try { await action(); } catch (error: any) { setMessage(error.message); } finally { running.current = false; setBusy(false); } };
  const mixed = (data?.products || []).filter((p: any) => p.productFinish === 'plain' && !p.garmentModelId && !p.mergedIntoProductId && garmentFamily(p));
  const source = mixed.find((p: any) => p.id === sourceId), stock = data?.inventory?.[source?.slug || sourceId];
  const variant = stock?.variants?.[variantKey], physical = Number(variant?.physicalQuantity ?? variant?.stock ?? 0), reserved = Number(variant?.reservedQuantity ?? variant?.reserved ?? 0);
  const choices = (data?.profiles || []).filter((p: any) => p.garmentFamily === garmentFamily(source));
  const totalPhysical = Object.values(stock?.variants || {}).reduce<number>((sum, value: any) => sum + Number(value.physicalQuantity ?? value.stock ?? 0), 0);
  const inputClass = 'min-h-11 w-full rounded-lg border border-black/20 bg-white p-2 text-sm text-black';
  return <details className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-black">
    <summary className="cursor-pointer font-bold">Modelos e fornecedores · tradicional, oversized e regata</summary>
    <p className="my-3 text-sm">ZIMM: gola alta e fechada. Tiggas: gola mais baixa e aberta. Cada ficha mantém suas medidas e seu saldo. A regata ZIMM tem tabela própria e não possui mangas.</p>
    <button disabled={busy} className="mb-4 min-h-11 rounded-lg bg-black px-4 text-sm font-bold text-white disabled:opacity-50" onClick={() => void run(async () => { const response = await authenticatedFetch('/api/admin/garment-models/initialize', { method: 'POST' }); const result = await parseApiJson<any>(response); if (!response.ok) throw new Error(result.error); await load(); setMessage(`${result.created} bases criadas. Saldos antigos preservados; peças misturadas aguardam separação.`); })}>Preparar bases separadas sem copiar saldos</button>
    <p className="mb-4 text-sm">Transfira somente as peças conferidas fisicamente. O total é conservado e as reservas de pedidos permanecem na origem. Não registre a mesma peça novamente como uma compra.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs">Estoque misturado de origem<select className={inputClass} value={sourceId} onChange={event => { setSourceId(event.target.value); setVariantKey(''); setModelId(''); pending.current = null; }}><option value="">Escolha a base</option>{mixed.map((p: any) => <option key={p.id} value={p.id}>{p.name} · {p.sku || p.id}</option>)}</select></label>
      <label className="text-xs">Fornecedor e modelo de destino<select className={inputClass} value={modelId} onChange={event => { setModelId(event.target.value); pending.current = null; }}><option value="">Escolha a ficha exata</option>{choices.map((p: any) => <option key={p.garmentModelId} value={p.garmentModelId}>{p.supplierName} · {p.sourceProductName} · {p.garmentModelName}</option>)}</select></label>
      <label className="text-xs">Cor e tamanho<select className={inputClass} value={variantKey} onChange={event => { setVariantKey(event.target.value); pending.current = null; }}><option value="">Escolha a variação</option>{Object.entries(stock?.variants || {}).map(([key, value]: [string, any]) => <option key={key} value={key}>{key.replace(/_([^_]*)$/, ' · $1')} · físico {value.physicalQuantity ?? value.stock ?? 0}</option>)}</select></label>
      <label className="text-xs">Quantidade contada deste fornecedor<input className={inputClass} type="number" min="1" max={Math.max(0, physical - reserved)} value={quantity} onChange={event => { setQuantity(event.target.value); pending.current = null; }} /></label>
    </div>
    {variant && <p className="my-3 text-sm">Físico: {physical} · Reservado: {reserved} · Livre para separar: {Math.max(0, physical - reserved)}</p>}
    <button disabled={busy || !sourceId || !modelId || !variantKey || !Number.isSafeInteger(Number(quantity)) || Number(quantity) <= 0} className="mt-3 min-h-11 rounded-lg bg-[#eab308] px-4 text-sm font-bold disabled:opacity-50" onClick={() => void run(async () => {
      pending.current ||= { sourceId, garmentModelId: modelId, variantKey, quantity: Number(quantity), expectedPhysicalQuantity: physical, requestId: crypto.randomUUID() };
      const response = await authenticatedFetch('/api/admin/garment-models/transfer', { method: 'POST', body: JSON.stringify(pending.current) }); const result = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(result.error || 'Não foi possível transferir.');
      pending.current = null; await load(); setQuantity(''); setMessage(`Separação registrada: ${result.transferred} peça(s). Total preservado entre origem e destino.`);
    })}>Transferir peças conferidas</button>
    {source && modelId && <div className="mt-5 border-t border-amber-300 pt-4">
      <h3 className="text-sm font-bold">Dois cadastros da mesma peça</h3>
      <p className="my-2 text-sm">Unifique apenas se toda esta base for o mesmo modelo selecionado. O cadastro original mantém suas {totalPhysical} peças, reservas, cores, tamanhos e histórico. O segundo cadastro precisa estar vazio e será arquivado como duplicado.</p>
      <button disabled={busy} className="min-h-11 rounded-lg border border-black px-4 text-sm font-bold disabled:opacity-50" onClick={() => void run(async () => {
        const previous = pendingUnification.current;
        if (!previous || previous.sourceId !== sourceId || previous.garmentModelId !== modelId || previous.expectedPhysicalQuantity !== totalPhysical) pendingUnification.current = { sourceId, garmentModelId: modelId, expectedPhysicalQuantity: totalPhysical, requestId: crypto.randomUUID() };
        const response = await authenticatedFetch('/api/admin/garment-models/unify', { method: 'POST', body: JSON.stringify(pendingUnification.current) });
        const result = await parseApiJson<any>(response);
        if (!response.ok) throw new Error(result.error || 'Não foi possível unificar.');
        pendingUnification.current = null; await load(); setSourceId(''); setModelId(''); setVariantKey(''); setQuantity('');
        setMessage(`Cadastros unificados em ${result.sku}: ${result.physicalQuantity} peças preservadas, ${result.reservedQuantity} reservadas. Cadastro vazio arquivado; histórico mantido.`);
      })}>Unificar cadastros da mesma peça</button>
    </div>}
    {message && <p className="mt-3 text-sm" role="status">{message}</p>}
  </details>;
}
