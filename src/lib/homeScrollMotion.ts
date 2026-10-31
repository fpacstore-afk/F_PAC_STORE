import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** All animations belong to this root and revert on breakpoint changes/navigation. */
export function mountHomeScrollMotion(root: HTMLElement): () => void {
  const media = gsap.matchMedia();

  try {
    media.add({ desktop: '(min-width: 768px)', mobile: '(max-width: 767px)' }, context => {
      const desktop = Boolean(context.conditions?.desktop);
      const animations = new Map<HTMLElement, gsap.core.Tween>();
      const reveals = new Map<HTMLElement, gsap.core.Tween>();
      const tracked = new WeakSet<HTMLElement>();
      let active = true;
      let collectFrame = 0;
      let refreshFrame = 0;

      const refresh = () => {
        if (!active || refreshFrame) return;
        refreshFrame = requestAnimationFrame(() => {
          refreshFrame = 0;
          if (active) ScrollTrigger.refresh();
        });
      };

      gsap.fromTo(root, { '--home-scroll-progress': 0 }, {
        '--home-scroll-progress': 1,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: 'bottom bottom', scrub: true, invalidateOnRefresh: true },
      });

      const collect = () => context.add(() => {
        for (const [element, animation] of animations) {
          if (root.contains(element)) continue;
          animation.revert();
          animations.delete(element);
          reveals.delete(element);
        }

        root.querySelectorAll<HTMLElement>('[data-motion-reveal], [data-motion-parallax], [data-motion-scene], [data-motion-image-depth]').forEach(element => {
          if (tracked.has(element)) return;
          tracked.add(element);

          if (element.hasAttribute('data-motion-reveal') && !element.dataset.motionSeen) {
            // Restoring the page halfway down must not animate earlier content again.
            if (element.getBoundingClientRect().bottom <= 0) {
              element.dataset.motionSeen = 'true';
              return;
            }
            const image = element.dataset.motionReveal === 'image';
            const animation = gsap.fromTo(element, {
              opacity: 0.16,
              y: desktop ? 34 : 18,
              scale: image ? 1.025 : 1,
            }, {
              opacity: 1, y: 0, scale: 1,
              duration: image ? 0.9 : 0.72,
              delay: Math.min(Math.max(0, Number(element.dataset.motionDelay) || 0), 180) / 1000,
              ease: 'power3.out',
              immediateRender: false,
              clearProps: 'opacity,transform',
              onStart: () => { element.dataset.motionSeen = 'true'; },
              scrollTrigger: { trigger: element, start: 'top 92%', once: true },
            });
            animations.set(element, animation);
            reveals.set(element, animation);
          } else if (element.hasAttribute('data-motion-parallax')) {
            const hero = element.closest<HTMLElement>('[data-home-hero]');
            if (!hero) return;
            animations.set(element, gsap.fromTo(element, { '--home-parallax-y': '0px' }, {
              '--home-parallax-y': desktop ? '38px' : '12px',
              ease: 'none',
              scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: 0.6, invalidateOnRefresh: true },
            }));
          } else if (element.hasAttribute('data-motion-image-depth')) {
            animations.set(element, gsap.fromTo(element, { yPercent: -3, scale: 1.08 }, {
              yPercent: 3, scale: 1.08, ease: 'none',
              scrollTrigger: { trigger: element.closest('[data-home-identity-journey]'), start: 'top bottom', end: 'bottom top', scrub: 0.7 },
            }));
          } else if (element.hasAttribute('data-motion-scene')) {
            animations.set(element, gsap.fromTo(element, {
              '--home-scene-progress': 0, '--home-scene-shift': '-22px', '--home-scene-rotation': '-10deg',
            }, {
              '--home-scene-progress': 1, '--home-scene-shift': '22px', '--home-scene-rotation': '10deg',
              ease: 'none',
              scrollTrigger: { trigger: element, start: 'top 85%', end: 'bottom 15%', scrub: 0.7, invalidateOnRefresh: true },
            }));
          }
        });
        refresh();
      });

      const scheduleCollect = () => {
        if (!active || collectFrame) return;
        collectFrame = requestAnimationFrame(() => {
          collectFrame = 0;
          if (active) collect();
        });
      };
      const mutations = new MutationObserver(scheduleCollect);
      mutations.observe(root, { childList: true, subtree: true });
      const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
      resize?.observe(root);

      const revealFocusedContent = (event: FocusEvent) => {
        for (const [element, animation] of reveals) {
          if (event.target instanceof Node && element.contains(event.target)) {
            animation.progress(1);
            animation.scrollTrigger?.kill();
          }
        }
      };
      root.addEventListener('focusin', revealFocusedContent);
      root.addEventListener('load', refresh, true);
      void document.fonts?.ready.then(refresh);
      collect();

      return () => {
        active = false;
        cancelAnimationFrame(collectFrame);
        cancelAnimationFrame(refreshFrame);
        mutations.disconnect();
        resize?.disconnect();
        root.removeEventListener('focusin', revealFocusedContent);
        root.removeEventListener('load', refresh, true);
        animations.clear();
        reveals.clear();
      };
    }, root);
  } catch (error) {
    media.revert();
    throw error;
  }

  return () => media.revert();
}
