import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Gem, Headphones, ImagePlus, Link2, Ruler, Search, ShieldCheck, ShoppingCart, Truck, Upload } from 'lucide-react';
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
  { id: 'front', label: 'Frente', src: '/prime-custom/oversized-front-premium.svg' },
  { id: 'back', label: 'Costas', src: '/prime-custom/oversized-back-premium.svg' },
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
  const appliedCount = Number(Boolean(frontArt)) + Number(Boolean(backArt));

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
    <div className="min-h-screen bg-[#f5f5f2] text-[#111] pb-24">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-8 py-4 md:py-7">
        <div className="mb-4 flex items-center justify-between gap-3 text-[10px] md:text-xs text-black/45">
          <div>Início <span className="mx-1.5">›</span> PRIME <span className="mx-1.5">›</span> Personalização</div>
          <span className="hidden sm:inline font-black uppercase tracking-[0.16em] text-[#a87800]">Não é só roupa. É identidade!</span>
        </div>

        <div className="mb-4 rounded-2xl bg-black text-white px-5 py-5 md:px-7 md:py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-[#f5bd19] text-[9px] md:text-[10px] font-black uppercase tracking-[0.28em]">PRIME CUSTOM</p>
            <h1 className="mt-2 text-3xl md:text-5xl leading-[0.92] font-black uppercase italic tracking-[-.04em]">Sua ideia.<br />Sua peça.</h1>
            <p className="mt-3 text-sm text-white/60 max-w-xl">Escolha o tamanho, selecione uma arte do catálogo ou envie a sua e aplique na frente, nas costas ou nas duas vistas.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 md:min-w-[330px]">
            {['1. Escolha', '2. Aplique', '3. Finalize'].map((label, index) => (
              <div key={label} className={`rounded-xl border px-3 py-3 text-center text-[9px] font-black uppercase tracking-wide ${index < (appliedCount > 0 ? 2 : 1) ? 'border-[#f5bd19]/70 text-[#f5bd19]' : 'border-white/10 text-white/40'}`}>
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.18fr_.82fr] gap-4 lg:gap-7 items-start">
          <section className="bg-white rounded-2xl border border-black/10 shadow-sm p-3 md:p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex gap-2 w-full sm:w-auto">
                {views.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setView(v.id)}
                    className={`h-11 flex-1 sm:flex-none px-5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wide transition-colors ${view === v.id ? 'bg-black text-white' : 'bg-[#f1f1f1] text-black/60 hover:text-black'}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-black/45 font-semibold hidden sm:inline">Visualização da peça</span>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-black/10 bg-[#fafafa] aspect-[1/1.02] flex items-center justify-center">
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
              {!active && (
                <div className="absolute left-1/2 top-[44.2%] -translate-x-1/2 -translate-y-1/2 w-[31%] aspect-[3/4] border border-dashed border-black/15 rounded-lg flex items-center justify-center pointer-events-none">
                  <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.15em] text-black/25 text-center px-2">Área da estampa</span>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="grid grid-cols-2 gap-2 w-[230px] sm:w-[290px]">
                {views.map(v => {
                  const hasArt = v.id === 'front' ? frontArt : backArt;
                  return (
                    <button
                      key={v.id}
                      onClick={() => setView(v.id)}
                      className={`relative rounded-xl border bg-white p-1.5 ${view === v.id ? 'border-2 border-[#f5bd19]' : 'border-black/10'}`}
                    >
                      <img src={v.src} className="h-20 sm:h-24 w-full object-cover rounded-lg" alt={`Vista ${v.label}`} />
                      <div className="flex items-center justify-between gap-1 px-1 mt-1">
                        <b className="text-[9px] sm:text-[11px] uppercase">{v.label}</b>
                        {hasArt && <Check size={13} className="text-[#b88700]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="hidden md:block text-right">
                <p className="text-[9px] uppercase tracking-[0.16em] font-black text-black/35">Aplicações</p>
                <p className="text-2xl font-black">{appliedCount}/2</p>
              </div>
            </div>
          </section>

          <aside className="bg-white rounded-2xl border border-black/10 shadow-sm p-4 md:p-6 lg:sticky lg:top-4">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex border border-[#f5bd19] bg-[#f5bd19]/10 rounded-full px-3 py-1.5 text-[9px] font-black tracking-[0.16em] uppercase">Personalizável</span>
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-black/35">Oversized • Preto</span>
            </div>
            <h2 className="mt-4 text-3xl md:text-5xl leading-[.95] font-black tracking-[-.04em]">Camiseta Oversized<br />Personalizada</h2>
            <p className="mt-4 text-sm md:text-base text-black/60 max-w-md">Monte sua PRIME sem sair da página. Você visualiza cada lado e leva a configuração escolhida para a sacola.</p>

            <div className="mt-6 rounded-xl bg-[#f8f8f6] border border-black/5 p-4">
              <p className="text-[9px] uppercase tracking-[0.18em] font-black text-black/35">Valor da configuração</p>
              <div className="mt-1 text-3xl md:text-4xl font-black">R$ {money(price)}</div>
              <div className="inline-flex mt-2 bg-[#f5bd19] px-3 py-2 rounded-lg font-black text-xs sm:text-sm">R$ {money(pixPrice)} no PIX (5% OFF)</div>
            </div>

            <div className="mt-6 grid grid-cols-[auto_1fr] gap-5 items-start">
              <div>
                <b className="text-sm">Cor</b>
                <div className="mt-2 w-11 h-11 rounded-full bg-black border-[3px] border-white ring-2 ring-black" aria-label="Cor Preto" />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <b className="text-sm">Tamanho</b>
                  <button onClick={() => setShowSizes(true)} className="text-[10px] underline flex items-center gap-1 text-black/60"><Ruler size={13} /> Guia</button>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {SIZES.map(s => (
                    <button key={s} onClick={() => setSize(s)} className={`h-11 rounded-lg border font-black text-sm ${size === s ? 'bg-black text-white border-black' : 'border-black/15 bg-white'}`}>{s}</button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => artworkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="mt-6 w-full min-h-14 rounded-xl bg-[#f5bd19] hover:brightness-95 transition font-black uppercase tracking-[.08em] text-xs flex items-center justify-center gap-3"
            >
              Começar personalização <ArrowRight size={19} />
            </button>

            <div className="mt-5 rounded-xl border border-black/5 p-4 grid grid-cols-2 gap-3 text-xs text-black/65">
              <div className="flex gap-2"><ShieldCheck size={17} className="shrink-0" /><span>Algodão premium 240GSM</span></div>
              <div className="flex gap-2"><Gem size={17} className="shrink-0" /><span>Modelagem oversized</span></div>
              <div className="flex gap-2"><ImagePlus size={17} className="shrink-0" /><span>Frente e costas</span></div>
              <div className="flex gap-2"><Check size={17} className="shrink-0" /><span>FP fixo na manga</span></div>
            </div>
          </aside>
        </div>

        <section ref={artworkRef} className="scroll-mt-28 mt-5 bg-white rounded-2xl border border-black/10 shadow-sm p-4 md:p-6">
          <div className="grid lg:grid-cols-[.7fr_1.3fr] gap-6 lg:gap-8 items-start">
            <div className="lg:sticky lg:top-28">
              <p className="text-[10px] text-[#a87800] uppercase font-black tracking-[.24em]">Personalização</p>
              <h2 className="text-2xl md:text-4xl font-black mt-2 leading-tight">Escolha a arte e aplique na peça</h2>
              <p className="text-sm text-black/55 mt-3 leading-relaxed">Você está editando <b className="text-black">{view === 'back' ? 'COSTAS' : 'FRENTE'}</b>. Troque a vista acima quando quiser personalizar o outro lado.</p>
              <div className="mt-4 rounded-xl bg-[#f7f7f5] p-4 text-xs text-black/55">
                <b className="block text-black uppercase text-[10px] tracking-[0.14em] mb-1">Como funciona</b>
                Escolha uma arte, toque em aplicar, revise no mockup e finalize quando a composição estiver do jeito que você quer.
              </div>
            </div>

            <div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => void upload(e.target.files?.[0])} />
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setMode('catalog')} className={`min-h-11 rounded-xl border text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1.5 ${mode === 'catalog' ? 'bg-black text-white border-black' : 'border-black/15'}`}><ImagePlus size={15} /> Catálogo</button>
                <button onClick={() => { setMode('upload'); fileRef.current?.click(); }} className={`min-h-11 rounded-xl border text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1.5 ${mode === 'upload' ? 'bg-black text-white border-black' : 'border-black/15'}`}><Upload size={15} /> Enviar arte</button>
                <button onClick={() => setMode('link')} className={`min-h-11 rounded-xl border text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1.5 ${mode === 'link' ? 'bg-black text-white border-black' : 'border-black/15'}`}><Link2 size={15} /> Link</button>
              </div>

              {mode === 'upload' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="mt-3 w-full min-h-20 rounded-xl border border-dashed border-black/20 bg-[#fafafa] text-xs font-bold text-black/60 flex items-center justify-center gap-2"
                >
                  <Upload size={17} /> {busy ? 'Enviando arte...' : 'Selecionar imagem do dispositivo'}
                </button>
              )}

              {mode === 'link' && (
                <div className="flex gap-2 mt-3">
                  <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." className="min-w-0 flex-1 h-11 rounded-xl border border-black/15 px-3 text-xs" />
                  <button disabled={busy} onClick={() => void importLink()} className="px-4 bg-black text-white rounded-xl text-xs font-bold">Importar</button>
                </div>
              )}

              {mode === 'catalog' && (
                <>
                  <div className="relative mt-3">
                    <Search className="absolute left-3 top-3.5" size={15} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar estampas..." className="w-full h-11 pl-9 pr-3 rounded-xl border border-black/15 text-xs" />
                  </div>
                  {filtered.length > 0 ? (
                    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 mt-3">
                      {filtered.slice(0, 8).map(x => (
                        <button key={x.id} onClick={() => choose({ id: x.id, name: x.name, image: x.image || '' })} className={`aspect-square rounded-xl bg-black border overflow-hidden ${art?.id === x.id ? 'border-[3px] border-[#f5bd19]' : 'border-black'}`}>
                          <img src={x.image} className="w-full h-full object-contain p-1" alt={x.name} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-black/10 bg-[#fafafa] p-5 text-center text-xs text-black/50">Nenhuma arte encontrada para esta busca.</div>
                  )}
                </>
              )}

              {art && (
                <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 bg-[#f8f8f8] rounded-xl border border-black/10 p-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <img src={art.image} className="w-14 h-14 object-contain bg-black rounded-lg shrink-0" alt={art.name} />
                    <div className="min-w-0 flex-1">
                      <b className="block truncate text-sm">{art.name}</b>
                      <span className="text-xs text-black/50">Aplicar em {view === 'back' ? 'costas' : 'frente'} • máx. 30 × 40 cm</span>
                    </div>
                  </div>
                  <button onClick={apply} className="bg-[#f5bd19] px-4 min-h-11 rounded-xl text-xs font-black flex items-center justify-center gap-2 shrink-0"><Check size={15} /> Aplicar nesta vista</button>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-black/10 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-black/35">Configuração atual</p>
                  <p className="text-xs font-bold mt-1">{appliedCount === 0 ? 'Nenhuma arte aplicada' : `${appliedCount} ${appliedCount === 1 ? 'lado personalizado' : 'lados personalizados'}`}</p>
                </div>
                <div className="flex gap-1.5">
                  <span className={`w-8 h-8 rounded-full grid place-items-center text-[9px] font-black ${frontArt ? 'bg-[#f5bd19] text-black' : 'bg-black/5 text-black/30'}`}>F</span>
                  <span className={`w-8 h-8 rounded-full grid place-items-center text-[9px] font-black ${backArt ? 'bg-[#f5bd19] text-black' : 'bg-black/5 text-black/30'}`}>C</span>
                </div>
              </div>

              <button onClick={finish} className="mt-4 w-full min-h-14 bg-black text-white rounded-xl font-black uppercase text-xs tracking-[0.08em] flex items-center justify-center gap-2 hover:bg-[#1a1a1a] transition-colors"><ShoppingCart size={19} /> Adicionar à sacola — R$ {money(price)}</button>
            </div>
          </div>
        </section>
      </div>

      <div className="bg-black text-white mt-4">
        <div className="max-w-[1440px] mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4 p-5 md:p-7 text-xs">
          <div className="flex gap-3"><Gem className="text-[#f5bd19] shrink-0" /><span><b className="block uppercase">Qualidade Premium</b>Algodão 240GSM</span></div>
          <div className="flex gap-3"><Truck className="text-[#f5bd19] shrink-0" /><span><b className="block uppercase">Envio nacional</b>Opções exibidas na compra</span></div>
          <div className="flex gap-3"><ShieldCheck className="text-[#f5bd19] shrink-0" /><span><b className="block uppercase">Compra segura</b>Pagamento no fluxo da loja</span></div>
          <div className="flex gap-3"><Headphones className="text-[#f5bd19] shrink-0" /><span><b className="block uppercase">Atendimento</b>Suporte via WhatsApp</span></div>
        </div>
      </div>

      {showSizes && (
        <div className="fixed inset-0 z-[100] bg-black/80 grid place-items-center p-4">
          <div className="bg-white text-black max-w-lg w-full max-h-[90dvh] overflow-y-auto p-5 rounded-2xl relative">
            <button onClick={() => setShowSizes(false)} className="absolute right-3 top-2 text-xl w-10 h-10 grid place-items-center" aria-label="Fechar guia de tamanhos">×</button>
            <SizeChart onClose={() => setShowSizes(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
