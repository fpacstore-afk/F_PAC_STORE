import React, { useState } from 'react';
import { 
  Film, Plus, Trash2, Edit3, ArrowUp, ArrowDown, Eye, EyeOff, 
  Play, Link as LinkIcon, ShieldCheck, X 
} from 'lucide-react';
import { ProductVideoMedia } from '../../../types/product';
import toast from 'react-hot-toast';

interface ProductVideoManagerProps {
  videos: ProductVideoMedia[];
  onChange: (updated: ProductVideoMedia[]) => void;
}

export const ProductVideoManager: React.FC<ProductVideoManagerProps> = ({
  videos = [],
  onChange
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleOpenAdd = () => {
    setEditingVideoId(null);
    setTitle(`Vídeo do Produto #${videos.length + 1}`);
    setUrl('');
    setStatus('active');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (vid: ProductVideoMedia) => {
    setEditingVideoId(vid.id);
    setTitle(vid.title || '');
    setUrl(vid.url || '');
    setStatus(vid.status || 'active');
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      toast.error('Informe a URL do vídeo.');
      return;
    }

    const cleanUrl = url.trim();

    if (editingVideoId) {
      const updated = videos.map((v) => {
        if (v.id === editingVideoId) {
          return {
            ...v,
            title: title.trim() || 'Vídeo do Produto',
            url: cleanUrl,
            status
          };
        }
        return v;
      });
      onChange(updated);
      toast.success('Vídeo atualizado.');
    } else {
      const newVideo: ProductVideoMedia = {
        id: `prod_vid_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: title.trim() || `Vídeo #${videos.length + 1}`,
        url: cleanUrl,
        order: videos.length + 1,
        status
      };
      onChange([...videos, newVideo]);
      toast.success('Vídeo adicionado ao produto.');
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Deseja remover este vídeo do produto?')) return;
    const updated = videos.filter((v) => v.id !== id);
    onChange(updated);
    toast.success('Vídeo removido.');
  };

  const handleToggleStatus = (id: string) => {
    const updated = videos.map((v) => {
      if (v.id === id) {
        return {
          ...v,
          status: v.status === 'inactive' ? ('active' as const) : ('inactive' as const)
        };
      }
      return v;
    });
    onChange(updated);
  };

  const handleReorder = (id: string, direction: 'up' | 'down') => {
    const updated = [...videos].sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = updated.findIndex((v) => v.id === id);

    if (idx === -1) return;

    if (direction === 'up' && idx > 0) {
      const temp = updated[idx].order;
      updated[idx].order = updated[idx - 1].order;
      updated[idx - 1].order = temp;
    } else if (direction === 'down' && idx < updated.length - 1) {
      const temp = updated[idx].order;
      updated[idx].order = updated[idx + 1].order;
      updated[idx + 1].order = temp;
    }

    updated.sort((a, b) => (a.order || 0) - (b.order || 0));
    onChange(updated);
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Safe architecture note */}
      <div className="bg-sky-950/30 border border-sky-500/30 p-3.5 rounded-xl flex items-center justify-between text-xs text-sky-300">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-sky-400 shrink-0" />
          <span>
            Vídeos são mídias complementares do produto. Adicionar vídeos <strong>NUNCA</strong> cria novos produtos no catálogo.
          </span>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="bg-[#eab308] text-black font-black uppercase px-3.5 py-1.5 rounded-lg text-xs hover:bg-white transition-colors flex items-center gap-1 cursor-pointer shrink-0"
        >
          <Plus size={14} /> Vincular Vídeo
        </button>
      </div>

      {/* Video List */}
      {videos.length === 0 ? (
        <div className="bg-black/30 border border-dashed border-white/10 p-8 rounded-2xl text-center text-xs text-gray-400">
          <Film size={28} className="mx-auto mb-2 opacity-40 text-[#eab308]" />
          <p className="font-bold uppercase tracking-wide">Nenhum vídeo vinculado a este produto.</p>
          <p className="text-[11px] text-gray-500 mt-1">
            Clique no botão acima para adicionar vídeos demonstrativos do produto ou lifestyle.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {videos.map((vid, idx) => (
            <div 
              key={vid.id}
              className={`bg-black/60 border rounded-xl p-3 flex flex-col justify-between relative group ${
                vid.status === 'inactive' ? 'border-red-500/30 opacity-60' : 'border-white/10 hover:border-[#eab308]/50'
              }`}
            >
              {/* Preview Box */}
              <div className="relative aspect-video rounded-lg bg-black overflow-hidden mb-2 border border-white/10">
                <video 
                  src={vid.url}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                  onMouseLeave={(e) => e.currentTarget.pause()}
                />

                <button
                  type="button"
                  onClick={() => setPreviewUrl(vid.url)}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                >
                  <Play size={24} className="fill-white" />
                </button>

                <span className="absolute top-1.5 left-1.5 bg-black/80 text-white text-[9px] font-mono px-1.5 py-0.5 rounded border border-white/20">
                  #{vid.order || idx + 1}
                </span>

                <span className={`absolute top-1.5 right-1.5 text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                  vid.status === 'inactive' ? 'bg-red-500 text-white' : 'bg-emerald-500 text-black'
                }`}>
                  {vid.status === 'inactive' ? 'Inativo' : 'Ativo'}
                </span>
              </div>

              {/* Title & URL */}
              <div className="mb-2">
                <h5 className="text-xs font-bold text-white uppercase truncate">{vid.title || 'Vídeo do Produto'}</h5>
                <span className="text-[9px] text-gray-400 font-mono truncate block">{vid.url}</span>
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleReorder(vid.id, 'up')}
                    className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    type="button"
                    disabled={idx === videos.length - 1}
                    onClick={() => handleReorder(vid.id, 'down')}
                    className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30"
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(vid.id)}
                    className={`p-1 rounded ${vid.status === 'inactive' ? 'text-red-400' : 'text-emerald-400'}`}
                  >
                    {vid.status === 'inactive' ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(vid)}
                    className="p-1 text-gray-400 hover:text-white"
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(vid.id)}
                    className="p-1 text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#14141f] border border-white/20 p-6 rounded-2xl w-full max-w-md text-white relative">
            <button 
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X size={18} />
            </button>

            <h4 className="text-base font-black uppercase mb-4 flex items-center gap-2">
              <Film size={18} className="text-[#eab308]" />
              {editingVideoId ? 'Editar Vídeo do Produto' : 'Vincular Novo Vídeo'}
            </h4>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  Título do Vídeo
                </label>
                <input 
                  type="text"
                  required
                  placeholder="Ex: Vídeo de Caimento, Detalhes da Malha..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-2.5 bg-black/60 border border-white/20 rounded-lg text-xs text-white focus:outline-none focus:border-[#eab308]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  URL do Vídeo (MP4, Cloudinary, Direct Link)
                </label>
                <div className="relative">
                  <LinkIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input 
                    type="url"
                    required
                    placeholder="https://res.cloudinary.com/.../video.mp4"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-black/60 border border-white/20 rounded-lg text-xs text-white focus:outline-none focus:border-[#eab308] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full p-2.5 bg-black/60 border border-white/20 rounded-lg text-xs text-white focus:outline-none focus:border-[#eab308]"
                >
                  <option value="active">Ativo (Exibir no site)</option>
                  <option value="inactive">Inativo (Ocultar)</option>
                </select>
              </div>

              {url && (
                <div className="aspect-video bg-black rounded-lg overflow-hidden border border-white/20 mt-2">
                  <video src={url} controls className="w-full h-full object-contain" />
                </div>
              )}

              <div className="pt-3 border-t border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-white/20 text-xs font-bold uppercase text-gray-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSave(e)}
                  className="px-5 py-2 rounded-lg bg-[#eab308] text-black font-black uppercase text-xs hover:bg-white transition-colors cursor-pointer"
                >
                  Salvar Vídeo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview Fullscreen */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="relative w-full max-w-2xl aspect-video bg-black rounded-2xl overflow-hidden border border-white/20">
            <button 
              type="button"
              onClick={() => setPreviewUrl(null)}
              className="absolute top-3 right-3 z-10 bg-black/80 text-white p-2 rounded-full hover:bg-white hover:text-black"
            >
              <X size={18} />
            </button>
            <video src={previewUrl} controls autoPlay className="w-full h-full object-contain" />
          </div>
        </div>
      )}
    </div>
  );
};
