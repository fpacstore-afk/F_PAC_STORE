
/**
 * Lógica do Drop Relâmpago (Flash Sale)
 * Ocorre a cada 3 horas e dura 30 minutos.
 * Valores: R$ 5 (50%), R$ 7 (35%), R$ 9 (15%)
 */

export interface FlashSaleInfo {
  isActive: boolean;
  discountValue: number;
  timeLeft: number; // segundos
  nextSaleIn: number; // segundos para a próxima se não estiver ativa
}

export function getFlashSaleInfo(): FlashSaleInfo {
  const now = Date.now();
  const threeHoursInMs = 3 * 60 * 60 * 1000;
  const thirtyMinutesInMs = 30 * 60 * 1000;
  
  const periodIndex = Math.floor(now / threeHoursInMs);
  const periodStart = periodIndex * threeHoursInMs;
  const timeIntoPeriod = now - periodStart;
  
  const isActive = timeIntoPeriod < thirtyMinutesInMs;
  
  // Cálculo determinístico do desconto baseado no índice do período
  // Usamos uma "seed" simples baseada no periodIndex
  const seed = (periodIndex * 16807) % 2147483647;
  const rand = seed / 2147483647;
  
  let discountValue = 0;
  if (rand < 0.5) {
    discountValue = 5;
  } else if (rand < 0.85) {
    discountValue = 7;
  } else {
    discountValue = 9;
  }
  
  const timeLeft = isActive ? Math.floor((thirtyMinutesInMs - timeIntoPeriod) / 1000) : 0;
  const nextSaleIn = !isActive ? Math.floor((threeHoursInMs - timeIntoPeriod) / 1000) : 0;
  
  return {
    isActive,
    discountValue: isActive ? discountValue : 0,
    timeLeft,
    nextSaleIn
  };
}
