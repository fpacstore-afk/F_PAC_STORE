import React, { useEffect, useRef, useState } from 'react';
import { isMediaVideo } from '../lib/utils';

export interface MediaSlotProps {
  src?: string | null;
  poster?: string | null;
  type?: 'image' | 'video' | 'auto';
  objectFit?: 'cover' | 'contain';
  alt?: string;
  className?: string;
  priority?: boolean;
}

export const MediaSlot: React.FC<MediaSlotProps> = ({
  src,
  poster,
  type = 'auto',
  objectFit = 'cover',
  alt = 'F PAC STORE Media',
  className = 'w-full h-full',
  priority = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [hasVideoError, setHasVideoError] = useState<boolean>(false);
  const [hasImageError, setHasImageError] = useState<boolean>(false);

  const mediaUrl = (src && src.trim()) || '';
  const posterUrl = (poster && poster.trim()) || '';

  // Determine if media is video
  const isVideo = type === 'video' || (type === 'auto' && mediaUrl ? isMediaVideo(mediaUrl) : false);
  const showVideo = isVideo && mediaUrl && !hasVideoError;

  // IntersectionObserver for autoplay / pause on viewport entry / exit
  useEffect(() => {
    if (!showVideo || !containerRef.current) return;

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
  }, [showVideo, mediaUrl]);

  const fitClass = objectFit === 'contain' ? 'object-contain' : 'object-cover';

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`}>
      {showVideo ? (
        <video
          ref={videoRef}
          src={mediaUrl}
          poster={posterUrl || undefined}
          autoPlay
          loop
          muted
          playsInline
          controls={false}
          preload={priority ? 'auto' : 'metadata'}
          onError={() => setHasVideoError(true)}
          className={`w-full h-full ${fitClass} block pointer-events-none select-none`}
        />
      ) : !hasImageError && (mediaUrl || posterUrl) ? (
        <img
          src={mediaUrl || posterUrl}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          onError={() => setHasImageError(true)}
          className={`w-full h-full ${fitClass} block pointer-events-none select-none`}
        />
      ) : (
        <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-neutral-600 font-mono text-xs">
          [Sem Mídia]
        </div>
      )}
    </div>
  );
};
