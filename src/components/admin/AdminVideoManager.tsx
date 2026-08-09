import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Film, Plus, Trash2, Edit3, ArrowUp, ArrowDown, Eye, EyeOff, 
  Search, Video, CheckCircle2, AlertCircle, RefreshCw, X, Play, Pause,
  Upload, Link as LinkIcon, Sparkles, Layers, ShieldCheck
} from 'lucide-react';
import { collection, doc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Estampa, EstampaVideo } from '../../types/video';
import toast from 'react-hot-toast';

interface AdminVideoManagerProps {
  estampas?: { id: string; name: string; slotIndex?: number }[];
}

export default function AdminVideoManager({ estampas: propEstampas }: AdminVideoManagerProps) {
  const [fullEstampas, setFullEstampas] = useState<Estampa[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStampFilter, setSelectedStampFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<{ estampaId: string; video: EstampaVideo } | null>(null);

  // Form State for Add / Edit Video
  const [formData, setFormData] = useState({
    estampaId: '',
    title: '',
    url: '',
    order: 1,
    status: 'active' as 'active' | 'inactive',
    uploading: false
  });

  // Preview Player Modal
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);

  // Real-time listener for ALL stamp documents in Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'estampas'), (snapshot) => {
      const list: Estampa[] = snapshot.docs.map((d) => {
        const data = d.data();
        
        // Normalize videos array
        let videosArray: EstampaVideo[] = [];
        if (Array.isArray(data.videos) && data.videos.length > 0) {
          videosArray = data.videos.map((v: any, idx: number) => ({
            id: v.id || `vid_${idx}_${Date.now()}`,
            url: typeof v === 'string' ? v : v.url || '',
            title: v.title || `Vídeo ${idx + 1}`,
            publicId: v.publicId || '',
            duration: v.duration || 0,
            format: v.format || 'mp4',
            order: v.order || idx + 1,
            status: v.status || 'active',
            createdAt: v.createdAt || new Date().toISOString()
          }));
        } else if (data.video) {
          const vUrl = typeof data.video === 'string' ? data.video : data.video.url || '';
          if (vUrl) {
            videosArray = [{
              id: `legacy_${d.id}`,
              url: vUrl,
              title: 'Vídeo Principal',
              order: 1,
              status: 'active',
              createdAt: new Date().toISOString()
            }];
          }
        }

        return {
          id: d.id,
          name: data.name || `Estampa ${data.slotIndex ? `#${data.slotIndex}` : d.id}`,
          slotIndex: data.slotIndex,
          image: data.image || data.imageUrl || '',
          imageUrl: data.imageUrl || data.image || '',
          video: data.video,
          videos: videosArray,
          description: data.description || ''
        };
      });

      // Sort by slotIndex if available
      list.sort((a, b) => (a.slotIndex || 99) - (b.slotIndex || 99));
      setFullEstampas(list);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching stamps for videos:', error);
      toast.error('Erro ao carregar dados das estampas.');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Compute aggregate stats
  const totalStamps = fullEstampas.length;
  const stampsWithVideos = fullEstampas.filter((e) => (e.videos || []).length > 0);
  const allVideosList = fullEstampas.flatMap((e) => 
    (e.videos || []).map((v) => ({ ...v, estampaId: e.id, estampaName: e.name, slotIndex: e.slotIndex }))
  );
  const activeVideosCount = allVideosList.filter((v) => v.status !== 'inactive').length;

  // Open Modal for Add
  const handleOpenAddModal = (stampId?: string) => {
    const targetStampId = stampId || (fullEstampas[0]?.id || '');
    const stamp = fullEstampas.find((e) => e.id === targetStampId);
    const currentVideosCount = (stamp?.videos || []).length;

    setEditingVideo(null);
    setFormData({
      estampaId: targetStampId,
      title: `Vídeo ${currentVideosCount + 1}`,
      url: '',
      order: currentVideosCount + 1,
      status: 'active',
      uploading: false
    });
    setIsModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEditModal = (estampaId: string, video: EstampaVideo) => {
    setEditingVideo({ estampaId, video });
    setFormData({
      estampaId,
      title: video.title || 'Vídeo',
      url: video.url,
      order: video.order || 1,
      status: (video.status as 'active' | 'inactive') || 'active',
      uploading: false
    });
    setIsModalOpen(true);
  };

  // Handle Save (Create or Update Video)
  const handleSaveVideo = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.estampaId) {
      toast.error('Selecione uma estampa.');
      return;
    }

    if (!formData.url.trim()) {
      toast.error('Informe a URL do vídeo.');
      return;
    }

    // Basic URL validation
    const cleanUrl = formData.url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://') && !cleanUrl.startsWith('data:')) {
      toast.error('A URL do vídeo deve ser um link válido (https://...).');
      return;
    }

    try {
      const stampRef = doc(db, 'estampas', formData.estampaId);
      const stampSnap = await getDoc(stampRef);

      if (!stampSnap.exists()) {
        toast.error('Estampa não encontrada no Firestore.');
        return;
      }

      const stampData = stampSnap.data();
      let currentVideos: EstampaVideo[] = Array.isArray(stampData.videos) ? [...stampData.videos] : [];

      if (editingVideo) {
        // Updating existing video
        currentVideos = currentVideos.map((v) => {
          if (v.id === editingVideo.video.id) {
            return {
              ...v,
              title: formData.title.trim(),
              url: cleanUrl,
              order: formData.order,
              status: formData.status
            };
          }
          return v;
        });
      } else {
        // Adding new video
        const newVideoObj: EstampaVideo = {
          id: `vid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          url: cleanUrl,
          title: formData.title.trim() || `Vídeo ${currentVideos.length + 1}`,
          order: formData.order || currentVideos.length + 1,
          status: formData.status,
          createdAt: new Date().toISOString()
        };

        // Check for duplicate URL in the same stamp
        if (currentVideos.some((v) => v.url === cleanUrl)) {
          toast.error('Este vídeo já está vinculado a esta estampa.');
          return;
        }

        currentVideos.push(newVideoObj);
      }

      // Re-sort videos by order
      currentVideos.sort((a, b) => (a.order || 0) - (b.order || 0));

      // Primary video string for legacy backward compatibility
      const primaryVideoUrl = currentVideos.find((v) => v.status === 'active')?.url || currentVideos[0]?.url || '';

      // Update ONLY the estampa document in Firestore. NEVER TOUCH PRODUCTS!
      await updateDoc(stampRef, {
        videos: currentVideos,
        video: primaryVideoUrl,
        updatedAt: new Date().toISOString()
      });

      toast.success(editingVideo ? 'Vídeo atualizado com sucesso!' : 'Vídeo adicionado à estampa!');
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving video:', error);
      toast.error('Erro ao salvar vídeo na estampa.');
    }
  };

  // Handle Delete Video
  const handleDeleteVideo = async (estampaId: string, videoId: string, videoTitle?: string) => {
    if (!window.confirm(`Tem certeza que deseja remover o vídeo "${videoTitle || 'selecionado'}" desta estampa?`)) return;

    try {
      const stampRef = doc(db, 'estampas', estampaId);
      const stampSnap = await getDoc(stampRef);

      if (!stampSnap.exists()) return;

      const stampData = stampSnap.data();
      let currentVideos: EstampaVideo[] = Array.isArray(stampData.videos) ? stampData.videos : [];

      const updatedVideos = currentVideos.filter((v) => v.id !== videoId);
      const primaryVideoUrl = updatedVideos.find((v) => v.status === 'active')?.url || updatedVideos[0]?.url || '';

      await updateDoc(stampRef, {
        videos: updatedVideos,
        video: primaryVideoUrl,
        updatedAt: new Date().toISOString()
      });

      toast.success('Vídeo removido da estampa.');
    } catch (error) {
      console.error('Error deleting video:', error);
      toast.error('Erro ao remover vídeo.');
    }
  };

  // Toggle Video Active/Inactive
  const handleToggleStatus = async (estampaId: string, videoId: string, currentStatus?: string) => {
    const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';

    try {
      const stampRef = doc(db, 'estampas', estampaId);
      const stampSnap = await getDoc(stampRef);

      if (!stampSnap.exists()) return;

      const stampData = stampSnap.data();
      let currentVideos: EstampaVideo[] = Array.isArray(stampData.videos) ? stampData.videos : [];

      const updatedVideos = currentVideos.map((v) => (v.id === videoId ? { ...v, status: newStatus } : v));
      const primaryVideoUrl = updatedVideos.find((v) => v.status === 'active')?.url || updatedVideos[0]?.url || '';

      await updateDoc(stampRef, {
        videos: updatedVideos,
        video: primaryVideoUrl,
        updatedAt: new Date().toISOString()
      });

      toast.success(`Vídeo ${newStatus === 'active' ? 'ativado' : 'desativado'}.`);
    } catch (error) {
      console.error('Error toggling status:', error);
      toast.error('Erro ao alterar status do vídeo.');
    }
  };

  // Reorder Video (Up or Down)
  const handleReorder = async (estampaId: string, videoId: string, direction: 'up' | 'down') => {
    try {
      const stampRef = doc(db, 'estampas', estampaId);
      const stampSnap = await getDoc(stampRef);

      if (!stampSnap.exists()) return;

      const stampData = stampSnap.data();
      let currentVideos: EstampaVideo[] = Array.isArray(stampData.videos) ? [...stampData.videos] : [];
      currentVideos.sort((a, b) => (a.order || 0) - (b.order || 0));

      const index = currentVideos.findIndex((v) => v.id === videoId);
      if (index === -1) return;

      if (direction === 'up' && index > 0) {
        const temp = currentVideos[index].order;
        currentVideos[index].order = currentVideos[index - 1].order;
        currentVideos[index - 1].order = temp;
      } else if (direction === 'down' && index < currentVideos.length - 1) {
        const temp = currentVideos[index].order;
        currentVideos[index].order = currentVideos[index + 1].order;
        currentVideos[index + 1].order = temp;
      }

      currentVideos.sort((a, b) => (a.order || 0) - (b.order || 0));
      const primaryVideoUrl = currentVideos.find((v) => v.status === 'active')?.url || currentVideos[0]?.url || '';

      await updateDoc(stampRef, {
        videos: currentVideos,
        video: primaryVideoUrl,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error reordering video:', error);
    }
  };

  // Filter Stamps based on search and stamp filter
  const filteredStamps = fullEstampas.filter((stamp) => {
    const matchesSearch = stamp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (stamp.videos || []).some((v) => (v.title || '').toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStamp = selectedStampFilter === 'all' || stamp.id === selectedStampFilter;

    if (statusFilter === 'active') {
      const hasActive = (stamp.videos || []).some((v) => v.status !== 'inactive');
      return matchesSearch && matchesStamp && hasActive;
    }
    if (statusFilter === 'inactive') {
      const hasInactive = (stamp.videos || []).some((v) => v.status === 'inactive');
      return matchesSearch && matchesStamp && hasInactive;
    }

    return matchesSearch && matchesStamp;
  });

  return (
    <div className="space-y-6 text-white font-sans">
      {/* HEADER DASHBOARD STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-black/60 border border-white/10 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Total Estampas</span>
            <span className="text-2xl font-black font-mono text-white">{totalStamps}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-300">
            <Layers size={20} />
          </div>
        </div>

        <div className="bg-black/60 border border-white/10 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Estampas com Vídeos</span>
            <span className="text-2xl font-black font-mono text-[#eab308]">{stampsWithVideos.length}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#eab308]/10 border border-[#eab308]/30 flex items-center justify-center text-[#eab308]">
            <Video size={20} />
          </div>
        </div>

        <div className="bg-black/60 border border-white/10 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Total de Vídeos</span>
            <span className="text-2xl font-black font-mono text-sky-400">{allVideosList.length}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-400/30 flex items-center justify-center text-sky-400">
            <Film size={20} />
          </div>
        </div>

        <div className="bg-black/60 border border-white/10 p-5 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block">Vídeos Ativos</span>
            <span className="text-2xl font-black font-mono text-emerald-400">{activeVideosCount}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      {/* FILTER & ACTION TOOLBAR */}
      <div className="bg-black/40 border border-white/10 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto flex-1">
          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text"
              placeholder="Buscar por estampa ou vídeo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-black/60 border border-white/15 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-[#eab308] rounded-lg font-medium"
            />
          </div>

          {/* Stamp Filter Dropdown */}
          <select
            value={selectedStampFilter}
            onChange={(e) => setSelectedStampFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-black/60 border border-white/15 text-xs text-white rounded-lg focus:outline-none focus:border-[#eab308] cursor-pointer"
          >
            <option value="all">Todas as Estampas ({fullEstampas.length})</option>
            {fullEstampas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.slotIndex ? `#${e.slotIndex} ` : ''}{e.name} ({(e.videos || []).length} vídeos)
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full sm:w-auto px-3 py-2 bg-black/60 border border-white/15 text-xs text-white rounded-lg focus:outline-none focus:border-[#eab308] cursor-pointer"
          >
            <option value="all">Todos Status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </div>

        {/* Add Video Button */}
        <button
          onClick={() => handleOpenAddModal()}
          className="w-full md:w-auto bg-[#eab308] text-black font-black uppercase tracking-wider px-5 py-2.5 text-xs hover:bg-white transition-all flex items-center justify-center gap-2 rounded-lg cursor-pointer shadow-lg shadow-[#eab308]/10 shrink-0"
        >
          <Plus size={16} /> Vincular Novo Vídeo
        </button>
      </div>

      {/* ARCHITECTURE NOTICE */}
      <div className="bg-emerald-950/20 border border-emerald-500/30 p-3.5 rounded-xl flex items-center gap-3 text-xs text-emerald-300">
        <ShieldCheck size={18} className="shrink-0 text-emerald-400" />
        <div>
          <strong className="font-bold uppercase tracking-wider block">Arquitetura de Mídias Limpa & Segura</strong>
          <span className="text-[11px] text-emerald-300/80">
            Vídeos são mídias adicionais diretamente vinculadas à Estampa (`estampas`). Nenhuma alteração cria ou duplica itens no catálogo (`products`).
          </span>
        </div>
      </div>

      {/* STAMPS & VIDEOS GRID */}
      {loading ? (
        <div className="py-20 text-center text-gray-500 text-xs uppercase font-bold tracking-widest animate-pulse">
          Carregando banco de mídias...
        </div>
      ) : filteredStamps.length === 0 ? (
        <div className="bg-black/20 border border-white/10 p-12 text-center rounded-2xl text-gray-400">
          <Film size={32} className="mx-auto mb-2 opacity-40 text-[#eab308]" />
          <p className="text-sm font-bold uppercase tracking-wide">Nenhuma estampa ou vídeo encontrado.</p>
          <p className="text-xs text-gray-500 mt-1">Ajuste seus filtros de busca ou adicione um novo vídeo a uma estampa.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredStamps.map((stamp) => {
            const stampVideos = stamp.videos || [];

            return (
              <div 
                key={stamp.id}
                className="bg-[#12121c] border border-white/10 rounded-2xl p-5 shadow-xl transition-all hover:border-white/20"
              >
                {/* Stamp Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-white/10 mb-4">
                  <div className="flex items-center gap-3">
                    {/* Stamp Thumbnail */}
                    <div className="w-12 h-12 rounded-xl bg-black border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                      {stamp.image || stamp.imageUrl ? (
                        <img 
                          src={stamp.image || stamp.imageUrl} 
                          alt={stamp.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] font-mono text-gray-500">SEM FOTO</span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        {stamp.slotIndex && (
                          <span className="bg-[#eab308] text-black text-[9px] font-black px-1.5 py-0.5 rounded font-mono">
                            SLOT #{stamp.slotIndex}
                          </span>
                        )}
                        <h3 className="text-base font-black uppercase text-white font-mono">
                          {stamp.code ? `SKU: ${stamp.code}` : stamp.name}
                        </h3>
                      </div>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {stampVideos.length} {stampVideos.length === 1 ? 'vídeo vinculado' : 'vídeos vinculados'}
                      </span>
                    </div>
                  </div>

                  {/* Add Video specifically for this stamp */}
                  <button
                    onClick={() => handleOpenAddModal(stamp.id)}
                    className="bg-white/5 hover:bg-[#eab308] hover:text-black transition-colors text-white text-[11px] font-black uppercase tracking-wider px-3.5 py-2 rounded-lg border border-white/10 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={14} /> Adicionar Vídeo
                  </button>
                </div>

                {/* Videos Cards inside Stamp */}
                {stampVideos.length === 0 ? (
                  <div className="bg-black/30 border border-dashed border-white/10 p-6 rounded-xl text-center text-xs text-gray-500 uppercase font-bold tracking-wider">
                    Nenhum vídeo vinculado a esta estampa.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {stampVideos.map((vid, idx) => (
                      <div 
                        key={vid.id}
                        className={`bg-black/60 border rounded-xl p-3.5 flex flex-col justify-between relative group ${
                          vid.status === 'inactive' ? 'border-red-500/30 opacity-60' : 'border-white/10 hover:border-[#eab308]/50'
                        }`}
                      >
                        {/* Video Thumbnail / Preview */}
                        <div className="relative aspect-video rounded-lg bg-black overflow-hidden mb-3 border border-white/10 group-hover:border-white/30">
                          {vid.url ? (
                            <video 
                              src={vid.url} 
                              className="w-full h-full object-cover" 
                              muted 
                              loop 
                              onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                              onMouseLeave={(e) => e.currentTarget.pause()}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-gray-600 font-mono">
                              SEM VÍDEO
                            </div>
                          )}

                          {/* Play Preview Overlay */}
                          <button
                            onClick={() => setPreviewVideoUrl(vid.url)}
                            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                            title="Visualizar Vídeo em Tela Cheia"
                          >
                            <Play size={28} className="fill-white" />
                          </button>

                          {/* Order Badge */}
                          <span className="absolute top-1.5 left-1.5 bg-black/80 text-white border border-white/20 text-[9px] font-mono font-black px-1.5 py-0.5 rounded">
                            #{vid.order || idx + 1}
                          </span>

                          {/* Status Badge */}
                          <span className={`absolute top-1.5 right-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                            vid.status === 'inactive' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-black'
                          }`}>
                            {vid.status === 'inactive' ? 'Inativo' : 'Ativo'}
                          </span>
                        </div>

                        {/* Title and Info */}
                        <div className="mb-3">
                          <h4 className="text-xs font-bold text-white line-clamp-1 uppercase tracking-tight">
                            {vid.title || `Vídeo #${vid.order || idx + 1}`}
                          </h4>
                          <span className="text-[9px] text-gray-400 font-mono truncate block mt-0.5">
                            {vid.url}
                          </span>
                        </div>

                        {/* Action Toolbar */}
                        <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {/* Reorder Up */}
                            <button
                              disabled={idx === 0}
                              onClick={() => handleReorder(stamp.id, vid.id, 'up')}
                              className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 text-gray-300 cursor-pointer"
                              title="Mover para Cima"
                            >
                              <ArrowUp size={12} />
                            </button>

                            {/* Reorder Down */}
                            <button
                              disabled={idx === stampVideos.length - 1}
                              onClick={() => handleReorder(stamp.id, vid.id, 'down')}
                              className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 text-gray-300 cursor-pointer"
                              title="Mover para Baixo"
                            >
                              <ArrowDown size={12} />
                            </button>

                            {/* Toggle Active / Inactive */}
                            <button
                              onClick={() => handleToggleStatus(stamp.id, vid.id, vid.status)}
                              className={`p-1.5 rounded hover:bg-white/10 cursor-pointer ${
                                vid.status === 'inactive' ? 'text-red-400' : 'text-emerald-400'
                              }`}
                              title={vid.status === 'inactive' ? 'Ativar Vídeo' : 'Desativar Vídeo'}
                            >
                              {vid.status === 'inactive' ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Edit */}
                            <button
                              onClick={() => handleOpenEditModal(stamp.id, vid)}
                              className="p-1.5 rounded hover:bg-[#eab308] hover:text-black text-gray-300 transition-colors cursor-pointer"
                              title="Editar Detalhes"
                            >
                              <Edit3 size={12} />
                            </button>

                            {/* Delete */}
                            <button
                              onClick={() => handleDeleteVideo(stamp.id, vid.id, vid.title)}
                              className="p-1.5 rounded hover:bg-red-500 hover:text-white text-gray-400 transition-colors cursor-pointer"
                              title="Remover Vídeo"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ADD / EDIT VIDEO MODAL */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#14141f] border border-white/20 p-6 rounded-2xl w-full max-w-lg shadow-2xl relative text-white"
            >
              <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-2 text-[#eab308] mb-1">
                <Film size={18} />
                <span className="text-[10px] font-black uppercase tracking-[0.25em]">VÍDEO DA ESTAMPA</span>
              </div>

              <h3 className="text-xl font-black uppercase tracking-tight mb-6">
                {editingVideo ? 'Editar Vídeo da Estampa' : 'Vincular Novo Vídeo'}
              </h3>

              <form onSubmit={handleSaveVideo} className="space-y-4">
                {/* Select Stamp */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                    Estampa de Destino
                  </label>
                  <select
                    disabled={!!editingVideo}
                    value={formData.estampaId}
                    onChange={(e) => setFormData({ ...formData, estampaId: e.target.value })}
                    className="w-full p-3 bg-black/60 border border-white/20 rounded-lg text-xs text-white focus:outline-none focus:border-[#eab308] cursor-pointer disabled:opacity-50"
                  >
                    {fullEstampas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.slotIndex ? `Slot #${e.slotIndex} - ` : ''}{e.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Video Title */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                    Título do Vídeo (Identificação)
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="Ex: Teaser Lançamento, Vídeo de Costas, etc."
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full p-3 bg-black/60 border border-white/20 rounded-lg text-xs text-white focus:outline-none focus:border-[#eab308]"
                  />
                </div>

                {/* Video URL */}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                    URL do Vídeo (Cloudinary, Direct MP4/WebM ou Embed)
                  </label>
                  <div className="relative">
                    <LinkIcon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input 
                      type="url"
                      required
                      placeholder="https://res.cloudinary.com/.../video.mp4"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 bg-black/60 border border-white/20 rounded-lg text-xs text-white focus:outline-none focus:border-[#eab308] font-mono"
                    />
                  </div>
                </div>

                {/* Order and Status */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Ordem de Exibição
                    </label>
                    <input 
                      type="number"
                      min={1}
                      max={20}
                      value={formData.order}
                      onChange={(e) => setFormData({ ...formData, order: parseInt(e.target.value) || 1 })}
                      className="w-full p-3 bg-black/60 border border-white/20 rounded-lg text-xs text-white focus:outline-none focus:border-[#eab308] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                      Status do Vídeo
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full p-3 bg-black/60 border border-white/20 rounded-lg text-xs text-white focus:outline-none focus:border-[#eab308] cursor-pointer"
                    >
                      <option value="active">Ativo (Exibir na loja)</option>
                      <option value="inactive">Inativo (Ocultar)</option>
                    </select>
                  </div>
                </div>

                {/* Live Preview inside Modal */}
                {formData.url && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">
                      Pré-visualização do Vídeo
                    </span>
                    <div className="aspect-video bg-black rounded-lg overflow-hidden border border-white/20">
                      <video 
                        src={formData.url} 
                        controls 
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-lg border border-white/20 text-xs font-bold uppercase text-gray-300 hover:bg-white/5 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-lg bg-[#eab308] text-black font-black uppercase text-xs hover:bg-white transition-all cursor-pointer shadow-lg shadow-[#eab308]/20"
                  >
                    Salvar Vídeo na Estampa
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FULLSCREEN PREVIEW PLAYER MODAL */}
      <AnimatePresence>
        {previewVideoUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <div className="relative w-full max-w-3xl aspect-video bg-black rounded-2xl overflow-hidden border border-white/20 shadow-2xl">
              <button 
                onClick={() => setPreviewVideoUrl(null)}
                className="absolute top-3 right-3 z-10 bg-black/80 text-white p-2 rounded-full hover:bg-white hover:text-black transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
              <video 
                src={previewVideoUrl} 
                controls 
                autoPlay 
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
