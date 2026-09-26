import React, { useRef } from 'react';
import {
  getPrimeAreaGeometry, placePrimeArtwork,
  type ArtworkBounds, type MeasuredPrimeModel, type PrimeAreaId, type PrimeArtPosition,
} from '../../shared/primePlacement';

interface Props {
  model: MeasuredPrimeModel;
  garmentSize: string;
  areaId: PrimeAreaId;
  art?: { image: string; name: string; printSize: string; bounds?: ArtworkBounds; position?: PrimeArtPosition };
  onMove?: (position: PrimeArtPosition) => void;
  showArea?: boolean;
}

export function PrimePrintPreview({ model, garmentSize, areaId, art, onMove, showArea = true }: Props) {
  const area = getPrimeAreaGeometry(model, garmentSize, areaId);
  const placed = art?.bounds ? placePrimeArtwork(model, garmentSize, areaId, art.printSize, art.bounds, art.position) : undefined;
  const areaRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; position: PrimeArtPosition; pixelsPerCm: number } | undefined>(undefined);
  const move = (position: PrimeArtPosition) => {
    if (art?.bounds && onMove) {
      const next = placePrimeArtwork(model, garmentSize, areaId, art.printSize, art.bounds, position);
      onMove({ xCm: next.xCm, yCm: next.yCm });
    }
  };
  const handleKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!placed) return;
    const step = event.shiftKey ? 1 : 0.1;
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const offset = offsets[event.key];
    if (offset) { event.preventDefault(); move({ xCm: placed.xCm + offset[0], yCm: placed.yCm + offset[1] }); }
    if (event.key === 'Home') { event.preventDefault(); move({ xCm: (area.widthCm - placed.widthCm) / 2, yCm: (area.heightCm - placed.heightCm) / 2 }); }
  };
  const artworkStyle: React.CSSProperties | undefined = placed && {
    left: `${placed.xCm / area.widthCm * 100}%`, top: `${placed.yCm / area.heightCm * 100}%`,
    width: `${placed.widthCm / area.widthCm * 100}%`, height: `${placed.heightCm / area.heightCm * 100}%`,
  };
  const crop = art?.bounds?.crop;
  const svg = art?.bounds && crop && (
    <svg className="block h-full w-full pointer-events-none" viewBox={`${crop.left * art.bounds.sourceWidth} ${crop.top * art.bounds.sourceHeight} ${crop.width * art.bounds.sourceWidth} ${crop.height * art.bounds.sourceHeight}`} aria-hidden="true">
      <image href={art.image} width={art.bounds.sourceWidth} height={art.bounds.sourceHeight} />
    </svg>
  );
  return (
    <div ref={areaRef} data-prime-area={areaId} className="absolute" style={{
      left: `${area.centerX / 512 * 100}%`, top: `${area.centerY / 512 * 100}%`,
      width: `${area.widthCm * area.pixelsPerCm / 512 * 100}%`, height: `${area.heightCm * area.pixelsPerCm / 512 * 100}%`,
      transform: `translate(-50%, -50%) rotate(${area.rotationDeg}deg)`,
    }}>
      {showArea && <div className="pointer-events-none absolute inset-0 outline outline-1 outline-dashed outline-white/55" style={{ boxShadow: '0 0 0 1px rgb(0 0 0 / .12)' }} />}
      {placed && art ? (onMove ?
        <button type="button" data-prime-art={areaId} aria-label={`Mover ${art.name} na área de ${areaId === 'front' ? 'frente' : areaId === 'back' ? 'costas' : 'manga esquerda'}. Use as setas para ajustar.`}
          className="absolute block select-none cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400 after:absolute after:inset-0 after:m-auto after:min-h-11 after:min-w-11"
          style={{ ...artworkStyle, touchAction: 'none', padding: 0 }}
          onKeyDown={handleKey}
          onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, position: { xCm: placed.xCm, yCm: placed.yCm }, pixelsPerCm: (areaRef.current?.clientWidth || 1) / area.widthCm };
          }}
          onPointerMove={event => {
            const start = drag.current;
            if (!start || start.pointerId !== event.pointerId) return;
            const dx = event.clientX - start.x, dy = event.clientY - start.y;
            const angle = area.rotationDeg * Math.PI / 180;
            move({ xCm: start.position.xCm + (dx * Math.cos(angle) + dy * Math.sin(angle)) / start.pixelsPerCm, yCm: start.position.yCm + (-dx * Math.sin(angle) + dy * Math.cos(angle)) / start.pixelsPerCm });
          }}
          onPointerUp={event => { drag.current = undefined; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          onPointerCancel={() => { drag.current = undefined; }}
          onLostPointerCapture={() => { drag.current = undefined; }}
        >{svg}</button>
        : <div className="absolute pointer-events-none" style={artworkStyle}>{svg}</div>)
        : showArea && <span className="absolute inset-0 grid place-items-center text-center text-[8px] font-bold text-white [text-shadow:0_1px_3px_black]">Área fixa<br />{area.widthCm} × {area.heightCm} cm</span>}
    </div>
  );
}
