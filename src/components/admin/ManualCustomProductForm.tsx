import { garmentProfile, garmentTitle } from '../../../shared/garmentModels';
import React, { useEffect, useState } from 'react';
import { Link2, Plus, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { buildManualCustomOrderLines, filterManualCustomArtworkRows, inferManualStampPrintColor, type ManualCustomArtworkInput, type ManualCustomSizeInput } from '../../lib/manualCustomOrder';
import { uploadArtworkToCloudinary, uploadArtworkUrlToCloudinary } from '../../services/cloudinary';
import { stampImage, StampThumb } from './ManualStampPicker';
import { ManualChoiceWithOther } from './ManualChoiceWithOther';
import { calculateCustomOrderCosts, type OrderCostRecipe } from '../../../shared/orderCostComposition';
import { money, type Catalog } from '../../../shared/pricingWorkbench';
import { OrderCostSummary } from './OrderCostSummary';

const PRODUCT_OPTIONS = ['Camiseta tradicional', 'Camiseta oversized', 'Cropped oversized', 'Moletom / casaco', 'Bermuda', 'Boné', 'Touca'];
const MODEL_OPTIONS = ['Tradicional', 'Oversized', 'Cropped', 'Moletom', 'Cargo'];
const COLOR_OPTIONS = ['Preto', 'Branco', 'Off White', 'Bege', 'Areia', 'Verde Militar', 'Marrom', 'Azul Marinho'];
const SIZE_OPTIONS = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'Único'];
const LOCATION_OPTIONS = ['Frente', 'Costas', 'Peito esquerdo', 'Peito direito', 'Manga esquerda', 'Manga direita', 'Bolso frontal', 'Bolso traseiro'];
const ART_SIZE_OPTIONS = ['2 × 3 cm', '3 × 3 cm', '8 × 6 cm', '10 × 10 cm', '12 × 9 cm', '15 × 15 cm', '20 × 20 cm', '30 × 30 cm', '30 × 40 cm'];

function newRowId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface ManualCustomProductFormProps {
  stamps: any[];
  disabled?: boolean;
  isGift: boolean;
  onAdd: (items: any[]) => void;
  onUploadStateChange?: (uploading: boolean) => void;
  onDraftStateChange?: (dirty: boolean) => void;
  costCatalog: Catalog;
  costCatalogVersion: number;
  costsLoading?: boolean;
  costsError?: string;
  onReloadCosts?: () => void;
  formatAmount?: (n: number) => string;
  showAmounts?: boolean;
}

