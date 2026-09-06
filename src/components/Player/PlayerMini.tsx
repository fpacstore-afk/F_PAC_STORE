import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, Radio, Volume2, VolumeX, Maximize2, SkipForward } from 'lucide-react';
import { useMusicPlayer } from '../../hooks/useMusicPlayer';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';

export function PlayerMini() {
  const {
    currentTrack,
    isPlaying,
    isMuted,
    isLoading,
    togglePlay,
    toggleMute,
    nextTrack,
    filteredTracks
  } = useMusicPlayer();
  const navigate = useNavigate();

  if (filteredTracks.length === 0 || !currentTrack) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="fixed bottom-24 md:bottom-6 left-6 z-40 bg-black text-white border border-white/10 shadow-[0_15px_50px_-15px_rgba(0,0,0,0.8)] flex items-center p-2 rounded-none max-w-[340px] md:max-w-[400px] gap-3"
    >
      {/* Cover / Animation */}
      <div 
        onClick={() => navigate('/radio')}
        className="relative group cursor-pointer w-12 h-12 shrink-0 bg-neutral-900 border border-white/5 overflow-hidden flex items-center justify-center"
      >
        {currentTrack.cover ? (
          <img
            src={currentTrack.cover}
            alt={currentTrack.title}
            className={cn(
              "w-full h-full object-cover transition-transform duration-700",
              isPlaying ? "scale-105" : "scale-100"
            )}
            referrerPolicy="no-referrer"
          />
        ) : (
          <Radio size={20} className="text-gray-400 group-hover:text-white transition-colors" />
        )}
        
        {/* Hover overlay to expand */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Maximize2 size={14} className="text-white" />
        </div>

        {/* Live indicator dot */}
        <div className="absolute top-1 left-1 flex items-center gap-1 bg-red-600 px-1 py-[1.5px] rounded-none">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
          <span className="text-[6.5px] font-black uppercase tracking-widest text-white">AO VIVO</span>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 pr-1 cursor-pointer" onClick={() => navigate('/radio')}>
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-white truncate leading-tight">
            {currentTrack.title}
          </p>
          {isPlaying && (
            <div className="flex items-end gap-[2px] h-2 shrink-0">
              <span className="w-[1.5px] h-full bg-[#eab308] animate-[bounce_0.8s_infinite]" style={{ animationDelay: '0.1s' }} />
              <span className="w-[1.5px] h-3/4 bg-[#eab308] animate-[bounce_0.8s_infinite]" style={{ animationDelay: '0.3s' }} />
              <span className="w-[1.5px] h-1/2 bg-[#eab308] animate-[bounce_0.8s_infinite]" style={{ animationDelay: '0.5s' }} />
            </div>
          )}
        </div>
        <p className="text-[8.5px] text-gray-400 font-bold tracking-wider uppercase truncate leading-none mt-1">
          {currentTrack.artist || 'F PAC SOUND'}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 border-l border-white/10 pl-2">
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          disabled={isLoading}
          className={cn(
            "p-2 rounded-none transition-all flex items-center justify-center hover:bg-white/5",
            isLoading ? "opacity-50" : "opacity-100 text-white hover:text-[#eab308]"
          )}
          aria-label={isPlaying ? "Pausar" : "Tocar"}
        >
          {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </button>

        {/* Skip */}
        <button
          onClick={nextTrack}
          className="p-2 rounded-none text-gray-400 hover:text-white transition-colors"
          aria-label="Próxima"
        >
          <SkipForward size={14} fill="currentColor" />
        </button>

        {/* Mute */}
        <button
          onClick={toggleMute}
          className="p-2 rounded-none text-gray-400 hover:text-white transition-colors"
          aria-label={isMuted ? "Ativar som" : "Mutar"}
        >
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
      </div>
    </motion.div>
  );
}
