import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MediaSlot } from '../MediaSlot';
import { MediaSlotConfig, MediaType, MediaObjectFit } from '../../types/mediaSlot';
import { convertDriveUrlToDirect, isMediaVideo } from '../../lib/utils';
import { toast } from 'react-hot-toast';
import { 
  Upload, Trash2, CheckCircle, RefreshCw, Eye, Image as ImageIcon, Video as VideoIcon, 
  Layers, Sparkles, Sliders, Save, Link as LinkIcon
} from 'lucide-react';

interface AdminSiteMediaManagerProps {
  onUploadFile?: (file: File) => Promise<string>;
}

const DEFAULT_SLOTS: { [key: string]: MediaSlotConfig } = {
  heroSlot: {
    id: 'heroSlot',
    name: 'Hero Banner (Fundo Principal da Home)',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?q=80&w=1600&auto=format&fit=crop',
    objectFit: 'cover',
    active: true
  },
  logoSlot: {
    id: 'logoSlot',
    name: 'Logo da Marca (Header / Hero)',
    type: 'image',
    url: '/estampas/logo-fpac.png',
    objectFit: 'contain',
    active: true
  },
  aboutSlot: {
    id: 'aboutSlot',
    name: 'Banner Institucional (Sobre a Marca)',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?q=80&w=1200&auto=format&fit=crop',
    objectFit: 'cover',
    active: true
  },
  catalogSlot1: {
    id: 'catalogSlot1',
    name: 'Vitrine Catálogo 01',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?q=80&w=800&auto=format&fit=crop',
    objectFit: 'contain',
    active: true
  },
  catalogSlot2: {
    id: 'catalogSlot2',
    name: 'Vitrine Catálogo 02',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?q=80&w=800&auto=format&fit=crop',
    objectFit: 'contain',
    active: true
  }
};

const DEFAULT_COMMUNITY_SLOTS: MediaSlotConfig[] = Array.from({ length: 8 }).map((_, idx) => ({
  id: `community_${idx + 1}`,
  name: `Slot Comunidade #${idx + 1}`,
  type: 'image',
  url: '',
  objectFit: 'cover',
  active: true,
  order: idx + 1
}));

