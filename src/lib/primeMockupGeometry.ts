import type { CSSProperties } from 'react';

export interface CanvasStampBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const parsePercent = (value: CSSProperties['left']): number | null => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value.trim().endsWith('%')) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getCanvasStampBox = (
  style: CSSProperties,
  canvasWidth: number,
  canvasHeight: number,
  offsetX = 0,
  offsetY = 0,
): CanvasStampBox | null => {
  const left = parsePercent(style.left);
  const top = parsePercent(style.top);
  const width = parsePercent(style.width);
  const height = parsePercent(style.height);

  if (left === null || top === null || width === null || height === null) return null;
  if (canvasWidth <= 0 || canvasHeight <= 0 || width <= 0 || height <= 0) return null;

  const pixelWidth = canvasWidth * (width / 100);
  const pixelHeight = canvasHeight * (height / 100);
  const centerX = offsetX + canvasWidth * (left / 100);
  const centerY = offsetY + canvasHeight * (top / 100);

  return {
    x: centerX - pixelWidth / 2,
    y: centerY - pixelHeight / 2,
    width: pixelWidth,
    height: pixelHeight,
  };
};
