export type ProductCostCoverage = 'complete' | 'partial';

export interface ProductCostProfile {
  id: string;
  baseModel: string;
  productFinish: 'plain' | 'printed' | 'all';
  collection: string;
  unitCost: number;
  coverage: ProductCostCoverage;
  pendingComponents?: string[];
  sourceLabel?: string;
  sourceUpdatedAt?: string;
  active?: boolean;
}

export interface ProductCostSelector {
  baseModel?: string | null;
  productFinish?: string | null;
  collection?: string | null;
}

export interface ProductCostCalculationMetadata {
  mode: 'automatic' | 'manual';
  profileId?: string;
  sourceLabel?: string;
  sourceUpdatedAt?: string;
  coverage: ProductCostCoverage;
  pendingComponents?: string[];
  calculatedAt: string;
}

export function inferProductCostSelector(product: Record<string, any>): ProductCostSelector {
  const searchable = `${product.name || ''} ${product.slug || ''} ${product.category || ''} ${product.parentSlug || ''}`.toLowerCase();
  let inferredBaseModel = product.baseModel;
  if (!inferredBaseModel && (searchable.includes('oversized') || searchable.includes('force') || searchable.includes('mark') || searchable.includes('prime'))) {
    inferredBaseModel = 'Oversized Premium 240GSM';
  }

  let inferredCollection = product.collection || product.line;
  if (!inferredCollection) {
    if (searchable.includes('prime')) inferredCollection = 'PRIME';
    else if (searchable.includes('mark')) inferredCollection = 'MARK';
    else if (searchable.includes('force')) inferredCollection = 'FORCE';
    else inferredCollection = 'TODOS';
  }

  const inferredFinish = product.productFinish || (/\b(lisa|liso|base|sem estampa)\b/.test(searchable) ? 'plain' : 'printed');
  return {
    baseModel: inferredBaseModel,
    productFinish: inferredFinish,
    collection: inferredCollection
  };
}

const normalize = (value: unknown): string => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const isWildcard = (value: unknown): boolean => {
  const normalized = normalize(value);
  return normalized === '' || normalized === '*' || normalized === 'todos' || normalized === 'all';
};

/**
 * Selects the most specific active cost profile for a product. A profile may
 * use TODOS/* for finish or commercial line, but an exact match always wins.
 */
export function resolveProductCostProfile(
  profiles: ProductCostProfile[],
  selector: ProductCostSelector
): ProductCostProfile | null {
  const baseModel = normalize(selector.baseModel);
  const productFinish = normalize(selector.productFinish);
  const collection = normalize(selector.collection);

  if (!baseModel) return null;

  const candidates = (profiles || [])
    .filter((profile) => profile && profile.active !== false && Number(profile.unitCost) > 0)
    .filter((profile) => {
      const baseMatches = isWildcard(profile.baseModel) || normalize(profile.baseModel) === baseModel;
      const finishMatches = isWildcard(profile.productFinish) || normalize(profile.productFinish) === productFinish;
      const collectionMatches = isWildcard(profile.collection) || normalize(profile.collection) === collection;
      return baseMatches && finishMatches && collectionMatches;
    })
    .map((profile) => ({
      profile,
      score:
        (isWildcard(profile.baseModel) ? 0 : 4) +
        (isWildcard(profile.productFinish) ? 0 : 2) +
        (isWildcard(profile.collection) ? 0 : 1)
    }))
    .sort((a, b) => b.score - a.score || a.profile.id.localeCompare(b.profile.id));

  return candidates[0]?.profile || null;
}

export function buildAutomaticCostMetadata(
  profile: ProductCostProfile,
  calculatedAt = new Date().toISOString()
): ProductCostCalculationMetadata {
  return {
    mode: 'automatic',
    profileId: profile.id,
    sourceLabel: profile.sourceLabel || 'Planilha central de custos',
    sourceUpdatedAt: profile.sourceUpdatedAt,
    coverage: profile.coverage,
    pendingComponents: profile.pendingComponents || [],
    calculatedAt
  };
}

/**
 * Audited fallback from F_PAC_Custos_e_Conferencia.xlsx. These values exclude
 * the checkout fee because gateway charges are accounted for separately.
 * They remain explicitly partial until the missing production inputs are
 * completed in the connected cost source.
 */
export const AUDITED_FALLBACK_COST_PROFILES: ProductCostProfile[] = [
  {
    id: 'oversized-premium-plain-all',
    baseModel: 'Oversized Premium 240GSM',
    productFinish: 'plain',
    collection: 'TODOS',
    unitCost: 29.91,
    coverage: 'partial',
    pendingComponents: ['mão de obra', 'energia', 'outros custos', 'rateio fixo', 'frete da embalagem'],
    sourceLabel: 'F_PAC_Custos_e_Conferencia.xlsx (base auditada)',
    active: true
  },
  {
    id: 'oversized-premium-printed-force',
    baseModel: 'Oversized Premium 240GSM',
    productFinish: 'printed',
    collection: 'FORCE',
    unitCost: 30.51,
    coverage: 'partial',
    pendingComponents: ['aproveitamento/perda de DTF', 'mão de obra', 'energia', 'outros custos', 'rateio fixo', 'frete da embalagem'],
    sourceLabel: 'F_PAC_Custos_e_Conferencia.xlsx (base auditada)',
    active: true
  }
];
