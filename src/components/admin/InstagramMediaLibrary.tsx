import React, { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Copy, ImagePlus, Instagram, Loader2, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../lib/firebase';
import { uploadAdminArtwork } from '../../services/cloudinary';

interface InstagramMediaAsset {
  id: string;
  url: string;
  fileName: string;
  caption: string;
  createdAt: string;
}

const dateValue = (value: string) => {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const InstagramMediaLibrary: React.FC = () => {
  const [assets, setAssets] = useState<InstagramMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => onSnapshot(collection(db, 'instagram_media_library'), snapshot => {
    const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() })) as InstagramMediaAsset[];
    rows.sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
    setAssets(rows);
    setLoading(false);
  }, () => {
    setLoading(false);
    toast.error('Não foi possível carregar a biblioteca do Instagram.');
  }), []);

  const uploadFiles = async (files: FileList | null) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    setUploading(true);
    let uploadedCount = 0;
    const failures: string[] = [];

    for (const [index, file] of selected.entries()) {
      setUploadProgress(`Enviando ${index + 1} de ${selected.length}: ${file.name}`);
      setProgressPercent(0);
      try {
        const uploaded = await uploadAdminArtwork(file, setProgressPercent);
        if (!/^https:\/\//i.test(uploaded.secure_url)) throw new Error('O servidor retornou um endereço inválido.');
        await addDoc(collection(db, 'instagram_media_library'), {
          url: uploaded.secure_url,
          fileName: file.name.slice(0, 180),
          caption: '',
          createdAt: new Date().toISOString(),
        });
        uploadedCount += 1;
      } catch (error: any) {
        failures.push(`${file.name}: ${error?.message || 'falha no envio'}`);
      }
    }

    if (uploadedCount) toast.success(`${uploadedCount} ${uploadedCount === 1 ? 'imagem enviada' : 'imagens enviadas'} para a biblioteca.`);
    if (failures.length) toast.error(`${failures.length} arquivo(s) não enviado(s). ${failures[0]}`);
    setUploading(false);
    setUploadProgress('');
    setProgressPercent(0);
  };

  const saveCaption = async (asset: InstagramMediaAsset, caption: string) => {
    const next = caption.slice(0, 2200);
    if (next === asset.caption) return;
    try {
      await updateDoc(doc(db, 'instagram_media_library', asset.id), { caption: next, updatedAt: new Date().toISOString() });
      toast.success('Legenda salva para uso futuro.');
    } catch {
      toast.error('Não foi possível salvar a legenda.');
    }
  };

  const removeAsset = async (asset: InstagramMediaAsset) => {
    try {
      await deleteDoc(doc(db, 'instagram_media_library', asset.id));
      toast.success('Imagem removida da biblioteca.');
    } catch {
      toast.error('Não foi possível remover a imagem.');
    }
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar o link neste dispositivo.');
    }
  };

  return (
    <section className="border border-black/10 bg-white p-4 md:p-5">
      <div className="flex flex-col gap-4 border-b border-black/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-black uppercase"><ImagePlus size={17} className="text-[#eab308]" /> Biblioteca manual para Instagram</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">Envie imagens e prepare legendas para usar na integração. Elas ficam salvas somente nesta área de gestão: não aparecem na Home nem são publicadas automaticamente no Instagram.</p>
        </div>
        <label className={`flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 bg-black px-4 text-[9px] font-black uppercase text-[#eab308] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#eab308] ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? 'Enviando imagens' : 'Enviar imagens'}
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={uploading} className="sr-only" onChange={event => { void uploadFiles(event.target.files); event.currentTarget.value = ''; }} />
        </label>
      </div>

      {uploading && (
        <div className="mt-4" role="status" aria-live="polite">
          <div className="mb-1 flex items-center justify-between gap-3 text-[9px] font-bold text-gray-600"><span className="truncate">{uploadProgress}</span><span>{progressPercent}%</span></div>
          <div className="h-1.5 overflow-hidden bg-black/10"><div className="h-full bg-[#eab308] transition-[width]" style={{ width: `${progressPercent}%` }} /></div>
        </div>
      )}

      {loading ? (
        <div className="mt-5 h-28 animate-pulse bg-black/5" aria-label="Carregando biblioteca" />
      ) : assets.length === 0 ? (
        <div className="mt-5 border border-dashed border-black/15 bg-black/[0.02] p-6 text-center">
          <Instagram size={20} className="mx-auto text-[#b88700]" />
          <p className="mt-2 text-[10px] font-black uppercase text-black/70">Nenhuma imagem enviada ainda</p>
          <p className="mt-1 text-xs text-gray-500">Selecione PNG, JPG ou WebP. Cada arquivo pode ter até 10 MB.</p>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map(asset => (
            <article key={asset.id} className="min-w-0 overflow-hidden border border-black/10 bg-white">
              <div className="aspect-square bg-black/5">
                <img src={asset.url} alt={asset.fileName} loading="lazy" decoding="async" className="h-full w-full object-cover" />
              </div>
              <div className="space-y-3 p-3">
                <p className="truncate text-[9px] font-bold text-black/60" title={asset.fileName}>{asset.fileName}</p>
                <label className="block text-[8px] font-black uppercase tracking-wide text-gray-500">
                  Legenda para preparar a publicação
                  <textarea defaultValue={asset.caption || ''} maxLength={2200} rows={3} onBlur={event => { void saveCaption(asset, event.currentTarget.value); }} placeholder="Escreva uma legenda opcional" className="mt-1 w-full resize-y border border-black/15 p-2 text-xs font-normal normal-case tracking-normal text-black outline-none focus:border-black" />
                </label>
                <div className="flex items-center justify-between gap-2 border-t border-black/5 pt-2">
                  <button type="button" onClick={() => void copyLink(asset.url)} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-[8px] font-black uppercase text-black/65 hover:text-black"><Copy size={12} /> Copiar link</button>
                  <button type="button" title="Remove a referência da biblioteca; o arquivo enviado permanece armazenado na nuvem." onClick={() => void removeAsset(asset)} className="inline-flex min-h-9 items-center gap-1.5 px-2 text-[8px] font-black uppercase text-red-700 hover:bg-red-50"><Trash2 size={12} /> Remover da biblioteca</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
