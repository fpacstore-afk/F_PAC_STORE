import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Track, MusicPlayerContextType } from '../types/music';
import { fetchAllTracks, incrementTrackPlays, DEFAULT_RADIO_TRACKS } from '../services/radioService';
import { generateSynthesizedTrackAudio } from '../utils/audioGenerator';
import { toast } from 'react-hot-toast';

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>(DEFAULT_RADIO_TRACKS);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(DEFAULT_RADIO_TRACKS[0] || null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('fpac_radio_volume');
    return saved ? parseFloat(saved) : 0.8;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);
  const [activePlaylist, setActivePlaylist] = useState('Geral');
  const [failedTracks, setFailedTracks] = useState<Record<string, string>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackRef = useRef<Track | null>(currentTrack);
  const isPlayingRef = useRef<boolean>(isPlaying);
  const isLoopingRef = useRef<boolean>(isLooping);
  const isShufflingRef = useRef<boolean>(isShuffling);
  const filteredTracksRef = useRef<Track[]>([]);

  // Filtered tracks that are currently available/active
  const filteredTracks = tracks.filter(t => t.active);

  // Keep refs in sync
  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  useEffect(() => {
    isShufflingRef.current = isShuffling;
  }, [isShuffling]);

  useEffect(() => {
    filteredTracksRef.current = filteredTracks;
  }, [filteredTracks]);

  // Next Track Logic
  const handleNextTrack = useCallback(() => {
    const list = filteredTracksRef.current;
    if (!list || list.length === 0) return;

    let nextIndex = 0;
    const current = currentTrackRef.current;

    if (isShufflingRef.current) {
      nextIndex = Math.floor(Math.random() * list.length);
    } else if (current) {
      const currentIndex = list.findIndex(t => t.id === current.id);
      if (currentIndex !== -1 && currentIndex < list.length - 1) {
        nextIndex = currentIndex + 1;
      } else {
        nextIndex = 0; // Wrap around
      }
    }

    const nextT = list[nextIndex];
    if (nextT) {
      playTrack(nextT);
    }
  }, []);

  const handlePrevTrack = useCallback(() => {
    const list = filteredTracksRef.current;
    if (!list || list.length === 0) return;

    let prevIndex = list.length - 1;
    const current = currentTrackRef.current;

    if (isShufflingRef.current) {
      prevIndex = Math.floor(Math.random() * list.length);
    } else if (current) {
      const currentIndex = list.findIndex(t => t.id === current.id);
      if (currentIndex > 0) {
        prevIndex = currentIndex - 1;
      } else {
        prevIndex = list.length - 1;
      }
    }

    const prevT = list[prevIndex];
    if (prevT) {
      playTrack(prevT);
    }
  }, []);

  // Initialize Audio Element ONCE
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onLoadStart = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    
    const onTimeUpdate = () => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime || 0);
      }
    };
    
    const onDurationChange = () => {
      if (audioRef.current) {
        setDuration(audioRef.current.duration || 0);
      }
    };

    const onEnded = () => {
      if (audioRef.current) {
        if (isLoopingRef.current || audioRef.current.loop) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        } else {
          handleNextTrack();
        }
      }
    };

    const onError = () => {
      setIsLoading(false);
      setIsPlaying(false);
      
      const track = currentTrackRef.current;
      if (track && track.audio) {
        setFailedTracks(prev => ({
          ...prev,
          [track.id]: 'Arquivo de áudio indisponível ou formato incompatível.'
        }));
        console.warn(`[F PAC Radio] Não foi possível reproduzir o áudio da faixa "${track.title}".`);
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadstart', onLoadStart);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('error', onError);

    // Apply saved configurations
    audio.volume = isMuted ? 0 : volume;

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadstart', onLoadStart);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('error', onError);
      audioRef.current = null;
    };
  }, [handleNextTrack]);

  // Volume synchronization
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Loop synchronization
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = isLooping;
    }
  }, [isLooping]);

  // Load Tracks from Firestore
  const refreshTracks = async () => {
    try {
      const data = await fetchAllTracks(true); // Fetch active ones
      if (data && data.length > 0) {
        setTracks(data);
        if (!currentTrackRef.current) {
          setCurrentTrack(data[0]);
        }
      } else {
        setTracks(DEFAULT_RADIO_TRACKS);
        if (!currentTrackRef.current) {
          setCurrentTrack(DEFAULT_RADIO_TRACKS[0]);
        }
      }
    } catch (error) {
      console.warn('Erro ao carregar faixas da rádio, usando faixas padrão:', error);
      setTracks(DEFAULT_RADIO_TRACKS);
      if (!currentTrackRef.current) {
        setCurrentTrack(DEFAULT_RADIO_TRACKS[0]);
      }
    }
  };

  useEffect(() => {
    refreshTracks();
  }, []);

  const playTrack = async (track: Track) => {
    if (!track) return;
    
    setCurrentTrack(track);
    currentTrackRef.current = track;

    let audioSrc = track.audio;
    if (!audioSrc || typeof audioSrc !== 'string' || !audioSrc.trim()) {
      audioSrc = generateSynthesizedTrackAudio(1);
    }

    const audio = audioRef.current;
    if (!audio) return;

    try {
      setIsLoading(true);

      // Load new source only if different
      if (audio.src !== audioSrc) {
        audio.src = audioSrc;
        audio.load();
      }

      await audio.play();
      setIsPlaying(true);
      setIsLoading(false);
      incrementTrackPlays(track.id);
    } catch (err: any) {
      // If original source failed, try synthesized fallback once
      if (audioSrc !== track.audio || !audioSrc.startsWith('data:')) {
        try {
          const fallbackSrc = generateSynthesizedTrackAudio(2);
          audio.src = fallbackSrc;
          audio.load();
          await audio.play();
          setIsPlaying(true);
          setIsLoading(false);
          return;
        } catch (_) {
          // Fallback also failed or blocked by autoplay
        }
      }

      setIsLoading(false);
      setIsPlaying(false);

      if (err.name === 'NotAllowedError') {
        toast('Toque na tela para permitir a reprodução de áudio!', { icon: '🎵' });
      } else if (err.name === 'NotSupportedError' || err.message?.includes('no supported source')) {
        setFailedTracks(prev => ({
          ...prev,
          [track.id]: 'Fonte de áudio não suportada'
        }));
      } else {
        console.warn('Aviso de reprodução:', err?.message || 'Reprodução pausada');
      }
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      const trackToPlay = currentTrack || (filteredTracks.length > 0 ? filteredTracks[0] : null);
      if (!trackToPlay) {
        toast.error('Nenhuma faixa selecionada.');
        return;
      }

      await playTrack(trackToPlay);
    }
  };

  const setVolume = (vol: number) => {
    const val = Math.max(0, Math.min(1, vol));
    setVolumeState(val);
    localStorage.setItem('fpac_radio_volume', String(val));
    if (val > 0) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(prev => !prev);
  };

  const toggleLoop = () => {
    setIsLooping(prev => !prev);
  };

  const toggleShuffle = () => {
    setIsShuffling(prev => !prev);
  };

  const seek = (time: number) => {
    if (audioRef.current && Number.isFinite(time)) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const clearFailedTracks = () => {
    setFailedTracks({});
  };

  return (
    <MusicPlayerContext.Provider
      value={{
        tracks,
        currentTrack,
        isPlaying,
        volume,
        isMuted,
        isLooping,
        isShuffling,
        currentTime,
        duration,
        isLoading,
        playerOpen,
        activePlaylist,
        filteredTracks,
        failedTracks,
        playTrack,
        togglePlay,
        nextTrack: handleNextTrack,
        prevTrack: handlePrevTrack,
        setVolume,
        toggleMute,
        toggleLoop,
        toggleShuffle,
        seek,
        setPlayerOpen,
        setActivePlaylist,
        clearFailedTracks,
        refreshTracks,
      }}
    >
      {children}
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext);
  if (context === undefined) {
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider');
  }
  return context;
}
