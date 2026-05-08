/**
 * Centralizador de chamadas de API
 * Garante que o frontend saiba onde encontrar o backend em qualquer domínio.
 */

const BACKEND_PROD_URL = 'https://ais-pre-5qzcpkpneat5vzmwyn7iab-494240747029.us-west2.run.app';

export const getApiUrl = (path: string) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // Se estivermos rodando localmente ou no domínio direto do Cloud Run, usa caminhos relativos
  if (
    window.location.hostname === 'localhost' || 
    window.location.hostname.includes('run.app') ||
    window.location.hostname.includes('aistudio.google.com') ||
    window.location.hostname.includes('fpacstore.com.br') ||
    window.location.hostname.includes('www.fpacstore.com.br')
  ) {
    return cleanPath;
  }
  
  // Se estivermos no domínio customizado (fpacstore.com.br), aponta para o servidor do Cloud Run
  return `${BACKEND_PROD_URL}${cleanPath}`;
};

/**
 * Retorna o domínio base para links externos (WhatsApp, E-mail)
 * Garante que clientes sempre recebam links para o domínio customizado.
 */
export const getBaseUrl = () => {
  const hostname = window.location.hostname;
  if (hostname.includes('aistudio.google.com') || hostname === 'localhost' || hostname.includes('run.app')) {
    return 'https://www.fpacstore.com.br';
  }
  return window.location.origin;
};
