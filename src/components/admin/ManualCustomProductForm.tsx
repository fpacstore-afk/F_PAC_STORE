import React, { useState } from 'react';
import { Link2, Plus, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { buildManualCustomOrderLines, inferManualStampPrintColor, type ManualCustomArtworkInput, type ManualCustomSizeInput } from '../../lib/manualCustomOrder';
import { uploadArtworkToCloudinary, uploadArtworkUrlToCloudinary } from '../../services/cloudinary';
import { stampImage, StampThumb } from './ManualStampPicker';

function newRowId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface ManualCustomProductFormProps {
  stamps: any[];
  disabled?: boolean;
  isGift: boolean;
  onAdd: (items: any[]) => void;
}

export function ManualCustomProductForm({ stamps, disabled = false, isGift, onAdd }: ManualCustomProductFormProps) {
  const [companyName, setCompanyName] = useState('');
  const [productName, setProductName] = useState('');
  const [model, setModel] = useState('');
  const [garmentColor, setGarmentColor] = useState('');
  const [productionNotes, setProductionNotes] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [sizeRows, setSizeRows] = useState<ManualCustomSizeInput[]>([{ id: newRowId('size'), size: '', quantity: 1 }]);
  const [artworks, setArtworks] = useState<ManualCustomArtworkInput[]>([{
    id: newRowId('art'), name: '', location: '', color: '', artSize: '', notes: '',
  }]);
  const [artworkLinks, setArtworkLinks] = useState<Record<string, string>>({});
  const [uploadingArtworkId, setUploadingArtworkId] = useState<string | null>(null);

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
    if (uploadingArtworkId) {
      toast.error('Aguarde o envio da arte terminar.');
      return;
    }
    if (!productName.trim()) {
      toast.error('Informe o produto, por exemplo: Camisa para uniforme.');
      return;
    }
    if (!garmentColor.trim()) {
      toast.error('Informe a cor da peça.');
      return;
    }
    if (!sizeRows.length || sizeRows.some((row) => !row.size.trim() || Number(row.quantity) < 1)) {
      toast.error('Preencha o tamanho e a quantidade de cada peça.');
      return;
    }
    if (!artworks.length || artworks.some((row) => {
      const stamp = stamps.find((item) => item.id === row.catalogStampId);
      const availableSizes = Array.isArray(stamp?.availableSizes) ? stamp.availableSizes : [];
      const size = row.catalogStampId && availableSizes.length ? row.stockPrintSize : row.artSize;
      const color = stamp ? inferManualStampPrintColor(stamp) || row.color : row.color;
      return (row.catalogStampId && !stamp) || !(row.catalogStampId || (row.name.trim() && row.image)) || !row.location.trim() || !String(color || '').trim() || !String(size || '').trim();
    })) {
      toast.error('Em cada arte, selecione uma estampa do catálogo ou anexe a imagem do cliente; informe também posição, cor e tamanho.');
      return;
    }

    const resolvedArtworks = artworks.map((row) => {
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
      sizeRows,
      artworks: resolvedArtworks,
    });
    if (!items.length) {
      toast.error('Adicione pelo menos uma peça com tamanho e quantidade válidos.');
      return;
    }
    onAdd(items);
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[9px] font-black uppercase text-gray-500">
              Empresa / equipe
              <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Nome da empresa do cliente" className="border border-black/15 bg-white px-3 py-2.5 text-xs font-bold normal-case text-black" />
            </label>
            <label className="flex flex-col gap-1 text-[9px] font-black uppercase text-gray-500">
              Produto
              <input value={productName} onChange={(event) => setProductName(event.target.value)} placeholder="Camisa para uniforme" className="border border-black/15 bg-white px-3 py-2.5 text-xs font-bold normal-case text-black" />
            </label>
            <label className="flex flex-col gap-1 text-[9px] font-black uppercase text-gray-500">
              Modelo / corte
              <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Oversized" className="border border-black/15 bg-white px-3 py-2.5 text-xs font-bold normal-case text-black" />
            </label>
            <label className="flex flex-col gap-1 text-[9px] font-black uppercase text-gray-500">
              Cor da peça
              <input value={garmentColor} onChange={(event) => setGarmentColor(event.target.value)} placeholder="Bege" className="border border-black/15 bg-white px-3 py-2.5 text-xs font-bold normal-case text-black" />
            </label>
            {!isGift && <label className="flex flex-col gap-1 text-[9px] font-black uppercase text-gray-500">
              Preço por peça (R$)
              <input type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} placeholder="0,00" className="border border-black/15 bg-white px-3 py-2.5 text-xs font-bold font-mono text-black" />
            </label>}
            <label className="flex flex-col gap-1 text-[9px] font-black uppercase text-gray-500">
              Custo por peça (opcional)
              <input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder="Informe se souber" className="border border-black/15 bg-white px-3 py-2.5 text-xs font-bold font-mono text-black" />
            </label>
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
              <div key={row.id} className="grid grid-cols-[1fr_110px_38px] gap-2">
                <input aria-label="Tamanho da peça" value={row.size} onChange={(event) => updateSize(row.id, 'size', event.target.value)} placeholder="P, M, G, GG..." className="min-h-10 border border-black/15 px-3 text-xs font-bold uppercase" />
                <input aria-label={`Quantidade do tamanho ${row.size || 'novo'}`} type="number" min="1" value={row.quantity} onChange={(event) => updateSize(row.id, 'quantity', event.target.value)} className="min-h-10 border border-black/15 px-3 text-center text-xs font-bold" />
                <button type="button" aria-label="Remover tamanho" disabled={sizeRows.length === 1} onClick={() => setSizeRows((current) => current.filter((item) => item.id !== row.id))} className="grid min-h-10 place-items-center border border-black/10 text-red-600 disabled:opacity-30"><Trash2 size={14} /></button>
              </div>
            ))}
          </section>

          <section className="space-y-3 rounded border border-black/10 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-[10px] font-black uppercase tracking-wider">Artes, posições e medidas</h4>
              <button type="button" onClick={() => setArtworks((current) => [...current, { id: newRowId('art'), name: '', location: '', color: '', artSize: '', notes: '' }])} className="flex min-h-9 items-center gap-1 border border-black/15 px-2 text-[9px] font-black uppercase"><Plus size={13} /> Adicionar arte</button>
            </div>
            {artworks.map((art, index) => {
              const selectedStamp = stamps.find((item) => item.id === art.catalogStampId);
              const availableSizes = Array.isArray(selectedStamp?.availableSizes) ? selectedStamp.availableSizes : [];
              return (
                <div key={art.id} className="space-y-2 border border-black/10 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase text-gray-600">Arte {index + 1}</span>
                    <button type="button" aria-label={`Remover arte ${index + 1}`} disabled={artworks.length === 1} onClick={() => setArtworks((current) => current.filter((item) => item.id !== art.id))} className="grid min-h-9 min-w-9 place-items-center text-red-600 disabled:opacity-30"><Trash2 size={14} /></button>
                  </div>
                  <label className="flex flex-col gap-1 text-[8px] font-black uppercase text-gray-500">
                    Estampa do catálogo (baixa do estoque)
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
                        Nome / identificação da arte
                        <input value={art.name} onChange={(event) => updateArtwork(art.id, 'name', event.target.value)} placeholder="Logo da empresa" className="min-h-10 border border-black/15 bg-white px-3 text-[11px] font-bold normal-case text-black" />
                      </label>
                      <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 border border-black/15 bg-white px-3 text-[10px] font-bold">
                        <Upload size={14} /> {uploadingArtworkId === art.id ? 'Enviando arte...' : 'Anexar imagem do cliente'}
                        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={Boolean(uploadingArtworkId)} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void attachArtwork(art.id, file); }} />
                      </label>
                      <div className="flex gap-2">
                        <input aria-label={`Link da arte ${index + 1}`} type="url" value={artworkLinks[art.id] || ''} onChange={(event) => setArtworkLinks((current) => ({ ...current, [art.id]: event.target.value }))} placeholder="Ou cole um link HTTPS direto para a imagem" className="min-h-10 min-w-0 flex-1 border border-black/15 bg-white px-3 text-[11px]" />
                        <button type="button" disabled={Boolean(uploadingArtworkId) || !artworkLinks[art.id]?.trim()} onClick={() => void attachArtwork(art.id, artworkLinks[art.id].trim())} className="flex min-h-10 items-center gap-1 border border-black/15 bg-white px-3 text-[9px] font-black uppercase disabled:opacity-40"><Link2 size={13} /> Importar</button>
                      </div>
                      {art.image && <div className="flex items-center gap-2 border border-emerald-200 bg-emerald-50 p-2"><img src={art.image} alt={`Arte do cliente: ${art.name || index + 1}`} className="h-14 w-14 shrink-0 bg-white object-contain" referrerPolicy="no-referrer" /><span className="min-w-0 text-[10px] font-bold text-emerald-900">Imagem anexada. Ela ficará no pedido e poderá ser aberta na produção.</span></div>}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-[8px] font-black uppercase text-gray-500">
                      Posição na peça
                      <input value={art.location} onChange={(event) => updateArtwork(art.id, 'location', event.target.value)} placeholder="Peito esquerdo / costas" className="min-h-10 border border-black/15 bg-white px-3 text-[11px] font-bold normal-case text-black" />
                    </label>
                    <label className="flex flex-col gap-1 text-[8px] font-black uppercase text-gray-500">
                      Cor da estampa
                      <input value={selectedStamp ? inferManualStampPrintColor(selectedStamp) || art.color : art.color} readOnly={Boolean(selectedStamp && inferManualStampPrintColor(selectedStamp))} onChange={(event) => updateArtwork(art.id, 'color', event.target.value)} placeholder="Preta / branca" className="min-h-10 border border-black/15 bg-white px-3 text-[11px] font-bold normal-case text-black read-only:bg-amber-50" />
                      {selectedStamp && inferManualStampPrintColor(selectedStamp) && <span className="font-bold normal-case text-amber-800">Cor identificada pela variante do catálogo.</span>}
                    </label>
                    {selectedStamp && availableSizes.length > 0 ? (
                      <label className="flex flex-col gap-1 text-[8px] font-black uppercase text-gray-500 sm:col-span-2">
                        Tamanho da arte / medida do estoque
                        <select value={art.stockPrintSize || ''} onChange={(event) => {
                          updateArtwork(art.id, 'stockPrintSize', event.target.value);
                          updateArtwork(art.id, 'artSize', event.target.value);
                        }} className="min-h-10 border border-black/15 bg-white px-3 text-[11px] font-bold normal-case text-black">
                          <option value="">Selecione a medida cadastrada</option>
                          {availableSizes.map((size: string) => <option key={size} value={size}>{size}</option>)}
                        </select>
                      </label>
                    ) : (
                      <label className="flex flex-col gap-1 text-[8px] font-black uppercase text-gray-500 sm:col-span-2">
                        Tamanho da arte
                        <input value={art.artSize} onChange={(event) => updateArtwork(art.id, 'artSize', event.target.value)} placeholder="Ex.: 10 × 10 cm" className="min-h-10 border border-black/15 bg-white px-3 text-[11px] font-bold normal-case text-black" />
                      </label>
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
          <button type="button" disabled={Boolean(uploadingArtworkId)} onClick={handleAdd} className="flex min-h-12 w-full items-center justify-center gap-2 bg-black px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[#eab308] hover:bg-[#eab308] hover:text-black disabled:opacity-50">
            <Plus size={15} /> Adicionar peças ao pedido
          </button>
        </>
      )}
    </div>
  );
}
