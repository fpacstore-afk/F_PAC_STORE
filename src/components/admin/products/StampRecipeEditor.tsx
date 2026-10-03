import React, { useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { Product } from '../../../types/product';
import { normalizePrimePrintSize } from '../../../../shared/primeArtworkSizing';
import type { ProductColorPreset } from '../../../../shared/productColorPresets';
import { normalizeStampRecipeColor } from '../../../../shared/productStampRecipe';
import type { ProductStampRecipeEntry } from '../../../../shared/productStampRecipe';
import { clearEditableStampRecipe, readEditableStampRecipe, writeEditableStampRecipe } from '../../../../shared/productStampRecipeEditor';

export interface StampChoice {
  id: string;
  name: string;
  code: string;
  availableSizes: string[];
  thumbnailUrl?: string;
}

interface StampRecipeEditorProps {
  product: Partial<Product>;
  onChange: React.Dispatch<React.SetStateAction<Partial<Product>>>;
  stamps: StampChoice[];
  registeredColors: ProductColorPreset[];
  registeredColorsLoading: boolean;
  registeredColorsError: boolean;
  onAddColor: (color: ProductColorPreset) => void;
}

const MAX_STAMPS = 5;
const fieldClass = 'min-h-11 min-w-0 w-full rounded-lg border border-slate-600 bg-[#252a34] px-3 text-sm font-semibold text-slate-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25';

export const StampRecipeEditor: React.FC<StampRecipeEditorProps> = ({ product, onChange, stamps, registeredColors, registeredColorsLoading, registeredColorsError, onAddColor }) => {
  const [selectedColor, setSelectedColor] = useState('');
  const [adding, setAdding] = useState(false);
  const productColors = product.colors || [];
  const colors = [...productColors];
  registeredColors.forEach(color => {
    if (!colors.some(existing => normalizeStampRecipeColor(existing.name) === normalizeStampRecipeColor(color.name))) colors.push(color);
  });
  const activeColor = colors.some(color => color.name === selectedColor) ? selectedColor : '';
  const activeProductColor = productColors.some(color => normalizeStampRecipeColor(color.name) === normalizeStampRecipeColor(activeColor));
  const canEdit = !activeColor || activeProductColor;
  const defaultRecipe = readEditableStampRecipe(product) || [];
  const colorRecipe = activeColor ? readEditableStampRecipe(product, activeColor) : undefined;
  const isCustom = !activeColor || colorRecipe !== undefined;
  const recipe = activeColor ? colorRecipe ?? defaultRecipe : defaultRecipe;
  const fieldPrefix = `recipe-${activeColor ? activeColor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() : 'default'}`;

  const chooseColor = (color: string) => {
    setSelectedColor(color);
    setAdding(false);
  };

  const updateRecipe = (entries: ProductStampRecipeEntry[]) => {
    onChange(current => writeEditableStampRecipe(current, entries, activeColor || undefined));
  };

  const describeRecipe = (entries: ProductStampRecipeEntry[]) => entries.length
    ? entries.map(entry => {
        const stamp = stamps.find(choice => choice.id === entry.stampId);
        return `${stamp?.code || stamp?.name || 'Estampa indisponível'}${entry.printSize ? ` · ${entry.printSize}` : ''}`;
      }).join('  +  ')
    : 'Nenhuma estampa definida';

  const renderRow = (entry: ProductStampRecipeEntry, index: number, newRow = false) => {
    const stamp = stamps.find(choice => choice.id === entry.stampId);
    const sizes = stamp?.availableSizes || [];
    const currentSize = sizes.find(size => normalizePrimePrintSize(size) === normalizePrimePrintSize(entry.printSize))
      || entry.printSize || (sizes.length === 1 ? sizes[0] : '');
    return <div key={newRow ? 'new' : `${index}-${entry.stampId}`} className="grid gap-2 rounded-xl border border-slate-700 bg-[#1d222b] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.4fr)_2.75rem] sm:items-start">
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-200" htmlFor={`${fieldPrefix}-stamp-${index}`}>
          Estampa {index + 1}
        </label>
        <div className="flex items-center gap-2">
          {stamp?.thumbnailUrl && <img src={stamp.thumbnailUrl} alt={`Prévia da estampa ${stamp.name}`} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} className="h-11 w-11 shrink-0 rounded-lg border border-slate-600 bg-slate-100 object-contain" />}
          <select
          id={`${fieldPrefix}-stamp-${index}`}
          value={entry.stampId}
          onChange={event => {
            const nextId = event.target.value;
            if (!nextId && newRow) return;
            const next = [...recipe];
            if (!nextId) next.splice(index, 1);
            else {
              const options = stamps.find(choice => choice.id === nextId)?.availableSizes || [];
              const matchingSize = options.find(size => normalizePrimePrintSize(size) === normalizePrimePrintSize(entry.printSize));
              next[index] = { stampId: nextId, printSize: matchingSize || (options.length === 1 ? options[0] : '') };
            }
            updateRecipe(next);
            setAdding(false);
          }}
          className={fieldClass}
          >
            <option value="">Selecione a estampa</option>
            {entry.stampId && !stamp && <option value={entry.stampId}>Estampa indisponível ({entry.stampId})</option>}
            {stamps.map(choice => <option key={choice.id} value={choice.id}>{choice.code} · {choice.name}</option>)}
          </select>
        </div>
        {entry.stampId && sizes.length === 0 && <p className="mt-1 text-xs font-semibold text-red-300">Cadastre uma medida para esta estampa no acervo.</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-200" htmlFor={`${fieldPrefix}-size-${index}`}>
          Medida da estampa
        </label>
        {entry.stampId ? <select
          id={`${fieldPrefix}-size-${index}`}
          value={currentSize}
          onChange={event => {
            const next = [...recipe];
            next[index] = { ...entry, printSize: event.target.value };
            updateRecipe(next);
          }}
          className={fieldClass}
          disabled={sizes.length === 0}
        >
          <option value="">Selecione a medida</option>
          {currentSize && !sizes.some(size => normalizePrimePrintSize(size) === normalizePrimePrintSize(currentSize)) && <option value={currentSize}>Medida não cadastrada: {currentSize}</option>}
          {sizes.map(size => <option key={size} value={size}>{size}</option>)}
        </select> : <div className="flex min-h-11 items-center rounded-lg border border-slate-700 bg-[#252a34] px-3 text-sm text-slate-400">Escolha a estampa primeiro</div>}
      </div>
      <button
        type="button"
        aria-label={newRow ? 'Cancelar inclusão de estampa' : `Remover estampa ${index + 1} ${activeColor ? `da cor ${activeColor}` : 'do padrão'}`}
        title={newRow ? 'Cancelar inclusão' : 'Remover estampa'}
        onClick={() => {
          if (newRow) setAdding(false);
          else {
            const next = recipe.filter((_, rowIndex) => rowIndex !== index);
            if (activeColor && next.length === 0) onChange(current => clearEditableStampRecipe(current, activeColor));
            else updateRecipe(next);
          }
        }}
        className="mt-1 flex min-h-11 items-center justify-center rounded-lg border border-slate-600 bg-[#252a34] text-slate-300 hover:border-red-400 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400 sm:mt-5"
      >
        <Trash2 size={17} />
      </button>
    </div>;
  };

  return <section className="md:col-span-2 rounded-2xl border border-amber-400/25 bg-[#171a21] p-4 text-slate-100 shadow-lg shadow-black/20 sm:p-5" aria-label="Estampas e medidas do produto">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700 pb-4">
      <div>
        <h3 className="text-base font-black text-amber-400">Estampas e medidas</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-300">Monte a receita padrão uma vez. Só personalize a cor quando ela usar estampas diferentes. Cada estampa escolhida será baixada do estoque no pedido.</p>
      </div>
      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">Até 5 estampas por peça</span>
    </div>

    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Escolha a receita para editar">
      <button type="button" aria-pressed={!activeColor} onClick={() => chooseColor('')} className={`min-h-11 rounded-lg border px-3 text-sm font-bold transition-colors ${!activeColor ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-slate-600 bg-[#252a34] text-slate-200 hover:bg-slate-700'}`}>
        Padrão <span className="ml-1 text-xs opacity-75">{defaultRecipe.length}</span>
      </button>
      {colors.map(color => {
        const ownRecipe = readEditableStampRecipe(product, color.name);
        const inProduct = productColors.some(selected => normalizeStampRecipeColor(selected.name) === normalizeStampRecipeColor(color.name));
        return <button key={color.name} type="button" aria-pressed={activeColor === color.name} onClick={() => chooseColor(color.name)} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition-colors ${activeColor === color.name ? 'border-amber-400 bg-amber-400/15 text-amber-200' : inProduct ? 'border-slate-600 bg-[#252a34] text-slate-200 hover:bg-slate-700' : 'border-slate-700 bg-[#1d222b] text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}>
          <span aria-hidden="true" className="h-4 w-4 rounded-full border border-slate-400" style={{ backgroundColor: color.hex || '#ddd' }} />
          {color.name} <span className="text-xs opacity-70">{inProduct ? ownRecipe === undefined ? 'usa padrão' : `${ownRecipe.length} estampas` : 'fora do produto'}</span>
        </button>;
      })}
    </div>
    {registeredColorsLoading && <p className="mt-2 text-xs text-slate-400" role="status">Carregando todas as cores cadastradas...</p>}
    {registeredColorsError && <p className="mt-2 text-xs text-red-300" role="alert">Não foi possível carregar todas as cores cadastradas. Reabra o produto para tentar novamente.</p>}

    <div className="mt-4 rounded-xl border border-slate-700 bg-[#11141a] p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-100">{activeColor ? `Camisa ${activeColor}` : 'Receita padrão'}</p>
          <p className="mt-1 text-sm text-slate-300">{activeColor && !activeProductColor ? 'Esta cor está cadastrada, mas ainda não faz parte deste produto.' : activeColor && colorRecipe === undefined ? 'Esta cor segue automaticamente a receita padrão.' : activeColor ? 'Receita exclusiva desta cor.' : 'Aplicada às cores que não têm receita própria.'}</p>
          <p className="mt-1 text-xs font-semibold text-amber-200">{describeRecipe(recipe)}</p>
        </div>
        {activeColor && activeProductColor && <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Copiar receita para ${activeColor}`}
            defaultValue=""
            value=""
            onChange={event => {
              const sourceColor = event.target.value;
              const source = sourceColor === '__default__' ? defaultRecipe : readEditableStampRecipe(product, sourceColor) ?? defaultRecipe;
              onChange(current => writeEditableStampRecipe(current, source, activeColor));
              setAdding(false);
            }}
            className="min-h-11 rounded-lg border border-slate-600 bg-[#252a34] px-3 text-sm font-semibold text-slate-100 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/25"
          >
            <option value="">Copiar receita de...</option>
            <option value="__default__">Padrão</option>
            {productColors.filter(color => normalizeStampRecipeColor(color.name) !== normalizeStampRecipeColor(activeColor)).map(color => <option key={color.name} value={color.name}>{color.name}</option>)}
          </select>
          {colorRecipe !== undefined && <button type="button" onClick={() => { onChange(current => clearEditableStampRecipe(current, activeColor)); setAdding(false); }} className="flex min-h-11 items-center gap-1 rounded-lg border border-slate-600 bg-[#252a34] px-3 text-sm font-bold text-slate-200 hover:bg-slate-700"><RotateCcw size={15} /> Usar padrão</button>}
        </div>}
      </div>

      {!canEdit ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-[#1d222b] p-3">
        <p className="flex-1 text-sm text-slate-300">Adicione esta cor ao produto para configurar estampas e medidas. Os saldos atuais permanecem iguais; nada será salvo até clicar em “Salvar alterações”.</p>
        <button type="button" onClick={() => {
          const color = colors.find(item => item.name === activeColor);
          if (!color) return;
          onAddColor(color);
          onChange(current => writeEditableStampRecipe(current, readEditableStampRecipe(current, color.name) ?? defaultRecipe, color.name));
        }} className="flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-black text-slate-950 hover:bg-amber-300"><Plus size={17} /> Adicionar cor ao produto</button>
      </div> : isCustom ? <div className="mt-4 space-y-2">
        {recipe.map((entry, index) => renderRow(entry, index))}
        {(recipe.length === 0 || adding) && recipe.length < MAX_STAMPS && renderRow({ stampId: '' }, recipe.length, true)}
        {recipe.length > 0 && recipe.length < MAX_STAMPS && !adding && <button type="button" onClick={() => setAdding(true)} className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-slate-500 bg-[#252a34] px-4 text-sm font-bold text-slate-200 hover:border-amber-400 hover:bg-amber-400/10"><Plus size={17} /> Adicionar estampa</button>}
        {activeColor && colorRecipe?.length === 0 && <p className="text-xs text-slate-300">Escolha uma estampa. Sem seleção, esta cor continuará usando o padrão ao salvar.</p>}
      </div> : <button type="button" onClick={() => onChange(current => writeEditableStampRecipe(current, defaultRecipe, activeColor))} className="mt-4 flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-black text-slate-950 hover:bg-amber-300"><Plus size={17} /> Personalizar esta cor</button>}
    </div>
    <p className="mt-3 text-xs text-slate-400">As alterações entram no catálogo somente após clicar em “Salvar alterações”.</p>
  </section>;
};
