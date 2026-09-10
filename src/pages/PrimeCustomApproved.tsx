import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Link2, Maximize2, Ruler, Search, ShieldCheck, ShoppingCart, Truck, Upload } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { db } from '../lib/firebase';
import { useCart } from '../hooks/useCart';
import { Estampa } from '../types/video';
import { uploadArtworkToCloudinary, uploadArtworkUrlToCloudinary } from '../services/cloudinary';
import { SizeChart } from '../components/SizeChart';
import { PRIME_CUSTOM_FIXED_PRICE } from '../../shared/customizationProfiles';

type View = 'front' | 'side' | 'back';
type Artwork = { id: string; name: string; image: string } | null;
type ShirtColor = readonly [string, string];

type MockupView = {
  id: View;
  label: string;
  src: string;
  printArea?: {
    top: string;
    width: string;
    maxWidth: string;
  };
};

const COLORS: readonly ShirtColor[] = [
  ['Preto', '#111111'],
  ['Off White', '#f2efe7'],
  ['Cinza', '#9699a0'],
  ['Azul Marinho', '#152b49'],
  ['Verde Militar', '#314b34'],
  ['Marrom', '#754b31'],
];

const SIZES = ['P', 'M', 'G', 'GG', 'XG'];

const views: MockupView[] = [
  {
    id: 'front',
    label: 'Frente',
    src: '/prime-custom/oversized-front-premium.svg',
    printArea: { top: '51%', width: '24%', maxWidth: '184px' },
  },
  {
    id: 'side',
    label: 'Lado',
    src: '/prime-custom/oversized-side-premium.svg',
  },
  {
    id: 'back',
    label: 'Costas',
    src: '/prime-custom/oversized-back-premium.svg',
    printArea: { top: '52%', width: '25%', maxWidth: '190px' },
  },
];

const money = (v: number) => v.toFixed(2).replace('.', ',');

