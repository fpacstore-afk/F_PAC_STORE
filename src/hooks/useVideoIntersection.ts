import { useEffect, useRef, useState } from 'react';

interface IntersectionStates {
  isNearViewport: boolean; // For lazy-loading the video element source
  isActiveOnMobile: boolean; // For auto-playing on mobile (60% visible)
}

/**
 * Custom hook to manage video lazy loading and autoplay using IntersectionObserver.
 * 
 * Supports two thresholds:
 * - 5% (0.05): Triggers lazy loading/preloading of video metadata when the card is close.
 * - 60% (0.60): Triggers autoplay on mobile devices when the card is highly visible.
 */
export function useVideoIntersection() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [states, setStates] = useState<IntersectionStates>({
    isNearViewport: false,
    isActiveOnMobile: false,
  });

  useEffect(() => {
    const target = containerRef.current;
    if (!target || typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return;
    }

    // Two observers: one for early lazy loading, one for mobile focus/autoplay
    const lazyObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStates(prev => ({ ...prev, isNearViewport: true }));
          // Once loaded, we don't need to un-lazy load, so we can disconnect
          lazyObserver.disconnect();
        }
      },
      { rootMargin: '200px', threshold: 0.05 } // Start preloading slightly before entering viewport
    );

    const mobileObserver = new IntersectionObserver(
      ([entry]) => {
        setStates(prev => ({
          ...prev,
          isActiveOnMobile: entry.isIntersecting,
        }));
      },
      { threshold: 0.60 } // Trigger focus state when 60% of the card is visible
    );

    lazyObserver.observe(target);
    mobileObserver.observe(target);

    return () => {
      lazyObserver.disconnect();
      mobileObserver.disconnect();
    };
  }, []);

  return {
    containerRef,
    isNearViewport: states.isNearViewport,
    isActiveOnMobile: states.isActiveOnMobile,
  };
}
