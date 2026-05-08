/**
 * Centralizador de chamadas de API
 * Garante que o frontend saiba onde encontrar o backend em qualquer domínio.
 */

export const getApiUrl = (path: string) => {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // No ambiente AI Studio (Express + Vite), o frontend e backend rodam na mesma origem.
  // Caminhos relativos são os mais seguros e robustos.
  return cleanPath;
};

/**
 * Retorna o domínio base para links externos (WhatsApp, E-mail)
 * Garante que clientes sempre recebam links para o domínio customizado se disponível.
 */
export const getBaseUrl = () => {
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // Se estivermos no domínio customizado, usamos ele.
  if (hostname.includes('fpacstore.com.br')) {
    return `${protocol}//${hostname}`;
  }
  
  // Caso contrário, usamos a origem atual (seja run.app ou localhost)
  return window.location.origin;
};
