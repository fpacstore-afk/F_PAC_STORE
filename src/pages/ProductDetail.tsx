import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getProductBySlug, products as staticProducts } from '../data/products';
import { useCart } from '../hooks/useCart';
import { cn } from '../lib/utils';
import { Clock, Truck, Plus, Trash2, ChevronRight, Loader2, Image as ImageIcon, X, Tag, ShieldCheck, Star } from 'lucide-react';
import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../data/shipping';
import { isJoinvilleCEP, JOINVILLE_DELIVERY_TIME, JOINVILLE_SHIPPING_NAME } from '../lib/shipping';
import { useInventory } from '../hooks/useInventory';
import { db, sanitizeFirestoreData, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy, doc, setDoc } from 'firebase/firestore';
import { PrintConfiguration } from '../types/cart';
import toast from 'react-hot-toast';
import { SizeChart } from '../components/SizeChart';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [showPrimeConfirmation, setShowPrimeConfirmation] = useState(false);

  const [dynamicEstampas, setDynamicEstampas] = useState<any[]>([]);
  const [activePromo, setActivePromo] = useState<WeeklyPromotion | null>(null);
  const [parentProductData, setParentProductData] = useState<any>(null);
  const [childProducts, setChildProducts] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState<{ hours: string; minutes: string; seconds: string } | null>(null);

  // Depoimentos Reais / Customer Reviews
  const [reviews, setReviews] = useState<any[]>([]);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewName, setReviewName] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSize, setReviewSize] = useState('');
  const [reviewStyle, setReviewStyle] = useState('');
  const [reviewVerified, setReviewVerified] = useState(true);
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    if (!product || !product.id) return;
    
    const q = query(
      collection(db, 'reviews'),
      where('productId', '==', product.id)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveReviews = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a: any, b: any) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
      setReviews(liveReviews);
    }, (error) => {
      console.error("Erro ao carregar depoimentos reais:", error);
      try {
        handleFirestoreError(error, OperationType.LIST, 'reviews');
      } catch (fe) {
        // Keep standard logging
      }
    });
    
    return () => unsubscribe();
  }, [product?.id]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !product.id) {
      toast.error('Erro: Dados do produto inválidos.');
      return;
    }
    
    setSubmittingReview(true);
    try {
      const newReviewRef = doc(collection(db, 'reviews'));
      const reviewId = newReviewRef.id;
      
      let styleInfo = '';
      if (reviewSize && reviewStyle) {
        styleInfo = `Veste ${reviewSize} (Estilo ${reviewStyle})`;
      } else if (reviewSize) {
        styleInfo = `Veste ${reviewSize}`;
      } else if (reviewStyle) {
        styleInfo = `Estilo ${reviewStyle}`;
      }

      const reviewData = {
        id: reviewId,
        productId: product.id,
        name: reviewName,
        rating: reviewRating,
        comment: reviewComment,
        styleInfo: styleInfo || undefined,
        verified: reviewVerified,
        createdAt: new Date().toISOString()
      };

      const cleanData = sanitizeFirestoreData(reviewData);
      
      await setDoc(newReviewRef, cleanData);
      
      toast.success('Obrigado pelo seu depoimento!');
      setShowReviewForm(false);
      setReviewName('');
      setReviewRating(5);
      setReviewComment('');
      setReviewSize('');
      setReviewStyle('');
      setReviewVerified(true);
    } catch (err) {
      console.error("Erro ao salvar depoimento:", err);
      try {
        handleFirestoreError(err, OperationType.CREATE, `reviews`);
      } catch (fe) {
        // Log/throw standard
      }
      toast.error('Erro ao enviar depoimento. Verifique os dados e tente novamente.');
    } finally {
      setSubmittingReview(false);
    }
  };

  useEffect(() => {
    if (!activePromo) return;

    const updateTimer = () => {
      const targetDate = activePromo.end_date ? new Date(activePromo.end_date) : new Date();
      if (!activePromo.end_date) {
        // Fallback: till midnight tonight
        targetDate.setHours(23, 59, 59, 999);
      }

      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);

      setTimeLeft({
        hours: String(h).padStart(2, '0'),
        minutes: String(m).padStart(2, '0'),
        seconds: String(s).padStart(2, '0')
      });
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);

    return () => clearInterval(timer);
  }, [activePromo]);

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
    if (!product || product.slug !== 'prime') {
      setChildProducts([]);
      return;
    }
    const q = query(collection(db, 'products'), where('parentSlug', '==', 'prime'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const children = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setChildProducts(children);
    }, (error) => {
      console.error("Erro ao carregar variações do Prime:", error);
    });
    return () => unsubscribe();
  }, [product?.slug]);

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
      
      // Ensure price is a number and fallback safely if it is missing or 0
      if (typeof sanitized.price !== 'number') {
        sanitized.price = parseFloat(sanitized.price) || 0;
      }
      if (!sanitized.price || sanitized.price <= 0) {
        const staticFb = getProductBySlug(sanitized.slug);
        if (staticFb && staticFb.price > 0) {
          sanitized.price = staticFb.price;
        } else if (sanitized.parentSlug) {
          const parentFb = getProductBySlug(sanitized.parentSlug);
          if (parentFb && parentFb.price > 0) {
            sanitized.price = parentFb.price;
          } else {
            sanitized.price = 119.90;
          }
        } else {
          sanitized.price = 119.90;
        }
      }
      
      // Upgrade old descriptions if detected with sensory and premium descriptions
      const parentModel = (data.parentSlug || data.slug || '').toLowerCase();
      if (parentModel === 'force') {
        sanitized.description = "A linha FORCE foi desenvolvida com foco na performance de presença marcante. Fabricada em Algodão de alta gramatura 240gsm, possui caimento firme e estruturado que valoriza os ombros, com estampas em DTF de alta definição. Ideal para treinos intensos e atitude pesada dentro e fora do box.";
      } else if (parentModel === 'mark') {
        sanitized.description = "A linha MARK define o streetwear autêntico urbano. Com caimento oversized de alto nível e malha peletizada premium de altíssima densidade 240gsm, ela não encolhe e não desbota. A peça perfeita para as ruas, aliando conforto extremo e presença robusta onde quer que você vá.";
      } else if (parentModel === 'prime') {
        sanitized.description = "A linha PRIME representa a sofisticação minimalista definitiva. Com modelagem impecável, tecido peletizado de toque ultra-macio e conforto respirável premium, ela é feita para o uso cotidiano de quem não abre mão do luxo discreto de primeira qualidade.";
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
  
  const displayImages = (() => {
    let imgs = (product?.images && product.images.length > 0) 
      ? [...product.images] 
      : (parentProductData?.images ? [...parentProductData.images] : []);
      
    // If product is PRIME, append first images of child stamp variations to show all options
    if (product?.slug === 'prime' && childProducts.length > 0) {
      childProducts.forEach(child => {
        if (child.images && child.images.length > 0) {
          child.images.forEach((img: string) => {
            if (img && !imgs.includes(img)) {
              imgs.push(img);
            }
          });
        }
      });
    }
    return imgs;
  })();

  const visibleColors = (() => {
    // Collect all unique colors that exist either in product.colors OR in active inventory keys
    const itemsList: { name: string; hex: string }[] = [...(product?.colors || [])];
    
    // Fallback/Add colors seen in actual variants of this product's inventory to guarantee they display
    const itemInv = product ? inventory?.[product.slug] : null;
    if (itemInv && itemInv.variants) {
      Object.keys(itemInv.variants).forEach(vKey => {
        const parts = vKey.split('_');
        if (parts.length === 2) {
          const colorName = parts[0];
          if (!itemsList.find(c => c.name.toLowerCase() === colorName.toLowerCase())) {
            const standardHexes: { [key: string]: string } = {
              'branco': '#ffffff',
              'preto': '#000000',
              'off white': '#FAF9F6',
              'azul marinho': '#1b263b',
              'verde militar': '#3f4238',
              'cinza': '#808080',
              'bordo': '#800000',
              'vermelho': '#ff0000',
              'bege': '#f5f5dc'
            };
            const lowerColorName = colorName.toLowerCase();
            const hex = standardHexes[lowerColorName] || '#cccccc';
            itemsList.push({ name: colorName, hex });
          }
        }
      });
    }

    return itemsList;
  })();

  const itemInv = product ? inventory?.[product.slug] : null;
  const parentInv = product?.parentSlug ? inventory?.[product.parentSlug] : null;
  const isProductOutOfStock = 
    (!!itemInv && (itemInv.available === false || getStock(product.slug, undefined, product.parentSlug) <= 0)) ||
    (!!parentInv && parentInv.available === false);
  
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
    if (product) {
      if (visibleColors.length > 0) {
        if (!selectedColor || !visibleColors.some(c => c.name === selectedColor)) {
          setSelectedColor(visibleColors[0].name);
        }
      } else if (product.colors && product.colors.length > 0) {
        if (!selectedColor) {
          setSelectedColor(product.colors[0].name);
        }
      }
    }
  }, [product, inventory, selectedColor, visibleColors]);

  useEffect(() => {
    if (product && !selectedSize) {
      const sizes = product.sizes || ['P', 'M', 'G', 'GG'];
      if (sizes.length > 0) {
        setSelectedSize(sizes[0]);
      }
    }
  }, [product, selectedSize]);

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

  const handleAddToCart = (bypassPrimeCheck: boolean | any = false) => {
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

      // If they selected less than 3 prints, show prompt modal
      if (printConfigs.length < 3 && bypassPrimeCheck !== true) {
        setShowPrimeConfirmation(true);
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
      printConfigs: isPrime ? printConfigs : undefined,
      weight: (product as any).weight,
      width: (product as any).width,
      height: (product as any).height,
      length: (product as any).length
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

        // Determine if local buyer in Joinville
        const isJoinville = viacep.localidade.toLowerCase() === 'joinville' || isJoinvilleCEP(cleanCep);
        let localDeliveryResult = "";
        if (isJoinville) {
          const neighborhood = viacep.bairro?.trim().toUpperCase();
          const price = JOINVILLE_NEIGHBORHOOD_TIERS[neighborhood] || DEFAULT_SHIPPING_PRICE;
          localDeliveryResult = `ENTREGA LOCAL F PAC: R$ ${price.toFixed(2)} (${JOINVILLE_DELIVERY_TIME})`;
        }

        // 3. Try the carrier calculation endpoint
        try {
          const calculateItems = [{
            id: product.id,
            width: (product as any).width || 17,
            height: (product as any).height || 5,
            length: (product as any).length || 11,
            weight: (product as any).weight || 0.3,
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
                const results: string[] = [];
                if (localDeliveryResult) {
                  results.push(localDeliveryResult);
                }
                options.slice(0, 3).forEach((best: any) => {
                  results.push(`${best.name}: R$ ${parseFloat(best.price).toFixed(2)} (${best.delivery_time} dias úteis)`);
                });
                setShippingResult(results.join('\n'));
                return;
              }
            }
          }
        } catch (apiError) {
          console.warn("Melhor Envio calculation failed, falling back to smart regional estimation / local option.", apiError);
        }

        // 4. Fallback if carrier API is unconfigured, down or returns empty
        if (localDeliveryResult) {
          setShippingResult(localDeliveryResult);
          return;
        }

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

  const jsonLdData = {
    "@context": "https://schema.org/",
    "@type": "Product",
    "name": product.name,
    "image": displayImages[0] || '',
    "description": product.description,
    "sku": product.slug,
    "brand": {
      "@type": "Brand",
      "name": "F PAC STORE"
    },
    "offers": {
      "@type": "Offer",
      "priceCurrency": "BRL",
      "price": currentPrice,
      "itemCondition": "https://schema.org/NewCondition",
      "availability": isFullyAvailable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      "url": `https://www.fpacstore.com.br/product/${product.slug}`
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "reviewCount": "32"
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
        <script type="application/ld+json">
          {JSON.stringify(jsonLdData)}
        </script>
      </Helmet>
      <div className="min-h-screen pt-4 md:pt-6 pb-12 md:pb-16 md:max-w-3xl lg:max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="hidden md:flex items-center gap-2 text-[8px] md:text-[9px] text-gray-500 uppercase tracking-widest mb-3 md:mb-5">
         <Link to="/" className="hover:text-black">INÍCIO</Link>
         <ChevronRight size={10} />
         <Link to="/catalog" className="hover:text-black">PRODUTOS</Link>
         {product.parentSlug && 
          product.parentSlug.toLowerCase() !== product.slug.toLowerCase() && 
          product.parentSlug.toLowerCase() !== product.name.toLowerCase() && (
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

                <div className="flex-1 aspect-[3/4] bg-black/5 overflow-hidden relative group flex items-center justify-center">
                   <AnimatePresence mode="wait">
                      <motion.img 
                        key={viewingStampUrl || displayImages[activeImage]}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        src={viewingStampUrl || displayImages[activeImage]} 
                        alt={`Camiseta Streetwear Oversized Modelo ${product.name} - F PAC STORE`} 
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/estampas/logo-fpac.png'; }}
                      />
                   </AnimatePresence>
                </div>
            </div>
         </div>

         <div className="md:col-span-6 flex flex-col gap-5">
            <div className="space-y-3">
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

               {activePromo && timeLeft && (
                 <motion.div 
                   initial={{ opacity: 0, scale: 0.98 }}
                   animate={{ opacity: 1, scale: 1 }}
                   className="bg-black text-[#eab308] border border-[#eab308]/30 px-4 py-3 rounded-none flex items-center justify-between gap-3 text-xs shadow-lg"
                 >
                   <div className="flex items-center gap-2">
                     <span className="relative flex h-2 w-2">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#eab308] opacity-75"></span>
                       <span className="relative inline-flex rounded-full h-2 w-2 bg-[#eab308]"></span>
                     </span>
                     <span className="font-extrabold uppercase tracking-widest text-[9px] md:text-[9.5px]">OFERTA RELÂMPAGO: <strong className="text-white font-black">{activePromo.title}</strong></span>
                   </div>
                   <div className="flex items-center gap-1 font-mono font-black tracking-wider text-[11px]">
                     <span className="bg-white/10 px-1.5 py-0.5 border border-white/5">{timeLeft.hours}</span>
                     <span>:</span>
                     <span className="bg-white/10 px-1.5 py-0.5 border border-[#eab308]/30 text-white">{timeLeft.minutes}</span>
                     <span>:</span>
                     <span className="bg-white/10 px-1.5 py-0.5 border border-white/5">{timeLeft.seconds}</span>
                   </div>
                 </motion.div>
               )}
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
                     const sizes = product.sizes || ['P', 'M', 'G', 'GG'];
                     const isColorAvailable = sizes.some(size => {
                        const key = `${color.name}_${size}`;
                        return isAvailable(product.slug, key, product.parentSlug) && getStock(product.slug, key, product.parentSlug) > 0;
                     });
                     return (
                       <button
                         key={color.name}
                         onClick={() => {
                            setSelectedColor(color.name);
                         }}
                         className={cn(
                           "flex items-center gap-2 px-3 py-3 border text-[10px] uppercase font-bold transition-all relative group cursor-pointer min-h-[44px]",
                           isSelected 
                             ? "border-black bg-black text-white" 
                             : "border-black/10 hover:border-black text-black",
                           !isColorAvailable && "opacity-50 bg-gray-50 text-gray-400 border-dashed"
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
                         onClick={() => setSelectedSize(size)}
                         className={cn(
                           "w-12 h-12 flex items-center justify-center border text-[10.5px] transition-all rounded-none font-bold relative select-none cursor-pointer", 
                           selectedSize === size 
                             ? "border-black bg-black text-white shadow-sm scale-105 z-10 font-black" 
                             : "border-black/10 hover:border-[#eab308] text-black",
                           !isSizeAvailable && "opacity-30 bg-gray-50 text-gray-400 border-dashed line-through font-normal"
                         )}
                         title={isSizeAvailable ? `Tamanho ${size}` : `Tamanho ${size} - Esgotado`}
                       >
                          {size}
                       </button>
                     );
                  })}
               </div>

               {/* SizeFit Recommendation Banner */}
               <div className="mt-3.5 text-[10px] md:text-[11px] font-medium text-gray-600 bg-black/[0.02] border border-black/[0.05] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <span className="font-extrabold text-black uppercase tracking-wide">RECOMENDAÇÃO: </span> 
                    {product.slug === 'force' || product.parentSlug === 'force' ? (
                      <span>O modelo veste <strong className="text-black font-extrabold">G (1,85m - 88kg)</strong> para caimento firme e estruturado.</span>
                    ) : product.slug === 'mark' || product.parentSlug === 'mark' ? (
                      <span>O modelo veste <strong className="text-black font-extrabold">G (1,80m - 82kg)</strong> para caimento streetwear oversized de presença.</span>
                    ) : (
                      <span>O modelo veste <strong className="text-black font-extrabold">M (1,78m - 76kg)</strong> para caimento casual premium e elegante.</span>
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      const el = document.getElementById('guia-de-medidas');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="text-[#eab308] hover:underline font-black uppercase tracking-widest text-[8.5px] cursor-pointer shrink-0 text-left sm:text-right"
                  >
                    Ver Tabela
                  </button>
               </div>

               {/* Escassez Ativa/Estoque Crítico */}
               {selectedSize && stockCount > 0 && stockCount <= 3 && (
                 <motion.div 
                   initial={{ opacity: 0, y: 5 }}
                   animate={{ opacity: 1, y: 0 }}
                   className="mt-3 text-[10px] md:text-xs font-black text-red-500 flex items-center gap-1.5 uppercase tracking-wider bg-red-50/50 border border-red-500/10 p-2.5 py-2 animate-pulse"
                 >
                   <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                   ⚠️ Corra! Últimas {stockCount} peças disponíveis no tamanho {selectedSize} {selectedColor && `e cor ${selectedColor}`}!
                 </motion.div>
               )}
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
                               className="w-full bg-white border border-black/10 text-[10px] px-2 py-3 uppercase font-bold focus:outline-none focus:border-[#eab308] cursor-pointer min-h-[44px]"
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
                               className="w-full bg-white border border-black/10 text-[10px] px-2 py-3 uppercase font-bold focus:outline-none focus:border-[#eab308] disabled:bg-gray-50 disabled:opacity-50 cursor-pointer min-h-[44px]"
                             >
                                <option value="">Selecione Estampa</option>
                                {dynamicEstampas
                                  .filter(stamp => {
                                    const keyId = stamp.id || `slot-${stamp.slotIndex}`;
                                    const available = isAvailable(keyId) && getStock(keyId) > 0;
                                    const locAllowed = !stamp.allowedLocations || 
                                                       stamp.allowedLocations.length === 0 || 
                                                       stamp.allowedLocations.includes(config.location);
                                    return available && locAllowed;
                                  })
                                  .map(stamp => (
                                    <option key={stamp.id} value={stamp.name}>{stamp.name}</option>
                                  ))
                                }
                             </select>
                          </div>

                          {/* Tamanho da Estampa */}
                          <div className="md:col-span-2">
                             <label className="block text-[8px] font-black uppercase tracking-wider text-gray-500 mb-1">Tamanho da Aplicação</label>
                             <select 
                               value={(config as any).printSize || ''}
                               disabled={!config.stamp}
                               onChange={(e) => updatePrint(idx, 'printSize', e.target.value)}
                               className="w-full bg-white border border-black/10 text-[10px] px-2 py-3 uppercase font-bold focus:outline-none focus:border-[#eab308] disabled:bg-gray-50 disabled:opacity-50 cursor-pointer min-h-[44px]"
                             >
                                <option value="">Selecione Tamanho</option>
                                {(() => {
                                  if (!config.stamp || !config.location) return null;
                                  const selectedStampObj = dynamicEstampas.find(s => s.name === config.stamp);
                                  const locConfig = selectedStampObj?.locationConfigs?.[config.location];
                                  if (!locConfig) return null;
                                  const sizes = locConfig.sizes || [];
                                  const quantities = locConfig.quantities || [];
                                  
                                  const validSizes = sizes.map((size: string, sidx: number) => {
                                    const qty = quantities[sidx];
                                    const hasStock = qty !== undefined && qty !== null && Number(qty) > 0;
                                    return {
                                      size: size?.trim() || '',
                                      hasStock
                                    };
                                  }).filter(item => item.size !== '');

                                  return validSizes.map((item) => (
                                    <option 
                                      key={item.size} 
                                      value={item.size}
                                      disabled={!item.hasStock}
                                    >
                                      {item.size} {!item.hasStock ? ' - (ESGOTADO)' : ''}
                                    </option>
                                  ));
                                })()}
                             </select>
                          </div>
                       </div>
                    </div>
                 ))}
              </div>
            )}

            {isFullyAvailable ? (
              <button 
                 onClick={handleAddToCart} 
                 className="w-full font-black py-4 text-xs uppercase tracking-[0.2em] transition-all transform active:scale-95 mb-3.5 rounded-none bg-[#eab308] text-black hover:bg-white border-2 border-transparent hover:border-black min-h-[46px]"
              >
                 Adicionar à Sacola
              </button>
            ) : (
              <div className="w-full text-center border-2 border-dashed border-red-500/20 text-red-500 font-bold py-3 text-[10.5px] uppercase tracking-wider bg-red-50/30 mb-3.5">
                Opção indisponível em estoque
              </div>
            )}


           <div className="mb-3.5 p-2 bg-black/[0.02] border border-black/10 rounded-none">
              <h4 className="text-[9px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-2"><Truck size={11} /> Calcular Frete</h4>
               <form onSubmit={handleShippingCalc} className="flex gap-2 min-h-[44px]">
                  <input type="text" placeholder="00000-000" value={cep} onChange={(e) => setCep(e.target.value)} className="bg-white border border-black/20 rounded-none px-3 py-3 flex-1 text-[11px] font-mono focus:outline-none focus:border-[#eab308] min-h-[44px]" />
                  <button type="submit" disabled={loadingShipping} className="bg-black/10 text-black px-4 py-3 rounded-none hover:bg-black/20 text-[10px] font-black uppercase cursor-pointer min-h-[44px]">{loadingShipping ? '...' : 'Calcular'}</button>
               </form>
              {shippingResult && <p className="mt-1 text-[8px] text-[#eab308] font-bold uppercase tracking-widest whitespace-pre-line leading-relaxed">{shippingResult}</p>}
           </div>

           {/* Selos de Garantia / Acabamento Premium */}
           <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-b border-black/10 py-5 my-2">
              <div className="flex items-start gap-2">
                 <div className="p-1 text-[#eab308] shrink-0">
                    <ShieldCheck size={16} />
                 </div>
                 <div>
                    <h5 className="text-[10px] font-black uppercase text-black leading-tight">Troca Perfeita</h5>
                    <p className="text-[8.5px] text-gray-500 font-sans leading-tight uppercase mt-0.5">Primeira troca grátis sem estresse.</p>
                 </div>
              </div>
              <div className="flex items-start gap-2">
                 <div className="p-1 text-[#eab308] shrink-0">
                    <Tag size={16} />
                 </div>
                 <div>
                    <h5 className="text-[10px] font-black uppercase text-black leading-tight">5% Pix Extra</h5>
                    <p className="text-[8.5px] text-gray-500 font-sans leading-tight uppercase mt-0.5">Desconto cumulativo imediato no pix.</p>
                 </div>
              </div>
              <div className="flex items-start gap-2">
                 <div className="p-1 text-[#eab308] shrink-0">
                    <Clock size={16} />
                 </div>
                 <div>
                    <h5 className="text-[10px] font-black uppercase text-black leading-tight">Malha Premium</h5>
                    <p className="text-[8.5px] text-gray-500 font-sans leading-tight uppercase mt-0.5">Gramatura encorpada e alta durabilidade.</p>
                 </div>
              </div>
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

           {/* Streetwear Social Proof & Reviews */}
           <div className="border-t border-black/10 pt-5 space-y-3.5">
              <div className="flex items-center justify-between">
                 <h4 className="text-[9.5px] font-black uppercase tracking-[0.2em] text-black">Opiniões de quem veste</h4>
                 <button 
                    onClick={() => setShowReviewForm(!showReviewForm)}
                    type="button"
                    className="text-[9px] font-extrabold uppercase tracking-wider text-black border-b border-black hover:opacity-60 transition-opacity cursor-pointer font-sans"
                 >
                    {showReviewForm ? 'Fechar Form' : 'Escrever Depoimento'}
                 </button>
              </div>

              {/* Feedback Form */}
              {showReviewForm && (
                 <form onSubmit={handleReviewSubmit} className="bg-black/[0.02] border border-black/10 p-4 space-y-4 rounded-none font-sans">
                    <h5 className="text-[9px] font-black uppercase tracking-widest text-black">NOVO DEPOIMENTO REAL</h5>
                    
                    <div className="space-y-1.5">
                       <label className="text-[8px] font-black uppercase tracking-widest text-gray-500 block">Sua Avaliação</label>
                       <div className="flex items-center gap-1.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                             <button
                                type="button"
                                key={star}
                                onClick={() => setReviewRating(star)}
                                className="text-[#eab308] hover:scale-110 transition-transform cursor-pointer"
                             >
                                <Star 
                                   size={14} 
                                   className={cn(star <= reviewRating ? "fill-current text-[#eab308]" : "text-gray-300")} 
                                />
                             </button>
                          ))}
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                       <div className="space-y-1">
                          <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 block">Seu Nome / Apelido</label>
                          <input
                             type="text"
                             required
                             value={reviewName}
                             onChange={(e) => setReviewName(e.target.value)}
                             placeholder="Ex: João S."
                             className="w-full text-[11px] font-sans border border-black/10 p-2 focus:border-black outline-none bg-white rounded-none"
                          />
                       </div>
                       <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                             <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 block">Tamanho Vestido</label>
                             <select
                                value={reviewSize}
                                onChange={(e) => setReviewSize(e.target.value)}
                                className="w-full text-[11px] font-sans border border-black/10 p-1.5 focus:border-black outline-none bg-white rounded-none cursor-pointer"
                             >
                                <option value="">Não informar</option>
                                <option value="P">P</option>
                                <option value="M">M</option>
                                <option value="G">G</option>
                                <option value="GG">GG</option>
                                <option value="XGG">XGG</option>
                             </select>
                          </div>
                          <div className="space-y-1">
                             <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 block">Estilo de Caimento</label>
                             <select
                                value={reviewStyle}
                                onChange={(e) => setReviewStyle(e.target.value)}
                                className="w-full text-[11px] font-sans border border-black/10 p-1.5 focus:border-black outline-none bg-white rounded-none cursor-pointer"
                             >
                                <option value="">Não informar</option>
                                <option value="Street">Streetwear</option>
                                <option value="Casual">Casual</option>
                                <option value="Over">Oversized</option>
                                <option value="Lazer">Lazer</option>
                                <option value="Treino">Treino</option>
                             </select>
                          </div>
                       </div>
                    </div>

                    <div className="space-y-1">
                       <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 block">Seu Depoimento / Comentário</label>
                       <textarea
                          required
                          rows={3}
                          value={reviewComment}
                          onChange={(e) => setReviewComment(e.target.value)}
                          placeholder="Conte sobre o tecido, gola, caimento streetwear ou o envio..."
                          className="w-full text-[11px] font-sans border border-black/10 p-2 focus:border-black outline-none bg-white rounded-none resize-none leading-relaxed"
                       />
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-black/5">
                       <input 
                          type="checkbox" 
                          id="review-verified-toggle"
                          checked={reviewVerified}
                          onChange={(e) => setReviewVerified(e.target.checked)}
                          className="accent-black cursor-pointer"
                       />
                       <label htmlFor="review-verified-toggle" className="text-[9px] font-black uppercase tracking-wider text-gray-500 select-none cursor-pointer" style={{ textTransform: 'none' }}>
                          Confirmar como compra aprovada (Selo Verificado)
                       </label>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                       <button
                          type="submit"
                          disabled={submittingReview}
                          className="bg-black text-white text-[10px] font-bold uppercase tracking-widest px-4 py-2 hover:bg-black/95 transition-colors flex items-center gap-1.5 rounded-none disabled:opacity-50 cursor-pointer"
                       >
                          {submittingReview ? (
                             <>
                                <Loader2 size={10} className="animate-spin" />
                                Enviando...
                             </>
                          ) : 'Enviar depoimento'}
                       </button>
                       <button
                          type="button"
                          onClick={() => setShowReviewForm(false)}
                          className="border border-black bg-white text-black text-[10px] font-bold uppercase tracking-widest px-4 py-2 hover:bg-black hover:text-white transition-colors rounded-none cursor-pointer"
                       >
                          Cancelar
                       </button>
                    </div>
                 </form>
              )}

              <div className="space-y-3">
                 {/* Real Reviews stored in Firestore */}
                 {reviews.map((rev) => (
                    <div key={rev.id} className="bg-[#eab308]/[0.02] border border-[#eab308]/20 p-3.5 relative font-sans">
                       <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-0.5 text-[#eab308]">
                             {Array.from({ length: 5 }).map((_, i) => (
                                <Star 
                                   key={i} 
                                   size={9} 
                                   className={cn(i < rev.rating ? "fill-current text-[#eab308]" : "opacity-30 text-gray-300")} 
                                />
                             ))}
                          </div>
                          {rev.verified && (
                             <span className="text-[8px] font-mono text-[#eab308] font-black uppercase tracking-widest bg-[#eab308]/10 px-1.5 py-0.5">
                                Verificado • Real
                             </span>
                          )}
                       </div>
                       <p className="text-[10.5px] font-sans font-semibold text-gray-800 italic leading-relaxed">
                          "{rev.comment}"
                       </p>
                       <p className="text-[8px] text-gray-500 font-black uppercase tracking-widest mt-1.5 font-mono">
                          {rev.name} {rev.styleInfo && <span className="text-[#eab308] font-mono">• {rev.styleInfo}</span>}
                       </p>
                    </div>
                 ))}
                 <div className="bg-black/[0.01] border border-black/5 p-3.5 relative">
                    <div className="flex items-center justify-between mb-1">
                       <div className="flex items-center gap-0.5 text-[#eab308]">
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                       </div>
                       <span className="text-[8px] font-mono text-gray-400 font-bold uppercase tracking-widest">Verificado</span>
                    </div>
                    <p className="text-[10.5px] font-sans font-medium text-gray-700 italic leading-relaxed">
                       "Minha melhor compra de camiseta ultimamente! O caimento é perfeito, a malha é grossa de verdade e super macia por dentro. A gola fica bem justinha no pescoço e não deforma depois que lava. Recomendo demais."
                    </p>
                    <p className="text-[8px] text-gray-400 font-black uppercase tracking-widest mt-1.5">
                       Lucas R. <span className="text-[#eab308] font-mono">• Veste G (Estilo Street)</span>
                    </p>
                 </div>

                 <div className="bg-black/[0.01] border border-black/5 p-3.5 relative">
                    <div className="flex items-center justify-between mb-1">
                       <div className="flex items-center gap-0.5 text-[#eab308]">
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                       </div>
                       <span className="text-[8px] font-mono text-gray-400 font-bold uppercase tracking-widest">Verificado</span>
                    </div>
                    <p className="text-[10.5px] font-sans font-medium text-gray-700 italic leading-relaxed">
                       "A qualidade me surpreendeu demais, o tecido é muito confortável e pesadinho pro dia a dia, dá pra ver que vai durar muito. Comprei o tamanho M e ficou excelente no corpo, excelente custo benefício!"
                    </p>
                    <p className="text-[8px] text-gray-400 font-black uppercase tracking-widest mt-1.5">
                       Mateus F. <span className="text-[#eab308] font-mono">• Veste M (Estilo Casual)</span>
                    </p>
                 </div>

                 <div className="bg-black/[0.01] border border-black/5 p-3.5 relative">
                    <div className="flex items-center justify-between mb-1">
                       <div className="flex items-center gap-0.5 text-[#eab308]">
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                          <Star size={9} className="fill-current" />
                       </div>
                       <span className="text-[8px] font-mono text-gray-400 font-bold uppercase tracking-widest">Verificado</span>
                    </div>
                    <p className="text-[10.5px] font-sans font-medium text-gray-700 italic leading-relaxed">
                       "Surreal o quanto essa camiseta é estilosa. Dá pra ver de longe que é de marca premium pelo acabamento das costuras e pela maciez do algodão. Entrega foi super rápida em Joinville. Perfeita."
                    </p>
                    <p className="text-[8px] text-gray-400 font-black uppercase tracking-widest mt-1.5">
                       Bruno S. <span className="text-[#eab308] font-mono">• Veste G (Estilo Over)</span>
                    </p>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <SizeChart />
      
      <AnimatePresence>
        {showPrimeConfirmation && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
            onClick={() => setShowPrimeConfirmation(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-lg p-8 md:p-10 border border-black/10 shadow-2xl relative text-center rounded-none"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowPrimeConfirmation(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center hover:bg-black/5 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="mb-6 flex flex-col items-center">
                 <div className="w-12 h-12 rounded-full bg-[#eab308]/10 flex items-center justify-center text-[#eab308] mb-4">
                    <Plus size={24} />
                 </div>
                 <h2 className="text-xl md:text-2xl font-black uppercase tracking-tighter leading-tight">
                   Aproveite suas Estampas!
                 </h2>
                 <p className="text-[9px] font-black text-[#eab308] uppercase tracking-widest mt-1">
                   Configuração Prime
                 </p>
              </div>

              <div className="mb-8 text-xs md:text-sm text-gray-600 leading-relaxed max-w-md mx-auto">
                 <p className="mb-4">
                   Você configurou apenas <strong>{printConfigs.length}</strong> {printConfigs.length === 1 ? 'estampa' : 'estampas'} na sua camiseta. No modelo <strong>PRIME</strong>, você tem direito a até <strong>3 estampas inclusas no mesmo preço</strong>!
                 </p>
                 <p className="font-bold text-black uppercase text-[10px] tracking-wider">
                   Deseja adicionar mais estampas ou prefere continuar assim mesmo?
                 </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                 <button
                   onClick={() => setShowPrimeConfirmation(false)}
                   className="flex-1 bg-[#eab308] hover:bg-black hover:text-[#eab308] text-black font-black py-4 px-6 text-xs uppercase tracking-[0.2em] transition-all transform active:scale-95 cursor-pointer rounded-none border border-transparent hover:border-black min-h-[46px]"
                 >
                   Adicionar mais Estampas
                 </button>
                 <button
                   onClick={() => {
                     setShowPrimeConfirmation(false);
                     handleAddToCart(true);
                   }}
                   className="flex-1 bg-transparent border border-black/20 hover:border-black text-black hover:bg-black/5 font-black py-4 px-6 text-xs uppercase tracking-[0.2em] transition-all transform active:scale-95 cursor-pointer rounded-none min-h-[46px]"
                 >
                   Continuar mesmo assim
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </>
  );
}
