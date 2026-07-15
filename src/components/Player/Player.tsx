import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, ChevronDown, Radio } from 'lucide-react';
import { useMusicPlayer } from '../../hooks/useMusicPlayer';
import { TrackInfo } from './TrackInfo';
import { PlayerControls } from './PlayerControls';
import { ProgressBar } from './ProgressBar';
import { VolumeControl } from './VolumeControl';
import { Playlist } from './Playlist';
import { PlayerMini } from './PlayerMini';
import { toast } from 'react-hot-toast';

export function Player() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isLooping,
    isShuffling,
    activePlaylist,
    playlists,
    filteredTracks,
    playTrack,
    togglePlay,
    nextTrack,
    prevTrack,
    setVolume,
    toggleMute,
    toggleLoop,
    toggleShuffle,
    seek,
    setActivePlaylist,
    playerOpen,
    setPlayerOpen,
    failedTracks
  } = useMusicPlayer();

  const [playlistOpen, setPlaylistOpen] = useState(false);

  const handleMiniTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePlay();
  };

  // Do not render anything if there is no current track (i.e. empty database and no defaults)
  if (!currentTrack) return null;

  const currentTrackIndex = filteredTracks.findIndex(t => t.id === currentTrack.id);
  const trackNumber = currentTrackIndex !== -1 ? currentTrackIndex + 1 : 1;
  const totalTracksCount = filteredTracks.length;

  return (
    <div 
      className="fixed bottom-24 right-6 md:bottom-6 md:right-24 z-40 flex flex-col items-end gap-3 pointer-events-none select-none font-sans" 
      id="f_pac_sound_floating_player_root"
    >
      {/* 1. PLAYLIST DRAWER POPUP */}
      <AnimatePresence>
        {playerOpen && playlistOpen && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="pointer-events-auto"
          >
            <Playlist
              tracks={filteredTracks}
              currentTrack={currentTrack}
              isPlaying={isPlaying}
              activePlaylist={activePlaylist}
              playlists={playlists}
              playTrack={playTrack}
              setActivePlaylist={setActivePlaylist}
              onClose={() => setPlaylistOpen(false)}
              failedTracks={failedTracks}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. MAIN PLAYER BODY */}
      <AnimatePresence mode="wait">
        {!playerOpen ? (
          /* Minimized pill state */
          <motion.div
            key="mini"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto"
          >
            <PlayerMini
              track={currentTrack}
              isPlaying={isPlaying}
              togglePlay={handleMiniTogglePlay}
              onExpand={() => setPlayerOpen(true)}
            />
          </motion.div>
        ) : (
          /* Expanded streetwear control panel state */
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: 'spring', damping: 20, stiffness: 250 }}
            className="pointer-events-auto w-full max-w-[340px] bg-black/95 border-2 border-white/10 text-white p-4 flex flex-col gap-4 shadow-2xl relative rounded-none"
          >
            {/* Fine design top edge border */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-[#f7c600]" />

            {/* Header / Brand + Close Actions */}
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <div className="flex items-center gap-1.5">
                <Radio size={14} className="text-[#f7c600] animate-pulse shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-white">
                  F PAC SOUND
                </span>
                <span className="h-2 w-[1px] bg-white/20" />
                <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">
                  Official player
                </span>
              </div>
              <button
                onClick={() => setPlayerOpen(false)}
                aria-label="Minimizar player"
                title="Minimizar"
                className="text-white/40 hover:text-white transition-colors cursor-pointer p-0.5"
              >
                <ChevronDown size={16} />
              </button>
            </div>

            {/* Status indicators */}
            <div className="flex justify-between items-center text-[9px] font-black tracking-wider text-white/50 bg-white/5 px-2.5 py-1">
              <span className="flex items-center gap-1 text-[#f7c600]">
                <span className="animate-pulse">♪</span> TOCANDO AGORA
              </span>
              <span>
                FAIXA {trackNumber} DE {totalTracksCount}
              </span>
            </div>

            {/* Track Album details */}
            <TrackInfo track={currentTrack} isPlaying={isPlaying} />

            {currentTrack.isFallback && (
              <div className="text-[10px] bg-[#f7c600]/10 border border-[#f7c600]/30 p-2.5 text-white/90 font-sans leading-relaxed flex flex-col gap-1.5 rounded-none" id="storage_unauthorized_instruction_box">
                <div className="flex items-center gap-1 text-[#f7c600] font-black uppercase text-[10px] tracking-wider">
                  <span className="animate-pulse">⚠️</span> CONFIGURAÇÃO NECESSÁRIA
                </div>
                <p className="text-white/80 text-[10px] leading-normal font-medium">
                  A pasta <b>"Musicas do Site"</b> no Firebase Storage está com acesso restrito. Para que a rádio funcione publicamente, siga os passos abaixo:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-white/70 text-[9px] font-medium pl-1">
                  <li>Acesse o <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="text-[#f7c600] underline hover:text-[#f7c600]/80 transition-colors">Firebase Console</a></li>
                  <li>Vá no menu lateral em <b>Storage</b> &gt; aba <b>Rules</b></li>
                  <li>Substitua as regras atuais pelas seguintes:</li>
                </ol>
                <div className="relative group">
                  <pre className="bg-black/85 p-2 text-[8px] text-white/65 border border-white/10 overflow-x-auto select-all rounded-none font-mono leading-tight max-h-[110px]">
{`rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /Musicas do Site/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}`}
                  </pre>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`rules_version = '2';\nservice firebase.storage {\n  match /b/{bucket}/o {\n    match /Musicas do Site/{allPaths=**} {\n      allow read: if true;\n      allow write: if request.auth != null;\n    }\n    match /{allPaths=**} {\n      allow read: if true;\n      allow write: if request.auth != null;\n    }\n  }\n}`);
                      toast.success('Regras copiadas!');
                    }}
                    className="absolute right-1 top-1 bg-white/10 hover:bg-white/20 text-white/80 text-[7px] px-1 py-0.5 uppercase tracking-widest font-black transition-colors"
                  >
                    COPIAR
                  </button>
                </div>
                <p className="text-[8px] text-white/50 leading-normal italic">
                  *Depois de colar as regras, clique no botão "Publicar" no console do Firebase. A rádio começará a tocar automaticamente.
                </p>
              </div>
            )}

            {/* Scrubber timeline */}
            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              seek={seek}
            />

            {/* Core Action & Volume Row */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-3 border-t border-white/5 pt-2">
              <PlayerControls
                isPlaying={isPlaying}
                isLooping={isLooping}
                isShuffling={isShuffling}
                togglePlay={togglePlay}
                nextTrack={nextTrack}
                prevTrack={prevTrack}
                toggleLoop={toggleLoop}
                toggleShuffle={toggleShuffle}
                playlistOpen={playlistOpen}
                setPlaylistOpen={setPlaylistOpen}
              />

              <VolumeControl
                volume={volume}
                isMuted={isMuted}
                setVolume={setVolume}
                toggleMute={toggleMute}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Player;
