import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Play } from 'lucide-react';
import { Design } from '../types/design';
import { getDesignImage } from '../lib/stampCatalog';
import { getOptimizedVideoUrl } from '../services/cloudinary';
import { cn } from '../lib/utils';

interface StampMediaProps {
  design: Design;
  className?: string;
  imageClassName?: string;
}

export function StampMedia({ design, className, imageClassName }: StampMediaProps) {
  const image = getDesignImage(design);
  const video = getOptimizedVideoUrl(design.videoUrl);
  const [mode, setMode] = useState<'image' | 'video'>(image ? 'image' : 'video');

  useEffect(() => setMode(image ? 'image' : 'video'), [design.id, image]);

  return (
    <div className={cn('relative overflow-hidden bg-neutral-100', className)}>
      {mode === 'video' && video ? (
        <video
          src={video}
          poster={image || undefined}
          controls
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-contain bg-black"
        />
      ) : image ? (
        <img
          src={image}
          alt={design.name}
          loading="lazy"
          className={cn('h-full w-full object-contain', imageClassName)}
        />
      ) : (
        <div className="flex h-full min-h-44 items-center justify-center text-[10px] font-black uppercase tracking-widest text-black/35">
          Sem mídia cadastrada
        </div>
      )}

      {image && video && (
        <div className="absolute bottom-2 right-2 z-10 flex overflow-hidden border border-white/20 bg-black/90 shadow-lg">
          <button type="button" onClick={() => setMode('image')} className={cn('flex items-center gap-1 px-2 py-1.5 text-[8px] font-black uppercase tracking-wider', mode === 'image' ? 'bg-[#eab308] text-black' : 'text-white')}>
            <ImageIcon size={11} /> Imagem
          </button>
          <button type="button" onClick={() => setMode('video')} className={cn('flex items-center gap-1 px-2 py-1.5 text-[8px] font-black uppercase tracking-wider', mode === 'video' ? 'bg-[#eab308] text-black' : 'text-white')}>
            <Play size={11} /> Vídeo
          </button>
        </div>
      )}
    </div>
  );
}