export function ManualCustomProductForm({ stamps, disabled = false, isGift, onAdd, onUploadStateChange, onDraftStateChange, costCatalog, costCatalogVersion, costsLoading, costsError, onReloadCosts, formatAmount = money, showAmounts = true }: ManualCustomProductFormProps) {
  const [draftVersion, setDraftVersion] = useState(0);
  const [companyName, setCompanyName] = useState('');
  const [productName, setProductName] = useState('');
  const [model, setModel] = useState('');
  const [garmentColor, setGarmentColor] = useState('');
  const [productionNotes, setProductionNotes] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [costProductId, setCostProductId] = useState('');
  const [costLine, setCostLine] = useState('');
  const [extraIds, setExtraIds] = useState<string[] | null>(null);
  const [extrasReviewed, setExtrasReviewed] = useState(false);
  const [manualCostMode, setManualCostMode] = useState(false);
  const [manualCostConfirmed, setManualCostConfirmed] = useState(false);
  const [manualCostReason, setManualCostReason] = useState('');
  const [sizeRows, setSizeRows] = useState<ManualCustomSizeInput[]>([{ id: newRowId('size'), size: '', quantity: 1 }]);
  const [artworks, setArtworks] = useState<ManualCustomArtworkInput[]>([]);
  const [artworkLinks, setArtworkLinks] = useState<Record<string, string>>({});
  const [uploadingArtworkId, setUploadingArtworkId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const isUploading = Boolean(uploadingArtworkId || batchProgress);
  const hasUnaddedProduct = Boolean(productName.trim() || model.trim() || garmentColor.trim() || productionNotes.trim()
    || unitPrice.trim() || unitCost.trim() || sizeRows.some((row) => row.size.trim()) || artworks.length);
  const costProducts = costCatalog.entries.filter(e => e.kind === 'product' && e.active);
  const costExtras = costCatalog.entries.filter(e => e.kind === 'extra' && e.active);
  const printRules = costCatalog.entries.filter(e => e.kind === 'stamp' && e.active);
  const dtfRules = printRules.filter(e => e.method === 'dtf');
  const defaultPrintRule = dtfRules.length === 1 ? dtfRules[0].id : '';
  const selectedExtraIds = extraIds ?? costExtras.filter(e => e.defaultForOrders).map(e => e.id);
  const costProduct = costProducts.find(e => e.id === costProductId);
  const costLines = [...new Set(costCatalog.entries.filter(e => e.kind === 'price' && e.active && e.product === costProduct?.name && e.supplier === costProduct?.supplier).map(e => e.line || ''))];
  const recipe: OrderCostRecipe = { productId: costProductId, line: costLine, printRuleId: defaultPrintRule, extraIds: selectedExtraIds, extrasReviewed,
    manualMode: manualCostMode, manualUnitCost: manualCostMode && unitCost.trim() ? Number(unitCost) : null, manualConfirmed: manualCostConfirmed, manualReason: manualCostReason.trim() };
  const costPreview = calculateCustomOrderCosts(buildManualCustomOrderLines({ productName, model, garmentColor, unitPrice: Number(unitPrice) || 0, costRecipe: recipe, sizeRows, artworks: filterManualCustomArtworkRows(artworks) }), costCatalog, costCatalogVersion);

  useEffect(() => {
    onUploadStateChange?.(isUploading);
    return () => onUploadStateChange?.(false);
  }, [isUploading, onUploadStateChange]);

  useEffect(() => {
    onDraftStateChange?.(hasUnaddedProduct);
    return () => onDraftStateChange?.(false);
  }, [hasUnaddedProduct, onDraftStateChange]);

  const updateSize = (id: string, field: 'size' | 'quantity', value: string) => {
    setSizeRows((current) => current.map((row) => row.id !== id ? row : {
      ...row,
      [field]: field === 'quantity' ? Math.max(1, Number(value) || 1) : value,
    }));
  };

  const updateArtwork = (id: string, field: keyof ManualCustomArtworkInput, value: string) => {
    setArtworks((current) => current.map((row) => row.id !== id ? row : { ...row, [field]: value }));
  };

  const attachArtwork = async (rowId: string, source: File | string) => {
    if (isUploading) return;
    setUploadingArtworkId(rowId);
    try {
      const uploaded = typeof source === 'string'
        ? await uploadArtworkUrlToCloudinary(source)
        : await uploadArtworkToCloudinary(source);
      setArtworks((current) => current.map((row) => row.id !== rowId ? row : {
        ...row,
        image: uploaded.secure_url,
        name: row.name.trim() || (typeof source === 'string' ? 'Arte do cliente' : source.name.replace(/\.[^.]+$/, '')),
      }));
      setArtworkLinks((current) => ({ ...current, [rowId]: '' }));
      toast.success('Arte do cliente anexada ao pedido.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível anexar a arte.');
    } finally {
      setUploadingArtworkId(null);
    }
  };

  const attachMultipleArtworks = async (files: FileList | null) => {
    if (!files?.length || isUploading) return;
    const selected = Array.from(files);
    setBatchProgress({ current: 0, total: selected.length });
    let failed = 0;
    try {
      for (const [index, file] of selected.entries()) {
        setBatchProgress({ current: index + 1, total: selected.length });
        try {
          const uploaded = await uploadArtworkToCloudinary(file);
          setArtworks((current) => [...current, {
            id: newRowId('art'), name: file.name.replace(/\.[^.]+$/, ''), location: '', color: '', artSize: '',
            notes: '', image: uploaded.secure_url,
          }]);
        } catch {
          failed += 1;
        }
      }
      if (failed) toast.error(`${failed} imagem(ns) não foram enviadas. Verifique o formato e tente novamente.`);
      if (selected.length > failed) toast.success(`${selected.length - failed} imagem(ns) adicionadas. Informe a posição e medida de cada estampa.`);
    } finally {
      setBatchProgress(null);
    }
  };

  const selectCatalogStamp = (rowId: string, stampId: string) => {
    const selected = stamps.find((stamp) => stamp.id === stampId);
    const sizes = Array.isArray(selected?.availableSizes) ? selected.availableSizes.map((size: unknown) => String(size).trim()).filter(Boolean) : [];
    setArtworks((current) => current.map((row) => row.id !== rowId ? row : {
      ...row,
      catalogStampId: stampId || undefined,
      name: selected ? String(selected.name || selected.code || selected.sku || 'Estampa do catálogo') : '',
      code: selected ? String(selected.code || selected.sku || selected.id) : '',
      color: selected ? inferManualStampPrintColor(selected) : '',
      image: selected ? stampImage(selected) : '',
      status: selected?.status || 'active',
      stockPrintSize: sizes.length === 1 ? sizes[0] : '',
      artSize: sizes.length === 1 ? sizes[0] : '',
    }));
  };

  const handleAdd = () => {
    if (isUploading) {
      toast.error('Aguarde o envio da arte terminar.');
      return;
    }
    if (!productName.trim()) {
      toast.error('Informe o produto, por exemplo: Camisa para uniforme.');
      return;
    }
    if (manualCostMode && unitCost.trim() && (!Number.isFinite(Number(unitCost)) || Number(unitCost) < 0)) {
      toast.error('Informe um custo manual válido, maior ou igual a zero.');
      return;
    }
    if (!isGift && (!unitPrice.trim() || !Number.isFinite(Number(unitPrice)) || Number(unitPrice) <= 0)) {
      toast.error('Informe o preço por peça para registrar corretamente o saldo a receber.');
      return;
    }
    if (!sizeRows.length || sizeRows.some((row) => !row.size.trim() || !Number.isInteger(Number(row.quantity)) || Number(row.quantity) < 1)) {
      toast.error('Preencha o tamanho e a quantidade de cada peça.');
      return;
    }
    const enteredArtworks = filterManualCustomArtworkRows(artworks);
    if (enteredArtworks.some((row) => {
      if (!row.catalogStampId) return false;
      const stamp = stamps.find((item) => item.id === row.catalogStampId);
      if (!stamp) return true;
      const availableSizes = Array.isArray(stamp?.availableSizes) ? stamp.availableSizes : [];
      const printSize = availableSizes.length ? row.stockPrintSize : (row.stockPrintSize || row.artSize);
      return !String(printSize || '').trim();
    })) {
      toast.error('Para baixar estampa do catálogo, escolha a medida exata. Os outros detalhes da arte são opcionais.');
      return;
    }

    const resolvedArtworks = enteredArtworks.map((row) => {
      const stamp = stamps.find((item) => item.id === row.catalogStampId);
      const availableSizes = Array.isArray(stamp?.availableSizes) ? stamp.availableSizes : [];
      return {
        ...row,
        name: stamp ? String(stamp.name || stamp.code || stamp.sku || 'Estampa do catálogo') : row.name.trim(),
        code: stamp ? String(stamp.code || stamp.sku || stamp.id) : '',
        color: stamp ? inferManualStampPrintColor(stamp) || row.color.trim() : row.color.trim(),
        artSize: stamp && availableSizes.length ? (row.stockPrintSize || '') : row.artSize.trim(),
        stockPrintSize: stamp && availableSizes.length ? row.stockPrintSize : undefined,
        image: stamp ? stampImage(stamp) : row.image || '',
        status: stamp?.status || 'active',
      };
    });
    const items = buildManualCustomOrderLines({
      companyName,
      productName,
      model,
      garmentColor,
      notes: productionNotes,
      unitPrice: isGift ? 0 : Number(unitPrice) || 0,
      unitCost: Number(unitCost) || 0,
      costRecipe: recipe,
      sizeRows,
      artworks: resolvedArtworks,
    });
    if (!items.length) {
      toast.error('Adicione pelo menos uma peça com tamanho e quantidade válidos.');
      return;
    }
    const physical = garmentProfile(costProduct);
    onAdd(physical ? items.map(item => ({ ...item, displayName: garmentTitle(item.displayName || item.product.name, physical), product: { ...item.product, garmentModelId: physical.garmentModelId, garmentModelName: physical.garmentModelName, neckline: physical.neckline } })) : items);
    // Cada inclusão cria um novo grupo de produto; os itens anteriores ficam no carrinho.
    setProductName('');
    setModel('');
    setGarmentColor('');
    setProductionNotes('');
    setUnitPrice('');
    setUnitCost('');
    setCostProductId(''); setCostLine(''); setExtraIds(null); setExtrasReviewed(false);
    setManualCostMode(false); setManualCostConfirmed(false); setManualCostReason('');
    setSizeRows([{ id: newRowId('size'), size: '', quantity: 1 }]);
    setArtworks([]);
    setArtworkLinks({});
    setDraftVersion((current) => current + 1);
  };

  return (
    <div className="space-y-4">
      {disabled ? (
        <div className="border border-amber-300 bg-amber-50 p-3 text-[10px] font-bold text-amber-950">
          Para editar o produto ou as artes, remova primeiro as peças deste grupo do carrinho.
        </div>
      ) : (
        <>
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-[10px] font-bold leading-relaxed text-amber-950">
            Selecione a variante exata da estampa no catálogo (por exemplo, FP preta ou FP branca). Para uma arte do cliente, anexe a imagem do dispositivo ou importe um link. A arte própria fica guardada no pedido e não reduz o estoque de estampas.
          </div>

          <section className="min-w-0 space-y-3 rounded border border-black/15 bg-gray-50 p-3 text-xs">
            <h4 className="font-black">Preencher o custo pela peça cadastrada</h4>
            <label className="flex min-w-0 flex-col gap-1 font-bold">Peça / fornecedor para o custo
              <select aria-label="Peça / fornecedor para o custo" value={costProductId} onChange={e => {
                const product = costProducts.find(p => p.id === e.target.value);
                setCostProductId(e.target.value); setCostLine('');
                if (product) { setProductName(product.name); if (product.fit) setModel(product.fit); }
              }} className="min-h-11 w-full min-w-0 border border-black/15 bg-white px-2 text-xs">
                <option value="">Selecione a referência ou informe um custo manual</option>
                {costProducts.map(p => <option key={p.id} value={p.id}>{[p.name, p.supplier].filter(Boolean).join(' · ')}</option>)}
              </select>
            </label>
            {costLines.some(Boolean) && <label className="flex flex-col gap-1 font-bold">Linha do fornecedor<select aria-label="Linha do fornecedor" value={costLine} onChange={e => setCostLine(e.target.value)} className="min-h-11 border border-black/15 bg-white px-2"><option value="">Sem linha específica</option>{costLines.filter(Boolean).map(line => <option key={line}>{line}</option>)}</select></label>}
          </section>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[9px] font-black uppercase text-gray-500">
              Empresa / equipe (opcional)
              <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Nome da empresa do cliente" className="border border-black/15 bg-white px-3 py-2.5 text-xs font-bold normal-case text-black" />
            </label>
            <ManualChoiceWithOther key={`${draftVersion}-product`} label="Produto" value={productName} onChange={setProductName} options={PRODUCT_OPTIONS} required />
            <ManualChoiceWithOther key={`${draftVersion}-model`} label="Modelo / corte (opcional)" value={model} onChange={setModel} options={MODEL_OPTIONS} />
            <ManualChoiceWithOther key={`${draftVersion}-color`} label="Cor da peça (opcional)" value={garmentColor} onChange={setGarmentColor} options={COLOR_OPTIONS} />
            {!isGift && <label className="flex flex-col gap-1 text-[9px] font-black uppercase text-gray-500">
              Preço por peça (R$) *
              <input type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} placeholder="0,00" className="border border-black/15 bg-white px-3 py-2.5 text-xs font-bold font-mono text-black" />
            </label>}
          </div>
          <label className="flex flex-col gap-1 text-[9px] font-black uppercase text-gray-500">
            Tecido, acabamento e outros detalhes (opcional)
            <textarea value={productionNotes} onChange={(event) => setProductionNotes(event.target.value)} rows={2} placeholder="Gramatura, gola, costura, observações combinadas..." className="border border-black/15 bg-white px-3 py-2.5 text-xs font-bold normal-case text-black" />
          </label>

          <section className="space-y-2 rounded border border-black/10 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider">Tamanhos e quantidades</h4>
              <button type="button" onClick={() => setSizeRows((current) => [...current, { id: newRowId('size'), size: '', quantity: 1 }])} className="flex min-h-9 items-center gap-1 border border-black/15 px-2 text-[9px] font-black uppercase"><Plus size={13} /> Adicionar tamanho</button>
            </div>
            {sizeRows.map((row) => (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_70px_38px] gap-2 sm:grid-cols-[minmax(0,1fr)_110px_38px]">
                <ManualChoiceWithOther label="Tamanho da peça" value={row.size} onChange={(value) => updateSize(row.id, 'size', value)} options={SIZE_OPTIONS} required />
                <input aria-label={`Quantidade do tamanho ${row.size || 'novo'}`} type="number" min="1" value={row.quantity} onChange={(event) => updateSize(row.id, 'quantity', event.target.value)} className="min-h-10 border border-black/15 px-3 text-center text-xs font-bold" />
                <button type="button" aria-label="Remover tamanho" disabled={sizeRows.length === 1} onClick={() => setSizeRows((current) => current.filter((item) => item.id !== row.id))} className="grid min-h-10 place-items-center border border-black/10 text-red-600 disabled:opacity-30"><Trash2 size={14} /></button>
              </div>
            ))}
          </section>

          <section className="space-y-3 rounded border border-black/10 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider">Artes, posições e medidas (opcional)</h4>
              <button type="button" onClick={() => setArtworks((current) => [...current, { id: newRowId('art'), name: '', location: '', color: '', artSize: '', notes: '' }])} className="flex min-h-9 items-center gap-1 border border-black/15 px-2 text-[9px] font-black uppercase"><Plus size={13} /> Adicionar arte</button>
            </div>
            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 border border-black/15 bg-white px-3 text-center text-[10px] font-bold">
              <Upload size={15} /> {batchProgress ? `Enviando ${batchProgress.current} de ${batchProgress.total} imagens...` : 'Selecionar várias imagens das estampas'}
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={isUploading} className="sr-only" onChange={(event) => { const files = event.target.files; void attachMultipleArtworks(files); event.currentTarget.value = ''; }} />
            </label>
            <p className="text-[9px] text-gray-600">Cada imagem cria uma estampa separada para informar o local e o tamanho. Você pode substituir ou remover uma imagem abaixo.</p>
            {artworks.map((art, index) => {
              const selectedStamp = stamps.find((item) => item.id === art.catalogStampId);
              const availableSizes = Array.isArray(selectedStamp?.availableSizes) ? selectedStamp.availableSizes : [];
              return (
                <div key={art.id} className="space-y-2 border border-black/10 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase text-gray-600">Arte {index + 1}</span>
                    <button type="button" aria-label={`Remover arte ${index + 1}`} onClick={() => setArtworks((current) => current.filter((item) => item.id !== art.id))} className="grid min-h-9 min-w-9 place-items-center text-red-600 disabled:opacity-30"><Trash2 size={14} /></button>
                  </div>
                  <label className="flex flex-col gap-1 text-[8px] font-black uppercase text-gray-500">
                    Estampa do catálogo (baixa do estoque, opcional)
                    <select value={art.catalogStampId || ''} onChange={(event) => selectCatalogStamp(art.id, event.target.value)} className="min-h-10 border border-black/15 bg-white px-3 text-[11px] font-bold normal-case text-black">
                      <option value="">Arte própria / fora do catálogo</option>
                      {stamps.map((stamp) => <option key={stamp.id} value={stamp.id}>{[stamp.code || stamp.sku, stamp.name].filter(Boolean).join(' · ') || stamp.id}</option>)}
                    </select>
                  </label>
                  {selectedStamp ? (
                    <div className="flex items-center gap-2 border border-amber-200 bg-white p-2">
                      <StampThumb stamp={selectedStamp} />
                      <div className="min-w-0 text-[9px] font-bold"><b className="block break-words uppercase">{selectedStamp.name || selectedStamp.code || selectedStamp.id}</b><span className="block text-gray-500">Código/variante: {selectedStamp.code || selectedStamp.sku || selectedStamp.id}</span></div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="flex flex-col gap-1 text-[8px] font-black uppercase text-gray-500">
                        Nome / identificação da arte (opcional)
                        <input value={art.name} onChange={(event) => updateArtwork(art.id, 'name', event.target.value)} placeholder="Logo da empresa" className="min-h-10 border border-black/15 bg-white px-3 text-[11px] font-bold normal-case text-black" />
                      </label>
                      <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 border border-black/15 bg-white px-3 text-[10px] font-bold">
                        <Upload size={14} /> {uploadingArtworkId === art.id ? 'Enviando arte...' : art.image ? 'Substituir imagem' : 'Anexar imagem do cliente'}
                        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={isUploading} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void attachArtwork(art.id, file); }} />
                      </label>
                      <div className="flex gap-2">
                        <input aria-label={`Link da arte ${index + 1}`} type="url" value={artworkLinks[art.id] || ''} onChange={(event) => setArtworkLinks((current) => ({ ...current, [art.id]: event.target.value }))} placeholder="Ou cole um link HTTPS direto para a imagem" className="min-h-10 min-w-0 flex-1 border border-black/15 bg-white px-3 text-[11px]" />
                        <button type="button" disabled={isUploading || !artworkLinks[art.id]?.trim()} onClick={() => void attachArtwork(art.id, artworkLinks[art.id].trim())} className="flex min-h-10 items-center gap-1 border border-black/15 bg-white px-3 text-[9px] font-black uppercase disabled:opacity-40"><Link2 size={13} /> Importar</button>
                      </div>
                      {art.image && <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 p-2"><img src={art.image} alt={`Arte do cliente: ${art.name || index + 1}`} className="h-14 w-14 shrink-0 bg-white object-contain" referrerPolicy="no-referrer" /><span className="min-w-0 flex-1 text-[10px] font-bold text-emerald-900">Imagem {index + 1} anexada para a produção.</span><button type="button" aria-label={`Remover imagem da arte ${index + 1}`} onClick={() => updateArtwork(art.id, 'image', '')} className="min-h-9 px-2 text-red-700"><Trash2 size={15} /></button></div>}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex min-w-0 flex-col gap-1 text-[9px] font-bold sm:col-span-2">Regra para calcular esta estampa
                      <select aria-label={`Regra de custo da arte ${index + 1}`} value={art.costRuleId || defaultPrintRule} onChange={e => updateArtwork(art.id, 'costRuleId', e.target.value)} className="min-h-11 w-full min-w-0 border border-black/15 bg-white px-2 text-xs">
                        <option value="">Selecione a regra de custo</option>{printRules.map(rule => <option key={rule.id} value={rule.id}>{rule.name}</option>)}
                      </select>
                    </label>
                    <ManualChoiceWithOther label="Local da estampa (opcional)" value={art.location} onChange={(value) => updateArtwork(art.id, 'location', value)} options={LOCATION_OPTIONS} />
                    {selectedStamp && availableSizes.length > 0 ? (
                      <label className="flex flex-col gap-1 text-[8px] font-black uppercase text-gray-500 sm:col-span-2">
                        Medida da estampa (obrigatória para baixar estoque)
                        <select value={art.stockPrintSize || ''} onChange={(event) => {
                          updateArtwork(art.id, 'stockPrintSize', event.target.value);
                          updateArtwork(art.id, 'artSize', event.target.value);
                        }} className="min-h-10 border border-black/15 bg-white px-3 text-[11px] font-bold normal-case text-black">
                          <option value="">Selecione a medida cadastrada</option>
                          {availableSizes.map((size: string) => <option key={size} value={size}>{size}</option>)}
                        </select>
                      </label>
                    ) : (
                      <ManualChoiceWithOther label="Tamanho da arte (opcional)" value={art.artSize} onChange={(value) => updateArtwork(art.id, 'artSize', value)} options={ART_SIZE_OPTIONS} className="sm:col-span-2" />
                    )}
                    <label className="flex flex-col gap-1 text-[8px] font-black uppercase text-gray-500 sm:col-span-2">
                      Observação da arte (opcional)
                      <input value={art.notes || ''} onChange={(event) => updateArtwork(art.id, 'notes', event.target.value)} placeholder="Centralizar no bolso, manter proporção..." className="min-h-10 border border-black/15 bg-white px-3 text-[11px] font-bold normal-case text-black" />
                    </label>
                  </div>
                </div>
              );
            })}
          </section>
          <section className="min-w-0 space-y-3 rounded border border-black/15 bg-gray-50 p-3 text-xs">
            <h4 className="font-black">Custo automático</h4>
            <p className="text-gray-600">Escolha a referência do fornecedor. Peça, estampas e insumos usam os mesmos cadastros dos orçamentos.</p>
            {costsLoading && <p role="status">Carregando custos...</p>}
            {costsError && <p role="alert" className="text-red-700">{costsError} <button type="button" onClick={onReloadCosts} className="min-h-10 underline">Tentar novamente</button></p>}
            <fieldset className="space-y-2"><legend className="mb-1 font-bold">Insumos e aplicação</legend>
              {!costExtras.length && <p className="text-amber-800">Ainda não há insumos cadastrados. Cadastre embalagem e aplicação em Orçamentos → Cadastros e ajustes.</p>}
              {costExtras.map(extra => <label key={extra.id} className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={selectedExtraIds.includes(extra.id)} onChange={e => setExtraIds(e.target.checked ? [...selectedExtraIds, extra.id] : selectedExtraIds.filter(id => id !== extra.id))} />{extra.name}{extra.defaultForOrders && ' · padrão'}</label>)}
              <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={extrasReviewed} onChange={e => setExtrasReviewed(e.target.checked)} />Conferi embalagem, aplicação e demais insumos desta peça.</label>
            </fieldset>
            <details><summary className="min-h-10 cursor-pointer py-2 font-bold">Ajustar o custo total manualmente</summary><div className="space-y-2">
              <label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={manualCostMode} onChange={e => setManualCostMode(e.target.checked)} />Usar um custo total por peça no lugar do cálculo</label>
              {manualCostMode && <><label className="flex flex-col gap-1">Custo total por peça (R$)<input aria-label="Custo total por peça (R$)" type="number" min="0" step="0.01" value={unitCost} onChange={e => { setUnitCost(e.target.value); setManualCostConfirmed(false); }} className="min-h-11 border border-black/15 bg-white px-2" /></label><label className="flex flex-col gap-1">Motivo do ajuste<input aria-label="Motivo do ajuste" value={manualCostReason} maxLength={500} onChange={e => setManualCostReason(e.target.value)} className="min-h-11 border border-black/15 bg-white px-2" /></label><label className="flex min-h-10 items-center gap-2"><input type="checkbox" checked={manualCostConfirmed} onChange={e => setManualCostConfirmed(e.target.checked)} />Conferi o custo total e incluí todos os insumos.</label></>}
            </div></details>
            <OrderCostSummary items={costPreview} formatAmount={formatAmount} showSources={showAmounts} />
            <p className="text-gray-500">Prévia deste produto. O resumo do pedido recalcula DTF e insumos compartilhados entre todos os itens.</p>
          </section>
          <button type="button" disabled={isUploading || costsLoading || Boolean(costsError)} onClick={handleAdd} className="flex min-h-12 w-full items-center justify-center gap-2 bg-black px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[#eab308] hover:bg-[#eab308] hover:text-black disabled:opacity-50">
            <Plus size={15} /> Adicionar produto e continuar
          </button>
        </>
      )}
    </div>
  );
}
