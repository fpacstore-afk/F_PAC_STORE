import React, { useEffect, useState } from 'react';
import { Copy, Plus, Save, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { authenticatedFetch, parseApiJson } from '../../lib/api';
import { getOrderPaidAmount, getOrderTotal } from '../../../shared/orderFinancialCore';
import { editedManualSubtotal, manualEditLineId, manualEditProductKey, manualOrderEditLines, type EditableManualArtwork, type EditableManualLine } from '../../../shared/manualCustomOrderEditing';
import { uploadArtworkToCloudinary, uploadArtworkUrlToCloudinary } from '../../services/cloudinary';
import { ManualChoiceWithOther } from './ManualChoiceWithOther';
import { inferManualStampPrintColor } from '../../lib/manualCustomOrder';
import { calculateCustomOrderCosts } from '../../../shared/orderCostComposition';
import { OrderCostSummary } from './OrderCostSummary';
import { useFinancialPrivacy } from '../../context/FinancialPrivacyContext';

const SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'Único'];
const POSITIONS = ['Frente', 'Costas', 'Peito esquerdo', 'Peito direito', 'Manga esquerda', 'Manga direita', 'Bolso frontal', 'Bolso traseiro'];
const ART_SIZES = ['2 × 3 cm', '3 × 3 cm', '8 × 6 cm', '10 × 10 cm', '12 × 9 cm', '15 × 15 cm', '20 × 20 cm', '30 × 30 cm', '30 × 40 cm'];
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const uid = () => crypto.randomUUID();
const blankArt = (): EditableManualArtwork => ({ id: uid(), name: '', location: '', color: '', artSize: '', image: '' });
const field = 'w-full min-h-10 border border-black/15 bg-white px-2 text-xs text-black';
const button = 'min-h-9 border border-black/20 bg-white px-3 py-2 text-[10px] font-bold hover:border-amber-500 disabled:opacity-40';

