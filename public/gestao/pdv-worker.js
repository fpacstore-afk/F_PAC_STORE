// Only the app entry has an offline response. Orders, credentials and inventory
// always use the network and are never stored in a service-worker cache.
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !/^\/gestao\/pdv\/?$/.test(url.pathname)) return;

  event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => new Response(
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>F PAC PDV</title><main><h1>PDV sem conexão</h1><p>Conecte-se à internet para abrir o PDV e consultar o estoque atualizado.</p><p><a href="/gestao/pdv">Tentar novamente</a></p></main></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )));
});
