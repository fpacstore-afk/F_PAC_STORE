/**
 * Centralizador de chamadas de API
 * Garante que o frontend saiba onde encontrar o backend em qualquer domínio.
 */

export const getApiUrl = (path: string) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // No ambiente de produção, URLs relativas são MAIS SEGURAS para evitar problemas de CORS/Redirects.
  // Se estivermos em um domínio conhecido ou se for uma chamada para a mesma origem, usamos relativo.
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isKnownDomain = hostname.includes('fpacstore.com.br') || 
                          hostname.includes('.run.app') || 
                          hostname.includes('localhost') ||
                          hostname.includes('127.0.0.1');
    
    if (isKnownDomain) {
      return `${window.location.origin}${cleanPath}`;
    }
  }
  
  // Em último caso, tenta usar a origem atual (fallback)
  try {
    return `${window.location.origin}${cleanPath}`;
  } catch (e) {
    return cleanPath;
  }
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
