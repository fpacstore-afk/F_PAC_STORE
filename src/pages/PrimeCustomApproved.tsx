import { PrimePrintPreview } from '../components/PrimePrintPreview';
import { loadPrimeArtworkBounds } from '../lib/primeArtworkBounds';
import { PRIME_GARMENT_MEASUREMENTS, isMeasuredPrimeModel, getPrimeAreaGeometry, placePrimeArtwork, type ArtworkBounds, type PrimeAreaId, type PrimeArtPosition } from '../../shared/primePlacement';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronRight, ImagePlus, Link2, Maximize2, Ruler,
  Search, ShieldCheck, ShoppingCart, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { db } from '../lib/firebase';
import { useCart } from '../hooks/useCart';
import { calculatePrimePrice } from '../../shared/primePricing';
import { primeBaseOptions } from '../../shared/primeBaseOptions';
import { getPrimeFabricColor } from '../lib/primeMockupColors';
import { uploadArtworkToCloudinary, uploadArtworkUrlToCloudinary } from '../services/cloudinary';
import { SizeChart } from '../components/SizeChart';
import { PRIME_CUSTOM_FIXED_PRICE, getCustomizationProfileById } from '../../shared/customizationProfiles';
import { isDesignPublic, normalizeDesignDocument, sortDesignCatalog } from '../lib/stampCatalog';
import { ProductMockupSprite } from '../components/ProductMockupSprite';
import { PRODUCT_VISUALS, getProductVisualKind, type ProductVisualKind } from '../lib/productPresentation';
import { subscribePublicCatalog } from '../services/publicProducts';
import {
  formatPrimePrintSize,
  isPrimePrintSizeWithin,
  normalizePrimePrintSize,
  normalizeRegisteredPrimePrintSizes,
  parsePrimePrintSize,
} from '../../shared/primeArtworkSizing';

type Artwork = {
  id: string;
  name: string;
  image: string;
  source: Mode;
  code?: string;
  availableSizes?: string[];
};
type Mode = 'catalog' | 'upload' | 'link';
type MockupSide = 'front' | 'back';
type Placement = {
  id: string;
  label: string;
  location: string;
  positionId: string;
  side: MockupSide;
  maxWidth: number;
  maxHeight: number;
  defaultSize: string;
};
type AppliedArtwork = Artwork & { productKey: string; printSize: string; bounds?: ArtworkBounds; position?: PrimeArtPosition; sleeveSide?: 'left' | 'right' };

const PRIME_FALLBACK_PRODUCTS = (Object.keys(PRODUCT_VISUALS) as ProductVisualKind[]).map(kind => ({
  id: `prime-${kind}`,
  slug: kind === 'oversized' ? 'prime' : kind,
  name: PRODUCT_VISUALS[kind].label,
  productType: kind,
  collection: 'prime',
  customizable: true,
  status: 'active',
  price: PRIME_CUSTOM_FIXED_PRICE,
  images: [`/product-visuals/${kind}-front-v1.webp`],

}));
const money = (value: number) => value.toFixed(2).replace('.', ',');
const parseSize = (value: string): [number, number] => {
  const dimensions = parsePrimePrintSize(value);
  return dimensions ? [dimensions[0], dimensions[1]] : [1, 1];
};

function getPlacements(kind: ProductVisualKind): Placement[] {
  const visual = PRODUCT_VISUALS[kind];
  if (kind === 'cap') {
    return [{ id: 'front', label: 'Frente', location: 'Boné Frontal', positionId: 'bone_frontal', side: 'front', maxWidth: 12, maxHeight: 6, defaultSize: '10x5' }];
  }
  if (kind === 'shorts') {
    return [
      { id: 'front', label: 'Frente', location: 'Bermuda Frente', positionId: 'bermuda_frente', side: 'front', maxWidth: 15, maxHeight: 20, defaultSize: '10x12' },
      { id: 'back', label: 'Costas', location: 'Bermuda Costas', positionId: 'bermuda_costas', side: 'back', maxWidth: 15, maxHeight: 20, defaultSize: '10x12' },
    ];
  }
  const bodyPlacements: Placement[] = [
    { id: 'front', label: 'Frente', location: 'Frente', positionId: 'peito_central', side: 'front', maxWidth: visual.frontMax[0], maxHeight: visual.frontMax[1], defaultSize: '20x30' },
    { id: 'back', label: 'Costas', location: 'Costas', positionId: 'costas', side: 'back', maxWidth: visual.backMax[0], maxHeight: visual.backMax[1], defaultSize: '25x30' },
  ];
  if (kind === 'hoodie') return bodyPlacements;
  return [...bodyPlacements,
    { id: 'sleeve', label: 'Manga', location: 'Manga Esquerda', positionId: 'manga_esquerda', side: 'front', maxWidth: 10, maxHeight: 12, defaultSize: '8x8' },
  ];
}

function getOverlayStyle(kind: ProductVisualKind, placement: Placement, printSize: string): React.CSSProperties {
  const [width, height] = parseSize(printSize);
  const widthRatio = Math.min(1, width / placement.maxWidth);
  const baseWidth = kind === 'cap' ? 30 : kind === 'shorts' ? 24 : placement.id === 'sleeve' ? 13 : 34;
  return {
    left: placement.id === 'sleeve' ? '24%' : kind === 'shorts' ? '42%' : '50%',
    top: kind === 'cap' ? '48%' : kind === 'shorts' ? '59%' : placement.id === 'sleeve' ? '42%' : kind === 'cropped' ? '51%' : '49%',
    width: `${Math.max(baseWidth * widthRatio, 7)}%`,
    aspectRatio: `${width} / ${height}`,
    transform: 'translate(-50%, -50%)',
  };
}

