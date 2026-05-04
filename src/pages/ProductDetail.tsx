import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProductBySlug, products as staticProducts } from '../data/products';
import { useCart, PrintConfiguration } from '../context/CartContext';
import { cn } from '../lib/utils';
import { Clock, Truck, Plus, Trash2, ChevronRight, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../data/shipping';
import { useInventory } from '../hooks/useInventory';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore';

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

const availableLocations = [
  "Peito Central", "Peito LD", "Peito LE", "Costas", "Ombro"
];

export function ProductDetail() {
  const { slug } = useParams();
  const initialProduct = getProductBySlug(slug || '');
  const [product, setProduct] = useState<Product | null>(initialProduct as any || null);
  const [loading, setLoading] = useState(!initialProduct);
  const { addToCart } = useCart();
  const { isAvailable, getStock } = useInventory();
  
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [activeImage, setActiveImage] = useState(0);
  const [cep, setCep] = useState('');
  const [shippingResult, setShippingResult] = useState<string | null>(null);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [printConfigs, setPrintConfigs] = useState<PrintConfiguration[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [promoDiscount, setPromoDiscount] = useState(5);

  useEffect(() => {
    if (!slug) return;
    
    // Initial sync with static data
    const fallback = getProductBySlug(slug);
    if (fallback) setProduct(fallback as any);

    const q = query(collection(db, 'products'), where('slug', '==', slug));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const dynamicData = doc.data();
        
        setProduct(prev => {
          const base = prev || fallback as any || {};
          return { ...base, ...dynamicData, id: doc.id } as Product;
        });
      }
      setLoading(false);
    }, (error) => {
      console.error("Erro ao carregar produto:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [slug]);

  const isEligible = ['force', 'mark', 'prime'].includes(product?.slug || '');
  const isPrime = product?.slug === 'prime';
  const isForceOrMark = product?.slug === 'force' || product?.slug === 'mark';
  
  const currentVariantKey = (selectedColor && selectedSize) ? `${selectedColor}_${selectedSize}` : undefined;
  const stockCount = product ? getStock(product.id, currentVariantKey) : 0;
  const isFullyAvailable = product ? isAvailable(product.id, currentVariantKey) : false;

  useEffect(() => {
    if (!isPrime) return;
    const q = query(collection(db, 'estampas'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Use dynamic estampas if available
    });
    return () => unsubscribe();
  }, [isPrime]);

  const addPrint = () => {
    setPrintConfigs([...printConfigs, { stamp: '', location: '' }]);
  };

  const updatePrint = (index: number, field: 'stamp' | 'location', value: string) => {
    const newConfigs = [...printConfigs];
    newConfigs[index] = { ...newConfigs[index], [field]: value };
    setPrintConfigs(newConfigs);
  };

  const removePrint = (index: number) => {
    setPrintConfigs(printConfigs.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (!isEligible || !product) return;

    const checkPromo = () => {
      const now = Date.now();
      const thirtyMinutesInMs = 30 * 60 * 1000;
      const twoHoursInMs = 2 * 60 * 60 * 1000;

      let lastActivation = Number(localStorage.getItem('f_pac_promo_last_activation') || 0);
      let endTime = Number(localStorage.getItem('f_pac_promo_end') || 0);
      let storedDiscount = Number(localStorage.getItem('f_pac_promo_value') || 5);

      if (now - lastActivation >= twoHoursInMs) {
        const rand = Math.random() * 100;
        let newValue = 5;
        if (rand < 15) newValue = 9;
        else if (rand < 50) newValue = 7;
        else newValue = 5;
        
        lastActivation = now;
        endTime = now + thirtyMinutesInMs;
        storedDiscount = newValue;
        
        localStorage.setItem('f_pac_promo_last_activation', lastActivation.toString());
        localStorage.setItem('f_pac_promo_end', endTime.toString());
        localStorage.setItem('f_pac_promo_value', storedDiscount.toString());
      }

      setPromoDiscount(storedDiscount);
      const difference = Math.max(0, Math.floor((endTime - now) / 1000));
      setTimeLeft(difference);
    };

    checkPromo();
    const interval = setInterval(checkPromo, 1000);
    return () => clearInterval(interval);
  }, [isEligible, product?.id]);

  const currentPrice = (isEligible && timeLeft > 0 && product) ? product.price - promoDiscount : (product?.price || 0);

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
      alert("Selecione cor e tamanho antes de adicionar à sacola.");
      return;
    }
    
    addToCart({
      id: product.id,
      name: product.name,
      price: currentPrice,
      image: product.images[0],
      size: selectedSize,
      color: selectedColor,
      quantity: 1,
      printConfigs: isPrime ? printConfigs : undefined
    });
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

  const formatTime = (seconds: number) => {
     const m = Math.floor(seconds / 60);
     const s = seconds % 60;
     return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen pt-40 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-widest mb-8">
         <Link to="/" className="hover:text-black">INÍCIO</Link>
         <ChevronRight size={12} />
         <Link to="/catalog" className="hover:text-black">PRODUTOS</Link>
         <ChevronRight size={12} />
         <span className="text-[#eab308]">{product.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-7 flex flex-col gap-8">
           <div className="flex flex-col-reverse md:flex-row gap-4">
               {!isForceOrMark && (
                 <div className="flex md:flex-col gap-4 overflow-x-auto md:w-20 snap-x">
                    {product.images.map((img, i) => (
                       <button key={i} onClick={() => setActiveImage(i)} className={cn("w-20 md:w-20 aspect-[3/4] flex-shrink-0 border-2 overflow-hidden rounded-none transition-colors snap-center", activeImage === i ? "border-[#eab308]" : "border-transparent hover:border-black/30")}>
                          <img src={img} alt={`${product.name} - ${i}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                       </button>
                    ))}
                 </div>
               )}
               <div className="flex-1 aspect-[3/4] bg-black/5 rounded-none overflow-hidden relative w-full">
                  <img 
                    src={isForceOrMark ? product.images[0] : product.images[activeImage]} 
                    alt={product.name} 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer" 
                  />
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
                       <div key={idx} className="aspect-[3/4] bg-black/5 overflow-hidden group cursor-pointer border border-black/5">
                          <img 
                            src={stamp} 
                            alt={`Estampa ${idx + 1}`} 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                          />
                       </div>
                     ) : null
                   ))}
                </div>
             </div>
           )}
        </div>

        <div className="lg:col-span-5 flex flex-col">
           {isEligible && timeLeft > 0 && (
             <div className="bg-red-500/10 border border-red-500/20 p-3 mb-6 flex justify-between items-center rounded-none">
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Oferta termina em:</span>
                <span className="font-mono text-red-500 font-bold">{formatTime(timeLeft)}</span>
             </div>
           )}

           <h1 className="text-4xl font-heading font-black tracking-tighter uppercase mb-2">
              {product.name}
           </h1>
           <div className="flex flex-col mb-6">
              <div className="flex items-center gap-3">
                {isEligible && timeLeft > 0 && <span className="text-xl text-gray-400 line-through">R$ {product.price?.toFixed(2)}</span>}
                <p className="text-3xl font-bold text-black font-heading">R$ {currentPrice?.toFixed(2)}</p>
              </div>
              <span className="text-sm font-normal text-gray-500">ou até 12x</span>
           </div>
           
           <p className="text-gray-600 mb-6 whitespace-pre-wrap">{product.description}</p>

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
             <div className="mb-8 p-6 bg-black/[0.02] border border-black/5 space-y-6">
                <div className="flex justify-between items-center">
                   <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                      <ImageIcon size={14} className="text-[#eab308]" /> Personalização Prime
                   </h3>
                   <button 
                     onClick={addPrint}
                     className="text-[9px] font-black uppercase bg-black text-white px-3 py-1.5 hover:bg-[#eab308] hover:text-black transition-all"
                   >
                     + Adicionar Estampa
                   </button>
                </div>
                
                <p className="text-[10px] text-gray-500 uppercase tracking-widest leading-relaxed">
                   Escolha as estampas e os locais de aplicação para sua peça Prime.
                </p>

                {printConfigs.map((config, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white border border-black/5 relative group">
                     <button 
                       onClick={() => removePrint(idx)}
                       className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                     >
                       <X size={12} />
                     </button>
                     <div>
                        <label className="text-[8px] font-black uppercase text-gray-400 block mb-1">Onde?</label>
                        <select 
                          value={config.location} 
                          onChange={(e) => updatePrint(idx, 'location', e.target.value)}
                          className="w-full text-[10px] font-bold uppercase border-b border-black/10 py-2 focus:outline-none focus:border-[#eab308]"
                        >
                           <option value="">Selecione o Local</option>
                           {availableLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                        </select>
                     </div>
                     <div>
                        <label className="text-[8px] font-black uppercase text-gray-400 block mb-1">Qual Estampa?</label>
                        <select 
                          value={config.stamp} 
                          onChange={(e) => updatePrint(idx, 'stamp', e.target.value)}
                          className="w-full text-[10px] font-bold uppercase border-b border-black/10 py-2 focus:outline-none focus:border-[#eab308]"
                        >
                           <option value="">Selecione a Estampa</option>
                           {catalogEstampasData.map(st => <option key={st.id} value={st.name}>{st.name}</option>)}
                        </select>
                     </div>
                  </div>
                ))}
             </div>
           )}

           <div className="mb-6">
              <label className="text-[10px] uppercase text-black/40 font-bold block mb-3 tracking-widest">ESCOLHA A COR:</label>
              <div className="flex gap-3">
                 {product.colors.map(color => (
                   <button
                      key={color.name}
                      onClick={() => setSelectedColor(color.name)}
                      className={cn("w-8 h-8 rounded-full border-2 transition-all", selectedColor === color.name ? "border-[#eab308] ring-2 ring-black" : "border-black/20 hover:border-black/50")}
                      style={{ backgroundColor: color.hex }}
                   />
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
                 {(product.specs || ["Algodão 100% Premium", "Fio 30.1 Penteado"]).map((spec, i) => (
                    <li key={i}>{spec}</li>
                 ))}
              </ul>
           </div>
        </div>
      </div>
    </div>
  );
}
