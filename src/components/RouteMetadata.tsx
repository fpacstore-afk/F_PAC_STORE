import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

const titles: Record<string, string> = {
  '/': 'Streetwear com identidade',
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

const defaultDescription = 'Streetwear F PAC STORE para quem transforma estilo em identidade. Conheça as linhas FORCE, MARK e PRIME.';

export function RouteMetadata() {
  const { pathname } = useLocation();
  const privatePage = /^\/(gestao|admin|order|order-status|checkout|account|success|tracking|bag|privacy)(\/|$)/.test(pathname);
  const title = titles[pathname] || (pathname.startsWith('/gestao') ? 'Gestão da loja' : pathname.startsWith('/order/') ? 'Meu pedido' : 'Streetwear com identidade');
  const canonicalPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '') || '/';
  const canonicalUrl = `https://fpacstore.com.br${canonicalPath}`;
  const pageTitle = `${title} | F PAC STORE`;

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={defaultDescription} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={defaultDescription} />
      <meta property="og:url" content={canonicalUrl} />
      <link rel="canonical" href={canonicalUrl} />
      <meta name="robots" content={privatePage ? 'noindex, nofollow' : 'index, follow'} />
    </Helmet>
  );
}