export default function PrimeCustomApproved() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addItem } = useCart();
  const [availability, setAvailability] = useState<Record<string, any>>({});
  const [sleeveSide, setSleeveSide] = useState<'left' | 'right'>('left');
  const [sleeveSetup, setSleeveSetup] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalog, setCatalog] = useState<Artwork[]>([]);
  const [artCatalogLoaded, setArtCatalogLoaded] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [productId, setProductId] = useState('');
  const [placementId, setPlacementId] = useState('front');
  const [selectedArtwork, setSelectedArtwork] = useState<Artwork | null>(null);
  const [applied, setApplied] = useState<Record<string, AppliedArtwork>>({});
  const [draftPrintSizes, setDraftPrintSizes] = useState<Record<string, string>>({});
  const [manualDimensions, setManualDimensions] = useState<Record<string, { width: string; height: string }>>({});
  const [color, setColor] = useState('Preto');
  const [size, setSize] = useState('M');
  const [mode, setMode] = useState<Mode>('catalog');
  const [search, setSearch] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSizes, setShowSizes] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const applicationContext = useRef('');

  useEffect(() => onSnapshot(
    collection(db, 'designs'),
    snapshot => {
      const designs = sortDesignCatalog(snapshot.docs.map(item => normalizeDesignDocument(item.id, item.data())))
        .filter(item => isDesignPublic(item) && item.availableForCustomization && item.pngUrl);
      setCatalog(designs.map(item => ({
        id: item.id,
        name: item.name,
        code: item.code,
        image: item.pngUrl,
        source: 'catalog' as const,
        availableSizes: normalizeRegisteredPrimePrintSizes(item.availableSizes),
      })));
      setArtCatalogLoaded(true);
    },
    () => { setCatalog([]); setArtCatalogLoaded(true); },
  ), []);

  useEffect(() => subscribePublicCatalog(
    snapshot => {
      setProducts(snapshot.primeBases);
      setAvailability(snapshot.availability);
      setCatalogLoading(false); setCatalogError('');
    },
    () => { setCatalogLoading(false); setCatalogError('Não foi possível confirmar as peças lisas agora. Tente novamente em instantes.'); },
  ), []);

  const productOptions = PRIME_FALLBACK_PRODUCTS;

  useEffect(() => {
    if (productOptions.length === 0) return;
    setProductId(current => {
      if (productOptions.some(product => (product.id || product.slug) === current)) return current;
      const requested = searchParams.get('product');
      const direct = productOptions.find(product => product.id === requested || product.slug === requested);
      if (direct) return direct.id || direct.slug;
      const requestedProduct = products.find(product => product.id === requested || product.slug === requested);
      const sameKind = requestedProduct && productOptions.find(product => getProductVisualKind(product) === getProductVisualKind(requestedProduct));
      return sameKind?.id || sameKind?.slug || productOptions[0]?.id || productOptions[0]?.slug || '';
    });
  }, [productOptions, products, searchParams]);

  const selectedProduct = productOptions.find(product => (product.id || product.slug) === productId) || productOptions[0];
  const visualKind = getProductVisualKind(selectedProduct);
  const matchingBases = useMemo(() => products.filter(product => getProductVisualKind(product) === visualKind), [products, visualKind]);
  const baseOptions = useMemo(() => primeBaseOptions(matchingBases, availability), [matchingBases, availability]);
  const selectedBase = baseOptions.combinations.find(item => item.color.name === color && item.size === size)?.base;
  const isRegisteredProduct = matchingBases.length > 0;
  const canPurchase = Boolean(selectedBase && !catalogLoading && !catalogError);
  const visual = PRODUCT_VISUALS[visualKind];
  const profile = getCustomizationProfileById(visualKind) || getCustomizationProfileById('oversized')!;
  const placements = useMemo(() => getPlacements(visualKind), [visualKind]);
  const activePlacement = placements.find(item => item.id === placementId) || placements[0];
  const candidateApplied = applied[activePlacement?.id];
  const activeApplied = candidateApplied?.productKey === productId ? candidateApplied : undefined;
  const registeredCatalogSizes = useMemo(() => {
    if (selectedArtwork?.source !== 'catalog') return [];
    if (activePlacement.id === 'sleeve') return ['2x3'];
    return normalizeRegisteredPrimePrintSizes(selectedArtwork.availableSizes)
      .filter(value => isPrimePrintSizeWithin(value, activePlacement.maxWidth, activePlacement.maxHeight));
  }, [activePlacement.id, activePlacement.maxHeight, activePlacement.maxWidth, selectedArtwork]);
  const draftPrintSize = draftPrintSizes[activePlacement?.id] || '';
  const manualDimension = manualDimensions[activePlacement?.id] || { width: '', height: '' };
  const selectedPrintSize = selectedArtwork?.source === 'catalog'
    ? (draftPrintSize && registeredCatalogSizes.includes(draftPrintSize) ? draftPrintSize : registeredCatalogSizes[0] || '')
    : draftPrintSize;
  const previewPrintSize = activeApplied?.printSize || selectedPrintSize || activePlacement?.defaultSize || '10x10';
  applicationContext.current = `${productId}:${activePlacement.id}:${selectedArtwork?.id}:${selectedPrintSize}`;
  const canApplyArtwork = Boolean(selectedArtwork && selectedPrintSize && (
    selectedArtwork.source === 'catalog'
      ? registeredCatalogSizes.includes(selectedPrintSize)
      : isPrimePrintSizeWithin(selectedPrintSize, activePlacement.maxWidth, activePlacement.maxHeight)
  ));
  const colors = baseOptions.colors;
  const sizes = [...new Set(baseOptions.combinations.filter(item => item.color.name === color).map(item => item.size))];
  const selectedColor = colors.find((item: any) => item?.name === color);
  const mockupTone = selectedColor ? getPrimeFabricColor(selectedColor.name, selectedColor.hex) : '#1C1919';
  const pricePrints = placements.flatMap(placement => {
    const art = applied[placement.id];
    return art?.productKey === productId ? [{ stampId: art.id, source: art.source, printSize: art.printSize, location: placement.id === 'sleeve' && art.sleeveSide === 'right' ? 'Manga Direita' : placement.location }] : [];
  });
  const priceBreakdown = calculatePrimePrice(visualKind, pricePrints);
  const price = priceBreakdown.total;
  const pixPrice = price * 0.95;
  const appliedCount = Object.keys(applied).length;

  useEffect(() => {
    setPlacementId('front');
    setApplied({});
    setDraftPrintSizes({});
    setManualDimensions({});
    setSelectedArtwork(null);
    setSleeveSide('left');
    setSleeveSetup(visualKind === 'oversized' ? 'loading' : 'ready');
  }, [selectedProduct?.id, selectedProduct?.slug]);

  useEffect(() => {
    const nextColor = baseOptions.colors.some(item => item.name === color) ? color : baseOptions.colors[0]?.name || '';
    const availableSizes = baseOptions.combinations.filter(item => item.color.name === nextColor).map(item => item.size);
    if (color !== nextColor) setColor(nextColor);
    if (!availableSizes.includes(size)) setSize(availableSizes[0] || '');
  }, [baseOptions, color, size]);

  const defaultSleeveArt = catalog.find(art => /^1[.\s-]*logo$/i.test(art.name.trim()));
  const restoreSleeve = async () => {
    if (!defaultSleeveArt) return;
    setSleeveSetup('loading');
    try {
      const bounds = await loadPrimeArtworkBounds(defaultSleeveArt.image, defaultSleeveArt.id);
      if (!applicationContext.current.startsWith(`${productId}:`)) return;
      setApplied(current => ({ ...current, sleeve: { ...defaultSleeveArt, productKey: productId, printSize: '2x3', bounds, sleeveSide: 'left' } }));
      setSleeveSide('left'); setSleeveSetup('ready');
    } catch { setSleeveSetup('error'); toast.error('Não foi possível carregar a estampa de manga incluída. Tente novamente.'); }
  };
  useEffect(() => {
    if (visualKind !== 'oversized' || !productId) return;
    if (!defaultSleeveArt) { if (artCatalogLoaded) setSleeveSetup('error'); return; }
    let cancelled = false;
    setSleeveSetup('loading');
    void loadPrimeArtworkBounds(defaultSleeveArt.image, defaultSleeveArt.id).then(bounds => {
      if (cancelled) return;
      setApplied(current => ({ ...current, sleeve: { ...defaultSleeveArt, productKey: productId, printSize: '2x3', bounds, sleeveSide: 'left' } }));
      setSleeveSetup('ready');
    }).catch(() => { if (!cancelled) setSleeveSetup('error'); });
    return () => { cancelled = true; };
  }, [productId, visualKind, defaultSleeveArt?.id, defaultSleeveArt?.image, artCatalogLoaded]);

  useEffect(() => {
    const requestedDesign = searchParams.get('design');
    if (!requestedDesign || selectedArtwork) return;
    const design = catalog.find(item => item.id === requestedDesign);
    const image = design?.image || searchParams.get('png');
    if (image) setSelectedArtwork({
      id: requestedDesign,
      name: design?.name || searchParams.get('name') || 'Estampa selecionada',
      image,
      source: 'catalog',
      availableSizes: design?.availableSizes || [],
    });
  }, [catalog, searchParams, selectedArtwork]);

  const filteredArt = useMemo(() => catalog
    .filter(item => !search.trim() || `${item.name} ${item.code || ''}`.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 12), [catalog, search]);

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const result = await uploadArtworkToCloudinary(file);
      setSelectedArtwork({ id: `own_art_${result.public_id}`, name: file.name.replace(/\.[^.]+$/, ''), image: result.secure_url, source: 'upload' });
      setDraftPrintSizes(current => ({ ...current, [activePlacement.id]: '' }));
      setManualDimensions(current => ({ ...current, [activePlacement.id]: { width: '', height: '' } }));
      setMode('upload');
      toast.success('Arte enviada. Agora aplique na posição escolhida.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha no upload.');
    } finally {
      setBusy(false);
    }
  };

  const importLink = async () => {
    if (!link.trim()) return toast.error('Informe o link da imagem.');
    setBusy(true);
    try {
      const result = await uploadArtworkUrlToCloudinary(link.trim());
      setSelectedArtwork({ id: `own_art_${result.public_id}`, name: 'Arte por link', image: result.secure_url, source: 'link' });
      setDraftPrintSizes(current => ({ ...current, [activePlacement.id]: '' }));
      setManualDimensions(current => ({ ...current, [activePlacement.id]: { width: '', height: '' } }));
      setLink('');
      toast.success('Arte importada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao importar.');
    } finally {
      setBusy(false);
    }
  };

  const applyArtwork = async () => {
    if (!selectedArtwork) return toast.error('Escolha uma arte primeiro.');
    const currentSize = normalizePrimePrintSize(selectedPrintSize);
    if (selectedArtwork.source === 'catalog' && !registeredCatalogSizes.includes(currentSize)) {
      return toast.error('Esta arte não possui uma medida cadastrada compatível com esta posição.');
    }
    if (!currentSize || !isPrimePrintSizeWithin(currentSize, activePlacement.maxWidth, activePlacement.maxHeight)) {
      return toast.error(`Digite uma medida de até ${activePlacement.maxWidth} × ${activePlacement.maxHeight} cm.`);
    }
    setBusy(true);
    const requestedContext = applicationContext.current;
    try {
      const bounds = isMeasuredPrimeModel(visualKind) ? await loadPrimeArtworkBounds(selectedArtwork.image, selectedArtwork.source === 'catalog' ? selectedArtwork.id : undefined) : undefined;
      if (applicationContext.current !== requestedContext) return;
      setApplied(current => ({ ...current, [activePlacement.id]: { ...selectedArtwork, productKey: productId, printSize: currentSize, bounds, sleeveSide: selectedArtwork.source === 'catalog' ? 'left' : sleeveSide } }));
      if (visualKind === 'oversized' && activePlacement.id === 'sleeve') setSleeveSetup('ready');
      toast.success(`Arte aplicada em ${activePlacement.label}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível medir a arte.');
    } finally { setBusy(false); }
  };

  const updatePrintSize = (value: string) => {
    const normalized = normalizePrimePrintSize(value);
    setDraftPrintSizes(current => ({ ...current, [activePlacement.id]: normalized }));
    if (activeApplied && selectedArtwork?.id === activeApplied.id && isPrimePrintSizeWithin(normalized, activePlacement.maxWidth, activePlacement.maxHeight)) {
      setApplied(current => ({ ...current, [activePlacement.id]: { ...activeApplied, printSize: normalized, position: undefined } }));
    }
  };

  const updateManualDimension = (axis: 'width' | 'height', rawValue: string) => {
    const nextDimensions = { ...manualDimension, [axis]: rawValue };
    setManualDimensions(current => ({ ...current, [activePlacement.id]: nextDimensions }));
    const width = Number(nextDimensions.width.replace(',', '.'));
    const height = Number(nextDimensions.height.replace(',', '.'));
    const next = width > 0 && height > 0 ? normalizePrimePrintSize(`${width}x${height}`) : '';
    setDraftPrintSizes(current => ({ ...current, [activePlacement.id]: next }));
    if (activeApplied && selectedArtwork?.id === activeApplied.id && isPrimePrintSizeWithin(next, activePlacement.maxWidth, activePlacement.maxHeight)) {
      setApplied(current => ({ ...current, [activePlacement.id]: { ...activeApplied, printSize: next, position: undefined } }));
    }
  };

  const finish = () => {
    if (!selectedBase || !canPurchase) return toast.error('Esta combinação ainda não está disponível para compra. Você pode continuar visualizando sua arte.');
    if (appliedCount < 1 && visualKind !== 'oversized') return toast.error('Adicione pelo menos uma arte.');
    if (appliedCount > profile.maxPrints) return toast.error(`Este produto aceita até ${profile.maxPrints} aplicações.`);

    const printConfigs = placements.flatMap(placement => {
      const item = applied[placement.id];
      if (!item) return [];
      const artPlacement = isMeasuredPrimeModel(visualKind) && item.bounds
        ? placePrimeArtwork(visualKind, size, placement.id === 'sleeve' && item.sleeveSide === 'right' ? 'sleeve_right' : placement.id as PrimeAreaId, item.printSize, item.bounds, item.position, placement.id === 'sleeve' && item.source === 'catalog') : undefined;
      return [{ placement: artPlacement, id: `${item.id}_${placement.positionId}_${Date.now()}`, stampId: item.id, stamp: item.name, location: placement.id === 'sleeve' && item.sleeveSide === 'right' ? 'Manga Direita' : placement.location, printSize: item.printSize, image: item.image, background: 'Sem Fundo' as const }];
    });

    addItem({
      id: `${selectedProduct.id || selectedProduct.slug}_prime_${Date.now()}`,
      slug: profile.cartSlug,
      baseProductSlug: selectedBase.slug || selectedBase.id,
      parentSlug: selectedBase.slug || selectedBase.id,
      name: `${visual.label} PRIME (${color})`,
      price,
      originalPrice: price,
      image: `/product-visuals/${visualKind}-front-v1.webp`,
      size,
      color,
      quantity: 1,
      printConfigs,
    });
    navigate('/bag');
  };

  const moveActiveArt = (position: PrimeArtPosition) => setApplied(current => current[activePlacement.id]
    ? { ...current, [activePlacement.id]: { ...current[activePlacement.id], position } } : current);
  const measuredModel = isMeasuredPrimeModel(visualKind) ? visualKind : null;
  const isSleeve = activePlacement.id === 'sleeve';
  const catalogSleeve = isSleeve && (activeApplied?.source || selectedArtwork?.source || mode) === 'catalog';
  const activeAreaId: PrimeAreaId = isSleeve && !catalogSleeve && (activeApplied?.sleeveSide || sleeveSide) === 'right' ? 'sleeve_right' : activePlacement.id as PrimeAreaId;
  const geometry = measuredModel ? getPrimeAreaGeometry(measuredModel, size, activeAreaId, catalogSleeve) : null;
  const areaWidth = catalogSleeve ? 2 : activePlacement.maxWidth;
  const areaHeight = catalogSleeve ? 3 : activePlacement.maxHeight;
  const visiblePrint = measuredModel && activeApplied?.bounds ? placePrimeArtwork(measuredModel, size, activeAreaId, activeApplied.printSize, activeApplied.bounds, activeApplied.position, catalogSleeve) : null;
  const previewArts = (side: MockupSide, editing = false) => measuredModel && <>
    {placements.filter(placement => placement.side === side && applied[placement.id]?.productKey === productId && (!editing || placement.id !== activePlacement.id)).map(placement => {
      const item = applied[placement.id];
      return <PrimePrintPreview key={placement.id} model={measuredModel} garmentSize={size} areaId={placement.id === 'sleeve' && item.sleeveSide === 'right' ? 'sleeve_right' : placement.id as PrimeAreaId} art={item} catalogSleeve={placement.id === 'sleeve' && item.source === 'catalog'} showArea={false} />;
    })}
    {editing && <PrimePrintPreview model={measuredModel} garmentSize={size} areaId={activeAreaId} art={activeApplied} catalogSleeve={catalogSleeve} onMove={catalogSleeve ? undefined : moveActiveArt} />}
  </>;
  const previewOverlay = measuredModel
    ? previewArts(activePlacement.side, true)
    : (<div className="absolute" style={getOverlayStyle(visualKind, activePlacement, previewPrintSize)}>
                <div className={`relative h-full w-full overflow-hidden border ${activeApplied ? 'border-transparent' : 'border-dashed border-black/35'} bg-white/5`}>
                  {activeApplied ? <img src={activeApplied.image} alt={activeApplied.name} className="h-full w-full object-contain" /> : <span className="absolute inset-0 grid place-items-center px-1 text-center text-[6px] md:text-[8px] font-black uppercase tracking-wide text-black/45">Área da arte</span>}
                </div>
              </div>);
  const sizeChart = measuredModel ? PRIME_GARMENT_MEASUREMENTS[measuredModel]?.map(row => ({ size: row.size, length: row.length + ' cm', width: row.width + ' cm', sleeve: row.sleeve + ' cm', notes: visual.label })) : undefined;

  return (
    <div className="min-h-screen bg-[#f4f3ef] text-[#111] pb-48 md:pb-16">
      <Helmet>
        <title>PRIME Custom | Personalize sua peça F PAC</title>
        <meta name="description" content="Escolha o produto, a cor, o tamanho e a estampa. Visualize sua peça PRIME antes de adicionar à sacola." />
        <link rel="canonical" href="https://www.fpacstore.com.br/prime" />
      </Helmet>
      <div className="bg-black text-white border-b border-white/10">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-4 md:py-6 flex items-end justify-between gap-5">
          <div>
            <p className="text-[#f5bd19] text-[9px] font-black uppercase tracking-[0.28em]">Personalização premium</p>
            <h1 className="mt-1 text-3xl md:text-5xl font-black uppercase italic tracking-[-.04em]">PRIME <span className="text-[#f5bd19]">CUSTOM</span></h1>
            <p className="mt-1 text-xs md:text-sm text-white/55">Escolha a peça, a arte e veja o resultado antes de comprar.</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-white/55"><ShieldCheck size={18} className="text-[#f5bd19]" /> Compra segura</div>
        </div>
      </div>

      <section className="hidden border-b border-black/10 bg-[#111] text-white md:block">
        <div className="mx-auto grid max-w-[1440px] grid-cols-4 divide-x divide-white/10 px-8 py-4">
          {[
            ['Produto à sua escolha', '6 modelos personalizáveis'],
            ['Mockup fotorealista', 'Frente, costas e manga'],
            ['Estampa do seu jeito', 'Catálogo, upload ou link'],
            ['Produção sob demanda', 'Feita especialmente para você'],
          ].map(([title, text]) => (
            <div key={title} className="px-6 text-center first:pl-0 last:pr-0">
              <b className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#f5bd19]">{title}</b>
              <span className="mt-1 block text-[9px] text-white/55">{text}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-3 md:py-6">
        <section className="mb-3 md:mb-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 className="text-[10px] md:text-xs font-black uppercase tracking-[0.18em]"><span className="text-[#b88700]">1.</span> Escolha o produto</h2>
            <span className="text-[9px] text-black/40">{productOptions.length} modelos para visualizar</span>
          </div>
          {productOptions.length > 0 ? (
            <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
              {productOptions.map(product => {
                const kind = getProductVisualKind(product);
                const active = (product.id || product.slug) === (selectedProduct?.id || selectedProduct?.slug);
                return (
                  <button key={product.id || product.slug} type="button" onClick={() => setProductId(product.id || product.slug)} className={`shrink-0 w-[112px] md:w-[160px] overflow-hidden rounded-xl border-2 bg-white text-left transition-all ${active ? 'border-[#f5bd19] shadow-md' : 'border-transparent hover:border-black/15'}`}>
                    <ProductMockupSprite kind={kind} className="aspect-square" label={PRODUCT_VISUALS[kind].label} />
                    <div className="px-2.5 py-2"><b className="block text-[9px] md:text-[11px] uppercase leading-tight">{PRODUCT_VISUALS[kind].label}</b><span className="mt-1 block text-[7px] font-black uppercase tracking-wider text-[#9a7100]">{products.some(item => getProductVisualKind(item) === kind) ? 'Personalizável' : 'Prévia'}</span></div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-black/10 bg-white p-5 text-center text-xs text-black/50">Novos modelos estarão disponíveis em breve.</div>
          )}
        </section>

        {!canPurchase && <p role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">{catalogError || (catalogLoading ? 'Consultando peças lisas...' : 'Sem peças lisas disponíveis para este modelo. Você pode visualizar as estampas enquanto o estoque é reposto.')}</p>}
        <div className="grid lg:grid-cols-[1.08fr_.92fr] gap-3 md:gap-6 items-start">
          <section className="rounded-2xl border border-black/10 bg-white p-2.5 md:p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 px-1 pb-2.5">
              <div><p className="text-[8px] font-black uppercase tracking-[0.18em] text-[#9a7100]">2. Personalize</p><h2 className="text-base md:text-xl font-black uppercase">{visual.label}</h2></div>
              <span className="rounded-full bg-black px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.14em] text-[#f5bd19]">{isSleeve ? catalogSleeve ? 'Catálogo · manga esquerda' : sleeveSide === 'left' ? 'Manga esquerda' : 'Manga direita' : 'Prévia fixa'}</span>
            </div>

            <div className={`grid gap-1.5 mb-2.5 ${placements.length === 1 ? "grid-cols-1" : placements.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {placements.map(placement => <button key={placement.id} type="button" onClick={() => setPlacementId(placement.id)} className={`min-h-10 rounded-lg text-[9px] md:text-[11px] font-black uppercase transition-colors ${placement.id === activePlacement.id ? 'bg-[#f5bd19] text-black' : 'bg-black text-white'}`}>{placement.label}{applied[placement.id] ? ' ✓' : ''}</button>)}
            </div>

            <ProductMockupSprite interactive kind={visualKind} view={activePlacement.side} tone={mockupTone} className="aspect-square rounded-xl border border-black/10" label={`${visual.label} ${color} - ${activePlacement.label}`}>
              {previewOverlay}
              <div className="absolute bottom-3 left-3 rounded-full bg-black/80 px-3 py-1.5 text-[8px] md:text-[10px] font-bold text-white backdrop-blur-sm">{catalogSleeve ? 'Estampa fixa: ' : 'Área máx.: '}{areaWidth}×{areaHeight} cm</div>
              <button type="button" onClick={() => setExpandedPreview(true)} className="absolute right-3 top-3 h-9 w-9 rounded-full bg-black/80 text-white grid place-items-center" aria-label="Visualização ampliada"><Maximize2 size={15} /></button>
            </ProductMockupSprite>

            <div className="mt-2.5 px-1 text-[10px] leading-relaxed text-black/60">
              {measuredModel && <><p>{catalogSleeve ? 'Catálogo: estampa de 2 × 3 cm na manga esquerda, próxima à barra.' : activeApplied ? 'Arraste a estampa dentro da área pontilhada. Também é possível ajustar com as setas do teclado.' : 'A área pontilhada é fixa. Escolha e aplique uma arte para posicioná-la.'}</p>
                {visiblePrint && <p>Arte visível: {money(visiblePrint.widthCm)} × {money(visiblePrint.heightCm)} cm. Proporção original preservada.</p>}
                <p>A prévia mantém a mesma proporção em todos os tamanhos. Medidas representadas de forma aproximada.</p>
                {activeApplied && !catalogSleeve && <button type="button" onClick={() => setApplied(current => ({ ...current, [activePlacement.id]: { ...current[activePlacement.id], position: undefined } }))} className="mt-1 min-h-9 underline font-bold">Restaurar posição</button>}
              </>}
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {placements.filter(item => item.id !== 'sleeve').map(placement => <button key={placement.id} type="button" onClick={() => setPlacementId(placement.id)} className={`overflow-hidden rounded-xl border bg-white p-1 ${placement.id === activePlacement.id ? 'border-2 border-[#f5bd19]' : 'border-black/10'}`}><ProductMockupSprite kind={visualKind} view={placement.side} tone={mockupTone} className="aspect-square rounded-lg">{previewArts(placement.side)}</ProductMockupSprite><span className="block px-1 py-1 text-left text-[9px] font-black uppercase">{placement.label}</span></button>)}
            </div>
          </section>

          <aside className="space-y-3 lg:sticky lg:top-5">
            <section className="rounded-2xl border border-black/10 bg-white p-4 md:p-5 shadow-sm">
              <h2 className="text-[10px] font-black uppercase tracking-[0.18em]"><span className="text-[#b88700]">3.</span> Cor e tamanho</h2>
              <div className="mt-4"><div className="flex items-center justify-between"><b className="text-xs">Cor</b><span className="text-xs text-black/50">{color || "Sem disponibilidade"}</span></div><div className="mt-2 flex flex-wrap gap-2">{colors.map((item: any) => <button key={item.name} type="button" onClick={() => setColor(item.name)} title={item.name} className={`h-10 w-10 rounded-full border-[3px] border-white ${color === item.name ? 'ring-2 ring-[#f5bd19]' : 'ring-1 ring-black/20'}`} style={{ backgroundColor: getPrimeFabricColor(item.name, item.hex) }} />)}</div></div>
              <div className="mt-4"><div className="flex items-center justify-between"><b className="text-xs">Tamanho</b><button type="button" onClick={() => setShowSizes(true)} className="inline-flex items-center gap-1 text-[9px] underline text-black/55"><Ruler size={12} /> Guia</button></div><div className="mt-2 grid grid-cols-4 gap-2">{sizes.map((item: string) => <button key={item} type="button" onClick={() => setSize(item)} className={`min-h-10 rounded-lg border text-xs font-black ${size === item ? 'border-black bg-black text-white' : 'border-black/10 bg-white'}`}>{item}</button>)}</div></div>
            </section>

            <section className="rounded-2xl border border-black/10 bg-white p-4 md:p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3"><h2 className="text-[10px] font-black uppercase tracking-[0.18em]"><span className="text-[#b88700]">4.</span> Adicione sua arte</h2><span className="text-[9px] font-bold text-black/45">{activePlacement.label}</span></div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void upload(file); }} />
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                <button type="button" onClick={() => setMode('catalog')} className={`min-h-10 rounded-lg border text-[8px] md:text-[10px] font-black flex items-center justify-center gap-1 ${mode === 'catalog' ? 'border-black bg-black text-white' : 'border-black/10'}`}><ImagePlus size={14} /> Catálogo</button>
                <button type="button" onClick={() => { setMode('upload'); fileRef.current?.click(); }} className={`min-h-10 rounded-lg border text-[8px] md:text-[10px] font-black flex items-center justify-center gap-1 ${mode === 'upload' ? 'border-black bg-black text-white' : 'border-black/10'}`}><Upload size={14} /> Dispositivo</button>
                <button type="button" onClick={() => setMode('link')} className={`min-h-10 rounded-lg border text-[8px] md:text-[10px] font-black flex items-center justify-center gap-1 ${mode === 'link' ? 'border-black bg-black text-white' : 'border-black/10'}`}><Link2 size={14} /> Link</button>
              </div>

              {mode === 'catalog' && <><label className="relative mt-2.5 block"><Search className="absolute left-3 top-3" size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar estampa..." className="h-10 w-full rounded-lg border border-black/10 pl-9 pr-3 text-xs" /></label><div className="mt-2.5 grid grid-cols-4 sm:grid-cols-6 gap-1.5">{filteredArt.map(item => <button key={item.id} type="button" onClick={() => { setSelectedArtwork(item); setDraftPrintSizes(current => ({ ...current, [activePlacement.id]: '' })); }} className={`aspect-square overflow-hidden rounded-lg bg-black border ${selectedArtwork?.id === item.id ? 'border-[3px] border-[#f5bd19]' : 'border-black'}`}><img src={item.image} alt={item.name} className="h-full w-full object-contain p-1" /></button>)}</div>{filteredArt.length === 0 && <p className="mt-3 rounded-lg bg-black/5 p-4 text-center text-xs text-black/45">Nenhuma estampa encontrada.</p>}</>}
              {mode === 'upload' && <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="mt-2.5 min-h-16 w-full rounded-lg border border-dashed border-black/20 bg-black/[0.02] text-xs font-bold text-black/55 flex items-center justify-center gap-2"><Upload size={16} /> {busy ? 'Enviando...' : 'Escolher imagem do dispositivo'}</button>}
              {mode === 'link' && <div className="mt-2.5 flex gap-2"><input value={link} onChange={event => setLink(event.target.value)} placeholder="https://..." className="h-10 min-w-0 flex-1 rounded-lg border border-black/10 px-3 text-xs" /><button type="button" disabled={busy} onClick={() => void importLink()} className="rounded-lg bg-black px-4 text-[9px] font-black uppercase text-white">Importar</button></div>}

              {isSleeve && (mode !== 'catalog' || selectedArtwork?.source === 'upload' || selectedArtwork?.source === 'link') && <fieldset className="mt-3"><legend className="text-xs font-bold">Braço de quem veste a peça</legend><div className="mt-2 grid grid-cols-2 gap-2">{(['left', 'right'] as const).map(side => <button key={side} type="button" aria-pressed={sleeveSide === side} onClick={() => { setSleeveSide(side); if (activeApplied && activeApplied.source !== 'catalog') setApplied(current => ({ ...current, sleeve: { ...current.sleeve, sleeveSide: side } })); }} className={`min-h-10 rounded-lg border text-xs font-bold ${sleeveSide === side ? 'bg-black text-white' : 'bg-white'}`}>{side === 'left' ? 'Esquerdo' : 'Direito'}</button>)}</div><p className="mt-1 text-[10px] text-black/60">Arte própria: até 10 × 12 cm.</p></fieldset>}

              {selectedArtwork && <div className="mt-3 rounded-xl border border-black/10 bg-[#f8f8f6] p-2.5">
                <div className="flex items-center gap-2.5"><img src={selectedArtwork.image} alt={selectedArtwork.name} className="h-12 w-12 rounded-lg bg-black object-contain p-1" /><div className="min-w-0 flex-1"><b className="block truncate text-xs">{selectedArtwork.name}</b><span className="text-[9px] text-black/45">{selectedArtwork.source === 'catalog' ? 'Arte do catálogo' : 'Imagem enviada pelo cliente'} · aplicar em {activePlacement.label.toLowerCase()}</span></div></div>
                {selectedArtwork.source === 'catalog' ? (
                  isSleeve ? <p className="mt-2.5 rounded-lg bg-white p-3 text-xs font-bold">2 × 3 cm · manga esquerda · posição fixa</p> : registeredCatalogSizes.length > 0 ? <label className="mt-2.5 block"><span className="mb-1 block text-[8px] font-black uppercase tracking-wider text-black/45">Medida cadastrada para esta arte</span><select value={selectedPrintSize} onChange={event => updatePrintSize(event.target.value)} className="min-h-11 w-full rounded-lg border border-black/10 bg-white px-3 text-xs font-bold">{registeredCatalogSizes.map(value => <option key={value} value={value}>{formatPrimePrintSize(value)}</option>)}</select></label> : <p className="mt-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[10px] font-bold leading-relaxed text-amber-900">Esta arte ainda não possui uma medida cadastrada compatível com a área de {activePlacement.maxWidth} × {activePlacement.maxHeight} cm.</p>
                ) : (
                  <div className="mt-2.5"><p className="text-[8px] font-black uppercase tracking-wider text-black/45">Digite a medida aproximada da arte</p><div className="mt-1.5 grid grid-cols-2 gap-2"><label><span className="mb-1 block text-[9px] text-black/50">Largura (cm)</span><input type="number" inputMode="decimal" min="1" max={activePlacement.maxWidth} step="0.5" value={manualDimension.width} onChange={event => updateManualDimension('width', event.target.value)} placeholder={`Até ${activePlacement.maxWidth}`} className="min-h-11 w-full rounded-lg border border-black/10 bg-white px-3 text-xs font-bold" /></label><label><span className="mb-1 block text-[9px] text-black/50">Altura (cm)</span><input type="number" inputMode="decimal" min="1" max={activePlacement.maxHeight} step="0.5" value={manualDimension.height} onChange={event => updateManualDimension('height', event.target.value)} placeholder={`Até ${activePlacement.maxHeight}`} className="min-h-11 w-full rounded-lg border border-black/10 bg-white px-3 text-xs font-bold" /></label></div><p className="mt-1.5 text-[9px] leading-relaxed text-black/45">Máximo nesta posição: {activePlacement.maxWidth} × {activePlacement.maxHeight} cm.</p></div>
                )}
                <button type="button" disabled={!canApplyArtwork || busy} onClick={() => void applyArtwork()} className="mt-2.5 min-h-11 w-full rounded-lg bg-[#f5bd19] px-4 text-[9px] font-black uppercase flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/35"><Check size={14} /> {busy ? 'Preparando arte...' : 'Aplicar na peça'}</button>
              </div>}

              <div className="mt-3 flex items-center justify-between border-t border-black/5 pt-3"><div><p className="text-[8px] font-black uppercase tracking-wider text-black/35">Configuração</p><p className="text-xs font-bold">{appliedCount}/{profile.maxPrints} aplicações</p></div>{activeApplied && <button type="button" onClick={() => setApplied(current => { const next = { ...current }; delete next[activePlacement.id]; return next; })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-[8px] font-black uppercase text-red-700"><Trash2 size={13} /> {visualKind === 'oversized' && isSleeve && activeApplied.source === 'catalog' ? 'Retirar da manga (+ R$ 3,00)' : 'Remover'}</button>}</div>
            </section>

            <section className="rounded-2xl bg-black p-4 md:p-5 text-white shadow-xl">
              {visualKind === 'oversized' && <div className="mb-4 space-y-1 text-xs text-white/80">
                <p>Peça com estampa de manga: R$ {money(priceBreakdown.base)}</p>
                <p>Estampas adicionais: R$ {money(priceBreakdown.prints)}</p>
                {priceBreakdown.removal > 0 && <p>Retirada da estampa de manga: + R$ 3,00</p>}
                {sleeveSetup === 'error' && <p role="status">A estampa de manga incluída está indisponível. Tente carregar novamente ou escolha outra do catálogo.</p>}
                {sleeveSetup === 'loading' && <p role="status">Preparando estampa de manga incluída...</p>}
                {(priceBreakdown.removal > 0 || sleeveSetup === 'error') && <button type="button" disabled={!defaultSleeveArt || sleeveSetup === 'loading'} onClick={() => void restoreSleeve()} className="min-h-9 underline text-[#f5bd19]">{sleeveSetup === 'error' ? 'Tentar carregar a estampa incluída' : 'Recolocar estampa de manga incluída'}</button>}
              </div>}
              <div className="flex items-end justify-between gap-4"><div><p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/45">PRIME CUSTOM</p><p className="mt-1 text-3xl font-black text-[#f5bd19]">{(isRegisteredProduct || visualKind === 'oversized') ? `R$ ${money(price)}` : 'Em prévia'}</p><p className="text-[9px] text-white/55">{(isRegisteredProduct || visualKind === 'oversized') ? `R$ ${money(pixPrice)} no PIX` : 'Compra indisponível'}</p></div><div className="text-right text-[8px] uppercase tracking-wider text-white/45"><Sparkles size={18} className="ml-auto mb-1 text-[#f5bd19]" />Sua criação<br />na F PAC</div></div>
              <button type="button" onClick={finish} disabled={!canPurchase || (appliedCount === 0 && visualKind !== 'oversized') || busy || sleeveSetup !== 'ready'} className="mt-4 min-h-13 w-full rounded-xl bg-[#f5bd19] px-4 text-[10px] font-black uppercase tracking-[0.1em] text-black flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-40"><ShoppingCart size={18} /> Adicionar à sacola <ChevronRight size={16} /></button>
            </section>
          </aside>
        </div>

        <section className="mt-4 grid grid-cols-3 gap-2 rounded-2xl border border-black/10 bg-white p-3 text-center">{[['Mockup realista', 'Visualize antes'], ['Medidas reais', 'Em centímetros'], ['Compra segura', 'Checkout F PAC']].map(([title, text]) => <div key={title} className="px-1"><b className="block text-[8px] md:text-[10px] uppercase">{title}</b><span className="text-[7px] md:text-[9px] text-black/45">{text}</span></div>)}</section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-[70] border-t border-black/10 bg-white/95 px-3 py-2.5 shadow-[0_-12px_35px_rgba(0,0,0,.16)] backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-[108px]">
            <p className="text-[7px] font-black uppercase tracking-[0.14em] text-black/40">PRIME CUSTOM</p>
            <p className="text-lg font-black leading-tight text-black">{(isRegisteredProduct || visualKind === 'oversized') ? `R$ ${money(price)}` : 'Em prévia'}</p>
            <p className="text-[8px] text-black/45">{(isRegisteredProduct || visualKind === 'oversized') ? `R$ ${money(pixPrice)} no PIX` : 'Compra indisponível'}</p>
          </div>
          <button type="button" onClick={finish} disabled={!canPurchase || (appliedCount === 0 && visualKind !== 'oversized') || busy || sleeveSetup !== 'ready'} className="min-h-12 flex-1 rounded-xl bg-[#f5bd19] px-3 text-[9px] font-black uppercase tracking-[0.08em] text-black flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/35"><ShoppingCart size={17} /> Adicionar à sacola</button>
        </div>
      </div>

      {showSizes && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4"><div className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-black"><button type="button" onClick={() => setShowSizes(false)} className="absolute right-3 top-2 h-10 w-10 text-xl" aria-label="Fechar guia">×</button><SizeChart customData={sizeChart} onClose={() => setShowSizes(false)} /></div></div>}
      {expandedPreview && <div className="fixed inset-0 z-[110] grid place-items-center bg-black/90 p-3 md:p-8" onClick={() => setExpandedPreview(false)}><div className="relative w-full max-w-[min(56rem,90dvh)]" onClick={event => event.stopPropagation()}><button type="button" onClick={() => setExpandedPreview(false)} className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-black text-white shadow-lg" aria-label="Fechar visualização ampliada"><X size={18} /></button><ProductMockupSprite interactive kind={visualKind} view={activePlacement.side} tone={mockupTone} className="max-h-[90dvh] aspect-square rounded-2xl" label={`${visual.label} ${color} - ${activePlacement.label}`}>{previewOverlay}<div className="absolute bottom-4 left-4 rounded-full bg-black/80 px-4 py-2 text-[10px] font-bold text-white backdrop-blur-sm">{activePlacement.label} · {areaWidth}×{areaHeight} cm</div></ProductMockupSprite></div></div>}
    </div>
  );
}
