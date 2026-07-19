import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  RotateCcw, Shuffle, ListMusic, Music, Radio, Volume1, Clock
} from 'lucide-react';
import { useMusicPlayer } from '../hooks/useMusicPlayer';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function RadioPage() {
  const {
    currentTrack,
    isPlaying,
    volume,
    isMuted,
    isLooping,
    isShuffling,
    currentTime,
    duration,
    isLoading,
    filteredTracks,
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    setVolume,
    toggleMute,
    toggleLoop,
    toggleShuffle,
    seek
  } = useMusicPlayer();

  const [hoverProgress, setHoverProgress] = useState<number | null>(null);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    seek(percentage * duration);
  };

  const currentPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#ffffff] text-black pt-24 pb-16 px-4 md:px-8 max-w-7xl mx-auto flex flex-col justify-start">
      {/* Page Header */}
      <div className="border-b border-black/10 pb-6 mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 block mb-2">PRODUTO OFICIAL BRAND</span>
          <h1 className="text-4xl font-black uppercase tracking-tight text-black flex items-center gap-3">
            F PAC RADIO <span className="text-xs bg-red-600 text-white px-2.5 py-1 font-black uppercase tracking-widest animate-pulse">AO VIVO</span>
          </h1>
        </div>
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest max-w-md leading-relaxed md:text-right">
          Sintonize a identidade F PAC através da música. Uma curadoria autoral de batidas, ritmos e sons urbanos criada para guiar sua experiência no site.
        </p>
      </div>

      {filteredTracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-gray-300 p-8 rounded-none">
          <Radio size={40} className="text-gray-300 mb-4 animate-bounce" />
          <h3 className="text-sm font-black uppercase tracking-widest text-black mb-1">Rádio Fora do Ar</h3>
          <p className="text-xs text-gray-500 max-w-sm font-medium mb-6">Não há nenhuma música ativa no catálogo no momento. Administradores podem adicionar músicas pelo Painel.</p>
          <Link to="/admin" className="bg-black text-[#eab308] px-6 py-3 text-[10px] font-black uppercase tracking-widest hover:text-white transition-all">
            Ir para Gestão
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: Current Track Player Stage */}
          <div className="lg:col-span-7 bg-black text-white p-6 md:p-8 border border-white/5 shadow-2xl relative overflow-hidden flex flex-col">
            
            {/* Visual Equalizer Canvas Background Effect */}
            <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-red-600 via-[#eab308] to-black z-10" />

            {/* Stage Title */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <Radio size={14} className="text-[#eab308]" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#eab308]">Tocando Agora</span>
              </div>
              <span className="text-[9px] font-mono text-gray-500 uppercase">
                {filteredTracks.findIndex(t => t.id === currentTrack?.id) + 1} / {filteredTracks.length} MÚSICAS
              </span>
            </div>

            {/* Main Audio Waveform and Cover Layout */}
            <div className="flex flex-col md:flex-row gap-6 items-center mb-8">
              {/* Cover Art Wrapper */}
              <div className="relative w-48 h-48 md:w-56 md:h-56 bg-neutral-900 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center shadow-lg group">
                {currentTrack?.cover ? (
                  <img
                    src={currentTrack.cover}
                    alt={currentTrack?.title}
                    className={cn(
                      "w-full h-full object-cover transition-all duration-1000",
                      isPlaying ? "scale-105 duration-1000 rotate-[4deg]" : "scale-100"
                    )}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Music size={48} className="text-neutral-700 group-hover:text-neutral-400 transition-colors" />
                )}

                {/* Animated Record Center Label */}
                {isPlaying && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-black/80 border border-white/20 flex items-center justify-center animate-spin" style={{ animationDuration: '6s' }}>
                      <div className="w-2 h-2 rounded-full bg-[#eab308]" />
                    </div>
                  </div>
                )}
              </div>

              {/* Title & Stats */}
              <div className="flex-1 w-full text-center md:text-left flex flex-col justify-between h-full">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#eab308] bg-[#eab308]/10 px-2 py-1 inline-block mb-3">
                    {currentTrack?.category || 'SINTONIA F PAC'}
                  </span>
                  <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-white leading-tight mb-2 truncate">
                    {currentTrack?.title}
                  </h2>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-4 truncate">
                    {currentTrack?.artist || 'F PAC SOUND'}
                  </p>
                </div>

                {/* Animated spectrum bar indicator */}
                <div className="h-6 flex items-end gap-[3px] justify-center md:justify-start overflow-hidden mt-2 opacity-80">
                  {isPlaying ? (
                    Array.from({ length: 15 }).map((_, i) => {
                      const heights = ['h-2', 'h-5', 'h-3', 'h-6', 'h-4', 'h-1', 'h-4', 'h-6', 'h-2', 'h-5', 'h-3', 'h-6', 'h-4', 'h-2', 'h-5'];
                      const delays = ['0s', '0.2s', '0.4s', '0.1s', '0.3s', '0.5s', '0.2s', '0.4s', '0.1s', '0.3s', '0.5s', '0.2s', '0.4s', '0.1s', '0.3s'];
                      return (
                        <span 
                          key={i} 
                          className={cn("w-[2px] bg-[#eab308] animate-[bounce_0.8s_infinite]")} 
                          style={{ 
                            animationDelay: delays[i % delays.length],
                            height: heights[i % heights.length].replace('h-', '') + 'px'
                          }} 
                        />
                      );
                    })
                  ) : (
                    Array.from({ length: 15 }).map((_, i) => (
                      <span key={i} className="w-[2px] h-[3px] bg-neutral-800" />
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* PROGRESS SLIDER */}
            <div className="mb-6">
              <div 
                className="relative h-2 bg-neutral-800 cursor-pointer overflow-hidden border border-white/5"
                onClick={handleProgressClick}
              >
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-[#eab308] transition-all"
                  style={{ width: `${currentPercentage}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono text-gray-400 uppercase tracking-widest mt-2">
                <span>{formatTime(currentTime)}</span>
                {isLoading ? (
                  <span className="text-[#eab308] animate-pulse">Sintonizando...</span>
                ) : (
                  <span>-{formatTime(duration - currentTime)}</span>
                )}
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* AUDIO CONTROLS PANEL */}
            <div className="flex flex-col md:flex-row gap-6 items-center justify-between border-t border-white/10 pt-6">
              
              {/* Playback Buttons */}
              <div className="flex items-center gap-4">
                {/* Shuffle */}
                <button 
                  onClick={toggleShuffle}
                  className={cn(
                    "p-2 rounded-none transition-colors",
                    isShuffling ? "text-[#eab308]" : "text-gray-500 hover:text-white"
                  )}
                  title="Embaralhar"
                >
                  <Shuffle size={16} />
                </button>

                {/* Back */}
                <button 
                  onClick={prevTrack}
                  className="p-2 rounded-none text-gray-400 hover:text-white transition-colors"
                  title="Anterior"
                >
                  <SkipBack size={18} fill="currentColor" />
                </button>

                {/* Big Main Play/Pause */}
                <button 
                  onClick={togglePlay}
                  disabled={isLoading}
                  className={cn(
                    "w-12 h-12 flex items-center justify-center transition-all bg-white text-black hover:scale-105 active:scale-95",
                    isLoading ? "opacity-50 cursor-wait" : "opacity-100"
                  )}
                >
                  {isPlaying ? (
                    <Pause size={20} fill="currentColor" className="text-black" />
                  ) : (
                    <Play size={20} fill="currentColor" className="text-black ml-0.5" />
                  )}
                </button>

                {/* Forward */}
                <button 
                  onClick={nextTrack}
                  className="p-2 rounded-none text-gray-400 hover:text-white transition-colors"
                  title="Próxima"
                >
                  <SkipForward size={18} fill="currentColor" />
                </button>

                {/* Loop */}
                <button 
                  onClick={toggleLoop}
                  className={cn(
                    "p-2 rounded-none transition-colors",
                    isLooping ? "text-[#eab308]" : "text-gray-500 hover:text-white"
                  )}
                  title="Repetir Música"
                >
                  <RotateCcw size={16} />
                </button>
              </div>

              {/* Volume Slider Panel */}
              <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0 border-t md:border-t-0 border-white/5 pt-4 md:pt-0">
                <button onClick={toggleMute} className="text-gray-400 hover:text-white transition-colors p-1">
                  {isMuted || volume === 0 ? (
                    <VolumeX size={16} />
                  ) : volume < 0.4 ? (
                    <Volume1 size={16} />
                  ) : (
                    <Volume2 size={16} />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-full md:w-24 h-1 bg-neutral-800 rounded-none appearance-none cursor-pointer accent-[#eab308]"
                />
              </div>

            </div>

          </div>

          {/* RIGHT: Playlist Catalog & Selection */}
          <div className="lg:col-span-5 flex flex-col h-full">
            <div className="bg-neutral-50 border border-black/5 p-5 md:p-6 flex-1 flex flex-col">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-black/10 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <ListMusic size={15} className="text-black" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-black">PLAYLIST ATIVA ({filteredTracks.length})</span>
                </div>
                <div className="flex items-center gap-1.5 text-[8.5px] font-bold text-gray-500 uppercase tracking-widest">
                  <Clock size={11} />
                  <span>Duração Total: {formatTime(filteredTracks.reduce((acc, t) => acc + (t.duration || 0), 0))}</span>
                </div>
              </div>

              {/* Tracks Scroll Wrapper */}
              <div className="space-y-2 overflow-y-auto max-h-[380px] pr-1 scrollbar-thin">
                {filteredTracks.map((track, index) => {
                  const isActive = currentTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      onClick={() => playTrack(track)}
                      className={cn(
                        "group cursor-pointer p-2.5 flex items-center justify-between border transition-all hover:bg-black hover:text-white",
                        isActive 
                          ? "bg-black text-white border-black shadow" 
                          : "bg-white text-black border-black/5"
                      )}
                    >
                      {/* Left: Indicator & Cover & Text */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Number or sound wave icon */}
                        <div className="w-5 shrink-0 text-center">
                          {isActive && isPlaying ? (
                            <div className="flex items-end gap-[1.5px] h-2.5 justify-center">
                              <span className="w-[1.5px] h-full bg-[#eab308] animate-[bounce_0.8s_infinite]" />
                              <span className="w-[1.5px] h-2/3 bg-[#eab308] animate-[bounce_0.8s_infinite] [animation-delay:0.2s]" />
                              <span className="w-[1.5px] h-1/2 bg-[#eab308] animate-[bounce_0.8s_infinite] [animation-delay:0.4s]" />
                            </div>
                          ) : (
                            <span className={cn(
                              "text-[10px] font-mono",
                              isActive ? "text-[#eab308] font-bold" : "text-gray-400 group-hover:text-white/40"
                            )}>
                              {String(index + 1).padStart(2, '0')}
                            </span>
                          )}
                        </div>

                        {/* Miniature Cover */}
                        <div className="w-8 h-8 shrink-0 bg-neutral-900 border border-black/5 flex items-center justify-center overflow-hidden">
                          {track.cover ? (
                            <img src={track.cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Music size={12} className={cn(isActive ? "text-white" : "text-gray-400")} />
                          )}
                        </div>

                        {/* Metadata titles */}
                        <div className="min-w-0 pr-2">
                          <p className={cn(
                            "text-[10px] font-black uppercase tracking-wider truncate leading-tight",
                            isActive ? "text-white" : "text-black group-hover:text-white"
                          )}>
                            {track.title}
                          </p>
                          <p className={cn(
                            "text-[8.5px] font-bold tracking-wider uppercase truncate leading-none mt-1",
                            isActive ? "text-[#eab308]" : "text-gray-400 group-hover:text-[#eab308]"
                          )}>
                            {track.artist || 'F PAC SOUND'}
                          </p>
                        </div>
                      </div>

                      {/* Right: duration, categories */}
                      <div className="flex items-center gap-3 shrink-0">
                        {track.category && (
                          <span className={cn(
                            "text-[7px] font-black uppercase tracking-widest border px-1.5 py-0.5",
                            isActive 
                              ? "border-[#eab308]/20 text-[#eab308] bg-[#eab308]/5" 
                              : "border-black/5 text-gray-400 group-hover:border-white/10 group-hover:text-gray-300"
                          )}>
                            {track.category}
                          </span>
                        )}
                        <span className={cn(
                          "text-[9px] font-mono",
                          isActive ? "text-[#eab308] font-bold" : "text-gray-400 group-hover:text-white"
                        )}>
                          {formatTime(track.duration || 0)}
                        </span>
                      </div>

                    </div>
                  );
                })}
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  );
}
