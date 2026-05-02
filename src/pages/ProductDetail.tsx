import type React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getProductBySlug, products } from '../data/products';
import { useCart, PrintConfiguration } from '../context/CartContext';
import { cn } from '../lib/utils';
import { Clock, Truck, Plus, Trash2, ChevronRight, Loader2 } from 'lucide-react';
import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../data/shipping';

const availableStamps = [
  "Caveira Flamejante", "Logo F PAC STORE Minimal", "Cyberpunk Art", 
  "Graffiti Tag", "Águia Street", "Texto Bold Back"
];

// Wrap stamp names that shouldn't be translated in objects or handle in UI
// For now just adding the translate="no" in the UI where it's used is better.

const availableLocations = [
  "Peito Central", "Peito LD", "Peito LE", "Costas", "Ombro"
];

export function ProductDetail() {
  const { slug } = useParams();
  const product = getProductBySlug(slug || '');
  const { addToCart } = useCart();
  
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('');
  const [activeImage, setActiveImage] = useState(0);
  const [cep, setCep] = useState('');
  const [shippingResult, setShippingResult] = useState<string | null>(null);
  const [loadingShipping, setLoadingShipping] = useState(false);

  // Customization state for PRIME
  const isPrime = product?.slug === 'prime';
  const [printConfigs, setPrintConfigs] = useState<PrintConfiguration[]>([]);

  // Reset selections when product changes
  useEffect(() => {
    if (product) {
       setSelectedSize('');
       setSelectedColor('');
       setActiveImage(0);
       setShippingResult(null);
       setPrintConfigs([]);
    }
  }, [product?.id]);

  // Shared Countdown logic (30 minutes)
  const [timeLeft, setTimeLeft] = useState(0);
  const [promoDiscount, setPromoDiscount] = useState(5);
  const isEligible = ['force', 'mark', 'prime'].includes(product?.slug || '');

  useEffect(() => {
    if (!isEligible) return;

    const checkPromo = () => {
      const now = Date.now();
      const thirtyMinutesInMs = 30 * 60 * 1000;
      const twoHoursInMs = 2 * 60 * 60 * 1000;

      let lastActivation = Number(localStorage.getItem('f_pac_promo_last_activation') || 0);
      let endTime = Number(localStorage.getItem('f_pac_promo_end') || 0);
      let storedDiscount = Number(localStorage.getItem('f_pac_promo_value') || 5);

      // If more than 2 hours passed since last activation, start a NEW session
      if (now - lastActivation >= twoHoursInMs) {
        const rand = Math.random() * 100;
        let newValue = 5;
        if (rand < 15) newValue = 9;
        else if (rand < 50) newValue = 7; // 15 + 35 = 50
        else newValue = 5; // next 50%
        
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
  }, [isEligible]);

  const currentPrice = (isEligible && timeLeft > 0) ? product.price - promoDiscount : product.price;

  if (!product) {
    return (
      <div className="min-h-screen pt-32 pb-24 flex items-center justify-center">
        <h1 className="text-2xl">Produto não encontrado.</h1>
      </div>
    );
  }

  const addPrintConfig = () => {
    if (printConfigs.length >= 3) {
      alert("Limite máximo de 3 estampas por camisa.");
      return;
    }
    setPrintConfigs([...printConfigs, {
      id: Math.random().toString(36).substring(7),
      stamp: availableStamps[0],
      location: availableLocations.find(loc => !printConfigs.map(c => c.location).includes(loc)) || availableLocations[0],
      background: 'Sem Fundo'
    }]);
  };

  const updatePrintConfig = (id: string, field: keyof PrintConfiguration, value: string) => {
    setPrintConfigs(printConfigs.map(cfg => cfg.id === id ? { ...cfg, [field]: value } : cfg));
  };

  const removePrintConfig = (id: string) => {
    setPrintConfigs(printConfigs.filter(cfg => cfg.id !== id));
  };

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
        setShippingResult(null);
        try {
           const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
           const data = await response.json();
           
           if (!data.erro) {
              if (data.localidade.toLowerCase() === 'joinville') {
                 const neighborhood = data.bairro.trim().toUpperCase();
                 const price = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhood] || DEFAULT_SHIPPING_PRICE;
                 setShippingResult(`Frete para ${data.bairro}: R$ ${price.toFixed(2)} (2 a 4 dias úteis)`);
              } else {
                 setShippingResult("Desculpe, entrega indisponível fora de Joinville no momento.");
              }
           } else {
              setShippingResult("CEP não encontrado.");
           }
        } catch (error) {
           console.error("Erro ao buscar frete:", error);
           setShippingResult("Erro ao calcular frete. Tente novamente.");
        } finally {
           setLoadingShipping(false);
        }
     } else {
        setShippingResult("Insira um CEP válido (8 dígitos).");
     }
  }

  const formatTime = (seconds: number) => {
     const m = Math.floor(seconds / 60);
     const s = seconds % 60;
     return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Get other products for "Comprados Junto"
  const boughtTogether = products.filter(p => p.id !== product.id);

  return (
    <div className="min-h-screen pt-40 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-widest mb-8">
         <Link to="/" className="hover:text-black">INÍCIO</Link>
         <ChevronRight size={12} />
         <Link to="/#collections" className="hover:text-black">PRODUTOS</Link>
         <ChevronRight size={12} />
         <span className="text-[#eab308]">{product.name}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Gallery */}
        <div className="lg:col-span-7 flex flex-col gap-4">
           <div className="flex flex-col-reverse md:flex-row gap-4">
               {/* Thumbnails */}
               <div className="flex md:flex-col gap-4 overflow-x-auto md:w-20 snap-x">
                  {product.images.map((img, i) => (
                     <button 
                       key={i}
                       onClick={() => setActiveImage(i)}
                       className={cn(
                          "w-20 md:w-full aspect-[3/4] flex-shrink-0 border-2 overflow-hidden rounded-none transition-colors snap-center",
                          activeImage === i ? "border-[#eab308]" : "border-transparent hover:border-black/30"
                       )}
                     >
                        <img src={img} alt={`${product.name} - Detalhe ${i + 1}`} className="w-full h-full object-cover" />
                     </button>
                  ))}
               </div>
               
               {/* Main Image */}
               <div className="flex-1 aspect-[3/4] bg-black/5 rounded-none overflow-hidden relative">
                  <img src={product.images[activeImage] || 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80'} alt={product.name} className="w-full h-full object-cover transition-opacity duration-300" />
               </div>
           </div>

           {/* Mais Opções Deste Modelo - DESKTOP VIEW ONLY */}
           {!isPrime && (
             <div className="hidden lg:block mt-12 border-t border-black/10 pt-8">
               <h3 className="text-xs uppercase font-bold text-black tracking-widest mb-4">MAIS OPÇÕES DESTE MODELO</h3>
               <div className="grid grid-cols-4 gap-3">
                 {Array.from({ length: 4 }).map((_, i) => (
                   <button 
                     key={i}
                     onClick={() => {/* future action to switch design */}}
                     className="aspect-[3/4] bg-black/5 border border-black/10 flex items-center justify-center hover:border-[#eab308] transition-all group relative"
                   >
                     <span className="text-[10px] font-bold uppercase tracking-widest opacity-20 group-hover:opacity-100 transition-opacity">Design {i + 1}</span>
                   </button>
                 ))}
               </div>
               <p className="text-[9px] text-gray-400 mt-2 uppercase tracking-widest italic">
                 * Clique para visualizar outros designs deste modelo.
               </p>
             </div>
           )}
        </div>

        {/* Details (Colcci Style + Dudalina Promo) */}
        <div className="lg:col-span-5 flex flex-col">
           {/* Promo Banner */}
           {isEligible && timeLeft > 0 && (
             <div className="bg-red-500/10 border border-red-500/20 p-3 mb-6 flex justify-between items-center rounded-none animate-pulse">
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Oferta termina em:</span>
                <span className="font-mono text-red-500 font-bold">{formatTime(timeLeft)}</span>
             </div>
           )}

           <h1 className="text-3xl md:text-4xl font-heading font-black tracking-tighter uppercase mb-2">
              {product.name}
           </h1>
           <div className="flex flex-col mb-6">
              <div className="flex items-center gap-3">
                {isEligible && timeLeft > 0 && (
                  <span className="text-xl text-gray-400 line-through">R$ {product.price.toFixed(2)}</span>
                )}
                <p className="text-3xl font-bold text-black font-heading">
                  R$ {currentPrice.toFixed(2)}
                </p>
              </div>
              <span className="text-sm font-normal text-gray-500">ou até 12x</span>
           </div>
           
           <p className="text-gray-600 mb-8 whitespace-pre-wrap">{product.description}</p>

           {/* Color Selection */}
           <div className="mb-6">
              <label className="text-[10px] uppercase text-black/40 font-bold block mb-3 tracking-widest">
                Escolha a Cor: <span className="text-[#eab308] ml-1">{selectedColor || 'Nenhuma'}</span>
              </label>
              <div className="flex gap-3">
                 {product.colors.map(color => (
                    <button
                       key={color.name}
                       onClick={() => setSelectedColor(color.name)}
                       className={cn(
                          "w-8 h-8 rounded-full border-2 transition-all",
                          selectedColor === color.name ? "border-[#eab308] ring-2 ring-black" : "border-black/20 hover:border-black/50"
                       )}
                       style={{ backgroundColor: color.hex }}
                       title={color.name}
                    />
                 ))}
              </div>
           </div>

           {/* Size Selection */}
           <div className="mb-8">
              <label className="text-[10px] uppercase text-black/40 font-bold flex justify-between items-center mb-3 tracking-widest">
                Selecione o Tamanho
                <a href="#" className="text-[#eab308] underline hover:text-black transition-colors">Guia de Medidas</a>
              </label>
              <div className="flex flex-wrap gap-2">
                 {product.sizes.map(size => (
                    <button
                       key={size}
                       onClick={() => setSelectedSize(size)}
                       className={cn(
                          "w-12 h-12 flex items-center justify-center border text-xs transition-colors rounded-none font-bold",
                          selectedSize === size 
                            ? "border-[#eab308] bg-[#eab308]/10 text-black" 
                            : "border-black/10 hover:border-[#eab308]"
                       )}
                    >
                       {size}
                    </button>
                 ))}
              </div>
           </div>

           {/* Add to Cart (FORCE/MARK ONLY - BELOW SIZES) */}
           {!isPrime && (
              <button 
                 onClick={handleAddToCart}
                 className="w-full bg-[#eab308] text-black font-black py-5 text-sm uppercase tracking-[0.2em] hover:bg-white transition-all transform active:scale-95 mb-8 rounded-none"
              >
                 Adicionar à Sacola
              </button>
           )}


           {/* Mais Opções Deste Modelo relocated for better visibility - MOBILE/TABLET VIEW ONLY */}
            {!isPrime && (
              <div className="mb-8 border-t border-black/10 pt-8 lg:hidden">
                <h3 className="text-xs uppercase font-bold text-black tracking-widest mb-4">MAIS OPÇÕES DESTE MODELO</h3>
 
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <button 
                      key={i}
                      onClick={() => {/* future action to switch design */}}
                      className="aspect-[3/4] bg-black/5 border border-black/10 flex items-center justify-center hover:border-[#eab308] transition-all group relative"
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-20 group-hover:opacity-100 transition-opacity">Design {i + 1}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-gray-400 mt-2 uppercase tracking-widest italic">
                  * Clique para visualizar outros designs deste modelo.
                </p>
              </div>
            )}


           {/* Custom Prints Selection (PRIME ONLY) */}
           {isPrime && (
              <div className="mb-8 border border-black/10 p-5 rounded-none bg-black/5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xs uppercase font-bold text-[#eab308] tracking-widest mb-2">CRIE SUA CAMISA</h3>
                    <div className="text-[10px] text-black/60 tracking-widest uppercase mb-4 leading-relaxed">
                      <p className="mb-2">Adicione estampas escolhendo um desenho do catálogo e definindo onde aplicá-lo, lembrando que cada local aceita apenas uma estampa e há um limite máximo de 3 estampas por camisa.</p>
                      <ol className="space-y-1 ml-4 list-decimal">
                        <li>Clique em "Adicionar Estampa".</li>
                        <li>Escolha o desenho desejado no catálogo.</li>
                        <li>Selecione o local onde deseja aplicar a estampa.</li>
                        <li>Repita o processo para cada nova estampa que quiser incluir.</li>
                        <li>Lembre-se: cada local pode receber apenas uma estampa.</li>
                      </ol>
                    </div>
                  </div>
                  <button 
                    onClick={addPrintConfig}
                    className="flex items-center gap-1 text-[10px] whitespace-nowrap font-bold uppercase tracking-widest text-black bg-[#eab308] px-3 py-2 hover:bg-white transition-colors"
                  >
                    <Plus size={14} /> Estampa
                  </button>
                </div>
                
                {printConfigs.length === 0 ? (
                  <div className="py-6 text-center border border-dashed border-black/20">
                    <p className="text-[10px] text-black/40 uppercase tracking-widest">Nenhuma estampa adicionada.</p>
                    <p className="text-[10px] text-black/30 uppercase tracking-widest mt-1">A camisa será enviada lisa.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {printConfigs.map((cfg, index) => {
                      // Filter out locations already selected by OTHER configs
                      const usedLocations = printConfigs.filter(c => c.id !== cfg.id).map(c => c.location);
                      const validLocations = availableLocations.filter(loc => !usedLocations.includes(loc));

                      return (
                      <div key={cfg.id} className="p-4 border border-black/10 bg-[#ffffff] relative grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button 
                           onClick={() => removePrintConfig(cfg.id)}
                           className="absolute top-2 right-2 text-black/30 hover:text-red-500 transition-colors"
                        >
                           <Trash2 size={14} />
                        </button>
                        
                        <div>
                          <label className="text-[9px] uppercase text-black/40 font-bold block mb-1 tracking-widest">Estampa (Catálogo)</label>
                          <select 
                            value={cfg.stamp}
                            onChange={(e) => updatePrintConfig(cfg.id, 'stamp', e.target.value)}
                            className="w-full bg-black/5 border border-black/20 p-2 text-xs text-black focus:outline-none focus:border-[#eab308] rounded-none appearance-none"
                            translate="no"
                          >
                            {availableStamps.map(s => <option key={s} value={s} className="bg-[#ffffff]">{s}</option>)}
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] uppercase text-black/40 font-bold block mb-1 tracking-widest">Local</label>
                          <select 
                            value={cfg.location}
                            onChange={(e) => updatePrintConfig(cfg.id, 'location', e.target.value)}
                            className="w-full bg-black/5 border border-black/20 p-2 text-xs text-black focus:outline-none focus:border-[#eab308] rounded-none appearance-none"
                          >
                            <option value={cfg.location} className="bg-[#ffffff]">{cfg.location}</option>
                            {validLocations.filter(v => v !== cfg.location).map(l => (
                              <option key={l} value={l} className="bg-[#ffffff]">{l}</option>
                            ))}
                          </select>
                        </div>
                        
                        <div className="md:col-span-2">
                           <label className="text-[9px] uppercase text-black/40 font-bold block mb-1 tracking-widest">Opção de Fundo</label>
                           <div className="flex gap-2">
                             <button
                                onClick={() => updatePrintConfig(cfg.id, 'background', 'Sem Fundo')}
                                className={cn("flex-1 text-[10px] py-2 border uppercase tracking-widest font-bold transition-colors", cfg.background === 'Sem Fundo' ? "bg-black/10 border-black text-black" : "border-black/10 text-black/40 hover:border-black/30")}
                             >
                                Sem Fundo
                             </button>
                             <button
                                onClick={() => updatePrintConfig(cfg.id, 'background', 'Com Fundo')}
                                className={cn("flex-1 text-[10px] py-2 border uppercase tracking-widest font-bold transition-colors", cfg.background === 'Com Fundo' ? "bg-black/10 border-black text-black" : "border-black/10 text-black/40 hover:border-black/30")}
                             >
                                Com Fundo
                             </button>
                           </div>
                        </div>

                      </div>
                    )})}
                  </div>
                )}
              </div>
           )}

           {/* Add to Cart (PRIME ONLY - ABOVE SHIPPING) */}
           {isPrime && (
              <button 
                 onClick={handleAddToCart}
                 className="w-full bg-[#eab308] text-black font-black py-5 text-sm uppercase tracking-[0.2em] hover:bg-white transition-all transform active:scale-95 mb-8 rounded-none"
              >
                 Adicionar à Sacola
              </button>
           )}

            {/* Shipping Calc */}
           <div className="mb-8 p-4 bg-black/5 border border-black/10 rounded-none">
              <h4 className="text-sm font-bold uppercase tracking-wider mb-3 flex items-center gap-2">
                 <Truck size={16} /> Calcular Frete
              </h4>
              <form onSubmit={handleShippingCalc} className="flex gap-2">
                 <input 
                   type="text" 
                   maxLength={9}
                   placeholder="00000-000" 
                   value={cep}
                   onChange={(e) => setCep(e.target.value)}
                   className="bg-[#ffffff] border border-black/20 rounded-none px-4 py-2 flex-1 text-sm focus:outline-none focus:border-[#eab308]"
                 />
                 <button 
                  type="submit" 
                  disabled={loadingShipping}
                  className="bg-black/10 text-black px-4 py-2 rounded-none hover:bg-black/20 text-sm font-bold uppercase flex items-center justify-center min-w-[100px]"
                 >
                    {loadingShipping ? <Loader2 size={16} className="animate-spin" /> : 'Calcular'}
                 </button>
              </form>
              {shippingResult && (
                 <p className="mt-3 text-xs text-[#eab308] font-bold uppercase tracking-widest leading-relaxed">
                   {shippingResult}
                   {shippingResult.includes('R$') && (
                     <>
                       <br />
                       <span className="text-black/40 font-normal">* GRÁTIS A PARTIR DE 2 PEÇAS</span>
                     </>
                   )}
                 </p>
              )}
           </div>

           {/* Specs */}
           <div className="border-t border-black/10 pt-6">
              <h4 className="text-sm font-bold uppercase tracking-wider mb-4">Detalhes Técnicos</h4>
              <ul className="space-y-2 text-sm text-gray-600 list-disc list-inside">
                 {product.specs.map((spec, i) => (
                    <li key={i}>{spec}</li>
                 ))}
              </ul>
           </div>
        </div>
      </div>

      {/* Bought Together / Carousel (Hidden for PRIME, Visible for Force/Mark) */}
      {!isPrime && (
        <div className="mt-32 border-t border-black/5 pt-16">
           <h2 className="text-2xl font-heading font-black tracking-tighter uppercase mb-8 flex items-center gap-3">
               <span className="w-8 h-px bg-[#eab308]"></span> Comprados Junto
           </h2>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {boughtTogether.map((p) => {
                 const isPEligible = ['force', 'mark', 'prime'].includes(p.slug);
                 const pPrice = (isPEligible && timeLeft > 0) ? p.price - promoDiscount : p.price;
                 return (
                  <Link to={`/product/${p.slug}`} key={p.id} className="group flex flex-col">
                     <div className="aspect-[3/4] bg-black/5 rounded-none overflow-hidden mb-3 relative">
                        <img src={p.images[0]} alt={p.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                     </div>
                     <h4 className="font-bold text-sm tracking-wide">{p.name}</h4>
                     <p className="text-[#eab308] font-bold text-sm">R$ {pPrice.toFixed(2)}</p>
                  </Link>
                 );
              })}
           </div>
        </div>
      )}
    </div>
  );
}
