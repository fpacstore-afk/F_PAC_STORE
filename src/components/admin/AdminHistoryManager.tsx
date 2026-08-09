import React, { useEffect, useState } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { StoryCardData } from '../../types/history';
import { DEFAULT_STORY_CARDS } from '../../data/defaultStoryCards';
import { StoryCard } from '../StoryCard';
import { 
  Sparkles, Plus, Edit3, Trash2, Copy, ArrowUp, ArrowDown, 
  Eye, EyeOff, Upload, Check, X, Video, Image as ImageIcon, 
  RefreshCw, Layers, Film, Instagram
} from 'lucide-react';
import toast from 'react-hot-toast';

export function AdminHistoryManager() {
  const [cards, setCards] = useState<StoryCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  // Form & Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<StoryCardData | null>(null);
  const [formData, setFormData] = useState<Partial<StoryCardData>>({
    title: '',
    description: '',
    videoUrl: '',
    imageUrl: '',
    instagramUrl: 'https://instagram.com/f_pac_store',
    author: '@f_pac_store',
    order: 1,
    active: true,
    featured: false
  });

  // Deletion Confirmation State
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Sync real-time Firestore collection 'history_cards'
  useEffect(() => {
    setLoading(true);
    let unsubFallback: (() => void) | null = null;
    const q = query(collection(db, 'history_cards'), orderBy('order', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: StoryCardData[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        fetched.push({
          id: docSnap.id,
          title: d.title || '',
          description: d.description || '',
          videoUrl: d.videoUrl || '',
          imageUrl: d.imageUrl || '',
          instagramUrl: d.instagramUrl || 'https://instagram.com/f_pac_store',
          author: d.author || '@f_pac_store',
          order: typeof d.order === 'number' ? d.order : 1,
          active: d.active !== false,
          featured: d.featured === true,
          createdAt: d.createdAt,
          updatedAt: d.updatedAt
        });
      });

      setCards(fetched);
      setLoading(false);
    }, (error) => {
      console.warn("Ordered query for history_cards failed, falling back to base collection:", error);
      unsubFallback = onSnapshot(collection(db, 'history_cards'), (snapshot) => {
        const fetched: StoryCardData[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          fetched.push({
            id: docSnap.id,
            title: d.title || '',
            description: d.description || '',
            videoUrl: d.videoUrl || '',
            imageUrl: d.imageUrl || '',
            instagramUrl: d.instagramUrl || 'https://instagram.com/f_pac_store',
            author: d.author || '@f_pac_store',
            order: typeof d.order === 'number' ? d.order : 1,
            active: d.active !== false,
            featured: d.featured === true,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt
          });
        });
        fetched.sort((a, b) => a.order - b.order);
        setCards(fetched);
        setLoading(false);
      }, (err) => {
        console.error("Erro ao carregar cards da história:", err);
        setCards([]);
        setLoading(false);
      });
    });

    return () => {
      unsubscribe();
      if (unsubFallback) unsubFallback();
    };
  }, []);

  // Delete all cards permanently
  const handleDeleteAllCards = async () => {
    if (!window.confirm('Tem certeza de que deseja apagar permanentemente TODOS os cards existentes? Apenas os cards que você criar de agora em diante serão exibidos.')) {
      return;
    }
    try {
      setLoading(true);
      const batch = writeBatch(db);
      cards.forEach((card) => {
        batch.delete(doc(db, 'history_cards', card.id));
      });
      await batch.commit();
      toast.success('Todos os cards anteriores foram removidos permanentemente!');
    } catch (err) {
      console.error("Erro ao apagar cards:", err);
      toast.error("Erro ao apagar cards.");
    } finally {
      setLoading(false);
    }
  };

  // Upload Video or Image File
  const handleFileUpload = async (file: File, type: 'video' | 'image'): Promise<string> => {
    setIsUploading(true);
    try {
      const folder = type === 'video' ? 'history_videos' : 'history_images';
      const fileRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(fileRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      return downloadUrl;
    } catch (err) {
      console.warn("Upload para Storage falhou, convertendo para Base64:", err);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = (e) => reject(e);
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Open Modal to Create
  const handleOpenCreate = () => {
    setEditingCard(null);
    setFormData({
      title: '',
      description: '',
      videoUrl: '',
      imageUrl: '',
      instagramUrl: 'https://instagram.com/f_pac_store',
      author: '@f_pac_store',
      order: cards.length + 1,
      active: true,
      featured: false
    });
    setIsModalOpen(true);
  };

  // Open Modal to Edit
  const handleOpenEdit = (card: StoryCardData) => {
    setEditingCard(card);
    setFormData({ ...card });
    setIsModalOpen(true);
  };

  // Save Card (Create or Edit)
  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const docId = editingCard ? editingCard.id : `story_${Date.now()}`;
      const payload: Partial<StoryCardData> = {
        title: formData.title || '',
        description: formData.description || '',
        videoUrl: formData.videoUrl || '',
        imageUrl: formData.imageUrl || '',
        instagramUrl: formData.instagramUrl || 'https://instagram.com/f_pac_store',
        author: formData.author || '@f_pac_store',
        order: Number(formData.order) || (cards.length + 1),
        active: formData.active !== false,
        featured: formData.featured === true,
        updatedAt: new Date().toISOString()
      };

      if (!editingCard) {
        payload.createdAt = new Date().toISOString();
      }

      await setDoc(doc(db, 'history_cards', docId), payload, { merge: true });
      toast.success(editingCard ? 'Card atualizado!' : 'Novo card da história criado!');
      setIsModalOpen(false);
    } catch (err) {
      console.error("Erro ao salvar card:", err);
      toast.error('Erro ao salvar card no banco de dados.');
    }
  };

  // Duplicate Card
  const handleDuplicate = async (card: StoryCardData) => {
    try {
      const newId = `story_${Date.now()}`;
      const duplicatedPayload: StoryCardData = {
        ...card,
        id: newId,
        title: `${card.title || 'Card'} (Cópia)`,
        order: cards.length + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'history_cards', newId), duplicatedPayload);
      toast.success('Card duplicado com sucesso!');
    } catch (err) {
      console.error("Erro ao duplicar card:", err);
      toast.error('Erro ao duplicar card.');
    }
  };

  // Toggle Active Status
  const handleToggleActive = async (card: StoryCardData) => {
    try {
      await updateDoc(doc(db, 'history_cards', card.id), {
        active: !card.active,
        updatedAt: new Date().toISOString()
      });
      toast.success(`Card ${!card.active ? 'ativado' : 'desativado'} com sucesso!`);
    } catch (err) {
      console.error("Erro ao alterar status do card:", err);
      toast.error('Erro ao alterar status.');
    }
  };

  // Toggle Featured Status
  const handleToggleFeatured = async (card: StoryCardData) => {
    try {
      await updateDoc(doc(db, 'history_cards', card.id), {
        featured: !card.featured,
        updatedAt: new Date().toISOString()
      });
      toast.success(`Card ${!card.featured ? 'marcado em Destaque' : 'desmarcado de Destaque'}!`);
    } catch (err) {
      console.error("Erro ao alterar destaque:", err);
      toast.error('Erro ao alterar destaque.');
    }
  };

  // Reorder Cards (Move Up or Down)
  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= cards.length) return;

    const currentCard = cards[index];
    const adjacentCard = cards[targetIndex];

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'history_cards', currentCard.id), { order: adjacentCard.order });
      batch.update(doc(db, 'history_cards', adjacentCard.id), { order: currentCard.order });
      await batch.commit();
      toast.success('Ordem dos cards atualizada!');
    } catch (err) {
      console.error("Erro ao reordenar cards:", err);
      toast.error('Erro ao reordenar cards.');
    }
  };

  // Delete Card
  const handleDeleteCard = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'history_cards', id));
      toast.success('Card removido com sucesso!');
      setDeleteConfirmId(null);
    } catch (err) {
      console.error("Erro ao excluir card:", err);
      toast.error('Erro ao excluir card.');
    }
  };

  return (
    <div className="space-y-4 text-black">
      {/* HERO HEADER - ESTAMPAS STANDARD PATTERN */}
      <div className="bg-black text-white px-4 md:px-8 py-4 md:py-6 border-b-2 border-[#eab308] relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-12 translate-y-12 pointer-events-none">
          <Film size={200} className="text-white" />
        </div>
        
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#eab308] text-black px-2 py-0.5 text-[8px] font-black uppercase tracking-widest font-mono">
                SGC v2.4
              </span>
              <span className="text-gray-400 text-[9px] font-bold uppercase tracking-[0.2em] font-sans">
                • FAÇA PARTE DA HISTÓRIA
              </span>
            </div>
            
            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight italic font-sans">
              FAÇA PARTE DA <span className="text-[#eab308]">HISTÓRIA</span>
            </h1>
            <p className="text-xs text-gray-400 font-mono tracking-wider">
              Gerencie todos os cards de mídia e vídeo da vitrine oficial da comunidade F PAC.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {cards.length > 0 && (
              <button
                onClick={handleDeleteAllCards}
                disabled={loading}
                className="bg-red-900/80 hover:bg-red-800 text-white font-black text-[9px] uppercase tracking-wider px-4 py-2 transition-all flex items-center gap-1.5 cursor-pointer border border-red-700"
              >
                <Trash2 size={13} /> Apagar Todos os Cards
              </button>
            )}

            <button
              onClick={handleOpenCreate}
              className="bg-[#eab308] text-black hover:bg-white transition-all px-4 py-2 text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
            >
              <Plus size={13} /> Criar Novo Card
            </button>
          </div>
        </div>
      </div>

      {/* INDICATOR CARDS (KPIs) - ESTAMPAS STANDARD PATTERN */}
      <div className="max-w-7xl mx-auto px-2 md:px-4 -translate-y-3 relative z-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-black/10 p-3 shadow-xs hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 block font-sans">Total de Cards</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block">{cards.length}</span>
            </div>
            <span className="text-[8px] text-gray-500 bg-gray-100 px-1.5 py-0.5 font-black uppercase">Geral</span>
          </div>

          <div className="bg-white border border-black/10 p-3 shadow-xs hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-600 block font-sans">Cards Ativos</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-emerald-700">
                {cards.filter(c => c.active).length}
              </span>
            </div>
            <span className="text-[8px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 font-black uppercase">Ativos</span>
          </div>

          <div className="bg-white border border-black/10 p-3 shadow-xs hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-amber-600 block font-sans">Com Vídeo</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-amber-700">
                {cards.filter(c => c.videoUrl && c.videoUrl.trim().length > 0).length}
              </span>
            </div>
            <span className="text-[8px] text-amber-800 bg-amber-50 px-1.5 py-0.5 font-black uppercase">Vídeos</span>
          </div>

          <div className="bg-white border border-black/10 p-3 shadow-xs hover:shadow transition-shadow flex items-center justify-between">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-purple-600 block font-sans">Em Destaque</span>
              <span className="text-xl font-black font-mono tracking-tight mt-0.5 block text-purple-700">
                {cards.filter(c => c.featured).length}
              </span>
            </div>
            <span className="text-[8px] text-purple-800 bg-purple-50 px-1.5 py-0.5 font-black uppercase">Destaque</span>
          </div>
        </div>
      </div>

      {/* Cards List Grid */}
      <div className="max-w-7xl mx-auto px-2 md:px-4 space-y-4">
        {loading ? (
          <div className="bg-white border border-black/10 py-16 text-center space-y-3 shadow-xs">
            <RefreshCw size={28} className="animate-spin text-[#eab308] mx-auto" />
            <p className="text-xs text-gray-500 font-mono uppercase tracking-widest">Carregando acervo de vídeos e cards...</p>
          </div>
        ) : cards.length === 0 ? (
          <div className="bg-white border border-black/10 p-12 text-center space-y-4 shadow-xs">
            <Film size={40} className="mx-auto text-gray-400" />
            <h3 className="text-black font-black text-base uppercase">Nenhum card cadastrado na História</h3>
            <p className="text-gray-500 text-xs max-w-md mx-auto leading-relaxed">
              Nenhum card de amostra. Crie seu próprio card com imagem ou vídeo para aparecer na seção Faça Parte da História.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={handleOpenCreate}
                className="bg-[#eab308] hover:bg-black hover:text-white text-black font-black text-xs uppercase px-5 py-2.5 transition-all flex items-center gap-2 cursor-pointer font-bold"
              >
                <Plus size={16} /> Criar Novo Card
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card, idx) => (
              <div 
                key={card.id} 
                className={`bg-white border overflow-hidden transition-all flex flex-col justify-between shadow-xs hover:shadow-md ${
                  card.active ? 'border-gray-200 hover:border-black' : 'border-red-200 opacity-60'
                }`}
              >
                {/* Card Live Preview Container */}
                <div className="p-3 bg-neutral-900">
                  <StoryCard 
                    card={card} 
                    index={idx}
                    priority={idx < 4}
                  />
                </div>

                {/* Card Meta & Control Toolbar */}
                <div className="p-3 bg-white border-t border-gray-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-gray-600 font-bold">Ordem: #{card.order}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleMoveOrder(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 bg-gray-100 hover:bg-gray-200 text-black border border-gray-300 disabled:opacity-30 cursor-pointer"
                        title="Mover para cima"
                      >
                        <ArrowUp size={12} />
                      </button>
                      <button
                        onClick={() => handleMoveOrder(idx, 'down')}
                        disabled={idx === cards.length - 1}
                        className="p-1 bg-gray-100 hover:bg-gray-200 text-black border border-gray-300 disabled:opacity-30 cursor-pointer"
                        title="Mover para baixo"
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => handleToggleActive(card)}
                      className={`px-2 py-1 text-[9px] font-black uppercase tracking-wider border cursor-pointer transition-all flex items-center gap-1 ${
                        card.active 
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                          : 'bg-red-50 text-red-800 border-red-200'
                      }`}
                    >
                      {card.active ? <Eye size={10} /> : <EyeOff size={10} />}
                      {card.active ? 'Ativo' : 'Inativo'}
                    </button>

                    <button
                      onClick={() => handleToggleFeatured(card)}
                      className={`px-2 py-1 text-[9px] font-black uppercase tracking-wider rounded-md border cursor-pointer transition-all flex items-center gap-1 ${
                        card.featured 
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' 
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:text-white'
                      }`}
                      title="Alternar Destaque"
                    >
                      <Sparkles size={10} />
                      {card.featured ? 'Destaque' : 'Comum'}
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDuplicate(card)}
                      className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white rounded-md transition-colors cursor-pointer"
                      title="Duplicar Card"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      onClick={() => handleOpenEdit(card)}
                      className="p-1.5 bg-neutral-800 hover:bg-[#eab308] text-neutral-300 hover:text-black rounded-md transition-colors cursor-pointer"
                      title="Editar Card"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(card.id)}
                      className="p-1.5 bg-neutral-800 hover:bg-red-600 text-neutral-300 hover:text-white rounded-md transition-colors cursor-pointer"
                      title="Excluir Card"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-2xl rounded-2xl p-6 md:p-8 space-y-6 shadow-2xl relative my-8">
            <div className="flex justify-between items-center border-b border-neutral-800 pb-4">
              <h3 className="text-white font-black text-lg uppercase tracking-tight flex items-center gap-2">
                <Film size={20} className="text-[#eab308]" />
                {editingCard ? 'Editar Card da História' : 'Criar Novo Card da História'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-white cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCard} className="space-y-4 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">
                    Título do Card
                  </label>
                  <input
                    type="text"
                    value={formData.title || ''}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Ex: OVERSIZED BLACK MANIFESTO"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#eab308]"
                  />
                </div>

                {/* Author */}
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">
                    Autor / @Handle
                  </label>
                  <input
                    type="text"
                    value={formData.author || ''}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                    placeholder="Ex: @f_pac_store ou @cliente_vip"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#eab308]"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">
                  Descrição Curta
                </label>
                <textarea
                  rows={2}
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ex: Modelagem Boxy Fit Premium em algodão 260g..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#eab308]"
                />
              </div>

              {/* Video URL & Upload */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest flex items-center justify-between">
                  <span>URL do Vídeo (.mp4, .webm)</span>
                  <span className="text-[#eab308]">Reprodução Automática</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.videoUrl || ''}
                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                    placeholder="https://.../video.mp4"
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#eab308]"
                  />
                  <label className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2.5 rounded-lg cursor-pointer border border-neutral-700 flex items-center gap-1.5 text-xs font-bold uppercase transition-all">
                    <Video size={14} /> Upload Vídeo
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = await handleFileUpload(file, 'video');
                          setFormData(prev => ({ ...prev, videoUrl: url }));
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Image / Poster URL & Upload */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Imagem / Poster Fallback</span>
                  <span className="text-neutral-500">Para quando não houver vídeo</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.imageUrl || ''}
                    onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                    placeholder="https://.../imagem.jpg"
                    className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#eab308]"
                  />
                  <label className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2.5 rounded-lg cursor-pointer border border-neutral-700 flex items-center gap-1.5 text-xs font-bold uppercase transition-all">
                    <ImageIcon size={14} /> Upload Imagem
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = await handleFileUpload(file, 'image');
                          setFormData(prev => ({ ...prev, imageUrl: url }));
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Instagram URL */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">
                  Link do Instagram / Publicação
                </label>
                <div className="relative">
                  <Instagram size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                  <input
                    type="text"
                    value={formData.instagramUrl || ''}
                    onChange={(e) => setFormData({ ...formData, instagramUrl: e.target.value })}
                    placeholder="https://instagram.com/f_pac_store"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#eab308]"
                  />
                </div>
              </div>

              {/* Switches: Active & Featured */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <label className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-bold uppercase text-white">Status Ativo</span>
                  <input
                    type="checkbox"
                    checked={formData.active !== false}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="w-4 h-4 accent-[#eab308]"
                  />
                </label>

                <label className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-bold uppercase text-purple-300 flex items-center gap-1">
                    <Sparkles size={12} /> Destaque
                  </span>
                  <input
                    type="checkbox"
                    checked={formData.featured === true}
                    onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                    className="w-4 h-4 accent-[#eab308]"
                  />
                </label>
              </div>

              {/* Live Preview Inside Modal */}
              <div className="pt-3 border-t border-neutral-800 space-y-2">
                <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">
                  Pré-visualização do Card em Tempo Real
                </span>
                <div className="max-w-[240px] mx-auto">
                  <StoryCard
                    card={{
                      id: editingCard?.id || 'preview',
                      title: formData.title || 'Título de Exemplo',
                      description: formData.description || 'Descrição de Exemplo',
                      videoUrl: formData.videoUrl,
                      imageUrl: formData.imageUrl,
                      instagramUrl: formData.instagramUrl,
                      author: formData.author,
                      order: formData.order || 1,
                      active: formData.active !== false,
                      featured: formData.featured === true
                    }}
                    priority={true}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 bg-neutral-800 text-neutral-300 hover:text-white rounded-lg text-xs font-bold uppercase cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isUploading}
                  className="px-6 py-2.5 bg-[#eab308] hover:bg-white text-black font-black text-xs uppercase rounded-lg shadow-md cursor-pointer transition-all flex items-center gap-2"
                >
                  <Check size={16} /> {editingCard ? 'Salvar Alterações' : 'Criar Card'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <Trash2 size={36} className="mx-auto text-red-500" />
            <h3 className="text-white font-black text-base uppercase">Excluir Card da História?</h3>
            <p className="text-neutral-400 text-xs leading-relaxed">
              Esta ação removerá permanentemente o card selecionado da vitrine oficial.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-5 py-2.5 bg-neutral-800 text-neutral-300 hover:text-white rounded-lg text-xs font-bold uppercase cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteCard(deleteConfirmId)}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white font-black text-xs uppercase rounded-lg shadow-md cursor-pointer transition-all"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
