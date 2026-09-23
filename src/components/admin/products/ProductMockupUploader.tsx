import React, { useState, useRef } from 'react';
import { 
  Upload, Image as ImageIcon, Trash2, Star, MoveLeft, MoveRight, 
  Sparkles, Check, X, Loader2, ArrowUp, ArrowDown
} from 'lucide-react';
import { resizeImage } from '../../../lib/utils';
import { uploadAdminArtwork } from '../../../services/cloudinary';
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
  const [progress, setProgress] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0 || busyRef.current) return;
    busyRef.current = true;
    setUploading(true);
    setUploadError('');
    const toastId = toast.loading(`Processando e otimizando ${files.length} mockup(s)...`);
    const newUrls: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          throw new Error('Use imagens JPG, PNG ou WebP.');
        }
        setProgress(`Otimizando imagem ${i + 1} de ${files.length}...`);
        // Mobile browsers occasionally leave canvas decoding pending. Continue with
        // the original file after 20 seconds so the upload can still complete.
        const resizedBlob = await Promise.race<Blob>([
          resizeImage(file, 1600, 1600),
          new Promise(resolve => setTimeout(() => resolve(file), 20_000)),
        ]);
        const mime = resizedBlob.type || file.type;
        const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
        const resizedFile = new File([resizedBlob], file.name.replace(/\.[^/.]+$/, '') + '.' + ext, { type: mime });
        setProgress(`Enviando imagem ${i + 1} de ${files.length}...`);
        const uploaded = await uploadAdminArtwork(resizedFile, value => setProgress(`Enviando imagem ${i + 1} de ${files.length}: ${value}%`));
        newUrls.push(uploaded.secure_url);
      }

      if (newUrls.length > 0) {
        toast.success(`${newUrls.length} mockup(s) adicionado(s) com sucesso!`, { id: toastId });
      } else {
        toast.error('Nenhum arquivo de imagem válido selecionado.', { id: toastId });
      }
    } catch (err) {
      console.error('Upload error:', err);
      const message = err instanceof Error ? err.message : 'Erro ao enviar as imagens.';
      setUploadError(message);
      toast.error(message, { id: toastId });
    } finally {
      if (newUrls.length) onChange([...images, ...newUrls]);
      busyRef.current = false;
      setUploading(false);
      setProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (!busyRef.current && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
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
        onClick={() => { if (!busyRef.current) fileInputRef.current?.click(); }}
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
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
          className="hidden" 
        />

        {uploading ? (
          <div className="flex flex-col items-center justify-center space-y-2 py-4 text-[#eab308]">
            <Loader2 size={32} className="animate-spin" />
            <span role="status" className="text-xs font-bold uppercase tracking-wider">{progress || 'Preparando imagens...'}</span>
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
      {uploadError && <p role="alert" className="text-xs text-red-400">{uploadError} Toque na área acima para tentar novamente.</p>}

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
