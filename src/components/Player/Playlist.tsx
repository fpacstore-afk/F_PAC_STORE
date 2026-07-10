import React from 'react';
import { Play, Pause, Disc, X, Radio } from 'lucide-react';
import { Track } from '../../types/music';

interface PlaylistProps {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  activePlaylist: string;
  playlists: string[];
  playTrack: (track: Track) => void;
  setActivePlaylist: (playlist: string) => void;
  onClose: () => void;
}

export function Playlist({
  tracks,
  currentTrack,
  isPlaying,
  activePlaylist,
  playlists,
  playTrack,
  setActivePlaylist,
  onClose
}: PlaylistProps) {
  const formatDuration = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '00:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Filter track list (show all active tracks without divisions)
  const displayedTracks = tracks.filter(t => t.active);

  return (
    <div 
      className="bg-black/95 backdrop-blur-md border border-white/10 p-4 w-full sm:max-w-xs flex flex-col max-h-[350px] shadow-2xl overflow-hidden rounded-none text-white" 
      id="music_player_playlist_container"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-3">
        <div className="flex items-center gap-1.5">
          <Radio size={12} className="text-[#f7c600] animate-pulse" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">F PAC SOUNDLIST</h3>
        </div>
        <button 
          onClick={onClose}
          aria-label="Fechar lista de músicas"
          className="text-white/40 hover:text-white transition-colors cursor-pointer p-0.5"
        >
          <X size={14} />
        </button>
      </div>

      {/* Tracks Scrollable Box */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 scrollbar-thin scrollbar-thumb-white/10">
        {displayedTracks.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Nenhuma música ativa nesta playlist</p>
          </div>
        ) : (
          displayedTracks.map((track, index) => {
            const isCurrent = currentTrack?.id === track.id;
            return (
              <button
                key={track.id}
                onClick={() => playTrack(track)}
                className={`w-full flex items-center gap-2.5 p-2 rounded-none transition-all text-left border ${
                  isCurrent 
                    ? 'bg-white/5 border-[#f7c600]/30 text-white' 
                    : 'bg-transparent border-transparent text-white/60 hover:bg-white/[0.02] hover:text-white'
                }`}
              >
                {/* Visual state icon / index */}
                <div className="w-6 h-6 flex items-center justify-center shrink-0">
                  {isCurrent ? (
                    isPlaying ? (
                      <div className="flex items-end gap-0.5 h-3">
                        <span className="w-0.5 h-full bg-[#f7c600] origin-bottom animate-[equalizer_0.7s_infinite_alternate]" />
                        <span className="w-0.5 h-full bg-[#f7c600] origin-bottom animate-[equalizer_1s_infinite_alternate_0.2s]" />
                        <span className="w-0.5 h-full bg-[#f7c600] origin-bottom animate-[equalizer_0.8s_infinite_alternate_0.1s]" />
                      </div>
                    ) : (
                      <Play size={10} className="text-[#f7c600]" fill="currentColor" />
                    )
                  ) : (
                    <span className="text-[8px] font-mono text-white/30">
                      {(index + 1).toString().padStart(2, '0')}
                    </span>
                  )}
                </div>

                {/* Cover Art */}
                <div className="w-7 h-7 border border-white/5 bg-black/40 overflow-hidden shrink-0">
                  {track.cover ? (
                    <img 
                      src={track.cover} 
                      alt={track.title} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Disc size={10} className="text-white/20" />
                    </div>
                  )}
                </div>

                {/* Text Metadata */}
                <div className="min-w-0 flex-1">
                  <p className={`text-[10px] font-black uppercase tracking-wide truncate ${isCurrent ? 'text-[#f7c600]' : ''}`}>
                    {track.title}
                  </p>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/40 truncate mt-0.5">
                    {track.artist}
                  </p>
                </div>

                {/* Duration */}
                <span className="text-[8px] font-mono text-white/30 shrink-0">
                  {formatDuration(track.duration)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default Playlist;
