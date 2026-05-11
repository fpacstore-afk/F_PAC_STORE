/**
 * Centralizador de chamadas de API
 * Garante que o frontend saiba onde encontrar o backend em qualquer domínio.
 */

export const getApiUrl = (path: string) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // No ambiente AI Studio (Express + Vite), o frontend e backend rodam na mesma origem.
  // Usar URLs absolutas ajuda a evitar problemas de roteamento em domínios customizados.
  const origin = window.location.origin;
  return `${origin}${cleanPath}`;
};

/**
 * Retorna o domínio base para links externos (WhatsApp, E-mail)
 * Garante que clientes sempre recebam links para o domínio customizado se disponível.
 */
export const getBaseUrl = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // Prioritize custom domain if on it
  if (hostname.includes('fpacstore.com.br')) {
    return `${protocol}//${hostname}`;
  }
  
  // In AI Studio Dev environment, redirect to the public Preview URL
  // Dev URL: ais-dev-<hash>.run.app -> restricted
  // Pre URL: ais-pre-<hash>.run.app -> public
  if (hostname.includes('ais-dev-') && hostname.includes('.run.app')) {
    return `${protocol}//${hostname.replace('ais-dev-', 'ais-pre-')}`;
  }
  
  // Default to current origin
  return window.location.origin;
};
