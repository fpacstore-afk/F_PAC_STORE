import { parsePrimePrintSize } from './primeArtworkSizing';

export type MeasuredPrimeModel = 'oversized' | 'traditional' | 'cropped';
export type PrimeAreaId = 'front' | 'back' | 'sleeve';
export type GarmentMeasurement = { size: string; width: number; length: number; sleeve: number };

// Manufacturer tables supplied by the store: Tiggas Malhão 240, ZIMM Classic
// Suedine 250 and Tiggas Cropped/Boxy 190. Values are flat garment measurements.
// The oversized P width is 44 in the supplied table; do not silently infer 54.
export const PRIME_GARMENT_MEASUREMENTS: Record<MeasuredPrimeModel, GarmentMeasurement[]> = {
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
export const isMeasuredPrimeModel = (kind: string): kind is MeasuredPrimeModel => Object.prototype.hasOwnProperty.call(PRIME_GARMENT_MEASUREMENTS, kind);

// Landmarks in each 512 x 512 cell of the existing v1 front/back sprites.
// A single pixels/cm scale preserves artwork proportions. Use the tighter of
// body width and shoulder-to-hem length, rather than stretching either axis.
const LANDMARKS = {
  oversized: {
    front: { centerX: 257, bodyWidth: 275, shoulderY: 51, collarY: 109, hemY: 462 },
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
};

export function getPrimeAreaGeometry(model: MeasuredPrimeModel, size: string, areaId: PrimeAreaId) {
  const measurement = PRIME_GARMENT_MEASUREMENTS[model].find(row => row.size === size)
    || PRIME_GARMENT_MEASUREMENTS[model].find(row => row.size === 'M')!;
  const view = LANDMARKS[model][areaId === 'back' ? 'back' : 'front'];
  const pixelsPerCm = Math.min(view.bodyWidth / measurement.width, (view.hemY - view.shoulderY) / measurement.length);
  // Calibrate the photographed garment too: otherwise a long/narrow mockup
  // would show the right print width but the wrong print-to-shirt height ratio.
  const scaleX = measurement.width * pixelsPerCm / view.bodyWidth;
  const scaleY = measurement.length * pixelsPerCm / (view.hemY - view.shoulderY);
  const projectX = (value: number) => 256 + (value - 256) * scaleX;
  const projectY = (value: number) => 256 + (value - 256) * scaleY;
  const widthCm = areaId === 'sleeve' ? 10 : 30;
  const heightCm = areaId === 'sleeve' ? 12 : model === 'cropped' && areaId === 'front' ? 35 : 40;
  const topGapCm = areaId === 'back' && model !== 'cropped' ? 6 : 4;
  let centerX = projectX(view.centerX);
  let centerY = projectY(view.collarY) + (topGapCm + heightCm / 2) * pixelsPerCm;
  let rotationDeg = 0;
  if (areaId === 'sleeve') {
    // Wearer's LEFT sleeve is on the viewer's RIGHT in the front photograph.
    // Its lower edge follows the sleeve hem with a 2 cm production clearance.
    const sleeve = LANDMARKS[model].sleeve;
    const originalAngle = sleeve.rotation * Math.PI / 180;
    rotationDeg = Math.atan2(Math.sin(originalAngle) * scaleY, Math.cos(originalAngle) * scaleX) * 180 / Math.PI;
    const angle = rotationDeg * Math.PI / 180;
    const inset = (heightCm / 2 + 2) * pixelsPerCm;
    centerX = projectX(sleeve.hemX) + Math.sin(angle) * inset;
    centerY = projectY(sleeve.hemY) - Math.cos(angle) * inset;
  }
  return { widthCm, heightCm, pixelsPerCm, centerX, centerY, rotationDeg, measurement, estimated: measurement.size !== size,
    imageTransform: `scale(${scaleX}, ${scaleY})`, garmentWidthPx: view.bodyWidth * scaleX,
    garmentLengthPx: (view.hemY - view.shoulderY) * scaleY, garmentHemY: projectY(view.hemY) };
}

export type ArtworkBounds = {
  sourceWidth: number;
  sourceHeight: number;
  crop: { left: number; top: number; width: number; height: number };
};
export type PrimeArtPosition = { xCm: number; yCm: number };
export interface PrimeArtworkPlacement extends PrimeArtPosition {
  version: 1;
  model: MeasuredPrimeModel;
  garmentSize: string;
  areaId: PrimeAreaId;
  widthCm: number;
  heightCm: number;
  areaWidthCm: number;
  areaHeightCm: number;
  rotationDeg: number;
  artwork: ArtworkBounds;
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

export function placePrimeArtwork(model: MeasuredPrimeModel, size: string, areaId: PrimeAreaId, printSize: string, artwork: ArtworkBounds, position?: PrimeArtPosition): PrimeArtworkPlacement {
  const area = getPrimeAreaGeometry(model, size, areaId);
  const dimensions = parsePrimePrintSize(printSize);
  if (!dimensions || dimensions[0] > area.widthCm || dimensions[1] > area.heightCm) throw new Error('A estampa ultrapassa a área de impressão.');
  const fitted = fitPrimeArtwork(printSize, artwork);
  const availableX = Math.max(0, area.widthCm - fitted.widthCm);
  const availableY = Math.max(0, area.heightCm - fitted.heightCm);
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  return {
    version: 1, model, garmentSize: size, areaId,
    xCm: clamp(position?.xCm ?? availableX / 2, availableX),
    yCm: clamp(position?.yCm ?? (areaId === 'sleeve' ? availableY : availableY / 2), availableY),
    ...fitted, areaWidthCm: area.widthCm, areaHeightCm: area.heightCm,
    rotationDeg: area.rotationDeg, artwork,
  };
}

// Shared by checkout: positions are measurements, never arbitrary CSS/transforms.
// Legacy orders without this metadata remain valid. Canonical areas and rotation
// come from the server profile, not from client-supplied limits.
export function validatePrimeArtworkPlacement(value: unknown, model: string, size: string, location: string, printSize: string): PrimeArtworkPlacement | undefined {
  if (value == null) return undefined;
  if (!isMeasuredPrimeModel(model)) throw new Error('Posicionamento indisponível para este modelo.');
  const areaId = location === 'Frente' ? 'front' : location === 'Costas' ? 'back' : location === 'Manga Esquerda' ? 'sleeve' : null;
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
  const placed = placePrimeArtwork(model, size, areaId, printSize, canonicalArtwork, input);
  if (Math.abs(placed.xCm - input.xCm) > 0.001 || Math.abs(placed.yCm - input.yCm) > 0.001) throw new Error('A estampa ultrapassa a área de impressão.');
  return placed;
}

export function describePrimePlacement(placement: PrimeArtworkPlacement): string {
  const cm = (value: number) => value.toFixed(1).replace('.', ',');
  return `Arte ${cm(placement.widthCm)} × ${cm(placement.heightCm)} cm · posição ${cm(placement.xCm)} cm da esquerda e ${cm(placement.yCm)} cm do topo da área${placement.areaId === 'sleeve' ? ' · manga esquerda de quem veste' : ''}`;
}
