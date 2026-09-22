const STORAGE_KEY = 'fpac_checkout_attempt_v1';
export function readCheckoutAttempt(): string {
  try {
    const key = sessionStorage.getItem(STORAGE_KEY) || '';
    return /^[a-f0-9]{64}$/.test(key) ? key : '';
  } catch { return ''; }
}
export function beginCheckoutAttempt(): string {
  const existing = readCheckoutAttempt();
  if (existing) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  // Fail before submitting if the retry identity cannot survive a page reload.
  try { sessionStorage.setItem(STORAGE_KEY, key); }
  catch { throw new Error('Permita o armazenamento da sessão no navegador para iniciar o pagamento com segurança.'); }
  return key;
}
export function finishCheckoutAttempt(key: string) {
  if (readCheckoutAttempt() === key) sessionStorage.removeItem(STORAGE_KEY);
}