export function ManualCustomOrderEditor({ order, stamps = [] }: { order: any; stamps?: any[] }) {
  const { formatMoney, showFinancialValues } = useFinancialPrivacy();
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState(order);
  const [lines, setLines] = useState<EditableManualLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>({});
  const [discarding, setDiscarding] = useState(false);
  const dirty = open && JSON.stringify(lines) !== JSON.stringify(manualOrderEditLines(base));
  const stale = open && Number(order.customEditRevision || 0) !== Number(base.customEditRevision || 0);
  const locked = [order.status, order.shippingStatus, order.productionStatus, order.paymentStatus].some(value => ['shipped', 'delivered', 'entregue', 'cancelled', 'canceled', 'cancelado', 'completed', 'finalizado', 'concluído', 'refunded'].includes(String(value || '').toLowerCase()));
  const sources = new Map<string, any>((base.items || []).map((item: any, index: number) => [manualEditLineId(item, index), item]));
  const groups = new Map<string, { source: any; lines: EditableManualLine[] }>();
  for (const line of lines) {
    const source = sources.get(line.sourceLineId);
    const key = manualEditProductKey(source || {});
    if (!groups.has(key)) groups.set(key, { source, lines: [] });
    groups.get(key)!.lines.push(line);
  }
  const subtotal = editedManualSubtotal(base, lines);
  const total = base.isGift || base.orderKind === 'gift' ? 0 : Math.max(0, Math.round((subtotal + Number(base.pricing?.shipping ?? base.shipping ?? 0) - Number(base.pricing?.couponDiscount ?? base.couponDiscount ?? 0)) * 100) / 100);
  const paid = getOrderPaidAmount(order);
  const units = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const pendingArts = lines.reduce((sum, line) => sum + line.artworks.filter(art => !art.catalogStampId && !art.image).length, 0);
  const costPreviewLines = lines.map(line => {
    const source = sources.get(line.sourceLineId);
    const recipe = source?.customDetails?.costRecipe;
    const changed = JSON.stringify(line.artworks) !== JSON.stringify(manualOrderEditLines({ items: [source] })[0]?.artworks) || line.size !== source?.size;
    const costRecipe = recipe && (recipe.manualMode || recipe.manualUnitCost != null)
      ? { ...recipe, manualConfirmed: line.confirmManualCost === true || (!changed && recipe.manualConfirmed) } : recipe;
    return { ...source, manualLineId: line.lineId, size: line.size, quantity: line.quantity, customDetails: { ...source?.customDetails, ...(costRecipe ? { costRecipe } : {}), artworks: line.artworks } };
  });
  const costPreview = base.costCatalogSnapshot?.catalog ? calculateCustomOrderCosts(costPreviewLines, base.costCatalogSnapshot.catalog, base.costCatalogSnapshot.version) : [];

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function loadHistory() {
    setHistoryError('');
    try {
      const response = await authenticatedFetch(`/api/admin/orders/${encodeURIComponent(order.id)}/edit-history`);
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.message || 'Histórico indisponível.');
      setHistory(data.events || []);
    } catch (err: any) { setHistoryError(err.message); }
  }
  function start() {
    setBase(order); setLines(manualOrderEditLines(order)); setError(''); setDiscarding(false); setUrlDrafts({}); setOpen(true); void loadHistory();
  }
  function updateLine(id: string, patch: Partial<EditableManualLine>) {
    setLines(current => current.map(line => line.lineId === id ? { ...line, ...patch } : line));
  }
  function updateArt(lineId: string, artId: string, patch: Partial<EditableManualArtwork>) {
    setLines(current => current.map(line => line.lineId === lineId ? { ...line, artworks: line.artworks.map(art => art.id === artId ? { ...art, ...patch } : art) } : line));
  }
  async function upload(lineId: string, artId: string, files?: FileList | null, url?: string) {
    if ((!files || !files.length) && !url?.trim()) return;
    setUploading(`${lineId}:${artId}`); setError('');
    try {
      // Apply each success immediately, so a later failed file never loses an uploaded image.
      const selected = files ? Array.from(files) : [url!.trim()];
      if ((lines.find(line => line.lineId === lineId)?.artworks.length || 0) + selected.length - 1 > 20) throw new Error('Use no máximo 20 artes por linha.');
      for (let index = 0; index < selected.length; index++) {
        const source = selected[index];
        const result = typeof source === 'string' ? await uploadArtworkUrlToCloudinary(source) : await uploadArtworkToCloudinary(source);
        if (index === 0) updateArt(lineId, artId, { image: result.secure_url, catalogStampId: undefined });
        else setLines(current => current.map(line => line.lineId === lineId ? { ...line, artworks: [...line.artworks, { ...blankArt(), name: typeof source === 'string' ? '' : source.name, image: result.secure_url }] } : line));
      }
      setUrlDrafts(current => ({ ...current, [artId]: '' }));
    } catch (err: any) { setError(err.message || 'Não foi possível enviar a imagem.'); }
    finally { setUploading(''); }
  }
  async function save() {
    setError('');
    if (lines.some(line => !line.size.trim() || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10000)) { setError('Informe um tamanho e uma quantidade inteira positiva em cada linha.'); return; }
    setSaving(true);
    try {
      const response = await authenticatedFetch(`/api/admin/orders/${encodeURIComponent(order.id)}/custom-details`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: Number(base.customEditRevision || 0), lines }) });
      const data = await parseApiJson<any>(response);
      if (!response.ok) throw new Error(data.message || 'Não foi possível salvar as alterações.');
      toast.success('Tamanhos, quantidades e artes atualizados.'); setOpen(false);
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (!open) return <div className="border border-amber-300 bg-amber-50 p-3 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-black">Edição do personalizado</p><p className="mt-1 text-gray-600">Tamanhos, quantidades, arquivos e posições das artes.</p></div><button type="button" onClick={start} disabled={locked} className={button}>Editar tamanhos e artes</button></div>{locked && <p className="mt-2 text-amber-800">Reabra a operação antes de alterar peças ou artes.</p>}</div>;

  return <section aria-label="Editar pedido personalizado" className="space-y-4 border border-amber-400 bg-amber-50/50 p-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-black text-sm">Editar tamanhos, quantidades e artes</h4><button type="button" disabled={saving || !!uploading} onClick={() => dirty ? setDiscarding(true) : setOpen(false)} className={button}><X size={12} className="inline mr-1" />Cancelar edição</button></div>
    <p className="text-gray-600">Cada linha representa peças com as mesmas artes. Use outra linha para um tamanho ou desenho diferente. O preço por peça, o frete e o desconto do pedido são mantidos.</p>
    <p className="text-gray-600">O custo automático acompanha medidas e quantidades usando os preços guardados neste pedido. Custos manuais e pedidos antigos podem precisar de conferência após mudar a peça ou a arte.</p>
    {dirty && <p className="text-amber-800" role="status">Há alterações ainda não salvas.</p>}
    {stale && <p role="alert" className="bg-red-50 p-3 text-red-800">Outra pessoa alterou este pedido. Cancele e reabra a edição para conferir a versão atual.</p>}
    {discarding && <div role="alert" className="border border-amber-400 bg-white p-3 space-y-2"><p>Descartar as alterações que ainda não foram salvas?</p><button type="button" className={button} onClick={() => { setOpen(false); setDiscarding(false); }}>Descartar alterações</button> <button type="button" className={button} onClick={() => setDiscarding(false)}>Continuar editando</button></div>}
    <fieldset disabled={saving || !!uploading || stale} className="space-y-4 disabled:opacity-60">
      {[...groups.entries()].map(([groupKey, group]) => <div key={groupKey} className="border border-black/15 bg-white p-3 space-y-3">
        <div><h5 className="font-black">{group.source?.name}</h5><p className="text-gray-500">{group.source?.color} · {money(Number(group.source?.price || 0))} por peça</p></div>
        {group.lines.map((line, rowIndex) => <div key={line.lineId} className="border-t border-black/10 pt-3 space-y-3">
          {(group.source?.customDetails?.costRecipe?.manualMode || group.source?.customDetails?.costRecipe?.manualUnitCost != null) && <label className="flex min-h-11 items-center gap-2 text-amber-900"><input type="checkbox" checked={line.confirmManualCost === true} onChange={e => updateLine(line.lineId, { confirmManualCost: e.target.checked })} />Conferi que o custo manual de {formatMoney(group.source.customDetails.costRecipe.manualUnitCost)} por peça continua válido para estas peças e artes.</label>}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end"><ManualChoiceWithOther label={`Tamanho da linha ${rowIndex + 1} de ${group.source?.name}`} value={line.size} options={SIZES} onChange={size => updateLine(line.lineId, { size })} required /><label className="text-[9px] font-black uppercase text-gray-500">Quantidade<input aria-label={`Quantidade da linha ${rowIndex + 1} de ${group.source?.name}`} className={`${field} mt-1`} type="number" min={1} max={10000} step={1} value={line.quantity || ''} onChange={event => updateLine(line.lineId, { quantity: Number(event.target.value) })} /></label><button type="button" className={button} disabled={lines.length <= 1} onClick={() => setLines(current => current.filter(row => row.lineId !== line.lineId))}><Trash2 size={12} className="inline mr-1" />Remover linha</button></div>
          <details className="border border-black/10 p-2"><summary className="cursor-pointer font-bold py-1">{line.artworks.length} arte(s) · tamanho {line.size || 'a definir'}{line.artworks.some(art => !art.image && !art.catalogStampId) ? ' · arquivo pendente' : ''}</summary><div className="space-y-3 pt-3">
            {line.artworks.map((art, artIndex) => <div key={art.id} className="border border-black/10 bg-gray-50 p-3 space-y-2">
              <div className="flex items-center justify-between"><strong>Arte {artIndex + 1}</strong><button type="button" onClick={() => updateLine(line.lineId, { artworks: line.artworks.filter(row => row.id !== art.id) })} className={button}>Remover arte</button></div>
              {art.image ? <img src={art.image} alt={art.name || `Arte ${artIndex + 1}`} className="h-24 max-w-full object-contain bg-white" referrerPolicy="no-referrer" /> : <p className="text-amber-800">Arquivo pendente — pode ser anexado depois.</p>}
              <label className="block text-[9px] font-bold uppercase">Origem da arte<select aria-label={`Origem da arte ${artIndex + 1} da linha ${line.size}`} className={`${field} mt-1`} value={art.catalogStampId || ''} onChange={event => {
                const stamp = stamps.find(candidate => candidate.id === event.target.value);
                updateArt(line.lineId, art.id, stamp ? { catalogStampId: stamp.id, name: stamp.name || stamp.code || '', image: stamp.thumbnailUrl || stamp.mockupUrl || stamp.pngUrl || stamp.imageUrl || '', color: inferManualStampPrintColor(stamp), stockPrintSize: '' } : { catalogStampId: undefined, name: '', image: '', stockPrintSize: '', color: '' });
              }}><option value="">Arte própria / arquivo do cliente</option>{art.catalogStampId && !stamps.some(stamp => stamp.id === art.catalogStampId) && <option value={art.catalogStampId}>{art.name || art.catalogStampId}</option>}{stamps.map(stamp => <option key={stamp.id} value={stamp.id}>{stamp.name || stamp.code || stamp.id}</option>)}</select></label>
              <label className="block text-[9px] font-bold uppercase">Nome da arte<input aria-label={`Nome da arte ${artIndex + 1} da linha ${line.size}`} className={`${field} mt-1`} maxLength={200} value={art.name} disabled={!!art.catalogStampId} onChange={event => updateArt(line.lineId, art.id, { name: event.target.value })} /></label>
              <div className="grid gap-2 sm:grid-cols-2"><ManualChoiceWithOther label={`Posição da arte ${artIndex + 1} da linha ${line.size}`} value={art.location} options={POSITIONS} onChange={location => updateArt(line.lineId, art.id, { location })} /><ManualChoiceWithOther label={`Medida da arte ${artIndex + 1} da linha ${line.size}`} value={art.artSize} options={ART_SIZES} onChange={artSize => updateArt(line.lineId, art.id, { artSize })} /></div>
              {group.source?.customDetails?.costRecipe && <label className="block">Regra de custo da estampa<select aria-label={`Regra de custo da arte ${artIndex + 1} da linha ${line.size}`} className={field} value={art.costRuleId || group.source.customDetails.costRecipe.printRuleId || ''} onChange={e => updateArt(line.lineId, art.id, { costRuleId: e.target.value })}><option value="">Selecione a regra</option>{(base.costCatalogSnapshot?.catalog?.entries || []).filter((entry: any) => entry.kind === 'stamp' && entry.active).map((entry: any) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}
              {art.catalogStampId && <ManualChoiceWithOther label={`Tamanho de estoque da arte ${artIndex + 1} da linha ${line.size}`} value={art.stockPrintSize || ''} options={stamps.find(stamp => stamp.id === art.catalogStampId)?.availableSizes || Object.keys(stamps.find(stamp => stamp.id === art.catalogStampId)?.stockBySize || {})} onChange={stockPrintSize => updateArt(line.lineId, art.id, { stockPrintSize })} />}
              {!art.catalogStampId && <><label className="block text-[9px] font-bold uppercase">Cor da impressão<input className={`${field} mt-1`} maxLength={80} value={art.color} onChange={event => updateArt(line.lineId, art.id, { color: event.target.value })} /></label><label className="block font-bold"><Upload size={12} className="inline mr-1" />Enviar ou trocar arquivo<input aria-label={`Arquivo da arte ${artIndex + 1} da linha ${line.size}`} className="mt-2 block w-full text-xs" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => { void upload(line.lineId, art.id, event.target.files); event.target.value = ''; }} /></label><p className="text-gray-500">Ao selecionar vários arquivos, cada imagem adicional vira uma nova arte nesta linha.</p><div className="flex flex-wrap gap-2"><input aria-label={`Link da arte ${artIndex + 1} da linha ${line.size}`} placeholder="Link HTTPS direto da imagem" type="url" className={`${field} flex-1 min-w-40`} value={urlDrafts[art.id] || ''} onChange={event => setUrlDrafts(current => ({ ...current, [art.id]: event.target.value }))} /><button type="button" className={button} onClick={() => void upload(line.lineId, art.id, null, urlDrafts[art.id])}>Importar imagem</button>{art.image && <button type="button" className={button} onClick={() => updateArt(line.lineId, art.id, { image: '' })}>Remover arquivo</button>}</div></>}
              <label className="block text-[9px] font-bold uppercase">Observação da arte<textarea className={`${field} py-2 mt-1`} maxLength={1000} value={art.notes || ''} onChange={event => updateArt(line.lineId, art.id, { notes: event.target.value })} /></label>
              <button type="button" className={button} disabled={line.artworks.length >= 20} onClick={() => updateLine(line.lineId, { artworks: [...line.artworks, { ...art, id: uid(), location: '', artSize: '' }] })}><Copy size={12} className="inline mr-1" />Usar esta arte em outra posição</button>
            </div>)}
            <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={line.artworks.length >= 20} onClick={() => updateLine(line.lineId, { artworks: [...line.artworks, blankArt()] })}><Plus size={12} className="inline mr-1" />Adicionar arte</button>{group.lines.length > 1 && <button type="button" className={button} onClick={() => setLines(current => current.map(row => manualEditProductKey(sources.get(row.sourceLineId) || {}) === groupKey ? { ...row, artworks: line.artworks.map(art => ({ ...art })) } : row))}>Aplicar estas artes a todos os tamanhos deste produto</button>}</div>
          </div></details>
        </div>)}
        <button type="button" className={button} disabled={lines.length >= 100} onClick={() => { const first = group.lines[0]; setLines(current => [...current, { ...first, lineId: uid(), size: '', quantity: 1, artworks: first.artworks.map(art => ({ ...art })) }]); }}><Plus size={12} className="inline mr-1" />Adicionar tamanho ou outra combinação de artes</button>
      </div>)}
    </fieldset>
    {uploading && <p role="status" className="text-amber-800">Enviando imagem… Aguarde antes de salvar ou fechar.</p>}
    {pendingArts > 0 && <p role="status" className="text-amber-800">Existem artes sem arquivo anexado. Os detalhes serão preservados para anexar depois.</p>}
    <div className="grid grid-cols-2 gap-3 border border-black/15 bg-white p-3" aria-label="Conferência dos valores"><div>Peças<strong className="block text-lg">{units}</strong></div><div>Total anterior<strong className="block">{money(getOrderTotal(base))}</strong></div><div>Novo total<strong className="block text-lg">{money(total)}</strong></div><div>Já recebido<strong className="block">{money(paid)}</strong></div><div className="col-span-2 border-t pt-2">Novo saldo a receber<strong className="block text-lg">{money(Math.max(0, total - paid))}</strong></div></div>
    {total < paid && <p role="alert" className="text-red-700">O total não pode ficar abaixo do valor já recebido. Confira o estorno antes de reduzir as peças.</p>}
    <OrderCostSummary items={costPreview} formatAmount={formatMoney} showSources={showFinancialValues} />
    {error && <p role="alert" className="bg-red-50 p-3 text-red-800">{error}</p>}
    <button type="button" disabled={saving || !!uploading || stale || !dirty || total < paid} onClick={() => void save()} className="min-h-11 bg-black px-4 py-2 font-black text-amber-400 disabled:opacity-40"><Save size={14} className="inline mr-2" />{saving ? 'Salvando alterações…' : 'Salvar tamanhos e artes'}</button>
    <details className="border-t border-black/15 pt-3"><summary className="cursor-pointer font-bold">Histórico das alterações</summary><div className="pt-3 space-y-2">{historyError ? <p role="alert">{historyError} <button type="button" className={button} onClick={() => void loadHistory()}>Tentar novamente</button></p> : !history.length ? <p className="text-gray-500">Nenhuma edição de tamanhos ou artes registrada ainda.</p> : history.map(event => <div key={event.revision} className="border border-black/10 bg-white p-2"><p className="font-bold">Revisão {event.revision} · {new Date(event.createdAt).toLocaleString('pt-BR')}</p><p>{event.previousUnits} → {event.units} peças · {money(event.previousTotal)} → {money(event.total)}</p><p className="text-gray-500">{event.actor}</p></div>)}</div></details>
  </section>;
}
