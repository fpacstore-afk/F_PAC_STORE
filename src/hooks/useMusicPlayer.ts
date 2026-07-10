import { useContext } from 'react';
import { MusicPlayerContext, MusicPlayerContextType } from '../contexts/MusicPlayerContext';

export function useMusicPlayer(): MusicPlayerContextType {
  const context = useContext(MusicPlayerContext);
  if (context === undefined) {
    throw new Error('useMusicPlayer must be used within a MusicPlayerProvider');
  }
  return context;
}

export default useMusicPlayer;
