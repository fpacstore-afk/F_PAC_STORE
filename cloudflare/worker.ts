interface AssetsEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

type OriginFetch = (request: Request, options: RequestInit & {
  cf: { cacheTtl: number; cacheEverything: boolean };
}) => Promise<Response>;

/** Keep the origin fixed: neither query strings nor client headers select a backend. */
export async function routeRequest(request: Request, env: AssetsEnvironment, originFetch: OriginFetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
    return env.ASSETS.fetch(request);
  }

  url.protocol = 'https:';
  url.hostname = 'fpac-store62.web.app';
  url.port = '';
  const upstream = new Request(url, request);
  upstream.headers.delete('host');

  try {
    // Preserve methods, raw webhook bodies, signatures and authentication.
    // Do not follow redirects carrying private headers to another destination.
    const response = await originFetch(upstream, {
      redirect: 'manual',
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('CDN-Cache-Control', 'no-store');
    headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch {
    return Response.json({ error: 'Serviço temporariamente indisponível. Tente novamente em instantes.' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}

export default { fetch: (request: Request, env: AssetsEnvironment) => routeRequest(request, env) };
