import React from 'react';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  seek: (time: number) => void;
}

export function ProgressBar({ currentTime, duration, seek }: ProgressBarProps) {
  const formatTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '00:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const percentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    seek(time);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      seek(currentTime + 5);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seek(currentTime - 5);
    }
  };

  return (
    <div className="flex items-center gap-2.5 w-full text-[9px] font-mono select-none" id="music_player_progressbar">
      {/* Elapsed time */}
      <span className="text-white/40 tracking-wider text-right w-8 shrink-0">
        {formatTime(currentTime)}
      </span>

      {/* Progress Slider track */}
      <div className="relative flex-1 group h-4 flex items-center">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleSliderChange}
          onKeyDown={handleKeyDown}
          aria-label="Barra de Progresso da Música"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        {/* Custom Track Background */}
        <div className="w-full h-[3px] bg-white/10 rounded-none relative overflow-hidden transition-all group-hover:h-[5px]">
          {/* Custom Track Filled Area */}
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#f7c600] to-yellow-400"
            style={{ width: `${percentage}%` }}
          />
        </div>
        {/* Slider Thumb Handle Indicator */}
        <div 
          className="absolute w-2.5 h-2.5 bg-white border border-[#f7c600] pointer-events-none rounded-none scale-0 group-hover:scale-100 focus-within:scale-100 transition-transform shadow-lg"
          style={{ left: `calc(${percentage}% - 5px)` }}
        />
      </div>

      {/* Duration time */}
      <span className="text-white/40 tracking-wider w-8 shrink-0">
        {formatTime(duration)}
      </span>
    </div>
  );
}

export default ProgressBar;
