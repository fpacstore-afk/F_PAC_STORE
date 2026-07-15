import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Track, MusicPlayerContextType } from '../types/music';
import { fetchAllTracks, incrementTrackPlays } from '../services/radioService';
import { toast } from 'react-hot-toast';

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(undefined);

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
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

  // Filtered tracks that are currently available/active
  const filteredTracks = tracks.filter(t => t.active);

  // Initialize Audio
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
        setCurrentTime(audioRef.current.currentTime);
      }
    };
    
    const onDurationChange = () => {
      if (audioRef.current) {
        setDuration(audioRef.current.duration || 0);
      }
    };

    const onEnded = () => {
      // Loop or Next track
      if (audioRef.current) {
        if (audioRef.current.loop) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(err => console.log('Loop play failed:', err));
        } else {
          // Trigger next track
          handleNextTrack();
        }
      }
    };

    const onError = (e: ErrorEvent) => {
      setIsLoading(false);
      setIsPlaying(false);
      console.error('Audio playback error:', e);
      
      if (currentTrack) {
        setFailedTracks(prev => ({
          ...prev,
          [currentTrack.id]: 'Erro ao carregar arquivo de áudio.'
        }));
        
        toast.error(`Erro ao carregar: "${currentTrack.title}". Pulando para a próxima...`);
        // Skip track immediately
        setTimeout(() => {
          handleNextTrack();
        }, 1500);
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadstart', onLoadStart);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('error', onError as any);

    // Apply saved configurations
    audio.volume = isMuted ? 0 : volume;

    return () => {
      audio.pause();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadstart', onLoadStart);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('error', onError as any);
      audioRef.current = null;
    };
  }, [currentTrack?.id]); // Re-bind on track change to capture state safely

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
      setTracks(data);
      
      // Select first track if none selected
      if (data.length > 0 && !currentTrack) {
        setCurrentTrack(data[0]);
      }
    } catch (error) {
      console.error('Error loading radio tracks:', error);
    }
  };

  useEffect(() => {
    refreshTracks();
  }, []);

  // Update audio source when track changes
  useEffect(() => {
    if (audioRef.current && currentTrack) {
      const wasPlaying = isPlaying;
      audioRef.current.src = currentTrack.audio;
      audioRef.current.load();
      
      if (wasPlaying) {
        audioRef.current.play().catch((err) => {
          console.warn('Autoplay blocked or failed:', err);
          setIsPlaying(false);
        });
      }
    }
  }, [currentTrack]);

  const playTrack = (track: Track) => {
    setCurrentTrack(track);
    // Increment reproduction play count in Firestore
    incrementTrackPlays(track.id);
    
    // Force play on track click
    setTimeout(() => {
      if (audioRef.current) {
        setIsLoading(true);
        audioRef.current.play()
          .then(() => {
            setIsPlaying(true);
            setIsLoading(false);
          })
          .catch((err) => {
            console.error('Failed to play clicked track:', err);
            setIsPlaying(false);
            setIsLoading(false);
            toast('Toque na tela para permitir a reprodução de áudio!', { icon: '🎵' });
          });
      }
    }, 100);
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch((err) => {
          console.error('Play request rejected:', err);
          setIsPlaying(false);
          setIsLoading(false);
          toast.error('Erro de permissão ou mídia indisponível.');
        });
    }
  };

  const handleNextTrack = () => {
    if (filteredTracks.length === 0) return;
    
    let nextIndex = 0;
    
    if (isShuffling) {
      nextIndex = Math.floor(Math.random() * filteredTracks.length);
    } else if (currentTrack) {
      const currentIndex = filteredTracks.findIndex(t => t.id === currentTrack.id);
      if (currentIndex !== -1 && currentIndex < filteredTracks.length - 1) {
        nextIndex = currentIndex + 1;
      }
    }
    
    const nextT = filteredTracks[nextIndex];
    if (nextT) {
      playTrack(nextT);
    }
  };

  const handlePrevTrack = () => {
    if (filteredTracks.length === 0) return;
    
    let prevIndex = filteredTracks.length - 1;
    
    if (isShuffling) {
      prevIndex = Math.floor(Math.random() * filteredTracks.length);
    } else if (currentTrack) {
      const currentIndex = filteredTracks.findIndex(t => t.id === currentTrack.id);
      if (currentIndex > 0) {
        prevIndex = currentIndex - 1;
      }
    }
    
    const prevT = filteredTracks[prevIndex];
    if (prevT) {
      playTrack(prevT);
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
    if (audioRef.current) {
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
