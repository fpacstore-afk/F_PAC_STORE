import { parsePrimePrintSize, isCatalogSleeveSize } from './primeArtworkSizing';
import { getCustomizationProfileById } from './customizationProfiles';

export type MeasuredPrimeModel = 'oversized' | 'traditional' | 'cropped' | 'hoodie';
export type PrimePlacementModel = MeasuredPrimeModel | 'shorts' | 'cap';
export type PrimeAreaId = 'front' | 'back' | 'sleeve' | 'sleeve_right';
export type GarmentMeasurement = { size: string; width: number; length: number; sleeve: number };

export const isPrimePlacementModel = (kind: string): kind is PrimePlacementModel =>
  ['oversized', 'traditional', 'cropped', 'hoodie', 'shorts', 'cap'].includes(kind);

// Manufacturer tables supplied by the store: Tiggas Malhão 240, ZIMM Classic
// Suedine 250 and Tiggas Cropped/Boxy 190. Values are flat garment measurements.
// The oversized P width is 44 in the supplied table; do not silently infer 54.
export const PRIME_GARMENT_MEASUREMENTS: Partial<Record<MeasuredPrimeModel, GarmentMeasurement[]>> = {
  oversized: [
    { size: 'P', width: 44, length: 71, sleeve: 22 },
    { size: 'M', width: 54, length: 74, sleeve: 24 },
    { size: 'G', width: 61, length: 76, sleeve: 25 },
    { size: 'GG', width: 64, length: 79, sleeve: 26 },
    { size: 'G1', width: 71, length: 82, sleeve: 28 },
  ],
  traditional: [
    { size: 'P', width: 50, length: 65, sleeve: 16 },
    { size: 'M', width: 52, length: 68, sleeve: 18 },
    { size: 'G', width: 56, length: 70, sleeve: 18 },
    { size: 'GG', width: 58, length: 72, sleeve: 19 },
  ],
  cropped: [
    { size: 'P', width: 57, length: 55, sleeve: 18 },
    { size: 'M', width: 60, length: 57, sleeve: 19 },
    { size: 'G', width: 61, length: 58, sleeve: 20 },
    { size: 'GG', width: 65, length: 62, sleeve: 21 },
  ],
};
export const isMeasuredPrimeModel = (kind: string): kind is MeasuredPrimeModel => ['oversized', 'traditional', 'cropped', 'hoodie'].includes(kind);

// Landmarks in each 512 x 512 cell of the existing v1 front/back sprites.
// A single pixels/cm scale preserves artwork proportions. Use the tighter of
// body width and shoulder-to-hem length, rather than stretching either axis.
const LANDMARKS = {
  oversized: {
    front: { centerX: 257, bodyWidth: 275, shoulderY: 51, collarY: 109, hemY: 462 },
    // The rear torso is shifted right within its sprite cell; align to the body, not the cell.
    back: { centerX: 274, bodyWidth: 286, shoulderY: 47, collarY: 77, hemY: 466 },
    sleeve: { hemX: 451, hemY: 266, rotation: -35 },
  },
  traditional: {
    front: { centerX: 256, bodyWidth: 230, shoulderY: 52, collarY: 105, hemY: 456 },
    back: { centerX: 256, bodyWidth: 250, shoulderY: 49, collarY: 76, hemY: 467 },
    sleeve: { hemX: 415, hemY: 223, rotation: -28 },
  },
  cropped: {
    front: { centerX: 256, bodyWidth: 262, shoulderY: 108, collarY: 159, hemY: 375 },
    back: { centerX: 251, bodyWidth: 270, shoulderY: 121, collarY: 154, hemY: 378 },
    sleeve: { hemX: 455, hemY: 314, rotation: -33 },
  },
  hoodie: {
    front: { centerX: 256, bodyWidth: 290, shoulderY: 60, collarY: 150, hemY: 452 },
    // The hood ends at y=120 and the rear torso is centered at x=256.
    back: { centerX: 256, bodyWidth: 290, shoulderY: 60, collarY: 120, hemY: 452 },
    sleeve: { hemX: 0, hemY: 0, rotation: 0 },
  },
};

