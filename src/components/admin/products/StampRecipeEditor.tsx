import React, { useState } from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { Product } from '../../../types/product';
import { normalizePrimePrintSize } from '../../../../shared/primeArtworkSizing';
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
}

const MAX_STAMPS = 5;
const fieldClass = 'min-h-11 min-w-0 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200';

export const StampRecipeEditor: React.FC<StampRecipeEditorProps> = ({ product, onChange, stamps }) => {
  const [selectedColor, setSelectedColor] = useState('');
  const [adding, setAdding] = useState(false);
  const colors = product.colors || [];
  const activeColor = colors.some(color => color.name === selectedColor) ? selectedColor : '';
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
    return <div key={newRow ? 'new' : `${index}-${entry.stampId}`} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.4fr)_2.75rem] sm:items-start">
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-700" htmlFor={`${fieldPrefix}-stamp-${index}`}>
          Estampa {index + 1}
        </label>
        <div className="flex items-center gap-2">
          {stamp?.thumbnailUrl && <img src={stamp.thumbnailUrl} alt={`Prévia da estampa ${stamp.name}`} loading="lazy" onError={event => { event.currentTarget.style.display = 'none'; }} className="h-11 w-11 shrink-0 rounded-lg border border-slate-300 bg-white object-contain" />}
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
        {entry.stampId && sizes.length === 0 && <p className="mt-1 text-xs font-semibold text-red-700">Cadastre uma medida para esta estampa no acervo.</p>}
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-700" htmlFor={`${fieldPrefix}-size-${index}`}>
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
        </select> : <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500">Escolha a estampa primeiro</div>}
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
        className="mt-1 flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-red-400 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 sm:mt-5"
      >
        <Trash2 size={17} />
      </button>
    </div>;
  };

  return <section className="md:col-span-2 rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 shadow-sm sm:p-5" aria-label="Estampas e medidas do produto">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
      <div>
        <h3 className="text-base font-black text-slate-950">Estampas e medidas</h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">Monte a receita padrão uma vez. Só personalize a cor quando ela usar estampas diferentes. Cada estampa escolhida será baixada do estoque no pedido.</p>
      </div>
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Até 5 estampas por peça</span>
    </div>

    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Escolha a receita para editar">
      <button type="button" aria-pressed={!activeColor} onClick={() => chooseColor('')} className={`min-h-11 rounded-lg border px-3 text-sm font-bold transition-colors ${!activeColor ? 'border-amber-500 bg-amber-100 text-slate-950' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
        Padrão <span className="ml-1 text-xs opacity-75">{defaultRecipe.length}</span>
      </button>
      {colors.map(color => {
        const ownRecipe = readEditableStampRecipe(product, color.name);
        return <button key={color.name} type="button" aria-pressed={activeColor === color.name} onClick={() => chooseColor(color.name)} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-bold transition-colors ${activeColor === color.name ? 'border-amber-500 bg-amber-100 text-slate-950' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
          <span aria-hidden="true" className="h-4 w-4 rounded-full border border-slate-400" style={{ backgroundColor: color.hex || '#ddd' }} />
          {color.name} <span className="text-xs opacity-70">{ownRecipe === undefined ? 'usa padrão' : `${ownRecipe.length} estampas`}</span>
        </button>;
      })}
    </div>

    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950">{activeColor ? `Camisa ${activeColor}` : 'Receita padrão'}</p>
          <p className="mt-1 text-sm text-slate-600">{activeColor && colorRecipe === undefined ? 'Esta cor segue automaticamente a receita padrão.' : activeColor ? 'Receita exclusiva desta cor.' : 'Aplicada às cores que não têm receita própria.'}</p>
          <p className="mt-1 text-xs font-semibold text-slate-700">{describeRecipe(recipe)}</p>
        </div>
        {activeColor && <div className="flex flex-wrap items-center gap-2">
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
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
          >
            <option value="">Copiar receita de...</option>
            <option value="__default__">Padrão</option>
            {colors.filter(color => color.name !== activeColor).map(color => <option key={color.name} value={color.name}>{color.name}</option>)}
          </select>
          {colorRecipe !== undefined && <button type="button" onClick={() => { onChange(current => clearEditableStampRecipe(current, activeColor)); setAdding(false); }} className="flex min-h-11 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><RotateCcw size={15} /> Usar padrão</button>}
        </div>}
      </div>

      {isCustom ? <div className="mt-4 space-y-2">
        {recipe.map((entry, index) => renderRow(entry, index))}
        {(recipe.length === 0 || adding) && recipe.length < MAX_STAMPS && renderRow({ stampId: '' }, recipe.length, true)}
        {recipe.length > 0 && recipe.length < MAX_STAMPS && !adding && <button type="button" onClick={() => setAdding(true)} className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-slate-400 bg-white px-4 text-sm font-bold text-slate-800 hover:border-amber-500 hover:bg-amber-50"><Plus size={17} /> Adicionar estampa</button>}
        {activeColor && colorRecipe?.length === 0 && <p className="text-xs text-slate-600">Escolha uma estampa. Sem seleção, esta cor continuará usando o padrão ao salvar.</p>}
      </div> : <button type="button" onClick={() => onChange(current => writeEditableStampRecipe(current, defaultRecipe, activeColor))} className="mt-4 flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-black text-slate-950 hover:bg-amber-300"><Plus size={17} /> Personalizar esta cor</button>}
    </div>
    <p className="mt-3 text-xs text-slate-600">As alterações entram no catálogo somente após clicar em “Salvar alterações”.</p>
  </section>;
};
