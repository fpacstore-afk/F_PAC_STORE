import React from 'react';
import { Play, Pause, Music } from 'lucide-react';
import { Track } from '../../types/music';

interface PlayerMiniProps {
  track: Track | null;
  isPlaying: boolean;
  togglePlay: (e: React.MouseEvent) => void;
  onExpand: () => void;
}

export function PlayerMini({ track, isPlaying, togglePlay, onExpand }: PlayerMiniProps) {
  return (
    <div
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onExpand();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Expandir player F PAC SOUND"
      className="flex items-center gap-3 bg-black/95 backdrop-blur-md border border-white/10 hover:border-[#f7c600]/40 p-2 pl-2 pr-4 rounded-full shadow-2xl transition-all hover:scale-105 select-none text-white group cursor-pointer max-w-[200px] sm:max-w-xs focus:outline-none focus:ring-2 focus:ring-[#f7c600]/50"
      id="music_player_mini_trigger"
    >
      {/* Spinning Vinyl Disc */}
      <div className="relative w-8 h-8 rounded-full border border-white/10 overflow-hidden shrink-0 bg-black/40 flex items-center justify-center">
        {track?.cover ? (
          <img
            src={track.cover}
            alt={track.title}
            className={`w-full h-full object-cover rounded-full ${isPlaying ? 'rotate-infinite' : ''}`}
            style={{ animation: isPlaying ? 'spin 6s linear infinite' : 'none' }}
            referrerPolicy="no-referrer"
          />
        ) : (
          <Music size={12} className="text-white/40 animate-pulse" />
        )}
        
        {/* Vinyl center hole look */}
        <div className="absolute inset-0 m-auto w-2.5 h-2.5 rounded-full bg-black border border-white/20" />
      </div>

      {/* Track info block */}
      <div className="min-w-0 text-left flex-1">
        <p className="text-[7px] font-black uppercase tracking-widest text-[#f7c600] leading-none mb-0.5">
          {isPlaying ? 'TOCANDO' : 'PAUSADO'}
        </p>
        <p className="text-[10px] font-black uppercase tracking-wide text-white truncate leading-tight group-hover:text-[#f7c600] transition-colors">
          {track ? track.title : 'F PAC SOUND'}
        </p>
        <p className="text-[8px] font-bold uppercase tracking-widest text-white/40 truncate leading-none mt-0.5">
          {track ? track.artist : 'OFFICIAL BRAND SOUND'}
        </p>
      </div>

      {/* Mini Play Action */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          togglePlay(e);
        }}
        aria-label={isPlaying ? "Pausar música" : "Tocar música"}
        className="w-6 h-6 rounded-full bg-[#f7c600] hover:bg-white text-black transition-all flex items-center justify-center cursor-pointer shrink-0"
      >
        {isPlaying ? (
          <Pause size={10} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={10} className="ml-0.5" fill="currentColor" strokeWidth={0} />
        )}
      </button>
    </div>
  );
}

export default PlayerMini;
