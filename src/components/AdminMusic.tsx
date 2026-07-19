import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Music, Plus, Trash2, Edit2, Check, X, ArrowUp, ArrowDown, 
  Upload, Link2, RefreshCw, Eye, EyeOff, Radio, Play, Pause, Save, Loader2
} from 'lucide-react';
import { fetchAllTracks, saveTrack, deleteTrack, uploadMedia, syncTracksFromStorage } from '../services/radioService';
import { Track } from '../types/music';
import { useMusicPlayer } from '../hooks/useMusicPlayer';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';

export function AdminMusic() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Partial<Track> | null>(null);
  
  // Audio Player in Context
  const { playTrack, currentTrack, isPlaying, togglePlay, refreshTracks: refreshGlobalTracks } = useMusicPlayer();

  // Upload states
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formArtist, setFormArtist] = useState('');
  const [formAlbum, setFormAlbum] = useState('');
  const [formCategory, setFormCategory] = useState('Geral');
  const [formOrder, setFormOrder] = useState<number>(0);
  const [formActive, setFormActive] = useState(true);
  const [formAudio, setFormAudio] = useState('');
  const [formCover, setFormCover] = useState('');
  const [formDuration, setFormDuration] = useState<number>(180); // default 3 mins

  useEffect(() => {
    loadTracks();
  }, []);

  const loadTracks = async () => {
    setLoading(true);
    try {
      const all = await fetchAllTracks(false); // get ALL, including inactive
      setTracks(all);
    } catch (error) {
      toast.error('Erro ao buscar catálogo de rádio.');
    } finally {
      setLoading(false);
    }
  };

  const [syncing, setSyncing] = useState(false);

  const handleSyncFromStorage = async () => {
    if (syncing) return;
    setSyncing(true);
    const toastId = toast.loading('Sincronizando arquivos da pasta "Musicas do Site" no Firebase Storage...');
    try {
      const summary = await syncTracksFromStorage();
      toast.success(
        `Sincronização concluída! Adicionadas: ${summary.added}, Já existentes: ${summary.existing}${summary.errors > 0 ? `, Erros: ${summary.errors}` : ''}`,
        { id: toastId, duration: 6000 }
      );
      loadTracks();
      refreshGlobalTracks();
    } catch (error: any) {
      console.error(error);
      toast.error(`Falha ao sincronizar: ${error.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setSyncing(false);
    }
  };

  const openAddModal = () => {
    setEditingTrack(null);
    setFormTitle('');
    setFormArtist('');
    setFormAlbum('');
    setFormCategory('Geral');
    setFormOrder(tracks.length > 0 ? Math.max(...tracks.map(t => t.order || 0)) + 10 : 10);
    setFormActive(true);
    setFormAudio('');
    setFormCover('');
    setFormDuration(180);
    setModalOpen(true);
  };

  const openEditModal = (track: Track) => {
    setEditingTrack(track);
    setFormTitle(track.title || '');
    setFormArtist(track.artist || '');
    setFormAlbum(track.album || '');
    setFormCategory(track.category || 'Geral');
    setFormOrder(track.order || 0);
    setFormActive(track.active !== false);
    setFormAudio(track.audio || '');
    setFormCover(track.cover || '');
    setFormDuration(track.duration || 180);
    setModalOpen(true);
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAudio(true);
    try {
      const url = await uploadMedia(file, 'audio');
      setFormAudio(url);
      
      // Auto-detect audio file duration if possible
      const audioUrl = URL.createObjectURL(file);
      const tempAudio = new Audio(audioUrl);
      tempAudio.addEventListener('loadedmetadata', () => {
        if (tempAudio.duration) {
          setFormDuration(Math.round(tempAudio.duration));
        }
      });

      toast.success('Áudio carregado com sucesso!');
    } catch (error: any) {
      console.error(error);
      toast.error('Erro ao fazer upload do arquivo de áudio.');
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingCover(true);
    try {
      const url = await uploadMedia(file, 'covers');
      setFormCover(url);
      toast.success('Imagem de capa carregada!');
    } catch (error) {
      toast.error('Erro ao fazer upload da capa.');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast.error('O título da música é obrigatório.');
      return;
    }
    if (!formAudio.trim()) {
      toast.error('A URL de áudio ou upload é obrigatória.');
      return;
    }

    const toastId = toast.loading('Salvando faixa...');
    try {
      const trackPayload: Partial<Track> = {
        title: formTitle.trim(),
        artist: formArtist.trim(),
        album: formAlbum.trim(),
        category: formCategory.trim(),
        order: Number(formOrder),
        active: formActive,
        audio: formAudio.trim(),
        cover: formCover.trim(),
        duration: Number(formDuration),
      };

      if (editingTrack?.id) {
        trackPayload.id = editingTrack.id;
      }

      await saveTrack(trackPayload);
      toast.success('Música salva com sucesso!', { id: toastId });
      setModalOpen(false);
      loadTracks();
      refreshGlobalTracks(); // Update global context playlist
    } catch (error: any) {
      toast.error(`Erro ao salvar música: ${error.message}`, { id: toastId });
    }
  };

  const handleDelete = async (trackId: string, title: string) => {
    if (!confirm(`Tem certeza que deseja excluir permanentemente a faixa "${title}"?`)) return;

    const toastId = toast.loading('Excluindo faixa...');
    try {
      await deleteTrack(trackId);
      toast.success('Música removida do catálogo!', { id: toastId });
      loadTracks();
      refreshGlobalTracks();
    } catch (error: any) {
      toast.error(`Erro ao excluir: ${error.message}`, { id: toastId });
    }
  };

  const toggleTrackActive = async (track: Track) => {
    try {
      await saveTrack({
        id: track.id,
        active: !track.active
      });
      toast.success(track.active ? 'Música desativada' : 'Música ativada');
      loadTracks();
      refreshGlobalTracks();
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
    }
  };

  const adjustOrder = async (track: Track, amount: number) => {
    try {
      const newOrder = (track.order || 0) + amount;
      await saveTrack({
        id: track.id,
        order: newOrder
      });
      loadTracks();
      refreshGlobalTracks();
    } catch (error: any) {
      toast.error(`Erro ao ajustar ordem: ${error.message}`);
    }
  };

  return (
    <div className="bg-white text-black p-4 md:p-6 min-h-[500px]">
      
      {/* Tab Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-black/10 pb-6 mb-6 gap-4">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            <Radio className="text-[#eab308]" size={20} />
            Gestão de Rádio F PAC SOUND
          </h2>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mt-1">
            Controle as faixas que os clientes ouvem em segundo plano durante a navegação do site.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleSyncFromStorage}
            disabled={syncing}
            className="bg-neutral-100 hover:bg-neutral-200 text-black border border-neutral-300 py-2.5 px-4 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow disabled:opacity-50 cursor-pointer"
            title="Importa novas músicas armazenadas na pasta 'Musicas do Site' do Firebase Storage"
          >
            {syncing ? <RefreshCw className="animate-spin text-black" size={14} /> : <Upload className="text-black" size={14} />}
            Sincronizar Storage
          </button>

          <button
            onClick={openAddModal}
            className="bg-black text-[#eab308] border border-black hover:text-white hover:bg-black/90 py-2.5 px-4 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow cursor-pointer"
          >
            <Plus size={14} />
            Adicionar Nova Música
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <RefreshCw className="animate-spin text-[#eab308] mb-4" size={32} />
          <span className="text-[10px] font-black uppercase tracking-widest">Carregando catálogo musical...</span>
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-neutral-200">
          <Music size={40} className="text-neutral-300 mb-4" />
          <h4 className="text-xs font-black uppercase tracking-widest text-black mb-1">Rádio Vazia</h4>
          <p className="text-[11px] text-gray-500 max-w-sm font-medium mb-5">Você ainda não adicionou nenhuma faixa para reprodução automática.</p>
          <button
            onClick={openAddModal}
            className="bg-black text-[#eab308] py-2 px-4 text-[9px] font-black uppercase tracking-widest"
          >
            Adicionar Faixa Inicial
          </button>
        </div>
      ) : (
        <div className="border border-black/5 rounded-none overflow-hidden bg-white shadow-sm">
          {/* Table Header */}
          <div className="bg-neutral-50 px-4 py-3 border-b border-black/5 hidden md:grid md:grid-cols-12 text-[9px] font-black uppercase tracking-widest text-gray-400">
            <div className="col-span-1 text-center">Ordem</div>
            <div className="col-span-4">Título / Artista</div>
            <div className="col-span-2">Categoria</div>
            <div className="col-span-1 text-center">Plays</div>
            <div className="col-span-1 text-center">Duração</div>
            <div className="col-span-1 text-center">Status</div>
            <div className="col-span-2 text-right">Ações</div>
          </div>

          {/* Table Body / Tracks List */}
          <div className="divide-y divide-black/5">
            {tracks.map((track) => {
              const isCurrentPlaying = currentTrack?.id === track.id && isPlaying;
              return (
                <div 
                  key={track.id}
                  className={cn(
                    "p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center hover:bg-neutral-50/50 transition-colors",
                    !track.active && "bg-neutral-50/40 text-gray-400"
                  )}
                >
                  {/* Sorting Weights Controls */}
                  <div className="col-span-1 flex md:flex-col items-center justify-center gap-1 border-b md:border-b-0 pb-2 md:pb-0">
                    <button 
                      onClick={() => adjustOrder(track, -1)}
                      className="p-1 hover:bg-neutral-200 transition-colors border border-neutral-200 text-neutral-600 rounded-none"
                      title="Subir na fila"
                    >
                      <ArrowUp size={11} />
                    </button>
                    <span className="font-mono text-[11px] font-black px-2 min-w-8 text-center">{track.order ?? 0}</span>
                    <button 
                      onClick={() => adjustOrder(track, 1)}
                      className="p-1 hover:bg-neutral-200 transition-colors border border-neutral-200 text-neutral-600 rounded-none"
                      title="Descer na fila"
                    >
                      <ArrowDown size={11} />
                    </button>
                  </div>

                  {/* Cover, Title, Artist */}
                  <div className="col-span-4 flex items-center gap-3">
                    <div className="relative w-12 h-12 bg-neutral-900 border border-black/5 flex items-center justify-center overflow-hidden shrink-0">
                      {track.cover ? (
                        <img src={track.cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <Music size={16} className="text-neutral-600" />
                      )}
                      
                      {/* Playback action on cover click */}
                      <button 
                        onClick={() => playTrack(track)}
                        className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-[#eab308]"
                      >
                        {isCurrentPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-black uppercase tracking-wider truncate text-black">
                          {track.title}
                        </p>
                        {isCurrentPlaying && (
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping shrink-0" />
                        )}
                      </div>
                      <p className="text-[9px] text-gray-400 font-bold tracking-wider uppercase truncate mt-0.5">
                        {track.artist || 'F PAC SOUND'}
                      </p>
                      {track.album && (
                        <p className="text-[8px] text-gray-400 uppercase tracking-widest italic truncate mt-0.5">
                          Álbum: {track.album}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Category Tag */}
                  <div className="col-span-2">
                    <span className="text-[8.5px] font-black uppercase tracking-widest border border-black/5 bg-neutral-50 px-2 py-0.5 inline-block">
                      {track.category || 'Geral'}
                    </span>
                  </div>

                  {/* Playback count */}
                  <div className="col-span-1 md:text-center font-mono text-[10px] font-bold text-gray-700">
                    {track.reproducoes || 0}
                  </div>

                  {/* Duration formatted */}
                  <div className="col-span-1 md:text-center font-mono text-[10px] font-bold text-gray-500">
                    {Math.floor((track.duration || 0) / 60)}:
                    {String((track.duration || 0) % 60).padStart(2, '0')}
                  </div>

                  {/* Active Toggle Switch */}
                  <div className="col-span-1 flex md:justify-center">
                    <button
                      onClick={() => toggleTrackActive(track)}
                      className={cn(
                        "p-1.5 rounded-none transition-all border flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest",
                        track.active 
                          ? "bg-green-500/10 border-green-500/20 text-green-600 hover:bg-green-500/20" 
                          : "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20"
                      )}
                    >
                      {track.active ? (
                        <>
                          <Eye size={12} />
                          <span>Ativo</span>
                        </>
                      ) : (
                        <>
                          <EyeOff size={12} />
                          <span>Inativo</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Action Buttons */}
                  <div className="col-span-2 flex items-center justify-end gap-2 border-t md:border-t-0 pt-2 md:pt-0">
                    <button
                      onClick={() => openEditModal(track)}
                      className="p-2 border border-neutral-200 text-black hover:bg-neutral-100 rounded-none transition-colors"
                      title="Editar metadados"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      onClick={() => handleDelete(track.id, track.title)}
                      className="p-2 border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-none transition-colors"
                      title="Excluir música"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TRACK MODAL FORM (Slide Over / Modal) */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs">
            {/* Modal Backdrop overlay click */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="absolute inset-0"
            />

            {/* Modal Body Container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg h-full bg-white text-black p-6 md:p-8 flex flex-col shadow-2xl overflow-y-auto"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-black/10 pb-5 mb-6">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-black">
                    {editingTrack ? 'Editar Faixa Musical' : 'Adicionar Nova Faixa'}
                  </h3>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">
                    Preencha os metadados e envie o arquivo para o Firebase Storage.
                  </p>
                </div>
                <button 
                  onClick={() => setModalOpen(false)}
                  className="p-2 hover:bg-neutral-100 transition-colors border border-black/5"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Form body */}
              <form onSubmit={handleSave} className="space-y-5 flex-1 pb-10">
                {/* Track Name */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Título da Música *</label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full border border-black/10 bg-white p-3 text-xs font-bold focus:outline-none focus:border-black rounded-none uppercase"
                    placeholder="Ex: BEAT URBANO F PAC"
                  />
                </div>

                {/* Artist Name */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Artista / Banda</label>
                  <input
                    type="text"
                    value={formArtist}
                    onChange={(e) => setFormArtist(e.target.value)}
                    className="w-full border border-black/10 bg-white p-3 text-xs font-bold focus:outline-none focus:border-black rounded-none uppercase"
                    placeholder="Ex: F PAC SOUNDS"
                  />
                </div>

                {/* Album Name */}
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Álbum</label>
                  <input
                    type="text"
                    value={formAlbum}
                    onChange={(e) => setFormAlbum(e.target.value)}
                    className="w-full border border-black/10 bg-white p-3 text-xs font-bold focus:outline-none focus:border-black rounded-none uppercase"
                    placeholder="Ex: COLEÇÃO VERÃO 2026"
                  />
                </div>

                {/* Grid (Category, Order, Duration) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Category Selection */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Categoria</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full border border-black/10 bg-white p-3 text-xs font-bold focus:outline-none focus:border-black rounded-none"
                    >
                      <option value="Geral">Geral</option>
                      <option value="Beats">Beats</option>
                      <option value="Rap / Trap">Rap / Trap</option>
                      <option value="Instrumental">Instrumental</option>
                      <option value="Lo-Fi">Lo-Fi</option>
                    </select>
                  </div>

                  {/* Sorting weight order */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Peso / Ordem</label>
                    <input
                      type="number"
                      value={formOrder}
                      onChange={(e) => setFormOrder(Number(e.target.value))}
                      className="w-full border border-black/10 bg-white p-3 text-xs font-bold focus:outline-none focus:border-black rounded-none"
                    />
                  </div>

                  {/* Duration seconds */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 block">Duração (Segundos)</label>
                    <input
                      type="number"
                      required
                      value={formDuration}
                      onChange={(e) => setFormDuration(Number(e.target.value))}
                      className="w-full border border-black/10 bg-white p-3 text-xs font-bold focus:outline-none focus:border-black rounded-none"
                    />
                  </div>
                </div>

                {/* AUDIO FILE SELECTION & UPLOAD */}
                <div className="space-y-2 border border-black/5 bg-neutral-50 p-4 rounded-none">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">Arquivo de Áudio (.mp3) *</span>
                    {uploadingAudio && (
                      <span className="text-[8.5px] text-[#eab308] font-black uppercase tracking-widest flex items-center gap-1">
                        <Loader2 className="animate-spin" size={10} />
                        Enviando...
                      </span>
                    )}
                  </div>
                  
                  {/* File Upload Trigger */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Cole a URL ou faça upload abaixo..."
                      value={formAudio}
                      onChange={(e) => setFormAudio(e.target.value)}
                      className="flex-1 border border-black/10 bg-white p-2.5 text-xs focus:outline-none focus:border-black rounded-none"
                    />
                    <label className="bg-black text-white hover:bg-neutral-800 p-2.5 text-xs font-black uppercase cursor-pointer flex items-center justify-center shrink-0 border border-black transition-all">
                      <Upload size={14} />
                      <input
                        type="file"
                        accept="audio/mp3,audio/*"
                        onChange={handleAudioUpload}
                        className="hidden"
                        disabled={uploadingAudio}
                      />
                    </label>
                  </div>
                  <p className="text-[8px] text-gray-400 font-bold uppercase leading-relaxed tracking-wider">
                    Dica: Faça upload do seu arquivo .mp3 diretamente para o Firebase Storage para garantir que carregue com segurança no player.
                  </p>
                </div>

                {/* COVER IMAGE SELECTION & UPLOAD */}
                <div className="space-y-2 border border-black/5 bg-neutral-50 p-4 rounded-none">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 block">Imagem de Capa (Opcional)</span>
                    {uploadingCover && (
                      <span className="text-[8.5px] text-[#eab308] font-black uppercase tracking-widest flex items-center gap-1">
                        <Loader2 className="animate-spin" size={10} />
                        Enviando...
                      </span>
                    )}
                  </div>
                  
                  <div className="flex gap-3 items-center">
                    {formCover && (
                      <div className="w-12 h-12 bg-neutral-200 overflow-hidden border border-black/5 shrink-0">
                        <img src={formCover} alt="Capa" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        placeholder="Cole a URL ou faça upload..."
                        value={formCover}
                        onChange={(e) => setFormCover(e.target.value)}
                        className="flex-1 border border-black/10 bg-white p-2.5 text-xs focus:outline-none focus:border-black rounded-none"
                      />
                      <label className="bg-black text-white hover:bg-neutral-800 p-2.5 text-xs font-black uppercase cursor-pointer flex items-center justify-center shrink-0 border border-black transition-all">
                        <Upload size={14} />
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleCoverUpload}
                          className="hidden"
                          disabled={uploadingCover}
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Active Switch Status */}
                <div className="flex items-center justify-between border-t border-black/10 pt-4 mt-2">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-widest text-black block">Disponibilidade Imediata</span>
                    <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider block mt-0.5">Permitir reprodução instantânea para os visitantes.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormActive(!formActive)}
                    className={cn(
                      "px-4 py-2 border text-[10px] font-black uppercase tracking-widest transition-all",
                      formActive 
                        ? "bg-green-500/10 border-green-500/20 text-green-600" 
                        : "bg-red-500/10 border-red-500/20 text-red-500"
                    )}
                  >
                    {formActive ? 'Música Ativa' : 'Música Inativa'}
                  </button>
                </div>

                {/* Actions bottom footer */}
                <div className="flex items-center gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="flex-1 border border-black/10 hover:bg-neutral-50 py-3 text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-black text-[#eab308] hover:text-white py-3 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                  >
                    <Save size={14} />
                    Salvar Faixa
                  </button>
                </div>

              </form>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