// Normalized mockup calibrations for products without a size chart. The box is
// the fixed print area; artwork remains movable inside it in physical cm.
export const PRIME_VISUAL_AREA_LANDMARKS = Object.freeze({
  shorts: Object.freeze({
    // The angled cargo flap spans roughly x=381–433, y=231–278.
    front: Object.freeze({ centerX: 406, centerY: 253, widthPx: 36, heightPx: 36 }),
    // Keep the square inside the rear pocket below its opening at y=127.
    back: Object.freeze({ centerX: 341, centerY: 170, widthPx: 80, heightPx: 80 }),
  }),
  cap: Object.freeze({
    // The 8 cm tall × 12 cm wide crown area ends above the visor at y≈305.
    front: Object.freeze({ centerX: 256, centerY: 253, widthPx: 144, heightPx: 96 }),
  }),
});

const VISUAL_REFERENCE_MEASUREMENT: GarmentMeasurement = { size: 'Referência visual', width: 60, length: 72, sleeve: 0 };

export function getPrimeAreaGeometry(model: PrimePlacementModel, _size: string, areaId: PrimeAreaId, catalogSleeve = false, sleevePrintSize = '2x3') {
  // One stable reference for the visual, independent of the ordered size.
  // The customer size is carried in the production data, never a photo warp.
  const measurement = PRIME_GARMENT_MEASUREMENTS[model]?.find(row => row.size === 'M')
    || { size: 'Referência visual', width: 60, length: 72, sleeve: 0 };
  const isSleeve = areaId === 'sleeve' || areaId === 'sleeve_right';
  if (model === 'hoodie' && isSleeve) throw new Error('O casaco permite estampas somente na frente e nas costas.');
  const profile = getCustomizationProfileById(model);
  const printArea = profile?.printAreas.find(area => area.id === (isSleeve ? 'left-sleeve' : areaId));
  if (!printArea) throw new Error('Área de impressão indisponível para este modelo.');
  if (!isMeasuredPrimeModel(model)) {
    if (isSleeve) throw new Error('Este modelo não possui área de manga.');
    const view = PRIME_VISUAL_AREA_LANDMARKS[model][areaId as 'front' | 'back'];
    if (!view) throw new Error('Área de impressão indisponível para este modelo.');
    const pixelsPerCm = Math.min(view.widthPx / printArea.maxWidthCm, view.heightPx / printArea.maxHeightCm);
    return {
      widthCm: printArea.maxWidthCm,
      heightCm: printArea.maxHeightCm,
      pixelsPerCm,
      centerX: view.centerX,
      centerY: view.centerY,
      rotationDeg: printArea.rotationDeg || 0,
      measurement: VISUAL_REFERENCE_MEASUREMENT,
      estimated: true,
      imageTransform: 'none',
      garmentWidthPx: 512,
      garmentLengthPx: 512,
      garmentHemY: 512,
    };
  }
  const view = LANDMARKS[model][areaId === 'back' ? 'back' : 'front'];
  const pixelsPerCm = Math.min(view.bodyWidth / measurement.width, (view.hemY - view.shoulderY) / measurement.length);
  const sleeveDimensions = catalogSleeve ? parsePrimePrintSize(sleevePrintSize) : null;
  const widthCm = isSleeve && catalogSleeve ? sleeveDimensions?.[0] || 2 : printArea.maxWidthCm;
  const heightCm = isSleeve && catalogSleeve ? sleeveDimensions?.[1] || 3 : printArea.maxHeightCm;
  const topGapCm = model === 'hoodie' && areaId === 'front' ? 0
    : model === 'hoodie' && areaId === 'back' ? 1
      : areaId === 'back' && model !== 'cropped' ? 6 : 4;
  let centerX = view.centerX;
  let centerY = view.collarY + (topGapCm + heightCm / 2) * pixelsPerCm;
  let rotationDeg = 0;
  if (isSleeve) {
    // Wearer's LEFT sleeve is on the viewer's RIGHT in the front photograph.
    // Its lower edge follows the sleeve hem with a 2 cm production clearance.
    const sleeve = LANDMARKS[model].sleeve;
    rotationDeg = sleeve.rotation;
    const angle = rotationDeg * Math.PI / 180;
    const inset = (heightCm / 2 + 2) * pixelsPerCm;
    centerX = sleeve.hemX + (catalogSleeve ? 17 : 0) + Math.sin(angle) * inset;
    centerY = sleeve.hemY - (catalogSleeve ? 12 : 0) - Math.cos(angle) * inset;
    if (areaId === 'sleeve_right') { centerX = 512 - centerX; rotationDeg = -rotationDeg; }
  }
  return { widthCm, heightCm, pixelsPerCm, centerX, centerY, rotationDeg, measurement, estimated: model === 'hoodie',
    imageTransform: 'none', garmentWidthPx: view.bodyWidth,
    garmentLengthPx: view.hemY - view.shoulderY, garmentHemY: view.hemY };
}

