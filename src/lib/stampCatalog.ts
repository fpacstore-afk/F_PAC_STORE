import { normalizeStampCategory } from '../constants/stampCategories';
import { Design } from '../types/design';

export function normalizeDesignDocument(id: string, data: any): Design {
  const name = String(data?.name || 'Estampa Sem Nome').trim() || 'Estampa Sem Nome';
  const status: Design['status'] = ['active', 'draft', 'archived', 'unavailable'].includes(data?.status)
    ? data.status
    : 'active';

  return {
    id,
    code: data?.code || `EST-${id.slice(0, 4).toUpperCase()}`,
    name,
    category: normalizeStampCategory(data?.category, name, data?.description || '', data?.tags || []),
    collection: data?.collection || 'MARK',
    compatibleProducts: Array.isArray(data?.compatibleProducts) && data.compatibleProducts.length > 0
      ? data.compatibleProducts.map((product: unknown) => String(product).trim()).filter(Boolean)
      : ['Todos os produtos'],
    theme: data?.theme || 'Streetwear',
    tags: Array.isArray(data?.tags) ? data.tags : [],
    description: data?.description || '',
    pngUrl: data?.pngUrl || data?.image || '',
    svgUrl: data?.svgUrl || '',
    mockupUrl: data?.mockupUrl || data?.thumbnailUrl || data?.image || data?.pngUrl || '',
    thumbnailUrl: data?.thumbnailUrl || data?.mockupUrl || data?.image || data?.pngUrl || '',
    masterFileUrl: data?.masterFileUrl || '',
    videoUrl: data?.videoUrl || data?.video?.url || '',
    dominantColors: Array.isArray(data?.dominantColors) ? data.dominantColors : ['#000000', '#EAB308'],
    colorVariants: Array.isArray(data?.colorVariants) ? data.colorVariants : [],
    author: data?.author || 'F PAC Creative Lab',
    status,
    availableForCustomization: data?.availableForCustomization !== false,
    readyToShip: data?.readyToShip === true,
    displayOrder: Number.isFinite(Number(data?.displayOrder)) ? Number(data.displayOrder) : 9999,
    availableSizes: Array.isArray(data?.availableSizes)
      ? data.availableSizes.map((size: unknown) => String(size).trim()).filter(Boolean).slice(0, 5)
      : [],
    stockBySize: data?.stockBySize && typeof data.stockBySize === 'object'
      ? Object.fromEntries(Object.entries(data.stockBySize).map(([size, quantity]) => [String(size).trim(), Number(quantity) || 0]).filter(([size]) => Boolean(size)))
      : {},
    stockBalance: Number.isFinite(Number(data?.stockBalance)) ? Number(data.stockBalance) : 0,
    createdAt: data?.createdAt,
    updatedAt: data?.updatedAt,
    history: Array.isArray(data?.history) ? data.history : [],
  };
}

export function isDesignPublic(design: Design): boolean {
  const hasPublicMedia = Boolean(getDesignImage(design) || design.videoUrl);
  return design.status === 'active' && hasPublicMedia && (design.availableForCustomization || design.readyToShip);
}

export function sortDesignCatalog(designs: Design[]): Design[] {
  return [...designs].sort((a, b) =>
    a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, 'pt-BR'),
  );
}

export function reorderDesignCatalog(
  designs: Design[],
  visibleDesignIds: string[],
  activeId: string,
  overId: string,
): Design[] {
  const sortedDesigns = sortDesignCatalog(designs);
  const oldIndex = visibleDesignIds.indexOf(activeId);
  const newIndex = visibleDesignIds.indexOf(overId);

  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return sortedDesigns;

  const reorderedVisibleIds = [...visibleDesignIds];
  const [movedId] = reorderedVisibleIds.splice(oldIndex, 1);
  reorderedVisibleIds.splice(newIndex, 0, movedId);

  const visibleIds = new Set(visibleDesignIds);
  const designsById = new Map(sortedDesigns.map((design) => [design.id, design]));
  let visibleIndex = 0;

  return sortedDesigns.map((design, index) => {
    const nextDesign = visibleIds.has(design.id)
      ? designsById.get(reorderedVisibleIds[visibleIndex++]) || design
      : design;

    return { ...nextDesign, displayOrder: index + 1 };
  });
}

export function getDesignImage(design: Design): string {
  return design.mockupUrl || design.thumbnailUrl || design.pngUrl || '';
}
