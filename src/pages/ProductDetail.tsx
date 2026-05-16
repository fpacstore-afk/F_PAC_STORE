import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getProductBySlug, products as staticProducts } from '../data/products';
import { useCart } from '../hooks/useCart';
import { cn } from '../lib/utils';
import { Clock, Truck, Plus, Trash2, ChevronRight, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../data/shipping';
import { useInventory } from '../hooks/useInventory';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore';
import { PrintConfiguration } from '../types/cart';
import toast from 'react-hot-toast';
import { SizeChart } from '../components/SizeChart';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';

interface Product {
  id: string;
  name: string;
  slug: string;
  headline: string;
  description: string;
  price: number;
  images: string[];
  stampGallery?: string[];
  sizes: string[];
  colors: { name: string; hex: string }[];
  specs: string[];
  isNew?: boolean;
  isBestseller?: boolean;
}

const catalogEstampasData = [
  { id: 'peito-1', name: 'Escrita Peito Core' },
  { id: 'logo-premium', name: 'F PAC Full Logo' },
];

const PRIME_LOCATIONS = ["Frente", "Costas", "Manga", "Peito", "Barra"];

export function ProductDetail() {
  const { slug } = useParams();
  const initialProduct = getProductBySlug(slug || '');
  const [product, setProduct] = useState<Product | null>(initialProduct as any || null);
  const [loading, setLoading] = useState(!initialProduct);
  const { addItem, items } = useCart();
  const { isAvailable, getStock } = useInventory();
  
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [activeImage, setActiveImage] = useState(0);
  const [viewingStampUrl, setViewingStampUrl] = useState<string | null>(null);
  const [cep, setCep] = useState('');
  const [shippingResult, setShippingResult] = useState<string | null>(null);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [printConfigs, setPrintConfigs] = useState<PrintConfiguration[]>([]);

  const [dynamicEstampas, setDynamicEstampas] = useState<any[]>([]);

  const navigate = useNavigate();

  useEffect(() => {
    if (!slug) return;
    
    // Explicitly block the old test product
    if (slug === 'mark-prime-test') {
      setProduct(null);
      setLoading(false);
      return;
    }
    
    const sanitizeProduct = (data: any) => {
      if (!data) return data;
      const sanitized = { ...data };

      // Ensure mandatory colors are present for main products
      const mandatoryColors = [
        { name: "Azul Marinho", hex: "#1b263b" },
        { name: "Verde Militar", hex: "#3f4238" },
        { name: "Off White", hex: "#FAF9F6" }
    ];
    
      if (sanitized.colors) {
        const isMainProduct = sanitized.slug === 'force' || sanitized.slug === 'mark' || sanitized.slug === 'prime';
        if (isMainProduct) {
          mandatoryColors.forEach(mc => {
            if (!sanitized.colors.find((c: any) => c.name === mc.name)) {
              sanitized.colors.push(mc);
            }
          });
        }
      }
      
      // Ensure price is a number
      if (typeof sanitized.price !== 'number') {
        sanitized.price = parseFloat(sanitized.price) || 0;
      }
      
      // Upgrade old FORCE description if detected
      if (data.slug === 'force' && ((data.description || '').includes('100% algodão premium de alta gramatura (220gsm)') || (data.description || '').includes('A camiseta FORCE combina estética minimalista'))) {
        sanitized.description = "A camiseta FORCE é a combinação estética minimalista com atitude marcante. Entrega estrutura, conforto e um caimento firme no corpo com estampas em DTF de alta definição que garante cores intensas, mantendo a peça sofisticada e confortável em qualquer ocasião.";
      }
      
      // Upgrade specs
      if (data.specs) {
        sanitized.specs = data.specs.map((spec: string) => {
          if (spec === "Algodão 100%" || spec === "Algodão 100% Premium") {
            return "90% Algodão e 10 Poliéster";
          }
          if (spec === "Gramatura 220gsm") {
            return "Gramatura 240gsm";
          }
          if (spec === "Estampa Digital HD") {
            return "Estampa DTF de qualidade";
          }
          return spec;
        });
      }
      
      return sanitized;
    };

    // Initial sync with static data
    const fallback = getProductBySlug(slug);
    if (fallback) setProduct(sanitizeProduct(fallback) as any);

    const q = query(collection(db, 'products'), where('slug', '==', slug));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const dynamicData = doc.data();
        
        setProduct(prev => {
          const base = prev || sanitizeProduct(fallback) as any || {};
          return sanitizeProduct({ ...base, ...dynamicData, id: doc.id }) as Product;
        });
      }
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar produto:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [slug]);

  const isPrime = product?.slug === 'prime';
  const isForceOrMark = product?.slug === 'force' || product?.slug === 'mark';
  
  const currentVariantKey = (selectedColor && selectedSize) ? `${selectedColor}_${selectedSize}` : undefined;
  const stockCount = product ? getStock(product.id, currentVariantKey) : 0;
  const isFullyAvailable = product ? isAvailable(product.id, currentVariantKey) : false;

  useEffect(() => {
    if (!isPrime) return;
    const q = query(collection(db, 'estampas'), orderBy('slotIndex', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((e: any) => e.image); // Only show slots that have an image
      setDynamicEstampas(data);
    });
    return () => unsubscribe();
  }, [isPrime]);

  const isLastPrintComplete = () => {
    if (printConfigs.length === 0) return true;
    const last = printConfigs[printConfigs.length - 1];
    return last.location && last.stamp && (last as any).printSize;
  };

  const addPrint = () => {
    if (printConfigs.length >= 3) return;
    if (printConfigs.length > 0 && !isLastPrintComplete()) {
      toast.error("Preencha a estampa atual antes de adicionar outra.");
      return;
    }

    const newPrint: any = {
      id: Math.random().toString(36).substring(2, 9),
      stamp: '',
      location: '',
      printSize: '',
      background: 'Com Fundo'
    };
    setPrintConfigs([...printConfigs, newPrint]);
  };

  const updatePrint = (index: number, field: string, value: string) => {
    const newConfigs = [...printConfigs];
    const update: any = { ...newConfigs[index], [field]: value };
    
    if (field === 'location') {
      update.stamp = '';
      update.printSize = '';
    }
    
    if (field === 'stamp') {
      const selectedStamp = dynamicEstampas.find(s => s.name === value);
      if (selectedStamp) {
        update.image = selectedStamp.image;
      }
      update.printSize = '';
    }
    
    newConfigs[index] = update;
    setPrintConfigs(newConfigs);
  };

  const removePrint = (index: number) => {
    setPrintConfigs(printConfigs.filter((_, i) => i !== index));
  };

  const currentPrice = product?.price || 0;

  if (loading) {
    return (
      <div className="min-h-screen pt-40 flex items-center justify-center">
        <Loader2 className="animate-spin text-[#eab308]" size={40} />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen pt-40 px-6 max-w-7xl mx-auto flex flex-col items-center justify-center">
        <h1 className="text-2xl font-black uppercase mb-4">Produto não encontrado.</h1>
        <Link to="/catalog" className="text-sm font-bold uppercase tracking-widest text-[#eab308] hover:underline">Voltar ao Catálogo</Link>
      </div>
    );
  }

  const handleAddToCart = () => {
    if (!selectedSize || !selectedColor) {
      toast.error("Selecione cor e tamanho antes de adicionar à sacola.");
      return;
    }

    if (isPrime) {
      const hasSelectedStamps = printConfigs.length > 0 && printConfigs.every(config => config.stamp && config.location && (config as any).printSize);
      if (!hasSelectedStamps) {
        toast.error("Para o modelo PRIME, selecione local, estampa e tamanho para cada aplicação.");
        return;
      }
    }

    const isFirstItemInCart = items.length === 0;
    
    addItem({
      id: product.id,
      name: product.name,
      price: currentPrice,
      image: viewingStampUrl || (isForceOrMark ? product.images[0] : product.images[activeImage]),
      size: selectedSize,
      color: selectedColor,
      quantity: 1,
      printConfigs: isPrime ? printConfigs : undefined
    });

    if (isFirstItemInCart) {
      toast((t) => (
        <div className="flex flex-col gap-5 p-7 min-w-[340px] text-center">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-[#eab308]">🚀 ADICIONADO!</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">O que você acha de economizar no envio?</p>
          </div>

          <div className="bg-[#eab308] text-black p-6 flex flex-col items-center justify-center gap-3 animate-pulse rounded-none border-b-4 border-black/20 shadow-xl">
            <Truck size={40} className="flex-shrink-0" />
            <span className="text-sm font-black uppercase tracking-tighter leading-tight">
              SABIA QUE O FRETE É <span className="underline italic">GRÁTIS</span><br/>A PARTIR DE 2 PEÇAS?
            </span>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button 
              onClick={() => {
                toast.dismiss(t.id);
                navigate('/bag');
              }}
              className="bg-white text-black py-4 px-4 text-[11px] font-black uppercase tracking-widest hover:bg-[#eab308] transition-all hover:scale-105"
            >
              FINALIZAR PEDIDO
            </button>
            
            <button 
              onClick={() => toast.dismiss(t.id)}
              className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em] hover:text-white transition-colors"
            >
              [ CONTINUAR COMPRANDO ]
            </button>
          </div>
        </div>
      ), { 
        duration: 15000,
        position: 'top-center',
        style: { 
          background: '#0a0a0a', 
          border: '2px solid #eab308',
          padding: '0',
          boxShadow: '0 25px 80px -12px rgba(0, 0, 0, 0.8)',
          marginTop: '15vh',
          borderRadius: '0px'
        }
      });
    } else {
      toast.success("Adicionado à sacola!");
      navigate('/bag');
    }
  };

  const handleShippingCalc = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCep = cep.replace(/\D/g, '');
    if(cleanCep.length === 8) {
      setLoadingShipping(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          if (data.localidade.toLowerCase() === 'joinville') {
            const neighborhood = data.bairro.trim().toUpperCase();
            const price = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhood] || DEFAULT_SHIPPING_PRICE;
            setShippingResult(`Frete para ${data.bairro}: R$ ${price.toFixed(2)} (2 a 4 dias úteis)`);
          } else {
            setShippingResult("Desculpe, entrega disponível apenas em Joinville no momento.");
          }
        } else {
          setShippingResult("CEP não encontrado.");
        }
      } catch (error) {
        setShippingResult("Erro ao calcular frete.");
      } finally {
        setLoadingShipping(false);
      }
    }
  };

  return (
    <>
      <Helmet>
        <title>{`${product.name} | F PAC STORE`}</title>
        <meta name="description" content={product.description?.substring(0, 160)} />
        <meta property="og:title" content={`${product.name} - F PAC STORE`} />
        <meta property="og:description" content={product.headline} />
        <meta property="og:image" content={product.images[0]} />
        <link rel="canonical" href={`https://www.fpacstore.com.br/product/${product.slug}`} />
      </Helmet>
      <div className="min-h-screen pt-32 md:pt-48 pb-16 md:pb-20 md:max-w-5xl lg:max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-[10px] md:text-[11px] text-gray-500 uppercase tracking-widest mb-6 md:mb-8">
         <Link to="/" className="hover:text-black">INÍCIO</Link>
         <ChevronRight size={12} />
         <Link to="/catalog" className="hover:text-black">PRODUTOS</Link>
         <ChevronRight size={12} />
         <span className="text-[#eab308]">{product.name}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-16">
        <div className="md:col-span-7 flex flex-col gap-8">
           <div className="flex flex-col-reverse md:flex-row gap-4">
               {!isForceOrMark && (
                 <div className="flex md:flex-col gap-4 overflow-x-auto md:w-20 snap-x">
                    {(product.images || []).map((img, i) => (
                       <button key={i} onClick={() => setActiveImage(i)} className={cn("w-20 md:w-20 aspect-[3/4] flex-shrink-0 border-2 overflow-hidden rounded-none transition-colors snap-center", activeImage === i ? "border-[#eab308]" : "border-transparent hover:border-black/30")}>
                          {img ? (
                            <img src={img} alt={`${product.name} - ${i}`} className="w-full h-full object-contain" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gray-100">
                               <ImageIcon size={20} className="text-gray-400" />
                            </div>
                          )}
                       </button>
                    ))}
                 </div>
               )}
               <div className="flex-1 aspect-[3/4] bg-black/5 rounded-none overflow-hidden relative w-full">
                  {(viewingStampUrl || (isForceOrMark ? product.images[0] : product.images[activeImage])) ? (
                    <img 
                      src={viewingStampUrl || (isForceOrMark ? product.images[0] : product.images[activeImage])} 
                      alt={product.name} 
                      className="w-full h-full object-contain transition-all duration-300" 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-black/10">
                      <ImageIcon size={48} />
                    </div>
                  )}
                  {viewingStampUrl && (
                    <button 
                      onClick={() => setViewingStampUrl(null)}
                      className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black transition-colors"
                      title="Voltar para imagem principal"
                    >
                      <X size={16} />
                    </button>
                  )}
               </div>
           </div>

           {isForceOrMark && product.stampGallery && product.stampGallery.some(s => s) && (
             <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-px bg-black flex-1" />
                  <h3 className="text-xs font-black uppercase tracking-[0.2em]">Estampas Disponíveis</h3>
                  <div className="h-px bg-black flex-1" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                   {product.stampGallery.map((stamp, idx) => (
                     stamp ? (
                       <button 
                          key={idx} 
                          onClick={() => {
                            setViewingStampUrl(stamp);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={cn(
                            "aspect-[3/4] bg-black/5 overflow-hidden group cursor-pointer border-2 transition-all",
                            viewingStampUrl === stamp ? "border-[#eab308]" : "border-transparent"
                          )}
                        >
                          {stamp && (
                            <img 
                              src={stamp || undefined} 
                              alt={`Estampa ${idx + 1}`} 
                              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110" 
                            />
                          )}
                       </button>
                     ) : null
                   ))}
                </div>
             </div>
           )}
        </div>

        <div className="md:col-span-5 flex flex-col">
           <h1 className={cn(
             "text-4xl md:text-5xl font-heading font-black tracking-tighter uppercase mb-2 italic",
             product.slug === 'prime' && "animate-pulse-glow text-[#eab308]"
           )}>
              {product.name}
           </h1>
           <div className="flex flex-col mb-6 md:mb-8">
              <div className="flex items-baseline gap-3">
                <div className="flex items-baseline gap-2">
                   <p className="text-5xl md:text-6xl font-black text-black font-heading tracking-tighter">
                      R$ {currentPrice?.toFixed(2)}
                   </p>
                </div>
              </div>
              <span className="text-sm md:text-base font-bold text-gray-500 uppercase tracking-widest mt-1">ou até 12x no cartão</span>
           </div>
           
           <p className="text-base md:text-lg text-gray-700 mb-8 whitespace-pre-wrap leading-relaxed border-l-4 border-[#eab308] pl-6 font-medium italic">
              {product.description}
           </p>

           <div className="mb-6 p-4 bg-black/[0.02] border border-black/5">
              <div className="flex items-center justify-between mb-2">
                 <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Status de Estoque:</span>
                 {isFullyAvailable ? (
                   <span className="text-[10px] font-black uppercase tracking-widest text-green-600">Em estoque</span>
                 ) : (
                   <span className="text-[10px] font-black uppercase tracking-widest text-red-500">Esgotado</span>
                 )}
              </div>
              <div className="h-1 bg-black/5 w-full">
                 <div 
                   className={cn("h-full transition-all duration-1000", isFullyAvailable ? (stockCount < 5 ? "bg-orange-500" : "bg-green-500") : "bg-gray-200")} 
                   style={{ width: `${Math.min(100, (stockCount / 20) * 100)}%` }}
                 />
              </div>
              {isFullyAvailable && stockCount < 5 && (
                 <p className="text-[9px] text-orange-600 font-bold uppercase mt-2 animate-pulse">🔥 Corra! Apenas {stockCount} unidades restantes.</p>
              )}
           </div>

           {isPrime && (
             <div className="mb-10 p-6 bg-black/[0.02] border border-black/5 space-y-6">
                <div className="flex justify-between items-center bg-black p-4 -m-6 mb-6">
                   <h3 className="text-[10px] font-black uppercase tracking-[0.3em] flex items-center gap-2 text-white">
                      <ImageIcon size={14} className="text-[#eab308]" /> Personalização Prime
                   </h3>
                   {printConfigs.length < 3 && (
                     <button 
                       onClick={addPrint}
                       disabled={!isLastPrintComplete()}
                       className={cn(
                         "text-[9px] font-black uppercase px-4 py-2 transition-all shadow-lg active:scale-95",
                         isLastPrintComplete() 
                           ? "bg-[#eab308] text-black hover:bg-white" 
                           : "bg-white/10 text-white/30 cursor-not-allowed"
                       )}
                     >
                       + ADICIONAR ESTAMPA ({printConfigs.length}/3)
                     </button>
                   )}
                </div>
                
                <div className="space-y-4">
                  {printConfigs.map((config, idx) => {
                    const selectedLoc = config.location;
                    const selectedStampName = config.stamp;
                    const stampData = dynamicEstampas.find(s => s.name === selectedStampName);
                    
                    return (
                      <div key={idx} className="p-4 bg-white border border-black/5 relative group animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex items-center justify-between mb-4 border-b border-black/5 pb-2">
                           <span className="text-[10px] font-black uppercase tracking-tighter bg-black text-[#eab308] px-2 py-0.5">SLOT {idx + 1}</span>
                           {idx > 0 && (
                             <button 
                               onClick={() => removePrint(idx)}
                               className="text-[9px] font-black uppercase text-red-500 hover:text-red-700 transition-colors flex items-center gap-1"
                             >
                               <Trash2 size={12} /> Remover
                             </button>
                           )}
                        </div>

                        <div className="flex flex-col md:flex-row gap-6">
                           <div 
                             className="w-24 h-24 bg-black/[0.03] flex-shrink-0 flex items-center justify-center p-2 relative cursor-pointer hover:bg-black/5 transition-colors" 
                             onClick={() => config.image && setViewingStampUrl(config.image)}
                           >
                              {config.image ? (
                                <img src={config.image} alt={config.stamp} className="max-w-full max-h-full object-contain" />
                              ) : (
                                <ImageIcon size={24} className="text-black/10" />
                              )}
                           </div>
   
                           <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="flex flex-col gap-1">
                                 <label className="text-[9px] font-black uppercase text-gray-400">Local</label>
                                 <select 
                                   value={config.location} 
                                   onChange={(e) => updatePrint(idx, 'location', e.target.value)}
                                   className="w-full text-[11px] font-bold uppercase border-b-2 border-black/10 py-2 focus:outline-none focus:border-[#eab308] bg-transparent appearance-none"
                                 >
                                    <option value="">Selecione</option>
                                    {PRIME_LOCATIONS.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                 </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                 <label className="text-[9px] font-black uppercase text-gray-400">Estampa</label>
                                 <select 
                                   value={config.stamp} 
                                   onChange={(e) => updatePrint(idx, 'stamp', e.target.value)}
                                   className="w-full text-[11px] font-bold uppercase border-b-2 border-black/10 py-2 focus:outline-none focus:border-[#eab308] bg-transparent appearance-none"
                                   disabled={!config.location}
                                 >
                                    <option value="">{config.location ? "Escolha a Estampa" : "Aguardando Local"}</option>
                                    {dynamicEstampas
                                      .filter((st: any) => {
                                        if (!config.location) return false;
                                        if (!isAvailable(st.id) || getStock(st.id) <= 0) return false;
                                        const allowed = st.allowedLocations || [];
                                        return allowed.includes(config.location);
                                      })
                                      .map(st => (
                                        <option key={st.id} value={st.name}>
                                          {st.name} ({getStock(st.id)})
                                        </option>
                                      ))
                                    }
                                 </select>
                              </div>
                              <div className="flex flex-col gap-1">
                                 <label className="text-[9px] font-black uppercase text-gray-400">Tamanho</label>
                                 <select 
                                   value={(config as any).printSize} 
                                   onChange={(e) => updatePrint(idx, 'printSize', e.target.value)}
                                   className="w-full text-[11px] font-bold uppercase border-b-2 border-black/10 py-2 focus:outline-none focus:border-[#eab308] bg-transparent appearance-none"
                                   disabled={!config.stamp}
                                 >
                                    <option value="">{config.stamp ? "Tamanho" : "Aguardando Estampa"}</option>
                                    {stampData?.locationConfigs?.[selectedLoc]?.sizes?.filter((s: string) => s && s.trim() !== '').map((s: string, sidx: number) => (
                                      <option key={sidx} value={s}>{s}</option>
                                    ))}
                                 </select>
                              </div>
                           </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
             </div>
           )}

            <div className="mb-10">
               <label className="text-[10px] uppercase text-black/40 font-black block mb-4 tracking-[0.3em]">Cores Disponíveis:</label>
               <div className="flex flex-wrap gap-4">
                  {product.colors.map(color => (
                    <button
                       key={color.name}
                       onClick={() => setSelectedColor(color.name)}
                       className={cn(
                         "group flex items-center gap-3 px-5 py-3 border transition-all duration-300 relative overflow-hidden",
                         selectedColor === color.name 
                           ? "border-black bg-black text-white shadow-xl scale-105 z-10" 
                           : "border-black/5 bg-gray-50 text-black/40 hover:border-black/20 hover:text-black"
                       )}
                    >
                       <div 
                         className={cn(
                           "w-6 h-6 rounded-full border-2 border-white shadow-[0_0_10px_rgba(0,0,0,0.1)] transition-transform duration-500 group-hover:scale-110",
                           selectedColor === color.name ? "ring-2 ring-[#eab308]" : "ring-1 ring-black/10"
                         )} 
                         style={{ backgroundColor: color.hex }} 
                       />
                       <span className="text-[11px] font-black uppercase tracking-widest">{color.name}</span>
                       {selectedColor === color.name && (
                         <motion.div 
                           layoutId="activeColor"
                           className="absolute bottom-0 left-0 w-full h-[3px] bg-[#eab308]"
                         />
                       )}
                    </button>
                  ))}
               </div>
            </div>

           <div className="mb-8">
              <label className="text-[10px] uppercase text-black/40 font-bold block mb-3 tracking-widest">SELECIONE O TAMANHO</label>
              <div className="flex flex-wrap gap-2">
                 {(product.sizes || ['P', 'M', 'G', 'GG']).map(size => {
                   const available = selectedColor ? isAvailable(product.id, `${selectedColor}_${size}`) : true;
                   return (
                     <button
                        key={size}
                        onClick={() => setSelectedSize(size)}
                        disabled={!available}
                        className={cn(
                          "w-12 h-12 flex items-center justify-center border text-xs transition-colors rounded-none font-bold", 
                          selectedSize === size ? "border-[#eab308] bg-[#eab308]/10 text-black" : "border-black/10 hover:border-[#eab308]",
                          !available && "opacity-20 cursor-not-allowed grayscale"
                        )}
                     >
                        {size}
                     </button>
                   );
                 })}
              </div>
           </div>

           <button 
             onClick={handleAddToCart} 
             disabled={!isFullyAvailable}
             className={cn(
               "w-full font-black py-5 text-sm uppercase tracking-[0.2em] transition-all transform active:scale-95 mb-8 rounded-none",
               isFullyAvailable 
                 ? "bg-[#eab308] text-black hover:bg-white" 
                 : "bg-gray-200 text-gray-400 cursor-not-allowed"
             )}
           >
              {isFullyAvailable ? 'Adicionar à Sacola' : 'Produto Esgotado'}
           </button>

           <div className="mb-8 p-4 bg-black/5 border border-black/10 rounded-none">
              <h4 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2"><Truck size={16} /> Calcular Frete</h4>
              <form onSubmit={handleShippingCalc} className="flex gap-2">
                 <input type="text" placeholder="00000-000" value={cep} onChange={(e) => setCep(e.target.value)} className="bg-[#ffffff] border border-black/20 rounded-none px-4 py-2 flex-1 text-sm focus:outline-none focus:border-[#eab308]" />
                 <button type="submit" disabled={loadingShipping} className="bg-black/10 text-black px-4 py-2 rounded-none hover:bg-black/20 text-sm font-bold uppercase">{loadingShipping ? '...' : 'Calcular'}</button>
              </form>
              {shippingResult && <p className="mt-3 text-[10px] text-[#eab308] font-bold uppercase tracking-widest">{shippingResult}</p>}
           </div>

           <div className="border-t border-black/10 pt-6">
              <h4 className="text-sm font-bold uppercase tracking-wider mb-4">Ficha Técnica</h4>
              <ul className="space-y-2 text-sm text-gray-600 list-disc list-inside">
                 {(product.specs || ["90% Algodão e 10 Poliéster", "Fio 30.1 Penteado", "Pode ser personalizada", "Conforto térmico"]).map((spec, i) => {
                    let displaySpec = spec;
                    if (spec === "Algodão 100%" || spec === "Algodão 100% Premium") {
                      displaySpec = "90% Algodão e 10 Poliéster";
                    }
                    return <li key={i}>{displaySpec}</li>;
                 })}
              </ul>
           </div>
        </div>
      </div>

      <SizeChart />
    </div>
  </>
  );
}
