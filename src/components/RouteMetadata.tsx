import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

const titles: Record<string, string> = {
  '/prime': 'Crie sua peça Prime',
  '/prime-custom': 'Crie sua peça Prime',
  '/bag': 'Minha sacola',
  '/checkout': 'Finalizar compra',
  '/tracking': 'Acompanhar pedido',
  '/account': 'Minha conta',
  '/success': 'Pedido recebido',
  '/radio': 'Rádio F PAC',
  '/clube': 'Clube F PAC',
  '/clube-fpac': 'Clube F PAC',
  '/privacy/recovery': 'Preferências de lembretes',
};

export function RouteMetadata() {
  const { pathname } = useLocation();
  const privatePage = /^\/(gestao|admin|order|order-status|checkout|account|success|tracking|bag|privacy)(\/|$)/.test(pathname);
  const title = titles[pathname] || (pathname.startsWith('/gestao') ? 'Gestão da loja' : pathname.startsWith('/order/') ? 'Meu pedido' : 'Streetwear com identidade');
  return <Helmet><title>{title} | F PAC STORE</title><meta name="robots" content={privatePage ? 'noindex, nofollow' : 'index, follow'} /></Helmet>;
}
