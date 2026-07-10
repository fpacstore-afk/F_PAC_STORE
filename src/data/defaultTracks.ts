import { Track } from '../types/music';

export const defaultTracks: Track[] = [
  {
    id: 'f_pac_anthem_01',
    title: 'F PAC Anthem',
    artist: 'F PAC Beats',
    album: 'Street Mode Vol. 1',
    cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60',
    audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    duration: 372,
    active: true,
    order: 1,
    playlist: 'F PAC Anthem',
    category: 'Synthwave',
    description: 'O som oficial de lançamento das novas coleções F PAC Store.',
    loop: false,
    shufflePermitted: true
  },
  {
    id: 'vista_a_marca_02',
    title: 'Vista a Marca',
    artist: 'F PAC Records',
    album: 'Cyberpunk Streetwear',
    cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=60',
    audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    duration: 423,
    active: true,
    order: 2,
    playlist: 'Vista a Marca',
    category: 'Lofi Trap',
    description: 'Som ambiente para desbravar os estilos e looks urbanos.',
    loop: false,
    shufflePermitted: true
  },
  {
    id: 'street_mode_03',
    title: 'Street Mode',
    artist: 'Street Beats Club',
    album: 'Urban Anthem',
    cover: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&auto=format&fit=crop&q=60',
    audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    duration: 324,
    active: true,
    order: 3,
    playlist: 'Street Mode',
    category: 'Boom Bap',
    description: 'Batidas old-school de Nova York para guiar sua navegação.',
    loop: false,
    shufflePermitted: true
  },
  {
    id: 'identidade_04',
    title: 'Identidade',
    artist: 'Ambient Street',
    album: 'Modern Identity',
    cover: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&auto=format&fit=crop&q=60',
    audio: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    duration: 302,
    active: true,
    order: 4,
    playlist: 'Identidade',
    category: 'Chill Ambiance',
    description: 'Música minimalista e profunda que traduz a nossa essência.',
    loop: false,
    shufflePermitted: true
  }
];
