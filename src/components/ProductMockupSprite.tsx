import React from 'react';
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
  return (
    <div className={cn('relative overflow-hidden bg-[#f4f3f0]', className)} role={interactive ? 'group' : 'img'} aria-label={label}>
      <div
        className={cn('absolute inset-0 bg-no-repeat', imageClassName)}
        style={{
          backgroundImage: `url(/product-visuals/fpac-products-${view}-v1.webp)`,
          backgroundSize: '300% 200%',
          backgroundPosition: getSpritePosition(kind),
          ...imageStyle,
        }}
        aria-hidden="true"
      />
      {tone && tone.toLowerCase() !== '#151515' && tone.toLowerCase() !== '#000000' && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ backgroundColor: tone, mixBlendMode: 'screen' }}
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  );
}
