import React, { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { CheckCircle, ExternalLink, Image as ImageIcon, Instagram, Layers, Link as LinkIcon, RefreshCw, Save, Trash2, Upload, Video as VideoIcon, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../../lib/firebase';
import { getPublicApiUrl } from '../../lib/api';
import { convertDriveUrlToDirect, isMediaVideo } from '../../lib/utils';
import { MediaSlotConfig, MediaType, MediaObjectFit } from '../../types/mediaSlot';
import { MediaSlot } from '../MediaSlot';

interface AdminSiteMediaManagerProps { onUploadFile?: (file: File) => Promise<string>; }
interface InstagramItem { id: string; mediaUrl: string; permalink: string; caption?: string; }
interface InstagramStatus { configured: boolean; stale: boolean; fetchedAt: string | null; items: InstagramItem[]; }

const slot = (id: string, name: string, url: string, objectFit: MediaObjectFit = 'cover'): MediaSlotConfig => ({ id, name, type: isMediaVideo(url) ? 'video' : 'image', url, objectFit, active: true });

const DEFAULTS = {
  hero: slot('heroSlot', 'Hero desktop', ''),
  heroMobile: slot('heroMobileSlot', 'Hero mobile', ''),
  logo: slot('logoSlot', 'Logo da marca', '/estampas/logo-fpac.png', 'contain'),
  about: slot('aboutSlot', 'Imagem institucional', ''),
  catalog1: slot('catalogSlot1', 'Catálogo de estampas 01', '', 'contain'),
  catalog2: slot('catalogSlot2', 'Catálogo de estampas 02', '', 'contain'),
};

const validMediaUrl = (value: string) => !value || value.startsWith('/') || /^https:\/\//i.test(value);

export const AdminSiteMediaManager: React.FC<AdminSiteMediaManagerProps> = ({ onUploadFile }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hero, setHero] = useState(DEFAULTS.hero);
  const [heroMobile, setHeroMobile] = useState(DEFAULTS.heroMobile);
  const [logo, setLogo] = useState(DEFAULTS.logo);
  const [about, setAbout] = useState(DEFAULTS.about);
  const [catalog1, setCatalog1] = useState(DEFAULTS.catalog1);
  const [catalog2, setCatalog2] = useState(DEFAULTS.catalog2);
  const [instagram, setInstagram] = useState<InstagramStatus | null>(null);
  const [instagramLoading, setInstagramLoading] = useState(true);
  const [instagramError, setInstagramError] = useState('');

  useEffect(() => onSnapshot(doc(db, 'config', 'brand'), snapshot => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      setHero(data.heroMedia || slot('heroSlot', 'Hero desktop', data.heroUrl || ''));
      setHeroMobile(data.heroMobileMedia || slot('heroMobileSlot', 'Hero mobile', data.heroMobileUrl || ''));
      setLogo(data.logoMedia || slot('logoSlot', 'Logo da marca', data.imageUrl || DEFAULTS.logo.url, 'contain'));
      setAbout(data.aboutMedia || slot('aboutSlot', 'Imagem institucional', data.aboutUrl || ''));
      setCatalog1(data.catalogSlot1 || slot('catalogSlot1', 'Catálogo de estampas 01', data.catalogImage1 || '', 'contain'));
      setCatalog2(data.catalogSlot2 || slot('catalogSlot2', 'Catálogo de estampas 02', data.catalogImage2 || '', 'contain'));
    }
    setLoading(false);
  }, () => {
    setLoading(false);
    toast.error('Não foi possível carregar as mídias atuais.');
  }), []);

  const loadInstagram = useCallback(async () => {
    setInstagramLoading(true);
    setInstagramError('');
    try {
      const response = await fetch(getPublicApiUrl('/api/instagram/feed?limit=5'));
      if (!response.ok) throw new Error('Feed indisponível');
      const payload = await response.json();
      setInstagram({ configured: Boolean(payload.configured), stale: Boolean(payload.stale), fetchedAt: payload.fetchedAt || null, items: Array.isArray(payload.items) ? payload.items.slice(0, 5) : [] });
    } catch {
      setInstagramError('Não foi possível consultar o Instagram agora.');
    } finally {
      setInstagramLoading(false);
    }
  }, []);

  useEffect(() => { void loadInstagram(); }, [loadInstagram]);

  const upload = async (file: File, current: MediaSlotConfig, update: (value: MediaSlotConfig) => void) => {
    if (!onUploadFile) return toast.error('O serviço de upload não está disponível.');
    const toastId = toast.loading('Enviando mídia...');
    try {
      const url = await onUploadFile(file);
      update({ ...current, url, type: file.type.startsWith('video/') ? 'video' : 'image', updatedAt: new Date().toISOString() });
      toast.success('Mídia carregada.', { id: toastId });
    } catch {
      toast.error('Falha no upload.', { id: toastId });
    }
  };

  const saveAll = async () => {
    const slots = [hero, heroMobile, logo, about, catalog1, catalog2];
    const invalid = slots.find(item => item.active && !validMediaUrl(item.url || ''));
    if (invalid) return toast.error(`Revise a URL em “${invalid.name}”. Use HTTPS ou um caminho interno.`);
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'brand'), {
        heroUrl: hero.url, heroMedia: hero,
        heroMobileUrl: heroMobile.url, heroMobileMedia: heroMobile,
        imageUrl: logo.url, logoMedia: logo,
        aboutUrl: about.url, aboutMedia: about,
        catalogImage1: catalog1.url, catalogSlot1: catalog1,
        catalogImage2: catalog2.url, catalogSlot2: catalog2,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      toast.success('Mídias da loja salvas.');
    } catch {
      toast.error('Não foi possível salvar as mídias.');
    } finally {
      setSaving(false);
    }
  };

  const renderCard = (media: MediaSlotConfig, update: (value: MediaSlotConfig) => void, ratio = 'aspect-video') => (
    <article className="border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase">{media.type === 'video' ? <VideoIcon size={15} className="text-[#eab308]" /> : <ImageIcon size={15} className="text-[#eab308]" />}{media.name}</h3>
        <button type="button" onClick={() => update({ ...media, active: !media.active })} className={media.active ? 'text-[9px] font-black uppercase text-emerald-700' : 'text-[9px] font-black uppercase text-red-600'}>{media.active ? 'Ativo' : 'Inativo'}</button>
      </div>
      <div className={`${ratio} group relative mb-3 overflow-hidden border border-black/10 bg-black`}>
        <MediaSlot src={media.url} poster={media.posterUrl} type={media.type} objectFit={media.objectFit || 'cover'} className="h-full w-full" />
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/65 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <label className="flex cursor-pointer items-center gap-1 bg-[#eab308] px-3 py-2 text-[9px] font-black uppercase"><Upload size={12} /> Substituir<input type="file" accept="image/*,video/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file, media, update); }} /></label>
          {media.url && <button type="button" onClick={() => update({ ...media, url: '', posterUrl: '' })} className="bg-red-600 p-2 text-white" aria-label={`Remover ${media.name}`}><Trash2 size={13} /></button>}
        </div>
      </div>
      <label className="mb-1 flex items-center gap-1 text-[9px] font-black uppercase text-gray-500"><LinkIcon size={11} /> URL direta</label>
      <input value={media.url || ''} onChange={event => { const url = convertDriveUrlToDirect(event.target.value); update({ ...media, url, type: isMediaVideo(url) ? 'video' : 'image' }); }} placeholder="https://..." className="w-full border border-black/15 px-3 py-2 text-xs outline-none focus:border-black" />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select value={media.type} onChange={event => update({ ...media, type: event.target.value as MediaType })} className="border border-black/15 p-2 text-xs"><option value="image">Imagem</option><option value="video">Vídeo</option></select>
        <select value={media.objectFit || 'cover'} onChange={event => update({ ...media, objectFit: event.target.value as MediaObjectFit })} className="border border-black/15 p-2 text-xs"><option value="cover">Preencher</option><option value="contain">Conter</option></select>
      </div>
    </article>
  );

  if (loading) return <div className="p-16 text-center text-xs font-black uppercase text-black/40">Carregando mídias...</div>;

  return (
    <div className="space-y-5 text-black">
      <header className="flex flex-col gap-4 border-b-2 border-[#eab308] bg-black px-4 py-5 text-white md:flex-row md:items-center md:justify-between md:px-8">
        <div><p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/45"><Layers size={14} className="text-[#eab308]" /> Site & mídia</p><h1 className="mt-2 text-2xl font-black uppercase italic">Central de <span className="text-[#eab308]">mídias da loja</span></h1><p className="mt-1 text-xs text-white/55">Controle visual da Home e diagnóstico do feed oficial.</p></div>
        <button type="button" onClick={saveAll} disabled={saving} className="flex min-h-11 items-center justify-center gap-2 bg-[#eab308] px-5 text-[10px] font-black uppercase text-black disabled:opacity-50">{saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Salvar alterações</button>
      </header>

      <section className="border border-black/10 bg-white p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="flex items-center gap-2 text-sm font-black uppercase"><Instagram size={17} className="text-[#eab308]" /> Instagram · últimos 5 feeds</h2><p className="mt-1 text-xs text-gray-500">A Home lê as publicações oficiais automaticamente, da mais recente para a mais antiga.</p></div><button type="button" onClick={loadInstagram} disabled={instagramLoading} className="flex min-h-10 items-center justify-center gap-2 border border-black/10 px-4 text-[9px] font-black uppercase"><RefreshCw size={13} className={instagramLoading ? 'animate-spin' : ''} /> Verificar agora</button></div>
        {instagramError ? <div className="flex items-center gap-2 bg-red-50 p-3 text-xs text-red-700"><XCircle size={16} /> {instagramError}</div> : instagramLoading ? <div className="h-24 animate-pulse bg-black/5" /> : instagram?.configured ? <div><div className="mb-3 flex flex-wrap gap-2 text-[9px] font-black uppercase"><span className="flex items-center gap-1 bg-emerald-50 px-2 py-1 text-emerald-700"><CheckCircle size={12} /> Conectado</span><span className="bg-black/5 px-2 py-1">{instagram.items.length} de 5 publicações</span>{instagram.stale && <span className="bg-amber-50 px-2 py-1 text-amber-700">Cache anterior</span>}</div><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{instagram.items.map(item => <a key={item.id} href={item.permalink} target="_blank" rel="noreferrer" className="group relative aspect-square overflow-hidden bg-black"><img src={item.mediaUrl} alt="Publicação do Instagram" className="h-full w-full object-cover" /><ExternalLink size={14} className="absolute right-2 top-2 text-white opacity-0 group-hover:opacity-100" /></a>)}</div></div> : <div className="border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800"><strong className="block uppercase">Integração ainda sem credencial</strong><span className="mt-1 block">Configure INSTAGRAM_ACCESS_TOKEN no ambiente de produção para exibir os cinco feeds reais. A Home mantém o acesso direto ao perfil enquanto isso.</span></div>}
      </section>

      <section><h2 className="mb-3 border-l-4 border-[#eab308] bg-black/5 p-2 text-xs font-black uppercase">Mídias principais da Home</h2><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{renderCard(hero, setHero, 'aspect-[16/9]')}{renderCard(heroMobile, setHeroMobile, 'aspect-[9/16]')}{renderCard(logo, setLogo)}{renderCard(about, setAbout)}{renderCard(catalog1, setCatalog1)}{renderCard(catalog2, setCatalog2)}</div></section>
    </div>
  );
};