export type ArtworkBounds = {
  sourceWidth: number;
  sourceHeight: number;
  crop: { left: number; top: number; width: number; height: number };
};
export type PrimeArtPosition = { xCm: number; yCm: number };
export interface PrimeArtworkPlacement extends PrimeArtPosition {
  version: 1;
  model: PrimePlacementModel;
  garmentSize: string;
  areaId: PrimeAreaId;
  widthCm: number;
  heightCm: number;
  areaWidthCm: number;
  areaHeightCm: number;
  rotationDeg: number;
  artwork: ArtworkBounds;
  sleeveMode?: 'catalog' | 'custom';
}

export function getVisibleArtworkBounds(data: ArrayLike<number>, width: number, height: number): ArtworkBounds['crop'] {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 8) {
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return right < left ? { left: 0, top: 0, width: 1, height: 1 }
    : { left: left / width, top: top / height, width: (right - left + 1) / width, height: (bottom - top + 1) / height };
}

export function fitPrimeArtwork(printSize: string, artwork: ArtworkBounds) {
  const dimensions = parsePrimePrintSize(printSize);
  if (!dimensions) throw new Error('Medida de estampa inválida.');
  const aspect = artwork.sourceWidth * artwork.crop.width / (artwork.sourceHeight * artwork.crop.height);
  const widthCm = Math.min(dimensions[0], dimensions[1] * aspect);
  return { widthCm, heightCm: widthCm / aspect };
}

export function placePrimeArtwork(model: PrimePlacementModel, size: string, areaId: PrimeAreaId, printSize: string, artwork: ArtworkBounds, position?: PrimeArtPosition, catalogSleeve = false): PrimeArtworkPlacement {
  const isSleeve = areaId === 'sleeve' || areaId === 'sleeve_right';
  if (catalogSleeve && (areaId !== 'sleeve' || !isCatalogSleeveSize(printSize))) throw new Error('A estampa do catálogo na manga deve ser 2 × 3 ou 3 × 2 cm no braço esquerdo.');
  const area = getPrimeAreaGeometry(model, size, areaId, catalogSleeve, printSize);
  const dimensions = parsePrimePrintSize(printSize);
  if (!dimensions || dimensions[0] > area.widthCm || dimensions[1] > area.heightCm) throw new Error('A estampa ultrapassa a área de impressão.');
  let fitted = fitPrimeArtwork(printSize, artwork);
  // The cap's 8 cm crown height is the anchor for portrait logo sizes such as
  // 6 × 8 and 8 × 6. Preserve the visible art's aspect, report its actual
  // width to production, and never let it cross the 12 cm wide fixed area.
  const capHeightCm = Math.max(dimensions[0], dimensions[1]);
  if (model === 'cap' && capHeightCm === area.heightCm && fitted.widthCm < fitted.heightCm) {
    const fullHeightWidthCm = capHeightCm * fitted.widthCm / fitted.heightCm;
    if (fullHeightWidthCm <= area.widthCm) fitted = { widthCm: fullHeightWidthCm, heightCm: capHeightCm };
  }
  const availableX = Math.max(0, area.widthCm - fitted.widthCm);
  const availableY = Math.max(0, area.heightCm - fitted.heightCm);
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  return {
    version: 1, model, garmentSize: size, areaId,
    // Body prints start at the top of the calibrated production area. Centering
    // small artwork in the full 30 × 40 cm maximum box placed it too low on the
    // chest and back. Sleeves remain aligned to the cuff by default.
    xCm: clamp((catalogSleeve ? undefined : position?.xCm) ?? availableX / 2, availableX),
    yCm: clamp((catalogSleeve ? undefined : position?.yCm) ?? (isSleeve ? availableY : isMeasuredPrimeModel(model) ? 0 : availableY / 2), availableY),
    ...fitted, areaWidthCm: area.widthCm, areaHeightCm: area.heightCm,
    rotationDeg: area.rotationDeg, artwork,
    ...(isSleeve ? { sleeveMode: catalogSleeve ? 'catalog' as const : 'custom' as const } : {}),
  };
}

