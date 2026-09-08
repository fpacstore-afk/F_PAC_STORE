import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Eye,
  Gem,
  ImagePlus,
  Link2,
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
import { cn } from '../lib/utils';
import {
  getCompatiblePrintSizes,
  getSafePrintSize,
  isSizeCompatibleWithPosition,
  parseDimensionsCm,
} from '../lib/primePrintSizing';
import {
  uploadArtworkToCloudinary,
  uploadArtworkUrlToCloudinary,
} from '../services/cloudinary';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SizeChart } from '../components/SizeChart';
import {
  ACTIVE_CUSTOMIZATION_PROFILE_ID,
  CUSTOMIZATION_PRODUCT_PROFILES,
  PRIME_CUSTOM_FIXED_PRICE,
  getCustomizationProfileById,
} from '../../shared/customizationProfiles';

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
  id: 'peito_central' | 'costas';
  label: 'Frente' | 'Costas';
  viewSide: 'front' | 'back';
  description: string;
  maxDimensions: string;
  defaultSizeCm: string;
  coordinateStyle: {
    top: string;
    left: string;
    transform: string;
    maxWidth: string;
    maxHeight: string;
  };
}

const CURRENT_PROFILE = CUSTOMIZATION_PRODUCT_PROFILES[ACTIVE_CUSTOMIZATION_PROFILE_ID];

export const PRINT_POSITIONS: PrintPositionOption[] = CURRENT_PROFILE.printAreas.map(area => ({
  id: area.positionId as PrintPositionOption['id'],
  label: area.label as PrintPositionOption['label'],
  viewSide: area.viewSide,
  description: `Área central de ${area.label.toLowerCase()}, limitada a ${area.maxWidthCm} x ${area.maxHeightCm} cm.`,
  maxDimensions: `${area.maxWidthCm}x${area.maxHeightCm} cm`,
  defaultSizeCm: area.defaultSizeCm,
  coordinateStyle: {
    top: '49%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '32%',
    maxHeight: '43%',
  },
}));

