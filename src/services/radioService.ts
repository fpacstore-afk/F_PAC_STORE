import { collection, query, orderBy, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp, getDoc, increment } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, listAll } from 'firebase/storage';
import { db, storage, sanitizeFirestoreData } from '../lib/firebase';
import { Track } from '../types/music';

const MUSIC_COLLECTION = 'music';

// The public radio must never invent/demo tracks. Only audio actually uploaded
// to the official "Musicas do Site" Firebase Storage area is eligible.
export const DEFAULT_RADIO_TRACKS: Track[] = [];

export function isOfficialUploadedTrack(track: Partial<Track>): boolean {
  const audio = String(track.audio || '');
  if (!audio) return false;

  const decoded = (() => {
    try { return decodeURIComponent(audio); } catch { return audio; }
  })();

  return (
    decoded.includes('Musicas do Site/') ||
    audio.includes('Musicas%20do%20Site%2F') ||
    audio.includes('Musicas%20do%20Site/')
  );
}

export async function fetchAllTracks(onlyActive = false): Promise<Track[]> {
  try {
    const colRef = collection(db, MUSIC_COLLECTION);
    const q = query(colRef, orderBy('order', 'asc'));
    const snapshot = await getDocs(q);

    let tracks: Track[] = [];
    snapshot.forEach((d) => {
      const data = d.data();
      tracks.push({
        id: d.id,
        title: data.title || 'Música Sem Nome',
        artist: data.artist || 'F PAC Sound',
        album: data.album || '',
        cover: data.cover || '',
        audio: data.audio || '',
        duration: data.duration || 0,
        category: data.category || '',
        order: data.order || 0,
        active: data.active !== false,
        reproducoes: data.reproducoes || 0,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      });
    });

    // Never expose old generated/demo/manual records that were not uploaded by
    // the store owner through the official Storage folder.
    tracks = tracks.filter(isOfficialUploadedTrack);

    if (onlyActive) {
      tracks = tracks.filter((t) => t.active);
    }

    tracks.sort((a, b) => {
      const orderA = a.order ?? 999;
      const orderB = b.order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      const timeA = a.createdAt?.seconds ?? 0;
      const timeB = b.createdAt?.seconds ?? 0;
      return timeB - timeA;
    });

    return tracks;
  } catch (error) {
    console.warn('Aviso ao buscar faixas de áudio/radio:', error);
    return [];
  }
}

export async function saveTrack(track: Partial<Track>): Promise<void> {
  const trackId = track.id || doc(collection(db, MUSIC_COLLECTION)).id;
  const docRef = doc(db, MUSIC_COLLECTION, trackId);
  const isNew = !track.id;

  const payload: any = {
    ...track,
    id: trackId,
    active: track.active !== false,
    updatedAt: serverTimestamp(),
  };

  if (isNew) {
    payload.createdAt = serverTimestamp();
    payload.reproducoes = 0;
  }

  const cleanData = sanitizeFirestoreData(payload);
  await setDoc(docRef, cleanData, { merge: true });
}

export async function incrementTrackPlays(trackId: string): Promise<void> {
  try {
    const docRef = doc(db, MUSIC_COLLECTION, trackId);
    await updateDoc(docRef, { reproducoes: increment(1) });
  } catch (error) {
    console.error('Error incrementing track plays:', error);
  }
}

export async function deleteTrack(trackId: string): Promise<void> {
  try {
    const docRef = doc(db, MUSIC_COLLECTION, trackId);
    await getDoc(docRef);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting track document:', error);
    throw error;
  }
}

export async function uploadMedia(file: File, folder: 'audio' | 'covers'): Promise<string> {
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `Musicas do Site/${folder}/${Date.now()}_${sanitizedName}`;
  const storageRef = ref(storage, path);

  const metadata = { contentType: file.type };
  await uploadBytes(storageRef, file, metadata);
  return getDownloadURL(storageRef);
}

export async function syncTracksFromStorage(): Promise<{ added: number; existing: number; errors: number }> {
  let addedCount = 0;
  let existingCount = 0;
  let errorCount = 0;

  try {
    const existingTracks = await fetchAllTracks(false);
    const existingUrls = new Set(existingTracks.map(t => t.audio));
    const existingTitles = new Set(existingTracks.map(t => t.title.toLowerCase().trim()));

    const foldersToScan = ['Musicas do Site', 'Musicas do Site/audio'];
    const processedFiles = new Set<string>();

    for (const folderPath of foldersToScan) {
      try {
        const folderRef = ref(storage, folderPath);
        const listResult = await listAll(folderRef);

        for (const itemRef of listResult.items) {
          const fileName = itemRef.name;
          const fullPath = itemRef.fullPath;
          if (processedFiles.has(fullPath)) continue;
          processedFiles.add(fullPath);

          const lowerName = fileName.toLowerCase();
          if (!lowerName.endsWith('.mp3') && !lowerName.endsWith('.wav') && !lowerName.endsWith('.m4a')) continue;

          try {
            const url = await getDownloadURL(itemRef);
            if (existingUrls.has(url)) {
              existingCount++;
              continue;
            }

            let title = fileName.substring(0, fileName.lastIndexOf('.'));
            let artist = 'F PAC Sound';
            let album = '';

            if (title.includes(' - ')) {
              const parts = title.split(' - ');
              artist = parts[0].trim();
              title = parts.slice(1).join(' - ').trim();
            }

            if (existingTitles.has(title.toLowerCase().trim())) {
              existingCount++;
              continue;
            }

            const newOrder = existingTracks.length > 0
              ? Math.max(...existingTracks.map(t => t.order || 0)) + 10 + (addedCount * 10)
              : 10 + (addedCount * 10);

            await saveTrack({
              title,
              artist,
              album,
              category: 'Geral',
              order: newOrder,
              active: true,
              audio: url,
              cover: '',
              duration: 180,
            });

            existingUrls.add(url);
            existingTitles.add(title.toLowerCase().trim());
            addedCount++;
          } catch (err) {
            console.error(`Error processing file ${fileName}:`, err);
            errorCount++;
          }
        }
      } catch (folderErr) {
        console.warn(`Could not list directory ${folderPath}:`, folderErr);
      }
    }

    return { added: addedCount, existing: existingCount, errors: errorCount };
  } catch (error) {
    console.error('Error syncing tracks from storage:', error);
    throw error;
  }
}