// Shared by checkout: positions are measurements, never arbitrary CSS/transforms.
// Legacy orders without this metadata remain valid. Canonical areas and rotation
// come from the server profile, not from client-supplied limits.
export function validatePrimeArtworkPlacement(value: unknown, model: string, size: string, location: string, printSize: string, catalogSleeve = false): PrimeArtworkPlacement | undefined {
  if (value == null) return undefined;
  if (!isPrimePlacementModel(model)) throw new Error('Posicionamento indisponível para este modelo.');
  const areaId = location === 'Frente' ? 'front' : location === 'Costas' ? 'back'
    : location === 'Bermuda Frente' ? 'front' : location === 'Bermuda Costas' ? 'back'
      : location === 'Boné Frontal' ? 'front'
        : location === 'Manga Esquerda' ? 'sleeve' : location === 'Manga Direita' ? 'sleeve_right' : null;
  const input = value as PrimeArtworkPlacement;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  const art = input?.artwork;
  const crop = art?.crop;
  if (!areaId || input?.version !== 1 || !art || !crop ||
    !finite(art.sourceWidth) || !finite(art.sourceHeight) || art.sourceWidth < 1 || art.sourceHeight < 1 || art.sourceWidth > 30000 || art.sourceHeight > 30000 ||
    ![crop.left, crop.top, crop.width, crop.height, input.xCm, input.yCm].every(finite) ||
    crop.left < 0 || crop.top < 0 || crop.width <= 0 || crop.height <= 0 || crop.left + crop.width > 1.000001 || crop.top + crop.height > 1.000001) {
    throw new Error('Posicionamento de estampa inválido.');
  }
  const canonicalArtwork: ArtworkBounds = { sourceWidth: art.sourceWidth, sourceHeight: art.sourceHeight, crop: { left: crop.left, top: crop.top, width: crop.width, height: crop.height } };
  const placed = placePrimeArtwork(model, size, areaId, printSize, canonicalArtwork, input, catalogSleeve);
  if (Math.abs(placed.xCm - input.xCm) > 0.001 || Math.abs(placed.yCm - input.yCm) > 0.001) throw new Error('A estampa ultrapassa a área de impressão.');
  return placed;
}

export function describePrimePlacement(placement: PrimeArtworkPlacement): string {
  const cm = (value: number) => value.toFixed(1).replace('.', ',');
  return `Arte ${cm(placement.widthCm)} × ${cm(placement.heightCm)} cm · posição ${cm(placement.xCm)} cm da esquerda e ${cm(placement.yCm)} cm do topo da área${placement.areaId.startsWith('sleeve') ? ` · manga ${placement.areaId === 'sleeve_right' ? 'direita' : 'esquerda'} de quem veste` : ''}`;
}