export const STAMP_SIZE_OPTIONS = [
  { id: '5x5', label: '5 x 5 cm', priceExtra: 0 },
  { id: '8x8', label: '8 x 8 cm', priceExtra: 0 },
  { id: '10x10', label: '10 x 10 cm', priceExtra: 0 },
  { id: '12x15', label: '12 x 15 cm', priceExtra: 0 },
  { id: '15x15', label: '15 x 15 cm', priceExtra: 0 },
  { id: '15x20', label: '15 x 20 cm', priceExtra: 0 },
  { id: '20x20', label: '20 x 20 cm', priceExtra: 0 },
  { id: '20x30', label: '20 x 30 cm', priceExtra: 0 },
  { id: '25x30', label: '25 x 30 cm', priceExtra: 0 },
  { id: '30x30', label: '30 x 30 cm', priceExtra: 0 },
  { id: '30x40', label: '30 x 40 cm', priceExtra: 0 },
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

type VisualStamp = { image: string; name: string; sizeCm: string } | null;
type ArtworkSourceMode = 'catalog' | 'device' | 'link';

function shadeHex(hex: string, amount: number) {
  const cleaned = hex.replace('#', '').trim();
  const normalized = cleaned.length === 3 ? cleaned.split('').map(char => `${char}${char}`).join('') : cleaned.padEnd(6, '0').slice(0, 6);
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

function TShirtVisual({ side, color, stamp, compact = false }: {
  side: 'front' | 'back';
  color: string;
  stamp: VisualStamp;
  compact?: boolean;
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
  const seam = ['#ffffff', '#f4f4f0', '#faf9f6'].includes(color.toLowerCase()) ? '#a3a3a3' : 'rgba(255,255,255,0.16)';

  return (
    <svg viewBox="0 0 500 500" className="w-full h-full" role="img" aria-label={`Mockup ${side === 'front' ? 'frontal' : 'traseiro'} da peça personalizada`}>
      <defs>
        <linearGradient id={`shirt-${suffix}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={dark} />
          <stop offset="20%" stopColor={mid} />
          <stop offset="48%" stopColor={light} />
          <stop offset="74%" stopColor={mid} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
        <filter id={`shadow-${suffix}`} x="-40%" y="-40%" width="180%" height="200%">
          <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#000" floodOpacity="0.48" />
        </filter>
        <filter id={`cloth-${suffix}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="2" seed="9" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
          <feComponentTransfer in="mono" result="softNoise"><feFuncA type="table" tableValues="0 0.07" /></feComponentTransfer>
          <feBlend in="SourceGraphic" in2="softNoise" mode="soft-light" />
        </filter>
        <clipPath id={`print-${suffix}`}><rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} rx="2" /></clipPath>
      </defs>

      <ellipse cx="250" cy="455" rx={compact ? 125 : 158} ry={compact ? 14 : 20} fill="rgba(0,0,0,0.34)" />
      <g filter={`url(#shadow-${suffix})`}>
        <path
          d="M147 111 C169 101 191 91 211 78 C224 89 238 94 250 94 C262 94 276 89 289 78 C309 91 331 101 353 111 L443 158 C449 162 451 169 447 176 L397 249 C393 255 386 257 380 253 L352 235 L349 435 C349 444 343 450 334 451 L166 451 C157 450 151 444 151 435 L148 235 L120 253 C114 257 107 255 103 249 L53 176 C49 169 51 162 57 158 Z"
          fill={`url(#shirt-${suffix})`}
          stroke={shadeHex(color, -50)}
          strokeWidth="2"
          filter={`url(#cloth-${suffix})`}
        />
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
        <path d="M151 421 C197 427 303 427 349 421" fill="none" stroke={seam} strokeWidth="2" opacity="0.55" />
        <path d="M178 135 C194 190 192 309 180 409" fill="none" stroke={light} strokeWidth="5" opacity="0.08" />
        <path d="M322 135 C306 190 308 309 320 409" fill="none" stroke={dark} strokeWidth="7" opacity="0.15" />
      </g>

      <g opacity={stamp ? 0.58 : 0.95}>
        <rect x={zone.x} y={zone.y} width={zone.width} height={zone.height} fill="rgba(0,0,0,0.08)" stroke="#f7c600" strokeWidth="2.2" strokeDasharray="9 7" rx="2" />
        {!stamp && (
          <>
            <text x="250" y="248" textAnchor="middle" fill="#f7c600" fontSize="14" fontWeight="900">ÁREA DE ESTAMPA</text>
            <text x="250" y="272" textAnchor="middle" fill="white" fontSize="21" fontWeight="900">30 x 40 cm</text>
            <text x="250" y="291" textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize="9" fontWeight="700">LARGURA x ALTURA</text>
          </>
        )}
      </g>

      {stamp?.image && (
        <image href={stamp.image} x={artX} y={artY} width={artWidth} height={artHeight} preserveAspectRatio="xMidYMid meet" clipPath={`url(#print-${suffix})`} style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.28))' }} />
      )}
    </svg>
  );
}

export default function PrimeCustomStudio() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addItem } = useCart();

  const requestedProfile = searchParams.get('produto');
  const profile = getCustomizationProfileById(requestedProfile) || CURRENT_PROFILE;
  const fixedPrice = profile.pricingMode === 'fixed' && profile.fixedPrice ? profile.fixedPrice : PRIME_CUSTOM_FIXED_PRICE;

  const positions = useMemo<PrintPositionOption[]>(() => profile.printAreas.map(area => ({
    id: area.positionId as PrintPositionOption['id'],
    label: area.label as PrintPositionOption['label'],
    viewSide: area.viewSide,
    description: `Área de ${area.label.toLowerCase()} com limite físico aprovado.`,
    maxDimensions: `${area.maxWidthCm}x${area.maxHeightCm} cm`,
    defaultSizeCm: area.defaultSizeCm,
    coordinateStyle: { top: '49%', left: '50%', transform: 'translate(-50%, -50%)', maxWidth: '32%', maxHeight: '43%' },
  })), [profile]);

  const [dbColors, setDbColors] = useState<ShirtColorOption[]>(SHIRT_COLORS);
  const [dbSizes, setDbSizes] = useState<string[]>(SHIRT_SIZES);
  const [selectedColor, setSelectedColor] = useState<ShirtColorOption>(SHIRT_COLORS[0]);
  const [selectedSize, setSelectedSize] = useState<string>('M');
  const [selectedStamps, setSelectedStamps] = useState<CustomSelectedStamp[]>([]);
  const [stampsCatalog, setStampsCatalog] = useState<Estampa[]>([]);
  const [loadingStamps, setLoadingStamps] = useState(true);
  const [stampSearch, setStampSearch] = useState('');
  const [stampCategory, setStampCategory] = useState('Todos');
  const [sourceMode, setSourceMode] = useState<ArtworkSourceMode>('catalog');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [activeStampForPlacement, setActiveStampForPlacement] = useState<Estampa | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [activeViewSide, setActiveViewSide] = useState<'front' | 'back'>('front');
  const [isZoomed, setIsZoomed] = useState(false);
  const [showSizeChart, setShowSizeChart] = useState(false);
  const [configuringPosition, setConfiguringPosition] = useState<PrintPositionOption>(positions[0] || PRINT_POSITIONS[0]);
  const [configuringSizeCm, setConfiguringSizeCm] = useState((positions[0] || PRINT_POSITIONS[0]).defaultSizeCm);
  const [isUploadingArtwork, setIsUploadingArtwork] = useState(false);
  const [artworkUploadProgress, setArtworkUploadProgress] = useState(0);
  const artworkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const first = positions[0];
    if (!first) return;
    setConfiguringPosition(first);
    setConfiguringSizeCm(first.defaultSizeCm);
    setActiveViewSide(first.viewSide);
  }, [profile.id]);

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, snapshot => {
      const productDoc = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() as any }))
        .find(product => String(product.slug || '').toLowerCase() === profile.productSlug.toLowerCase() || String(product.id || '').toLowerCase() === profile.productSlug.toLowerCase());
      if (!productDoc) return;

      if (Array.isArray(productDoc.colors) && productDoc.colors.length > 0) {
        const mappedColors: ShirtColorOption[] = productDoc.colors.flatMap((rawColor: any) => {
          const data = typeof rawColor === 'string' ? { name: rawColor } : rawColor;
          if (!data || typeof data !== 'object' || data.status === 'hidden' || data.status === 'inactive' || data.available === false) return [];
          const name = String(data.name || data.label || '').trim();
          if (!name) return [];
          const preset = SHIRT_COLORS.find(item => item.name.toLowerCase() === name.toLowerCase() || item.id === name.toLowerCase().replace(/\s+/g, '_'));
          const hex = String(data.hex || preset?.hex || '#111111');
          return [{
            id: name.toLowerCase().replace(/\s+/g, '_'),
            name,
            hex,
            bgClass: preset?.bgClass || 'bg-neutral-800',
            textColorClass: ['#ffffff', '#faf9f6', '#f4f4f0'].includes(hex.toLowerCase()) ? 'text-black' : 'text-white',
            previewOverlayHex: hex,
          }];
        });
        if (mappedColors.length > 0) {
          setDbColors(mappedColors);
          setSelectedColor(current => mappedColors.find(item => item.name.toLowerCase() === current.name.toLowerCase()) || mappedColors[0]);
        }
      }

      if (Array.isArray(productDoc.sizes) && productDoc.sizes.length > 0) {
        const sizes = productDoc.sizes.flatMap((rawSize: any) => {
          if (typeof rawSize === 'string') return rawSize.trim() ? [rawSize.trim()] : [];
          if (!rawSize || typeof rawSize !== 'object' || rawSize.status === 'hidden' || rawSize.status === 'inactive' || rawSize.available === false) return [];
          const value = String(rawSize.name || rawSize.label || rawSize.id || '').trim();
          return value ? [value] : [];
        });
        if (sizes.length > 0) {
          setDbSizes(sizes);
          setSelectedSize(current => sizes.includes(current) ? current : sizes[0]);
        }
      }
    }, error => console.error('Erro ao carregar configurações do produto personalizável:', error));

    return () => unsubscribe();
  }, [profile.productSlug]);

  useEffect(() => {
    setLoadingStamps(true);
    const unsubscribe = onSnapshot(collection(db, 'designs'), snapshot => {
      const designs: Estampa[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.status === 'archived') return;
        designs.push({
          id: docSnap.id,
          name: data.name || 'Estampa Exclusiva',
          description: data.description || '',
          image: data.pngUrl || data.mockupUrl || data.image || '',
          category: data.category || 'Exclusivas',
          code: data.code || data.sku || '',
          slotIndex: 0,
          position: '',
          allowedLocations: data.allowedLocations,
          locationConfigs: data.locationConfigs,
        });
      });
      setStampsCatalog(designs);
      setLoadingStamps(false);
    }, error => {
      console.warn('Erro ao carregar estampas:', error);
      setLoadingStamps(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const designId = searchParams.get('design') || searchParams.get('stamp');
    const png = searchParams.get('png');
    const name = searchParams.get('name');
    if (!designId && !png) return;
    const defaultPosition = positions[0] || PRINT_POSITIONS[0];
    const match = designId ? stampsCatalog.find(item => item.id === designId) : undefined;
    if (match) {
      setActiveStampForPlacement(match);
      setConfiguringPosition(defaultPosition);
      setConfiguringSizeCm(defaultPosition.defaultSizeCm);
      return;
    }
    if (png) {
      setActiveStampForPlacement({ id: designId || 'temp_stamp', name: name || 'Estampa Selecionada', description: 'Estampa importada da galeria', image: png, category: 'Exclusivas', slotIndex: 0, position: '' });
      setConfiguringPosition(defaultPosition);
      setConfiguringSizeCm(defaultPosition.defaultSizeCm);
    }
  }, [searchParams, stampsCatalog, positions]);

  const availablePrintPositions = useMemo(() => {
    if (!activeStampForPlacement || !Array.isArray(activeStampForPlacement.allowedLocations) || activeStampForPlacement.allowedLocations.length === 0) return positions;
    const allowed = activeStampForPlacement.allowedLocations.map(value => value.toLowerCase());
    return positions.filter(position => {
      const label = position.label.toLowerCase();
      const id = position.id.toLowerCase();
      return allowed.some(value => label.includes(value) || value.includes(label) || id.includes(value) || value.includes(id));
    });
  }, [activeStampForPlacement, positions]);

  const compatibleStampSizeOptions = useMemo(() => {
    const ids = new Set(getCompatiblePrintSizes(STAMP_SIZE_OPTIONS.map(option => option.id), configuringPosition));
    return STAMP_SIZE_OPTIONS.filter(option => ids.has(option.id));
  }, [configuringPosition]);

  useEffect(() => {
    setConfiguringSizeCm(current => getSafePrintSize(current, configuringPosition, configuringPosition.defaultSizeCm));
  }, [configuringPosition]);

  const filteredStamps = useMemo(() => {
    const search = stampSearch.trim().toLowerCase();
    return stampsCatalog.filter(stamp => {
      if (!stamp.image) return false;
      const category = String(stamp.category || 'Exclusivas').toLowerCase();
      const categoryMatch = stampCategory === 'Todos' || category.includes(stampCategory.toLowerCase());
      const searchMatch = !search || (stamp.code || '').toLowerCase().includes(search) || stamp.name.toLowerCase().includes(search) || Boolean(stamp.description?.toLowerCase().includes(search));
      return categoryMatch && searchMatch;
    });
  }, [stampsCatalog, stampSearch, stampCategory]);

  const startStampConfiguration = (stamp: Estampa, requestedPosition?: PrintPositionOption) => {
    const candidate = requestedPosition || configuringPosition;
    const safePosition = availablePrintPositions.find(item => item.id === candidate.id) || availablePrintPositions[0] || positions[0] || PRINT_POSITIONS[0];
    setActiveStampForPlacement(stamp);
    setConfiguringPosition(safePosition);
    setConfiguringSizeCm(safePosition.defaultSizeCm);
    setActiveViewSide(safePosition.viewSide);
  };

  const registerOwnArtwork = (name: string, secureUrl: string, publicId: string) => {
    const artwork: Estampa = {
      id: `own_art_${publicId || Date.now()}`,
      name: name.trim() || 'Arte Própria',
      description: 'Arte própria enviada pelo cliente',
      image: secureUrl,
      category: 'Arte Própria',
      slotIndex: 0,
      position: '',
    };
    setStampsCatalog(prev => [artwork, ...prev.filter(item => item.id !== artwork.id)]);
    startStampConfiguration(artwork);
  };

  const handleArtworkFile = async (file?: File) => {
    if (!file || isUploadingArtwork) return;
    setIsUploadingArtwork(true);
    setArtworkUploadProgress(0);
    const toastId = toast.loading('Enviando arte do dispositivo...');
    try {
      const uploaded = await uploadArtworkToCloudinary(file, setArtworkUploadProgress);
      registerOwnArtwork(file.name.replace(/\.[^/.]+$/, ''), uploaded.secure_url, uploaded.public_id);
      toast.success('Arte enviada. Agora ajuste e aplique na peça.', { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar a arte.', { id: toastId });
    } finally {
      setIsUploadingArtwork(false);
      setArtworkUploadProgress(0);
      if (artworkInputRef.current) artworkInputRef.current.value = '';
    }
  };

  const handleArtworkLink = async () => {
    if (!artworkUrl.trim() || isUploadingArtwork) return;
    setIsUploadingArtwork(true);
    const toastId = toast.loading('Importando imagem do link...');
    try {
      const uploaded = await uploadArtworkUrlToCloudinary(artworkUrl);
      let linkName = 'Arte por Link';
      try {
        const pathName = new URL(artworkUrl).pathname.split('/').filter(Boolean).pop() || '';
        linkName = decodeURIComponent(pathName).replace(/\.[^/.]+$/, '') || linkName;
      } catch { /* validated by upload service */ }
      registerOwnArtwork(linkName, uploaded.secure_url, uploaded.public_id);
      setArtworkUrl('');
      toast.success('Imagem importada com segurança. Agora ajuste e aplique.', { id: toastId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível importar esse link.', { id: toastId });
    } finally {
      setIsUploadingArtwork(false);
    }
  };

  const handleConfirmStampPlacement = () => {
    if (!activeStampForPlacement) {
      toast.error('Escolha uma estampa, envie do dispositivo ou informe um link.');
      return;
    }
    if (!availablePrintPositions.some(position => position.id === configuringPosition.id)) {
      toast.error('Esta estampa não está liberada para essa área.');
      return;
    }
    if (!isSizeCompatibleWithPosition(configuringSizeCm, configuringPosition)) {
      const safeSize = getSafePrintSize(configuringSizeCm, configuringPosition, configuringPosition.defaultSizeCm);
      setConfiguringSizeCm(safeSize);
      toast.error(`O tamanho excede a área máxima de ${configuringPosition.maxDimensions}.`);
      return;
    }

    const replacing = selectedStamps.some(item => item.positionId === configuringPosition.id);
    if (!replacing && selectedStamps.length >= profile.maxPrints) {
      toast.error(`Este modelo permite no máximo ${profile.maxPrints} áreas de estampa.`);
      return;
    }

    const updated = selectedStamps.filter(item => item.positionId !== configuringPosition.id);
    const placement: CustomSelectedStamp = {
      id: `${activeStampForPlacement.id}_${configuringPosition.id}_${Date.now()}`,
      stampId: activeStampForPlacement.id,
      stampName: activeStampForPlacement.name,
      stampImage: activeStampForPlacement.image || '',
      positionId: configuringPosition.id,
      positionLabel: configuringPosition.label,
      sizeCm: configuringSizeCm,
      priceExtra: 0,
    };
    setSelectedStamps([...updated, placement]);
    setActiveViewSide(configuringPosition.viewSide);
    setActiveStampForPlacement(null);
    toast.success(`Estampa aplicada em ${configuringPosition.label}. O preço continua R$ ${formatPrice(fixedPrice)}.`);
  };

  const handleRemoveStampPlacement = (id: string) => {
    setSelectedStamps(prev => prev.filter(item => item.id !== id));
    toast.success('Estampa removida.');
  };

  const getVisualStamp = (side: 'front' | 'back'): VisualStamp => {
    if (activeStampForPlacement && configuringPosition.viewSide === side) {
      return { image: activeStampForPlacement.image || '', name: activeStampForPlacement.name, sizeCm: configuringSizeCm };
    }
    const selected = selectedStamps.find(item => positions.find(position => position.id === item.positionId)?.viewSide === side);
    return selected ? { image: selected.stampImage, name: selected.stampName, sizeCm: selected.sizeCm } : null;
  };

  const generateMockupDataUrl = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1000;
    canvas.height = 620;
    const ctx = canvas.getContext('2d');
    if (!ctx) return selectedStamps[0]?.stampImage || '';

    const gradient = ctx.createLinearGradient(0, 0, 1000, 620);
    gradient.addColorStop(0, '#141414');
    gradient.addColorStop(1, '#55524d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1000, 620);

    const drawShirt = (offsetX: number, side: 'front' | 'back') => {
      ctx.save();
      ctx.fillStyle = selectedColor.hex;
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetY = 14;
      const s = 0.86;
      const x = (v: number) => offsetX + v * s;
      const y = (v: number) => 70 + v * s;
      ctx.beginPath();
      ctx.moveTo(x(147), y(111));
      ctx.quadraticCurveTo(x(190), y(92), x(211), y(78));
      ctx.quadraticCurveTo(x(250), y(110), x(289), y(78));
      ctx.quadraticCurveTo(x(310), y(92), x(353), y(111));
      ctx.lineTo(x(443), y(158)); ctx.lineTo(x(397), y(249)); ctx.lineTo(x(352), y(235));
      ctx.lineTo(x(349), y(451)); ctx.lineTo(x(151), y(451)); ctx.lineTo(x(148), y(235));
      ctx.lineTo(x(103), y(249)); ctx.lineTo(x(57), y(158)); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#f7c600'; ctx.font = '800 14px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(side === 'front' ? 'FRENTE' : 'COSTAS', offsetX + 215, 555);
    };

    drawShirt(40, 'front');
    drawShirt(530, 'back');

    const loadImage = (src: string): Promise<HTMLImageElement | null> => new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

    for (const stamp of selectedStamps) {
      const position = positions.find(item => item.id === stamp.positionId);
      if (!position) continue;
      const dimensions = parseDimensionsCm(stamp.sizeCm) || [20, 30];
      const zoneWidth = 110;
      const zoneHeight = 146;
      const width = zoneWidth * Math.min(dimensions[0] / 30, 1);
      const height = zoneHeight * Math.min(dimensions[1] / 40, 1);
      const centerX = (position.viewSide === 'front' ? 40 : 530) + 215;
      const centerY = 70 + 250 * 0.86;
      const img = await loadImage(stamp.stampImage);
      if (!img) continue;
      const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
      const drawWidth = img.naturalWidth * scale;
      const drawHeight = img.naturalHeight * scale;
      ctx.drawImage(img, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);
    }

    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '900 16px sans-serif';
    ctx.fillText(`F PAC STORE — ${profile.label} • ${selectedColor.name} • ${selectedSize}`, 40, 34);
    ctx.fillStyle = '#f7c600'; ctx.font = '800 13px sans-serif'; ctx.fillText(`VALOR FIXO R$ ${formatPrice(fixedPrice)}`, 40, 55);

    try { return canvas.toDataURL('image/png'); } catch { return selectedStamps[0]?.stampImage || ''; }
  };

  const handleAddToCart = async () => {
    if (activeStampForPlacement) {
      toast.error('Clique em “Aplicar estampa” antes de finalizar.');
      return;
    }
    if (selectedStamps.length === 0) {
      toast.error('Adicione pelo menos uma estampa à peça.');
      return;
    }
    if (selectedStamps.length > profile.maxPrints) {
      toast.error(`Este modelo aceita no máximo ${profile.maxPrints} estampas.`);
      return;
    }

    const mockup = await generateMockupDataUrl();
    const printConfigs = selectedStamps.map(item => ({
      id: item.id,
      stampId: item.stampId,
      stamp: item.stampName,
      location: item.positionLabel,
      printSize: item.sizeCm,
      image: item.stampImage,
      background: 'Sem Fundo' as const,
    }));

    addItem({
      id: `${profile.cartSlug}_${Date.now()}`,
      slug: profile.cartSlug,
      parentSlug: profile.parentSlug,
      name: `${profile.label} Personalizada (${selectedColor.name})`,
      price: fixedPrice,
      originalPrice: fixedPrice,
      image: mockup || selectedStamps[0]?.stampImage || '',
      size: selectedSize,
      color: selectedColor.name,
      quantity: 1,
      printConfigs,
    });
    toast.success('Personalização adicionada à sacola.');
    navigate('/bag');
  };

  const activeStamp = getVisualStamp(activeViewSide);
  const oppositeSide: 'front' | 'back' = activeViewSide === 'front' ? 'back' : 'front';
  const oppositeStamp = getVisualStamp(oppositeSide);

  return (
    <div className="min-h-screen bg-[#09090b] text-white pb-32 selection:bg-[#f7c600] selection:text-black">
      <section className="border-b border-white/10 bg-gradient-to-b from-[#181818] to-[#0d0d0f]">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-7 md:py-9">
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-7">
            <div>
              <div className="inline-flex items-center gap-2 text-[9px] md:text-[10px] uppercase tracking-[0.3em] font-black text-[#f7c600] mb-3"><Sparkles size={14} /> F PAC STORE • PERSONALIZAÇÃO PREMIUM</div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black uppercase italic tracking-[-0.05em] leading-none">PRIME <span className="text-[#f7c600]">CUSTOM</span></h1>
              <p className="mt-3 text-[10px] md:text-xs uppercase tracking-[0.3em] font-bold text-white/55">Sua ideia. Nossa qualidade.</p>
              <div className="mt-4 inline-flex items-center gap-2 border border-[#f7c600]/30 bg-[#f7c600]/5 px-3 py-2 text-[8px] uppercase tracking-[0.14em] font-black text-white/65">
                <Shirt size={14} className="text-[#f7c600]" /> Modelo atual: {profile.shortLabel} • estrutura pronta para novas peças
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5 xl:min-w-[720px]">
              {[
                { icon: Gem, title: 'Malha Premium', text: '240 GSM' },
                { icon: Shirt, title: 'Modelagem Oversized', text: 'Caimento estruturado' },
                { icon: ShieldCheck, title: 'Área Controlada', text: '30 x 40 cm' },
                { icon: Sparkles, title: 'Preço Fixo', text: `R$ ${formatPrice(fixedPrice)}` },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex items-center gap-3 border border-white/10 bg-white/[0.035] px-3 py-3"><Icon size={20} className="text-[#f7c600] shrink-0" /><div><p className="text-[9px] uppercase tracking-[0.15em] font-black">{title}</p><p className="text-[8px] uppercase tracking-[0.11em] text-white/45 mt-0.5">{text}</p></div></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1500px] mx-auto grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] border-x border-white/10">
        <aside className="order-2 xl:order-1 bg-[#111113] border-t xl:border-t-0 xl:border-r border-white/10 px-4 sm:px-5 py-5 md:py-6">
          <div className="space-y-7">
            <section>
              <div className="flex items-center gap-3 mb-4"><span className="w-7 h-7 rounded-full bg-[#f7c600] text-black flex items-center justify-center text-xs font-black">1</span><h2 className="text-xs font-black uppercase tracking-[0.14em]">Escolha a cor</h2></div>
              <div className="grid grid-cols-3 gap-3">
                {dbColors.map(color => (
                  <button key={color.id} type="button" onClick={() => setSelectedColor(color)} className={cn('border p-3 min-h-[90px] text-left transition-all', selectedColor.id === color.id ? 'border-[#f7c600] bg-[#f7c600]/10' : 'border-white/10 bg-white/[0.025] hover:border-white/30')}>
                    <div className="flex items-start justify-between"><span className="w-9 h-9 rounded-full border-2 border-white/30 shadow-inner" style={{ backgroundColor: color.hex }} />{selectedColor.id === color.id && <span className="w-5 h-5 rounded-full bg-[#f7c600] text-black flex items-center justify-center"><Check size={12} strokeWidth={3} /></span>}</div>
                    <span className="block mt-3 text-[9px] font-black uppercase tracking-wider text-white/90">{color.name}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="h-px bg-white/10" />

            <section>
              <div className="flex items-center justify-between gap-3 mb-4"><div className="flex items-center gap-3"><span className="w-7 h-7 rounded-full bg-[#f7c600] text-black flex items-center justify-center text-xs font-black">2</span><h2 className="text-xs font-black uppercase tracking-[0.14em]">Escolha o tamanho</h2></div><button type="button" onClick={() => setShowSizeChart(true)} className="text-[9px] font-bold text-white/55 hover:text-[#f7c600] underline underline-offset-4 flex items-center gap-1"><Ruler size={12} /> Guia</button></div>
              <div className="grid grid-cols-5 gap-2">{dbSizes.map(size => <button key={size} type="button" onClick={() => setSelectedSize(size)} className={cn('h-11 border text-[10px] font-black uppercase', selectedSize === size ? 'bg-[#f7c600] border-[#f7c600] text-black' : 'border-white/15 bg-white/[0.025] hover:border-white/40')}>{size}</button>)}</div>
            </section>

            <div className="h-px bg-white/10" />

            <section>
              <div className="flex items-center gap-3 mb-4"><span className="w-7 h-7 rounded-full bg-[#f7c600] text-black flex items-center justify-center text-xs font-black">3</span><h2 className="text-xs font-black uppercase tracking-[0.14em]">Adicione sua estampa</h2></div>
              <input ref={artworkInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={event => void handleArtworkFile(event.target.files?.[0])} />

              <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-3 gap-2 mb-3">
                <button type="button" onClick={() => setSourceMode('catalog')} className={cn('h-11 border text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2', sourceMode === 'catalog' ? 'bg-[#f7c600] border-[#f7c600] text-black' : 'border-white/15 bg-white/[0.035]')}><ImagePlus size={14} /> Catálogo</button>
                <button type="button" disabled={isUploadingArtwork} onClick={() => { setSourceMode('device'); artworkInputRef.current?.click(); }} className={cn('h-11 border text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50', sourceMode === 'device' ? 'border-[#f7c600] text-[#f7c600]' : 'border-white/15 bg-white/[0.035]')}><Upload size={14} /> Dispositivo</button>
                <button type="button" onClick={() => setSourceMode('link')} className={cn('h-11 border text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2', sourceMode === 'link' ? 'border-[#f7c600] text-[#f7c600]' : 'border-white/15 bg-white/[0.035]')}><Link2 size={14} /> Por link</button>
              </div>

              {isUploadingArtwork && <div className="mb-3 border border-[#f7c600]/25 bg-[#f7c600]/5 p-3 flex items-center gap-2 text-[9px] uppercase font-black text-[#f7c600]"><RefreshCw size={14} className="animate-spin" /> Processando arte {artworkUploadProgress > 0 ? `${artworkUploadProgress}%` : ''}</div>}

              {sourceMode === 'link' && (
                <div className="mb-3 border border-white/10 bg-black/30 p-3">
                  <label className="text-[8px] uppercase tracking-[0.14em] font-black text-white/55">Link público direto da imagem</label>
                  <div className="mt-2 flex gap-2">
                    <input type="url" value={artworkUrl} onChange={event => setArtworkUrl(event.target.value)} placeholder="https://.../arte.png" className="min-w-0 flex-1 h-10 bg-[#0b0b0d] border border-white/15 px-3 text-[10px] focus:outline-none focus:border-[#f7c600]" />
                    <button type="button" disabled={!artworkUrl.trim() || isUploadingArtwork} onClick={() => void handleArtworkLink()} className="px-4 h-10 bg-[#f7c600] text-black text-[9px] font-black uppercase disabled:opacity-40">Importar</button>
                  </div>
                  <p className="mt-2 text-[8px] leading-relaxed text-white/40">O link é importado para o Cloudinary da F PAC. O pedido não depende do arquivo continuar disponível no site original.</p>
                </div>
              )}

              <div className="relative mb-3"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" /><input type="text" value={stampSearch} onChange={event => setStampSearch(event.target.value)} placeholder="Buscar estampas..." className="w-full h-11 pl-9 pr-3 bg-[#0b0b0d] border border-white/10 text-[10px] font-bold placeholder:text-white/25 focus:outline-none focus:border-[#f7c600]" /></div>
              <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-none">{STAMP_CATEGORIES.map(category => <button key={category} type="button" onClick={() => setStampCategory(category)} className={cn('shrink-0 px-3 h-8 border text-[8px] font-black uppercase tracking-wider', stampCategory === category ? 'bg-[#f7c600] border-[#f7c600] text-black' : 'border-white/10 bg-white/[0.025] text-white/60')}>{category}</button>)}</div>

              <div className="grid grid-cols-3 gap-2 max-h-[340px] overflow-y-auto pr-1">
                {loadingStamps ? <div className="col-span-3 py-10 text-center text-[10px] uppercase tracking-wider text-white/45"><RefreshCw size={22} className="animate-spin mx-auto mb-2 text-[#f7c600]" />Carregando catálogo</div> : filteredStamps.length === 0 ? <div className="col-span-3 border border-white/10 bg-white/[0.02] p-5 text-center text-[10px] text-white/45">Nenhuma estampa encontrada.</div> : filteredStamps.map(stamp => {
                  const selected = activeStampForPlacement?.id === stamp.id;
                  return <button key={stamp.id} type="button" onClick={() => startStampConfiguration(stamp)} className={cn('relative aspect-square border bg-black overflow-hidden transition-all', selected ? 'border-[#f7c600] ring-1 ring-[#f7c600]' : 'border-white/10 hover:border-white/40')}><img src={stamp.image} alt={stamp.name} className="w-full h-full object-contain p-2" /><span className="absolute inset-x-0 bottom-0 bg-black/80 px-1.5 py-1 text-[7px] font-black uppercase truncate">{stamp.code || stamp.name}</span><span role="button" tabIndex={0} onClick={event => { event.stopPropagation(); setFavorites(prev => prev.includes(stamp.id) ? prev.filter(id => id !== stamp.id) : [...prev, stamp.id]); }} onKeyDown={() => undefined} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/75 flex items-center justify-center"><Star size={11} className={cn(favorites.includes(stamp.id) && 'fill-[#f7c600] text-[#f7c600]')} /></span></button>;
                })}
              </div>
            </section>

            <div className="h-px bg-white/10" />

            <section>
              <div className="flex items-center gap-3 mb-4"><span className="w-7 h-7 rounded-full bg-[#f7c600] text-black flex items-center justify-center text-xs font-black">4</span><h2 className="text-xs font-black uppercase tracking-[0.14em]">Posicionamento</h2></div>
              <div className="grid grid-cols-2 gap-2">{positions.map(position => {
                const allowed = availablePrintPositions.some(item => item.id === position.id);
                return <button key={position.id} type="button" disabled={Boolean(activeStampForPlacement) && !allowed} onClick={() => { setConfiguringPosition(position); setActiveViewSide(position.viewSide); }} className={cn('h-11 border text-[10px] font-black uppercase tracking-wider disabled:opacity-25', configuringPosition.id === position.id ? 'border-[#f7c600] bg-[#f7c600]/10 text-[#f7c600]' : 'border-white/15 bg-white/[0.025]')}>{position.label}</button>;
              })}</div>

              <div className="mt-3 p-3 border border-[#f7c600]/30 bg-[#f7c600]/5 flex gap-2.5"><ShieldCheck size={17} className="text-[#f7c600] shrink-0 mt-0.5" /><p className="text-[9px] leading-relaxed text-white/60"><span className="font-black text-white">Área máxima: 30 cm (L) x 40 cm (A).</span> A arte é centralizada e nunca ultrapassa esse quadro.</p></div>

              <div className="mt-4"><div className="flex items-center justify-between mb-2"><span className="text-[9px] font-black uppercase tracking-wider text-white/55">Tamanho da estampa</span><span className="text-[9px] font-black text-[#f7c600]">{configuringSizeCm} cm • sem adicional</span></div><select value={configuringSizeCm} onChange={event => setConfiguringSizeCm(event.target.value)} className="w-full h-11 bg-[#0b0b0d] border border-white/15 px-3 text-[10px] font-bold focus:outline-none focus:border-[#f7c600]">{compatibleStampSizeOptions.map(size => <option key={size.id} value={size.id}>{size.label} • Incluso</option>)}</select></div>

              <button type="button" onClick={handleConfirmStampPlacement} disabled={!activeStampForPlacement} className="w-full mt-4 h-12 bg-[#f7c600] text-black text-[10px] font-black uppercase tracking-[0.16em] flex items-center justify-center gap-2 disabled:opacity-35 hover:bg-white"><Check size={16} strokeWidth={3} /> Aplicar estampa</button>

              {selectedStamps.length > 0 && <div className="mt-4 space-y-2">{selectedStamps.map(stamp => <div key={stamp.id} className="flex items-center gap-2 border border-white/10 bg-white/[0.025] p-2"><img src={stamp.stampImage} alt={stamp.stampName} className="w-10 h-10 object-contain bg-black" /><div className="min-w-0 flex-1"><p className="text-[9px] font-black uppercase truncate">{stamp.stampName}</p><p className="text-[8px] text-white/45 uppercase">{stamp.positionLabel} • {stamp.sizeCm} cm</p></div><button type="button" onClick={() => handleRemoveStampPlacement(stamp.id)} className="w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button></div>)}</div>}
            </section>
          </div>
        </aside>

        <main className="order-1 xl:order-2 relative min-h-[620px] md:min-h-[760px] xl:min-h-[920px] overflow-hidden bg-[#292826]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_48%_35%,rgba(255,255,255,0.15),transparent_34%),linear-gradient(135deg,#171717_0%,#4b4944_50%,#242321_100%)]" />
          <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />

          <div className="relative z-10 h-full p-4 sm:p-6 md:p-8 lg:p-10 flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div className="inline-flex p-1 bg-black/75 border border-white/15 self-start sm:self-auto">{positions.map(position => <button key={position.id} type="button" onClick={() => { setActiveViewSide(position.viewSide); setConfiguringPosition(position); }} className={cn('h-10 px-7 text-[10px] font-black uppercase tracking-wider', activeViewSide === position.viewSide ? 'bg-[#f7c600] text-black' : 'text-white/65')}>{position.label}</button>)}</div>
              <button type="button" onClick={() => setIsZoomed(prev => !prev)} className="self-start sm:self-auto h-10 px-4 bg-black/70 border border-white/15 text-[9px] font-black uppercase tracking-wider flex items-center gap-2 hover:border-[#f7c600]">{isZoomed ? <Eye size={15} /> : <Maximize2 size={15} />}{isZoomed ? 'Visão normal' : 'Ampliar mockup'}</button>
            </div>

            <div className="flex-1 flex items-center justify-center relative min-h-[460px] md:min-h-[600px]">
              <div className={cn('relative w-[76%] max-w-[650px] aspect-square transition-all duration-500', isZoomed && 'scale-[1.12] md:scale-[1.18]')}><TShirtVisual side={activeViewSide} color={selectedColor.hex} stamp={activeStamp} /><div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-black/80 border border-white/10 px-4 py-2 text-[8px] uppercase tracking-[0.2em] font-black text-white/75 whitespace-nowrap">{activeViewSide === 'front' ? 'Vista frontal' : 'Vista traseira'} • Área 30 x 40 cm</div></div>
              <button type="button" onClick={() => { setActiveViewSide(oppositeSide); const p = positions.find(item => item.viewSide === oppositeSide); if (p) setConfiguringPosition(p); }} className="hidden md:block absolute right-[2%] lg:right-[5%] bottom-[13%] w-[25%] max-w-[230px] aspect-square bg-black/20 border border-white/10 backdrop-blur-sm hover:border-[#f7c600]/60"><TShirtVisual side={oppositeSide} color={selectedColor.hex} stamp={oppositeStamp} compact /><span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[7px] font-black uppercase tracking-wider text-white/60">Ver {oppositeSide === 'front' ? 'frente' : 'costas'}</span></button>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-w-3xl mx-auto w-full mt-5"><button type="button" onClick={() => setActiveViewSide('front')} className={cn('h-16 border bg-black/50 text-[8px] uppercase font-black', activeViewSide === 'front' ? 'border-[#f7c600] text-[#f7c600]' : 'border-white/10 text-white/55')}>Frente</button><button type="button" onClick={() => setActiveViewSide('back')} className={cn('h-16 border bg-black/50 text-[8px] uppercase font-black', activeViewSide === 'back' ? 'border-[#f7c600] text-[#f7c600]' : 'border-white/10 text-white/55')}>Costas</button><div className="h-16 border border-white/10 bg-black/35 flex flex-col items-center justify-center text-[8px] uppercase font-black text-white/55"><Shirt size={17} className="text-[#f7c600] mb-1" />{profile.shortLabel}</div><div className="hidden sm:flex h-16 border border-white/10 bg-black/35 flex-col items-center justify-center text-[8px] uppercase font-black text-white/55"><Gem size={17} className="text-[#f7c600] mb-1" />Premium</div><div className="hidden sm:flex h-16 border border-white/10 bg-black/35 flex-col items-center justify-center text-[8px] uppercase font-black text-white/55"><ShieldCheck size={17} className="text-[#f7c600] mb-1" />30 x 40</div></div>
          </div>
        </main>
      </div>

      <section className="max-w-[1500px] mx-auto border border-white/10 border-t-0 bg-[#0e0e10]">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_auto] items-stretch">
          <div className="px-6 py-5 border-b lg:border-b-0 lg:border-r border-white/10"><p className="text-[8px] uppercase tracking-[0.25em] text-white/45 font-black">VALOR FIXO • PRIME CUSTOM</p><p className="mt-1 text-3xl font-black text-[#f7c600]">R$ {formatPrice(fixedPrice)}</p><p className="text-[9px] mt-1 text-white/50">Tamanho da estampa não altera o valor</p></div>
          <div className="grid grid-cols-1 sm:grid-cols-3"><div className="px-5 py-5 flex items-center gap-3 border-b sm:border-b-0 sm:border-r border-white/10"><Truck size={22} className="text-[#f7c600]" /><div><p className="text-[9px] font-black uppercase">Produção sob demanda</p><p className="text-[8px] text-white/45 mt-0.5">Prazo informado no pedido</p></div></div><div className="px-5 py-5 flex items-center gap-3 border-b sm:border-b-0 sm:border-r border-white/10"><ShieldCheck size={22} className="text-[#f7c600]" /><div><p className="text-[9px] font-black uppercase">Compra segura</p><p className="text-[8px] text-white/45 mt-0.5">Arte salva no pedido</p></div></div><div className="px-5 py-5 flex items-center gap-3"><RefreshCw size={22} className="text-[#f7c600]" /><div><p className="text-[9px] font-black uppercase">Editor escalável</p><p className="text-[8px] text-white/45 mt-0.5">Novas peças entram por perfil</p></div></div></div>
          <div className="p-4 lg:p-5 flex items-center"><button type="button" onClick={() => void handleAddToCart()} className="w-full lg:w-auto min-w-[280px] h-14 px-7 bg-[#f7c600] text-black text-[10px] font-black uppercase tracking-[0.13em] flex items-center justify-center gap-3 hover:bg-white"><ShoppingBag size={18} /> Finalizar personalização</button></div>
        </div>
      </section>

      {showSizeChart && <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"><div className="bg-[#121216] border border-white/15 p-6 max-w-lg w-full relative shadow-2xl"><button type="button" onClick={() => setShowSizeChart(false)} className="absolute top-4 right-4 text-white/55 hover:text-white"><X size={20} /></button><SizeChart onClose={() => setShowSizeChart(false)} /></div></div>}
    </div>
  );
}
