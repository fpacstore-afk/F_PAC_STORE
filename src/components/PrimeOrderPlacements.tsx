import React from 'react';
import { describePrimePlacement } from '../../shared/primePlacement';

/** Read the canonical checkout configuration, with legacy cart compatibility. */
export function PrimeOrderPlacements({ item }: { item: any }) {
  const prints = Array.isArray(item.customization?.prints) ? item.customization.prints : Array.isArray(item.printConfigs) ? item.printConfigs : [];
  const placed = prints.filter((print: any) => print.placement?.version === 1 || print.orientationInstruction);
  if (!placed.length) return null;
  return <div className="mt-2 space-y-2 rounded border border-black/10 bg-white p-2 text-[10px] text-black">
    <p className="font-bold">Posições escolhidas pelo cliente</p>
    {placed.map((print: any, index: number) => <div key={print.id || index}>
      <b>{print.stamp} · {print.location}</b>
      {print.placement?.version === 1 && <>
        <p>{describePrimePlacement(print.placement)}</p>
        {print.placement.model === 'cap' && <p className="font-semibold text-black/75">Produzir nas medidas reais da arte indicadas acima, preservando a proporção e mantendo a aplicação acima da aba.</p>}
        <p className="text-black/60">Área fixa: {print.placement.model === 'cap' ? `${print.placement.areaHeightCm} cm de altura × ${print.placement.areaWidthCm} cm de largura` : `${print.placement.areaWidthCm} × ${print.placement.areaHeightCm} cm`} · tamanho {print.placement.garmentSize}. {print.placement.areaId.startsWith('sleeve') ? 'Estampa fixa, a 2 cm da barra e acompanhando sua inclinação.' : print.placement.model === 'hoodie' && print.placement.areaId === 'back' ? 'Arte posicionada pelo cliente; área começa logo abaixo da base do capuz.' : ['shorts', 'cap'].includes(print.placement.model) ? 'Arte posicionada pelo cliente dentro da área demarcada no mockup.' : 'Arte posicionada pelo cliente dentro da área; topo a ' + (print.placement.areaId === 'back' && print.placement.model !== 'cropped' ? 6 : 4) + ' cm abaixo da gola.'}</p>
      </>}
      {print.orientationInstruction && <p className="font-semibold text-black/75">{print.orientationInstruction}</p>}
    </div>)}
  </div>;
}
