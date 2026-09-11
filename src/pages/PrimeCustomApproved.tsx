import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Gem, Headphones, ImagePlus, Link2, Ruler, Search, ShieldCheck, ShoppingCart, Truck, Upload } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { db } from '../lib/firebase';
import { useCart } from '../hooks/useCart';
import { Estampa } from '../types/video';
import { uploadArtworkToCloudinary, uploadArtworkUrlToCloudinary } from '../services/cloudinary';
import { SizeChart } from '../components/SizeChart';
import { PRIME_CUSTOM_FIXED_PRICE } from '../../shared/customizationProfiles';

type View = 'front' | 'back';
type Artwork = { id: string; name: string; image: string } | null;

type MockupView = {
  id: View;
  label: string;
  src: string;
};

const SIZES = ['P', 'M', 'G', 'GG'];
const views: MockupView[] = [
  { id: 'front', label: 'Frente', src: '/prime-custom/oversized-front-approved.jpg' },
  { id: 'back', label: 'Costas', src: '/prime-custom/oversized-back-approved.jpg' },
];

const money = (v: number) => v.toFixed(2).replace('.', ',');

export default function PrimeCustomApproved() {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [view, setView] = useState<View>('front');
  const [size, setSize] = useState('M');
  const [catalog, setCatalog] = useState<Estampa[]>([]);
  const [art, setArt] = useState<Artwork>(null);
  const [frontArt, setFrontArt] = useState<Artwork>(null);
  const [backArt, setBackArt] = useState<Artwork>(null);
  const [mode, setMode] = useState<'catalog' | 'upload' | 'link'>('catalog');
  const [search, setSearch] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const artworkRef = useRef<HTMLDivElement>(null);
  const price = PRIME_CUSTOM_FIXED_PRICE;
  const pixPrice = price * 0.95;

  useEffect(
    () => onSnapshot(
      collection(db, 'designs'),
      snap => setCatalog(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() } as Estampa))
          .filter(x => x.image || ((x as any).pngUrl))
          .map(x => ({ ...x, image: x.image || ((x as any).pngUrl) || ((x as any).mockupUrl) || '' })),
      ),
      () => setCatalog([]),
    ),
    [],
  );

  const filtered = useMemo(
    () => catalog
      .filter(x => !search.trim() || `${x.name} ${x.code || ''}`.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 12),
    [catalog, search],
  );

  const currentView = views.find(v => v.id === view)!;
  const active = view === 'front' ? frontArt : backArt;

  const choose = (a: Artwork) => setArt(a);

  const apply = () => {
    if (!art) return toast.error('Escolha ou envie uma arte.');
    if (view === 'back') setBackArt(art);
    else setFrontArt(art);
    toast.success(`Arte aplicada em ${view === 'back' ? 'costas' : 'frente'}.`);
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const r = await uploadArtworkToCloudinary(file);
      choose({ id: r.public_id, name: file.name.replace(/\.[^.]+$/, ''), image: r.secure_url });
      toast.success('Arte enviada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no upload.');
    } finally {
      setBusy(false);
    }
  };

  const importLink = async () => {
    if (!link.trim()) return;
    setBusy(true);
    try {
      const r = await uploadArtworkUrlToCloudinary(link);
      choose({ id: r.public_id, name: 'Arte por link', image: r.secure_url });
      setLink('');
      toast.success('Arte importada.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao importar.');
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (!frontArt && !backArt) return toast.error('Adicione pelo menos uma arte.');
    const configs: any[] = [];
    if (frontArt) configs.push({
      id: `front_${Date.now()}`,
      stampId: frontArt.id,
      stamp: frontArt.name,
      location: 'Frente',
      printSize: '30x40',
      image: frontArt.image,
      background: 'Sem Fundo',
    });
    if (backArt) configs.push({
      id: `back_${Date.now()}`,
      stampId: backArt.id,
      stamp: backArt.name,
      location: 'Costas',
      printSize: '30x40',
      image: backArt.image,
      background: 'Sem Fundo',
    });
    addItem({
      id: `prime_custom_${Date.now()}`,
      slug: 'prime-custom',
      parentSlug: 'prime',
      name: 'PRIME CUSTOM Oversized (Preto)',
      price,
      originalPrice: price,
      image: frontArt?.image || backArt?.image || views[0].src,
      size,
      color: 'Preto',
      quantity: 1,
      printConfigs: configs,
    });
    navigate('/bag');
  };

  return (
    <div className="min-h-screen bg-[#f7f7f6] text-[#111] pb-24">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-8 py-4 md:py-7">
        <div className="mb-4 text-[11px] md:text-xs text-black/50">
          Início <span className="mx-2">›</span> Personalize <span className="mx-2">›</span> Camiseta Oversized Personalizada
        </div>

        <div className="grid lg:grid-cols-[1.18fr_.82fr] gap-4 lg:gap-7 items-start">
          <section className="bg-white rounded-xl border border-black/10 shadow-sm p-3 md:p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex gap-2">
                {views.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setView(v.id)}
                    className={`h-10 px-5 rounded-lg text-sm font-black ${view === v.id ? 'bg-black text-white' : 'bg-[#f1f1f1] text-black/70'}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-black/55 font-semibold hidden sm:inline">Camiseta Oversized</span>
            </div>

            <div className="relative overflow-hidden rounded-lg border border-black/10 bg-[#fafafa] aspect-[1/1.02] flex items-center justify-center">
              <img
                src={currentView.src}
                className="w-full h-full object-contain"
                alt={`Camiseta oversized preta - ${currentView.label}`}
              />
              {active && (
                <div className="absolute left-1/2 top-[44.2%] -translate-x-1/2 -translate-y-1/2 w-[31%] aspect-[3/4] flex items-center justify-center overflow-hidden pointer-events-none">
                  <img src={active.image} className="w-[92%] h-[92%] object-contain" alt={`Estampa em ${currentView.label}`} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3 max-w-[290px]">
              {views.map(v => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`rounded-lg border bg-white p-1.5 ${view === v.id ? 'border-2 border-[#f5bd19]' : 'border-black/10'}`}
                >
                  <img src={v.src} className="h-24 w-full object-cover rounded-md" alt={`Vista ${v.label}`} />
                  <b className="text-[11px] uppercase block mt-1">{v.label}</b>
                </button>
              ))}
            </div>
          </section>

          <aside className="bg-white rounded-xl border border-black/10 shadow-sm p-4 md:p-6 lg:sticky lg:top-4">
            <span className="inline-flex border-2 border-[#f5bd19] rounded-md px-3 py-1 text-[10px] font-black tracking-wide uppercase">Personalizável</span>
            <h1 className="mt-3 text-3xl md:text-5xl leading-[.95] font-black tracking-[-.04em]">Camiseta Oversized<br />Personalizada</h1>
            <p className="mt-4 text-sm md:text-base text-black/65 max-w-md">Crie uma peça única com a sua ideia. Qualidade premium para a sua identidade.</p>

            <div className="mt-6">
              <div className="text-4xl font-black">R$ {money(price)}</div>
              <div className="text-sm mt-1">ou <b>12x de R$ {money(price / 10)}</b> no cartão</div>
              <div className="inline-flex mt-2 bg-[#f5bd19] px-3 py-2 rounded-md font-black text-sm">R$ {money(pixPrice)} no PIX (5% OFF)</div>
            </div>

            <div className="mt-6">
              <b className="text-base">Cor: Preto</b>
              <div className="mt-2 w-12 h-12 rounded-full bg-black border-[3px] border-white ring-2 ring-black" />
            </div>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-2">
                <b className="text-base">Tamanho:</b>
                <button onClick={() => setShowSizes(true)} className="text-xs underline flex items-center gap-1 text-black/65"><Ruler size={14} /> Guia de tamanhos</button>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3 max-w-sm">
                {SIZES.map(s => (
                  <button key={s} onClick={() => setSize(s)} className={`h-12 rounded-lg border font-black ${size === s ? 'bg-black text-white border-black' : 'border-black/15 bg-white'}`}>{s}</button>
                ))}
              </div>
            </div>

            <button
              onClick={() => artworkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="mt-6 w-full h-16 rounded-lg bg-[#f5bd19] hover:brightness-95 transition font-black uppercase tracking-[.08em] flex items-center justify-center gap-3"
            >
              <ShoppingCart size={22} /> Personalizar agora
            </button>

            <div className="mt-5 rounded-xl bg-[#f8f8f8] p-4 space-y-3 text-sm">
              <div className="flex gap-3"><ShieldCheck size={20} /><span>Algodão premium 240GSM</span></div>
              <div className="flex gap-3"><Gem size={20} /><span>Modelagem oversized premium</span></div>
              <div className="flex gap-3"><ImagePlus size={20} /><span>Frente e costas personalizáveis</span></div>
              <div className="flex gap-3"><Check size={20} /><span>FP pequeno e fixo na manga</span></div>
            </div>
          </aside>
        </div>

        <section ref={artworkRef} className="scroll-mt-4 mt-5 bg-white rounded-xl border border-black/10 shadow-sm p-4 md:p-6">
          <div className="grid lg:grid-cols-[.75fr_1.25fr] gap-5 items-start">
            <div>
              <p className="text-[10px] text-[#c99400] uppercase font-black tracking-[.2em]">Personalização</p>
              <h2 className="text-2xl md:text-3xl font-black mt-1">Adicione sua estampa</h2>
              <p className="text-sm text-black/60 mt-2">Selecione FRENTE ou COSTAS acima e aplique a arte. Área máxima: 30 × 40 cm.</p>
            </div>

            <div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => void upload(e.target.files?.[0])} />
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setMode('catalog')} className={`h-11 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 ${mode === 'catalog' ? 'bg-black text-white border-black' : 'border-black/15'}`}><ImagePlus size={15} /> Catálogo</button>
                <button onClick={() => { setMode('upload'); fileRef.current?.click(); }} className="h-11 rounded-lg border border-black/15 text-xs font-bold flex items-center justify-center gap-2"><Upload size={15} /> Enviar arte</button>
                <button onClick={() => setMode('link')} className={`h-11 rounded-lg border text-xs font-bold flex items-center justify-center gap-2 ${mode === 'link' ? 'bg-black text-white border-black' : 'border-black/15'}`}><Link2 size={15} /> Link</button>
              </div>

              {mode === 'link' && (
                <div className="flex gap-2 mt-3">
                  <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." className="min-w-0 flex-1 h-11 rounded-lg border border-black/15 px-3 text-xs" />
                  <button disabled={busy} onClick={() => void importLink()} className="px-4 bg-black text-white rounded-lg text-xs font-bold">Importar</button>
                </div>
              )}

              {mode === 'catalog' && (
                <>
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-3.5" size={15} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar estampas..." className="w-full h-11 pl-9 pr-3 rounded-lg border border-black/15 text-xs" />
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 mt-3">
                    {filtered.slice(0, 8).map(x => (
                      <button key={x.id} onClick={() => choose({ id: x.id, name: x.name, image: x.image || '' })} className={`aspect-square rounded-lg bg-black border overflow-hidden ${art?.id === x.id ? 'border-[3px] border-[#f5bd19]' : 'border-black'}`}>
                        <img src={x.image} className="w-full h-full object-contain p-1" alt={x.name} />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {art && (
                <div className="mt-4 flex items-center gap-3 bg-[#f8f8f8] rounded-lg border border-black/10 p-3">
                  <img src={art.image} className="w-14 h-14 object-contain bg-black rounded" alt={art.name} />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm">{art.name}</b>
                    <span className="text-xs text-black/50">Aplicar em {view === 'back' ? 'costas' : 'frente'} • máx. 30 × 40 cm</span>
                  </div>
                  <button onClick={apply} className="bg-[#f5bd19] px-4 h-11 rounded-lg text-xs font-black flex items-center gap-2"><Check size={15} /> Aplicar</button>
                </div>
              )}

              <button onClick={finish} className="mt-4 w-full h-14 bg-black text-white rounded-lg font-black uppercase flex items-center justify-center gap-2"><ShoppingCart size={20} /> Adicionar ao carrinho — R$ {money(price)}</button>
            </div>
          </div>
        </section>
      </div>

      <div className="bg-black text-white mt-4">
        <div className="max-w-[1440px] mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4 p-5 md:p-7 text-xs">
          <div className="flex gap-3"><Gem className="text-[#f5bd19]" /><span><b className="block uppercase">Qualidade Premium</b>Algodão 240GSM</span></div>
          <div className="flex gap-3"><Truck className="text-[#f5bd19]" /><span><b className="block uppercase">Envio para todo Brasil</b>Com rastreio</span></div>
          <div className="flex gap-3"><ShieldCheck className="text-[#f5bd19]" /><span><b className="block uppercase">Compra segura</b>Mercado Pago</span></div>
          <div className="flex gap-3"><Headphones className="text-[#f5bd19]" /><span><b className="block uppercase">Atendimento</b>Suporte via WhatsApp</span></div>
        </div>
      </div>

      {showSizes && (
        <div className="fixed inset-0 z-[100] bg-black/80 grid place-items-center p-4">
          <div className="bg-white text-black max-w-lg w-full p-5 rounded-xl relative">
            <button onClick={() => setShowSizes(false)} className="absolute right-3 top-2 text-xl">×</button>
            <SizeChart onClose={() => setShowSizes(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
