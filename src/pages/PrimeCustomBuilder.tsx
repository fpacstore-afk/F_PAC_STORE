import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Eye,
  Gem,
  ImagePlus,
  Maximize2,
  RefreshCw,
  Ruler,
  Search,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  Truck,
  Upload,
  X,
} from 'lucide-react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useCart } from '../hooks/useCart';
import { Estampa } from '../types/video';
import { cn, getEffectivePrice } from '../lib/utils';
import { getCanvasStampBox } from '../lib/primeMockupGeometry';
import {
  getCompatiblePrintSizes,
  getSafePrintSize,
  getStampPreviewStyle,
  isSizeCompatibleWithPosition,
  parseDimensionsCm,
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
  { id: 'preto', name: 'Preto', hex: '#111111', bgClass: 'bg-[#111111]', textColorClass: 'text-white', previewOverlayHex: '#111111' },
  { id: 'offwhite', name: 'Off White', hex: '#F4F4F0', bgClass: 'bg-[#F4F4F0]', textColorClass: 'text-black', previewOverlayHex: '#F4F4F0' },
  { id: 'marinho', name: 'Azul Marinho', hex: '#1B263B', bgClass: 'bg-[#1B263B]', textColorClass: 'text-white', previewOverlayHex: '#1B263B' },
  { id: 'verde', name: 'Verde Militar', hex: '#2B3D2F', bgClass: 'bg-[#2B3D2F]', textColorClass: 'text-white', previewOverlayHex: '#2B3D2F' },
  { id: 'marrom', name: 'Marrom', hex: '#5A4032', bgClass: 'bg-[#5A4032]', textColorClass: 'text-white', previewOverlayHex: '#5A4032' },
  { id: 'cinza', name: 'Cinza', hex: '#8B8B8B', bgClass: 'bg-[#8B8B8B]', textColorClass: 'text-black', previewOverlayHex: '#8B8B8B' },
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

// PRIME CUSTOM v2: somente duas áreas comerciais de impressão.
// Frente e costas usam a mesma janela física máxima de 30 x 40 cm.
export const PRINT_POSITIONS: PrintPositionOption[] = [
  {
    id: 'peito_central',
    label: 'Frente',
    viewSide: 'front',
    description: 'Área central do peito. A arte permanece limitada ao quadro de 30 x 40 cm.',
    maxDimensions: '30x40 cm',
    defaultSizeCm: '20x30',
    coordinateStyle: {
      top: '49%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      maxWidth: '32%',
      maxHeight: '43%',
    },
  },
  {
    id: 'costas',
    label: 'Costas',
    viewSide: 'back',
    description: 'Área central das costas. A arte permanece limitada ao quadro de 30 x 40 cm.',
    maxDimensions: '30x40 cm',
    defaultSizeCm: '20x30',
    coordinateStyle: {
      top: '49%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      maxWidth: '32%',
      maxHeight: '43%',
    },
  },
];

export const STAMP_SIZE_OPTIONS = [
  { id: '5x5', label: '5 x 5 cm', priceExtra: 0 },
  { id: '8x8', label: '8 x 8 cm', priceExtra: 0 },
  { id: '10x10', label: '10 x 10 cm', priceExtra: 0 },
  { id: '12x15', label: '12 x 15 cm', priceExtra: 8 },
  { id: '15x15', label: '15 x 15 cm', priceExtra: 10 },
  { id: '15x20', label: '15 x 20 cm', priceExtra: 12 },
  { id: '20x20', label: '20 x 20 cm', priceExtra: 15 },
  { id: '20x30', label: '20 x 30 cm', priceExtra: 18 },
  { id: '25x30', label: '25 x 30 cm', priceExtra: 22 },
  { id: '30x30', label: '30 x 30 cm', priceExtra: 25 },
  { id: '30x40', label: '30 x 40 cm', priceExtra: 30 },
];

const STAMP_CATEGORIES = ['Todos', 'Exclusivas', 'Automotivo', 'Militar', 'Esportes', 'Tipografia'];

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

type VisualStamp = {
  image: string;
  name: string;
  sizeCm: string;
} | null;

function shadeHex(hex: string, amount: number) {
  const cleaned = hex.replace('#', '').trim();
  const normalized = cleaned.length === 3
    ? cleaned.split('').map(char => `${char}${char}`).join('')
    : cleaned.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(normalized, 16);
  if (Number.isNaN(num)) return hex;
  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0x00ff) + amount);
  const b = clamp((num & 0x0000ff) + amount);
  return `#${(b | (g << 8) | (r << 16)).toString(16).padStart(6, '0')}`;
}

function formatPrice(value: number) {
  return value.toFixed(2).replace('.', ',');
}

