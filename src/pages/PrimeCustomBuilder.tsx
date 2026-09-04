import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Sparkles, Check, RotateCw, ZoomIn, Eye, ShoppingBag, Upload,
  Search, Trash2, ArrowLeft, ArrowRight, ShieldCheck, 
  Ruler, RefreshCw, X, Star
} from 'lucide-react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useCart } from '../hooks/useCart';
import { Estampa } from '../types/video';
import { cn, getEffectivePrice } from '../lib/utils';
import { getCanvasStampBox } from '../lib/primeMockupGeometry';
import {
  getStampPreviewStyle,
  getCompatiblePrintSizes,
  getSafePrintSize,
  isSizeCompatibleWithPosition,
} from '../lib/primePrintSizing';
import { uploadArtworkToCloudinary } from '../services/cloudinary';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SizeChart } from '../components/SizeChart';

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
  id: string;
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
  const [searchParams] = useSearchParams();
  const { addItem } = useCart();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [dbColors, setDbColors] = useState<ShirtColorOption[]>(SHIRT_COLORS);
  const [dbSizes, setDbSizes] = useState<string[]>(SHIRT_SIZES);
  const [selectedColor, setSelectedColor] = useState<ShirtColorOption>(SHIRT_COLORS[0]);
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [selectedStamps, setSelectedStamps] = useState<CustomSelectedStamp[]>([]);
  const [stampsCatalog, setStampsCatalog] = useState<Estampa[]>([]);
  const [loadingStamps, setLoadingStamps] = useState<boolean>(true);
  const [stampSearch, setStampSearch] = useState<string>('');
  const [activeStampForPlacement, setActiveStampForPlacement] = useState<Estampa | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeViewSide, setActiveViewSide] = useState<'front' | 'back'>('front');
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [showSizeChart, setShowSizeChart] = useState<boolean>(false);
  const [configuringPosition, setConfiguringPosition] = useState<PrintPositionOption | null>(null);
  const [configuringSizeCm, setConfiguringSizeCm] = useState<string>('10x10');
  const [isUploadingArtwork, setIsUploadingArtwork] = useState<boolean>(false);
  const [artworkUploadProgress, setArtworkUploadProgress] = useState<number>(0);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const artworkInputRef = useRef<HTMLInputElement>(null);
  const [baseShirtPrice, setBaseShirtPrice] = useState<number>(119.90);

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const primeDoc = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() as any }))
        .find(p => String(p.slug || '').toLowerCase() === 'prime' || String(p.id || '').toLowerCase() === 'prod_prime_03');

      if (primeDoc) {
        const dynPrice = getEffectivePrice(primeDoc) || 119.90;
        setBaseShirtPrice(dynPrice);
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
                hex,
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
        if (Array.isArray(primeDoc.sizes) && primeDoc.sizes.length > 0) {
          const availableSizes = primeDoc.sizes.filter((sz: any) => typeof sz === 'string' && sz.trim().length > 0);
          if (availableSizes.length > 0) {
            setDbSizes(availableSizes);
            setSelectedSize(prev => availableSizes.includes(prev) ? prev : availableSizes[0]);
          }
        }
      }
    }, (error) => console.error('Error loading PRIME product configs from Gestão:', error));
    return () => unsubscribe();
  }, []);

  const totalPrice = useMemo(() => {
    const extraStampsTotal = selectedStamps.reduce((acc, curr) => acc + (curr.priceExtra || 0), 0);
    return baseShirtPrice + extraStampsTotal;
  }, [baseShirtPrice, selectedStamps]);

  useEffect(() => {
    setLoadingStamps(true);
    const unsubscribeDesigns = onSnapshot(collection(db, 'designs'), (snapshot) => {
      const docsData: Estampa[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.status !== 'archived') {
          docsData.push({
            id: docSnap.id,
            name: d.name || 'Estampa Exclusiva',
            description: d.description || '',
            image: d.pngUrl || d.mockupUrl || d.image || '',
            slotIndex: 0,
            position: '',
            allowedLocations: undefined,
            locationConfigs: undefined,
          });
        }
      });
      setStampsCatalog(prev => {
        const mergedMap = new Map<string, Estampa>();
        docsData.forEach(st => mergedMap.set(st.id, st));
        prev.forEach(st => {
          if (!mergedMap.has(st.id)) mergedMap.set(st.id, st);
        });
        return Array.from(mergedMap.values());
      });
      setLoadingStamps(false);
    }, (error) => {
      console.warn('Erro ao carregar estampas no customizador PRIME:', error);
      setLoadingStamps(false);
    });
    return () => unsubscribeDesigns();
  }, []);

  useEffect(() => {
    const paramDesignId = searchParams.get('design') || searchParams.get('stamp');
    const paramPng = searchParams.get('png');
    const paramName = searchParams.get('name');
    if ((paramDesignId || paramPng) && stampsCatalog.length > 0) {
      const defaultPosition = PRINT_POSITIONS[1];
      const matched = stampsCatalog.find(st => st.id === paramDesignId);
      if (matched) {
        setActiveStampForPlacement(matched);
        setConfiguringPosition(defaultPosition);
        setConfiguringSizeCm(defaultPosition.defaultSizeCm);
        setCurrentStep(2);
      } else if (paramPng) {
        const tempStamp: Estampa = {
          id: paramDesignId || 'temp_stamp',
          name: paramName || 'Estampa Selecionada',
          description: 'Estampa importada da galeria',
          image: paramPng,
          slotIndex: 0,
          position: ''
        };
        setActiveStampForPlacement(tempStamp);
        setConfiguringPosition(defaultPosition);
        setConfiguringSizeCm(defaultPosition.defaultSizeCm);
        setCurrentStep(2);
      }
    }
  }, [searchParams, stampsCatalog]);

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

  const compatibleStampSizeOptions = useMemo(() => {
    if (!configuringPosition) return STAMP_SIZE_OPTIONS;
    const compatibleIds = new Set(getCompatiblePrintSizes(STAMP_SIZE_OPTIONS.map(option => option.id), configuringPosition));
    return STAMP_SIZE_OPTIONS.filter(option => compatibleIds.has(option.id));
  }, [configuringPosition]);

  useEffect(() => {
    if (!configuringPosition) return;
    setConfiguringSizeCm(current => getSafePrintSize(current, configuringPosition, configuringPosition.defaultSizeCm));
  }, [configuringPosition]);

  const filteredStamps = useMemo(() => {
    return stampsCatalog.filter(st => {
      const search = stampSearch.toLowerCase();
      return (st.code || '').toLowerCase().includes(search) ||
        st.name.toLowerCase().includes(search) ||
        Boolean(st.description?.toLowerCase().includes(search));
    });
  }, [stampsCatalog, stampSearch]);

  const toggleFavorite = (stampId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => prev.includes(stampId) ? prev.filter(id => id !== stampId) : [...prev, stampId]);
  };

  const startStampConfiguration = (stamp: Estampa, position = PRINT_POSITIONS[1]) => {
    setActiveStampForPlacement(stamp);
    setConfiguringPosition(position);
    setConfiguringSizeCm(position.defaultSizeCm);
    setActiveViewSide(position.viewSide);
    setRotationAngle(position.viewSide === 'back' ? 180 : 0);
    setCurrentStep(4);
  };

  const handleArtworkUpload = async (file?: File) => {
    if (!file || isUploadingArtwork) return;
    setIsUploadingArtwork(true);
    setArtworkUploadProgress(0);
    const loadingToast = toast.loading('Enviando sua arte com segurança...');
    try {
      const uploaded = await uploadArtworkToCloudinary(file, setArtworkUploadProgress);
      const cleanName = file.name.replace(/\.[^/.]+$/, '').trim() || 'Arte Própria';
      const ownArtwork: Estampa = {
        id: `own_art_${uploaded.public_id || Date.now()}`,
        name: cleanName,
        description: 'Arte própria enviada pelo cliente',
        image: uploaded.secure_url,
        slotIndex: 0,
        position: '',
      };
      setStampsCatalog(prev => [ownArtwork, ...prev.filter(st => st.id !== ownArtwork.id)]);
      startStampConfiguration(ownArtwork);
      toast.success('Arte enviada. Agora escolha onde ela será aplicada.', { id: loadingToast });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível enviar a arte.';
      toast.error(message, { id: loadingToast });
    } finally {
      setIsUploadingArtwork(false);
      setArtworkUploadProgress(0);
      if (artworkInputRef.current) artworkInputRef.current.value = '';
    }
  };

  const canNavigateToStep = (targetStep: number): boolean => {
    if (targetStep <= 3) return true;
    if ((targetStep === 4 || targetStep === 5) && !activeStampForPlacement) {
      toast.error('Selecione uma estampa no Passo 3 antes de configurar posição e dimensão.');
      return false;
    }
    if (targetStep === 5 && !configuringPosition) {
      toast.error('Selecione uma posição válida para a estampa.');
      return false;
    }
    if (targetStep >= 6 && selectedStamps.length === 0) {
      toast.error('Confirme pelo menos uma estampa antes de avançar para o preview.');
      return false;
    }
    return true;
  };

  const goToStep = (targetStep: number) => {
    const boundedStep = Math.max(1, Math.min(7, targetStep));
    if (canNavigateToStep(boundedStep)) setCurrentStep(boundedStep);
  };

  const handleConfirmStampPlacement = () => {
    if (!activeStampForPlacement || !configuringPosition) return;
    if (!isSizeCompatibleWithPosition(configuringSizeCm, configuringPosition)) {
      const safeSize = getSafePrintSize(configuringSizeCm, configuringPosition, configuringPosition.defaultSizeCm);
      setConfiguringSizeCm(safeSize);
      toast.error(`O tamanho ${configuringSizeCm} excede o máximo de ${configuringPosition.maxDimensions} para ${configuringPosition.label}.`);
      return;
    }
    const sizeOpt = STAMP_SIZE_OPTIONS.find(s => s.id === configuringSizeCm) || STAMP_SIZE_OPTIONS[3];
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
    setActiveStampForPlacement(null);
    setConfiguringPosition(null);
  };

  const handleRemoveStampPlacement = (instanceId: string) => {
    setSelectedStamps(prev => prev.filter(s => s.id !== instanceId));
    toast.success('Estampa removida da posição.');
  };

  const generateShirtMockupDataUrl = async (): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 620;
    const ctx = canvas.getContext('2d');
    if (!ctx) return selectedStamps[0]?.stampImage || '';

    const isLightShirt = ['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase());
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const panelSize = 430;
    const panelY = 90;
    const panelXs = { front: 40, back: 530 } as const;

    const drawShirt = (offsetX: number, side: 'front' | 'back') => {
      ctx.save();
      ctx.fillStyle = selectedColor.hex;
      ctx.shadowColor = 'rgba(0,0,0,0.18)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      const sx = panelSize / 500;
      const sy = panelSize / 500;
      const px = (x: number) => offsetX + x * sx;
      const py = (y: number) => panelY + y * sy;
      ctx.moveTo(px(150), py(110));
      ctx.lineTo(px(210), py(80));
      ctx.lineTo(px(290), py(80));
      ctx.lineTo(px(350), py(110));
      ctx.lineTo(px(440), py(160));
      ctx.lineTo(px(390), py(240));
      ctx.lineTo(px(350), py(210));
      ctx.lineTo(px(350), py(440));
      ctx.lineTo(px(150), py(440));
      ctx.lineTo(px(150), py(210));
      ctx.lineTo(px(110), py(240));
      ctx.lineTo(px(60), py(160));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = isLightShirt ? '#cbd5e1' : 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.font = '700 14px sans-serif';
      ctx.fillStyle = '#525252';
      ctx.textAlign = 'center';
      ctx.fillText(side === 'front' ? 'FRENTE' : 'COSTAS', offsetX + panelSize / 2, 555);
    };

    drawShirt(panelXs.front, 'front');
    drawShirt(panelXs.back, 'back');

    const loadImage = (src: string): Promise<HTMLImageElement | null> => new Promise((resolve) => {
      if (!src) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

    const drawImageContain = (img: HTMLImageElement, x: number, y: number, width: number, height: number) => {
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
      const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
      const drawWidth = img.naturalWidth * scale;
      const drawHeight = img.naturalHeight * scale;
      const drawX = x + (width - drawWidth) / 2;
      const drawY = y + (height - drawHeight) / 2;
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    };

    await Promise.all(selectedStamps.map(async (stamp) => {
      const position = PRINT_POSITIONS.find(pos => pos.id === stamp.positionId);
      if (!position) return;
      const style = getStampPreviewStyle(stamp.sizeCm, position);
      const offsetX = panelXs[position.viewSide];
      const box = getCanvasStampBox(style, panelSize, panelSize, offsetX, panelY);
      if (!box) return;
      const img = await loadImage(stamp.stampImage);
      if (!img) return;
      drawImageContain(img, box.x, box.y, box.width, box.height);
    }));

    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    ctx.font = '900 15px sans-serif';
    ctx.fillStyle = '#111827';
    ctx.fillText(`F PAC STORE — PRIME CUSTOM • ${selectedColor.name} • ${selectedSize}`, 40, 35);
    ctx.font = '600 12px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`${selectedStamps.length} estampa(s) aplicada(s)`, 40, 56);

    try {
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('Não foi possível exportar o mockup composto PRIME; usando a estampa principal como fallback.', error);
      return selectedStamps[0]?.stampImage || '';
    }
  };

  const handleAddToCart = async () => {
    if (selectedStamps.length === 0) {
      toast.error('Por favor, adicione pelo menos uma estampa na sua camiseta!');
      setCurrentStep(3);
      return;
    }
    const mockupImg = await generateShirtMockupDataUrl();
    const printConfigs = selectedStamps.map(s => ({
      id: s.id,
      stamp: s.stampName,
      location: s.positionLabel,
      printSize: s.sizeCm,
      image: s.stampImage,
      background: 'Sem Fundo' as const,
    }));
    addItem({
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
      printConfigs,
    });
    toast.success('Camiseta PRIME CUSTOM adicionada à sua sacola!');
    navigate('/bag');
  };

  const currentSideStamps = useMemo(() => {
    return selectedStamps.filter(s => PRINT_POSITIONS.find(p => p.id === s.positionId)?.viewSide === activeViewSide);
  }, [selectedStamps, activeViewSide]);

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-neutral-900 pt-4 pb-20 px-3 md:px-8 font-sans selection:bg-[#eab308] selection:text-black">
      <div className="max-w-7xl mx-auto mb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-[#eab308]/10 border border-[#eab308]/30 px-3 py-1 rounded-full text-[#b45309] text-[10px] md:text-xs font-black uppercase tracking-[0.2em] mb-2">
          <Sparkles size={14} className="animate-spin-slow text-[#d97706]" />
          <span>CONSTRUTOR DE CAMISETAS PREMIUM</span>
        </div>
        <h1 className="text-2xl md:text-5xl font-black uppercase tracking-tight text-neutral-900 mb-2 font-mono">PRIME <span className="text-[#d97706]">CUSTOM</span></h1>
        <p className="text-xs md:text-sm text-neutral-600 max-w-2xl mx-auto font-medium">Monte sua camiseta exclusiva passo a passo. Escolha a cor nobre, tamanho, estampas do catálogo ou envie sua própria arte com visualização em tempo real.</p>
      </div>

      <div className="max-w-5xl mx-auto mb-8 bg-white border border-neutral-200 p-2 md:p-3 rounded-2xl flex items-center justify-between gap-1 overflow-x-auto shadow-md">
        {[
          { num: 1, label: '1. Cor', desc: 'Tecido' },
          { num: 2, label: '2. Tamanho', desc: 'Modelagem' },
          { num: 3, label: '3. Estampas', desc: 'Catálogo/Arte' },
          { num: 4, label: '4. Posicionar', desc: 'Local' },
          { num: 5, label: '5. Dimensões', desc: 'Tamanho cm' },
          { num: 6, label: '6. Preview', desc: 'Visão 360°' },
          { num: 7, label: '7. Resumo', desc: 'Valores' },
        ].map((st) => (
          <button key={st.num} onClick={() => goToStep(st.num)} className={cn(
            'flex-1 min-w-[100px] py-2 px-2 rounded-xl text-center transition-all cursor-pointer border flex flex-col items-center justify-center',
            currentStep === st.num ? 'bg-[#eab308] text-black border-[#eab308] font-black shadow-[0_0_15px_rgba(234,179,8,0.3)] scale-[1.02]' : currentStep > st.num ? 'bg-neutral-900 text-white border-neutral-800 hover:bg-neutral-800 font-bold' : 'bg-neutral-100 text-neutral-600 border-neutral-200 hover:bg-neutral-200 font-medium'
          )}>
            <span className="text-[11px] uppercase tracking-wider font-mono">{st.label}</span>
            <span className="text-[9px] opacity-70 font-sans hidden md:block">{st.desc}</span>
          </button>
        ))}
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-6 bg-white border border-neutral-200 p-4 md:p-6 rounded-3xl relative shadow-xl flex flex-col items-center sticky top-24">
          <div className="w-full flex items-center justify-between mb-4 bg-neutral-100 backdrop-blur-md p-2 rounded-2xl border border-neutral-200 text-xs font-mono">
            <div className="flex gap-1">
              <button onClick={() => { setActiveViewSide('front'); setRotationAngle(0); }} className={cn('px-3 py-1.5 rounded-xl font-black uppercase transition-all cursor-pointer text-[10px]', activeViewSide === 'front' ? 'bg-[#eab308] text-black shadow-md' : 'bg-neutral-200/60 text-neutral-700 hover:bg-neutral-200')}>FRENTE</button>
              <button onClick={() => { setActiveViewSide('back'); setRotationAngle(180); }} className={cn('px-3 py-1.5 rounded-xl font-black uppercase transition-all cursor-pointer text-[10px]', activeViewSide === 'back' ? 'bg-[#eab308] text-black shadow-md' : 'bg-neutral-200/60 text-neutral-700 hover:bg-neutral-200')}>COSTAS</button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { const nextSide = activeViewSide === 'front' ? 'back' : 'front'; setActiveViewSide(nextSide); setRotationAngle(prev => prev === 0 ? 180 : 0); }} className="p-2 bg-neutral-200/60 hover:bg-neutral-200 text-neutral-800 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-[10px] uppercase font-bold" title="Girar Camiseta 360°"><RotateCw size={14} className="text-[#d97706]" /><span className="hidden sm:inline">GIRAR 180°</span></button>
              <button onClick={() => setIsZoomed(!isZoomed)} className="p-2 bg-neutral-200/60 hover:bg-neutral-200 text-neutral-800 rounded-xl transition-all cursor-pointer flex items-center gap-1 text-[10px] uppercase font-bold" title="Alternar Zoom"><ZoomIn size={14} className="text-[#d97706]" /></button>
            </div>
          </div>

          <div ref={previewContainerRef} className="relative w-full aspect-square max-w-[480px] rounded-3xl flex items-center justify-center overflow-hidden transition-all duration-500 border border-neutral-300 bg-gradient-to-b from-neutral-200 via-neutral-100 to-neutral-200 shadow-inner group" style={{ perspective: '1000px' }}>
            <div className={cn('relative w-[85%] h-[85%] transition-transform duration-700 ease-out flex items-center justify-center shadow-2xl rounded-2xl', isZoomed && 'scale-125')} style={{ transform: `rotateY(${rotationAngle}deg)`, transformStyle: 'preserve-3d' }}>
              <svg viewBox="0 0 500 500" className="w-full h-full drop-shadow-[0_15px_30px_rgba(0,0,0,0.25)]">
                <path d="M 150,110 L 210,80 L 290,80 L 350,110 L 440,160 L 390,240 L 350,210 L 350,440 L 150,440 L 150,210 L 110,240 L 60,160 Z" fill={selectedColor.hex} stroke={['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase()) ? '#cbd5e1' : 'rgba(0,0,0,0.2)'} strokeWidth="2.5" />
                {activeViewSide === 'front' ? <path d="M 210,80 C 230,120 270,120 290,80 Z" fill={['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase()) ? '#e2e8f0' : 'rgba(0,0,0,0.35)'} stroke={['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase()) ? '#94a3b8' : 'rgba(255,255,255,0.2)'} strokeWidth="2" /> : <path d="M 210,80 C 230,95 270,95 290,80 Z" fill={['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase()) ? '#e2e8f0' : 'rgba(0,0,0,0.25)'} stroke={['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase()) ? '#94a3b8' : 'rgba(255,255,255,0.2)'} strokeWidth="2" />}
                <line x1="150" y1="110" x2="150" y2="210" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />
                <line x1="350" y1="110" x2="350" y2="210" stroke="rgba(0,0,0,0.2)" strokeWidth="1.5" />
              </svg>
              <div className="absolute inset-0 pointer-events-none" style={{ transform: rotationAngle === 180 ? 'scaleX(-1)' : 'none' }}>
                {currentSideStamps.map((st) => {
                  const posDef = PRINT_POSITIONS.find(p => p.id === st.positionId);
                  if (!posDef) return null;
                  return <div key={st.id} className="absolute flex items-center justify-center p-1 border-2 border-dashed border-[#eab308]/60 bg-black/20 rounded-lg group/stamp transition-all duration-300" style={getStampPreviewStyle(st.sizeCm, posDef)}>
                    <img src={st.stampImage} alt={st.stampName} className="w-full h-full object-contain filter drop-shadow-md" />
                    <span className="absolute -bottom-5 bg-black/80 text-[#eab308] text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-[#eab308]/40 whitespace-nowrap">{st.positionLabel} ({st.sizeCm})</span>
                  </div>;
                })}
              </div>
            </div>
            <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 text-[10px] font-mono font-bold text-[#eab308] uppercase tracking-widest flex items-center gap-1.5"><Eye size={12} /><span>VISÃO: {activeViewSide === 'front' ? 'FRENTE' : 'COSTAS'}</span></div>
          </div>

          <div className="w-full mt-4 bg-neutral-50 p-3 rounded-2xl border border-neutral-200">
            <div className="flex items-center justify-between mb-2"><span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 font-mono">Estampas Aplicadas ({selectedStamps.length})</span><span className="text-xs font-black text-[#d97706] font-mono">R$ {totalPrice.toFixed(2).replace('.', ',')}</span></div>
            {selectedStamps.length === 0 ? <p className="text-[11px] text-neutral-400 italic py-2 text-center font-medium">Nenhuma estampa posicionada ainda. Escolha no Passo 3.</p> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{selectedStamps.map((s) => <div key={s.id} className="flex items-center justify-between bg-white p-2 rounded-xl border border-neutral-200 text-xs"><div className="flex items-center gap-2 overflow-hidden"><img src={s.stampImage} alt={s.stampName} className="w-8 h-8 rounded object-cover bg-neutral-100 border border-neutral-200" /><div className="truncate"><p className="font-bold text-neutral-900 text-[11px] truncate">{s.stampName}</p><p className="text-[9px] text-neutral-500 font-mono">{s.positionLabel} • {s.sizeCm}</p></div></div><button onClick={() => handleRemoveStampPlacement(s.id)} className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors ml-2" title="Remover Estampa"><Trash2 size={14} /></button></div>)}</div>}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-neutral-200 p-5 md:p-8 rounded-3xl shadow-xl flex flex-col justify-between min-h-[580px] text-neutral-900">
          {currentStep === 1 && <div className="space-y-6 animate-in fade-in duration-300"><div><span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">PASSO 1 DE 7</span><h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">Escolha a Cor da Camiseta</h2><p className="text-xs text-neutral-600 mt-1">Malha Heavyweight 240 GSM com toque aveludado e caimento estruturado.</p></div><div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{dbColors.map((col) => <button key={col.id} onClick={() => setSelectedColor(col)} className={cn('p-4 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between h-28 relative overflow-hidden group', selectedColor.id === col.id ? 'border-[#eab308] bg-[#eab308]/10 shadow-[0_0_20px_rgba(234,179,8,0.2)]' : 'border-neutral-200 bg-neutral-50 hover:border-neutral-400')}><div className="flex items-center justify-between w-full"><span className={cn('w-6 h-6 rounded-full border border-black/10 shadow-inner', col.bgClass)} />{selectedColor.id === col.id && <div className="w-5 h-5 bg-[#eab308] text-black rounded-full flex items-center justify-center font-black"><Check size={12} /></div>}</div><div><span className="text-xs font-black uppercase text-neutral-900 block">{col.name}</span><span className="text-[9px] text-neutral-500 font-mono block">100% Algodão Premium</span></div></button>)}</div><div className="bg-neutral-50 border border-neutral-200 p-4 rounded-2xl text-xs space-y-2"><div className="flex items-center gap-2 text-[#d97706] font-bold"><ShieldCheck size={16} /><span>Diferencial F PAC PRIME</span></div><p className="text-neutral-600 text-[11px] leading-relaxed">Tratamento antipilling e costura reforçada de ombro a ombro para máxima durabilidade.</p></div></div>}

          {currentStep === 2 && <div className="space-y-6 animate-in fade-in duration-300"><div><span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">PASSO 2 DE 7</span><h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">Selecione o Tamanho</h2><p className="text-xs text-neutral-600 mt-1">Modelagem Oversized Streetwear desenvolvida para caimento solto e moderno.</p></div><div className="grid grid-cols-5 gap-3">{dbSizes.map((sz) => <button key={sz} onClick={() => setSelectedSize(sz)} className={cn('py-5 rounded-2xl border font-black text-lg transition-all duration-200 cursor-pointer flex flex-col items-center justify-center', selectedSize === sz ? 'border-[#eab308] bg-[#eab308] text-black shadow-md scale-105' : 'border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-neutral-400')}><span>{sz}</span></button>)}</div><button onClick={() => setShowSizeChart(true)} className="w-full py-3 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-2xl text-xs font-bold uppercase tracking-wider text-neutral-800 flex items-center justify-center gap-2 transition-all cursor-pointer"><Ruler size={16} className="text-[#d97706]" /><span>Ver Guia de Medidas F PAC</span></button></div>}

          {currentStep === 3 && <div className="space-y-4 animate-in fade-in duration-300"><div><span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">PASSO 3 DE 7</span><h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">Escolha a Estampa ou Envie sua Arte</h2><p className="text-xs text-neutral-600 mt-1">Use uma arte do catálogo ou envie PNG, JPG/JPEG ou WebP de até 10 MB.</p></div><input ref={artworkInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void handleArtworkUpload(event.target.files?.[0])} /><button type="button" disabled={isUploadingArtwork} onClick={() => artworkInputRef.current?.click()} className={cn('w-full p-4 rounded-2xl border-2 border-dashed flex items-center justify-center gap-3 transition-all text-left', isUploadingArtwork ? 'border-neutral-300 bg-neutral-100 cursor-wait' : 'border-[#eab308] bg-[#eab308]/10 hover:bg-[#eab308]/20 cursor-pointer')}><div className="w-10 h-10 rounded-xl bg-[#eab308] text-black flex items-center justify-center shrink-0">{isUploadingArtwork ? <RefreshCw size={18} className="animate-spin" /> : <Upload size={18} />}</div><div className="flex-1"><p className="text-xs font-black uppercase text-neutral-900">{isUploadingArtwork ? `Enviando arte... ${artworkUploadProgress}%` : 'Usar Minha Arte Própria'}</p><p className="text-[10px] text-neutral-600 mt-0.5">A imagem é enviada para armazenamento persistente; não salvamos o arquivo como base64 na sacola.</p></div></button><div className="relative"><Search size={16} className="absolute left-3.5 top-3.5 text-neutral-400" /><input type="text" placeholder="Buscar estampa do catálogo..." value={stampSearch} onChange={(e) => setStampSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-[#d97706]" /></div><div className="max-h-[280px] overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 gap-3 custom-scrollbar">{loadingStamps ? <div className="col-span-full py-12 text-center text-neutral-500 text-xs"><RefreshCw size={24} className="animate-spin mx-auto mb-2 text-[#d97706]" />Carregando catálogo...</div> : filteredStamps.length === 0 ? <div className="col-span-full py-10 text-center text-neutral-500 text-xs bg-neutral-50 border border-neutral-200 rounded-xl p-4">Nenhuma estampa encontrada. Você ainda pode enviar sua própria arte acima.</div> : filteredStamps.map((st) => <div key={st.id} onClick={() => { const allowedForStamp = Array.isArray(st.allowedLocations) && st.allowedLocations.length > 0 ? PRINT_POSITIONS.filter(pos => { const allowed = st.allowedLocations!.map(l => l.toLowerCase()); const posLabelLower = pos.label.toLowerCase(); const posIdLower = pos.id.toLowerCase(); return allowed.some(a => posLabelLower.includes(a) || a.includes(posLabelLower) || posIdLower.includes(a) || a.includes(posIdLower)); }) : PRINT_POSITIONS; const initialPos = allowedForStamp.length > 0 ? allowedForStamp[0] : PRINT_POSITIONS[1]; startStampConfiguration(st, initialPos); }} className="bg-neutral-50 border border-neutral-200 hover:border-[#d97706] p-2 rounded-2xl group cursor-pointer transition-all duration-200 relative flex flex-col justify-between overflow-hidden"><div className="aspect-square w-full rounded-xl bg-neutral-100 overflow-hidden relative mb-2"><img src={st.image} alt={st.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" /><button onClick={(e) => toggleFavorite(st.id, e)} className="absolute top-1.5 right-1.5 p-1.5 bg-black/60 backdrop-blur-md rounded-full text-white hover:text-[#eab308]"><Star size={12} className={cn(favorites.includes(st.id) && 'fill-[#eab308] text-[#eab308]')} /></button></div><h4 className="text-[11px] font-black uppercase font-mono text-neutral-900 truncate">{st.code ? `SKU: ${st.code}` : st.name}</h4></div>)}</div></div>}

          {currentStep === 4 && <div className="space-y-6 animate-in fade-in duration-300"><div><span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">PASSO 4 DE 7</span><h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">Onde deseja posicionar a estampa?</h2>{activeStampForPlacement && <p className="text-xs text-[#d97706] font-bold mt-1">Estampa selecionada: "{activeStampForPlacement.name}"</p>}</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">{availablePrintPositions.map((pos) => <button key={pos.id} onClick={() => { setConfiguringPosition(pos); setConfiguringSizeCm(pos.defaultSizeCm); setActiveViewSide(pos.viewSide); setRotationAngle(pos.viewSide === 'back' ? 180 : 0); }} className={cn('p-3.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-1', configuringPosition?.id === pos.id ? 'border-[#eab308] bg-[#eab308]/15 shadow-sm' : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300')}><div className="flex items-center justify-between"><span className="text-xs font-black uppercase text-neutral-900">{pos.label}</span><span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-200 text-neutral-700">{pos.viewSide === 'front' ? 'Frente' : 'Costas'}</span></div><p className="text-[10px] text-neutral-600">{pos.description}</p><div className="flex items-center justify-between mt-1 text-[9px] font-mono text-neutral-500"><span>Max: {pos.maxDimensions}</span><span>Padrão: {pos.defaultSizeCm}</span></div></button>)}</div></div>}

          {currentStep === 5 && <div className="space-y-6 animate-in fade-in duration-300"><div><span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">PASSO 5 DE 7</span><h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">Defina o Tamanho da Estampa (cm)</h2><p className="text-xs text-neutral-600 mt-1">Somente tamanhos compatíveis com a posição selecionada são exibidos.</p>{configuringPosition && <p className="text-[10px] text-[#d97706] font-bold mt-2">Limite para {configuringPosition.label}: {configuringPosition.maxDimensions}</p>}</div><div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">{compatibleStampSizeOptions.map((szOpt) => <button key={szOpt.id} onClick={() => setConfiguringSizeCm(szOpt.id)} className={cn('p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex flex-col justify-between', configuringSizeCm === szOpt.id ? 'border-[#eab308] bg-[#eab308] text-black shadow-md font-black' : 'border-neutral-200 bg-neutral-50 text-neutral-800 hover:border-neutral-300')}><span className="text-xs uppercase tracking-wider font-mono">{szOpt.label}</span><span className="text-[10px] opacity-80 mt-1 font-sans">{szOpt.priceExtra > 0 ? `+ R$ ${szOpt.priceExtra.toFixed(2)}` : 'Incluso'}</span></button>)}</div>{activeStampForPlacement && configuringPosition && <button onClick={handleConfirmStampPlacement} className="w-full py-3.5 bg-[#eab308] text-black hover:bg-[#f7c600] font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"><Check size={16} /><span>CONFIRMAR E APLICAR ESTAMPA NA CAMISA</span></button>}</div>}

          {currentStep === 6 && <div className="space-y-6 animate-in fade-in duration-300"><div><span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">PASSO 6 DE 7</span><h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">Preview Final da Peça Criada</h2><p className="text-xs text-neutral-600 mt-1">Verifique cada detalhe visual antes de prosseguir.</p></div><div className="bg-neutral-50 border border-neutral-200 p-4 rounded-2xl space-y-3"><div className="flex items-center justify-between text-xs border-b border-neutral-200 pb-2"><span className="text-neutral-500">Cor Escolhida:</span><span className="font-bold text-neutral-900 uppercase">{selectedColor.name}</span></div><div className="flex items-center justify-between text-xs border-b border-neutral-200 pb-2"><span className="text-neutral-500">Tamanho:</span><span className="font-bold text-neutral-900 uppercase">{selectedSize}</span></div><div className="flex items-center justify-between text-xs"><span className="text-neutral-500">Total de Estampas:</span><span className="font-bold text-[#d97706]">{selectedStamps.length} aplicada(s)</span></div></div><div className="grid grid-cols-2 gap-3"><button onClick={() => { setActiveViewSide('front'); setRotationAngle(0); }} className="py-3 rounded-xl border border-neutral-200 bg-neutral-50 hover:border-[#eab308] text-xs font-black uppercase">Ver Frente</button><button onClick={() => { setActiveViewSide('back'); setRotationAngle(180); }} className="py-3 rounded-xl border border-neutral-200 bg-neutral-50 hover:border-[#eab308] text-xs font-black uppercase">Ver Costas</button></div></div>}

          {currentStep === 7 && <div className="space-y-6 animate-in fade-in duration-300"><div><span className="text-[10px] font-black text-[#d97706] uppercase tracking-[0.2em] font-mono">PASSO 7 DE 7</span><h2 className="text-xl md:text-2xl font-black uppercase text-neutral-900 mt-1">Resumo e Adicionar à Sacola</h2></div><div className="bg-neutral-50 border border-neutral-200 p-4 rounded-2xl space-y-3"><div className="flex items-center justify-between text-xs text-neutral-700"><span>Camiseta Base Heavyweight ({selectedColor.name}):</span><span className="font-mono">R$ {baseShirtPrice.toFixed(2).replace('.', ',')}</span></div>{selectedStamps.map(st => <div key={st.id} className="flex items-center justify-between text-xs text-neutral-600 border-t border-neutral-200 pt-2"><span>Estampa "{st.stampName}" ({st.positionLabel} • {st.sizeCm}):</span><span className="font-mono text-[#d97706] font-bold">{st.priceExtra > 0 ? `+ R$ ${st.priceExtra.toFixed(2)}` : 'Incluso'}</span></div>)}<div className="border-t border-neutral-300 pt-3 flex items-center justify-between text-base font-black"><span className="uppercase text-neutral-900">Valor Total do Item:</span><span className="text-xl font-mono text-[#d97706]">R$ {totalPrice.toFixed(2).replace('.', ',')}</span></div></div><button onClick={handleAddToCart} className="w-full py-4 bg-[#eab308] hover:bg-[#f7c600] text-black font-black text-sm uppercase tracking-widest rounded-2xl shadow-xl transition-all cursor-pointer flex items-center justify-center gap-3"><ShoppingBag size={20} /><span>ADICIONAR PRIME CUSTOM À SACOLA</span></button></div>}

          <div className="flex items-center justify-between pt-6 border-t border-neutral-200 mt-6">
            <button onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))} disabled={currentStep === 1} className={cn('px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer', currentStep === 1 ? 'opacity-30 border-neutral-200 text-neutral-400 cursor-not-allowed' : 'bg-neutral-100 border-neutral-200 text-neutral-800 hover:bg-neutral-200')}><ArrowLeft size={14} /><span>Anterior</span></button>
            {currentStep < 7 ? <button onClick={() => goToStep(currentStep + 1)} className="px-6 py-2.5 bg-[#eab308] text-black hover:bg-[#f7c600] rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all cursor-pointer"><span>Próximo Passo</span><ArrowRight size={14} /></button> : <button onClick={handleAddToCart} className="px-6 py-2.5 bg-[#eab308] text-black hover:bg-[#f7c600] rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all cursor-pointer"><span>Finalizar</span><Check size={14} /></button>}
          </div>
        </div>
      </div>

      {showSizeChart && <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"><div className="bg-[#121216] border border-white/20 p-6 rounded-3xl max-w-lg w-full relative"><button onClick={() => setShowSizeChart(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white"><X size={20} /></button><SizeChart onClose={() => setShowSizeChart(false)} /></div></div>}
    </div>
  );
}
