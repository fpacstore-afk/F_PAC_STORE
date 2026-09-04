import type { CSSProperties } from 'react';

export interface PrintSizingPosition {
  maxDimensions: string;
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

export interface PrintSizeOption {
  id: string;
}

export const parseDimensionsCm = (value: string): [number, number] | null => {
  const match = value.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return [width, height];
};

export const isSizeCompatibleWithPosition = (
  sizeCm: string,
  position: PrintSizingPosition,
): boolean => {
  const size = parseDimensionsCm(sizeCm);
  const max = parseDimensionsCm(position.maxDimensions);
  if (!size || !max) return false;

  return size[0] <= max[0] && size[1] <= max[1];
};

export const getCompatiblePrintSizes = <T extends PrintSizeOption>(
  options: readonly T[],
  position: PrintSizingPosition,
): T[] => options.filter(option => isSizeCompatibleWithPosition(option.id, position));

export const getSafePrintSize = <T extends PrintSizeOption>(
  requestedSize: string,
  options: readonly T[],
  position: PrintSizingPosition,
  defaultSize: string,
): string => {
  if (isSizeCompatibleWithPosition(requestedSize, position)) return requestedSize;
  if (isSizeCompatibleWithPosition(defaultSize, position)) return defaultSize;

  return getCompatiblePrintSizes(options, position)[0]?.id || '';
};

const parsePercent = (value?: string): number | null => {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatPercent = (value: number): string => `${Number(value.toFixed(4))}%`;

export const getStampPreviewStyle = (
  sizeCm: string,
  position: PrintSizingPosition,
): CSSProperties => {
  const size = parseDimensionsCm(sizeCm);
  const max = parseDimensionsCm(position.maxDimensions);
  const maxWidthPercent = parsePercent(position.coordinateStyle.maxWidth);
  const maxHeightPercent = parsePercent(position.coordinateStyle.maxHeight);

  if (!size || !max || maxWidthPercent === null || maxHeightPercent === null) {
    return position.coordinateStyle;
  }

  const widthRatio = Math.min(size[0] / max[0], 1);
  const heightRatio = Math.min(size[1] / max[1], 1);

  return {
    ...position.coordinateStyle,
    width: formatPercent(maxWidthPercent * widthRatio),
    height: formatPercent(maxHeightPercent * heightRatio),
  };
};
