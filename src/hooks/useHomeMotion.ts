import { useEffect, type RefObject } from 'react';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Progressive enhancement: content stays visible if motion APIs are unavailable. */
export function useHomeMotion(rootRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposeMotion = () => {};

    const configure = () => {
      disposeMotion();
      root.dataset.motionMode = preference.matches ? 'reduced' : 'full';
      if (preference.matches || typeof IntersectionObserver === 'undefined') return;

      const animations = new Set<Animation>();
      const observed = new WeakSet<Element>();
      const visibleScenes = new Set<HTMLElement>();
      let parallax: HTMLElement[] = [];
      let frame = 0;

      const revealObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const element = entry.target as HTMLElement;
          revealObserver.unobserve(element);
          if (element.dataset.motionSeen) continue;
          element.dataset.motionSeen = 'true';
          if (typeof element.animate !== 'function') continue;
          const image = element.dataset.motionReveal === 'image';
          const title = element.dataset.motionReveal === 'title';
          const distance = window.innerWidth < 768 ? 20 : 42;
          const animation = element.animate([
            { opacity: 0.15, transform: image ? 'scale(1.06)' : `translateY(${distance}px)`,
              clipPath: image || title ? 'inset(0 0 100% 0)' : 'inset(0)' },
            { opacity: 1, transform: 'none', clipPath: 'inset(0)' },
          ], {
            duration: image ? 1000 : 800,
            delay: Math.min(Number(element.dataset.motionDelay) || 0, 240),
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
          });
          animations.add(animation);
          const release = () => animations.delete(animation);
          animation.finished.then(release, release);
        }
      }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });

      const sceneObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const element = entry.target as HTMLElement;
          if (entry.isIntersecting) visibleScenes.add(element);
          else visibleScenes.delete(element);
        }
        schedule();
      }, { rootMargin: '100px 0px' });

      const update = () => {
        frame = 0;
        const viewport = window.innerHeight;
        const bounds = root.getBoundingClientRect();
        root.style.setProperty('--home-scroll-progress', String(clamp(-bounds.top / Math.max(1, bounds.height - viewport))));
        for (const element of parallax) {
          const section = element.closest<HTMLElement>('[data-home-hero]');
          if (!section) continue;
          const box = section.getBoundingClientRect();
          if (box.bottom < 0 || box.top > viewport) continue;
          const amplitude = window.innerWidth < 768 ? 12 : 42;
          const progress = clamp(-box.top / Math.max(1, box.height));
          element.style.setProperty('--home-parallax-y', `${progress * amplitude}px`);
        }
        for (const scene of visibleScenes) {
          const box = scene.getBoundingClientRect();
          const progress = clamp((viewport * 0.6 - box.top) / Math.max(1, box.height));
          scene.style.setProperty('--home-scene-progress', String(progress));
          scene.style.setProperty('--home-scene-shift', `${(progress - 0.5) * 54}px`);
          scene.style.setProperty('--home-scene-rotation', `${(progress - 0.5) * 24}deg`);
        }
      };
      function schedule() {
        if (!frame) frame = requestAnimationFrame(update);
      }

      const collect = () => {
        root.querySelectorAll<HTMLElement>('[data-motion-reveal], [data-motion-scene]').forEach(element => {
          if (observed.has(element)) return;
          observed.add(element);
          if (element.hasAttribute('data-motion-reveal')) revealObserver.observe(element);
          if (element.hasAttribute('data-motion-scene')) sceneObserver.observe(element);
        });
        parallax = Array.from(root.querySelectorAll<HTMLElement>('[data-motion-parallax]'));
        schedule();
      };
      const mutations = new MutationObserver(collect);
      mutations.observe(root, { childList: true, subtree: true });
      collect();
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);

      disposeMotion = () => {
        cancelAnimationFrame(frame);
        revealObserver.disconnect();
        sceneObserver.disconnect();
        mutations.disconnect();
        window.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
        animations.forEach(animation => animation.cancel());
        root.style.removeProperty('--home-scroll-progress');
        root.querySelectorAll<HTMLElement>('[data-motion-parallax], [data-motion-scene]').forEach(element => {
          ['--home-parallax-y', '--home-scene-progress', '--home-scene-shift', '--home-scene-rotation'].forEach(property => element.style.removeProperty(property));
        });
      };
    };

    configure();
    preference.addEventListener('change', configure);
    return () => {
      disposeMotion();
      preference.removeEventListener('change', configure);
      delete root.dataset.motionMode;
    };
  }, [rootRef]);
}
