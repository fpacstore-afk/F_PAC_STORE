import { Timestamp } from 'firebase/firestore';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string; // Image URL
  audio: string; // Audio file URL
  duration: number; // Duration in seconds
  active: boolean;
  order: number;
  createdAt?: Timestamp | Date;
  updatedAt?: Timestamp | Date;
  playlist: string; // e.g. "Identidade", "Vista a Marca", "F PAC Anthem", "Street Mode"
  category: string; // e.g. "Ambient", "Trap", "Lofi", "Phonk"
  description?: string;
  loop?: boolean;
  shufflePermitted?: boolean;
  audioStoragePath?: string;
  coverStoragePath?: string;
}

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended';
