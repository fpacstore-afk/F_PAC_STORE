import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { Estampa } from '../types/estampas';
import { useVideoIntersection } from '../hooks/useVideoIntersection';
import { CloudinaryVideoPlayer } from './CloudinaryVideoPlayer';

interface EstampaCardProps {
  estampa: Estampa;
  isHighlight: boolean;
  index: number;
  onClick: () => void;
}

export const EstampaCard: React.FC<EstampaCardProps> = ({
  estampa,
  isHighlight,
  index,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const { containerRef, isNearViewport, isActiveOnMobile } = useVideoIntersection();

  // Detect coarse pointers (touchscreens) to distinguish mobile/tablet vs desktop
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkMobile = () => {
      const hasTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
      setIsMobile(hasTouch);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Get all videos in sorted order
  const playlist = React.useMemo(() => {
    if (estampa.videos && estampa.videos.length > 0) {
      return [...estampa.videos].sort((a, b) => a.order - b.order);
    }
    if (estampa.video) {
      return [estampa.video];
    }
    return [];
  }, [estampa.videos, estampa.video]);

  const hasVideos = playlist.length > 0;

  // Play video on mobile when card is highly visible (60%), or on desktop when hovered
  const isPlaying = hasVideos ? (isMobile ? isActiveOnMobile : isHovered) : false;

  // The video is considered fully active and visible only when isPlaying is true and the video is loaded
  const isVideoShowing = hasVideos && isPlaying && isVideoReady;

  const imgUrl = estampa.image || estampa.path || '/estampas/logo-fpac.png';

  const handleMouseEnter = () => {
    if (!isMobile) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isMobile) {
      setIsHovered(false);
    }
  };

  if (isHighlight) {
    return (
      <motion.div 
        ref={containerRef}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "flex flex-col group transition-all duration-500 overflow-hidden relative cursor-pointer rounded-2xl md:rounded-3xl bg-white border border-neutral-100",
          "ring-1 ring-[#eab308]/20 shadow-[0_4px_30px_rgba(234,179,8,0.06)] md:scale-[1.01] hover:scale-[1.03] z-10 hover:ring-[#eab308]/60 hover:border-amber-500/30"
        )}
        onClick={onClick}
      >
        <div className="aspect-[16/10] sm:aspect-[16/9] md:aspect-[4/3] lg:aspect-[16/9] bg-[#fdfdfd] overflow-hidden relative">
          
          {/* Layer 1: Image Wrapper (Maintains current look exactly) */}
          <div 
            className={cn(
              "absolute inset-0 flex items-center justify-center p-6 sm:p-8 md:p-12 transition-all duration-700",
              isVideoShowing ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
            )}
          >
            <img 
              src={imgUrl}
              alt={estampa.name}
              className="w-full h-full object-contain"
              loading="lazy"
            />
          </div>

          {/* Layer 2: Video Wrapper (Independent, occupies 92%-95% of card area, centered) */}
          {hasVideos && (
            <div 
              className={cn(
                "absolute inset-0 flex items-center justify-center transition-all duration-700",
                "p-1 sm:p-1.5 md:p-2", // Less padding so video occupies 92% to 95% of the card area
                isVideoShowing ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
              )}
            >
              <CloudinaryVideoPlayer
                playlist={playlist}
                isActive={isPlaying}
                isNearViewport={isNearViewport}
                onVideoReady={setIsVideoReady}
                className="rounded-xl md:rounded-2xl border-0 p-0 m-0"
              />
            </div>
          )}

          <div className="absolute inset-0 border-[6px] border-[#eab308]/0 group-hover:border-[#eab308]/5 transition-all duration-700 pointer-events-none" />
        </div>
        
        <div className="p-5 border-t border-neutral-100 bg-white z-10">
          <h3 className="text-base font-black uppercase tracking-tight italic text-zinc-950 group-hover:text-[#eab308] transition-colors leading-none mb-1.5">{estampa.name}</h3>
          <p className="text-[10px] text-gray-500 leading-relaxed uppercase tracking-wider line-clamp-2">{estampa.description}</p>
        </div>
      </motion.div>
    );
  }

  // Normal Gallery Card
  return (
    <motion.div 
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.03 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "flex flex-col group transition-all duration-500 overflow-hidden relative cursor-pointer border border-neutral-150 hover:border-black/20 rounded-2xl md:rounded-3xl bg-white hover:shadow-lg"
      )}
      onClick={onClick}
    >
      <div className="aspect-square bg-[#fdfdfd] overflow-hidden relative">
        
        {/* Layer 1: Image Wrapper (Maintains current look exactly) */}
        <div 
          className={cn(
            "absolute inset-0 flex items-center justify-center p-4 sm:p-5 md:p-6 transition-all duration-700",
            isVideoShowing ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
          )}
        >
          <img 
            src={imgUrl}
            alt={estampa.name}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        </div>

        {/* Layer 2: Video Wrapper (Independent, occupies 92%-95% of card area, centered) */}
        {hasVideos && (
          <div 
            className={cn(
              "absolute inset-0 flex items-center justify-center transition-all duration-700",
              "p-0.5 sm:p-1 md:p-1.5", // Minimal padding so video occupies 92% to 95% of the card area
              isVideoShowing ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
            )}
          >
            <CloudinaryVideoPlayer
              playlist={playlist}
              isActive={isPlaying}
              isNearViewport={isNearViewport}
              onVideoReady={setIsVideoReady}
              className="rounded-xl md:rounded-2xl border-0 p-0 m-0"
            />
          </div>
        )}

        <div className="absolute inset-2 border border-white/0 group-hover:border-[#eab308]/20 transition-all duration-500 pointer-events-none" />
      </div>

      <div className="p-3 border-t border-neutral-100 bg-white z-10">
        <h4 className="text-[11px] font-black uppercase tracking-tight text-neutral-900 group-hover:text-[#eab308] transition-colors leading-tight line-clamp-1">{estampa.name}</h4>
        <p className="text-[8.5px] text-neutral-400 uppercase tracking-widest line-clamp-1 mt-0.5">{estampa.description}</p>
      </div>
    </motion.div>
  );
};
