import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getProductBySlug, products as staticProducts } from '../data/products';
import { useCart } from '../hooks/useCart';
import { cn } from '../lib/utils';
import { Clock, Truck, Plus, Trash2, ChevronRight, Loader2, Image as ImageIcon, X, Tag } from 'lucide-react';
import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../data/shipping';
import { isJoinvilleCEP, JOINVILLE_DELIVERY_TIME, JOINVILLE_SHIPPING_NAME } from '../lib/shipping';
import { useInventory } from '../hooks/useInventory';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy } from 'firebase/firestore';
import { PrintConfiguration } from '../types/cart';
import toast from 'react-hot-toast';
import { SizeChart } from '../components/SizeChart';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { getActivePromotion } from '../services/promotions/getActivePromotion';
import { WeeklyPromotion } from '../types/promotions';

interface Product {
  id: string;
  name: string;
  slug: string;
  headline: string;
  description: string;
  price: number;
  images: string[];
  imageStampSizes?: string[];
  stampGallery?: string[];
  stampGallerySizes?: string[];
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

const PRIME_LOCATIONS = ["Peito Central", "Costas", "Manga", "Peito Lateral"];

export default function ProductDetail() {
  const { slug } = useParams();
  const initialProduct = getProductBySlug(slug || '');
  const [product, setProduct] = useState<Product | null>(initialProduct as any || null);
  const [loading, setLoading] = useState(!initialProduct);
  const { addItem, items } = useCart();
  const { isAvailable, getStock, inventory } = useInventory();
  
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [activeImage, setActiveImage] = useState(0);
  const [viewingStampUrl, setViewingStampUrl] = useState<string | null>(null);
  const [cep, setCep] = useState('');
  const [shippingResult, setShippingResult] = useState<string | null>(null);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [printConfigs, setPrintConfigs] = useState<PrintConfiguration[]>([]);

  const [dynamicEstampas, setDynamicEstampas] = useState<any[]>([]);
  const [activePromo, setActivePromo] = useState<WeeklyPromotion | null>(null);
  const [parentProductData, setParentProductData] = useState<any>(null);

  useEffect(() => {
    if (!product || !product.parentSlug) {
      setParentProductData(null);
      return;
    }
    const q = query(collection(db, 'products'), where('slug', '==', product.parentSlug));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setParentProductData(snapshot.docs[0].data());
      }
    });
    return () => unsubscribe();
  }, [product?.parentSlug]);

  useEffect(() => {
    getActivePromotion().then((promo) => {
      setActivePromo(promo);
    });
  }, []);

  const navigate = useNavigate();

  // Redirect mother lines to the collection/model page
  useEffect(() => {
    if (slug === 'force' || slug === 'mark') {
      navigate(`/model/${slug}`, { replace: true });
    }
  }, [slug, navigate]);

  // Reset selection states when moving between products
  useEffect(() => {
    setSelectedSize('');
    setSelectedColor('');
    setPrintConfigs([]);
    setViewingStampUrl(null);
    setShippingResult(null);
    setCep('');
    setActiveImage(0);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    
    // Explicitly block any test or payment test products
    const slugLower = (slug || '').toLowerCase();
    if (
      slugLower === 'mark-prime-test' || 
      slugLower.includes('teste') || 
      slugLower.includes('test') ||
      slugLower === 'produto-teste-pagamento'
    ) {
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
  
  const displayImages = (product?.images && product.images.length > 0) 
    ? product.images 
    : (parentProductData?.images || []);

  const visibleColors = (product?.colors || []).filter(color => {
    const itemInv = product ? inventory?.[product.slug] : null;
    if (!itemInv) return true;

    const sizes = product.sizes || ['P', 'M', 'G', 'GG'];
    return sizes.some(size => {
      const key = `${color.name}_${size}`;
      return isAvailable(product.slug, key, product.parentSlug) && getStock(product.slug, key, product.parentSlug) > 0;
    });
  });

  const itemInv = product ? inventory?.[product.slug] : null;
  const parentInv = product?.parentSlug ? inventory?.[product.parentSlug] : null;
  const isProductOutOfStock = (!!itemInv && (itemInv.available === false || itemInv.stock <= 0)) ||
                              (!!parentInv && (parentInv.available === false || parentInv.stock <= 0));
  
  const currentVariantKey = (selectedColor && selectedSize) ? `${selectedColor}_${selectedSize}` : undefined;
  const stockCount = product ? getStock(product.slug, currentVariantKey, product.parentSlug) : 0;
  
  const isFullyAvailable = product 
    ? (isProductOutOfStock 
        ? false 
        : (currentVariantKey 
            ? (isAvailable(product.slug, currentVariantKey, product.parentSlug) && getStock(product.slug, currentVariantKey, product.parentSlug) > 0)
            : true))
    : false;

  useEffect(() => {
    if (product && product.colors && product.colors.length > 0) {
      const sizes = product.sizes || ['P', 'M', 'G', 'GG'];
      const computedVisible = product.colors.filter(color => {
        return sizes.some(size => {
          const key = `${color.name}_${size}`;
          return isAvailable(product.slug, key, product.parentSlug) && getStock(product.slug, key, product.parentSlug) > 0;
        });
      });

      if (computedVisible.length > 0) {
        if (!selectedColor || !computedVisible.some(c => c.name === selectedColor)) {
          setSelectedColor(computedVisible[0].name);
        }
      } else {
        if (!selectedColor) {
          setSelectedColor(product.colors[0].name);
        }
      }
    }
  }, [product, inventory, selectedColor]);

  useEffect(() => {
    if (product && selectedColor) {
      const sizes = product.sizes || ['P', 'M', 'G', 'GG'];
      const isCurrentAvailable = selectedSize && isAvailable(product.slug, `${selectedColor}_${selectedSize}`, product.parentSlug) && getStock(product.slug, `${selectedColor}_${selectedSize}`, product.parentSlug) > 0;
      if (!isCurrentAvailable) {
        const firstAvailable = sizes.find(sz => isAvailable(product.slug, `${selectedColor}_${sz}`, product.parentSlug) && getStock(product.slug, `${selectedColor}_${sz}`, product.parentSlug) > 0);
        if (firstAvailable) {
          setSelectedSize(firstAvailable);
        } else {
          setSelectedSize('');
        }
      }
    }
  }, [product, selectedColor, selectedSize, inventory]);

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

    // Validar estoque em tempo real para a variação selecionada
    const variantKey = `${selectedColor}_${selectedSize}`;
    const availableStock = getStock(product.slug, variantKey, product.parentSlug);
    
    // Encontrar quanto de mesma variação (produto, cor, tamanho) já temos no carrinho
    const existingInCart = items.find(
      (item) => item.id === product.id && item.color === selectedColor && item.size === selectedSize
    );
    const cartQty = existingInCart ? existingInCart.quantity : 0;

    if (cartQty + 1 > availableStock) {
      if (availableStock <= 0) {
        toast.error(`Desculpe, o produto no tamanho ${selectedSize} e cor ${selectedColor} já está esgotado.`);
      } else {
        toast.error(`Você já adicionou o limite máximo disponível em estoque (${availableStock} ${availableStock === 1 ? 'unidade' : 'unidades'}).`);
      }
      return;
    }

    addItem({
      id: product.id,
      slug: product.slug,
      parentSlug: product.parentSlug,
      name: product.name,
      price: currentPrice,
      image: viewingStampUrl || (isForceOrMark ? displayImages[0] : displayImages[activeImage]),
      size: selectedSize,
      color: selectedColor,
      quantity: 1,
      printConfigs: isPrime ? printConfigs : undefined
    });

    toast.success("Adicionado à sacola!");
    navigate('/bag');
  };

  const handleShippingCalc = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      setLoadingShipping(true);
      setShippingResult("");
      try {
        // 1. Fetch from ViaCEP to get correct Brazilian location and handle errors
        const viacep = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`).then(r => r.json());
        
        if (viacep.erro || !viacep.localidade) {
          setShippingResult("CEP não encontrado ou fora da área de entrega.");
          return;
        }

        // 2. Instant Joinville bypass - completely bypass external carrier APIs for local buyers
        const isJoinville = viacep.localidade.toLowerCase() === 'joinville' || isJoinvilleCEP(cleanCep);
        if (isJoinville) {
          const neighborhood = viacep.bairro?.trim().toUpperCase();
          const price = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhood] || DEFAULT_SHIPPING_PRICE;
          setShippingResult(`${JOINVILLE_SHIPPING_NAME}: R$ ${price.toFixed(2)} (${JOINVILLE_DELIVERY_TIME})`);
          return;
        }

        // 3. For outside Joinville, try the carrier calculation endpoint
        try {
          const calculateItems = [{
            id: product.id,
            width: 17,
            height: 5,
            length: 11,
            weight: 0.3,
            insurance_value: product.price,
            quantity: 1
          }];

          const response = await fetch('/api/shipping/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: cleanCep, items: calculateItems })
          });

          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
              const options = data
                .filter((s: any) => !s.error && s.price)
                .sort((a: any, b: any) => parseFloat(a.price) - parseFloat(b.price));

              if (options.length > 0) {
                const best = options[0];
                setShippingResult(`${best.name}: R$ ${parseFloat(best.price).toFixed(2)} (${best.delivery_time} dias úteis)`);
                return;
              }
            }
          }
        } catch (apiError) {
          console.warn("Melhor Envio calculation failed, falling back to smart regional estimation.", apiError);
        }

        // 4. Smart Regional Fallback if carrier API is unconfigured or down
        const state = viacep.uf?.toUpperCase() || '';
        let fallbackPrice = 24.90;
        let prazoMin = 6;
        let prazoMax = 12;
        let regionName = "PAC Correios";

        if (state === 'SC') {
          fallbackPrice = 16.90;
          prazoMin = 3;
          prazoMax = 6;
          regionName = "PAC Correios (SC)";
        } else if (['PR', 'SP', 'RS'].includes(state)) {
          fallbackPrice = 22.90;
          prazoMin = 5;
          prazoMax = 9;
          regionName = "PAC Correios (Sul/SP)";
        } else if (['RJ', 'MG', 'ES'].includes(state)) {
          fallbackPrice = 24.90;
          prazoMin = 6;
          prazoMax = 11;
          regionName = "PAC Correios (Sudeste)";
        } else {
          fallbackPrice = 32.90;
          prazoMin = 8;
          prazoMax = 15;
          regionName = "PAC Correios (Nacional)";
        }

        setShippingResult(`${regionName}: R$ ${fallbackPrice.toFixed(2)} (${prazoMin} a ${prazoMax} dias úteis)`);
      } catch (error) {
        console.error("Shipping calc error:", error);
        setShippingResult("Erro ao calcular frete. Tente novamente.");
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
        <meta property="og:image" content={displayImages[0] || ''} />
        <link rel="canonical" href={`https://www.fpacstore.com.br/product/${product.slug}`} />
      </Helmet>
      <div className="min-h-screen pt-20 md:pt-24 pb-12 md:pb-16 md:max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2 text-[8px] md:text-[9px] text-gray-500 uppercase tracking-widest mb-3 md:mb-5">
         <Link to="/" className="hover:text-black">INÍCIO</Link>
         <ChevronRight size={10} />
         <Link to="/catalog" className="hover:text-black">PRODUTOS</Link>
         {product.parentSlug && (
           <>
             <ChevronRight size={10} />
             <Link to={`/model/${product.parentSlug}`} className="hover:text-black font-black">{product.parentSlug}</Link>
           </>
         )}
         <ChevronRight size={10} />
         <span className="text-[#eab308]">{product.name}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-8">
        <div className="md:col-span-6 flex flex-col gap-4">
           <div className="flex flex-col-reverse md:flex-row gap-3">
               {!isForceOrMark && (
                 <div className="flex md:flex-col gap-2.5 overflow-x-auto md:w-14 snap-x">
                    {(displayImages || []).map((img, i) => (
                       <button key={i} onClick={() => setActiveImage(i)} className={cn("w-14 md:w-14 aspect-[3/4] flex-shrink-0 border-2 overflow-hidden rounded-none transition-colors snap-center", activeImage === i ? "border-[#eab308]" : "border-transparent hover:border-black/30")}>
                           {img ? (
                             <img src={img} alt={`${product.name} - ${i}`} className="w-full h-full object-contain" />
                           ) : (
                             <div className="w-full h-full flex items-center justify-center bg-gray-100">
                                <ImageIcon size={16} className="text-gray-400" />
                             </div>
                           )}
                        </button>
                     ))}
                  </div>
                )}

                <div className="flex-1 aspect-[3/4] bg-black/5 overflow-hidden relative group">
                   <img 
                     src={viewingStampUrl || displayImages[activeImage]} 
                     alt={product.name} 
                     className="w-full h-full object-contain"
                     onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/estampas/logo-fpac.png'; }}
                   />
                </div>
            </div>
         </div>

         <div className="md:col-span-6 flex flex-col gap-5">
            <div>
               <p className="text-[9px] text-[#eab308] font-black uppercase tracking-[0.4em] mb-1">{product.headline || "Edição Limitada"}</p>
               <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight italic drop-shadow-sm">{product.name}</h1>
               <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-sm font-black text-[#eab308] uppercase">R$</span>
                  <span className="text-2xl font-black tracking-tighter italic">
                    {product.price?.toFixed(2).split('.')[0]}
                    <span className="text-sm opacity-60 ml-0.5">,{product.price?.toFixed(2).split('.')[1]}</span>
                  </span>
               </div>
            </div>

            <div className="border-t border-b border-black/10 py-4">
               <p className="text-[11px] uppercase tracking-wider font-bold text-gray-400 mb-2">Descrição</p>
               <p className="text-xs text-gray-600 leading-relaxed uppercase">{product.description}</p>
            </div>

            {/* Seleção de Cores */}
            <div>
               <h3 className="text-xs font-black uppercase tracking-widest mb-3">Cor</h3>
               <div className="flex flex-wrap gap-2.5">
                  {visibleColors.map((color) => {
                     const isSelected = selectedColor === color.name;
                     return (
                       <button
                         key={color.name}
                         onClick={() => {
                            setSelectedColor(color.name);
                         }}
                         className={cn(
                           "flex items-center gap-2 px-3 py-2 border text-[10px] uppercase font-bold transition-all relative group",
                           isSelected 
                             ? "border-black bg-black text-white" 
                             : "border-black/10 hover:border-black text-black"
                         )}
                       >
                          <span 
                            className="w-3 h-3 rounded-full border border-black/10" 
                            style={{ backgroundColor: color.hex }}
                          />
                          {color.name}
                       </button>
                     );
                  })}
               </div>
            </div>

            {/* Seleção de Tamanhos */}
            <div>
               <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-black uppercase tracking-widest">Tamanho</h3>
               </div>
               <div className="flex flex-wrap gap-2.5">
                  {(product.sizes || ['P', 'M', 'G', 'GG']).map((size) => {
                     const sizeKey = `${selectedColor}_${size}`;
                     const isSizeAvailable = isAvailable(product.slug, sizeKey, product.parentSlug) && getStock(product.slug, sizeKey, product.parentSlug) > 0;
                     return (
                       <button
                         key={size}
                         onClick={() => isSizeAvailable && setSelectedSize(size)}
                         disabled={!isSizeAvailable}
                         className={cn(
                           "w-10 h-10 flex items-center justify-center border text-[10px] transition-all rounded-none font-bold relative select-none", 
                           selectedSize === size 
                             ? "border-black bg-black text-white shadow-sm scale-105 z-10 font-black" 
                             : "border-black/10 hover:border-[#eab308] text-black",
                           !isSizeAvailable && "opacity-30 cursor-not-allowed bg-gray-50 text-gray-300 border-dashed line-through font-normal"
                         )}
                         title={isSizeAvailable ? `Tamanho ${size}` : `Tamanho ${size} - Esgotado`}
                       >
                          {size}
                       </button>
                     );
                  })}
               </div>
            </div>

            {isPrime && (
              <div className="space-y-4 border-t border-black/10 pt-4">
                 <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black uppercase tracking-widest">Aplicações Prime</h3>
                    {printConfigs.length < 3 && (
                       <button 
                         onClick={addPrint} 
                         className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[#eab308] border border-[#eab308] px-2.5 py-1.5 hover:bg-[#eab308] hover:text-black transition-all"
                       >
                          <Plus size={12} /> Adicionar Aplicação ({printConfigs.length}/3)
                       </button>
                    )}
                 </div>

                 {printConfigs.map((config, idx) => (
                    <div key={config.id} className="border p-4 space-y-3 relative bg-black/[0.01]">
                       <button 
                         onClick={() => removePrint(idx)} 
                         className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors"
                       >
                          <Trash2 size={14} />
                       </button>

                       <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-400">Aplicação #{idx + 1}</h4>
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Local */}
                          <div>
                             <label className="block text-[8px] font-black uppercase tracking-wider text-gray-500 mb-1">Local da Camiseta</label>
                             <select 
                               value={config.location}
                               onChange={(e) => updatePrint(idx, 'location', e.target.value)}
                               className="w-full bg-white border border-black/10 text-[10px] px-2 py-1.5 uppercase font-bold focus:outline-none focus:border-[#eab308]"
                             >
                                <option value="">Selecione Local</option>
                                {PRIME_LOCATIONS.map(loc => (
                                   <option key={loc} value={loc}>{loc}</option>
                                ))}
                             </select>
                          </div>

                          {/* Estampa */}
                          <div>
                             <label className="block text-[8px] font-black uppercase tracking-wider text-gray-500 mb-1">Escolha a Estampa</label>
                             <select 
                               value={config.stamp}
                               disabled={!config.location}
                               onChange={(e) => updatePrint(idx, 'stamp', e.target.value)}
                               className="w-full bg-white border border-black/10 text-[10px] px-2 py-1.5 uppercase font-bold focus:outline-none focus:border-[#eab308] disabled:bg-gray-50 disabled:opacity-50"
                             >
                                <option value="">Selecione Estampa</option>
                                {dynamicEstampas.map(stamp => (
                                   <option key={stamp.id} value={stamp.name}>{stamp.name}</option>
                                ))}
                             </select>
                          </div>

                          {/* Tamanho da Estampa */}
                          <div className="md:col-span-2">
                             <label className="block text-[8px] font-black uppercase tracking-wider text-gray-500 mb-1">Tamanho da Aplicação</label>
                             <select 
                               value={(config as any).printSize || ''}
                               disabled={!config.stamp}
                               onChange={(e) => updatePrint(idx, 'printSize', e.target.value)}
                               className="w-full bg-white border border-black/10 text-[10px] px-2 py-1.5 uppercase font-bold focus:outline-none focus:border-[#eab308] disabled:bg-gray-50 disabled:opacity-50"
                             >
                                <option value="">Selecione Tamanho</option>
                                <option value="Pequeno">Pequeno</option>
                                <option value="Médio">Médio</option>
                                <option value="Grande">Grande</option>
                             </select>
                          </div>
                       </div>
                    </div>
                 ))}
              </div>
            )}

            <button 
               onClick={handleAddToCart} 
               disabled={!isFullyAvailable}
               className={cn(
                 "w-full font-black py-3 text-[11px] uppercase tracking-[0.2em] transition-all transform active:scale-95 mb-3.5 rounded-none",
                 isFullyAvailable 
                   ? "bg-[#eab308] text-black hover:bg-white border-2 border-transparent hover:border-black" 
                   : "bg-gray-200 text-gray-400 cursor-not-allowed"
               )}
            >
               {isFullyAvailable ? 'Adicionar à Sacola' : 'Produto Esgotado'}
            </button>


           <div className="mb-3.5 p-2 bg-black/[0.02] border border-black/10 rounded-none">
              <h4 className="text-[9px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-2"><Truck size={11} /> Calcular Frete</h4>
              <form onSubmit={handleShippingCalc} className="flex gap-2">
                 <input type="text" placeholder="00000-000" value={cep} onChange={(e) => setCep(e.target.value)} className="bg-white border border-black/20 rounded-none px-2 py-1 flex-1 text-[10px] focus:outline-none focus:border-[#eab308]" />
                 <button type="submit" disabled={loadingShipping} className="bg-black/10 text-black px-2 py-1 rounded-none hover:bg-black/20 text-[9px] font-bold uppercase">{loadingShipping ? '...' : 'Calcular'}</button>
              </form>
              {shippingResult && <p className="mt-1 text-[8px] text-[#eab308] font-bold uppercase tracking-widest">{shippingResult}</p>}
           </div>

           <div className="border-t border-black/10 pt-4">
              <h4 className="text-[10px] font-bold uppercase tracking-wider mb-2">Ficha Técnica</h4>
              <ul className="space-y-1 text-[11px] text-gray-600 list-disc list-inside">
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
