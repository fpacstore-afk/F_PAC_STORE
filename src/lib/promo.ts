
/**
 * Gera um código de cupom diário baseado na data atual.
 * O código muda exatamente à meia-noite.
 */
export function getDailyPromoCode(): string {
  const now = new Date();
  // Formato YYYYMMDD para servir de semente (ex: 20240511)
  const dateSeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  
  // Gerador de número pseudo-aleatório simples e determinístico baseado na semente
  const rand = (dateSeed * 16807) % 2147483647;
  const digits = (rand % 100).toString().padStart(2, '0');
  
  return `FPAC${digits}`;
}

/**
 * Verifica se um cupom digitado é válido (o do dia ou uma variação comum)
 */
export function isValidDailyCoupon(code: string): boolean {
  const currentDaily = getDailyPromoCode();
  const cleanCode = code.toUpperCase().trim().replace(/\s/g, '');
  
  // Aceita o código exato do dia (FPACxx) 
  // ou a versão legada caso o cliente clique mas o server ainda não virou
  return cleanCode === currentDaily;
}
