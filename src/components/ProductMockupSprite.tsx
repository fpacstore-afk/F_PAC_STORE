import React, { useId } from 'react';
import { fabricColorTables } from '../lib/primeMockupColors';
import { cn } from '../lib/utils';
import { getSpritePosition, type ProductVisualKind } from '../lib/productPresentation';

interface ProductMockupSpriteProps {
  kind: ProductVisualKind;
  view?: 'front' | 'back';
  tone?: string;
  className?: string;
  imageClassName?: string;
  imageStyle?: React.CSSProperties;
  children?: React.ReactNode;
  label?: string;
  interactive?: boolean;
}

export function ProductMockupSprite({
  kind,
  view = 'front',
  tone,
  className,
  imageClassName,
  imageStyle,
  children,
  label,
  interactive = false,
}: ProductMockupSpriteProps) {
  const filterId = 'fabric-' + useId().replace(/:/g, '');
  const recolor = kind === 'regata' || tone && !['#151515', '#000000', '#1c1919'].includes(tone.toLowerCase());
  const tables = recolor ? fabricColorTables(tone || '#1c1919') : [];
  return (
    <div className={cn('relative overflow-hidden bg-[#f4f3f0]', className)} role={interactive ? 'group' : 'img'} aria-label={label}>
      {recolor && <svg aria-hidden="true" className="absolute h-0 w-0"><defs><filter id={filterId} colorInterpolationFilters="sRGB">
        <feColorMatrix type="saturate" values="0" />
        <feComponentTransfer><feFuncR type="table" tableValues={tables[0]} /><feFuncG type="table" tableValues={tables[1]} /><feFuncB type="table" tableValues={tables[2]} /></feComponentTransfer>
      </filter></defs></svg>}
      <div
        className={cn('absolute inset-0 bg-no-repeat', imageClassName)}
        style={{
          backgroundImage: kind === 'regata' ? 'url(/product-visuals/regata-atlas-v1.png)' : `url(/product-visuals/fpac-products-${view}-v1.webp)`,
          backgroundSize: kind === 'regata' ? '200% 300%' : '300% 200%',
          backgroundPosition: kind === 'regata' ? `${view === 'front' ? 0 : 100}% 0%` : getSpritePosition(kind),
          filter: recolor ? `url(#${filterId})` : undefined,
          // The source back sprite includes a small fragment of the next row.
          clipPath: view === 'back' && kind === 'oversized' ? 'inset(0 0 4% 0)' : undefined,
          ...imageStyle,
        }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}
