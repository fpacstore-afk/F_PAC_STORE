import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Check, Eye, ImagePlus, Link2, Maximize2, RotateCcw, Search, ShieldCheck, Shirt, ShoppingBag, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/firebase';
import { useCart } from '../hooks/useCart';
import { uploadArtworkToCloudinary, uploadArtworkUrlToCloudinary } from '../services/cloudinary';
import { SHIRT_COLORS, SHIRT_SIZES } from './PrimeCustomStudio';

const PRICE = 119.90;
const PRINT_WIDTH_CM = 30;
const PRINT_HEIGHT_CM = 40;
type View = 'front' | 'side' | 'back';
type Placement = 'Frente' | 'Costas';
type Art = { id: string; name: string; image: string };

const fmt = (v: number) => v.toFixed(2).replace('.', ',');

function mix(hex: string, amount: number) {
  const clean = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  const n = parseInt(clean, 16);
  const c = (x: number) => Math.max(0, Math.min(255, x));
  const r = c((n >> 16) + amount), g = c(((n >> 8) & 255) + amount), b = c((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function OversizedMockup({ view, color, art, showZone = true }: { view: View; color: string; art?: Art | null; showZone?: boolean }) {
  const light = mix(color, 34), mid = mix(color, 8), dark = mix(color, -42), edge = mix(color, -58);
  const id = `${view}-${color.replace('#','')}`;
  const isLight = ['#ffffff','#f4f4f0','#faf9f6'].includes(color.toLowerCase());
  const seam = isLight ? '#8a8a8a' : 'rgba(255,255,255,.2)';
  const zone = view === 'back' ? { x: 183, y: 176, w: 134, h: 178 } : { x: 183, y: 176, w: 134, h: 178 };

  if (view === 'side') {
    return (
      <svg viewBox="0 0 500 560" className="w-full h-full" role="img" aria-label="Vista lateral da camiseta oversized">
        <defs>
          <linearGradient id={`sg-${id}`} x1="0" x2="1"><stop offset="0" stopColor={dark}/><stop offset="45%" stopColor={light}/><stop offset="100%" stopColor={edge}/></linearGradient>
          <filter id={`ss-${id}`}><feDropShadow dx="0" dy="18" stdDeviation="13" floodOpacity=".45"/></filter>
          <filter id={`sn-${id}`}><feTurbulence baseFrequency=".9" numOctaves="2" seed="7"/><feBlend in="SourceGraphic" mode="soft-light"/></filter>
        </defs>
        <ellipse cx="252" cy="518" rx="105" ry="18" fill="rgba(0,0,0,.38)"/>
        <g filter={`url(#ss-${id})`}>
          <path d="M215 78 C238 88 260 90 285 80 C306 93 325 108 339 131 L401 189 C410 198 409 210 399 218 L348 261 C341 267 332 266 326 259 L302 234 L311 478 C312 493 303 501 290 503 L198 503 C184 501 177 493 179 479 L189 233 L151 253 C141 258 131 254 127 244 L96 176 C92 166 97 156 106 151 L179 113 C191 100 203 89 215 78 Z" fill={`url(#sg-${id})`} stroke={edge} strokeWidth="2" filter={`url(#sn-${id})`}/>
          <path d="M218 79 C234 104 250 114 270 108 C281 105 287 96 292 83" fill="none" stroke={seam} strokeWidth="4" opacity=".55"/>
          <path d="M201 130 C213 220 209 367 199 476" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="5"/>
          <path d="M299 129 C285 236 291 375 300 479" fill="none" stroke="rgba(0,0,0,.2)" strokeWidth="7"/>
        </g>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 500 560" className="w-full h-full" role="img" aria-label={`Vista ${view === 'front' ? 'frontal' : 'traseira'} da camiseta oversized`}>
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2=".8"><stop offset="0" stopColor={edge}/><stop offset="22%" stopColor={mid}/><stop offset="49%" stopColor={light}/><stop offset="77%" stopColor={mid}/><stop offset="100%" stopColor={dark}/></linearGradient>
        <filter id={`sh-${id}`}><feDropShadow dx="0" dy="20" stdDeviation="14" floodOpacity=".5"/></filter>
        <filter id={`tx-${id}`}><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="2" seed="9"/><feBlend in="SourceGraphic" mode="soft-light"/></filter>
        <clipPath id={`clip-${id}`}><rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="3"/></clipPath>
      </defs>
      <ellipse cx="250" cy="520" rx="155" ry="20" fill="rgba(0,0,0,.4)"/>
      <g filter={`url(#sh-${id})`}>
        <path d="M142 112 C165 101 188 91 211 75 C222 88 236 94 250 94 C264 94 278 88 289 75 C312 91 335 101 358 112 L451 162 C459 166 461 175 456 182 L402 260 C397 267 388 269 381 264 L350 244 L350 474 C350 488 341 497 327 498 L173 498 C159 497 150 488 150 474 L150 244 L119 264 C112 269 103 267 98 260 L44 182 C39 175 41 166 49 162 Z" fill={`url(#g-${id})`} stroke={edge} strokeWidth="2" filter={`url(#tx-${id})`}/>
        {view === 'front' ? <><path d="M210 76 C221 112 235 127 250 127 C265 127 279 112 290 76 C277 87 264 92 250 92 C236 92 223 87 210 76 Z" fill={dark}/><path d="M217 82 C226 108 238 116 250 116 C262 116 274 108 283 82" fill="none" stroke={seam} strokeWidth="4" opacity=".68"/></> : <><path d="M210 76 C225 91 238 96 250 96 C262 96 275 91 290 76 L282 106 C269 112 260 115 250 115 C240 115 231 112 218 106 Z" fill={dark}/><path d="M218 84 C230 95 240 99 250 99 C260 99 270 95 282 84" fill="none" stroke={seam} strokeWidth="3" opacity=".65"/></>}
        <path d="M151 465 C197 471 303 471 349 465" fill="none" stroke={seam} strokeWidth="2" opacity=".5"/>
        <path d="M178 132 C192 221 189 365 177 454" fill="none" stroke="rgba(255,255,255,.11)" strokeWidth="5"/>
        <path d="M322 132 C308 221 311 365 323 454" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="7"/>
      </g>
      {showZone && <g><rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} rx="3" fill="rgba(0,0,0,.08)" stroke="#f7c600" strokeWidth="2.5" strokeDasharray="10 7"/>{!art && <><text x="250" y="255" textAnchor="middle" fill="#f7c600" fontSize="14" fontWeight="900">ÁREA DE ESTAMPA</text><text x="250" y="282" textAnchor="middle" fill="white" fontSize="23" fontWeight="900">30 x 40 cm</text><text x="250" y="301" textAnchor="middle" fill="rgba(255,255,255,.6)" fontSize="9" fontWeight="700">LARGURA x ALTURA</text></>}</g>}
      {art?.image && <image href={art.image} x={zone.x + 7} y={zone.y + 7} width={zone.w - 14} height={zone.h - 14} preserveAspectRatio="xMidYMid meet" clipPath={`url(#clip-${id})`} style={{filter:'drop-shadow(0 3px 3px rgba(0,0,0,.35))'}}/>}
    </svg>
  );
}

export default function PrimeCustomStudio3D() {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const fileRef = useRef<HTMLInputElement>(null);
  const [color, setColor] = useState(SHIRT_COLORS[0]);
  const [size, setSize] = useState('M');
  const [view, setView] = useState<View>('front');
  const [placement, setPlacement] = useState<Placement>('Frente');
  const [catalog, setCatalog] = useState<Art[]>([]);
  const [search, setSearch] = useState('');
  const [art, setArt] = useState<Art | null>(null);
  const [appliedFront, setAppliedFront] = useState<Art | null>(null);
  const [appliedBack, setAppliedBack] = useState<Art | null>(null);
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => onSnapshot(collection(db,'designs'), snap => setCatalog(snap.docs.flatMap(d => { const x:any=d.data(); if (x.status==='archived' || x.available===false) return []; const image=x.pngUrl||x.mockupUrl||x.image||x.imageUrl||''; return image?[{id:d.id,name:x.name||'Estampa F PAC',image}]:[]; }))), []);

  const filtered = useMemo(() => catalog.filter(x => !search || `${x.name} ${x.id}`.toLowerCase().includes(search.toLowerCase())), [catalog, search]);
  const frontArt = placement === 'Frente' && art ? art : appliedFront;
  const backArt = placement === 'Costas' && art ? art : appliedBack;

  const uploadFile = async (file?: File) => {
    if (!file) return; setLoading(true); const t=toast.loading('Enviando arte...');
    try { const r=await uploadArtworkToCloudinary(file); const a={id:`own_art_${r.public_id||Date.now()}`,name:file.name.replace(/\.[^/.]+$/,''),image:r.secure_url}; setArt(a); toast.success('Arte pronta para aplicar.',{id:t}); }
    catch(e){ toast.error(e instanceof Error?e.message:'Falha no upload.',{id:t}); } finally { setLoading(false); }
  };
  const uploadLink = async () => {
    if(!link.trim()) return; setLoading(true); const t=toast.loading('Importando imagem...');
    try { const r=await uploadArtworkUrlToCloudinary(link); const a={id:`own_art_${r.public_id||Date.now()}`,name:'Arte por link',image:r.secure_url}; setArt(a); setLink(''); toast.success('Imagem pronta para aplicar.',{id:t}); }
    catch(e){toast.error(e instanceof Error?e.message:'Link inválido.',{id:t});} finally{setLoading(false);}
  };
  const applyArt = () => { if(!art){toast.error('Escolha uma estampa ou envie sua arte.');return;} if(placement==='Frente'){setAppliedFront(art);setView('front');} else {setAppliedBack(art);setView('back');} setArt(null); toast.success(`Estampa aplicada em ${placement}.`); };
  const finish = () => {
    const prints:any[]=[];
    if(appliedFront) prints.push({id:`${appliedFront.id}_front`,stampId:appliedFront.id,stamp:appliedFront.name,location:'Frente',printSize:'30x40',image:appliedFront.image,background:'Sem Fundo'});
    if(appliedBack) prints.push({id:`${appliedBack.id}_back`,stampId:appliedBack.id,stamp:appliedBack.name,location:'Costas',printSize:'30x40',image:appliedBack.image,background:'Sem Fundo'});
    if(!prints.length){toast.error('Aplique pelo menos uma estampa.');return;}
    addItem({id:`prime-custom_${Date.now()}`,slug:'prime-custom',parentSlug:'prime',name:`PRIME CUSTOM Oversized (${color.name})`,price:PRICE,originalPrice:PRICE,image:(appliedFront||appliedBack)?.image||'',size,color:color.name,quantity:1,printConfigs:prints});
    toast.success('Personalização adicionada à sacola.'); navigate('/bag');
  };

  return <div className="min-h-screen bg-[#09090b] text-white pb-32">
    <section className="border-b border-white/10 bg-gradient-to-b from-[#181818] to-[#0d0d0f]">
      <div className="max-w-[1550px] mx-auto px-4 sm:px-6 lg:px-8 py-7 md:py-9 flex flex-col xl:flex-row xl:items-end xl:justify-between gap-7">
        <div><p className="text-[#f7c600] text-[10px] tracking-[.28em] font-black uppercase">F PAC STORE • PERSONALIZAÇÃO PREMIUM</p><h1 className="mt-2 text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-[-.05em]">PRIME <span className="text-[#f7c600]">CUSTOM</span></h1><p className="mt-2 text-white/55 uppercase tracking-[.25em] text-[10px]">Sua ideia. Nossa qualidade.</p></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-center text-[9px] uppercase font-black tracking-wider"><div className="border border-white/10 px-4 py-3">Malha Premium<br/><span className="text-white/45">240 GSM</span></div><div className="border border-white/10 px-4 py-3">Oversized Real<br/><span className="text-white/45">Caimento amplo</span></div><div className="border border-white/10 px-4 py-3">Área Controlada<br/><span className="text-white/45">30 x 40 cm</span></div><div className="border border-white/10 px-4 py-3">Preço Fixo<br/><span className="text-[#f7c600]">R$ {fmt(PRICE)}</span></div></div>
      </div>
    </section>

    <div className="max-w-[1550px] mx-auto grid grid-cols-1 xl:grid-cols-[370px_minmax(0,1fr)] border-x border-white/10">
      <aside className="order-2 xl:order-1 bg-[#111113] border-t xl:border-t-0 xl:border-r border-white/10 p-4 sm:p-5 space-y-6">
        <div><Step n="1" title="Escolha a cor"/><div className="grid grid-cols-3 gap-2 mt-3">{SHIRT_COLORS.map(c=><button key={c.id} onClick={()=>setColor(c)} className={`border p-3 text-left ${color.id===c.id?'border-[#f7c600] bg-[#f7c600]/10':'border-white/10'}`}><span className="block w-9 h-9 rounded-full border border-white/30" style={{background:c.hex}}/><span className="block mt-2 text-[8px] uppercase font-black">{c.name}</span></button>)}</div></div>
        <div className="h-px bg-white/10"/>
        <div><Step n="2" title="Escolha o tamanho"/><div className="grid grid-cols-5 gap-2 mt-3">{SHIRT_SIZES.map(s=><button key={s} onClick={()=>setSize(s)} className={`h-10 border text-[9px] font-black ${size===s?'bg-[#f7c600] text-black border-[#f7c600]':'border-white/15'}`}>{s}</button>)}</div></div>
        <div className="h-px bg-white/10"/>
        <div><Step n="3" title="Adicione sua estampa"/><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e=>void uploadFile(e.target.files?.[0])}/><div className="grid grid-cols-2 gap-2 mt-3"><button onClick={()=>fileRef.current?.click()} disabled={loading} className="h-12 border border-white/15 bg-white/[.03] text-[9px] font-black uppercase flex items-center justify-center gap-2"><Upload size={15}/> Dispositivo</button><button onClick={()=>{}} className="h-12 border border-[#f7c600] text-[#f7c600] text-[9px] font-black uppercase flex items-center justify-center gap-2"><ImagePlus size={15}/> Catálogo</button></div><div className="flex gap-2 mt-2"><input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://.../arte.png" className="min-w-0 flex-1 h-10 bg-black border border-white/15 px-3 text-[9px]"/><button onClick={()=>void uploadLink()} disabled={loading||!link.trim()} className="px-3 bg-[#f7c600] text-black text-[9px] font-black"><Link2 size={14}/></button></div><div className="relative mt-3"><Search size={14} className="absolute left-3 top-3 text-white/35"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar no catálogo..." className="w-full h-10 bg-black border border-white/10 pl-9 pr-3 text-[9px]"/></div><div className="grid grid-cols-3 gap-2 mt-2 max-h-[260px] overflow-y-auto">{filtered.slice(0,60).map(a=><button key={a.id} onClick={()=>setArt(a)} className={`aspect-square bg-black border overflow-hidden ${art?.id===a.id?'border-[#f7c600]':'border-white/10'}`}><img src={a.image} alt={a.name} className="w-full h-full object-contain p-2"/></button>)}</div></div>
        <div className="h-px bg-white/10"/>
        <div><Step n="4" title="Posicionamento"/><div className="grid grid-cols-2 gap-2 mt-3">{(['Frente','Costas'] as Placement[]).map(p=><button key={p} onClick={()=>{setPlacement(p);setView(p==='Frente'?'front':'back')}} className={`h-11 border text-[9px] uppercase font-black ${placement===p?'border-[#f7c600] text-[#f7c600] bg-[#f7c600]/10':'border-white/15'}`}>{p}</button>)}</div><div className="mt-3 border border-[#f7c600]/25 bg-[#f7c600]/5 p-3 flex gap-2"><ShieldCheck size={16} className="text-[#f7c600] shrink-0"/><p className="text-[9px] text-white/60"><b className="text-white">Área máxima {PRINT_WIDTH_CM} x {PRINT_HEIGHT_CM} cm.</b> A arte nunca ultrapassa o quadro.</p></div><button onClick={applyArt} disabled={!art} className="w-full h-12 mt-3 bg-[#f7c600] disabled:opacity-30 text-black text-[10px] font-black uppercase flex items-center justify-center gap-2"><Check size={16}/> Aplicar estampa</button></div>
      </aside>

      <main className="order-1 xl:order-2 bg-[radial-gradient(circle_at_50%_30%,#45433f_0%,#252422_44%,#111_100%)] min-h-[720px] p-4 sm:p-6 lg:p-8 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{backgroundImage:'linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px)',backgroundSize:'34px 34px'}}/>
        <div className="relative z-10"><div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h2 className="text-xl font-black uppercase">Pré-visualização 3D</h2><p className="text-[10px] text-white/45 mt-1">Frente, lateral e costas da sua oversized</p></div><div className="flex gap-2"><button onClick={()=>{setAppliedFront(null);setAppliedBack(null);setArt(null)}} className="h-10 px-4 bg-black/60 border border-white/15 text-[9px] uppercase font-black flex items-center gap-2"><RotateCcw size={14}/> Limpar</button><button onClick={()=>setFullscreen(x=>!x)} className="h-10 px-4 bg-black/60 border border-white/15 text-[9px] uppercase font-black flex items-center gap-2">{fullscreen?<Eye size={14}/>:<Maximize2 size={14}/>} {fullscreen?'Normal':'Ampliar'}</button></div></div>

          <div className={`mt-5 grid ${fullscreen?'grid-cols-1':'grid-cols-1 md:grid-cols-3'} gap-3 md:gap-4 items-end transition-all`}>
            {(fullscreen?[view]:['front','side','back'] as View[]).map(v=><button key={v} onClick={()=>setView(v)} className={`relative rounded-sm border bg-black/10 min-h-[430px] md:min-h-[540px] overflow-hidden transition ${view===v?'border-[#f7c600] shadow-[0_0_0_1px_#f7c600]':'border-white/10'}`}><div className="absolute inset-0 p-2 md:p-3"><OversizedMockup view={v} color={color.hex} art={v==='front'?frontArt:v==='back'?backArt:null} showZone={v!=='side'}/></div><span className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/75 border border-white/10 px-3 py-2 text-[8px] uppercase tracking-[.16em] font-black">{v==='front'?'Frente':v==='side'?'Lateral':'Costas'}</span></button>)}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 max-w-xl mx-auto">{(['front','side','back'] as View[]).map(v=><button key={v} onClick={()=>setView(v)} className={`h-14 border text-[8px] uppercase font-black ${view===v?'border-[#f7c600] text-[#f7c600]':'border-white/10 text-white/55'}`}>{v==='front'?'Frente':v==='side'?'Lateral':'Costas'}</button>)}</div>
          <div className="mt-5 border border-white/10 bg-black/30 p-4 flex items-center gap-3"><Shirt className="text-[#f7c600]"/><div><p className="text-[10px] font-black uppercase">Modelagem oversized realista</p><p className="text-[9px] text-white/45 mt-1">O visualizador mantém mangas amplas, ombro deslocado e caimento longo para representar melhor a peça real.</p></div></div>
        </div>
      </main>
    </div>

    <section className="max-w-[1550px] mx-auto border border-white/10 border-t-0 bg-[#0e0e10] grid grid-cols-1 lg:grid-cols-[260px_1fr_auto] items-center"><div className="p-5 border-b lg:border-b-0 lg:border-r border-white/10"><p className="text-[8px] uppercase tracking-[.22em] text-white/45 font-black">PRIME CUSTOM</p><p className="text-3xl font-black text-[#f7c600] mt-1">R$ {fmt(PRICE)}</p><p className="text-[9px] text-white/45 mt-1">Valor fixo atual</p></div><div className="p-5 text-[9px] text-white/55">Upload por dispositivo ou link • Frente e costas até 30 x 40 cm • Mockup oversized em 3 vistas</div><div className="p-4"><button onClick={finish} className="w-full lg:w-auto min-w-[280px] h-14 px-7 bg-[#f7c600] text-black text-[10px] font-black uppercase flex items-center justify-center gap-3"><ShoppingBag size={18}/> Adicionar ao carrinho</button></div></section>
  </div>;
}

function Step({n,title}:{n:string;title:string}) { return <div className="flex items-center gap-3"><span className="w-7 h-7 rounded-full bg-[#f7c600] text-black flex items-center justify-center text-xs font-black">{n}</span><h2 className="text-xs font-black uppercase tracking-[.14em]">{title}</h2></div>; }
