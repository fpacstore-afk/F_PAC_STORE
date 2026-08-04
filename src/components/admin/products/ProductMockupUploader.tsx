import React, { useState, useRef } from 'react';
import { 
  Upload, Image as ImageIcon, Trash2, Star, MoveLeft, MoveRight, 
  Sparkles, Check, X, Loader2, ArrowUp, ArrowDown
} from 'lucide-react';
import { storage } from '../../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { resizeImage } from '../../../lib/utils';
import toast from 'react-hot-toast';

interface ProductMockupUploaderProps {
  images: string[];
  onChange: (images: string[]) => void;
  colorName?: string;
}

export const ProductMockupUploader: React.FC<ProductMockupUploaderProps> = ({
  images,
  onChange,
  colorName
}) => {
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const toastId = toast.loading(`Processando e otimizando ${files.length} mockup(s)...`);

    try {
      const newUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;

        // Resize / compress client-side
        const resizedBlob = await resizeImage(file, 1600, 1600);
        const fileName = `products/mockups_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
        const storageRef = ref(storage, fileName);

        await uploadBytes(storageRef, resizedBlob);
        const url = await getDownloadURL(storageRef);
        newUrls.push(url);
      }

      if (newUrls.length > 0) {
        onChange([...images, ...newUrls]);
        toast.success(`${newUrls.length} mockup(s) adicionado(s) com sucesso!`, { id: toastId });
      } else {
        toast.error('Nenhum arquivo de imagem válido selecionado.', { id: toastId });
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Erro ao realizar upload dos mockups.', { id: toastId });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleRemoveImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    onChange(updated);
    toast.success('Imagem removida.');
  };

  const handleSetPrimary = (index: number) => {
    if (index === 0) return;
    const item = images[index];
    const filtered = images.filter((_, i) => i !== index);
    onChange([item, ...filtered]);
    toast.success('Imagem definida como principal!');
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const updated = [...images];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;

    if (targetIdx < 0 || targetIdx >= updated.length) return;

    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    onChange(updated);
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          dragActive 
            ? 'border-[#eab308] bg-[#eab308]/10' 
            : 'border-white/15 bg-black/40 hover:border-white/30 hover:bg-black/60'
        }`}
      >
        <input 
          ref={fileInputRef}
          type="file" 
          multiple 
          accept="image/*" 
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden" 
        />

        {uploading ? (
          <div className="flex flex-col items-center justify-center space-y-2 py-4 text-[#eab308]">
            <Loader2 size={32} className="animate-spin" />
            <span className="text-xs font-bold uppercase tracking-wider">Otimizando e enviando imagens...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#eab308]/10 border border-[#eab308]/20 flex items-center justify-center text-[#eab308]">
              <Upload size={24} />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-tight text-white">
                Arraste os mockups {colorName ? `da cor ${colorName}` : ''} ou clique aqui
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Suporta múltiplos uploads (PNG, JPG, WebP). Compressão automática ativada.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Image Grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-2">
          {images.map((url, idx) => {
            const isPrimary = idx === 0;

            return (
              <div 
                key={`${url}_${idx}`}
                className={`group relative bg-black/80 border rounded-xl overflow-hidden aspect-square flex items-center justify-center transition-all ${
                  isPrimary ? 'border-[#eab308] ring-2 ring-[#eab308]/30' : 'border-white/10 hover:border-white/30'
                }`}
              >
                <img 
                  src={url} 
                  alt={`Mockup ${idx + 1}`} 
                  className="w-full h-full object-cover"
                />

                {/* Primary Star Badge */}
                {isPrimary ? (
                  <span className="absolute top-2 left-2 bg-[#eab308] text-black text-[9px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                    <Star size={10} className="fill-black" /> PRINCIPAL
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleSetPrimary(idx); }}
                    className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 hover:bg-[#eab308] hover:text-black text-white p-1.5 rounded-full text-[10px]"
                    title="Definir como Principal"
                  >
                    <Star size={12} />
                  </button>
                )}

                {/* Index Badge */}
                <span className="absolute bottom-2 left-2 bg-black/80 text-white border border-white/20 text-[9px] font-mono px-1.5 py-0.5 rounded">
                  #{idx + 1}
                </span>

                {/* Controls Overlay */}
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-black/80 p-1 rounded-lg border border-white/10">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={(e) => { e.stopPropagation(); handleMove(idx, 'up'); }}
                    className="p-1 text-gray-300 hover:text-white disabled:opacity-30"
                    title="Mover para esquerda"
                  >
                    <ArrowUp size={12} />
                  </button>

                  <button
                    type="button"
                    disabled={idx === images.length - 1}
                    onClick={(e) => { e.stopPropagation(); handleMove(idx, 'down'); }}
                    className="p-1 text-gray-300 hover:text-white disabled:opacity-30"
                    title="Mover para direita"
                  >
                    <ArrowDown size={12} />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemoveImage(idx); }}
                    className="p-1 text-red-400 hover:text-red-300"
                    title="Excluir imagem"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
