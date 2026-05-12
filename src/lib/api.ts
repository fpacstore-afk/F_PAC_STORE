/**
 * Centralizador de chamadas de API
 * Garante que o frontend saiba onde encontrar o backend em qualquer domínio.
 */

export const getApiUrl = (path: string) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // No ambiente de produção, URLs relativas são MAIS SEGURAS para evitar problemas de CORS/Redirects.
  // Usar a URL absoluta com 'www' ou 'root' misturados causa redirecionamentos que podem mudar POST para GET.
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isKnownDomain = hostname.includes('fpacstore.com.br') || 
                          hostname.includes('.run.app') || 
                          hostname.includes('localhost') ||
                          hostname.includes('127.0.0.1');
    
    if (isKnownDomain) {
      console.log(`[API] Using relative path for: ${cleanPath}`);
      return cleanPath;
    }
  }
  
  const origin = window.location.origin;
  const result = `${origin}${cleanPath}`;
  console.log(`[API] Derived URL: ${result}`);
  return result;
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
