import React, { createContext, useState, useEffect, useRef, useMemo, ReactNode } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Track } from '../types/music';

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSavedTimeRef = useRef<number>(0);
  const isFirstLoadRef = useRef(true);

  // Initialize Audio element on mount
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    
    const handleTimeUpdate = () => {
      if (!audioRef.current) return;
      const currTime = audioRef.current.currentTime;
      setCurrentTime(currTime);

      // Persist track position every 3 seconds to avoid spamming localStorage
      const now = Date.now();
      if (now - lastSavedTimeRef.current > 3000 && currentTrackRef.current) {
        localStorage.setItem('f_pac_sound_last_position', currTime.toString());
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
      if (isLoopingRef.current) {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(err => console.log('Playback loop failed:', err));
        }
      } else {
        handleNextTrack();
      }
    };

    const handleError = (e: any) => {
      console.warn('Audio playback encountered an error. Attempting next track...', e);
      // Skip to next track to avoid stalling
      setTimeout(() => {
        handleNextTrack();
      }, 1000);
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // Restore persisted settings from localStorage
    const savedVolume = localStorage.getItem('f_pac_sound_volume');
    if (savedVolume !== null) {
      const vol = parseFloat(savedVolume);
      setVolumeState(vol);
      audio.volume = vol;
    } else {
      audio.volume = 0.8;
    }

    const savedMuted = localStorage.getItem('f_pac_sound_is_muted');
    if (savedMuted !== null) {
      const muted = savedMuted === 'true';
      setIsMuted(muted);
      audio.muted = muted;
    }

    const savedLoop = localStorage.getItem('f_pac_sound_is_looping');
    if (savedLoop !== null) {
      setIsLooping(savedLoop === 'true');
    }

    const savedShuffle = localStorage.getItem('f_pac_sound_is_shuffling');
    if (savedShuffle !== null) {
      setIsShuffling(savedShuffle === 'true');
    }

    const savedPlaylist = localStorage.getItem('f_pac_sound_active_playlist');
    if (savedPlaylist !== null) {
      setActivePlaylistState(savedPlaylist);
    }

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  // Sync references to avoid closure capture issues in event listeners
  const currentTrackRef = useRef<Track | null>(currentTrack);
  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  const isLoopingRef = useRef(isLooping);
  useEffect(() => {
    isLoopingRef.current = isLooping;
  }, [isLooping]);

  // Load active tracks from Firestore
  useEffect(() => {
    const q = query(collection(db, 'music'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTracks: Track[] = [];
      snapshot.forEach((doc) => {
        fetchedTracks.push({ id: doc.id, ...doc.data() } as Track);
      });

      if (fetchedTracks.length > 0) {
        setTracks(fetchedTracks);
      } else {
        console.log('No music tracks found in Firestore.');
        setTracks([]);
      }
      setLoading(false);
    }, (err) => {
      console.warn('Could not read "music" from Firestore:', err);
      setTracks([]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Dynamically extract unique playlists (deactivated to show all tracks together)
  const playlists = useMemo(() => {
    return ['all'];
  }, []);

  // Filter tracks by selected playlist - returning all active tracks without any divisions or filtering
  const filteredTracks = useMemo(() => {
    return tracks.filter(t => t.active);
  }, [tracks]);

  // Restore the last played track and position on first load
  useEffect(() => {
    if (tracks.length === 0 || !isFirstLoadRef.current) return;
    isFirstLoadRef.current = false;

    const savedTrackId = localStorage.getItem('f_pac_sound_last_track_id');
    const savedPos = localStorage.getItem('f_pac_sound_last_position');

    let trackToLoad = tracks.find(t => t.id === savedTrackId && t.active);
    if (!trackToLoad) {
      trackToLoad = tracks.find(t => t.active) || null;
    }

    if (trackToLoad) {
      setCurrentTrack(trackToLoad);
      if (audioRef.current) {
        audioRef.current.src = trackToLoad.audio;
        audioRef.current.load();
        if (savedPos && savedTrackId === trackToLoad.id) {
          audioRef.current.currentTime = parseFloat(savedPos);
          setCurrentTime(parseFloat(savedPos));
        }
      }
    }
  }, [tracks]);

  // Sync isShuffling state to localStorage
  const isShufflingRef = useRef(isShuffling);
  useEffect(() => {
    isShufflingRef.current = isShuffling;
  }, [isShuffling]);

  const filteredTracksRef = useRef<Track[]>(filteredTracks);
  useEffect(() => {
    filteredTracksRef.current = filteredTracks;
  }, [filteredTracks]);

  // Audio track switching effect
  const playTrack = (track: Track) => {
    if (!audioRef.current) return;

    const isSame = currentTrack && currentTrack.id === track.id;
    setCurrentTrack(track);
    localStorage.setItem('f_pac_sound_last_track_id', track.id);

    if (!isSame) {
      audioRef.current.src = track.audio;
      audioRef.current.load();
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      localStorage.setItem('f_pac_sound_last_position', '0');
    }

    setIsPlaying(true);
    audioRef.current.play().catch(err => {
      console.log('Playback start was blocked by browser or failed. Click play again.', err);
      setIsPlaying(false);
    });
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      audioRef.current.play().catch(err => {
        console.log('Playback start failed:', err);
        setIsPlaying(false);
      });
    }
  };

  const handleNextTrack = () => {
    const list = filteredTracksRef.current;
    if (list.length === 0 || !currentTrackRef.current) return;

    if (isShufflingRef.current && list.length > 1) {
      let nextIndex = Math.floor(Math.random() * list.length);
      // Avoid immediate repeating if possible
      const currIdx = list.findIndex(t => t.id === currentTrackRef.current?.id);
      if (nextIndex === currIdx) {
        nextIndex = (nextIndex + 1) % list.length;
      }
      playTrack(list[nextIndex]);
    } else {
      const currIdx = list.findIndex(t => t.id === currentTrackRef.current?.id);
      const nextIdx = currIdx === -1 ? 0 : (currIdx + 1) % list.length;
      playTrack(list[nextIdx]);
    }
  };

  const handlePrevTrack = () => {
    const list = filteredTracksRef.current;
    if (list.length === 0 || !currentTrackRef.current) return;

    const currIdx = list.findIndex(t => t.id === currentTrackRef.current?.id);
    let prevIdx = 0;
    if (currIdx === -1) {
      prevIdx = 0;
    } else {
      prevIdx = currIdx - 1;
      if (prevIdx < 0) prevIdx = list.length - 1;
    }
    playTrack(list[prevIdx]);
  };

  const setVolume = (vol: number) => {
    const normalizedVol = Math.max(0, Math.min(1, vol));
    setVolumeState(normalizedVol);
    localStorage.setItem('f_pac_sound_volume', normalizedVol.toString());
    if (audioRef.current) {
      audioRef.current.volume = normalizedVol;
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    localStorage.setItem('f_pac_sound_is_muted', nextMute.toString());
    if (audioRef.current) {
      audioRef.current.muted = nextMute;
    }
  };

  const toggleLoop = () => {
    const nextLoop = !isLooping;
    setIsLooping(nextLoop);
    localStorage.setItem('f_pac_sound_is_looping', nextLoop.toString());
  };

  const toggleShuffle = () => {
    const nextShuffle = !isShuffling;
    setIsShuffling(nextShuffle);
    localStorage.setItem('f_pac_sound_is_shuffling', nextShuffle.toString());
  };

  const seek = (time: number) => {
    if (!audioRef.current) return;
    const boundedTime = Math.max(0, Math.min(duration, time));
    audioRef.current.currentTime = boundedTime;
    setCurrentTime(boundedTime);
    localStorage.setItem('f_pac_sound_last_position', boundedTime.toString());
  };

  const setActivePlaylist = (playlist: string) => {
    setActivePlaylistState(playlist);
    localStorage.setItem('f_pac_sound_active_playlist', playlist);
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
        setPlayerOpen
      }}
    >
      {children}
    </MusicPlayerContext.Provider>
  );
}
export default MusicPlayerProvider;
