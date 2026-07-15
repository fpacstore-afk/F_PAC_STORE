import { ref, listAll, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import { Track } from '../types/music';

export interface Music extends Track {
  nome: string;
  url: string;
}

/**
 * Parses file name to extract artist and title.
 * Handles patterns like "Artist - Title.mp3", "Artist_-_Title.mp3", or just "Title.mp3".
 */
export function parseFileName(fileNameWithExt: string): { title: string; artist: string } {
  // Strip .mp3 extension
  let cleanName = fileNameWithExt.replace(/\.mp3$/i, '');
  
  // Replace underscores with spaces
  cleanName = cleanName.replace(/_/g, ' ');
  
  // Clean double spaces
  cleanName = cleanName.replace(/\s+/g, ' ').trim();

  // Look for separators like " - ", " — ", " – ", or similar dashes
  const separators = [' - ', ' — ', ' – ', ' -', '- ', '-', '—', '–'];
  let artist = 'F PAC RECORDS';
  let title = cleanName;

  for (const sep of separators) {
    if (cleanName.includes(sep)) {
      const parts = cleanName.split(sep);
      if (parts.length >= 2) {
        const potentialArtist = parts[0].trim();
        const potentialTitle = parts.slice(1).join(sep).trim();
        
        if (potentialArtist && potentialTitle) {
          artist = potentialArtist;
          title = potentialTitle;
          break;
        }
      }
    }
  }

  // Ensure title and artist are present
  if (!title) title = cleanName || 'Sem Título';
  if (!artist) artist = 'F PAC';

  return { title, artist };
}

/**
 * Service to manage the radio playlist directly from Firebase Storage on the client side.
 * This completely avoids backend OAuth / token premature close restrictions in the sandbox.
 */
export async function getPlaylist(): Promise<Music[]> {
  try {
    console.log('[RADIO SERVICE] Iniciando busca de músicas em: /Musicas do Site/...');
    const listRef = ref(storage, 'Musicas do Site');
    const result = await listAll(listRef);
    
    const fetchPromises = result.items
      .filter((item) => item.name.toLowerCase().endsWith('.mp3'))
      .map(async (item, index) => {
        try {
          const downloadUrl = await getDownloadURL(item);
          const { title, artist } = parseFileName(item.name);
          const cleanName = item.name.replace(/\.mp3$/i, '').replace(/_/g, ' ').trim();

          const music: Music = {
            id: `storage-${item.name}`,
            nome: cleanName,
            url: downloadUrl,
            
            // Track interface fields for player compatibility
            title: title,
            artist: artist,
            album: 'Rádio F PAC',
            cover: '/estampas/logo-fpac.png', // Fallback cover art
            audio: downloadUrl,
            duration: 0, // Duration resolved by audio player upon load
            active: true,
            order: index,
            playlist: 'all',
            category: 'Radio',
            audioStoragePath: item.fullPath
          };
          
          return music;
        } catch (itemErr) {
          console.warn(`[RADIO SERVICE] Erro ao obter URL de download para ${item.name}:`, itemErr);
          return null;
        }
      });

    const playlist = (await Promise.all(fetchPromises)).filter((m): m is Music => m !== null);

    // Sort alphabetically by song title
    playlist.sort((a, b) => a.title.localeCompare(b.title, 'pt', { sensitivity: 'base' }));

    // Re-assign correct sorted order indices
    playlist.forEach((track, index) => {
      track.order = index;
    });

    console.log(`[RADIO SERVICE] Sucesso! ${playlist.length} músicas carregadas da Storage.`);
    return playlist;
  } catch (err: any) {
    console.warn('[RADIO SERVICE] Falha ao listar músicas do Firebase Storage:', err);

    const isUnauthorized = err && (err.code === 'storage/unauthorized' || err.message?.includes('permission') || err.message?.includes('unauthorized'));
    
    // Return a fallback track directly, preventing any uncaught errors or crashes.
    const fallbackTrack: Music = {
      id: 'storage-fallback-track',
      nome: isUnauthorized ? 'Ajuste Regras do Storage' : 'Erro de Conexão Rádio',
      url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      title: isUnauthorized ? 'Ajuste Regras do Storage' : 'Erro de Conexão Rádio',
      artist: isUnauthorized ? 'F PAC RECORDS (Clique p/ ver instruções)' : 'Erro ao listar arquivos',
      album: 'F PAC RADIO',
      cover: '/estampas/logo-fpac.png',
      audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      duration: 372,
      active: true,
      order: 0,
      playlist: 'all',
      category: 'AVISO',
      isFallback: true,
      isPermissionError: !!isUnauthorized
    };

    return [fallbackTrack];
  }
}
