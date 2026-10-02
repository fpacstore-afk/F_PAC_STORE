import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Edit2, Eye, EyeOff, Link2, Loader2, Music, Pause, Play, Plus, Radio, RefreshCw, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMusicPlayer } from '../hooks/useMusicPlayer';
import { cn } from '../lib/utils';
import { deleteTrack, fetchAllTracks, saveTrack, syncTracksFromStorage, uploadMedia } from '../services/radioService';
import { Track } from '../types/music';

type SourceMode = 'upload' | 'link';

const titleFromSource = (source: string) => {
  const clean = decodeURIComponent(source.split('?')[0] || '').split('/').pop() || 'Faixa F PAC';
  return clean.replace(/^\d+_/, '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim() || 'Faixa F PAC';
};

export function AdminMusic() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>('upload');
  const [audioUrl, setAudioUrl] = useState('');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(0);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { playTrack, currentTrack, isPlaying, refreshTracks } = useMusicPlayer();

  const nextOrder = useMemo(() => tracks.length ? Math.max(...tracks.map(track => Number(track.order) || 0)) + 10 : 10, [tracks]);

  const loadTracks = async () => {
    setLoading(true);
    try {
      setTracks(await fetchAllTracks(false));
    } catch {
      toast.error('Não foi possível carregar as faixas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadTracks(); }, []);

  const openForm = (track?: Track) => {
    setEditingTrack(track || null);
    setSourceMode(track?.sourceType === 'upload' ? 'upload' : 'link');
    setAudioUrl(track?.audio || '');
    setTitle(track?.title || '');
    setDuration(track?.duration || 0);
    setRightsConfirmed(Boolean(track?.rightsConfirmed || track?.sourceType === 'storage_sync'));
    setBatchFiles([]);
    setModalOpen(true);
  };

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(file => file.type.startsWith('audio/') || /\.(mp3|wav|m4a)$/i.test(file.name));
    if (!files.length) return;
    setBatchFiles(files);
    if (files.length === 1 && !title.trim()) setTitle(titleFromSource(files[0].name));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    let source = audioUrl.trim();
    if (!source && batchFiles.length === 0) return toast.error('Selecione um arquivo ou informe um link.');
    if (!rightsConfirmed) return toast.error('Confirme a autorização de uso da faixa.');
    setSaving(true);
    try {
      // Editing still supports replacing one uploaded file. Batch publishing is
      // intentionally only for new tracks, so it never duplicates an edit.
      if (editingTrack && batchFiles.length === 1) source = await uploadMedia(batchFiles[0], 'audio');
      if (batchFiles.length > 0) {
        if (editingTrack) {
          // source was replaced above; continue through the normal edit path.
        } else {
        let saved = 0;
        for (const file of batchFiles) {
          const url = await uploadMedia(file, 'audio');
          const objectUrl = URL.createObjectURL(file);
          const fileDuration = await new Promise<number>(resolve => {
            const audio = new Audio(objectUrl);
            const finish = () => { URL.revokeObjectURL(objectUrl); resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0); };
            audio.addEventListener('loadedmetadata', finish, { once: true });
            audio.addEventListener('error', finish, { once: true });
          });
          await saveTrack({ title: titleFromSource(file.name), artist: 'F PAC SOUND', album: '', category: 'Geral', order: nextOrder + saved * 10, active: true, audio: url, cover: '/estampas/logo-fpac.png', duration: fileDuration, sourceType: 'upload', rightsConfirmed: true, downloadEnabled: true });
          saved++;
        }
        toast.success(`${saved} faixa(s) enviada(s) e publicada(s).`);
        setModalOpen(false);
        setBatchFiles([]);
        await loadTracks();
        await refreshTracks();
        return;
        }
      }
      await saveTrack({
        id: editingTrack?.id,
        title: title.trim() || titleFromSource(source),
        artist: editingTrack?.artist || 'F PAC SOUND',
        album: editingTrack?.album || '',
        category: editingTrack?.category || 'Geral',
        order: editingTrack?.order ?? nextOrder,
        active: editingTrack?.active !== false,
        audio: source,
        cover: editingTrack?.cover || '/estampas/logo-fpac.png',
        duration: duration || editingTrack?.duration || 0,
        sourceType: sourceMode,
        rightsConfirmed: true,
        downloadEnabled: true,
      });
      toast.success('Faixa salva e liberada na rádio.');
      setModalOpen(false);
      await loadTracks();
      await refreshTracks();
    } catch (error: any) {
      toast.error(error?.message || 'Falha ao salvar a faixa.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTrack = async (track: Track) => {
    await saveTrack({ id: track.id, active: !track.active });
    await loadTracks();
    await refreshTracks();
  };

  const removeTrack = async (track: Track) => {
    if (!window.confirm(`Excluir a faixa “${track.title}”?`)) return;
    await deleteTrack(track.id);
    toast.success('Faixa removida.');
    await loadTracks();
    await refreshTracks();
  };

  const syncStorage = async () => {
    setSyncing(true);
    try {
      const result = await syncTracksFromStorage();
      toast.success(`${result.added} nova(s) faixa(s); ${result.existing} já cadastrada(s).`);
      await loadTracks();
      await refreshTracks();
    } catch {
      toast.error('Falha ao sincronizar o Storage.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-[500px] bg-white p-4 text-black md:p-6">
      <div className="mb-4 flex flex-col gap-4 border-b border-black/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tight"><Radio className="text-[#eab308]" size={20} /> Gestão de Rádio F PAC SOUND</h2>
          <p className="mt-1 text-xs font-bold text-gray-500">Faixas compactas, cadastro rápido e download público somente para conteúdo autorizado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={syncStorage} disabled={syncing} className="flex min-h-10 items-center gap-2 border border-black/10 bg-neutral-100 px-4 text-[9px] font-black uppercase"><RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> Sincronizar</button>
          <button type="button" onClick={() => openForm()} className="flex min-h-10 items-center gap-2 bg-black px-4 text-[9px] font-black uppercase text-[#eab308]"><Plus size={14} /> Adicionar faixa</button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><RefreshCw className="animate-spin text-[#eab308]" /></div>
      ) : tracks.length === 0 ? (
        <button type="button" onClick={() => openForm()} className="flex w-full flex-col items-center border border-dashed border-black/15 py-16 text-gray-500"><Music size={32} /><span className="mt-3 text-xs font-black uppercase">Adicionar a primeira faixa</span></button>
      ) : (
        <div className="divide-y divide-black/5 border border-black/10">
          {tracks.map((track, index) => {
            const playing = currentTrack?.id === track.id && isPlaying;
            return (
              <div key={track.id} className={cn('grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 md:grid-cols-[48px_1fr_110px_150px]', !track.active && 'bg-black/[0.025] opacity-60')}>
                <button type="button" onClick={() => playTrack(track)} className="flex h-9 w-9 items-center justify-center bg-black text-[#eab308]" aria-label={`${playing ? 'Pausar' : 'Tocar'} ${track.title}`}>{playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</button>
                <div className="min-w-0"><p className="truncate text-[11px] font-black uppercase">{track.title}</p><p className="mt-0.5 text-[9px] font-bold uppercase text-gray-400">#{String(index + 1).padStart(2, '0')} · {track.reproducoes || 0} reproduções · {track.sourceType === 'link' ? 'Link' : 'Upload'}</p></div>
                <button type="button" onClick={() => toggleTrack(track)} className={cn('hidden items-center justify-center gap-1 border px-2 py-1.5 text-[8px] font-black uppercase md:flex', track.active ? 'border-emerald-200 text-emerald-700' : 'border-red-200 text-red-600')}>{track.active ? <Eye size={11} /> : <EyeOff size={11} />}{track.active ? 'Ativa' : 'Pausada'}</button>
                <div className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => openForm(track)} className="border border-black/10 p-2" aria-label={`Editar ${track.title}`}><Edit2 size={13} /></button>
                  <button type="button" onClick={() => removeTrack(track)} className="border border-red-200 p-2 text-red-600" aria-label={`Excluir ${track.title}`}><Trash2 size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60">
            <motion.button type="button" aria-label="Fechar" className="absolute inset-0" onClick={() => setModalOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="relative h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl md:p-8" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}>
              <div className="mb-6 flex items-start justify-between border-b border-black/10 pb-4"><div><h3 className="text-base font-black uppercase">{editingTrack ? 'Editar faixa' : 'Adicionar faixa'}</h3><p className="mt-1 text-xs text-gray-500">Escolha o arquivo ou cole o link. Os demais dados são preenchidos automaticamente.</p></div><button type="button" onClick={() => setModalOpen(false)} className="p-2"><X size={18} /></button></div>
              <form onSubmit={handleSave} className="space-y-5">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setSourceMode('upload'); if (!editingTrack) setAudioUrl(''); }} className={cn('flex min-h-12 items-center justify-center gap-2 border text-[10px] font-black uppercase', sourceMode === 'upload' ? 'border-black bg-black text-[#eab308]' : 'border-black/10')}><Upload size={15} /> Do dispositivo</button>
                  <button type="button" onClick={() => { setSourceMode('link'); if (!editingTrack) setAudioUrl(''); }} className={cn('flex min-h-12 items-center justify-center gap-2 border text-[10px] font-black uppercase', sourceMode === 'link' ? 'border-black bg-black text-[#eab308]' : 'border-black/10')}><Link2 size={15} /> Por link</button>
                </div>
                {sourceMode === 'upload' ? (
                  <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center border border-dashed border-black/20 bg-black/[0.02] text-center"><Upload size={24} /><span className="mt-3 text-[10px] font-black uppercase">{batchFiles.length ? `${batchFiles.length} arquivo(s) pronto(s) para publicar` : 'Selecionar MP3, WAV ou M4A'}</span><span className="mt-1 text-[9px] text-gray-500">Você pode selecionar várias músicas de uma vez.</span><input type="file" accept="audio/*,.mp3,.wav,.m4a" multiple={!editingTrack} onChange={handleUpload} disabled={uploading} className="hidden" /></label>
                ) : (
                  <div><label className="mb-1 block text-[10px] font-black uppercase">Link direto do áudio</label><input type="url" value={audioUrl} onChange={event => setAudioUrl(event.target.value)} placeholder="https://.../musica.mp3" className="w-full border border-black/15 p-3 text-sm outline-none focus:border-black" /></div>
                )}
                <div><label className="mb-1 block text-[10px] font-black uppercase">Nome da faixa <span className="text-gray-400">(opcional)</span></label><input value={title} onChange={event => setTitle(event.target.value)} placeholder="Preenchido pelo nome do arquivo" className="w-full border border-black/15 p-3 text-sm outline-none focus:border-black" /></div>
                <label className="flex cursor-pointer items-start gap-3 border border-amber-300 bg-amber-50 p-4"><input type="checkbox" checked={rightsConfirmed} onChange={event => setRightsConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-black" /><span className="text-xs leading-relaxed"><strong className="flex items-center gap-1 uppercase"><ShieldCheck size={14} /> Autorização de uso</strong>Confirmo que esta faixa é própria ou possui autorização para reprodução e download público.</span></label>
                <button type="submit" disabled={saving || uploading} className="flex min-h-12 w-full items-center justify-center gap-2 bg-[#eab308] text-[10px] font-black uppercase text-black disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={15} /> : <Upload size={15} />} Salvar e publicar</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