function TShirtVisual({
  side,
  color,
  stamp,
  compact = false,
  showPrintGuide = true,
}: {
  side: 'front' | 'back';
  color: string;
  stamp: VisualStamp;
  compact?: boolean;
  showPrintGuide?: boolean;
}) {
  const zone = { x: 187, y: 177, width: 126, height: 168 };
  const dimensions = parseDimensionsCm(stamp?.sizeCm || '20x30') || [20, 30];
  const artWidth = zone.width * Math.min(dimensions[0] / 30, 1);
  const artHeight = zone.height * Math.min(dimensions[1] / 40, 1);
  const artX = zone.x + (zone.width - artWidth) / 2;
  const artY = zone.y + (zone.height - artHeight) / 2;
  const suffix = `${side}-${color.replace('#', '')}-${compact ? 'mini' : 'main'}`;
  const light = shadeHex(color, 35);
  const mid = shadeHex(color, 10);
  const dark = shadeHex(color, -38);
  const seam = ['#ffffff', '#f4f4f0', '#faf9f6'].includes(color.toLowerCase()) ? '#a3a3a3' : 'rgba(255,255,255,0.15)';

  return (
    <svg viewBox="0 0 500 500" className="w-full h-full" role="img" aria-label={`Mockup ${side === 'front' ? 'frontal' : 'traseiro'} da camiseta PRIME CUSTOM`}>
      <defs>
        <linearGradient id={`shirt-${suffix}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={dark} />
          <stop offset="18%" stopColor={mid} />
          <stop offset="45%" stopColor={light} />
          <stop offset="72%" stopColor={mid} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
        <linearGradient id={`sleeve-left-${suffix}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={dark} />
          <stop offset="100%" stopColor={mid} />
        </linearGradient>
        <linearGradient id={`sleeve-right-${suffix}`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor={dark} />
          <stop offset="100%" stopColor={mid} />
        </linearGradient>
        <filter id={`shadow-${suffix}`} x="-40%" y="-40%" width="180%" height="200%">
          <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#000000" floodOpacity="0.45" />
        </filter>
        <filter id={`cloth-${suffix}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
          <feComponentTransfer in="mono" result="softNoise">
            <feFuncA type="table" tableValues="0 0.07" />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="softNoise" mode="soft-light" />
        </filter>
        <clipPath id={`print-clip-${suffix}`}>
          <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx="2" />
        </clipPath>
      </defs>

      <ellipse cx="250" cy="455" rx={compact ? 128 : 158} ry={compact ? 15 : 20} fill="rgba(0,0,0,0.32)" />

      <g filter={`url(#shadow-${suffix})`}>
        <path
          d="M147 111 C169 101 191 91 211 78 C224 89 238 94 250 94 C262 94 276 89 289 78 C309 91 331 101 353 111 L443 158 C449 162 451 169 447 176 L397 249 C393 255 386 257 380 253 L352 235 L349 435 C349 444 343 450 334 451 L166 451 C157 450 151 444 151 435 L148 235 L120 253 C114 257 107 255 103 249 L53 176 C49 169 51 162 57 158 Z"
          fill={`url(#shirt-${suffix})`}
          stroke={shadeHex(color, -50)}
          strokeWidth="2"
          filter={`url(#cloth-${suffix})`}
        />
        <path d="M147 111 L57 158 C51 162 49 169 53 176 L103 249 C107 255 114 257 120 253 L148 235 Z" fill={`url(#sleeve-left-${suffix})`} opacity="0.92" />
        <path d="M353 111 L443 158 C449 162 451 169 447 176 L397 249 C393 255 386 257 380 253 L352 235 Z" fill={`url(#sleeve-right-${suffix})`} opacity="0.92" />

        {side === 'front' ? (
          <>
            <path d="M211 78 C220 111 234 125 250 125 C266 125 280 111 289 78 C277 87 264 92 250 92 C236 92 223 87 211 78 Z" fill={dark} />
            <path d="M218 83 C226 105 236 113 250 113 C264 113 274 105 282 83" fill="none" stroke={seam} strokeWidth="3" opacity="0.75" />
          </>
        ) : (
          <>
            <path d="M211 78 C225 91 237 96 250 96 C263 96 275 91 289 78 L282 105 C269 111 259 114 250 114 C241 114 231 111 218 105 Z" fill={dark} />
            <path d="M218 84 C230 94 240 98 250 98 C260 98 270 94 282 84" fill="none" stroke={seam} strokeWidth="3" opacity="0.7" />
          </>
        )}

        <path d="M151 421 C197 427 303 427 349 421" fill="none" stroke={seam} strokeWidth="2" opacity="0.6" />
        <path d="M148 232 C130 224 115 213 103 199" fill="none" stroke={seam} strokeWidth="1.6" opacity="0.45" />
        <path d="M352 232 C370 224 385 213 397 199" fill="none" stroke={seam} strokeWidth="1.6" opacity="0.45" />

        <path d="M178 135 C194 190 192 309 180 409" fill="none" stroke={light} strokeWidth="5" opacity="0.08" />
        <path d="M322 135 C306 190 308 309 320 409" fill="none" stroke={dark} strokeWidth="7" opacity="0.15" />
        <path d="M236 128 C228 210 231 327 240 421" fill="none" stroke={dark} strokeWidth="4" opacity="0.09" />
        <path d="M271 130 C280 225 277 331 268 420" fill="none" stroke={light} strokeWidth="4" opacity="0.07" />
      </g>

      {showPrintGuide && (
        <g opacity={stamp ? 0.58 : 0.9}>
          <rect
            x={zone.x}
            y={zone.y}
            width={zone.width}
            height={zone.height}
            fill="rgba(0,0,0,0.08)"
            stroke="#eab308"
            strokeWidth="2.2"
            strokeDasharray="9 7"
            rx="2"
          />
          {!stamp && (
            <>
              <text x="250" y="248" textAnchor="middle" fill="#f7c600" fontSize="14" fontWeight="900">ÁREA DE ESTAMPA</text>
              <text x="250" y="272" textAnchor="middle" fill="white" fontSize="21" fontWeight="900">30 x 40 cm</text>
              <text x="250" y="291" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="9" fontWeight="700">LARGURA x ALTURA</text>
            </>
          )}
        </g>
      )}

      {stamp?.image && (
        <image
          href={stamp.image}
          x={artX}
          y={artY}
          width={artWidth}
          height={artHeight}
          preserveAspectRatio="xMidYMid meet"
          clipPath={`url(#print-clip-${suffix})`}
          style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.28))' }}
        />
      )}
    </svg>
  );
}

export default function PrimeCustomBuilder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addItem } = useCart();
  const [dbColors, setDbColors] = useState<ShirtColorOption[]>(SHIRT_COLORS);
  const [dbSizes, setDbSizes] = useState<string[]>(SHIRT_SIZES);
  const [selectedColor, setSelectedColor] = useState<ShirtColorOption>(SHIRT_COLORS[0]);
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [selectedStamps, setSelectedStamps] = useState<CustomSelectedStamp[]>([]);
  const [stampsCatalog, setStampsCatalog] = useState<Estampa[]>([]);
  const [loadingStamps, setLoadingStamps] = useState<boolean>(true);
  const [stampSearch, setStampSearch] = useState<string>('');
  const [stampCategory, setStampCategory] = useState<string>('Todos');
  const [activeStampForPlacement, setActiveStampForPlacement] = useState<Estampa | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeViewSide, setActiveViewSide] = useState<'front' | 'back'>('front');
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [showSizeChart, setShowSizeChart] = useState<boolean>(false);
  const [configuringPosition, setConfiguringPosition] = useState<PrintPositionOption>(PRINT_POSITIONS[0]);
  const [configuringSizeCm, setConfiguringSizeCm] = useState<string>(PRINT_POSITIONS[0].defaultSizeCm);
  const [isUploadingArtwork, setIsUploadingArtwork] = useState<boolean>(false);
  const [artworkUploadProgress, setArtworkUploadProgress] = useState<number>(0);
  const artworkInputRef = useRef<HTMLInputElement>(null);
  const [baseShirtPrice, setBaseShirtPrice] = useState<number>(119.90);

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const primeDoc = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() as any }))
        .find(p => String(p.slug || '').toLowerCase() === 'prime' || String(p.id || '').toLowerCase() === 'prod_prime_03');

      if (!primeDoc) return;

      const dynPrice = getEffectivePrice(primeDoc) || 119.90;
      setBaseShirtPrice(dynPrice);

      if (Array.isArray(primeDoc.colors) && primeDoc.colors.length > 0) {
        const mappedColors: ShirtColorOption[] = primeDoc.colors.flatMap((rawColor: any) => {
          const colorData = typeof rawColor === 'string' ? { name: rawColor } : rawColor;
          if (!colorData || typeof colorData !== 'object') return [];
          if (colorData.status === 'hidden' || colorData.status === 'inactive' || colorData.available === false) return [];
          const name = String(colorData.name || colorData.label || '').trim();
          if (!name) return [];
          const foundPreset = SHIRT_COLORS.find(sc =>
            sc.name.toLowerCase() === name.toLowerCase() ||
            sc.id.toLowerCase() === name.toLowerCase().replace(/\s+/g, '_'),
          );
          const hex = String(colorData.hex || foundPreset?.hex || '#111111');
          const id = name.toLowerCase().replace(/\s+/g, '_');
          return [{
            id: id || foundPreset?.id || 'cor_custom',
            name,
            hex,
            bgClass: foundPreset?.bgClass || 'bg-neutral-800',
            textColorClass: ['#ffffff', '#faf9f6', '#f4f4f0'].includes(hex.toLowerCase()) ? 'text-black' : 'text-white',
            previewOverlayHex: hex,
          }];
        });

        if (mappedColors.length > 0) {
          setDbColors(mappedColors);
          setSelectedColor(prev =>
            mappedColors.find(mc => mc.hex.toLowerCase() === prev.hex.toLowerCase() || mc.name.toLowerCase() === prev.name.toLowerCase()) || mappedColors[0],
          );
        }
      }

      if (Array.isArray(primeDoc.sizes) && primeDoc.sizes.length > 0) {
        const availableSizes = primeDoc.sizes.flatMap((rawSize: any) => {
          if (typeof rawSize === 'string') return rawSize.trim() ? [rawSize.trim()] : [];
          if (!rawSize || typeof rawSize !== 'object') return [];
          if (rawSize.status === 'hidden' || rawSize.status === 'inactive' || rawSize.available === false) return [];
          const value = String(rawSize.name || rawSize.label || rawSize.id || '').trim();
          return value ? [value] : [];
        });
        if (availableSizes.length > 0) {
          setDbSizes(availableSizes);
          setSelectedSize(prev => availableSizes.includes(prev) ? prev : availableSizes[0]);
        }
      }
    }, (error) => console.error('Error loading PRIME product configs from Gestão:', error));

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setLoadingStamps(true);
    const unsubscribeDesigns = onSnapshot(collection(db, 'designs'), (snapshot) => {
      const docsData: Estampa[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.status === 'archived') return;
        docsData.push({
          id: docSnap.id,
          name: d.name || 'Estampa Exclusiva',
          description: d.description || '',
          image: d.pngUrl || d.mockupUrl || d.image || '',
          category: d.category || 'Exclusivas',
          code: d.code || d.sku || '',
          slotIndex: 0,
          position: '',
          allowedLocations: d.allowedLocations,
          locationConfigs: d.locationConfigs,
        });
      });
      setStampsCatalog(docsData);
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
    if (!paramDesignId && !paramPng) return;

    const defaultPosition = PRINT_POSITIONS[0];
    const matched = paramDesignId ? stampsCatalog.find(st => st.id === paramDesignId) : undefined;
    if (matched) {
      setActiveStampForPlacement(matched);
      setConfiguringPosition(defaultPosition);
      setConfiguringSizeCm(defaultPosition.defaultSizeCm);
      setActiveViewSide('front');
      return;
    }

    if (paramPng) {
      setActiveStampForPlacement({
        id: paramDesignId || 'temp_stamp',
        name: paramName || 'Estampa Selecionada',
        description: 'Estampa importada da galeria',
        image: paramPng,
        category: 'Exclusivas',
        slotIndex: 0,
        position: '',
      });
      setConfiguringPosition(defaultPosition);
      setConfiguringSizeCm(defaultPosition.defaultSizeCm);
      setActiveViewSide('front');
    }
  }, [searchParams, stampsCatalog]);

  const totalPrice = useMemo(
    () => baseShirtPrice + selectedStamps.reduce((acc, curr) => acc + (curr.priceExtra || 0), 0),
    [baseShirtPrice, selectedStamps],
  );

  const availablePrintPositions = useMemo(() => {
    if (!activeStampForPlacement || !Array.isArray(activeStampForPlacement.allowedLocations) || activeStampForPlacement.allowedLocations.length === 0) {
      return PRINT_POSITIONS;
    }
    const allowed = activeStampForPlacement.allowedLocations.map(l => l.toLowerCase());
    return PRINT_POSITIONS.filter(pos => {
      const label = pos.label.toLowerCase();
      const id = pos.id.toLowerCase();
      return allowed.some(a => label.includes(a) || a.includes(label) || id.includes(a) || a.includes(id));
    });
  }, [activeStampForPlacement]);

  const compatibleStampSizeOptions = useMemo(() => {
    const compatibleIds = new Set(getCompatiblePrintSizes(STAMP_SIZE_OPTIONS.map(option => option.id), configuringPosition));
    return STAMP_SIZE_OPTIONS.filter(option => compatibleIds.has(option.id));
  }, [configuringPosition]);

  useEffect(() => {
    setConfiguringSizeCm(current => getSafePrintSize(current, configuringPosition, configuringPosition.defaultSizeCm));
  }, [configuringPosition]);

  const filteredStamps = useMemo(() => {
    const search = stampSearch.trim().toLowerCase();
    return stampsCatalog.filter(st => {
      if (!st.image) return false;
      const category = String(st.category || 'Exclusivas').toLowerCase();
      const categoryMatch = stampCategory === 'Todos' || category.includes(stampCategory.toLowerCase());
      const searchMatch = !search ||
        (st.code || '').toLowerCase().includes(search) ||
        st.name.toLowerCase().includes(search) ||
        Boolean(st.description?.toLowerCase().includes(search));
      return categoryMatch && searchMatch;
    });
  }, [stampsCatalog, stampSearch, stampCategory]);

  const toggleFavorite = (stampId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setFavorites(prev => prev.includes(stampId) ? prev.filter(id => id !== stampId) : [...prev, stampId]);
  };

  const startStampConfiguration = (stamp: Estampa, position: PrintPositionOption = configuringPosition) => {
    const safePosition = availablePrintPositions.find(item => item.id === position.id) || availablePrintPositions[0] || PRINT_POSITIONS[0];
    setActiveStampForPlacement(stamp);
    setConfiguringPosition(safePosition);
    setConfiguringSizeCm(safePosition.defaultSizeCm);
    setActiveViewSide(safePosition.viewSide);
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
        category: 'Arte Própria',
        slotIndex: 0,
        position: '',
      };
      setStampsCatalog(prev => [ownArtwork, ...prev.filter(st => st.id !== ownArtwork.id)]);
      startStampConfiguration(ownArtwork, configuringPosition);
      toast.success('Arte enviada. Ajuste a posição e confirme a aplicação.', { id: loadingToast });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível enviar a arte.';
      toast.error(message, { id: loadingToast });
    } finally {
      setIsUploadingArtwork(false);
      setArtworkUploadProgress(0);
      if (artworkInputRef.current) artworkInputRef.current.value = '';
    }
  };

  const handleConfirmStampPlacement = () => {
    if (!activeStampForPlacement) {
      toast.error('Escolha uma estampa do catálogo ou envie sua arte primeiro.');
      return;
    }

    if (!availablePrintPositions.some(position => position.id === configuringPosition.id)) {
      toast.error('Esta estampa não está liberada para essa área de aplicação.');
      return;
    }

    if (!isSizeCompatibleWithPosition(configuringSizeCm, configuringPosition)) {
      const safeSize = getSafePrintSize(configuringSizeCm, configuringPosition, configuringPosition.defaultSizeCm);
      setConfiguringSizeCm(safeSize);
      toast.error(`O tamanho ${configuringSizeCm} excede a área máxima de 30 x 40 cm.`);
      return;
    }

    const replacingPosition = selectedStamps.some(stamp => stamp.positionId === configuringPosition.id);
    if (!replacingPosition && selectedStamps.length >= 2) {
      toast.error('O PRIME CUSTOM permite uma estampa na frente e uma nas costas.');
      return;
    }

    const sizeOpt = STAMP_SIZE_OPTIONS.find(size => size.id === configuringSizeCm) || STAMP_SIZE_OPTIONS[7];
    const updated = selectedStamps.filter(stamp => stamp.positionId !== configuringPosition.id);
    const placement: CustomSelectedStamp = {
      id: `${activeStampForPlacement.id}_${configuringPosition.id}_${Date.now()}`,
      stampId: activeStampForPlacement.id,
      stampName: activeStampForPlacement.name,
      stampImage: activeStampForPlacement.image || '',
      positionId: configuringPosition.id,
      positionLabel: configuringPosition.label,
      sizeCm: sizeOpt.id,
      priceExtra: sizeOpt.priceExtra,
    };

    setSelectedStamps([...updated, placement]);
    setActiveViewSide(configuringPosition.viewSide);
    toast.success(`Estampa aplicada em ${configuringPosition.label}.`);
    setActiveStampForPlacement(null);
  };

  const handleRemoveStampPlacement = (instanceId: string) => {
    setSelectedStamps(prev => prev.filter(stamp => stamp.id !== instanceId));
    toast.success('Estampa removida.');
  };

  const getVisualStamp = (side: 'front' | 'back'): VisualStamp => {
    if (activeStampForPlacement && configuringPosition.viewSide === side) {
      return {
        image: activeStampForPlacement.image || '',
        name: activeStampForPlacement.name,
        sizeCm: configuringSizeCm,
      };
    }
    const selected = selectedStamps.find(stamp => PRINT_POSITIONS.find(position => position.id === stamp.positionId)?.viewSide === side);
    if (!selected) return null;
    return { image: selected.stampImage, name: selected.stampName, sizeCm: selected.sizeCm };
  };

  const generateShirtMockupDataUrl = async (): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 620;
    const ctx = canvas.getContext('2d');
    if (!ctx) return selectedStamps[0]?.stampImage || '';

    const isLightShirt = ['#ffffff', '#faf9f6', '#f4f4f0'].includes(selectedColor.hex.toLowerCase());
    const background = ctx.createLinearGradient(0, 0, 1000, 620);
    background.addColorStop(0, '#1a1a1a');
    background.addColorStop(1, '#555555');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const panelSize = 430;
    const panelY = 90;
    const panelXs = { front: 40, back: 530 } as const;

    const drawShirt = (offsetX: number, side: 'front' | 'back') => {
      ctx.save();
      ctx.fillStyle = selectedColor.hex;
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 14;
      ctx.beginPath();
      const sx = panelSize / 500;
      const sy = panelSize / 500;
      const px = (x: number) => offsetX + x * sx;
      const py = (y: number) => panelY + y * sy;
      ctx.moveTo(px(147), py(111));
      ctx.quadraticCurveTo(px(190), py(92), px(211), py(78));
      ctx.quadraticCurveTo(px(250), py(110), px(289), py(78));
      ctx.quadraticCurveTo(px(310), py(92), px(353), py(111));
      ctx.lineTo(px(443), py(158));
      ctx.lineTo(px(397), py(249));
      ctx.lineTo(px(352), py(235));
      ctx.lineTo(px(349), py(451));
      ctx.lineTo(px(151), py(451));
      ctx.lineTo(px(148), py(235));
      ctx.lineTo(px(103), py(249));
      ctx.lineTo(px(57), py(158));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = isLightShirt ? '#b5b5b5' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.font = '800 14px sans-serif';
      ctx.fillStyle = '#f7c600';
      ctx.textAlign = 'center';
      ctx.fillText(side === 'front' ? 'FRENTE' : 'COSTAS', offsetX + panelSize / 2, 555);
    };

    drawShirt(panelXs.front, 'front');
    drawShirt(panelXs.back, 'back');

    const loadImage = (src: string): Promise<HTMLImageElement | null> => new Promise(resolve => {
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
      ctx.drawImage(img, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
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
    ctx.font = '900 16px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`F PAC STORE — PRIME CUSTOM • ${selectedColor.name} • ${selectedSize}`, 40, 34);
    ctx.font = '700 12px sans-serif';
    ctx.fillStyle = '#d4d4d4';
    ctx.fillText('Áreas de impressão limitadas a 30 x 40 cm na frente e nas costas.', 40, 55);

    try {
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('Não foi possível exportar o mockup PRIME; usando a estampa principal como fallback.', error);
      return selectedStamps[0]?.stampImage || '';
    }
  };

  const handleAddToCart = async () => {
    if (activeStampForPlacement) {
      toast.error('Você ainda tem uma estampa em edição. Clique em “Aplicar estampa” antes de finalizar.');
      return;
    }
    if (selectedStamps.length === 0) {
      toast.error('Adicione pelo menos uma estampa à camiseta PRIME CUSTOM.');
      return;
    }
    if (selectedStamps.length > 2) {
      toast.error('O PRIME CUSTOM aceita uma estampa na frente e uma nas costas.');
      return;
    }

    const mockupImg = await generateShirtMockupDataUrl();
    const printConfigs = selectedStamps.map(stamp => ({
      id: stamp.id,
      stampId: stamp.stampId,
      stamp: stamp.stampName,
      location: stamp.positionLabel,
      printSize: stamp.sizeCm,
      image: stamp.stampImage,
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

    toast.success('PRIME CUSTOM adicionada à sua sacola.');
    navigate('/bag');
  };

  const activeSideStamp = getVisualStamp(activeViewSide);
  const oppositeSide: 'front' | 'back' = activeViewSide === 'front' ? 'back' : 'front';
  const oppositeSideStamp = getVisualStamp(oppositeSide);

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white pb-32 selection:bg-[#f7c600] selection:text-black">
      <section className="border-b border-white/10 bg-gradient-to-b from-[#171717] to-[#0d0d0e]">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-7 md:py-9">
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-7">
            <div>
              <div className="inline-flex items-center gap-2 text-[9px] md:text-[10px] uppercase tracking-[0.32em] font-black text-[#f7c600] mb-3">
                <Sparkles size={14} /> F PAC STORE • PERSONALIZAÇÃO PREMIUM
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black uppercase italic tracking-[-0.05em] leading-none">
                PRIME <span className="text-[#f7c600]">CUSTOM</span>
              </h1>
              <p className="mt-3 text-[10px] md:text-xs uppercase tracking-[0.32em] font-bold text-white/55">Sua ideia. Nossa qualidade.</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 xl:min-w-[720px]">
              {[
                { icon: Gem, title: 'Malha Premium', text: '240 GSM' },
                { icon: Shirt, title: 'Modelagem Oversized', text: 'Caimento estruturado' },
                { icon: ShieldCheck, title: 'Estampa Premium', text: 'Alta definição' },
                { icon: Sparkles, title: 'Liberdade Criativa', text: 'Do seu jeito' },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex items-center gap-3 border border-white/10 bg-white/[0.035] px-3 py-3">
                  <Icon size={20} className="text-[#f7c600] shrink-0" />
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.16em] font-black">{title}</p>
                    <p className="text-[8px] uppercase tracking-[0.12em] text-white/45 mt-0.5">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1500px] mx-auto grid grid-cols-1 xl:grid-cols-[370px_minmax(0,1fr)] border-x border-white/10">
        <aside className="order-2 xl:order-1 bg-[#111113] border-t xl:border-t-0 xl:border-r border-white/10 px-4 sm:px-5 py-5 md:py-6">
          <div className="space-y-7">
            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-[#f7c600] text-black flex items-center justify-center text-xs font-black">1</span>
                <h2 className="text-xs font-black uppercase tracking-[0.14em]">Escolha a cor</h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {dbColors.map(color => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={cn(
                      'group border p-3 min-h-[90px] text-left transition-all',
                      selectedColor.id === color.id ? 'border-[#f7c600] bg-[#f7c600]/10' : 'border-white/10 bg-white/[0.025] hover:border-white/30',
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <span className="w-9 h-9 rounded-full border-2 border-white/30 shadow-inner" style={{ backgroundColor: color.hex }} />
                      {selectedColor.id === color.id && <span className="w-5 h-5 rounded-full bg-[#f7c600] text-black flex items-center justify-center"><Check size={12} strokeWidth={3} /></span>}
                    </div>
                    <span className="block mt-3 text-[9px] font-black uppercase tracking-wider text-white/90">{color.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="h-px bg-white/10" />

            <section>
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-[#f7c600] text-black flex items-center justify-center text-xs font-black">2</span>
                  <h2 className="text-xs font-black uppercase tracking-[0.14em]">Escolha o tamanho</h2>
                </div>
                <button type="button" onClick={() => setShowSizeChart(true)} className="text-[9px] font-bold text-white/55 hover:text-[#f7c600] underline underline-offset-4 flex items-center gap-1">
                  <Ruler size={12} /> Guia
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {dbSizes.map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={cn(
                      'h-11 border text-[10px] font-black uppercase transition-all',
                      selectedSize === size ? 'bg-[#f7c600] border-[#f7c600] text-black' : 'border-white/15 bg-white/[0.025] hover:border-white/40',
                    )}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </section>

            <div className="h-px bg-white/10" />

            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-[#f7c600] text-black flex items-center justify-center text-xs font-black">3</span>
                <h2 className="text-xs font-black uppercase tracking-[0.14em]">Adicione sua estampa</h2>
              </div>

              <input
                ref={artworkInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={event => void handleArtworkUpload(event.target.files?.[0])}
              />

              <div className="grid grid-cols-2 gap-2 mb-3">
                <button type="button" className="h-11 bg-[#f7c600] text-black text-[10px] font-black uppercase tracking-wider border border-[#f7c600] flex items-center justify-center gap-2">
                  <ImagePlus size={15} /> Do catálogo
                </button>
                <button
                  type="button"
                  disabled={isUploadingArtwork}
                  onClick={() => artworkInputRef.current?.click()}
                  className="h-11 border border-white/15 bg-white/[0.035] text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 hover:border-[#f7c600] disabled:opacity-50"
                >
                  {isUploadingArtwork ? <RefreshCw size={15} className="animate-spin" /> : <Upload size={15} />}
                  {isUploadingArtwork ? `${artworkUploadProgress}%` : 'Enviar arte'}
                </button>
              </div>

              <div className="relative mb-3">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
                <input
                  type="text"
                  value={stampSearch}
                  onChange={event => setStampSearch(event.target.value)}
                  placeholder="Buscar estampas..."
                  className="w-full h-11 pl-9 pr-3 bg-[#0b0b0d] border border-white/10 text-[10px] font-bold placeholder:text-white/25 focus:outline-none focus:border-[#f7c600]"
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none">
                {STAMP_CATEGORIES.map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setStampCategory(category)}
                    className={cn(
                      'shrink-0 px-3 h-8 border text-[8px] font-black uppercase tracking-wider',
                      stampCategory === category ? 'bg-[#f7c600] border-[#f7c600] text-black' : 'border-white/10 bg-white/[0.025] text-white/60 hover:text-white',
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2 max-h-[340px] overflow-y-auto pr-1">
                {loadingStamps ? (
                  <div className="col-span-3 py-10 text-center text-[10px] uppercase tracking-wider text-white/45">
                    <RefreshCw size={22} className="animate-spin mx-auto mb-2 text-[#f7c600]" />
                    Carregando catálogo
                  </div>
                ) : filteredStamps.length === 0 ? (
                  <div className="col-span-3 border border-white/10 bg-white/[0.02] p-5 text-center text-[10px] text-white/45">Nenhuma estampa encontrada nesta seleção.</div>
                ) : filteredStamps.map(stamp => {
                  const selected = activeStampForPlacement?.id === stamp.id;
                  return (
                    <button
                      key={stamp.id}
                      type="button"
                      onClick={() => startStampConfiguration(stamp, configuringPosition)}
                      className={cn(
                        'relative aspect-square border bg-black overflow-hidden group transition-all',
                        selected ? 'border-[#f7c600] ring-1 ring-[#f7c600]' : 'border-white/10 hover:border-white/40',
                      )}
                    >
                      <img src={stamp.image} alt={stamp.name} className="w-full h-full object-contain p-2" />
                      <span className="absolute inset-x-0 bottom-0 bg-black/80 px-1.5 py-1 text-[7px] font-black uppercase truncate">{stamp.code || stamp.name}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={event => toggleFavorite(stamp.id, event)}
                        onKeyDown={() => undefined}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/75 flex items-center justify-center"
                      >
                        <Star size={11} className={cn(favorites.includes(stamp.id) && 'fill-[#f7c600] text-[#f7c600]')} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="h-px bg-white/10" />

            <section>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-[#f7c600] text-black flex items-center justify-center text-xs font-black">4</span>
                <h2 className="text-xs font-black uppercase tracking-[0.14em]">Posicionamento</h2>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {PRINT_POSITIONS.map(position => {
                  const allowed = availablePrintPositions.some(item => item.id === position.id);
                  return (
                    <button
                      key={position.id}
                      type="button"
                      disabled={Boolean(activeStampForPlacement) && !allowed}
                      onClick={() => {
                        setConfiguringPosition(position);
                        setActiveViewSide(position.viewSide);
                      }}
                      className={cn(
                        'h-11 border text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-25',
                        configuringPosition.id === position.id ? 'border-[#f7c600] bg-[#f7c600]/10 text-[#f7c600]' : 'border-white/15 bg-white/[0.025] hover:border-white/35',
                      )}
                    >
                      {position.label}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 p-3 border border-[#f7c600]/30 bg-[#f7c600]/5 flex gap-2.5">
                <ShieldCheck size={17} className="text-[#f7c600] shrink-0 mt-0.5" />
                <p className="text-[9px] leading-relaxed text-white/60">
                  <span className="font-black text-white">Área máxima: 30 cm (L) x 40 cm (A).</span> A arte é centralizada e não pode ultrapassar esse limite na frente ou nas costas.
                </p>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black uppercase tracking-wider text-white/55">Tamanho da estampa</span>
                  <span className="text-[9px] font-black text-[#f7c600]">{configuringSizeCm} cm</span>
                </div>
                <select
                  value={configuringSizeCm}
                  onChange={event => setConfiguringSizeCm(event.target.value)}
                  className="w-full h-11 bg-[#0b0b0d] border border-white/15 px-3 text-[10px] font-bold focus:outline-none focus:border-[#f7c600]"
                >
                  {compatibleStampSizeOptions.map(size => (
                    <option key={size.id} value={size.id}>{size.label}{size.priceExtra > 0 ? ` • + R$ ${formatPrice(size.priceExtra)}` : ' • Incluso'}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleConfirmStampPlacement}
                disabled={!activeStampForPlacement}
                className="w-full mt-4 h-12 bg-[#f7c600] text-black text-[10px] font-black uppercase tracking-[0.16em] flex items-center justify-center gap-2 disabled:opacity-35 disabled:cursor-not-allowed hover:bg-white transition-colors"
              >
                <Check size={16} strokeWidth={3} /> Aplicar estampa
              </button>

              {selectedStamps.length > 0 && (
                <div className="mt-4 space-y-2">
                  {selectedStamps.map(stamp => (
                    <div key={stamp.id} className="flex items-center gap-2 border border-white/10 bg-white/[0.025] p-2">
                      <img src={stamp.stampImage} alt={stamp.stampName} className="w-10 h-10 object-contain bg-black" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-black uppercase truncate">{stamp.stampName}</p>
                        <p className="text-[8px] text-white/45 uppercase">{stamp.positionLabel} • {stamp.sizeCm} cm</p>
                      </div>
                      <button type="button" onClick={() => handleRemoveStampPlacement(stamp.id)} className="w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-500/10">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </aside>

        <main className="order-1 xl:order-2 relative min-h-[620px] md:min-h-[760px] xl:min-h-[920px] overflow-hidden bg-[#2a2927]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_35%,rgba(255,255,255,0.15),transparent_34%),linear-gradient(135deg,#171717_0%,#4b4944_50%,#242321_100%)]" />
          <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />

          <div className="relative z-10 h-full p-4 sm:p-6 md:p-8 lg:p-10 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div className="inline-flex p-1 bg-black/75 border border-white/15 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setActiveViewSide('front');
                    setConfiguringPosition(PRINT_POSITIONS[0]);
                  }}
                  className={cn('h-10 px-7 text-[10px] font-black uppercase tracking-wider transition-all', activeViewSide === 'front' ? 'bg-[#f7c600] text-black' : 'text-white/65')}
                >
                  Frente
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveViewSide('back');
                    setConfiguringPosition(PRINT_POSITIONS[1]);
                  }}
                  className={cn('h-10 px-7 text-[10px] font-black uppercase tracking-wider transition-all', activeViewSide === 'back' ? 'bg-[#f7c600] text-black' : 'text-white/65')}
                >
                  Costas
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsZoomed(prev => !prev)}
                className="self-start sm:self-auto h-10 px-4 bg-black/70 border border-white/15 text-[9px] font-black uppercase tracking-wider flex items-center gap-2 hover:border-[#f7c600]"
              >
                {isZoomed ? <Eye size={15} /> : <Maximize2 size={15} />}
                {isZoomed ? 'Visão normal' : 'Ampliar mockup'}
              </button>
            </div>

            <div className="flex-1 flex items-center justify-center relative min-h-[460px] md:min-h-[600px]">
              <div className={cn('relative w-[76%] max-w-[650px] aspect-square transition-all duration-500', isZoomed && 'scale-[1.12] md:scale-[1.18]')}>
                <TShirtVisual side={activeViewSide} color={selectedColor.hex} stamp={activeSideStamp} />
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-black/80 border border-white/10 px-4 py-2 text-[8px] uppercase tracking-[0.2em] font-black text-white/75 whitespace-nowrap">
                  {activeViewSide === 'front' ? 'Vista frontal' : 'Vista traseira'} • Área 30 x 40 cm
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveViewSide(oppositeSide);
                  setConfiguringPosition(oppositeSide === 'front' ? PRINT_POSITIONS[0] : PRINT_POSITIONS[1]);
                }}
                className="hidden md:block absolute right-[2%] lg:right-[5%] bottom-[13%] w-[25%] max-w-[230px] aspect-square bg-black/20 border border-white/10 backdrop-blur-sm hover:border-[#f7c600]/60 transition-all"
              >
                <TShirtVisual side={oppositeSide} color={selectedColor.hex} stamp={oppositeSideStamp} compact />
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[7px] font-black uppercase tracking-wider text-white/60">Ver {oppositeSide === 'front' ? 'frente' : 'costas'}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-w-3xl mx-auto w-full mt-5">
              <button type="button" onClick={() => setActiveViewSide('front')} className={cn('h-16 border bg-black/50 text-[8px] uppercase font-black', activeViewSide === 'front' ? 'border-[#f7c600] text-[#f7c600]' : 'border-white/10 text-white/55')}>Frente</button>
              <button type="button" onClick={() => setActiveViewSide('back')} className={cn('h-16 border bg-black/50 text-[8px] uppercase font-black', activeViewSide === 'back' ? 'border-[#f7c600] text-[#f7c600]' : 'border-white/10 text-white/55')}>Costas</button>
              <div className="h-16 border border-white/10 bg-black/35 flex flex-col items-center justify-center text-[8px] uppercase font-black text-white/55"><Shirt size={17} className="text-[#f7c600] mb-1" />Oversized</div>
              <div className="hidden sm:flex h-16 border border-white/10 bg-black/35 flex-col items-center justify-center text-[8px] uppercase font-black text-white/55"><Gem size={17} className="text-[#f7c600] mb-1" />240 GSM</div>
              <div className="hidden sm:flex h-16 border border-white/10 bg-black/35 flex-col items-center justify-center text-[8px] uppercase font-black text-white/55"><ShieldCheck size={17} className="text-[#f7c600] mb-1" />30 x 40</div>
            </div>
          </div>
        </main>
      </div>

      <section className="max-w-[1500px] mx-auto border border-white/10 border-t-0 bg-[#0e0e10]">
        <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr_auto] items-stretch">
          <div className="px-6 py-5 border-b lg:border-b-0 lg:border-r border-white/10">
            <p className="text-[8px] uppercase tracking-[0.25em] text-white/45 font-black">PRIME CUSTOM</p>
            <p className="mt-1 text-3xl font-black text-[#f7c600]">R$ {formatPrice(totalPrice)}</p>
            <p className="text-[9px] mt-1 text-white/50">ou 12x de R$ {formatPrice(totalPrice / 12)}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3">
            <div className="px-5 py-5 flex items-center gap-3 border-b sm:border-b-0 sm:border-r border-white/10"><Truck size={22} className="text-[#f7c600]" /><div><p className="text-[9px] font-black uppercase">Produção sob demanda</p><p className="text-[8px] text-white/45 mt-0.5">3 a 7 dias úteis</p></div></div>
            <div className="px-5 py-5 flex items-center gap-3 border-b sm:border-b-0 sm:border-r border-white/10"><ShieldCheck size={22} className="text-[#f7c600]" /><div><p className="text-[9px] font-black uppercase">Compra segura</p><p className="text-[8px] text-white/45 mt-0.5">Seus dados protegidos</p></div></div>
            <div className="px-5 py-5 flex items-center gap-3"><RefreshCw size={22} className="text-[#f7c600]" /><div><p className="text-[9px] font-black uppercase">Troca garantida</p><p className="text-[8px] text-white/45 mt-0.5">Consulte as condições</p></div></div>
          </div>

          <div className="p-4 lg:p-5 flex items-center">
            <button
              type="button"
              onClick={() => void handleAddToCart()}
              className="w-full lg:w-auto min-w-[280px] h-14 px-7 bg-[#f7c600] text-black text-[10px] font-black uppercase tracking-[0.13em] flex items-center justify-center gap-3 hover:bg-white transition-colors"
            >
              <ShoppingBag size={18} /> Finalizar personalização
            </button>
          </div>
        </div>
      </section>

      {showSizeChart && (
        <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4">
          <div className="bg-[#121216] border border-white/15 p-6 max-w-lg w-full relative shadow-2xl">
            <button type="button" onClick={() => setShowSizeChart(false)} className="absolute top-4 right-4 text-white/55 hover:text-white"><X size={20} /></button>
            <SizeChart onClose={() => setShowSizeChart(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
