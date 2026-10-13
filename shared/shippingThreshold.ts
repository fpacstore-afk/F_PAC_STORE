export const FREE_SHIPPING_MIN_PIECES = 3;

export function qualifiesForFreeShipping(pieceCount: number): boolean {
  return Number.isFinite(pieceCount) && Math.floor(pieceCount) >= FREE_SHIPPING_MIN_PIECES;
}
