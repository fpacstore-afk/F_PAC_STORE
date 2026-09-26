import React from 'react';
import { describePrimePlacement } from '../../shared/primePlacement';

/** Read the canonical checkout configuration, with legacy cart compatibility. */
export function PrimeOrderPlacements({ item }: { item: any }) {
  const prints = Array.isArray(item.customization?.prints) ? item.customization.prints : Array.isArray(item.printConfigs) ? item.printConfigs : [];
  const placed = prints.filter((print: any) => print.placement?.version === 1);
  if (!placed.length) return null;
  return <div className="mt-2 space-y-2 rounded border border-black/10 bg-white p-2 text-[10px] text-black">
    <p className="font-bold">Posições escolhidas pelo cliente</p>
    {placed.map((print: any, index: number) => <div key={print.id || index}>
      <b>{print.stamp} · {print.location}</b>
      <p>{describePrimePlacement(print.placement)}</p>
      <p className="text-black/60">Área fixa: {print.placement.areaWidthCm} × {print.placement.areaHeightCm} cm · tamanho {print.placement.garmentSize}. {print.placement.areaId === 'sleeve' ? 'Área a 2 cm da barra, acompanhando sua inclinação.' : 'Área centralizada; topo a ' + (print.placement.areaId === 'back' && print.placement.model !== 'cropped' ? 6 : 4) + ' cm abaixo da gola.'}</p>
    </div>)}
  </div>;
}