export const AdminSiteMediaManager: React.FC<AdminSiteMediaManagerProps> = ({ onUploadFile }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [heroSlot, setHeroSlot] = useState<MediaSlotConfig>(DEFAULT_SLOTS.heroSlot);
  const [logoSlot, setLogoSlot] = useState<MediaSlotConfig>(DEFAULT_SLOTS.logoSlot);
  const [aboutSlot, setAboutSlot] = useState<MediaSlotConfig>(DEFAULT_SLOTS.aboutSlot);
  const [catalogSlot1, setCatalogSlot1] = useState<MediaSlotConfig>(DEFAULT_SLOTS.catalogSlot1);
  const [catalogSlot2, setCatalogSlot2] = useState<MediaSlotConfig>(DEFAULT_SLOTS.catalogSlot2);
  const [communitySlots, setCommunitySlots] = useState<MediaSlotConfig[]>(DEFAULT_COMMUNITY_SLOTS);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'config', 'brand'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();

        // Hero Slot
        if (d.heroMedia) {
          setHeroSlot(d.heroMedia);
        } else if (d.heroUrl) {
          setHeroSlot({
            id: 'heroSlot',
            name: 'Hero Banner (Fundo Principal da Home)',
            type: isMediaVideo(d.heroUrl) ? 'video' : 'image',
            url: d.heroUrl,
            objectFit: 'cover',
            active: true
          });
        }

        // Logo Slot
        if (d.logoMedia) {
          setLogoSlot(d.logoMedia);
        } else if (d.imageUrl) {
          setLogoSlot({
            id: 'logoSlot',
            name: 'Logo da Marca (Header / Hero)',
            type: 'image',
            url: d.imageUrl,
            objectFit: 'contain',
            active: true
          });
        }

        // About Slot
        if (d.aboutMedia) {
          setAboutSlot(d.aboutMedia);
        } else if (d.aboutUrl) {
          setAboutSlot({
            id: 'aboutSlot',
            name: 'Banner Institucional (Sobre a Marca)',
            type: isMediaVideo(d.aboutUrl) ? 'video' : 'image',
            url: d.aboutUrl,
            objectFit: 'cover',
            active: true
          });
        }

        // Catalog Slot 1
        if (d.catalogSlot1) {
          setCatalogSlot1(d.catalogSlot1);
        } else if (d.catalogImage1) {
          setCatalogSlot1({
            id: 'catalogSlot1',
            name: 'Vitrine Catálogo 01',
            type: isMediaVideo(d.catalogImage1) ? 'video' : 'image',
            url: d.catalogImage1,
            objectFit: 'contain',
            active: true
          });
        }

        // Catalog Slot 2
        if (d.catalogSlot2) {
          setCatalogSlot2(d.catalogSlot2);
        } else if (d.catalogImage2) {
          setCatalogSlot2({
            id: 'catalogSlot2',
            name: 'Vitrine Catálogo 02',
            type: isMediaVideo(d.catalogImage2) ? 'video' : 'image',
            url: d.catalogImage2,
            objectFit: 'contain',
            active: true
          });
        }

        // Community Slots
        if (d.communityMedia && Array.isArray(d.communityMedia) && d.communityMedia.length > 0) {
          setCommunitySlots(d.communityMedia);
        } else if (d.communityUrls && Array.isArray(d.communityUrls) && d.communityUrls.length > 0) {
          const mapped: MediaSlotConfig[] = d.communityUrls.map((url: string, idx: number) => ({
            id: `community_${idx + 1}`,
            name: `Slot Comunidade #${idx + 1}`,
            type: isMediaVideo(url) ? 'video' : 'image',
            url: url || '',
            objectFit: 'cover',
            active: true,
            order: idx + 1
          }));
          setCommunitySlots(mapped);
        }
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleFileUpload = async (
    file: File, 
    updateFn: (newConfig: MediaSlotConfig) => void,
    currentSlot: MediaSlotConfig
  ) => {
    try {
      toast.loading('Processando upload da mídia...', { id: 'upload-toast' });
      let finalUrl = '';

      if (onUploadFile) {
        finalUrl = await onUploadFile(file);
      } else {
        // Read file as Base64 Data URL if no backend uploader is specified
        finalUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      const detectedType: MediaType = isMediaVideo(file.name) || file.type.startsWith('video/') ? 'video' : 'image';

      updateFn({
        ...currentSlot,
        url: finalUrl,
        type: detectedType,
        updatedAt: new Date().toISOString()
      });

      toast.success('Mídia carregada com sucesso!', { id: 'upload-toast' });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao fazer upload da mídia.', { id: 'upload-toast' });
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const payload = {
        heroUrl: heroSlot.url,
        heroMedia: heroSlot,

        imageUrl: logoSlot.url,
        logoMedia: logoSlot,

        aboutUrl: aboutSlot.url,
        aboutMedia: aboutSlot,

        catalogImage1: catalogSlot1.url,
        catalogSlot1: catalogSlot1,

        catalogImage2: catalogSlot2.url,
        catalogSlot2: catalogSlot2,

        communityUrls: communitySlots.map(s => s.url),
        communityMedia: communitySlots,

        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'config', 'brand'), payload, { merge: true });

      // Synchronize history_cards collection for Home StoryCards
      const batch = writeBatch(db);
      communitySlots.forEach((slot, idx) => {
        const ref = doc(db, 'history_cards', slot.id);
        batch.set(ref, {
          title: slot.name,
          videoUrl: slot.type === 'video' ? slot.url : '',
          imageUrl: slot.type === 'image' ? slot.url : (slot.posterUrl || ''),
          order: idx + 1,
          active: slot.active,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });
      await batch.commit();

      toast.success('Todos os Slots de Mídia da Home foram salvos com sucesso!');
    } catch (err) {
      console.error(err);
      toast.error('Falha ao salvar a configuração de mídias.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center font-mono text-sm uppercase text-black/40 animate-pulse">
        Carregando Gerenciador de Slots de Mídia...
      </div>
    );
  }

  const renderSlotCard = (
    slot: MediaSlotConfig,
    onChange: (updated: MediaSlotConfig) => void,
    aspectRatioClass = 'aspect-video'
  ) => {
    return (
      <div className="bg-white border border-black/10 p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow">
        <div>
          {/* Header info */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-2 font-sans">
              {slot.type === 'video' ? <VideoIcon size={15} className="text-[#eab308]" /> : <ImageIcon size={15} className="text-[#eab308]" />}
              {slot.name}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...slot, active: !slot.active })}
                className={`text-[9px] font-black uppercase px-2 py-0.5 border transition-colors ${
                  slot.active ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {slot.active ? 'Ativo' : 'Inativo'}
              </button>
            </div>
          </div>

          {/* Media Preview Component */}
          <div className={`w-full ${aspectRatioClass} bg-black overflow-hidden border border-gray-200 relative group mb-3`}>
            <MediaSlot
              src={slot.url}
              poster={slot.posterUrl}
              type={slot.type}
              objectFit={slot.objectFit || 'cover'}
              className="w-full h-full"
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <label className="cursor-pointer bg-[#eab308] text-black font-black uppercase text-[9px] tracking-widest px-3 py-1.5 flex items-center gap-1 hover:bg-white transition-colors">
                <Upload size={12} /> Substituir
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileUpload(e.target.files[0], onChange, slot);
                    }
                  }}
                />
              </label>
              {slot.url && (
                <button
                  type="button"
                  onClick={() => onChange({ ...slot, url: '', posterUrl: '' })}
                  className="bg-red-600 hover:bg-red-700 text-white font-black uppercase text-[9px] tracking-widest px-2.5 py-1.5 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="space-y-2 text-xs">
            {/* Direct Link Input */}
            <div>
              <label className="text-[9px] font-black uppercase text-gray-500 block mb-1 flex items-center gap-1 font-sans">
                <LinkIcon size={11} /> URL Direta da Mídia
              </label>
              <input
                type="text"
                value={slot.url || ''}
                onChange={(e) => {
                  const val = convertDriveUrlToDirect(e.target.value);
                  const isVid = isMediaVideo(val);
                  onChange({
                    ...slot,
                    url: val,
                    type: isVid ? 'video' : 'image'
                  });
                }}
                placeholder="https://... (mp4, webm, jpg, png)"
                className="w-full bg-white border border-gray-300 text-black px-2.5 py-1.5 text-xs focus:border-black outline-none placeholder-gray-400"
              />
            </div>

            {/* Poster for Video */}
            {slot.type === 'video' && (
              <div>
                <label className="text-[9px] font-black uppercase text-gray-500 block mb-1 font-sans">
                  URL da Thumbnail / Poster
                </label>
                <input
                  type="text"
                  value={slot.posterUrl || ''}
                  onChange={(e) => onChange({ ...slot, posterUrl: convertDriveUrlToDirect(e.target.value) })}
                  placeholder="https://... (Poster)"
                  className="w-full bg-white border border-gray-300 text-black px-2.5 py-1.5 text-xs focus:border-black outline-none placeholder-gray-400"
                />
              </div>
            )}

            {/* Object fit & Type selectors */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase text-gray-500">Tipo:</span>
                <select
                  value={slot.type}
                  onChange={(e) => onChange({ ...slot, type: e.target.value as MediaType })}
                  className="bg-white border border-gray-300 text-black px-2 py-1 text-xs outline-none focus:border-black"
                >
                  <option value="image">Imagem</option>
                  <option value="video">Vídeo</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase text-gray-500">Ajuste:</span>
                <select
                  value={slot.objectFit || 'cover'}
                  onChange={(e) => onChange({ ...slot, objectFit: e.target.value as MediaObjectFit })}
                  className="bg-white border border-gray-300 text-black px-2 py-1 text-xs outline-none focus:border-black"
                >
                  <option value="cover">Preencher (Cover)</option>
                  <option value="contain">Conter (Contain)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 text-black">
      {/* HERO HEADER - ESTAMPAS STANDARD PATTERN */}
      <div className="bg-black text-white px-4 md:px-8 py-4 md:py-6 border-b-2 border-[#eab308] relative overflow-hidden">
        <div className="absolute right-0 bottom-0 opacity-10 translate-x-12 translate-y-12 pointer-events-none">
          <Layers size={200} className="text-white" />
        </div>

        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="bg-[#eab308] text-black px-2 py-0.5 text-[8px] font-black uppercase tracking-widest font-mono">
                SGC v2.4
              </span>
              <span className="text-gray-400 text-[9px] font-bold uppercase tracking-[0.2em] font-sans">
                • IDENTIDADE & MÍDIAS DA LOJA
              </span>
            </div>

            <h1 className="text-xl md:text-2xl font-black uppercase tracking-tight italic font-sans">
              CENTRAL DE <span className="text-[#eab308]">MÍDIAS DA LOJA</span>
            </h1>
            <p className="text-xs text-gray-400 font-mono tracking-wider">
              Gerencie os slots de imagem e vídeo da Home, marcas e coleções.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="bg-[#eab308] text-black hover:bg-white font-black uppercase text-[9px] tracking-wider px-5 py-2.5 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
            Salvar Alterações
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 md:px-4 space-y-6">
        {/* Main Slots Section */}
        <section className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-black bg-gray-100 border-l-4 border-[#eab308] p-2">
            1. Slots Principais (Hero, Brand, Institucional e Vitrine)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {renderSlotCard(heroSlot, setHeroSlot, 'aspect-[16/9]')}
            {renderSlotCard(logoSlot, setLogoSlot, 'aspect-[16/9]')}
            {renderSlotCard(aboutSlot, setAboutSlot, 'aspect-[16/9]')}
            {renderSlotCard(catalogSlot1, setCatalogSlot1, 'aspect-video')}
            {renderSlotCard(catalogSlot2, setCatalogSlot2, 'aspect-video')}
          </div>
        </section>

        {/* Community Gallery Slots Section */}
        <section className="space-y-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-black bg-gray-100 border-l-4 border-[#eab308] p-2">
              2. Galeria da Comunidade / Histórias (8 Slots da Home)
            </h3>
            <span className="text-[10px] font-mono text-gray-500 uppercase font-bold">
              Formatos Recomendados: 4:5 ou 9:16
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {communitySlots.map((slot, index) => (
              <div key={slot.id || index}>
                {renderSlotCard(
                  slot,
                  (updated) => {
                    const newSlots = [...communitySlots];
                    newSlots[index] = updated;
                    setCommunitySlots(newSlots);
                  },
                  'aspect-[4/5]'
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
