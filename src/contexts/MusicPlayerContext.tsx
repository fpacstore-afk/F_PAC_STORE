import React, { createContext, useState, useEffect, useRef, useMemo, ReactNode } from 'react';
import { Track } from '../types/music';
import { safeStorage } from '../lib/storage';
import { toast } from 'react-hot-toast';
import { getPlaylist } from '../services/radioService';

export interface MusicPlayerContextType {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isLooping: boolean;
  isShuffling: boolean;
  activePlaylist: string; // 'all' or specific playlist name
  playlists: string[];
  filteredTracks: Track[];
  loading: boolean;
  error: string | null;
  playTrack: (track: Track) => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleLoop: () => void;
  toggleShuffle: () => void;
  seek: (time: number) => void;
  setActivePlaylist: (playlist: string) => void;
  playerOpen: boolean;
  setPlayerOpen: (open: boolean) => void;
  failedTracks: Record<string, string>;
  clearFailedTracks: () => void;
}

export const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

interface MusicPlayerProviderProps {
  children: ReactNode;
}

export function MusicPlayerProvider({ children }: MusicPlayerProviderProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [activePlaylist, setActivePlaylistState] = useState('all');
  const [playerOpen, setPlayerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failedTracks, setFailedTracks] = useState<Record<string, string>>({});

  const clearFailedTracks = () => {
    setFailedTracks({});
  };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const lastSavedTimeRef = useRef<number>(0);
  const isFirstLoadRef = useRef(true);
  const consecutiveErrorsRef = useRef<number>(0);

  const setAudioRef = (node: HTMLAudioElement | null) => {
    audioRef.current = node;
    if (node && !audioReady) {
      setAudioReady(true);
    }
  };

  // Restore persisted settings from safeStorage on mount / audio element readiness
  useEffect(() => {
    if (!audioRef.current || !audioReady) return;

    const savedVolume = safeStorage.getItem('f_pac_sound_volume');
    if (savedVolume !== null) {
      const vol = parseFloat(savedVolume);
      setVolumeState(vol);
      audioRef.current.volume = vol;
    } else {
      audioRef.current.volume = 0.8;
      setVolumeState(0.8);
    }

    const savedMuted = safeStorage.getItem('f_pac_sound_is_muted');
    if (savedMuted !== null) {
      const muted = savedMuted === 'true';
      setIsMuted(muted);
      audioRef.current.muted = muted;
    }

    const savedLoop = safeStorage.getItem('f_pac_sound_is_looping');
    if (savedLoop !== null) {
      const loop = savedLoop === 'true';
      setIsLooping(loop);
      audioRef.current.loop = loop;
    }

    const savedShuffle = safeStorage.getItem('f_pac_sound_is_shuffling');
    if (savedShuffle !== null) {
      setIsShuffling(savedShuffle === 'true');
    }

    const savedPlaylist = safeStorage.getItem('f_pac_sound_active_playlist');
    if (savedPlaylist !== null) {
      setActivePlaylistState(savedPlaylist);
    }
  }, [audioReady]);

  const createFallbackTrack = (title: string, artist: string, isPermissionError: boolean = false): Track => ({
    id: 'storage-fallback-track',
    title: title,
    artist: artist,
    album: 'F PAC RADIO',
    cover: '/estampas/logo-fpac.png',
    audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    duration: 372,
    active: true,
    order: 0,
    playlist: 'all',
    category: 'AVISO',
    isFallback: true,
    isPermissionError: isPermissionError
  });

  // Load active tracks from Firebase Storage via Radio Service
  useEffect(() => {
    let active = true;

    async function loadPlaylist() {
      setLoading(true);
      setError(null);
      try {
        const fetchedTracks = await getPlaylist();
        if (active) {
          if (fetchedTracks.length > 0) {
            setTracks(fetchedTracks);
          } else {
            setError('Nenhuma música encontrada no Firebase Storage.');
            setTracks([createFallbackTrack('Nenhuma Música Carregada', 'Acesse o Admin para enviar MP3s')]);
          }
        }
      } catch (err: any) {
        console.warn('Error loading playlist from storage:', err);
        if (active) {
          const isUnauthorized = err?.code === 'storage/unauthorized' || err?.message?.includes('permission') || err?.message?.includes('unauthorized');
          setError(err?.message || 'Falha ao carregar rádio.');
          setTracks([
            createFallbackTrack(
              isUnauthorized ? 'Ajuste Regras do Storage' : 'Erro de Conexão Rádio',
              isUnauthorized ? 'F PAC RECORDS (Clique p/ ver instruções)' : 'Erro ao listar arquivos',
              isUnauthorized
            )
          ]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadPlaylist();

    // Set up auto-refresh interval of 3 minutes to keep list perfectly fresh
    const interval = setInterval(() => {
      getPlaylist().then((fetchedTracks) => {
        if (active && fetchedTracks.length > 0) {
          setTracks((prev) => {
            if (prev.some(t => t.isFallback)) {
              return fetchedTracks;
            }
            // Only update state if track list actually changed to prevent unnecessary re-renders
            const prevIds = prev.map(p => p.id).join(',');
            const nextIds = fetchedTracks.map(f => f.id).join(',');
            if (prevIds === nextIds) {
              return prev;
            }
            return fetchedTracks;
          });
        }
      }).catch(err => {
        console.warn('Silent auto-refresh of Storage playlist failed:', err);
      });
    }, 180000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Silent refresh whenever the player is opened
  useEffect(() => {
    if (playerOpen) {
      getPlaylist().then((fetchedTracks) => {
        if (fetchedTracks.length > 0) {
          setTracks((prev) => {
            if (prev.some(t => t.isFallback)) {
              return fetchedTracks;
            }
            const prevIds = prev.map(p => p.id).join(',');
            const nextIds = fetchedTracks.map(f => f.id).join(',');
            if (prevIds === nextIds) {
              return prev;
            }
            return fetchedTracks;
          });
        }
      }).catch(err => {
        console.warn('Silent refresh of Storage playlist failed upon opening:', err);
      });
    }
  }, [playerOpen]);

  // Dynamically extract unique playlists (deactivated to show all tracks together)
  const playlists = useMemo(() => {
    return ['all'];
  }, []);

  // Filter tracks by selected playlist - returning all active tracks without any divisions or filtering
  const filteredTracks = useMemo(() => {
    return tracks.filter(t => t.active !== false);
  }, [tracks]);

  // Restore the last played track and position on first load (ensuring audio element is ready)
  useEffect(() => {
    if (tracks.length === 0 || !audioReady || !isFirstLoadRef.current) return;
    isFirstLoadRef.current = false;

    const savedTrackId = safeStorage.getItem('f_pac_sound_last_track_id');
    const savedPos = safeStorage.getItem('f_pac_sound_last_position');

    let trackToLoad = tracks.find(t => t.id === savedTrackId && t.active !== false);
    if (!trackToLoad) {
      trackToLoad = tracks.find(t => t.active !== false) || null;
    }

    if (trackToLoad) {
      setCurrentTrack(trackToLoad);
      if (audioRef.current) {
        audioRef.current.src = trackToLoad.audio || (trackToLoad as any).audioUrl || '';
        audioRef.current.load();
        if (savedPos && savedTrackId === trackToLoad.id) {
          const parsedPos = parseFloat(savedPos);
          audioRef.current.currentTime = parsedPos;
          setCurrentTime(parsedPos);
        }
      }
    }
  }, [tracks, audioReady]);

  // Ensure currentTrack is synchronized with the actual active tracks list
  useEffect(() => {
    if (loading) return;
    if (filteredTracks.length === 0) {
      if (currentTrack) {
        setCurrentTrack(null);
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
        }
      }
      return;
    }

    // If the current track is no longer in the filtered (active) tracks, switch to the first active track
    if (currentTrack && !filteredTracks.some(t => t.id === currentTrack.id)) {
      const fallbackTrack = filteredTracks[0];
      setCurrentTrack(fallbackTrack);
      if (audioRef.current) {
        audioRef.current.src = fallbackTrack.audio || (fallbackTrack as any).audioUrl || '';
        audioRef.current.load();
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
    } else if (!currentTrack && filteredTracks.length > 0) {
      const fallbackTrack = filteredTracks[0];
      setCurrentTrack(fallbackTrack);
      if (audioRef.current) {
        audioRef.current.src = fallbackTrack.audio || (fallbackTrack as any).audioUrl || '';
        audioRef.current.load();
        audioRef.current.currentTime = 0;
        setCurrentTime(0);
      }
    }
  }, [filteredTracks, loading, currentTrack]);

  // Audio track switching effect
  const playTrack = (track: Track) => {
    if (!audioRef.current) return;
    consecutiveErrorsRef.current = 0;

    // Clear failed status when user manually tries to play this track again
    setFailedTracks(prev => {
      if (!prev[track.id]) return prev;
      const copy = { ...prev };
      delete copy[track.id];
      return copy;
    });

    const isSame = currentTrack && currentTrack.id === track.id;
    setCurrentTrack(track);
    safeStorage.setItem('f_pac_sound_last_track_id', track.id);

    const trackAudioSrc = track.audio || (track as any).audioUrl || '';

    if (!audioRef.current.src || !isSame) {
      audioRef.current.src = trackAudioSrc;
      audioRef.current.load();
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      safeStorage.setItem('f_pac_sound_last_position', '0');
    }

    audioRef.current.play().catch(err => {
      console.log('Playback start was blocked by browser or aborted.', err);
    });
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    consecutiveErrorsRef.current = 0;
    
    if (!audioRef.current.paused) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.log('Playback start was blocked by browser or aborted.', err);
      });
    }
  };

  const handleNextTrack = () => {
    if (filteredTracks.length === 0 || !currentTrack) return;

    // Filter out failed tracks
    const workingTracks = filteredTracks.filter(t => !failedTracks[t.id]);
    const tracksToChooseFrom = workingTracks.length > 0 ? workingTracks : filteredTracks;

    if (isShuffling && tracksToChooseFrom.length > 1) {
      let nextIndex = Math.floor(Math.random() * tracksToChooseFrom.length);
      const currIdx = tracksToChooseFrom.findIndex(t => t.id === currentTrack.id);
      if (nextIndex === currIdx && tracksToChooseFrom.length > 1) {
        nextIndex = (nextIndex + 1) % tracksToChooseFrom.length;
      }
      playTrack(tracksToChooseFrom[nextIndex]);
    } else {
      const currIdx = tracksToChooseFrom.findIndex(t => t.id === currentTrack.id);
      const nextIdx = currIdx === -1 ? 0 : (currIdx + 1) % tracksToChooseFrom.length;
      playTrack(tracksToChooseFrom[nextIdx]);
    }
  };

  const handlePrevTrack = () => {
    if (filteredTracks.length === 0 || !currentTrack) return;

    // Filter out failed tracks
    const workingTracks = filteredTracks.filter(t => !failedTracks[t.id]);
    const tracksToChooseFrom = workingTracks.length > 0 ? workingTracks : filteredTracks;

    const currIdx = tracksToChooseFrom.findIndex(t => t.id === currentTrack.id);
    let prevIdx = 0;
    if (currIdx === -1) {
      prevIdx = 0;
    } else {
      prevIdx = currIdx - 1;
      if (prevIdx < 0) prevIdx = tracksToChooseFrom.length - 1;
    }
    playTrack(tracksToChooseFrom[prevIdx]);
  };

  const setVolume = (vol: number) => {
    const normalizedVol = Math.max(0, Math.min(1, vol));
    setVolumeState(normalizedVol);
    safeStorage.setItem('f_pac_sound_volume', normalizedVol.toString());
    if (audioRef.current) {
      audioRef.current.volume = normalizedVol;
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    safeStorage.setItem('f_pac_sound_is_muted', nextMute.toString());
    if (audioRef.current) {
      audioRef.current.muted = nextMute;
    }
  };

  const toggleLoop = () => {
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    safeStorage.setItem('f_pac_sound_is_looping', nextLoop.toString());
    if (audioRef.current) {
      audioRef.current.loop = nextLoop;
    }
  };

  const toggleShuffle = () => {
    const nextShuffle = !isShuffling;
    setIsShuffling(nextShuffle);
    safeStorage.setItem('f_pac_sound_is_shuffling', nextShuffle.toString());
  };

  const seek = (time: number) => {
    if (!audioRef.current) return;
    const boundedTime = Math.max(0, Math.min(duration, time));
    audioRef.current.currentTime = boundedTime;
    setCurrentTime(boundedTime);
    safeStorage.setItem('f_pac_sound_last_position', boundedTime.toString());
  };

  const setActivePlaylist = (playlist: string) => {
    setActivePlaylistState(playlist);
    safeStorage.setItem('f_pac_sound_active_playlist', playlist);
  };

  // HTML5 Audio Event Handlers
  const handlePlay = () => {
    setIsPlaying(true);
    consecutiveErrorsRef.current = 0;
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const currTime = audioRef.current.currentTime;
    setCurrentTime(currTime);

    // Persist position every 3 seconds
    const now = Date.now();
    if (now - lastSavedTimeRef.current > 3000 && currentTrack) {
      safeStorage.setItem('f_pac_sound_last_position', currTime.toString());
      lastSavedTimeRef.current = now;
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleDurationChange = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleEnded = () => {
    if (isLooping) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(err => console.log('Playback loop failed:', err));
      }
    } else {
      handleNextTrack();
    }
  };

  const getSpecificErrorMessage = (errorObj: MediaError | null, src: string): string => {
    if (!src || src === 'null' || src === 'undefined') {
      return "URL de áudio inválida ou vazia.";
    }
    
    const ext = src.split('.').pop()?.split('?')[0]?.toLowerCase() || '';
    const validExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'mpeg', 'aac'];
    if (ext && !validExtensions.includes(ext)) {
      return `MIME Type inválido: O arquivo com extensão .${ext} não é um formato de áudio suportado pela Web.`;
    }

    if (!errorObj) {
      return "Erro de reprodução desconhecido.";
    }

    switch (errorObj.code) {
      case 1: // MEDIA_ERR_ABORTED
        return "Carregamento abortado pelo usuário ou sistema.";
      case 2: // MEDIA_ERR_NETWORK
        if (navigator.onLine === false) {
          return "Erro de rede: Sem conexão com a internet.";
        }
        return "Erro de rede ou Timeout: Falha ao baixar o arquivo de áudio do servidor devido a instabilidade de conexão.";
      case 3: // MEDIA_ERR_DECODE
        return "Arquivo corrompido: Falha de decodificação no player. Arquivo com dados corrompidos ou danificados.";
      case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
        if (src.includes('/uploads/')) {
          return "Arquivo inexistente: O arquivo local temporário foi removido do servidor devido a uma reinicialização de contêiner.";
        }
        if (src.includes('firebasestorage')) {
          return "Permissão negada ou arquivo inexistente: Falha de autorização ao ler o arquivo do Firebase Storage ou regras de escrita/leitura bloqueadas.";
        }
        return "Arquivo inexistente ou formato de áudio incompatível com o navegador.";
      default:
        return "Falha crítica de áudio: Não foi possível reproduzir o arquivo de mídia.";
    }
  };

  const handleError = (e: any) => {
    const errorObj = audioRef.current?.error;
    
    if (errorObj && errorObj.code === 1) {
      console.log('Audio loading was aborted (normal when switching tracks).');
      return;
    }

    const currentSrc = audioRef.current?.src || '';
    const specificMessage = getSpecificErrorMessage(errorObj || null, currentSrc);

    console.warn(`[F PAC RADIO] Falha na reprodução da música:`, {
      track: currentTrack?.title,
      src: currentSrc,
      code: errorObj?.code,
      message: errorObj?.message || specificMessage
    });

    if (currentTrack) {
      setFailedTracks(prev => ({
        ...prev,
        [currentTrack.id]: specificMessage
      }));
    }

    const trackName = currentTrack ? currentTrack.title : "Faixa";
    toast.error(`Erro ao carregar "${trackName}":\n${specificMessage}`, {
      id: `audio-error-${currentTrack?.id || 'unknown'}`,
      duration: 6000
    });
    
    consecutiveErrorsRef.current += 1;
    const tracksCount = filteredTracks.length || 1;
    const maxAttempts = Math.min(5, tracksCount);
    
    if (consecutiveErrorsRef.current >= maxAttempts) {
      console.error('Too many consecutive audio errors. Stopping playback.');
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      consecutiveErrorsRef.current = 0;
      toast.error("Múltiplas faixas falharam consecutivamente. F PAC RADIO pausada por segurança.");
      return;
    }

    setTimeout(() => {
      handleNextTrack();
    }, 2000);
  };

  return (
    <MusicPlayerContext.Provider
      value={{
        tracks,
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
        loading,
        error,
        playTrack,
        togglePlay,
        nextTrack: handleNextTrack,
        prevTrack: handlePrevTrack,
        setVolume,
        toggleMute,
        toggleLoop,
        toggleShuffle,
        seek,
        setActivePlaylist,
        playerOpen,
        setPlayerOpen,
        failedTracks,
        clearFailedTracks
      }}
    >
      {children}
      <audio
        ref={setAudioRef}
        id="f_pac_global_audio"
        className="hidden"
        preload="auto"
        onPlay={handlePlay}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onDurationChange={handleDurationChange}
        onEnded={handleEnded}
        onError={handleError}
      />
    </MusicPlayerContext.Provider>
  );
}
export default MusicPlayerProvider;
