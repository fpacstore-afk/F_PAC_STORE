import React, { useState, type ComponentPropsWithoutRef } from 'react';
import { CATALOG_IMAGE_WIDTHS, getCatalogImageName } from '../../shared/catalogImageSizes';

export const PRODUCT_CARD_SIZES = '(max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, (max-width: 1535px) 20vw, 256px';
const DEFAULT_PRODUCT_IMAGE = '/estampas/logo-fpac-192.webp';

type Props = Omit<ComponentPropsWithoutRef<'img'>, 'src' | 'srcSet'> & {
  src?: string;
  sizes: string;
  fallback?: string;
};

export function StorefrontImage(props: Props) {
  return <ResponsiveImage key={props.src} {...props} />;
}

function ResponsiveImage({ src, sizes, fallback = DEFAULT_PRODUCT_IMAGE, onError, ...props }: Props) {
  const [attempt, setAttempt] = useState(0);
  const name = src && getCatalogImageName(src);
  const canResize = Boolean(name) && attempt === 0;
  const variant = (width: number) => `/api/catalog-images/${width}/${encodeURIComponent(name!)}`;
  const srcSet = canResize ? CATALOG_IMAGE_WIDTHS.map(width => `${variant(width)} ${width}w`).join(', ') : undefined;
  const useOriginal = attempt <= (name ? 1 : 0);
  return <img {...props}
    src={canResize ? variant(640) : (useOriginal && src) || fallback || undefined}
    srcSet={srcSet}
    sizes={srcSet ? sizes : undefined}
    onError={event => {
      if (canResize || (useOriginal && src && fallback && src !== fallback)) setAttempt(value => value + 1);
      else onError?.(event);
    }}
  />;
}
