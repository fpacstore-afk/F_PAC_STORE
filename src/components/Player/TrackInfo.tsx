import React from 'react';
import { Disc } from 'lucide-react';
import { Track } from '../../types/music';

interface TrackInfoProps {
  track: Track | null;
  isPlaying: boolean;
}

export function TrackInfo({ track, isPlaying }: TrackInfoProps) {
  if (!track) {
    return (
      <div className="flex items-center gap-3 min-w-0" id="music_player_track_info_empty">
        <div className="w-12 h-12 bg-black/40 border border-white/5 flex items-center justify-center text-white/20">
          <Disc size={20} className="animate-spin" style={{ animationDuration: '6s' }} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">F PAC SOUND</p>
          <p className="text-xs font-black uppercase tracking-wider text-white/50 truncate">Nenhuma Faixa Selecionada</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 min-w-0" id={`music_player_track_info_${track.id}`}>
      {/* Album Cover Art */}
      <div className="relative group shrink-0">
        <div className="w-12 h-12 border border-white/10 overflow-hidden relative bg-black/40">
          {track.cover ? (
            <img 
              src={track.cover} 
              alt={track.album || 'Album Cover'} 
              className={`w-full h-full object-cover transition-transform duration-700 ${isPlaying ? 'rotate-infinite' : ''}`}
              style={{ animation: isPlaying ? 'spin 12s linear infinite' : 'none' }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-black/80">
              <Disc size={18} className="text-white/40" />
            </div>
          )}
          
          {/* Subtle overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
        </div>

        {/* Dynamic equalizer lines when playing */}
        {isPlaying && (
          <div className="absolute bottom-1 right-1 flex items-end gap-0.5 bg-black/70 px-1 py-0.5 rounded-[1px] h-3">
            <span className="w-0.5 h-full bg-[#f7c600] origin-bottom animate-[equalizer_0.8s_ease-to-peak_infinite_alternate]" />
            <span className="w-0.5 h-full bg-[#f7c600] origin-bottom animate-[equalizer_1.2s_ease-to-peak_infinite_alternate_0.3s]" />
            <span className="w-0.5 h-full bg-[#f7c600] origin-bottom animate-[equalizer_0.9s_ease-to-peak_infinite_alternate_0.1s]" />
          </div>
        )}
      </div>

      {/* Details (Track name / Artist) */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[8px] font-black uppercase tracking-widest bg-[#f7c600]/10 text-[#f7c600] px-1 py-0.5 rounded-none shrink-0">
            {track.category || 'URBAN'}
          </span>
          <span className="text-[8px] font-black tracking-wider text-white/40 uppercase truncate">
            {track.album || 'Single'}
          </span>
        </div>
        <p className="text-xs font-black uppercase tracking-wider text-white truncate leading-tight mt-0.5">
          {track.title}
        </p>
        <p className="text-[10px] font-bold text-[#f7c600] uppercase tracking-widest truncate leading-none mt-0.5 opacity-80">
          {track.artist}
        </p>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes equalizer {
          0% { transform: scaleY(0.15); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

export default TrackInfo;
