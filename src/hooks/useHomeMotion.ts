import { useEffect, type RefObject } from 'react';

/** Load the animation engine only on the home and when movement is welcome. */
export function useHomeMotion(rootRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window.matchMedia !== 'function') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active = true;
    let generation = 0;
    let disposeMotion = () => {};

    const configure = () => {
      const current = ++generation;
      disposeMotion();
      disposeMotion = () => {};
      delete root.dataset.motionEngine;
      root.dataset.motionMode = preference.matches ? 'reduced' : 'loading';
      if (preference.matches) return;

      void import('../lib/homeScrollMotion').then(({ mountHomeScrollMotion }) => {
        if (!active || current !== generation) return;
        disposeMotion = mountHomeScrollMotion(root);
        root.dataset.motionEngine = 'scrolltrigger';
        root.dataset.motionMode = 'full';
      }).catch(() => {
        // Page content remains visible and usable if the optional chunk fails.
        if (active && current === generation) root.dataset.motionMode = 'static';
      });
    };

    configure();
    preference.addEventListener('change', configure);
    return () => {
      active = false;
      generation++;
      disposeMotion();
      preference.removeEventListener('change', configure);
      delete root.dataset.motionMode;
      delete root.dataset.motionEngine;
    };
  }, [rootRef]);
}
