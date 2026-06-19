import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getProductBySlug, products as staticProducts } from '../data/products';
import { useCart } from '../hooks/useCart';
import { cn } from '../lib/utils';
import { Clock, Truck, Plus, Trash2, ChevronRight, Loader2, Image as ImageIcon, X, Tag, ShieldCheck, Star, ArrowRight } from 'lucide-react';
import { JOINVILLE_NEIGHBORHOOD_TIERS, DEFAULT_SHIPPING_PRICE } from '../data/shipping';
import { isJoinvilleCEP, JOINVILLE_DELIVERY_TIME, JOINVILLE_SHIPPING_NAME } from '../lib/shipping';
import { useInventory } from '../hooks/useInventory';
import { db, sanitizeFirestoreData, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, getDocs, onSnapshot, orderBy, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
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

const DEFAULT_REVIEWS = [
  {
    id: 'default-1',
    rating: 5,
    verified: true,
    comment: 'Minha melhor compra de camiseta ultimamente! O caimento é perfeito, a malha é grossa de verdade e super macia por dentro. A gola fica bem justinha no pescoço e não deforma depois que lava. Recomendo demais.',
    name: 'Lucas R.',
    styleInfo: 'Veste G (Estilo Street)',
    isDefault: true
  },
  {
    id: 'default-2',
    rating: 5,
    verified: true,
    comment: 'A qualidade me surpreendeu demais, o tecido é muito confortável e pesadinho pro dia a dia, dá pra ver que vai durar muito. Comprei o tamanho M e ficou excelente no corpo, excelente custo benefício!',
    name: 'Mateus F.',
    styleInfo: 'Veste M (Estilo Casual)',
    isDefault: true
  },
  {
    id: 'default-3',
    rating: 5,
    verified: true,
    comment: 'Surreal o quanto essa camiseta é estilosa. Dá pra ver de longe que é de marca premium pelo acabamento das costuras e pela maciez do algodão. Entrega foi super rápida em Joinville. Perfeita.',
    name: 'Bruno S.',
    styleInfo: 'Veste G (Estilo Over)',
    isDefault: true
  }
];

export default function ProductDetail() {
  const { slug } = useParams();
  const initialProduct = getProductBySlug(slug || '');
  const [product, setProduct] = useState<Product | null>(initialProduct as any || null);
  const [loading, setLoading] = useState(!initialProduct);

  const { user } = useAuth();
  const isAdmin = user?.email === 'fpacstore@gmail.com' || user?.email === 'atendimento@fpacstore.com.br';
  const [myPostedReviews, setMyPostedReviews] = useState<string[]>([]);
  const [isAdminBypass, setIsAdminBypass] = useState(false);
  const [deletedDefaultIds, setDeletedDefaultIds] = useState<string[]>([]);
  const [reviewToDelete, setReviewToDelete] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('my_reviews') || '[]');
      setMyPostedReviews(stored);
      setIsAdminBypass(localStorage.getItem('admin_moderation_enabled') === 'true');
      
      const deletedStored = JSON.parse(localStorage.getItem('deleted_default_reviews') || '[]');
      setDeletedDefaultIds(deletedStored);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const toggleAdminBypass = () => {
    try {
      const newVal = !isAdminBypass;
      setIsAdminBypass(newVal);
      localStorage.setItem('admin_moderation_enabled', String(newVal));
      if (newVal) {
        toast.success('Modo Moderação Ativado. Você pode excluir qualquer depoimento da loja!');
      } else {
        toast.success('Modo Moderação Desativado.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isModerator = isAdmin || isAdminBypass;

  const handleDeleteReview = (reviewId: string) => {
    setReviewToDelete(reviewId);
  };

  const confirmDeleteReview = async () => {
    if (!reviewToDelete) return;
    const idToDelete = reviewToDelete;
    setReviewToDelete(null);
    
    // Deletar da lista de depoimentos default / estáticos
    if (idToDelete.startsWith('default-')) {
      try {
        const updated = [...deletedDefaultIds, idToDelete];
        setDeletedDefaultIds(updated);
        localStorage.setItem('deleted_default_reviews', JSON.stringify(updated));
        toast.success('Depoimento excluído com sucesso.');
      } catch (err) {
        console.error("Erro ao ocultar depoimento padrão:", err);
        toast.error('Erro ao excluir depoimento padrão.');
      }
      return;
    }

    try {
      await deleteDoc(doc(db, 'reviews', idToDelete));
      toast.success('Depoimento excluído com sucesso.');
    } catch (err) {
      console.error("Erro ao excluir depoimento:", err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `reviews`);
      } catch (fe) {
        toast.error('Erro ao excluir depoimento. Permissão de administrador é necessária.');
      }
    }
  };

  const canDeleteReview = (rev: any) => {
    if (isModerator) return true;
    if (rev.userId && user && rev.userId === user.uid) return true;
    if (myPostedReviews.includes(rev.id)) return true;
    return false;
  };
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
  
  // Interactive Size Fitting (Provador Virtual) States
  const [showSizerModal, setShowSizerModal] = useState(false);
  const [sizerHeight, setSizerHeight] = useState<number>(175);
  const [sizerWeight, setSizerWeight] = useState<number>(75);
  const [sizerStyle, setSizerStyle] = useState<'regular' | 'oversized'>('oversized');

  const [dynamicEstampas, setDynamicEstampas] = useState<any[]>([]);
  const [activePromo, setActivePromo] = useState<WeeklyPromotion | null>(null);
  const [parentProductData, setParentProductData] = useState<any>(null);
  const [childProducts, setChildProducts] = useState<any[]>([]);
  const [timeLeft, setTimeLeft] = useState<{ hours: string; minutes: string; seconds: string } | null>(null);

  // Depoimentos Reais / Customer Reviews
  const [reviews, setReviews] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);

  useEffect(() => {
    const q = collection(db, 'products');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dynamicData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const merged = staticProducts.map(staticP => {
        const dynamicP = dynamicData.find((p: any) => p.id === staticP.id || p.slug === staticP.slug);
        return dynamicP ? { ...staticP, ...dynamicP } : staticP;
      });
      dynamicData.forEach((dynamicP: any) => {
        if (!staticProducts.find(sp => sp.id === dynamicP.id || sp.slug === dynamicP.slug)) {
          merged.push(dynamicP);
        }
      });
      const filtered = merged.filter(p => {
        const name = (p.name || '').toUpperCase();
        const slugVal = (p.slug || '').toLowerCase();
        const isTest = slugVal.includes('test') || name.includes('test') || name.includes('PRODUTO TESTE');
        const isModel = slugVal === 'force' || slugVal === 'mark' || slugVal === 'prime';
        return !isTest && p.status !== 'hidden' && p.images && p.images.length > 0 && !isModel;
      });
      setAllProducts(filtered);
    });
    return () => unsubscribe();
  }, []);
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
        createdAt: new Date().toISOString(),
        userId: user?.uid || null
      };

      const cleanData = sanitizeFirestoreData(reviewData);
      
      await setDoc(newReviewRef, cleanData);

      // Save to localStorage so they can delete it
      try {
        const stored = JSON.parse(localStorage.getItem('my_reviews') || '[]');
        stored.push(reviewId);
        localStorage.setItem('my_reviews', JSON.stringify(stored));
        setMyPostedReviews(stored);
      } catch (errLocalStorage) {
        console.error("Local storage error:", errLocalStorage);
      }
      
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
    
    // Redirect base models (force, mark, prime) directly to their respective model page
    const slugLower = (slug || '').toLowerCase();
    if (slugLower === 'force' || slugLower === 'mark' || slugLower === 'prime') {
      navigate(`/model/${slugLower}`, { replace: true });
      return;
    }
    
    // Explicitly block any test or payment test products
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

  const getRecommendedSize = (height: number, weight: number, style: 'regular' | 'oversized') => {
    // Basic weight/height scoring model
    let recommended = 'M';
    
    if (weight < 64) {
      if (height < 170) recommended = 'P';
      else recommended = 'M';
    } else if (weight >= 64 && weight < 78) {
      if (height < 168) recommended = 'P';
      else if (height >= 168 && height < 184) recommended = 'M';
      else recommended = 'G';
    } else if (weight >= 78 && weight < 92) {
      if (height < 174) recommended = 'M';
      else if (height >= 174 && height < 189) recommended = 'G';
      else recommended = 'GG';
    } else {
      if (height < 178) recommended = 'G';
      else recommended = 'GG';
    }

    // Adjust recommendation based on customer preference (since brand designs are oversized)
    if (style === 'regular') {
      if (recommended === 'GG') return 'G';
      if (recommended === 'G') return 'M';
      if (recommended === 'M') return 'P';
    }
    
    return recommended;
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
                const sumPrices = options.reduce((sum: number, opt: any) => sum + parseFloat(opt.price), 0);
                const avgPrice = sumPrices / options.length;
                
                const sumTimes = options.reduce((sum: number, opt: any) => sum + (Number(opt.delivery_time) || 0), 0);
                const avgTime = Math.ceil(sumTimes / options.length) || 6;

                results.push(`Frete Estimado (Correios ou Transportadora): R$ ${avgPrice.toFixed(2)} (${avgTime} dias úteis)`);
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
        let regionName = "Correios";

        if (state === 'SC') {
          fallbackPrice = 16.90;
          prazoMin = 3;
          prazoMax = 6;
          regionName = "Correios SC";
        } else if (['PR', 'SP', 'RS'].includes(state)) {
          fallbackPrice = 22.90;
          prazoMin = 5;
          prazoMax = 9;
          regionName = "Correios Sul/SP";
        } else if (['RJ', 'MG', 'ES'].includes(state)) {
          fallbackPrice = 24.90;
          prazoMin = 6;
          prazoMax = 11;
          regionName = "Correios Sudeste";
        } else {
          fallbackPrice = 32.90;
          prazoMin = 8;
          prazoMax = 15;
          regionName = "Correios Nacional";
        }

        setShippingResult(`Frete Estimado (${regionName}): R$ ${fallbackPrice.toFixed(2)} (${prazoMin} a ${prazoMax} dias úteis)`);
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

  const getProductBadgeForRecommend = (p: any): { text: string; style: string } | null => {
    const nameLower = (p.name || '').toLowerCase();
    const isPrime = p.slug === 'prime' || p.parentSlug === 'prime' || p.is_prime;

    if (nameLower.includes('copa') || nameLower.includes('brazil') || nameLower.includes('brasil')) {
      return { 
        text: '⚽ COPA 2026', 
        style: 'bg-emerald-600 border-emerald-500 text-white animate-pulse' 
      };
    }
    if (p.isBestseller || p.slug === 'mark' || p.parentSlug === 'mark') {
      return { 
        text: '🔥 MAIS VENDIDO', 
        style: 'bg-[#eab308] border-yellow-400 text-black font-black' 
      };
    }
    if (isPrime) {
      return { 
        text: '💎 CUSTOM PRIME', 
        style: 'bg-zinc-950 border-amber-500/50 text-amber-500 shadow-md ring-1 ring-amber-400/20' 
      };
    }
    if (p.isNew || nameLower.includes('limited') || nameLower.includes('limitada')) {
      return { 
        text: '⚡ ED. LIMITADA', 
        style: 'bg-black border-neutral-700 text-white' 
      };
    }
    return null;
  };

  const getProductSpecsForRecommend = (p: any) => {
    const parent = String(p.parentSlug || '').toLowerCase();
    if (parent === 'force' || p.slug === 'force') {
      return { gsm: '240GSM', fit: 'Oversized', material: '90% Algodão' };
    }
    if (parent === 'mark' || p.slug === 'mark') {
      return { gsm: '240GSM', fit: 'Oversized', material: '90% Algodão Premium' };
    }
    return { gsm: '220GSM', fit: 'Oversized Confort', material: '100% Algodão Penteado' };
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
      
      <div className="min-h-screen bg-[#fafafa] pt-6 md:pt-10 pb-16 md:pb-24 font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Breadcrumbs navigation conforming exactly to the storefront styling */}
          <div className="hidden md:flex items-center gap-2 text-[9px] text-gray-400 uppercase tracking-[0.2em] mb-6 select-none">
             <Link to="/" className="hover:text-black transition-colors">INÍCIO</Link>
             <ChevronRight size={10} className="text-gray-300" />
             <Link to="/catalog" className="hover:text-black transition-colors">PRODUTOS</Link>
             {product.parentSlug && 
              product.parentSlug.toLowerCase() !== product.slug.toLowerCase() && 
              product.parentSlug.toLowerCase() !== product.name.toLowerCase() && (
               <>
                 <ChevronRight size={10} className="text-gray-300" />
                 <Link to={`/model/${product.parentSlug}`} className="hover:text-black transition-colors font-bold text-gray-500">{product.parentSlug}</Link>
               </>
             )}
             <ChevronRight size={10} className="text-gray-300" />
             <span className="text-[#eab308] font-black">{product.name}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            
            {/* LEFT COLUMN: Gallery layout for high emphasis on product images */}
            <div className="lg:col-span-6 flex flex-col gap-4">
               <div className="flex flex-col-reverse md:flex-row gap-4">
                   {!isForceOrMark && displayImages.length > 1 && (
                     <div className="flex md:flex-col gap-3 overflow-x-auto md:w-20 snap-x py-1 pr-1 border-r border-transparent">
                        {(displayImages || []).map((img, i) => (
                           <button 
                             id={`gallery-thumb-${i}`}
                             key={i} 
                             onClick={() => setActiveImage(i)} 
                             className={cn(
                               "w-16 md:w-20 aspect-[4/5] flex-shrink-0 border-2 overflow-hidden rounded-xl transition-all duration-300 snap-center shadow-xs", 
                               activeImage === i ? "border-[#eab308] scale-[1.03]" : "border-transparent hover:border-black/20 bg-white"
                             )}
                           >
                               {img ? (
                                 <img src={img} alt={`${product.name} thumb ${i}`} referrerPolicy="no-referrer" className="w-full h-full object-contain" />
                               ) : (
                                 <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                    <ImageIcon size={18} className="text-gray-300" />
                                 </div>
                               )}
                           </button>
                        ))}
                     </div>
                   )}

                   <div className="flex-1 aspect-[4/5] bg-white border border-neutral-100 shadow-[0_8px_30px_rgba(0,0,0,0.01)] rounded-[2.5rem] overflow-hidden relative group flex items-center justify-center">
                      <AnimatePresence mode="wait">
                         <motion.img 
                           key={viewingStampUrl || displayImages[activeImage]}
                           initial={{ opacity: 0, scale: 1.01 }}
                           animate={{ opacity: 1, scale: 1 }}
                           exit={{ opacity: 0 }}
                           transition={{ duration: 0.35 }}
                           src={viewingStampUrl || displayImages[activeImage]} 
                           alt={`Camiseta Streetwear Oversized Modelo ${product.name} - F PAC STORE`} 
                           className="w-full h-full object-contain p-2"
                           referrerPolicy="no-referrer"
                           onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/estampas/logo-fpac.png'; }}
                         />
                      </AnimatePresence>
                   </div>
               </div>
            </div>

            {/* RIGHT COLUMN: Interactive options & details aligned nicely with clean spaces */}
            <div className="lg:col-span-6 flex flex-col gap-6 text-left">
               
               {/* Badges, Title & Pricing block */}
               <div className="space-y-4">
                  <div>
                     <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-[#eab308]/20 text-[#eab308] rounded-xl text-[9px] font-black uppercase tracking-widest mb-3.5 select-none animate-pulse">
                       {product.isBestseller ? "🔥 MAIS VENDIDO" : product.isNew ? "⚡ NOVIDADE" : product.headline || "COLEÇÃO EXCLUSIVA"}
                     </span>
                     <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight italic text-zinc-950 leading-tight">
                       {product.name}
                     </h1>
                     
                     <div className="flex items-center gap-1.5 mt-2.5">
                       <div className="flex items-center gap-0.5 text-[#eab308]">
                         <Star size={12} className="fill-current text-[#eab308]" />
                         <Star size={12} className="fill-current text-[#eab308]" />
                         <Star size={12} className="fill-current text-[#eab308]" />
                         <Star size={12} className="fill-current text-[#eab308]" />
                         <Star size={12} className="fill-current text-[#eab308]" />
                       </div>
                       <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider font-mono select-none">(4.9/5 • 32 avaliações reais)</span>
                     </div>
                  </div>

                  {/* Curated pricing container */}
                  <div className="bg-white rounded-[1.5rem] border border-neutral-100 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.01)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <span className="text-[8px] text-neutral-400 font-extrabold uppercase tracking-widest block font-mono">CURADORIA F PAC</span>
                      <div className="flex items-baseline gap-1">
                         <span className="text-xs font-black text-[#eab308] uppercase">R$</span>
                         <span className="text-3xl font-black tracking-tighter italic text-zinc-950">
                           {product.price?.toFixed(2).split('.')[0]}
                           <span className="text-sm opacity-60 ml-0.5 font-bold">,{product.price?.toFixed(2).split('.')[1]}</span>
                         </span>
                      </div>
                    </div>
                    <div className="space-y-1.5 align-right text-left sm:text-right">
                       <span className="inline-block text-[9px] font-extrabold text-zinc-950 bg-[#eab308] px-3 py-1 rounded-lg uppercase tracking-wider shadow-xs">PIX COM 5% OFF EXTRA</span>
                       <p className="text-[10.5px] font-black text-gray-500 uppercase tracking-widest font-mono">SAI POR R$ {((product.price || 0) * 0.95).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} NO PIX</p>
                    </div>
                  </div>

                  {/* Active promos layout */}
                  {activePromo && timeLeft && (
                    <motion.div 
                      id="active-promo-banner"
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => navigate('/catalog?promo=active')}
                      className="bg-zinc-950 text-[#eab308] border border-amber-500/20 px-4.5 py-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-md cursor-pointer hover:border-[#eab308]/60 transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#eab308] opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#eab308]"></span>
                        </span>
                        <span className="font-black uppercase tracking-widest text-[9.5px]">OFERTA RELÂMPAGO ATIVA: <strong className="text-white font-black">{activePromo.title}</strong></span>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-black tracking-wider text-xs">
                        <span className="bg-white/10 px-1.5 py-0.5 border border-white/5 rounded text-white">{timeLeft.hours}</span>
                        <span>:</span>
                        <span className="bg-white/10 px-1.5 py-0.5 border border-[#eab308]/40 rounded text-[#eab308]">{timeLeft.minutes}</span>
                        <span>:</span>
                        <span className="bg-white/10 px-1.5 py-0.5 border border-white/5 rounded text-white">{timeLeft.seconds}</span>
                      </div>
                    </motion.div>
                  )}
               </div>

               {/* Description Row */}
               <div className="border-t border-b border-black/[0.05] py-5 space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-extrabold text-gray-400 font-mono">CONCEITO DA PEÇA</p>
                  <p className="text-xs text-zinc-600 leading-relaxed uppercase tracking-wide font-medium">{product.description}</p>
               </div>

               {/* Colors Select Row */}
               <div className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-[#eab308] font-mono">1. Escolha a Cor</h3>
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
                            id={`color-btn-${color.name.replace(/\s+/g, '-')}`}
                            key={color.name}
                            onClick={() => setSelectedColor(color.name)}
                            className={cn(
                              "flex items-center gap-2.5 px-4 py-3 border text-[10px] uppercase font-black transition-all relative rounded-xl hover:scale-[1.01] cursor-pointer min-h-[44px]",
                              isSelected 
                                ? "border-black bg-zinc-950 text-white shadow-md font-black" 
                                : "border-neutral-150 bg-white text-zinc-800 hover:border-black/30",
                              !isColorAvailable && "opacity-40 bg-zinc-50 text-zinc-400 border-dashed"
                            )}
                          >
                             <span 
                               className="w-3.5 h-3.5 rounded-full border border-black/15 shadow-xs" 
                               style={{ backgroundColor: color.hex }}
                             />
                             {color.name}
                          </button>
                        );
                     })}
                  </div>
               </div>

               {/* Sizes Select Row */}
               <div className="space-y-3">
                  <div className="flex justify-between items-center mb-1">
                     <h3 className="text-xs font-black uppercase tracking-widest text-[#eab308] font-mono">2. Tamanho da Camiseta</h3>
                     <button 
                       id="btn-provador-virtual"
                       type="button"
                       onClick={() => setShowSizerModal(true)}
                       className="text-[9px] bg-[#eab308] hover:bg-zinc-950 hover:text-white text-zinc-950 px-3.5 py-1.5 font-black uppercase tracking-widest flex items-center gap-1.5 cursor-pointer transition-all duration-300 rounded-xl shadow-xs"
                     >
                       📏 PROVADOR VIRTUAL F PAC
                     </button>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                     {(product.sizes || ['P', 'M', 'G', 'GG']).map((size) => {
                        const sizeKey = `${selectedColor}_${size}`;
                        const isSizeAvailable = isAvailable(product.slug, sizeKey, product.parentSlug) && getStock(product.slug, sizeKey, product.parentSlug) > 0;
                        return (
                          <button
                            id={`size-btn-${size}`}
                            key={size}
                            onClick={() => setSelectedSize(size)}
                            className={cn(
                              "w-12 h-12 flex items-center justify-center border text-[11px] transition-all rounded-xl font-black relative select-none cursor-pointer hover:scale-105", 
                              selectedSize === size 
                                ? "border-black bg-zinc-950 text-white shadow-md z-10 scale-105 font-black" 
                                : "border-neutral-150 bg-white text-zinc-800 hover:border-black/20",
                              !isSizeAvailable && "opacity-30 bg-neutral-50 text-neutral-400 border-dashed line-through font-normal"
                            )}
                            title={isSizeAvailable ? `Tamanho ${size}` : `Tamanho ${size} - Esgotado`}
                          >
                             {size}
                          </button>
                        );
                     })}
                  </div>

                  {/* Structured Wear Tips Banner */}
                  <div className="mt-3 text-[10px] text-gray-500 bg-zinc-900/[0.02] border border-black/5 p-3.5 rounded-xl flex items-center justify-between gap-4 font-sans uppercase">
                     <div>
                       <span className="font-extrabold text-black tracking-wide">RECOMENDAÇÃO DE AJUSTE: </span> 
                       {product.slug === 'force' || product.parentSlug === 'force' ? (
                         <span>Veste <strong className="text-black font-extrabold">G (1,85m - 88kg)</strong> para caimento firme e encorpado.</span>
                       ) : product.slug === 'mark' || product.parentSlug === 'mark' ? (
                         <span>Veste <strong className="text-black font-extrabold">G (1,80m - 82kg)</strong> para caimento streetwear oversized de alta presença.</span>
                       ) : (
                         <span>Veste <strong className="text-zinc-850 font-black">M (1,78m - 76kg)</strong> para caimento casual premium impecável.</span>
                       )}
                     </div>
                     <button 
                       id="btn-scroll-sizechart"
                       onClick={() => {
                         const el = document.getElementById('guia-de-medidas');
                         if (el) el.scrollIntoView({ behavior: 'smooth' });
                       }}
                       className="text-[#eab308] hover:underline font-black uppercase tracking-wider text-[8.5px] cursor-pointer shrink-0 text-right"
                     >
                       Ver Tabela
                     </button>
                  </div>

                  {/* Stock counter alerts */}
                  {selectedSize && stockCount > 0 && stockCount <= 3 && (
                    <motion.div 
                      id="crit-stock-alert"
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 text-[10px] font-black text-red-500 flex items-center gap-1.5 uppercase tracking-wider bg-red-50 border border-red-500/10 p-3 rounded-xl animate-pulse"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 animate-bounce" />
                      ⚠️ CORRA! ÚLTIMAS {stockCount} PEÇAS DISPONÍVEIS NO TAMANHO {selectedSize}!
                    </motion.div>
                  )}
               </div>

               {/* Prime customization integrations block */}
               {isPrime && (
                 <div className="space-y-4 border-t border-black/5 pt-5">
                    <div className="flex justify-between items-center">
                       <h3 className="text-xs font-black uppercase tracking-widest text-[#eab308] font-mono">Aplicações Prime Personalizáveis</h3>
                       {printConfigs.length < 3 && (
                          <button 
                            id="btn-add-prime-stamp"
                            onClick={addPrint} 
                            className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[#eab308] border-2 border-[#eab308]/50 bg-amber-500/5 hover:border-[#eab308] px-3.5 py-2 hover:bg-[#eab308] hover:text-black transition-all rounded-xl"
                          >
                             <Plus size={12} /> ADICIONAR ESTAMPA ({printConfigs.length}/3 INCLUSAS)
                          </button>
                       )}
                    </div>

                    {printConfigs.map((config, idx) => (
                       <div key={config.id} className="border border-neutral-150 p-4.5 space-y-3.5 relative bg-white rounded-2xl shadow-xs">
                          <button 
                            id={`btn-remove-stamp-${idx}`}
                            onClick={() => removePrint(idx)} 
                            className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors p-1"
                          >
                             <Trash2 size={15} />
                          </button>

                          <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-950 text-left">POSIÇÃO COM ESTAMPA #{idx + 1}</h4>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             {/* Location select input */}
                             <div>
                                <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1.5">Local da Camiseta</label>
                                <select 
                                  value={config.location}
                                  onChange={(e) => updatePrint(idx, 'location', e.target.value)}
                                  className="w-full bg-neutral-50/50 border border-neutral-150 rounded-xl text-[10.5px] px-3 py-3 uppercase font-black focus:outline-none focus:border-black cursor-pointer min-h-[44px]"
                                >
                                   <option value="">Selecione Posição</option>
                                   {PRIME_LOCATIONS.map(loc => (
                                      <option key={loc} value={loc}>{loc}</option>
                                   ))}
                                </select>
                             </div>

                             {/* Stamp image select input */}
                             <div>
                                <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1.5">Escolha a Estampa</label>
                                <select 
                                  value={config.stamp}
                                  disabled={!config.location}
                                  onChange={(e) => updatePrint(idx, 'stamp', e.target.value)}
                                  className="w-full bg-neutral-50/50 border border-neutral-150 rounded-xl text-[10.5px] px-3 py-3 uppercase font-black focus:outline-none focus:border-black disabled:bg-gray-50 disabled:opacity-50 cursor-pointer min-h-[44px]"
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

                             {/* Print Size option select input */}
                             <div className="md:col-span-2">
                                <label className="block text-[8px] font-black uppercase tracking-wider text-gray-400 mb-1.5">Tamanho da Aplicação nesta Posição</label>
                                <select 
                                  value={(config as any).printSize || ''}
                                  disabled={!config.stamp}
                                  onChange={(e) => updatePrint(idx, 'printSize', e.target.value)}
                                  className="w-full bg-neutral-50/50 border border-neutral-150 rounded-xl text-[10.5px] px-3 py-3 uppercase font-black focus:outline-none focus:border-black disabled:bg-gray-50 disabled:opacity-50 cursor-pointer min-h-[44px]"
                                >
                                   <option value="">Selecione Tamanho do Desenho</option>
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

               {/* Cart CTA Trigger */}
               {isFullyAvailable ? (
                 <button 
                    id="btn-add-to-bag"
                    onClick={handleAddToCart} 
                    className="w-full font-black py-4.5 text-xs text-white uppercase tracking-[0.2em] bg-zinc-950 hover:bg-[#eab308] hover:text-black border border-transparent shadow-[0_12px_32px_rgba(0,0,0,0.1)] transition-all duration-300 transform active:scale-[0.98] mb-1.5 rounded-2xl min-h-[44px] cursor-pointer"
                 >
                    Adicionar à Sacola de Compras
                 </button>
               ) : (
                 <div className="w-full text-center border-2 border-dashed border-red-500/20 text-red-500 font-extrabold py-4 text-[10.5px] uppercase tracking-wider bg-red-50/50 mb-1.5 rounded-2xl">
                   Esta Opção está Temporariamente Indisponível em Estoque
                 </div>
               )}

               {/* Shipping calculator block */}
               <div className="p-5.5 bg-white border border-neutral-100 rounded-3xl shadow-[0_5px_22px_rgba(0,0,0,0.01)] transition-all">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-[#eab308] font-mono mb-2.5 flex items-center gap-2"><Truck size={14} className="shrink-0" /> Calcular Envio / Frete</h4>
                   <form onSubmit={handleShippingCalc} className="flex gap-2 min-h-[44px]">
                      <input 
                        id="zipcode-input"
                        type="text" 
                        placeholder="Seu CEP (Ex: 89201-000)" 
                        value={cep} 
                        onChange={(e) => setCep(e.target.value)} 
                        className="bg-neutral-50 border border-neutral-150 rounded-xl px-4 py-3 flex-1 text-xs font-mono font-black placeholder-gray-400 focus:outline-none focus:border-black focus:bg-white min-h-[44px]" 
                      />
                      <button 
                        id="zipcode-calc-submit"
                        type="submit" 
                        disabled={loadingShipping} 
                        className="bg-zinc-950 text-white px-5 py-3 rounded-xl hover:bg-[#eab308] hover:text-black transition-all text-[10px] font-black uppercase cursor-pointer min-h-[44px] shadow-xs"
                      >
                        {loadingShipping ? '...' : 'Calcular'}
                      </button>
                   </form>
                  {shippingResult && (
                    <p className="mt-3.5 text-[8.5px] text-[#eab308] bg-zinc-950 border border-amber-500/20 px-3.5 py-3 rounded-xl font-black uppercase tracking-widest whitespace-pre-line leading-relaxed text-left border-dashed">
                      {shippingResult}
                    </p>
                  )}
               </div>

               {/* Trust signals & bento security items */}
               <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-b border-black/[0.05] py-6 my-2 select-none">
                  <div className="flex items-start gap-2.5 bg-white border border-neutral-100 p-3.5 rounded-2xl shadow-xs">
                     <span className="p-1 px-1.5 text-[#eab308] bg-[#eab308]/5 rounded-xl border border-amber-500/10 shrink-0">
                        <ShieldCheck size={18} />
                     </span>
                     <div>
                        <h5 className="text-[10.5px] font-black uppercase text-zinc-950 leading-tight">Escolha Segura</h5>
                        <p className="text-[9px] text-gray-500 font-bold leading-tight uppercase tracking-wider mt-1 font-mono">1ª Troca Grátis Fácil.</p>
                     </div>
                  </div>
                  <div className="flex items-start gap-2.5 bg-white border border-neutral-100 p-3.5 rounded-2xl shadow-xs">
                     <span className="p-1 px-1.5 text-[#eab308] bg-[#eab308]/5 rounded-xl border border-amber-500/10 shrink-0">
                        <Tag size={18} />
                     </span>
                     <div>
                        <h5 className="text-[10.5px] font-black uppercase text-zinc-950 leading-tight">5% Pix Extra</h5>
                        <p className="text-[9px] text-gray-500 font-bold leading-tight uppercase tracking-wider mt-1 font-mono">Acumulativo Imediato.</p>
                     </div>
                  </div>
                  <div className="flex items-start gap-2.5 bg-white border border-neutral-100 p-3.5 rounded-2xl shadow-xs">
                     <span className="p-1 px-1.5 text-[#eab308] bg-[#eab308]/5 rounded-xl border border-amber-500/10 shrink-0">
                        <Clock size={18} />
                     </span>
                     <div>
                        <h5 className="text-[10.5px] font-black uppercase text-zinc-950 leading-tight">Malha Original</h5>
                        <p className="text-[9px] text-gray-500 font-bold leading-tight uppercase tracking-wider mt-1 font-mono">Fio Penteado Encorpado.</p>
                     </div>
                  </div>
               </div>

               {/* Bento-style product specifications grid */}
               <div className="p-5.5 bg-white border border-neutral-100 rounded-3xl shadow-[0_4px_22px_rgba(0,0,0,0.01)] space-y-4">
                  <h4 className="text-[10.5px] font-black uppercase tracking-widest text-[#eab308] font-mono flex items-center gap-2">📐 Especificações de Qualidade F PAC</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-neutral-50/40 p-3.5 rounded-2xl border border-neutral-100 text-left">
                       <span className="text-[8px] font-black tracking-widest text-gray-400 uppercase font-mono block">MATERIAL PRINCIPAL</span>
                       <span className="text-[11px] font-extrabold text-zinc-950 uppercase mt-0.5 block">{product.slug === 'prime' ? "100% ALGODÃO PENTEADO PREMIUM" : "90% ALGODÃO SELECIONADO / 10% POLIÉSTER"}</span>
                    </div>
                    <div className="bg-neutral-50/40 p-3.5 rounded-2xl border border-neutral-100 text-left">
                       <span className="text-[8px] font-black tracking-widest text-gray-400 uppercase font-mono block">GRAMATURA REAL</span>
                       <span className="text-[11px] font-extrabold text-zinc-950 uppercase mt-0.5 block">{product.slug === 'prime' ? "COTTON COMFORT • 220G/M²" : "HEAVY WEIGHT MONSTER • 240G/M²"}</span>
                    </div>
                    <div className="bg-neutral-50/40 p-3.5 rounded-2xl border border-neutral-100 text-left">
                       <span className="text-[8px] font-black tracking-widest text-gray-400 uppercase font-mono block">ESTAMPA DA PEÇA</span>
                       <span className="text-[11px] font-extrabold text-zinc-950 uppercase mt-0.5 block">{product.slug === 'prime' ? "TOTALMENTE CUSTOMIZÁVEL DTF" : "IMPRESSÃO DTF DE EXTREMA ALTA RESOLUÇÃO"}</span>
                    </div>
                    <div className="bg-neutral-50/40 p-3.5 rounded-2xl border border-neutral-100 text-left">
                       <span className="text-[8px] font-black tracking-widest text-gray-400 uppercase font-mono block">GOLA COSTURADA</span>
                       <span className="text-[11px] font-extrabold text-zinc-950 uppercase mt-0.5 block">{product.slug === 'prime' ? "REFORÇO RIBANA STANDARD 2.5CM" : "GOLA EXTREMAMENTE GROSSA CANELADA 3.0CM"}</span>
                    </div>
                  </div>
               </div>

            </div>
          </div>

          {/* DYNAMIC RECOMMENDED PRODUCTS "VOCÊ TAMBÉM PODE GOSTAR" SECTION */}
          {allProducts.length > 0 && (
             <div className="mt-16 md:mt-24 border-t border-black/[0.05] pt-12 md:pt-16 text-left">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
                   <div>
                      <span className="text-[9px] text-[#eab308] font-black uppercase tracking-[0.35em] block mb-1">CONHEÇA NOSSA CURADORIA</span>
                      <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight italic text-zinc-950 select-none">
                         Você também pode gostar
                      </h2>
                   </div>
                   <Link 
                     id="btn-rec-see-all"
                     to="/catalog" 
                     className="text-[9.5px] font-black uppercase tracking-widest text-[#eab308] hover:text-black transition-colors flex items-center gap-1 bg-zinc-950 px-4 py-2.5 rounded-xl border border-neutral-100 cursor-pointer"
                   >
                     Ver Todos os Produtos
                     <ArrowRight size={11} />
                   </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                   {allProducts
                     .filter(p => p.slug !== product.slug) // Exclude current active product
                     .sort((a, b) => {
                       // Prioritize recommendations from same line/parentSlug
                       const matchA = a.parentSlug === product.parentSlug ? 1 : 0;
                       const matchB = b.parentSlug === product.parentSlug ? 1 : 0;
                       return matchB - matchA;
                     })
                     .slice(0, 3) // Fetch top 3 items
                     .map((recP, i) => {
                       const recBadge = getProductBadgeForRecommend(recP);
                       const recSpecs = getProductSpecsForRecommend(recP);
                       const isRecPrime = recP.slug === 'prime' || recP.parentSlug === 'prime' || recP.is_prime;
                       const isRecOOS = !isAvailable(recP.slug, undefined, recP.parentSlug) || getStock(recP.slug, undefined, recP.parentSlug) <= 0;

                       return (
                         <motion.div 
                           id={`product-card-${recP.id}`}
                           key={recP.id}
                           initial={{ opacity: 0, y: 15 }}
                           whileInView={{ opacity: 1, y: 0 }}
                           viewport={{ once: true }}
                           transition={{ duration: 0.45, delay: i * 0.1 }}
                           className={cn(
                             "group flex flex-col relative w-full bg-white rounded-[2rem] border border-neutral-100 hover:border-black/10 transition-all duration-300 overflow-hidden shadow-[0_4px_20px_rgb(0,0,0,0.01)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.04)]",
                             isRecPrime && "border-amber-500/30 hover:border-amber-500/80 bg-zinc-950/2"
                           )}
                         >
                           <Link 
                             id={`link-image-${recP.id}`}
                             to={recP.slug === 'force' || recP.slug === 'mark' || recP.slug === 'prime' ? `/model/${recP.slug}` : `/product/${recP.slug}`} 
                             className="block w-full relative"
                           >
                             <div className="relative aspect-[4/5] w-full overflow-hidden bg-neutral-50 flex items-center justify-center">
                               {recBadge && (
                                 <div className={cn(
                                   "absolute top-4 left-4 z-30 px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-widest border shadow-xl flex items-center gap-1.5",
                                   recBadge.style
                                 )}>
                                   {recBadge.text}
                                 </div>
                               )}

                               {isRecOOS && (
                                 <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center p-4">
                                   <span className="bg-red-600 text-white font-black text-[9px] uppercase tracking-[0.2em] px-3.5 py-1.5 rounded select-none shadow-md">
                                     Esgotado em Estoque
                                   </span>
                                 </div>
                               )}

                               {recP.images && recP.images[0] ? (
                                 <img 
                                   src={recP.images[0]} 
                                   alt={recP.name} 
                                   referrerPolicy="referrerPolicy"
                                   className="w-full h-full object-contain p-4 group-hover:scale-[1.03] transition-transform duration-500" 
                                   onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/estampas/logo-fpac.png'; }}
                                 />
                               ) : (
                                 <div className="w-full h-full flex items-center justify-center bg-gray-50">
                                   <ImageIcon size={30} className="text-gray-300" />
                                 </div>
                               )}
                             </div>
                           </Link>

                           <div className="p-5 sm:p-6 flex flex-col flex-1 text-left space-y-3 bg-white relative z-20">
                             <div className="flex items-center flex-wrap gap-x-2 gap-y-1 font-mono text-[8px] font-black uppercase tracking-wider text-gray-400">
                               <span className="bg-neutral-100 px-2 py-0.5 rounded text-neutral-600 font-bold">{recSpecs.gsm}</span>
                               <span>•</span>
                               <span className="text-neutral-500">{recSpecs.fit}</span>
                               <span>•</span>
                               <span className="truncate max-w-[130px]">{recSpecs.material}</span>
                             </div>

                             <div className="flex-1 space-y-1.5 min-h-[50px] flex flex-col justify-start">
                               <Link 
                                 id={`link-text-${recP.id}`}
                                 to={recP.slug === 'force' || recP.slug === 'mark' || recP.slug === 'prime' ? `/model/${recP.slug}` : `/product/${recP.slug}`}
                                 className="block"
                               >
                                 <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight italic text-zinc-950 transition-colors group-hover:text-[#eab308] leading-tight">
                                   {recP.name}
                                 </h3>
                               </Link>
                               <p className="text-[9px] text-[#eab308] font-extrabold uppercase tracking-[0.25em] line-clamp-1">
                                 {recP.headline || "COLEÇÃO EXCLUSIVA F PAC"}
                               </p>
                             </div>

                             <div className="flex flex-wrap items-center gap-1">
                               <span className="text-[8px] text-gray-400 uppercase font-bold mr-1 tracking-wider font-mono">TAM:</span>
                               {recP.sizes?.map((size: string) => (
                                 <span 
                                   key={size} 
                                   className="text-[8px] font-black px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-600 uppercase tracking-wider border border-neutral-200/40"
                                 >
                                   {size}
                                 </span>
                               ))}
                             </div>

                             <div className="pt-4 border-t border-neutral-100 flex items-center justify-between">
                               <div className="flex flex-col">
                                 <span className="text-[8px] text-neutral-400 font-bold uppercase tracking-wider font-mono">VALOR UNITÁRIO</span>
                                 <span className="text-base sm:text-lg font-black text-zinc-950">
                                   R$ {(recP.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                 </span>
                               </div>

                               <Link 
                                 id={`btn-details-${recP.id}`}
                                 to={recP.slug === 'force' || recP.slug === 'mark' || recP.slug === 'prime' ? `/model/${recP.slug}` : `/product/${recP.slug}`}
                                 className={cn(
                                   "inline-flex items-center gap-1.5 py-2.5 px-3.5 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 cursor-pointer shadow-xs",
                                   isRecPrime 
                                     ? "bg-amber-500 hover:bg-amber-600 text-zinc-950" 
                                     : "bg-black hover:bg-[#eab308] text-white hover:text-black"
                                 )}
                               >
                                 {isRecPrime ? "CUSTOMIZAR" : "DETALHES"}
                                 <ArrowRight size={11} />
                               </Link>
                             </div>
                           </div>
                         </motion.div>
                       );
                     })}
                </div>
             </div>
          )}

          {/* Social Proof & Real Customer Reviews Block */}
          <div className="mt-16 md:mt-24 border-t border-black/[0.05] pt-12 text-left">
             <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                   <span className="text-[9px] text-[#eab308] font-black uppercase tracking-[0.35em] block mb-1">COMUNIDADE STREETWEAR</span>
                   <h3 className="text-xl md:text-2xl font-black uppercase tracking-wider text-black flex items-center gap-1.5 italic">
                      Camisetas Reais • Quem Veste Recomenda
                      <button
                         id="btn-toggle-moderador"
                         onClick={toggleAdminBypass}
                         type="button"
                         className={cn(
                            "text-[8.5px] font-bold uppercase tracking-wider transition-opacity cursor-pointer font-sans ml-2 mt-0.5 inline-block align-middle",
                            isAdminBypass ? "text-red-500 border-b border-red-500" : "text-gray-400 hover:text-black"
                         )}
                         title="Exclusão ativa de feedbacks de clientes"
                      >
                         ({isAdminBypass ? 'Moderação Ativa' : 'Modo Moderador'})
                      </button>
                   </h3>
                </div>
                <button 
                   id="btn-show-review-form"
                   onClick={() => setShowReviewForm(!showReviewForm)}
                   type="button"
                   className="text-[10px] font-black uppercase tracking-widest text-[#eab308] bg-zinc-950 px-4 py-2.5 rounded-xl hover:bg-neutral-850 hover:text-white transition-all cursor-pointer shadow-xs shrink-0"
                >
                   {showReviewForm ? 'FECHAR FORMULÁRIO' : 'ESCREVER DEPOIMENTO'}
                </button>
             </div>

             {/* Feedback Creation Form */}
             {showReviewForm && (
                <form onSubmit={handleReviewSubmit} className="bg-white border border-neutral-100 p-5 sm:p-6 mb-8 rounded-[1.5rem] shadow-[0_4px_20px_rgba(0,0,0,0.02)] space-y-4 font-sans text-left">
                   <h5 className="text-[10px] font-black uppercase tracking-widest text-zinc-950 border-b border-black/5 pb-2">NOVO DEPOIMENTO REAL</h5>
                   
                   <div className="space-y-1.5">
                      <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 block">Sua Avaliação</label>
                      <div className="flex items-center gap-1.5">
                         {[1, 2, 3, 4, 5].map((star) => (
                            <button
                               id={`star-rating-btn-${star}`}
                               type="button"
                               key={star}
                               onClick={() => setReviewRating(star)}
                               className="text-[#eab308] hover:scale-110 transition-transform cursor-pointer"
                            >
                               <Star 
                                  size={16} 
                                  className={cn(star <= reviewRating ? "fill-current text-[#eab308]" : "text-gray-200")} 
                               />
                            </button>
                         ))}
                      </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                         <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 block">Seu Nome / Apelido</label>
                         <input
                            id="review-name-input"
                            type="text"
                            required
                            value={reviewName}
                            onChange={(e) => setReviewName(e.target.value)}
                            placeholder="Ex: João Silva"
                            className="w-full text-xs font-semibold bg-neutral-50/50 border border-neutral-150 p-3 rounded-xl focus:border-black outline-none bg-white font-sans"
                         />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                         <div className="space-y-1.5">
                            <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 block">Tamanho Comprado</label>
                            <select
                               id="review-size-select"
                               value={reviewSize}
                               onChange={(e) => setReviewSize(e.target.value)}
                               className="w-full text-xs font-semibold bg-neutral-50/50 border border-neutral-150 p-3 rounded-xl focus:border-black outline-none bg-white font-sans cursor-pointer min-h-[44px]"
                            >
                               <option value="">Não informar</option>
                               <option value="P">P</option>
                               <option value="M">M</option>
                               <option value="G">G</option>
                               <option value="GG">GG</option>
                               <option value="XGG">XGG</option>
                            </select>
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 block">Estilo de Ajuste</label>
                            <select
                               id="review-style-select"
                               value={reviewStyle}
                               onChange={(e) => setReviewStyle(e.target.value)}
                               className="w-full text-xs font-semibold bg-neutral-50/50 border border-neutral-150 p-3 rounded-xl focus:border-black outline-none bg-white font-sans cursor-pointer min-h-[44px]"
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

                   <div className="space-y-1.5">
                      <label className="text-[8px] font-black uppercase tracking-widest text-gray-400 block">Seu Depoimento / Comentário Sincero</label>
                      <textarea
                         id="review-comment-textarea"
                         required
                         rows={3}
                         value={reviewComment}
                         onChange={(e) => setReviewComment(e.target.value)}
                         placeholder="Conte sobre o caimento no peito, a grossura da gola canelada de 3cm, o toque de alta gramatura ou o tempo aproximado para entrega..."
                         className="w-full text-xs font-medium bg-neutral-50/50 border border-neutral-150 p-3 rounded-xl focus:border-black outline-none bg-white font-sans resize-none leading-relaxed"
                      />
                   </div>

                   <div className="flex items-center gap-2 pt-1 border-t border-black/5">
                      <input 
                         type="checkbox" 
                         id="review-verified-toggle"
                         checked={reviewVerified}
                         onChange={(e) => setReviewVerified(e.target.checked)}
                         className="accent-black cursor-pointer w-4 h-4 rounded"
                      />
                      <label htmlFor="review-verified-toggle" className="text-[9.5px] font-black uppercase tracking-wider text-gray-500 select-none cursor-pointer" style={{ textTransform: 'none' }}>
                         Confirmar como compra aprovada (Selo Verificado F PAC)
                      </label>
                   </div>

                   <div className="flex items-center gap-2 pt-2">
                      <button
                         id="review-submit-btn"
                         type="submit"
                         disabled={submittingReview}
                         className="bg-zinc-950 text-[#eab308] text-[10px] font-black uppercase tracking-widest px-5 py-3 hover:bg-[#eab308] hover:text-black transition-colors flex items-center gap-1.5 rounded-xl disabled:opacity-50 cursor-pointer"
                      >
                         {submittingReview ? (
                            <>
                               <Loader2 size={12} className="animate-spin" />
                               Enviando...
                            </>
                         ) : 'Enviar Feedback Real'}
                      </button>
                      <button
                         id="review-cancel-btn"
                         type="button"
                         onClick={() => setShowReviewForm(false)}
                         className="border border-neutral-150 bg-white text-zinc-800 text-[10px] font-black uppercase tracking-widest px-5 py-3 hover:bg-neutral-50 transition-colors rounded-xl cursor-pointer"
                      >
                         Cancelar
                      </button>
                   </div>
                </form>
             )}

             {/* Feed list matching catalog styles */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...reviews, ...DEFAULT_REVIEWS.filter(r => !deletedDefaultIds.includes(r.id))].map((rev) => (
                   <div key={rev.id} className={cn("p-5 relative font-sans rounded-[1.5rem] border text-left flex flex-col justify-between space-y-3 shadow-xs", rev.isDefault ? "bg-white border-neutral-100" : "bg-amber-500/[0.02] border-amber-500/20")}>
                      <div>
                         <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-0.5 text-[#eab308]">
                               {Array.from({ length: 5 }).map((_, i) => (
                                  <Star 
                                     key={i} 
                                     size={11} 
                                     className={cn(i < rev.rating ? "fill-current text-[#eab308]" : "opacity-25 text-gray-200")} 
                                  />
                               ))}
                            </div>
                            <div className="flex items-center gap-1.5">
                               {rev.verified && (
                                  <span className={cn("text-[8px] font-mono font-black uppercase tracking-widest px-2 py-0.5 rounded", rev.isDefault ? "text-gray-400 bg-neutral-100" : "text-[#eab308] bg-amber-500/10")}>
                                     Selo Verificado {rev.isDefault ? '' : '• Real'}
                                  </span>
                               )}
                               {canDeleteReview(rev) && (
                                  <button
                                     id={`delete-review-btn-${rev.id}`}
                                     onClick={() => handleDeleteReview(rev.id)}
                                     type="button"
                                     className="p-1 text-gray-400 hover:text-red-500 transition-colors cursor-pointer rounded"
                                     title="Excluir Depoimento do Cliente"
                                  >
                                     <Trash2 size={12} className="shrink-0" />
                                  </button>
                               )}
                            </div>
                         </div>
                         <p className="text-[11.5px] font-sans font-medium text-zinc-700 italic leading-relaxed">
                            "{rev.comment}"
                         </p>
                      </div>
                      <p className={cn("text-[8.5px] font-black uppercase tracking-widest pt-2 border-t border-black/[0.03] font-mono", rev.isDefault ? "text-gray-400" : "text-gray-500")}>
                         {rev.name} {rev.styleInfo && <span className="text-[#eab308] font-mono font-black">• {rev.styleInfo}</span>}
                      </p>
                   </div>
                ))}
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

        {reviewToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
            onClick={() => setReviewToDelete(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-sm p-6 md:p-8 border border-black/10 shadow-2xl relative text-center rounded-none font-sans"
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setReviewToDelete(null)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center hover:bg-black/5 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="mb-5 flex flex-col items-center">
                 <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-4">
                    <Trash2 size={22} className="shrink-0" />
                 </div>
                 <h2 className="text-lg md:text-xl font-black uppercase tracking-tighter leading-tight text-gray-900">
                   Excluir Depoimento
                 </h2>
                 <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mt-1">
                   Confirmação de Exclusão
                 </p>
              </div>

              <div className="mb-6 text-xs text-gray-600 leading-relaxed max-w-sm mx-auto">
                 <p>
                   Deseja realmente excluir este depoimento de forma permanente? Esta ação não poderá ser desfeita.
                 </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                 <button
                   onClick={confirmDeleteReview}
                   className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-3 px-6 text-xs uppercase tracking-[0.2em] transition-all transform active:scale-95 cursor-pointer rounded-none min-h-[44px]"
                 >
                   Excluir Permanente
                 </button>
                 <button
                   onClick={() => setReviewToDelete(null)}
                   className="flex-1 bg-transparent border border-black/20 hover:border-black text-black hover:bg-black/5 font-black py-3 px-6 text-xs uppercase tracking-[0.2em] transition-all transform active:scale-95 cursor-pointer rounded-none min-h-[44px]"
                 >
                   Cancelar
                 </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showSizerModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
            onClick={() => setShowSizerModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white w-full max-w-lg p-6 sm:p-8 border border-black/10 shadow-2xl relative rounded-none text-left"
              onClick={e => e.stopPropagation()}
            >
              {/* Close Button */}
              <button 
                type="button"
                onClick={() => setShowSizerModal(false)}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center hover:bg-black/5 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>

              {/* Title Header */}
              <div className="mb-6 flex items-center gap-3 border-b border-black/5 pb-4">
                <div className="w-10 h-10 rounded-full bg-[#eab308]/10 flex items-center justify-center text-sm">
                  📏
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-tight">Provador Virtual F PAC</h2>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider font-sans mt-0.5">Encontre o caimento perfeito para você</p>
                </div>
              </div>

              {/* Sliders Container */}
              <div className="space-y-6">
                
                {/* Altura Slider */}
                <div>
                  <div className="flex justify-between items-center mb-1 text-xs">
                    <span className="font-extrabold uppercase tracking-wider text-black text-[10px]">Sua Altura</span>
                    <span className="font-mono font-black text-[#eab308] bg-black px-2 py-0.5 rounded text-[10px]">{sizerHeight} cm</span>
                  </div>
                  <input 
                    type="range" 
                    min="150" 
                    max="210" 
                    value={sizerHeight} 
                    onChange={(e) => setSizerHeight(Number(e.target.value))}
                    className="w-full accent-black cursor-ew-resize h-1 bg-gray-200 rounded-lg outline-none"
                  />
                  <div className="flex justify-between text-[8px] text-gray-400 font-extrabold uppercase mt-1">
                    <span>1,50 m</span>
                    <span>1,80 m</span>
                    <span>2,10 m</span>
                  </div>
                </div>

                {/* Peso Slider */}
                <div>
                  <div className="flex justify-between items-center mb-1 text-xs">
                    <span className="font-extrabold uppercase tracking-wider text-black text-[10px]">Seu Peso</span>
                    <span className="font-mono font-black text-[#eab308] bg-black px-2 py-0.5 rounded text-[10px]">{sizerWeight} kg</span>
                  </div>
                  <input 
                    type="range" 
                    min="50" 
                    max="130" 
                    value={sizerWeight} 
                    onChange={(e) => setSizerWeight(Number(e.target.value))}
                    className="w-full accent-black cursor-ew-resize h-1 bg-gray-200 rounded-lg outline-none"
                  />
                  <div className="flex justify-between text-[8px] text-gray-400 font-extrabold uppercase mt-1">
                    <span>50 kg</span>
                    <span>90 kg</span>
                    <span>130 kg</span>
                  </div>
                </div>

                {/* Estilo Favorito Selection */}
                <div>
                  <span className="text-[9px] font-black uppercase tracking-wider text-gray-400 mb-2 block">Preferência de Ajuste</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      type="button"
                      onClick={() => setSizerStyle('regular')}
                      className={cn(
                        "p-3 text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer text-center rounded-none",
                        sizerStyle === 'regular'
                          ? "bg-black text-[#eab308] border-black shadow-md font-black"
                          : "bg-white text-gray-400 border-black/10 hover:border-black/30 text-gray-500"
                      )}
                    >
                      Slim / Regular
                    </button>
                    <button 
                      type="button"
                      onClick={() => setSizerStyle('oversized')}
                      className={cn(
                        "p-3 text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer text-center rounded-none",
                        sizerStyle === 'oversized'
                          ? "bg-black text-[#eab308] border-black shadow-md font-black"
                          : "bg-white text-gray-400 border-black/10 hover:border-black/30 text-gray-500"
                      )}
                    >
                      Oversized (Street)
                    </button>
                  </div>
                  <p className="text-[8.5px] text-gray-400 italic font-medium mt-1 uppercase text-center">
                    *A MODELAGEM DO F PAC JÁ É OVERSIZED DE FÁBRICA.
                  </p>
                </div>

                {/* ANIMATED RESULT BOX */}
                {(() => {
                  const recSize = getRecommendedSize(sizerHeight, sizerWeight, sizerStyle);
                  return (
                    <div className="p-4 bg-neutral-100 border border-black/10 rounded-none flex items-center justify-between gap-4 mt-6">
                      <div className="space-y-1">
                        <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 block">Tamanho Recomendado</span>
                        <div className="text-[11px] font-black uppercase text-black">
                          {sizerStyle === 'oversized' ? 'Caimento Amplo & Street' : 'Caimento Casual Ajustado'}
                        </div>
                        <p className="text-[10px] font-medium text-gray-500 leading-normal max-w-[260px] uppercase">
                          Para o seu perfil ({sizerHeight}cm, {sizerWeight}kg), o tamanho <strong className="text-black font-extrabold">{recSize}</strong> proporcionará o conforto e o drapeado estruturado ideal da marca.
                        </p>
                      </div>
                      <div className="shrink-0 flex flex-col items-center justify-center bg-black text-[#eab308] w-14 h-14 rounded shadow-md">
                        <span className="text-xl font-black italic">{recSize}</span>
                        <span className="text-[7px] font-black tracking-widest leading-none mt-0.5">FIT</span>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* Apply / Action Buttons */}
              <div className="flex gap-2.5 mt-6 pt-4 border-t border-black/5">
                <button
                  type="button"
                  onClick={() => {
                    const recSize = getRecommendedSize(sizerHeight, sizerWeight, sizerStyle);
                    setSelectedSize(recSize);
                    setShowSizerModal(false);
                    toast.success(`Tamanho ${recSize} selecionado automaticamente!`);
                  }}
                  className="flex-1 bg-black text-[#eab308] hover:bg-neutral-800 text-[10px] font-black py-3 px-4 uppercase tracking-[0.15em] transition-all cursor-pointer rounded-none text-center"
                >
                  USAR ESTE TAMANHO
                </button>
                <button
                  type="button"
                  onClick={() => setShowSizerModal(false)}
                  className="bg-transparent border border-black/15 hover:border-black text-black py-3 px-5 text-[10px] font-black uppercase tracking-[0.15em] transition-all cursor-pointer rounded-none"
                >
                  FECHAR
                </button>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
