import React from 'react';
import { Play, Pause, SkipForward, SkipBack, Repeat, Shuffle, ListMusic } from 'lucide-react';

interface PlayerControlsProps {
  isPlaying: boolean;
  isLooping: boolean;
  isShuffling: boolean;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleLoop: () => void;
  toggleShuffle: () => void;
  playlistOpen: boolean;
  setPlaylistOpen: (open: boolean) => void;
}

export function PlayerControls({
  isPlaying,
  isLooping,
  isShuffling,
  togglePlay,
  nextTrack,
  prevTrack,
  toggleLoop,
  toggleShuffle,
  playlistOpen,
  setPlaylistOpen
}: PlayerControlsProps) {
  return (
    <div className="flex items-center gap-1.5 sm:gap-2.5 select-none" id="music_player_controls">
      {/* Shuffle Button */}
      <button
        onClick={toggleShuffle}
        aria-label={isShuffling ? "Desativar ordem aleatória" : "Ativar ordem aleatória"}
        title="Ordem Aleatória"
        className={`p-1 sm:p-1.5 transition-colors relative cursor-pointer ${
          isShuffling 
            ? 'text-[#f7c600] hover:text-[#f7c600]/80' 
            : 'text-white/40 hover:text-white/80'
        }`}
      >
        <Shuffle size={14} />
        {isShuffling && (
          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-[#f7c600]" />
        )}
      </button>

      {/* Prev Track Button */}
      <button
        onClick={prevTrack}
        aria-label="Música anterior"
        title="Música Anterior"
        className="text-white/60 hover:text-white transition-colors cursor-pointer p-1 sm:p-1.5"
      >
        <SkipBack size={16} />
      </button>

      {/* Play/Pause Button */}
      <button
        onClick={togglePlay}
        aria-label={isPlaying ? "Pausar música" : "Tocar música"}
        title={isPlaying ? "Pause" : "Play"}
        className="w-8 h-8 rounded-full bg-white text-black hover:bg-[#f7c600] hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-md shrink-0"
      >
        {isPlaying ? (
          <Pause size={14} fill="currentColor" strokeWidth={0} />
        ) : (
          <Play size={14} className="ml-0.5" fill="currentColor" strokeWidth={0} />
        )}
      </button>

      {/* Next Track Button */}
      <button
        onClick={nextTrack}
        aria-label="Próxima música"
        title="Próxima Música"
        className="text-white/60 hover:text-white transition-colors cursor-pointer p-1 sm:p-1.5"
      >
        <SkipForward size={16} />
      </button>

      {/* Loop Button */}
      <button
        onClick={toggleLoop}
        aria-label={isLooping ? "Desativar repetição" : "Repetir música atual"}
        title="Repetir Música"
        className={`p-1 sm:p-1.5 transition-colors relative cursor-pointer ${
          isLooping 
            ? 'text-[#f7c600] hover:text-[#f7c600]/80' 
            : 'text-white/40 hover:text-white/80'
        }`}
      >
        <Repeat size={14} />
        {isLooping && (
          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-0.5 h-0.5 rounded-full bg-[#f7c600]" />
        )}
      </button>

      {/* Playlist Toggle */}
      <button
        onClick={() => setPlaylistOpen(!playlistOpen)}
        aria-label="Abrir playlist"
        title="Playlist"
        className={`p-1 sm:p-1.5 transition-colors relative cursor-pointer ${
          playlistOpen 
            ? 'text-[#f7c600] hover:text-[#f7c600]/80' 
            : 'text-white/40 hover:text-white/80'
        }`}
      >
        <ListMusic size={14} />
      </button>
    </div>
  );
}

export default PlayerControls;
