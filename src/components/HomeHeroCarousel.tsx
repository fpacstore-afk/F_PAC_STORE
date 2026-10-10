import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { MediaSlot } from './MediaSlot';
import type { MediaSlotConfig } from '../types/mediaSlot';

export type HomeHeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  href: string;
  image: string;
  alt: string;
  media?: MediaSlotConfig;
  mobileMedia?: MediaSlotConfig;
};

type HomeHeroCarouselProps = {
  slides: HomeHeroSlide[];
};

const ROTATION_MS = 6000;

export function HomeHeroCarousel({ slides }: HomeHeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const shouldPause = paused || hovered || focused;
  const touchStartX = useRef<number | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageLayerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeIndex >= slides.length) setActiveIndex(0);
  }, [activeIndex, slides.length]);

  useEffect(() => {
    if (shouldPause || slides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setActiveIndex(current => (current + 1) % slides.length);
    }, ROTATION_MS);
    return () => window.clearInterval(timer);
  }, [shouldPause, slides.length]);

  useEffect(() => {
    const frame = frameRef.current;
    const imageLayer = imageLayerRef.current;
    if (!frame || !imageLayer || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let animationFrame = 0;
    const updateParallax = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const bounds = frame.getBoundingClientRect();
        const progress = Math.max(-1, Math.min(1, (window.innerHeight - bounds.top) / (window.innerHeight + bounds.height) - 0.5));
        imageLayer.style.setProperty('--hero-parallax-y', `${progress * -34}px`);
      });
    };
    updateParallax();
    window.addEventListener('scroll', updateParallax, { passive: true });
    window.addEventListener('resize', updateParallax);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('scroll', updateParallax);
      window.removeEventListener('resize', updateParallax);
    };
  }, [activeIndex, slides]);

  if (slides.length === 0) return null;

  const activeSlide = slides[activeIndex] || slides[0];
  const next = () => setActiveIndex(index => (index + 1) % slides.length);
  const previous = () => setActiveIndex(index => (index - 1 + slides.length) % slides.length);
  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (touchStartX.current === null) return;
    const movement = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(movement) < 45) return;
    setPaused(true);
    if (movement < 0) next();
    else previous();
  };

  return (
    <section
      ref={frameRef}
      data-home-hero
      className="relative isolate h-[calc(88svh_+_var(--site-header-height))] min-h-[calc(580px_+_var(--site-header-height))] max-h-[calc(980px_+_var(--site-header-height))] overflow-hidden bg-black pt-[var(--site-header-height)] text-white md:h-[100svh] md:min-h-[calc(620px_+_var(--site-header-height))]"
      role="region"
      aria-roledescription="carrossel"
      aria-label="Destaques F PAC STORE"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      onTouchStart={event => { touchStartX.current = event.touches[0].clientX; }}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStartX.current = null; }}
    >
      {slides.map((slide, index) => {
        const isActive = index === activeIndex;
        return (
          <div
            key={slide.id}
            className={`absolute inset-x-0 bottom-0 top-[var(--site-header-height)] overflow-hidden transition-opacity duration-700 ease-out motion-reduce:transition-none ${isActive ? 'z-0 opacity-100' : 'pointer-events-none z-0 opacity-0'}`}
            aria-hidden={!isActive}
          >
            <div
              ref={isActive ? imageLayerRef : undefined}
              className="absolute inset-[-42px] will-change-transform"
              style={{ transform: 'translate3d(0, var(--hero-parallax-y, 0px), 0) scale(1.07)' }}
            >
              {slide.media ? (
                <>
                  <MediaSlot key={`desktop-${slide.media.url}`} src={slide.media.url} poster={slide.media.posterUrl} type={slide.media.type} objectFit={slide.media.objectFit} alt={slide.alt} priority={index === 0} className="absolute inset-0 hidden h-full w-full md:block" />
                  {(() => {
                    const mobileMedia = slide.mobileMedia || slide.media!;
                    return <MediaSlot key={`mobile-${mobileMedia.url}`} src={mobileMedia.url} poster={mobileMedia.posterUrl} type={mobileMedia.type} objectFit={mobileMedia.objectFit} alt={slide.alt} priority={index === 0} className="absolute inset-0 h-full w-full md:hidden" />;
                  })()}
                </>
              ) : (
                <img src={slide.image} alt={slide.alt} loading={index === 0 ? 'eager' : 'lazy'} className="absolute inset-0 h-full w-full object-cover" onError={event => { event.currentTarget.src = '/product-visuals/fpac-products-front-v1.webp'; }} />
              )}
            </div>
          </div>
        );
      })}

      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-[10%] z-20 mx-auto flex max-w-[1440px] flex-col items-start px-5 sm:px-10 md:bottom-[12%] md:px-16 lg:px-24">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#f2c400] sm:text-[10px]">{activeSlide.eyebrow}</p>
        <h1 className="mt-3 max-w-3xl text-[clamp(2.5rem,10vw,4.5rem)] font-black uppercase italic leading-[0.88] tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
          {activeSlide.title}
        </h1>
        <Link to={activeSlide.href} className="mt-5 inline-flex min-h-11 items-center gap-3 rounded-sm bg-[#eab308] px-5 py-3 text-[9px] font-black uppercase tracking-[0.18em] text-black transition-colors hover:bg-white sm:mt-6 sm:min-h-12 sm:px-7 sm:text-[10px]">
          Conhecer a coleção <ArrowRight size={16} />
        </Link>
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-6 right-5 z-30 flex items-center gap-3 sm:right-10 md:bottom-10 md:right-16">
          <button type="button" onClick={previous} aria-label="Destaque anterior" className="grid h-10 w-10 place-items-center rounded-full border border-white/45 bg-black/25 text-white backdrop-blur transition-colors hover:border-[#eab308] hover:text-[#eab308]">
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2" role="group" aria-label="Escolher destaque">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Ir para ${slide.eyebrow}`}
                aria-current={index === activeIndex ? 'true' : undefined}
                className={`h-1.5 rounded-full transition-all duration-300 ${index === activeIndex ? 'w-9 bg-[#eab308]' : 'w-2 bg-white/60 hover:bg-white'}`}
              />
            ))}
          </div>
          <button type="button" onClick={next} aria-label="Próximo destaque" className="grid h-10 w-10 place-items-center rounded-full border border-white/45 bg-black/25 text-white backdrop-blur transition-colors hover:border-[#eab308] hover:text-[#eab308]">
            <ChevronRight size={20} />
          </button>
          <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Retomar carrossel' : 'Pausar carrossel'} className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-black/25 text-white backdrop-blur transition-colors hover:border-[#eab308] hover:text-[#eab308]">
            {paused ? <Play size={15} fill="currentColor" /> : <Pause size={15} fill="currentColor" />}
          </button>
        </div>
      )}

      <span className="sr-only" aria-live="polite">{activeSlide.eyebrow}: {activeSlide.title}</span>
    </section>
  );
}
