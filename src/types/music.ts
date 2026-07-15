export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  cover?: string;
  audio: string;
  duration?: number;
  category?: string;
  order?: number;
  active: boolean;
  createdAt?: any;
  updatedAt?: any;
  reproducoes?: number;
}

export interface MusicPlayerContextType {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  isLooping: boolean;
  isShuffling: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  playerOpen: boolean;
  activePlaylist: string;
  filteredTracks: Track[];
  failedTracks: Record<string, string>;
  playTrack: (track: Track) => void;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleLoop: () => void;
  toggleShuffle: () => void;
  seek: (time: number) => void;
  setPlayerOpen: (open: boolean) => void;
  setActivePlaylist: (playlist: string) => void;
  clearFailedTracks: () => void;
  refreshTracks: () => Promise<void>;
}
