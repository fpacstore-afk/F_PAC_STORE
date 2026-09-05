import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
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
  // Radio behavior is shuffle-first: every fresh visit gets a random starting
  // point and subsequent tracks stay randomized unless the visitor disables it.
  const [isShuffling, setIsShuffling] = useState(true);
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

  const filteredTracks = tracks.filter(t => t.active);

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);
  useEffect(() => { isShufflingRef.current = isShuffling; }, [isShuffling]);
  useEffect(() => { filteredTracksRef.current = filteredTracks; }, [filteredTracks]);

  const randomIndexAvoidingCurrent = useCallback((list: Track[]) => {
    if (list.length <= 1) return 0;
    const currentId = currentTrackRef.current?.id;
    const candidates = list.map((_, i) => i).filter(i => list[i].id !== currentId);
    return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
  }, []);

  const handleNextTrack = useCallback(() => {
    const list = filteredTracksRef.current;
    if (!list || list.length === 0) return;

    let nextIndex = 0;
    const current = currentTrackRef.current;

    if (isShufflingRef.current) {
      nextIndex = randomIndexAvoidingCurrent(list);
    } else if (current) {
      const currentIndex = list.findIndex(t => t.id === current.id);
      nextIndex = currentIndex !== -1 && currentIndex < list.length - 1 ? currentIndex + 1 : 0;
    }

    const nextT = list[nextIndex];
    if (nextT) playTrack(nextT);
  }, [randomIndexAvoidingCurrent]);

  const handlePrevTrack = useCallback(() => {
    const list = filteredTracksRef.current;
    if (!list || list.length === 0) return;

    let prevIndex = list.length - 1;
    const current = currentTrackRef.current;

    if (isShufflingRef.current) {
      prevIndex = randomIndexAvoidingCurrent(list);
    } else if (current) {
      const currentIndex = list.findIndex(t => t.id === current.id);
      prevIndex = currentIndex > 0 ? currentIndex - 1 : list.length - 1;
    }

    const prevT = list[prevIndex];
    if (prevT) playTrack(prevT);
  }, [randomIndexAvoidingCurrent]);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onLoadStart = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onTimeUpdate = () => audioRef.current && setCurrentTime(audioRef.current.currentTime || 0);
    const onDurationChange = () => audioRef.current && setDuration(audioRef.current.duration || 0);

    const onEnded = () => {
      if (!audioRef.current) return;
      if (isLoopingRef.current || audioRef.current.loop) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      } else {
        handleNextTrack();
      }
    };

    const onError = () => {
      setIsLoading(false);
      setIsPlaying(false);
      const track = currentTrackRef.current;
      if (track?.audio) {
        setFailedTracks(prev => ({ ...prev, [track.id]: 'Arquivo de áudio indisponível ou formato incompatível.' }));
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

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = isLooping;
  }, [isLooping]);

  const refreshTracks = async () => {
    try {
      const data = await fetchAllTracks(true);
      setTracks(data || []);

      if (!data || data.length === 0) {
        setCurrentTrack(null);
        currentTrackRef.current = null;
        return;
      }

      const stillExists = currentTrackRef.current && data.some(t => t.id === currentTrackRef.current?.id);
      if (!stillExists) {
        const randomTrack = data[Math.floor(Math.random() * data.length)];
        setCurrentTrack(randomTrack);
        currentTrackRef.current = randomTrack;
      }
    } catch (error) {
      console.warn('Erro ao carregar faixas da rádio:', error);
      setTracks([]);
      setCurrentTrack(null);
      currentTrackRef.current = null;
    }
  };

  useEffect(() => { refreshTracks(); }, []);

  const playTrack = async (track: Track) => {
    if (!track?.audio || typeof track.audio !== 'string' || !track.audio.trim()) {
      toast.error('Arquivo de áudio indisponível.');
      return;
    }

    setCurrentTrack(track);
    currentTrackRef.current = track;

    const audio = audioRef.current;
    if (!audio) return;

    try {
      setIsLoading(true);
      if (audio.src !== track.audio) {
        audio.src = track.audio;
        audio.load();
      }
      await audio.play();
      setIsPlaying(true);
      setIsLoading(false);
      incrementTrackPlays(track.id);
    } catch (err: any) {
      setIsLoading(false);
      setIsPlaying(false);

      if (err.name === 'NotAllowedError') {
        toast('Toque na tela para permitir a reprodução de áudio!', { icon: '🎵' });
      } else if (err.name === 'NotSupportedError' || err.message?.includes('no supported source')) {
        setFailedTracks(prev => ({ ...prev, [track.id]: 'Fonte de áudio não suportada' }));
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
      return;
    }

    let trackToPlay = currentTrack;
    if (!trackToPlay && filteredTracks.length > 0) {
      trackToPlay = filteredTracks[Math.floor(Math.random() * filteredTracks.length)];
    }
    if (!trackToPlay) {
      toast.error('Nenhuma música enviada está disponível na rádio.');
      return;
    }

    await playTrack(trackToPlay);
  };

  const setVolume = (vol: number) => {
    const val = Math.max(0, Math.min(1, vol));
    setVolumeState(val);
    localStorage.setItem('fpac_radio_volume', String(val));
    if (val > 0) setIsMuted(false);
  };

  const toggleMute = () => setIsMuted(prev => !prev);
  const toggleLoop = () => setIsLooping(prev => !prev);
  const toggleShuffle = () => setIsShuffling(prev => !prev);

  const seek = (time: number) => {
    if (audioRef.current && Number.isFinite(time)) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const clearFailedTracks = () => setFailedTracks({});

  return (
    <MusicPlayerContext.Provider value={{
      tracks, currentTrack, isPlaying, volume, isMuted, isLooping, isShuffling,
      currentTime, duration, isLoading, playerOpen, activePlaylist, filteredTracks,
      failedTracks, playTrack, togglePlay, nextTrack: handleNextTrack,
      prevTrack: handlePrevTrack, setVolume, toggleMute, toggleLoop, toggleShuffle,
      seek, setPlayerOpen, setActivePlaylist, clearFailedTracks, refreshTracks,
    }}>
      {children}
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext);
  if (context === undefined) throw new Error('useMusicPlayer must be used within a MusicPlayerProvider');
  return context;
}
