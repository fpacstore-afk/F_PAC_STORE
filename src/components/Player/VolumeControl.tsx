import React from 'react';
import { Volume2, Volume1, VolumeX } from 'lucide-react';

interface VolumeControlProps {
  volume: number;
  isMuted: boolean;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
}

export function VolumeControl({ volume, isMuted, setVolume, toggleMute }: VolumeControlProps) {
  const currentVolume = isMuted ? 0 : volume;

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setVolume(Math.min(1, volume + 0.1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setVolume(Math.max(0, volume - 0.1));
    }
  };

  return (
    <div className="flex items-center gap-1 sm:gap-1.5 group/volume select-none shrink-0" id="music_player_volume_control">
      {/* Icon button */}
      <button
        onClick={toggleMute}
        aria-label={isMuted ? "Ativar som" : "Desativar som"}
        title={isMuted ? "Ativar som" : "Desativar som"}
        className="text-white/60 hover:text-white transition-colors cursor-pointer p-1 shrink-0"
      >
        {isMuted || volume === 0 ? (
          <VolumeX size={15} className="text-[#f7c600]" />
        ) : volume < 0.4 ? (
          <Volume1 size={15} />
        ) : (
          <Volume2 size={15} />
        )}
      </button>

      {/* Slide Container */}
      <div className="relative w-12 sm:w-16 h-4 flex items-center shrink-0">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={currentVolume}
          onChange={handleVolumeChange}
          onKeyDown={handleKeyDown}
          aria-label="Controle de volume"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        {/* Track slider visual */}
        <div className="w-full h-[2.5px] bg-white/10 rounded-none relative overflow-hidden transition-all group-hover/volume:h-[4px]">
          <div 
            className="absolute top-0 left-0 h-full bg-[#f7c600]"
            style={{ width: `${currentVolume * 100}%` }}
          />
        </div>
        {/* Thumb indicator */}
        <div 
          className="absolute w-2 h-2 bg-white border border-[#f7c600] pointer-events-none rounded-none scale-0 group-hover/volume:scale-100 transition-transform"
          style={{ left: `calc(${currentVolume * 100}% - 4px)` }}
        />
      </div>
    </div>
  );
}

export default VolumeControl;
