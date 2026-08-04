import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sparkles, Check, ChevronRight, RotateCw, ZoomIn, Eye, ShoppingBag, 
  Search, Filter, Plus, Trash2, ArrowLeft, ArrowRight, ShieldCheck, 
  Ruler, RefreshCw, FileText, Download, Info, Maximize2, X, Star, Flame, Tag, Layers
} from 'lucide-react';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useCart } from '../hooks/useCart';
import { Estampa } from '../types/estampas';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { SizeChart } from '../components/SizeChart';

// Color options for the base T-Shirt
export interface ShirtColorOption {
  id: string;
  name: string;
  hex: string;
  bgClass: string;
  textColorClass: string;
  previewOverlayHex: string;
}

export const SHIRT_COLORS: ShirtColorOption[] = [
  { id: 'preto', name: 'Preto Carbono', hex: '#111111', bgClass: 'bg-[#111111]', textColorClass: 'text-white', previewOverlayHex: '#111111' },
  { id: 'offwhite', name: 'Off White', hex: '#F4F4F0', bgClass: 'bg-[#F4F4F0]', textColorClass: 'text-black', previewOverlayHex: '#F4F4F0' },
  { id: 'branco', name: 'Branco Neve', hex: '#FFFFFF', bgClass: 'bg-[#FFFFFF]', textColorClass: 'text-black', previewOverlayHex: '#FFFFFF' },
  { id: 'cinza', name: 'Cinza Mescla', hex: '#6B7280', bgClass: 'bg-[#6B7280]', textColorClass: 'text-white', previewOverlayHex: '#6B7280' },
  { id: 'verde', name: 'Verde Militar', hex: '#2B3D2F', bgClass: 'bg-[#2B3D2F]', textColorClass: 'text-white', previewOverlayHex: '#2B3D2F' },
  { id: 'marinho', name: 'Azul Marinho', hex: '#1B263B', bgClass: 'bg-[#1B263B]', textColorClass: 'text-white', previewOverlayHex: '#1B263B' },
];

export const SHIRT_SIZES = ['P', 'M', 'G', 'GG', 'XG'];

// Available Stamp Placement Positions
export interface PrintPositionOption {
  id: 'peito_esquerdo' | 'peito_central' | 'costas' | 'manga_esquerda' | 'manga_direita' | 'barra_inferior' | 'gola_traseira';
  label: string;
  viewSide: 'front' | 'back';
  description: string;
  maxDimensions: string;
  defaultSizeCm: string;
  coordinateStyle: {
    top?: string;
    left?: string;
    right?: string;
    bottom?: string;
    transform?: string;
    maxWidth?: string;
    maxHeight?: string;
  };
}

