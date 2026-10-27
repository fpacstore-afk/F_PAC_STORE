import React from 'react';
export function GarmentModelSelector({ options, selected, onChange }: { options: any[]; selected: string; onChange: (id: string) => void }) {
  if (!options.length) return null;
  return <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-black">
    <h3 className="mb-3 text-sm font-black uppercase">Escolha o modelo da peça</h3>
    <div className="grid gap-2 sm:grid-cols-2">{options.map(option => <button type="button" key={option.garmentModelId || option.id} aria-pressed={selected === (option.garmentModelId || option.id)} onClick={() => onChange(option.garmentModelId || option.id)} className={`min-h-16 rounded-lg border p-3 text-left ${selected === (option.garmentModelId || option.id) ? 'border-black bg-black text-white' : 'border-black/20 bg-white text-black'}`}><strong className="block text-xs">{option.garmentModelName || option.name}</strong><span className="mt-1 block text-xs">{option.collar || 'Confira a ficha desta peça'}</span></button>)}</div>
    <p className="mt-3 text-xs">Cada modelo tem sua própria tabela de medidas. Confira o guia antes de escolher o tamanho. A imagem da estampa é uma referência visual.</p>
  </section>;
}
