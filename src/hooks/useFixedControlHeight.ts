import { useLayoutEffect, useState } from 'react';

/** Share the real, responsive height of a fixed row with the other fixed UI. */
export function useFixedControlHeight(property: '--purchase-control-height' | '--flash-control-height') {
  const [element, setElement] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!element) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty(property, `${element.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty(property);
    };
  }, [element, property]);

  return setElement;
}