export const PRINT_POSITIONS: PrintPositionOption[] = [
  {
    id: 'peito_esquerdo',
    label: 'Peito Esquerdo',
    viewSide: 'front',
    description: 'Logo ou arte sutil no lado esquerdo do peito',
    maxDimensions: '15x15 cm',
    defaultSizeCm: '10x10',
    coordinateStyle: { top: '28%', left: '38%', transform: 'translate(-50%, -50%)', maxWidth: '22%', maxHeight: '20%' }
  },
  {
    id: 'peito_central',
    label: 'Peito Central',
    viewSide: 'front',
    description: 'Arte em destaque no centro do peito',
    maxDimensions: '30x40 cm',
    defaultSizeCm: '20x20',
    coordinateStyle: { top: '38%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '38%', maxHeight: '38%' }
  },
  {
    id: 'costas',
    label: 'Costas Principal',
    viewSide: 'back',
    description: 'Estampa de alto impacto nas costas',
    maxDimensions: '30x40 cm',
    defaultSizeCm: '30x30',
    coordinateStyle: { top: '40%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '44%', maxHeight: '48%' }
  },
  {
    id: 'manga_esquerda',
    label: 'Manga Esquerda',
    viewSide: 'front',
    description: 'Detalhe exclusivo na manga esquerda',
    maxDimensions: '10x12 cm',
    defaultSizeCm: '8x8',
    coordinateStyle: { top: '28%', left: '20%', transform: 'translate(-50%, -50%)', maxWidth: '14%', maxHeight: '18%' }
  },
  {
    id: 'manga_direita',
    label: 'Manga Direita',
    viewSide: 'front',
    description: 'Detalhe exclusivo na manga direita',
    maxDimensions: '10x12 cm',
    defaultSizeCm: '8x8',
    coordinateStyle: { top: '28%', left: '80%', transform: 'translate(-50%, -50%)', maxWidth: '14%', maxHeight: '18%' }
  },
  {
    id: 'barra_inferior',
    label: 'Barra Inferior',
    viewSide: 'front',
    description: 'Etiqueta ou logo sutil na barra',
    maxDimensions: '10x10 cm',
    defaultSizeCm: '5x5',
    coordinateStyle: { top: '80%', left: '26%', transform: 'translate(-50%, -50%)', maxWidth: '15%', maxHeight: '12%' }
  },
  {
    id: 'gola_traseira',
    label: 'Gola Traseira',
    viewSide: 'back',
    description: 'Monograma ou assinatura abaixo da gola',
    maxDimensions: '10x10 cm',
    defaultSizeCm: '5x5',
    coordinateStyle: { top: '18%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '16%', maxHeight: '12%' }
  },
];

// Available Stamp Sizes in cm
export const STAMP_SIZE_OPTIONS = [
  { id: '2x3', label: '2 x 3 cm (Micro)', priceExtra: 0 },
  { id: '5x5', label: '5 x 5 cm (Mini)', priceExtra: 0 },
  { id: '8x8', label: '8 x 8 cm (Pequeno)', priceExtra: 0 },
  { id: '10x10', label: '10 x 10 cm (Padrão Peito)', priceExtra: 0 },
  { id: '10x12', label: '10 x 12 cm (Manga/Gola)', priceExtra: 5 },
  { id: '12x15', label: '12 x 15 cm (Médio)', priceExtra: 8 },
  { id: '15x15', label: '15 x 15 cm (Médio A5)', priceExtra: 10 },
  { id: '15x20', label: '15 x 20 cm (Destaque)', priceExtra: 12 },
  { id: '20x20', label: '20 x 20 cm (Grande)', priceExtra: 15 },
  { id: '20x30', label: '20 x 30 cm (Proporção A4)', priceExtra: 18 },
  { id: '25x30', label: '25 x 30 cm (Master)', priceExtra: 22 },
  { id: '30x30', label: '30 x 30 cm (Costas Quadrado)', priceExtra: 25 },
  { id: '30x40', label: '30 x 40 cm (Poster HD A3)', priceExtra: 30 },
];

export interface CustomSelectedStamp {
  id: string; // unique placement instance id
  stampId: string;
  stampName: string;
  stampImage: string;
  positionId: PrintPositionOption['id'];
  positionLabel: string;
  sizeCm: string;
  priceExtra: number;
}

export default function PrimeCustomBuilder() {
  const navigate = useNavigate();
  const { addItem } = useCart();

  // Builder steps
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Configuration state
  const [dbColors, setDbColors] = useState<ShirtColorOption[]>(SHIRT_COLORS);
  const [dbSizes, setDbSizes] = useState<string[]>(SHIRT_SIZES);
  const [selectedColor, setSelectedColor] = useState<ShirtColorOption>(SHIRT_COLORS[0]);
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [selectedStamps, setSelectedStamps] = useState<CustomSelectedStamp[]>([]);
  
  // Stamp Picker state
  const [stampsCatalog, setStampsCatalog] = useState<Estampa[]>([]);
  const [loadingStamps, setLoadingStamps] = useState<boolean>(true);
  const [stampSearch, setStampSearch] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('Todos');
  const [activeStampForPlacement, setActiveStampForPlacement] = useState<Estampa | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  // Preview state
  const [activeViewSide, setActiveViewSide] = useState<'front' | 'back'>('front');
  const [rotationAngle, setRotationAngle] = useState<number>(0); // 0 or 180
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [showSizeChart, setShowSizeChart] = useState<boolean>(false);

  // Placement modal / config state
  const [configuringPosition, setConfiguringPosition] = useState<PrintPositionOption | null>(null);
  const [configuringSizeCm, setConfiguringSizeCm] = useState<string>('10x10');

  // Canvas render ref
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Base Shirt Price
  const BASE_SHIRT_PRICE = 119.90;

  // Subscribe to PRIME product config from Firestore products collection (Gestão)
  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const primeDoc = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }))
        .find(p => String(p.slug || '').toLowerCase() === 'prime' || String(p.id || '').toLowerCase() === 'prod_prime_03');

      if (primeDoc) {
        // Extract available colors from Gestão
        if (Array.isArray(primeDoc.colors) && primeDoc.colors.length > 0) {
          const mappedColors: ShirtColorOption[] = primeDoc.colors
            .filter((c: any) => c.status !== 'hidden' && c.status !== 'inactive' && c.available !== false)
            .map((c: any) => {
              const hex = c.hex || '#111111';
              const id = (c.name || '').toLowerCase().replace(/\s+/g, '_');
              const foundPreset = SHIRT_COLORS.find(sc => sc.hex.toLowerCase() === hex.toLowerCase() || sc.name.toLowerCase() === (c.name || '').toLowerCase());
              return {
                id: id || (foundPreset?.id || 'cor_custom'),
                name: c.name || 'Cor Personalizada',
                hex: hex,
                bgClass: foundPreset?.bgClass || 'bg-neutral-800',
                textColorClass: ['#ffffff', '#faf9f6', '#f4f4f0'].includes(hex.toLowerCase()) ? 'text-black' : 'text-white',
                previewOverlayHex: hex,
              };
            });
          
          if (mappedColors.length > 0) {
            setDbColors(mappedColors);
            setSelectedColor(prev => mappedColors.find(mc => mc.hex === prev.hex) || mappedColors[0]);
          }
        }

        // Extract available sizes from Gestão
        if (Array.isArray(primeDoc.sizes) && primeDoc.sizes.length > 0) {
          const availableSizes = primeDoc.sizes.filter((sz: any) => typeof sz === 'string' && sz.trim().length > 0);
          if (availableSizes.length > 0) {
            setDbSizes(availableSizes);
            setSelectedSize(prev => availableSizes.includes(prev) ? prev : availableSizes[0]);
          }
        }
      }
    }, (error) => {
      console.error("Error loading PRIME product configs from Gestão:", error);
    });

    return () => unsubscribe();
  }, []);

  // Calculate total price
  const totalPrice = useMemo(() => {
    const extraStampsTotal = selectedStamps.reduce((acc, curr) => acc + (curr.priceExtra || 0), 0);
    return BASE_SHIRT_PRICE + extraStampsTotal;
  }, [selectedStamps]);

  // Load stamps from Firestore (only active ones configured in Gestão)
  useEffect(() => {
    setLoadingStamps(true);
    const q = query(collection(db, 'estampas'), orderBy('slotIndex', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docsData: Estampa[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        // Only include active stamps available in management
        if (d.status !== 'hidden' && d.status !== 'inactive' && d.available !== false) {
          docsData.push({
            id: docSnap.id,
            name: d.name || 'Estampa Exclusiva',
            description: d.description || '',
            image: d.image || d.path || '',
            slotIndex: d.slotIndex || 0,
            position: d.position || '',
            allowedLocations: Array.isArray(d.allowedLocations) ? d.allowedLocations : undefined,
            locationConfigs: d.locationConfigs || undefined,
          });
        }
      });
      setStampsCatalog(docsData);
      setLoadingStamps(false);
    }, (error) => {
      console.error("Error fetching stamps for PRIME builder:", error);
      setLoadingStamps(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter positions based on activeStampForPlacement allowed locations in Gestão
  const availablePrintPositions = useMemo(() => {
    if (!activeStampForPlacement || !Array.isArray(activeStampForPlacement.allowedLocations) || activeStampForPlacement.allowedLocations.length === 0) {
      return PRINT_POSITIONS;
    }
    const allowed = activeStampForPlacement.allowedLocations.map(l => l.toLowerCase());
    return PRINT_POSITIONS.filter(pos => {
      const posLabelLower = pos.label.toLowerCase();
      const posIdLower = pos.id.toLowerCase();
      return allowed.some(a => posLabelLower.includes(a) || a.includes(posLabelLower) || posIdLower.includes(a) || a.includes(posIdLower));
    });
  }, [activeStampForPlacement]);

  // Filtered stamps for search & categories
  const filteredStamps = useMemo(() => {
    return stampsCatalog.filter(st => {
      const matchSearch = st.name.toLowerCase().includes(stampSearch.toLowerCase()) ||
                          st.description?.toLowerCase().includes(stampSearch.toLowerCase());
      return matchSearch;
    });
  }, [stampsCatalog, stampSearch]);

  // Toggle favorite
  const toggleFavorite = (stampId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(stampId) ? prev.filter(id => id !== stampId) : [...prev, stampId]
    );
  };

  // Add stamp to shirt
  const handleConfirmStampPlacement = () => {
    if (!activeStampForPlacement || !configuringPosition) return;

    const sizeOpt = STAMP_SIZE_OPTIONS.find(s => s.id === configuringSizeCm) || STAMP_SIZE_OPTIONS[3];

    // Remove existing stamp on same position if present
    const updated = selectedStamps.filter(s => s.positionId !== configuringPosition.id);

    const newPlacement: CustomSelectedStamp = {
      id: `${activeStampForPlacement.id}_${configuringPosition.id}_${Date.now()}`,
      stampId: activeStampForPlacement.id,
      stampName: activeStampForPlacement.name,
      stampImage: activeStampForPlacement.image || '',
      positionId: configuringPosition.id,
      positionLabel: configuringPosition.label,
      sizeCm: sizeOpt.id,
      priceExtra: sizeOpt.priceExtra,
    };

    setSelectedStamps([...updated, newPlacement]);
    setActiveViewSide(configuringPosition.viewSide);
    
    toast.success(`Estampa "${activeStampForPlacement.name}" aplicada no ${configuringPosition.label}!`);

    // Reset modal
    setActiveStampForPlacement(null);
    setConfiguringPosition(null);
  };

  // Remove stamp placement
  const handleRemoveStampPlacement = (instanceId: string) => {
    setSelectedStamps(prev => prev.filter(s => s.id !== instanceId));
    toast.success('Estampa removida da posição.');
  };

  // Render composite shirt preview canvas DataURL
  const generateShirtMockupDataUrl = async (): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve('');
        return;
      }

      // Background fill
      ctx.fillStyle = '#f8f9fa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw T-Shirt silhouette base
      ctx.save();
      // Draw simple SVG path or colored shirt body
      ctx.fillStyle = selectedColor.hex;
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 15;
      
      // Draw stylized T-shirt body shape
      ctx.beginPath();
      ctx.moveTo(250, 150);
      ctx.lineTo(330, 100);
      ctx.lineTo(470, 100);
      ctx.lineTo(550, 150);
      ctx.lineTo(650, 220);
      ctx.lineTo(590, 320);
      ctx.lineTo(530, 280);
      ctx.lineTo(530, 700);
      ctx.lineTo(270, 700);
      ctx.lineTo(270, 280);
      ctx.lineTo(210, 320);
      ctx.lineTo(150, 220);
      ctx.closePath();
      ctx.fill();

      if (selectedColor.hex === '#FFFFFF') {
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      // Add watermark
      ctx.font = '900 16px sans-serif';
      ctx.fillStyle = selectedColor.hex === '#FFFFFF' ? '#111' : '#FFF';
      ctx.globalAlpha = 0.4;
      ctx.fillText('F PAC STORE — PRIME CUSTOM', 280, 680);

      resolve(canvas.toDataURL('image/png'));
    });
  };

  // Add configuration to Cart
  const handleAddToCart = async () => {
    if (selectedStamps.length === 0) {
      toast.error('Por favor, adicione pelo menos uma estampa na sua camiseta!');
      setCurrentStep(3);
      return;
    }

    const mockupImg = await generateShirtMockupDataUrl();

    // Map print configs for CartItem compatibility
    const printConfigs = selectedStamps.map(s => ({
      id: s.id,
      stamp: s.stampName,
      location: s.positionLabel,
      printSize: s.sizeCm,
      image: s.stampImage,
      background: 'Sem Fundo' as const,
    }));

    const customCartItem = {
      id: `prime_custom_${Date.now()}`,
      slug: 'prime-custom',
      parentSlug: 'prime',
      name: `PRIME CUSTOM — Camiseta Personalizada (${selectedColor.name})`,
      price: totalPrice,
      originalPrice: totalPrice + 30,
      image: mockupImg || selectedStamps[0]?.stampImage || '',
      size: selectedSize,
      color: selectedColor.name,
      quantity: 1,
      printConfigs: printConfigs,
    };

    addItem(customCartItem);
    toast.success('Camiseta PRIME CUSTOM adicionada à sua sacola!');
    navigate('/bag');
  };

  // Active side stamps
  const currentSideStamps = useMemo(() => {
    return selectedStamps.filter(s => {
      const pos = PRINT_POSITIONS.find(p => p.id === s.positionId);
      return pos?.viewSide === activeViewSide;
    });
  }, [selectedStamps, activeViewSide]);

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-neutral-900 pt-4 pb-20 px-3 md:px-8 font-sans selection:bg-[#eab308] selection:text-black">
      {/* HEADER TÍTULO PRIME CUSTOM */}
      <div className="max-w-7xl mx-auto mb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-[#eab308]/10 border border-[#eab308]/30 px-3 py-1 rounded-full text-[#b45309] text-[10px] md:text-xs font-black uppercase tracking-[0.2em] mb-2">
          <Sparkles size={14} className="animate-spin-slow text-[#d97706]" />
          <span>CONSTRUTOR DE CAMISETAS PREMIUM</span>
        </div>
        <h1 className="text-2xl md:text-5xl font-black uppercase tracking-tight text-neutral-900 mb-2 font-mono">
          PRIME <span className="text-[#d97706]">CUSTOM</span>
        </h1>
        <p className="text-xs md:text-sm text-neutral-600 max-w-2xl mx-auto font-medium">
          Monte sua camiseta exclusiva passo a passo. Escolha a cor nobre, tamanho, estampas do catálogo e posicionamento com visualização em tempo real.
        </p>
      </div>

      {/* STEPPER DE NAVEGAÇÃO DOS PASSOS */}
      <div className="max-w-5xl mx-auto mb-8 bg-white border border-neutral-200 p-2 md:p-3 rounded-2xl flex items-center justify-between gap-1 overflow-x-auto shadow-md">
        {[
          { num: 1, label: '1. Cor', desc: 'Tecido' },
          { num: 2, label: '2. Tamanho', desc: 'Modelagem' },
          { num: 3, label: '3. Estampas', desc: 'Catálogo' },
          { num: 4, label: '4. Posicionar', desc: 'Local' },
          { num: 5, label: '5. Dimensões', desc: 'Tamanho cm' },
          { num: 6, label: '6. Preview', desc: 'Visão 360°' },
          { num: 7, label: '7. Resumo', desc: 'Valores' },
        ].map((st) => (
          <button
            key={st.num}
            onClick={() => setCurrentStep(st.num)}
            className={cn(
              "flex-1 min-w-[100px] py-2 px-2 rounded-xl text-center transition-all cursor-pointer border flex flex-col items-center justify-center",
              currentStep === st.num
                ? "bg-[#eab308] text-black border-[#eab308] font-black shadow-[0_0_15px_rgba(234,179,8,0.3)] scale-[1.02]"
                : currentStep > st.num
                ? "bg-neutral-900 text-white border-neutral-800 hover:bg-neutral-800 font-bold"
                : "bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200 font-medium"
            )}
          >
            <span className="text-[11px] uppercase tracking-wider font-mono">
              {st.label}
            </span>
            <span className="text-[9px] opacity-70 font-sans hidden md:block">
              {st.desc}
            </span>
          </button>
        ))}
      </div>

      {/* GRID PRINCIPAL: CANVAS DE PREVIEW (ESQUERDA) + PAINEL DE ETAPAS (DIREITA) */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* COLUNA DA ESQUERDA: PREVIEW INTERATIVO DA CAMISETA */}
        <div className="lg:col-span-6 bg-white border border-neutral-200 p-4 md:p-6 rounded-3xl relative shadow-xl flex flex-col items-center sticky top-24">
          
          {/* CONTROLES DE PREVIEW SUPERIORES */}
          <div className="w-full flex items-center justify-between mb-4 bg-neutral-100 backdrop-blur-md p-2 rounded-2xl border border-neutral-200 text-xs font-mono">
            {/* LADO FRENTE / COSTAS */}
            <div className="flex gap-1">
              <button
                onClick={() => { setActiveViewSide('front'); setRotationAngle(0); }}
                className={cn(
                  "px-3 py-1.5 rounded-xl font-black uppercase transition-all cursor-pointer text-[10px]",
                  activeViewSide === 'front'
                    ? "bg-[#eab308] text-black shadow-md"
                    : "bg-neutral-200/60 text-neutral-700 hover:bg-neutral-200"
                )}
              >
                FRENTE
              </button>
              <button
                onClick={() => { setActiveViewSide('back'); setRotationAngle(180); }}
                className={cn(
                  "px-3 py-1.5 rounded-xl font-black uppercase transition-all cursor-pointer text-[10px]",
                  activeViewSide === 'back'
                    ? "bg-[#eab308] text-black shadow-md"
                    : "bg-neutral-200/60 text-neutral-700 hover:bg-neutral-200"
                )}
              >
                COSTAS
              </button>
            </div>

            {/* ROTAÇÃO / ZOOM */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const nextSide = activeViewSide === 'front' ? 'back' : 'front';
                  setActiveViewSide(nextSide);
                  setRotationAngle(prev => (prev === 0 ? 180 : 0));
                }}
                className="p-2 bg-neutral-200/60 hover:bg-neutral-200 text-neutral-800 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-[10px] uppercase font-bold"
                title="Girar Camiseta 360°"
              >
                <RotateCw size={14} className="text-[#d97706]" />
                <span className="hidden sm:inline">GIRAR 180°</span>
              </button>

              <button
                onClick={() => setIsZoomed(!isZoomed)}
                className="p-2 bg-neutral-200/60 hover:bg-neutral-200 text-neutral-800 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-[10px] uppercase font-bold"
                title="Alternar Zoom"
              >
                <ZoomIn size={14} className="text-[#d97706]" />
              </button>
            </div>
          </div>

          {/* PALCO DE VISUALIZAÇÃO VISUAL DA CAMISETA (MOCKUP REALTIME - FUNDO NEUTRO DE ALTO CONTRASTE) */}
          <div
            ref={previewContainerRef}
            className="relative w-full aspect-square max-w-[480px] rounded-3xl flex items-center justify-center overflow-hidden transition-all duration-500 border border-neutral-300 bg-gradient-to-b from-neutral-200 via-neutral-100 to-neutral-200 shadow-inner group"
            style={{
              perspective: '1000px',
            }}
          >
            {/* SILHUETA VETORIAL DA CAMISETA OVERSIZED PRIME */}
            <div
              className={cn(
                "relative w-[85%] h-[85%] transition-transform duration-700 ease-out flex items-center justify-center shadow-2xl rounded-2xl",
                isZoomed && "scale-125"
              )}
              style={{
                transform: `rotateY(${rotationAngle}deg)`,
                transformStyle: 'preserve-3d',
              }}
            >
              {/* SHIRT BODY SVG BASE */}
              <svg
                viewBox="0 0 500 500"
                className="w-full h-full drop-shadow-[0_15px_30px_rgba(0,0,0,0.25)]"
              >
                {/* Main Body */}
                <path
                  d="M 150,110 L 210,80 L 290,80 L 350,110 L 440,160 L 390,240 L 350,210 L 350,440 L 150,440 L 150,210 L 110,240 L 60,160 Z"
                  fill={selectedColor.hex}
                  stroke={['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase()) ? '#cbd5e1' : 'rgba(0,0,0,0.2)'}
                  strokeWidth="2.5"
                />

                {/* Collar Neck Line */}
                {activeViewSide === 'front' ? (
                  <path
                    d="M 210,80 C 230,120 270,120 290,80 Z"
                    fill={['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase()) ? '#e2e8f0' : 'rgba(0,0,0,0.35)'}
                    stroke={['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase()) ? '#94a3b8' : 'rgba(255,255,255,0.2)'}
                    strokeWidth="2"
                  />
                ) : (
                  <path
                    d="M 210,80 C 230,95 270,95 290,80 Z"
                    fill={['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase()) ? '#e2e8f0' : 'rgba(0,0,0,0.25)'}
                    stroke={['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase()) ? '#94a3b8' : 'rgba(255,255,255,0.2)'}
                    strokeWidth="2"
                  />
                )}

                {/* Sleeve Seam Details */}
                <line x1="150" y1="110" x2="150" y2="210" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />
                <line x1="350" y1="110" x2="350" y2="210" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />

                {/* Premium Texture Overlay Effect */}
                <rect x="0" y="0" width="500" height="500" fill="none" />
              </svg>

              {/* OVERLAY DAS ESTAMPAS APLICADAS NA FACETA ATIVA */}
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  transform: rotationAngle === 180 ? 'scaleX(-1)' : 'none', // correct mirrored text
                }}
              >
                {currentSideStamps.map((st) => {
                  const posDef = PRINT_POSITIONS.find(p => p.id === st.positionId);
                  if (!posDef) return null;

                  return (
                    <div
                      key={st.id}
                      className="absolute flex items-center justify-center p-1 border-2 border-dashed border-[#eab308]/60 bg-black/20 rounded-lg group/stamp transition-all duration-300"
                      style={{
                        ...posDef.coordinateStyle,
                      }}
                    >
                      <img
                        src={st.stampImage}
                        alt={st.stampName}
                        className="w-full h-full object-contain filter drop-shadow-md"
                      />
                      {/* Tag de identificação rápida */}
                      <span className="absolute -bottom-5 bg-black/80 text-[#eab308] text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-[#eab308]/40 whitespace-nowrap">
                        {st.positionLabel} ({st.sizeCm})
                      </span>
                    </div>
                  );
                })}
              </div>

            </div>

            {/* BADGE DE LADO ATIVO */}
            <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 text-[10px] font-mono font-bold text-[#eab308] uppercase tracking-widest flex items-center gap-1.5">
              <Eye size={12} />
              <span>VISÃO: {activeViewSide === 'front' ? 'FRENTE' : 'COSTAS'}</span>
            </div>
          </div>

          {/* LISTA DE ESTAMPAS JÁ APLICADAS NESTA CONFIGURAÇÃO */}
          <div className="w-full mt-4 bg-neutral-50 p-3 rounded-2xl border border-neutral-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 font-mono">
                Estampas Aplicadas ({selectedStamps.length})
              </span>
              <span className="text-xs font-black text-[#d97706] font-mono">
                R$ {totalPrice.toFixed(2).replace('.', ',')}
              </span>
            </div>

            {selectedStamps.length === 0 ? (
              <p className="text-[11px] text-neutral-400 italic py-2 text-center font-medium">
                Nenhuma estampa posicionada ainda. Escolha no Passo 3.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedStamps.map((s) => (
                  <div key={s.id} className="flex items-center justify-between bg-white p-2 rounded-xl border border-neutral-200 text-xs">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <img src={s.stampImage} alt={s.stampName} className="w-8 h-8 rounded object-cover bg-neutral-100 border border-neutral-200" />
                      <div className="truncate">
                        <p className="font-bold text-neutral-900 text-[11px] truncate">{s.stampName}</p>
                        <p className="text-[9px] text-neutral-500 font-mono">{s.positionLabel} • {s.sizeCm}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveStampPlacement(s.id)}
                      className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-2"
                      title="Remover Estampa"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* COLUNA DA DIREITA: PAINEL DE CONTROLE DAS ETAPAS DE MONTAGEM */}
        <div className="lg:col-span-6 bg-white border border-neutral-200 p-5 md:p-8 rounded-3xl shadow-xl flex flex-col justify-between min-h-[580px] text-neutral-900">
          
          {/* PASSO 1: ESCOLHER COR DA CAMISA */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">
                  PASSO 1 DE 7
                </span>
                <h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">
                  Escolha a Cor da Camiseta
                </h2>
                <p className="text-xs text-neutral-600 mt-1">
                  Malha Heavyweight 240 GSM com toque aveludado e caimento estruturado.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {dbColors.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => setSelectedColor(col)}
                    className={cn(
                      "p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between h-28 relative overflow-hidden group",
                      selectedColor.id === col.id
                        ? "border-[#eab308] bg-[#eab308]/10 shadow-[0_0_20px_rgba(234,179,8,0.2)]"
                        : "border-neutral-200 bg-neutral-50 hover:border-neutral-400"
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={cn("w-6 h-6 rounded-full border border-black/10 shadow-inner", col.bgClass)} />
                      {selectedColor.id === col.id && (
                        <div className="w-5 h-5 bg-[#eab308] text-black rounded-full flex items-center justify-center font-black">
                          <Check size={12} />
                        </div>
                      )}
                    </div>

                    <div>
                      <span className="text-xs font-black uppercase text-neutral-900 block">
                        {col.name}
                      </span>
                      <span className="text-[9px] text-neutral-500 font-mono block">
                        100% Algodão Premium
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-xs space-y-2">
                <div className="flex items-center gap-2 text-[#eab308] font-bold">
                  <ShieldCheck size={16} />
                  <span>Diferencial F PAC PRIME</span>
                </div>
                <p className="text-gray-300 text-[11px] leading-relaxed">
                  Tratamento antipilling que não junta bolinhas e costura reforçada de ombro a ombro para máxima durabilidade no streetwear do dia a dia.
                </p>
              </div>
            </div>
          )}

          {/* PASSO 2: ESCOLHER TAMANHO */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">
                  PASSO 2 DE 7
                </span>
                <h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">
                  Selecione o Tamanho
                </h2>
                <p className="text-xs text-neutral-600 mt-1">
                  Modelagem Oversized Streetwear desenvolvida para caimento solto e moderno.
                </p>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {dbSizes.map((sz) => (
                  <button
                    key={sz}
                    onClick={() => setSelectedSize(sz)}
                    className={cn(
                      "py-5 rounded-2xl border font-black text-lg transition-all duration-200 cursor-pointer flex flex-col items-center justify-center",
                      selectedSize === sz
                        ? "border-[#eab308] bg-[#eab308] text-black shadow-md scale-105"
                        : "border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-neutral-400"
                    )}
                  >
                    <span>{sz}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowSizeChart(true)}
                className="w-full py-3 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-2xl text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Ruler size={16} className="text-[#d97706]" />
                <span>Ver Guia de Medidas F PAC (Tabela de Tamanhos)</span>
              </button>

              <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-2xl text-xs font-mono text-neutral-800 space-y-1">
                <p className="text-[#d97706] font-bold">💡 Dica de Ajuste:</p>
                <p className="text-[11px] text-neutral-600">
                  Se prefere o caimento Streetwear padrão, escolha seu tamanho habitual. Se deseja um visual ultra amplo e despojado, peça um tamanho acima.
                </p>
              </div>
            </div>
          )}

          {/* PASSO 3: BUSCAR E SELECIONAR ESTAMPAS DO BANCO */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div>
                <span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">
                  PASSO 3 DE 7
                </span>
                <h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">
                  Escolha as Estampas do Catálogo
                </h2>
                <p className="text-xs text-neutral-600 mt-1">
                  Carregamento direto da coleção F PAC. Selecione uma estampa para configurar a posição e tamanho.
                </p>
              </div>

              {/* BARRA DE PESQUISA E FILTROS */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-3.5 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Buscar estampa por nome, tema ou tag..."
                  value={stampSearch}
                  onChange={(e) => setStampSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-[#d97706]"
                />
              </div>

              {/* GRID DE ESTAMPAS */}
              <div className="max-h-[320px] overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 gap-3 custom-scrollbar">
                {loadingStamps ? (
                  <div className="col-span-full py-12 text-center text-neutral-500 text-xs">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[#d97706]" />
                    Carregando catálogo exclusivo de estampas...
                  </div>
                ) : filteredStamps.length === 0 ? (
                  <div className="col-span-full py-12 text-center text-neutral-500 text-xs">
                    Nenhuma estampa encontrada para "{stampSearch}".
                  </div>
                ) : (
                  filteredStamps.map((st) => (
                    <div
                      key={st.id}
                      onClick={() => {
                        setActiveStampForPlacement(st);
                        const allowedForStamp = Array.isArray(st.allowedLocations) && st.allowedLocations.length > 0
                          ? PRINT_POSITIONS.filter(pos => {
                              const allowed = st.allowedLocations!.map(l => l.toLowerCase());
                              const posLabelLower = pos.label.toLowerCase();
                              const posIdLower = pos.id.toLowerCase();
                              return allowed.some(a => posLabelLower.includes(a) || a.includes(posLabelLower) || posIdLower.includes(a) || a.includes(posIdLower));
                            })
                          : PRINT_POSITIONS;
                        const initialPos = allowedForStamp.length > 0 ? allowedForStamp[0] : PRINT_POSITIONS[1];
                        setConfiguringPosition(initialPos);
                        setActiveViewSide(initialPos.viewSide);
                        setRotationAngle(initialPos.viewSide === 'back' ? 180 : 0);
                        setCurrentStep(4);
                      }}
                      className="bg-neutral-50 border border-neutral-200 hover:border-[#d97706] p-2 rounded-2xl group cursor-pointer transition-all duration-200 relative flex flex-col justify-between overflow-hidden"
                    >
                      <div className="aspect-square w-full rounded-xl bg-neutral-100 overflow-hidden relative mb-2">
                        <img
                          src={st.image}
                          alt={st.name}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                        />
                        <button
                          onClick={(e) => toggleFavorite(st.id, e)}
                          className="absolute top-1.5 right-1.5 p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:text-[#eab308]"
                        >
                          <Star size={12} className={cn(favorites.includes(st.id) && "fill-[#eab308] text-[#eab308]")} />
                        </button>
                      </div>

                      <div>
                        <h4 className="text-[11px] font-black uppercase text-neutral-900 truncate group-hover:text-[#d97706]">
                          {st.name}
                        </h4>
                        <span className="text-[9px] text-[#d97706] font-mono font-bold uppercase block mt-0.5">
                          + APLICAR À PEÇA
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* PASSO 4: SELECIONAR POSIÇÃO DA ESTAMPA NA PEÇA */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">
                  PASSO 4 DE 7
                </span>
                <h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">
                  Onde deseja posicionar a estampa?
                </h2>
                {activeStampForPlacement && (
                  <p className="text-xs text-[#d97706] font-bold mt-1">
                    Estampa selecionada: "{activeStampForPlacement.name}"
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                {availablePrintPositions.map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() => {
                      setConfiguringPosition(pos);
                      setActiveViewSide(pos.viewSide);
                      setRotationAngle(pos.viewSide === 'back' ? 180 : 0);
                    }}
                    className={cn(
                      "p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-1",
                      configuringPosition?.id === pos.id
                        ? "border-[#eab308] bg-[#eab308]/15 shadow-sm"
                        : "border-neutral-200 bg-neutral-50 hover:border-neutral-300"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-neutral-900">
                        {pos.label}
                      </span>
                      <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-200 text-neutral-700">
                        {pos.viewSide === 'front' ? 'Frente' : 'Costas'}
                      </span>
                    </div>

                    <p className="text-[10px] text-neutral-600">
                      {pos.description}
                    </p>

                    <div className="flex items-center justify-between mt-1 text-[9px] font-mono text-neutral-500">
                      <span>Max: {pos.maxDimensions}</span>
                      <span>Padrão: {pos.defaultSizeCm}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PASSO 5: ESCOLHER TAMANHO EM CM DA ESTAMPA */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">
                  PASSO 5 DE 7
                </span>
                <h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">
                  Defina o Tamanho da Estampa (cm)
                </h2>
                <p className="text-xs text-neutral-600 mt-1">
                  Tamanhos compatíveis e padronizados para impressão HD de alta fidelidade.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {STAMP_SIZE_OPTIONS.map((szOpt) => (
                  <button
                    key={szOpt.id}
                    onClick={() => setConfiguringSizeCm(szOpt.id)}
                    className={cn(
                      "p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between",
                      configuringSizeCm === szOpt.id
                        ? "border-[#eab308] bg-[#eab308] text-black shadow-md font-black"
                        : "border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-neutral-300"
                    )}
                  >
                    <span className="text-xs uppercase tracking-wider font-mono">
                      {szOpt.label}
                    </span>
                    <span className="text-[10px] opacity-80 mt-1 font-sans">
                      {szOpt.priceExtra > 0 ? `+ R$ ${szOpt.priceExtra.toFixed(2)}` : 'Incluso'}
                    </span>
                  </button>
                ))}
              </div>

              {activeStampForPlacement && configuringPosition && (
                <button
                  onClick={handleConfirmStampPlacement}
                  className="w-full py-3.5 bg-[#eab308] text-black hover:bg-[#f7c600] font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Check size={16} />
                  <span>CONFIRMAR E APLICAR ESTAMPA NA CAMISA</span>
                </button>
              )}
            </div>
          )}

          {/* PASSO 6: PREVIEW EM TEMPO REAL 360° */}
          {currentStep === 6 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">
                  PASSO 6 DE 7
                </span>
                <h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">
                  Preview Final da Peça Criada
                </h2>
                <p className="text-xs text-neutral-600 mt-1">
                  Verifique cada detalhe visual, rotação da peça e harmonia das estampas antes de prosseguir.
                </p>
              </div>

              <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs border-b border-neutral-200 pb-2">
                  <span className="text-neutral-500">Cor Escolhida:</span>
                  <span className="font-bold text-neutral-900 uppercase">{selectedColor.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs border-b border-neutral-200 pb-2">
                  <span className="text-neutral-500">Tamanho:</span>
                  <span className="font-bold text-neutral-900 uppercase">{selectedSize}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Total de Estampas:</span>
                  <span className="font-bold text-[#d97706]">{selectedStamps.length} aplicada(s)</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setActiveViewSide('front'); setRotationAngle(0); }}
                  className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-2xl text-xs font-bold uppercase text-neutral-800 transition-all cursor-pointer"
                >
                  Ver Frente
                </button>
                <button
                  onClick={() => { setActiveViewSide('back'); setRotationAngle(180); }}
                  className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-2xl text-xs font-bold uppercase text-neutral-800 transition-all cursor-pointer"
                >
                  Ver Costas
                </button>
              </div>
            </div>
          )}

          {/* PASSO 7: RESUMO COMPLETO E ADICIONAR AO CARRINHO */}
          {currentStep === 7 && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div>
                <span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">
                  PASSO 7 DE 7
                </span>
                <h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">
                  Resumo e Adicionar à Sacola
                </h2>
                <p className="text-xs text-neutral-600 mt-1">
                  Sua configuração exclusiva está pronta para ser produzida na fábrica.
                </p>
              </div>

              {/* DETALHAMENTO DOS VALORES */}
              <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs text-neutral-700">
                  <span>Camiseta Base Heavyweight ({selectedColor.name}):</span>
                  <span className="font-mono">R$ {BASE_SHIRT_PRICE.toFixed(2).replace('.', ',')}</span>
                </div>

                {selectedStamps.map(st => (
                  <div key={st.id} className="flex items-center justify-between text-xs text-neutral-600 border-t border-neutral-200 pt-2">
                    <span>Estampa "{st.stampName}" ({st.positionLabel} • {st.sizeCm}):</span>
                    <span className="font-mono text-[#d97706] font-bold">
                      {st.priceExtra > 0 ? `+ R$ ${st.priceExtra.toFixed(2)}` : 'Incluso'}
                    </span>
                  </div>
                ))}

                <div className="border-t border-neutral-300 pt-3 flex items-center justify-between text-base font-black">
                  <span className="uppercase text-neutral-900">Valor Total do Item:</span>
                  <span className="text-xl font-mono text-[#d97706]">
                    R$ {totalPrice.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              {/* BOTÃO ADICIONAR AO CARRINHO */}
              <button
                onClick={handleAddToCart}
                className="w-full py-4 bg-[#eab308] hover:bg-[#f7c600] text-black font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl transition-all cursor-pointer flex items-center justify-center gap-3 scale-100 hover:scale-[1.02]"
              >
                <ShoppingBag size={20} />
                <span>ADICIONAR PRIME CUSTOM À SACOLA</span>
              </button>
            </div>
          )}

          {/* BARRA INFERIOR DE CONTROLE DE NAVEGAÇÃO ENTRE PASSOS */}
          <div className="flex items-center justify-between pt-6 border-t border-neutral-200 mt-6">
            <button
              onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
              disabled={currentStep === 1}
              className={cn(
                "px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer",
                currentStep === 1
                  ? "opacity-30 border-neutral-200 text-neutral-400 cursor-not-allowed"
                  : "bg-neutral-100 border-neutral-200 text-neutral-800 hover:bg-neutral-200"
              )}
            >
              <ArrowLeft size={14} />
              <span>Anterior</span>
            </button>

            {currentStep < 7 ? (
              <button
                onClick={() => setCurrentStep(prev => Math.min(7, prev + 1))}
                className="px-6 py-2.5 bg-[#eab308] text-black hover:bg-[#f7c600] rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <span>Próximo Passo</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={handleAddToCart}
                className="px-6 py-2.5 bg-[#eab308] text-black hover:bg-[#f7c600] rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all cursor-pointer"
              >
                <span>Finalizar</span>
                <Check size={14} />
              </button>
            )}
          </div>

        </div>

      </div>

      {/* MODAL GUIA DE MEDIDAS */}
      {showSizeChart && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#121216] border border-white/20 p-6 rounded-3xl max-w-lg w-full relative">
            <button
              onClick={() => setShowSizeChart(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>
            <SizeChart onClose={() => setShowSizeChart(false)} />
          </div>
        </div>
      )}

    </div>
  );
}
