
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
  // Horário atual
  const now = Date.now();
  
  // CICLO: 3h 17min (197 minutos total)
  const cycleInMs = (3 * 60 + 17) * 60 * 1000;
  const thirtyMinutesInMs = 30 * 60 * 1000;
  
  // ÂNCORA: Dia fixo às 16:00 Brasília para alinhar o relógio
  // Usamos uma data estável no passado
  const anchorDate = new Date('2024-01-01T16:00:00-03:00').getTime();
  
  // Tempo decorrido desde a âncora
  const timeSinceAnchor = now - anchorDate;
  
  // Encontrar posição no ciclo atual (garantindo valor positivo)
  const timeIntoPeriod = ((timeSinceAnchor % cycleInMs) + cycleInMs) % cycleInMs;
  
  const isActive = timeIntoPeriod < thirtyMinutesInMs;
  
  // Cálculo determinístico do index do período para o valor do desconto
  const periodIndex = Math.floor(timeSinceAnchor / cycleInMs);
  const seed = (periodIndex * 16807) % 2147483647;
  const rand = seed / 2147483647;
  
  // Valores possíveis definidos pela probabilidade
  let discountValue = 5;
  if (rand > 0.85) discountValue = 9;
  else if (rand > 0.50) discountValue = 7;
  
  const timeLeft = isActive ? Math.floor((thirtyMinutesInMs - timeIntoPeriod) / 1000) : 0;
  const nextSaleIn = !isActive ? Math.floor((cycleInMs - timeIntoPeriod) / 1000) : 0;
  
  return {
    isActive,
    discountValue: isActive ? discountValue : 0,
    timeLeft,
    nextSaleIn
  };
}
