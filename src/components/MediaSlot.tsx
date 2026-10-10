import React, { useEffect, useRef, useState } from 'react';
import { getImageFallbackUrls, isMediaVideo } from '../lib/utils';
import { useReducedMotion } from 'framer-motion';

export interface MediaSlotProps {
  src?: string | null;
  poster?: string | null;
  fallbackSrc?: string | null;
  type?: 'image' | 'video' | 'auto';
  objectFit?: 'cover' | 'contain';
  alt?: string;
  className?: string;
  priority?: boolean;
}

export const MediaSlot: React.FC<MediaSlotProps> = ({
  src,
  poster,
  fallbackSrc,
  type = 'auto',
  objectFit = 'cover',
  alt = 'F PAC STORE Media',
  className = 'w-full h-full',
  priority = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduceMotion = useReducedMotion();

  const [hasVideoError, setHasVideoError] = useState<boolean>(false);
  const [hasImageError, setHasImageError] = useState<boolean>(false);
  const [imageAttempt, setImageAttempt] = useState(0);
  useEffect(() => { setHasVideoError(false); setHasImageError(false); setImageAttempt(0); }, [src, poster, type, fallbackSrc]);

  const mediaUrl = (src && src.trim()) || '';
  const posterUrl = (poster && poster.trim()) || '';

  // Determine if media is video
  const isVideo = type === 'video' || (type === 'auto' && mediaUrl ? isMediaVideo(mediaUrl) : false);
  const showVideo = isVideo && mediaUrl && !hasVideoError;
  const imageCandidates = Array.from(new Set([...getImageFallbackUrls(isVideo ? posterUrl : mediaUrl || posterUrl), fallbackSrc?.trim()].filter(Boolean) as string[]));
  useEffect(() => {
    if (!hasImageError || imageAttempt >= imageCandidates.length - 1) return;
    const retry = window.setTimeout(() => { setImageAttempt(current => current + 1); setHasImageError(false); }, 600);
    return () => window.clearTimeout(retry);
  }, [hasImageError, imageAttempt, imageCandidates.length]);

  // IntersectionObserver for autoplay / pause on viewport entry / exit
  useEffect(() => {
    if (!showVideo || !containerRef.current) return;
    if (reduceMotion) { videoRef.current?.pause(); return; }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (videoRef.current) {
            if (entry.isIntersecting) {
              const playPromise = videoRef.current.play();
              if (playPromise !== undefined) {
                playPromise.catch((err) => {
                  console.warn('[MediaSlot] Autoplay prevented:', err);
                });
              }
            } else {
              videoRef.current.pause();
            }
          }
        });
      },
      {
        root: null,
        rootMargin: '100px 0px',
        threshold: 0.1
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [showVideo, mediaUrl, reduceMotion]);

  const fitClass = objectFit === 'contain' ? 'object-contain' : 'object-cover';

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {showVideo ? (
        <video
          ref={videoRef}
          src={mediaUrl}
          poster={posterUrl || undefined}
          autoPlay={!reduceMotion}
          loop
          muted
          playsInline
          controls={!!reduceMotion}
          aria-label={alt}
          preload={priority ? 'auto' : 'metadata'}
          onError={() => setHasVideoError(true)}
          className={`w-full h-full ${fitClass} block ${reduceMotion ? '' : 'pointer-events-none'} select-none`}
        />
      ) : !hasImageError && imageCandidates[imageAttempt] ? (
        <img
          key={`${imageCandidates[imageAttempt]}-${imageAttempt}`}
          src={imageCandidates[imageAttempt]}
          referrerPolicy="no-referrer"
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setHasImageError(true)}
          className={`w-full h-full ${fitClass} block pointer-events-none select-none`}
        />
      ) : (
        <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-neutral-600 font-mono text-xs">
          {mediaUrl ? 'Imagem temporariamente indisponível' : '[Sem Mídia]'}
        </div>
      )}
    </div>
  );
};
