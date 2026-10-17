import React, { useState } from 'react';
import { dtfPurchase } from '../../../shared/pricingWorkbench';

const colors = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#ddd6fe', '#fed7aa'];
const shapeKey = (width: number, height: number) => [width, height].sort((a, b) => a - b).join('×');

export default function DtfPackingPreview({ purchase }: { purchase: ReturnType<typeof dtfPurchase> }) {
  const [showAll, setShowAll] = useState(false);
  if (!purchase.packing || !purchase.sheetWidth || !purchase.sheetHeight) return null;
  const layouts = purchase.packing.layouts;
  const shapes = [...new Set(layouts.flatMap(layout => layout.rectangles.map(rect => shapeKey(rect.width, rect.height))))];
  const shown = showAll ? layouts : layouts.slice(0, 3);
  return <div className="dtf-preview">
    <div className="dtf-preview-heading"><div><h3>Prévia do encaixe</h3><p>Folha de {purchase.sheetWidth} × {purchase.sheetHeight} cm · espaço de {purchase.gap} cm · rotação permitida</p></div>
      <strong>{purchase.packing.sheets} folha(s)</strong></div>
    <div className="dtf-legend">{shapes.map((shape, index) => <span key={shape}><i style={{ background: colors[index % colors.length] }} />{shape} cm</span>)}</div>
    <div className="dtf-layouts">{shown.map((layout, index) => <figure key={index}>
      <figcaption>Encaixe {index + 1}<strong>Repetir {layout.repeat} vez(es)</strong></figcaption>
      <svg role="img" aria-label={`Encaixe ${index + 1}: ${layout.rectangles.length} estampas, repetir ${layout.repeat} vezes`}
        viewBox={`0 0 ${purchase.sheetWidth} ${purchase.sheetHeight}`}>
        <rect width={purchase.sheetWidth} height={purchase.sheetHeight} fill="#fff" />
        {layout.rectangles.slice(0, 300).map((rect, rectIndex) => <g key={rectIndex}>
          <rect {...rect} fill={colors[shapes.indexOf(shapeKey(rect.width, rect.height)) % colors.length]} stroke="#475569" strokeWidth="0.15" />
          <title>{rect.width} × {rect.height} cm</title>
          {rect.width >= 6 && rect.height >= 6 && <text x={rect.x + rect.width / 2} y={rect.y + rect.height / 2}
            textAnchor="middle" dominantBaseline="middle" fontSize={Math.min(3, rect.width / 5)} fill="#1c1919">{rect.width}×{rect.height}</text>}
        </g>)}
      </svg>
      <p>{layout.rectangles.length} estampa(s) por folha{layout.rectangles.length > 300 ? ' · primeiras 300 exibidas' : ''}</p>
    </figure>)}</div>
    {layouts.length > 3 && <button type="button" onClick={() => setShowAll(value => !value)}>{showAll ? 'Mostrar menos encaixes' : `Mostrar os ${layouts.length} encaixes`}</button>}
    {!purchase.packing.previewComplete && <p className="qb-help">Prévia parcial. A estimativa considera todas as estampas informadas.</p>}
    <p className="qb-help">Estimativa por retângulos. O contorno real das artes e o aproveitamento de sobras podem mudar a metragem. A prévia usa o encaixe estimado, mesmo quando você informa uma compra manual.</p>
  </div>;
}