export default function PrimeCustomApproved() {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [view, setView] = useState<View>('front');
  const [color, setColor] = useState<ShirtColor>(COLORS[0]);
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
  const price = PRIME_CUSTOM_FIXED_PRICE;

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
  const active = view === 'front' ? frontArt : view === 'back' ? backArt : null;

  const choose = (a: Artwork) => {
    setArt(a);
    if (view === 'side') setView('front');
  };

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
      name: `PRIME CUSTOM Oversized (${color[0]})`,
      price,
      originalPrice: price,
      image: frontArt?.image || backArt?.image || views[0].src,
      size,
      color: color[0],
      quantity: 1,
      printConfigs: configs,
    });
    navigate('/bag');
  };

  return (
    <div className="min-h-screen bg-[#111] text-white pb-28">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-8 py-5">
        <div className="mb-5">
          <p className="text-[10px] font-black tracking-[.28em] text-[#f5bd19] uppercase">F PAC STORE › Personalização Premium</p>
          <h1 className="mt-1 text-4xl md:text-6xl font-black italic tracking-[-.05em]">PRIME <span className="text-[#f5bd19]">CUSTOM</span></h1>
          <p className="text-xs tracking-[.3em] uppercase text-white/60">Sua ideia. Nossa qualidade.</p>
        </div>

        <section className="mb-3 md:mb-4">
          <h2 className="font-black uppercase mb-2"><span className="text-[#f5bd19]">1.</span> Escolha o produto</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              ['Camiseta Oversized', '/prime-custom/oversized-front-premium.svg', true],
              ['Camiseta Tradicional', '', false],
              ['Cropped', '', false],
              ['Moletom/Casaco', '', false],
              ['Bermuda', '', false],
              ['Boné', '', false],
            ].map(([n, img, on]) => (
              <button key={String(n)} disabled={!on} className={`h-28 md:h-40 rounded-lg border bg-white text-black p-2 flex flex-col items-center justify-between ${on ? 'border-2 border-[#f5bd19]' : 'border-white/20 opacity-45'}`}>
                {img ? <img src={String(img)} className="h-20 md:h-24 object-contain" alt={String(n)} /> : <div className="h-20 md:h-24 flex items-center text-[10px] text-black/40">Em breve</div>}
                <b className="text-[10px] md:text-xs uppercase">{n}</b>
              </button>
            ))}
          </div>
        </section>

        <div className="grid lg:grid-cols-[1.25fr_.9fr] gap-3 items-start">
          <section className="bg-[#f5f5f3] text-black rounded-lg p-3 md:p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="font-black uppercase"><span className="text-[#c99400]">2.</span> Personalize sua camiseta</h2>
              <span className="hidden sm:inline-flex text-[9px] font-black uppercase tracking-wider bg-black text-white px-2 py-1 rounded">FP na manga • identidade fixa</span>
            </div>

            <div className="flex gap-1 bg-black rounded-md p-1 mb-3">
              {views.map(v => (
                <button key={v.id} onClick={() => setView(v.id)} className={`flex-1 h-10 rounded text-xs font-black uppercase ${view === v.id ? 'bg-[#f5bd19] text-black' : 'text-white'}`}>{v.label}</button>
              ))}
              <button onClick={() => document.documentElement.requestFullscreen?.()} className="hidden sm:flex px-4 items-center gap-2 text-white text-xs font-bold"><Maximize2 size={15} /> Tela cheia</button>
            </div>

            <div className="relative min-h-[410px] md:min-h-[600px] flex items-center justify-center overflow-hidden rounded-md bg-gradient-to-b from-white to-[#e8e7e3]">
              <img src={currentView.src} className={`max-h-[585px] max-w-[96%] object-contain ${view === 'side' ? 'max-w-[72%]' : ''}`} alt={`Camiseta oversized ${view}`} />

              {currentView.printArea && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 aspect-[3/4] border-2 border-dashed border-white/95 shadow-[0_0_0_1px_rgba(0,0,0,.28),0_8px_22px_rgba(0,0,0,.12)] flex items-center justify-center overflow-hidden rounded-[2px]"
                  style={{ top: currentView.printArea.top, width: currentView.printArea.width, maxWidth: currentView.printArea.maxWidth }}
                >
                  {active ? (
                    <img src={active.image} className="w-[92%] h-[92%] object-contain" alt={`Estampa aplicada em ${view}`} />
                  ) : (
                    <div className="text-center text-white drop-shadow-md px-1">
                      <b className="text-[10px] md:text-xs">ÁREA MÁXIMA DE ESTAMPA</b>
                      <div className="text-lg md:text-xl font-black">30 × 40 cm</div>
                      <small>(largura × altura)</small>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 mt-2 text-[10px] md:text-xs text-black/60">
              <span>Oversized premium • caimento alongado</span>
              <span>Frente e costas personalizáveis</span>
              <span>FP da manga não personalizável</span>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3">
              {views.map(v => (
                <button key={v.id} onClick={() => setView(v.id)} className={`rounded border p-1 ${view === v.id ? 'border-2 border-[#f5bd19]' : 'border-black/10'}`}>
                  <img src={v.src} className="h-20 w-full object-contain" alt={`Vista ${v.label}`} />
                  <b className="text-[10px] uppercase">{v.label}</b>
                </button>
              ))}
            </div>
          </section>

          <aside className="bg-[#f5f5f3] text-black rounded-lg p-4 md:p-5 space-y-5">
            <section>
              <h2 className="font-black uppercase"><span className="text-[#c99400]">3.</span> Escolha a cor</h2>
              <div className="flex flex-wrap gap-4 mt-3">
                {COLORS.map(c => (
                  <button key={c[0]} onClick={() => setColor(c)} className="text-[10px] text-center">
                    <span className={`block w-11 h-11 rounded-full border-2 ${color[0] === c[0] ? 'border-[#f5bd19] ring-2 ring-[#f5bd19]/30' : 'border-black/15'}`} style={{ background: c[1] }} />
                    <span>{c[0]}</span>
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="flex justify-between">
                <h2 className="font-black uppercase"><span className="text-[#c99400]">4.</span> Escolha o tamanho</h2>
                <button onClick={() => setShowSizes(true)} className="text-xs underline flex items-center gap-1"><Ruler size={13} /> Guia</button>
              </div>
              <div className="grid grid-cols-5 gap-2 mt-3">
                {SIZES.map(s => <button key={s} onClick={() => setSize(s)} className={`h-10 rounded border font-black ${size === s ? 'bg-[#f5bd19] border-[#f5bd19]' : 'border-black/15'}`}>{s}</button>)}
              </div>
            </section>

            <section>
              <h2 className="font-black uppercase"><span className="text-[#c99400]">5.</span> Adicione sua estampa</h2>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => void upload(e.target.files?.[0])} />
              <div className="grid grid-cols-3 gap-2 mt-3">
                <button onClick={() => setMode('catalog')} className={`h-10 rounded border text-xs font-bold flex items-center justify-center gap-1 ${mode === 'catalog' ? 'bg-[#f5bd19] border-[#f5bd19]' : 'border-black/15'}`}><ImagePlus size={14} /> Catálogo</button>
                <button onClick={() => { setMode('upload'); fileRef.current?.click(); }} className="h-10 rounded border border-black/15 text-xs font-bold flex items-center justify-center gap-1"><Upload size={14} /> Enviar</button>
                <button onClick={() => setMode('link')} className="h-10 rounded border border-black/15 text-xs font-bold flex items-center justify-center gap-1"><Link2 size={14} /> Link</button>
              </div>

              {mode === 'link' && (
                <div className="flex gap-2 mt-2">
                  <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." className="min-w-0 flex-1 h-10 rounded border border-black/15 px-3 text-xs" />
                  <button disabled={busy} onClick={() => void importLink()} className="px-4 bg-black text-white rounded text-xs font-bold">Importar</button>
                </div>
              )}

              {mode === 'catalog' && (
                <>
                  <div className="relative mt-2">
                    <Search className="absolute left-3 top-3" size={15} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar estampas..." className="w-full h-10 pl-9 pr-3 rounded border border-black/15 text-xs" />
                  </div>
                  <div className="grid grid-cols-6 gap-1.5 mt-2">
                    {filtered.slice(0, 6).map(x => (
                      <button key={x.id} onClick={() => choose({ id: x.id, name: x.name, image: x.image || '' })} className={`aspect-square rounded bg-black border ${art?.id === x.id ? 'border-2 border-[#f5bd19]' : 'border-black'}`}>
                        <img src={x.image} className="w-full h-full object-contain p-1" alt={x.name} />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {art && (
                <div className="mt-3 flex items-center gap-2 bg-white rounded border p-2">
                  <img src={art.image} className="w-12 h-12 object-contain bg-black" alt={art.name} />
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-xs">{art.name}</b>
                    <span className="text-[10px] text-black/50">Aplicar em {view === 'back' ? 'costas' : 'frente'} • máx. 30 × 40 cm</span>
                  </div>
                  <button onClick={apply} className="bg-[#f5bd19] px-3 h-9 rounded text-xs font-black"><Check size={14} /></button>
                </div>
              )}
            </section>

            <section>
              <h2 className="font-black uppercase"><span className="text-[#c99400]">6.</span> Observações (opcional)</h2>
              <textarea placeholder="Ex: cores, posição, detalhes, etc..." className="mt-2 w-full h-20 rounded border border-black/15 p-3 text-xs resize-none" />
            </section>

            <div className="border-t border-black/10 pt-4 flex items-end justify-between gap-3">
              <div><small className="font-bold">PRIME CUSTOM</small><div className="text-4xl font-black text-[#c99400]">R$ {money(price)}</div></div>
              <button onClick={finish} className="h-14 px-5 md:px-7 bg-[#f5bd19] rounded font-black uppercase flex items-center gap-2"><ShoppingCart /> Adicionar ao carrinho</button>
            </div>
          </aside>
        </div>
      </div>

      <div className="border-t border-white/10 bg-black/80">
        <div className="max-w-[1440px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-3 p-4 text-[10px]">
          <div className="flex gap-2"><ShieldCheck className="text-[#f5bd19]" /><span><b>Compra segura</b><br />Seus dados protegidos</span></div>
          <div className="flex gap-2"><Truck className="text-[#f5bd19]" /><span><b>Entrega para todo Brasil</b><br />Com rastreamento</span></div>
          <div className="flex gap-2"><Upload className="text-[#f5bd19]" /><span><b>Sua arte no produto</b><br />Do seu jeito</span></div>
          <div className="flex gap-2"><ShieldCheck className="text-[#f5bd19]" /><span><b>Qualidade Premium</b><br />Malha 240 GSM</span></div>
        </div>
      </div>

      {showSizes && (
        <div className="fixed inset-0 z-[100] bg-black/80 grid place-items-center p-4">
          <div className="bg-white text-black max-w-lg w-full p-5 rounded relative">
            <button onClick={() => setShowSizes(false)} className="absolute right-3 top-2 text-xl">×</button>
            <SizeChart onClose={() => setShowSizes(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
