import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  setDoc, 
  doc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  updateDoc 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { Track } from '../../types/music';
import { defaultTracks } from '../../data/defaultTracks';
import { 
  Music, 
  Plus, 
  Trash2, 
  Edit2, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  X, 
  Loader2, 
  Upload, 
  RefreshCw, 
  Image as ImageIcon,
  PlayCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export function AdminMusic() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<string | null>(null); // trackId or 'new'
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [playlist, setPlaylist] = useState('F PAC Anthem');
  const [category, setCategory] = useState('Street Beats');
  const [description, setDescription] = useState('');
  const [audio, setAudio] = useState('');
  const [cover, setCover] = useState('');
  const [duration, setDuration] = useState(120);
  const [active, setActive] = useState(true);
  const [loop, setLoop] = useState(false);
  const [shufflePermitted, setShufflePermitted] = useState(true);

  // Audio file input ref
  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Fetch tracks in real-time
  useEffect(() => {
    const q = query(collection(db, 'music'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Track[] = [];
      snapshot.forEach((doc) => {
        fetched.push({ id: doc.id, ...doc.data() } as Track);
      });
      setTracks(fetched);
      setLoading(false);
    }, (error) => {
      console.error("Error reading music collection:", error);
      toast.error("Erro ao carregar catálogo do Firebase.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Helper to read audio file metadata and extract duration
  const getAudioDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const tempAudio = new Audio();
      tempAudio.src = url;
      tempAudio.addEventListener('loadedmetadata', () => {
        resolve(Math.round(tempAudio.duration));
      });
      tempAudio.addEventListener('error', () => {
        resolve(120); // Fallback to 2 mins
      });
    });
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingAudio(true);
      toast.loading("Enviando arquivo de áudio...", { id: "audio_upload" });

      const path = `music/audio/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const fileRef = ref(storage, path);
      
      const snapshot = await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      setAudio(downloadUrl);
      
      // Attempt auto-duration detection
      const calculatedDuration = await getAudioDuration(downloadUrl);
      setDuration(calculatedDuration);

      toast.success("Áudio enviado com sucesso!", { id: "audio_upload" });
    } catch (err) {
      console.error(err);
      toast.error("Falha no upload do áudio.", { id: "audio_upload" });
    } finally {
      setIsUploadingAudio(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingCover(true);
      toast.loading("Enviando capa...", { id: "cover_upload" });

      const path = `music/covers/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const fileRef = ref(storage, path);

      const snapshot = await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      setCover(downloadUrl);
      toast.success("Imagem enviada com sucesso!", { id: "cover_upload" });
    } catch (err) {
      console.error(err);
      toast.error("Falha no upload da capa.", { id: "cover_upload" });
    } finally {
      setIsUploadingCover(false);
    }
  };

  const startNew = () => {
    setTitle('');
    setArtist('');
    setAlbum('');
    setPlaylist('F PAC Anthem');
    setCategory('Street Beats');
    setDescription('');
    setAudio('');
    setCover('');
    setDuration(120);
    setActive(true);
    setLoop(false);
    setShufflePermitted(true);
    setIsEditing('new');
  };

  const startEdit = (track: Track) => {
    setTitle(track.title);
    setArtist(track.artist);
    setAlbum(track.album || '');
    setPlaylist(track.playlist || 'F PAC Anthem');
    setCategory(track.category || 'Street Beats');
    setDescription(track.description || '');
    setAudio(track.audio);
    setCover(track.cover || '');
    setDuration(track.duration);
    setActive(track.active);
    setLoop(track.loop || false);
    setShufflePermitted(track.shufflePermitted !== false);
    setIsEditing(track.id);
  };

  const saveTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !artist || !audio) {
      toast.error("Por favor, preencha Título, Artista e envie o arquivo de Áudio.");
      return;
    }

    try {
      const nextOrder = tracks.length > 0 ? Math.max(...tracks.map(t => t.order || 0)) + 1 : 1;

      const trackData = {
        title,
        artist,
        album,
        playlist,
        category,
        description,
        audio,
        cover: cover || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&auto=format&fit=crop&q=60', // Default cover fallback
        duration,
        active,
        loop,
        shufflePermitted,
        updatedAt: new Date()
      };

      if (isEditing === 'new') {
        const docData = {
          ...trackData,
          order: nextOrder,
          createdAt: new Date()
        };
        await addDoc(collection(db, 'music'), docData);
        toast.success("Música adicionada ao catálogo!");
      } else if (isEditing) {
        await updateDoc(doc(db, 'music', isEditing), trackData);
        toast.success("Música atualizada!");
      }

      setIsEditing(null);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar música.");
    }
  };

  const deleteTrack = async (id: string) => {
    if (!window.confirm("Deseja realmente remover esta música do F PAC SOUND?")) return;

    try {
      await deleteDoc(doc(db, 'music', id));
      toast.success("Música removida.");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao remover música.");
    }
  };

  const toggleStatus = async (track: Track) => {
    try {
      await updateDoc(doc(db, 'music', track.id), {
        active: !track.active
      });
      toast.success(track.active ? "Música desativada." : "Música ativada!");
    } catch (err) {
      console.error(err);
    }
  };

  const seedDefaults = async () => {
    if (tracks.length > 0) {
      if (!window.confirm("Você já possui músicas registradas. Deseja clonar as músicas padrão de teste mesmo assim?")) {
        return;
      }
    }

    try {
      toast.loading("Semeando músicas padrão...", { id: "seed" });
      
      for (const track of defaultTracks) {
        const uniqueId = `seeded_${track.id}_${Date.now()}`;
        const cleanTrack = { ...track };
        delete (cleanTrack as any).id; // Let Firestore auto-assign or setDoc
        await setDoc(doc(db, 'music', uniqueId), {
          ...cleanTrack,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      toast.success("Músicas padrão importadas com sucesso!", { id: "seed" });
    } catch (err) {
      console.error(err);
      toast.error("Erro ao importar faixas padrão.", { id: "seed" });
    }
  };

  const swapOrder = async (indexA: number, indexB: number) => {
    if (indexA < 0 || indexA >= tracks.length || indexB < 0 || indexB >= tracks.length) return;

    const trackA = tracks[indexA];
    const trackB = tracks[indexB];

    try {
      await updateDoc(doc(db, 'music', trackA.id), { order: trackB.order });
      await updateDoc(doc(db, 'music', trackB.id), { order: trackA.order });
      toast.success("Ordem redefinida!");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao reordenar faixas.");
    }
  };

  return (
    <div className="bg-white border-2 border-black p-6 space-y-6" id="admin_music_panel">
      {/* Upper bar controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-black/10 pb-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight italic flex items-center gap-2">
            <Music className="text-[#eab308]" size={22} /> F PAC SOUND <span className="text-[#eab308]">DESIGN DE ÁUDIO</span>
          </h2>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">
            Controle do player oficial da marca. Adicione playlists, faixas e sintonias.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={seedDefaults}
            className="flex items-center gap-1.5 px-4 py-2 border border-black hover:bg-black/5 text-xs font-black uppercase tracking-widest transition-colors cursor-pointer"
          >
            <RefreshCw size={12} /> Semear Padrão
          </button>
          <button
            onClick={startNew}
            className="flex items-center gap-1.5 px-4 py-2 bg-black text-white hover:bg-[#eab308] hover:text-black text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
          >
            <Plus size={14} /> Nova Música
          </button>
        </div>
      </div>

      {/* Editor Modal Overlay */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-55 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border-2 border-black max-w-2xl w-full p-6 md:p-8 space-y-6 relative max-h-[90vh] overflow-y-auto rounded-none text-black">
            <button
              onClick={() => setIsEditing(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-black font-black uppercase text-xs border border-gray-200 px-3 py-1 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              [X] Fechar
            </button>

            <div>
              <h3 className="text-lg font-black uppercase tracking-wide">
                {isEditing === 'new' ? 'Adicionar Nova Música' : 'Editar Faixa'}
              </h3>
              <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mt-1">
                Configure os parâmetros de playback e uploads da F PAC STORE.
              </p>
            </div>

            <form onSubmit={saveTrack} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Nome da Música *</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: F PAC Anthem"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none font-bold uppercase"
                  />
                </div>

                {/* Artist */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Artista *</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: F PAC Beats"
                    value={artist}
                    onChange={e => setArtist(e.target.value)}
                    className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none font-bold uppercase"
                  />
                </div>

                {/* Album */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Álbum</label>
                  <input
                    type="text"
                    placeholder="ex: Street Mode Vol. 1"
                    value={album}
                    onChange={e => setAlbum(e.target.value)}
                    className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none font-bold uppercase"
                  />
                </div>

                {/* Playlist Group */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Playlist</label>
                  <select
                    value={playlist}
                    onChange={e => setPlaylist(e.target.value)}
                    className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none font-bold uppercase bg-white"
                  >
                    <option value="F PAC Anthem">F PAC Anthem</option>
                    <option value="Vista a Marca">Vista a Marca</option>
                    <option value="Street Mode">Street Mode</option>
                    <option value="Identidade">Identidade</option>
                    <option value="Urban Bass">Urban Bass</option>
                  </select>
                </div>

                {/* Category / Genre */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Categoria / Gênero</label>
                  <input
                    type="text"
                    placeholder="ex: Synthwave, Trap, Lofi, Boom Bap"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none font-bold uppercase"
                  />
                </div>

                {/* Duration in seconds */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Duração (Segundos)</label>
                  <input
                    type="number"
                    min="1"
                    value={duration}
                    onChange={e => setDuration(parseInt(e.target.value) || 120)}
                    className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none font-mono"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-black/60">Descrição da Sintonia</label>
                <textarea
                  placeholder="Conte um pouco sobre a vibração da faixa..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="border border-black/20 p-2.5 text-xs focus:border-[#eab308] outline-none h-16 uppercase font-medium"
                />
              </div>

              {/* Uploads row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-dashed border-black/15 p-4 bg-gray-50">
                {/* Audio Upload */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-black/60 block">Música (Arquivo MP3) *</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isUploadingAudio}
                      onClick={() => audioInputRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-2 bg-black text-white hover:bg-[#eab308] hover:text-black text-[10px] font-black uppercase tracking-wider disabled:bg-gray-400 transition-colors cursor-pointer"
                    >
                      {isUploadingAudio ? <Loader2 className="animate-spin" size={12} /> : <Upload size={12} />}
                      Enviar MP3
                    </button>
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/mp3, audio/*"
                      onChange={handleAudioUpload}
                      className="hidden"
                    />
                    <span className="text-[9px] font-mono text-gray-500 truncate max-w-[150px]">
                      {audio ? "Áudio Selecionado ✔" : "Nenhum arquivo enviado"}
                    </span>
                  </div>
                  {audio && (
                    <input
                      type="text"
                      readOnly
                      value={audio}
                      className="border border-black/15 p-1.5 w-full text-[9px] font-mono text-gray-400 bg-white"
                    />
                  )}
                </div>

                {/* Cover Image Upload */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-black/60 block">Capa do Álbum (Imagem)</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isUploadingCover}
                      onClick={() => coverInputRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-2 bg-black text-white hover:bg-[#eab308] hover:text-black text-[10px] font-black uppercase tracking-wider disabled:bg-gray-400 transition-colors cursor-pointer"
                    >
                      {isUploadingCover ? <Loader2 className="animate-spin" size={12} /> : <ImageIcon size={12} />}
                      Enviar Imagem
                    </button>
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCoverUpload}
                      className="hidden"
                    />
                    <span className="text-[9px] font-mono text-gray-500 truncate max-w-[150px]">
                      {cover ? "Capa Selecionada ✔" : "Sem capa customizada"}
                    </span>
                  </div>
                  {cover && (
                    <div className="flex items-center gap-2 mt-1">
                      <img src={cover} alt="Preview" className="w-8 h-8 object-cover border border-black/10" referrerPolicy="no-referrer" />
                      <input
                        type="text"
                        readOnly
                        value={cover}
                        className="border border-black/15 p-1.5 flex-1 text-[9px] font-mono text-gray-400 bg-white"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Controls triggers */}
              <div className="flex items-center gap-6 border-t border-black/10 pt-4">
                <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={e => setActive(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  Habilitar Faixa (Status Ativo)
                </label>

                <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider cursor-pointer">
                  <input
                    type="checkbox"
                    checked={loop}
                    onChange={e => setLoop(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  Loop por Padrão
                </label>

                <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wider cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shufflePermitted}
                    onChange={e => setShufflePermitted(e.target.checked)}
                    className="w-4 h-4 accent-black"
                  />
                  Permitir Shuffle
                </label>
              </div>

              {/* Action row */}
              <div className="flex items-center justify-end gap-3 border-t border-black/10 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditing(null)}
                  className="px-6 py-3 border border-black text-xs font-black uppercase tracking-widest hover:bg-black/5 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 bg-black text-white hover:bg-[#eab308] hover:text-black text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
                >
                  Confirmar e Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Catalog View List */}
      {loading ? (
        <div className="p-12 text-center text-sm font-bold uppercase tracking-widest text-black/40 animate-pulse">
          Carregando F PAC SOUND catálogo...
        </div>
      ) : tracks.length === 0 ? (
        <div className="border border-dashed border-black/20 p-12 text-center space-y-4">
          <Music className="text-gray-300 mx-auto" size={48} />
          <div>
            <h4 className="text-sm font-black uppercase tracking-wide">Catálogo de Som Vazio</h4>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Semeie as faixas originais ou adicione um novo arquivo para iniciar.</p>
          </div>
          <button
            onClick={seedDefaults}
            className="px-6 py-2.5 bg-black text-white hover:bg-[#eab308] hover:text-black text-xs font-black uppercase tracking-widest transition-colors cursor-pointer"
          >
            Semear Músicas Padrão
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto border border-black">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black text-white uppercase text-[9px] font-black tracking-widest border-b border-black">
                <th className="py-3 px-4 w-12 text-center">Ord</th>
                <th className="py-3 px-4 w-16">Capa</th>
                <th className="py-3 px-4">Faixa / Artista</th>
                <th className="py-3 px-4">Playlist / Gênero</th>
                <th className="py-3 px-4 w-20 text-center font-mono">Duração</th>
                <th className="py-3 px-4 w-28 text-center">Status</th>
                <th className="py-3 px-4 w-32 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10">
              {tracks.map((track, idx) => (
                <tr key={track.id} className="hover:bg-black/[0.01] transition-colors text-xs text-black">
                  {/* Order Selector */}
                  <td className="py-4 px-4 font-mono font-black text-center text-gray-400">
                    <div className="flex flex-col items-center gap-1 justify-center">
                      <span>{(idx + 1).toString().padStart(2, '0')}</span>
                      <div className="flex items-center gap-0.5">
                        <button
                          disabled={idx === 0}
                          onClick={() => swapOrder(idx, idx - 1)}
                          className="p-0.5 hover:bg-black/5 disabled:opacity-25 hover:text-[#eab308] transition-colors cursor-pointer"
                          title="Subir na ordem"
                        >
                          <ArrowUp size={10} />
                        </button>
                        <button
                          disabled={idx === tracks.length - 1}
                          onClick={() => swapOrder(idx, idx + 1)}
                          className="p-0.5 hover:bg-black/5 disabled:opacity-25 hover:text-[#eab308] transition-colors cursor-pointer"
                          title="Descer na ordem"
                        >
                          <ArrowDown size={10} />
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Album Cover Art */}
                  <td className="py-4 px-4">
                    <div className="w-10 h-10 border border-black/10 bg-gray-50 overflow-hidden relative">
                      <img src={track.cover} alt={track.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                  </td>

                  {/* Details */}
                  <td className="py-4 px-4">
                    <p className="font-black uppercase tracking-wide">{track.title}</p>
                    <p className="text-[10px] text-[#eab308] font-bold uppercase tracking-widest mt-0.5">{track.artist}</p>
                    {track.album && <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">Álbum: {track.album}</p>}
                  </td>

                  {/* Playlist & Genre */}
                  <td className="py-4 px-4">
                    <span className="inline-block bg-black/5 text-black border border-black/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest">
                      {track.playlist || 'F PAC Anthem'}
                    </span>
                    <span className="block text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-1.5">Gênero: {track.category || 'Urban'}</span>
                  </td>

                  {/* Duration */}
                  <td className="py-4 px-4 text-center font-mono font-medium text-gray-600">
                    {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                  </td>

                  {/* Status Activator */}
                  <td className="py-4 px-4 text-center">
                    <button
                      onClick={() => toggleStatus(track)}
                      className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest transition-colors border cursor-pointer ${
                        track.active 
                          ? 'bg-green-500/10 text-green-700 border-green-500/20 hover:bg-green-500/20' 
                          : 'bg-red-500/10 text-red-700 border-red-500/20 hover:bg-red-500/20'
                      }`}
                    >
                      {track.active ? '● Ativo' : '○ Inativo'}
                    </button>
                  </td>

                  {/* Actions buttons */}
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-1.5 justify-center">
                      <button
                        onClick={() => startEdit(track)}
                        className="p-2 border border-black/10 hover:border-black/30 bg-white hover:bg-gray-50 hover:text-[#eab308] transition-colors cursor-pointer"
                        title="Editar faixa"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => deleteTrack(track.id)}
                        className="p-2 border border-black/10 hover:border-red-500/30 bg-white hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
                        title="Deletar música"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminMusic;
