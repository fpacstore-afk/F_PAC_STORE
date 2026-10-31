/** Only names and rejection categories may leave these checks, never credential values. */
const privateNames = new Set([
  'MERCADO_PAGO_ACCESS_TOKEN', 'MP_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET',
  'MELHOR_ENVIO_TOKEN', 'RESEND_API_KEY', 'SHIPPING_WEBHOOK_SECRET',
  'SHEETS_SYNC_SECRET', 'ADMIN_API_KEY', 'FIREBASE_SERVICE_ACCOUNT',
  'INSTAGRAM_ACCESS_TOKEN', 'EVOLUTION_API_KEY', 'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'CLOUDINARY_API_SECRET', 'N8N_WEBHOOK_URL',
]);

export function isPrivateEnvironmentName(name: string): boolean {
  const normalized = name.toUpperCase();
  return privateNames.has(normalized) ||
    /(?:^|_)(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ACCOUNT|DATABASE_URL|CONNECTION_STRING)(?:_|$)/.test(normalized);
}

export function assertSafeClientEnvironment(environment: Record<string, string | undefined>): void {
  const names = Object.keys(environment).filter(name =>
    name.startsWith('VITE_') && environment[name]?.trim() && isPrivateEnvironmentName(name.slice(5)));
  if (names.length) throw new Error('Private credentials cannot use the public VITE_ prefix: ' + names.sort().join(', '));
}

export function privateEnvironmentValues(environment: Record<string, string | undefined>): string[] {
  return [...new Set(Object.entries(environment)
    .filter(([name, value]) => isPrivateEnvironmentName(name.replace(/^VITE_/, '')) && value && value.trim().length >= 16)
    .flatMap(([, value]) => {
      const text = value!.trim();
      return [text, JSON.stringify(text).slice(1, -1), encodeURIComponent(text)];
    }))];
}
