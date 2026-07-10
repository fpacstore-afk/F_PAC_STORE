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
    setPlayerOpen
  } = useMusicPlayer();

  const [playlistOpen, setPlaylistOpen] = useState(false);

  const handleMiniTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    togglePlay();
  };

  // Do not render anything if there is no current track (i.e. empty database and no defaults)
  if (!currentTrack) return null;

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

            {/* Track Album details */}
            <TrackInfo track={currentTrack} isPlaying={isPlaying} />

            {/* Scrubber timeline */}
            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              seek={seek}
            />

            {/* Core Action & Volume Row */}
            <div className="flex items-center justify-between gap-4 border-t border-white/5 pt-2">
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
