# Roteamento do domínio F PAC

O domínio `fpacstore.com.br` é servido pelo Worker `cool-bird-be54`, conectado à branch `main` deste repositório. O painel usa `npm run build` e `npx wrangler deploy`. O arquivo `wrangler.json` passa a declarar o comportamento, sem depender da detecção automática de site estático.

- Páginas, imagens e bundles continuam nos Static Assets, com fallback SPA.
- Somente `/api` e `/api/*` executam o proxy de `cloudflare/worker.ts`.
- O destino é fixo: `https://fpac-store62.web.app`, cujo rewrite encaminha ao Cloud Run. O proxy mantém caminho, query, método, corpo e cabeçalhos de autenticação e assinatura.
- Respostas de API não são armazenadas em cache. Erros do servidor preservam seu status; falha de conexão resulta em JSON com status 502. Redirecionamentos não são seguidos pelo proxy.
- `public/.assetsignore`, copiado ao build pelo Vite, exclui `server.cjs` e source maps dos arquivos públicos. `public/_headers` aplica os cabeçalhos do frontend no Cloudflare.
- Não há alteração de plano, credenciais, regras do Firestore ou destino das notificações do Mercado Pago.

## Validação

Antes da integração: TypeScript, `test:cloudflare-routing`, build, CI completo e `wrangler deploy --dry-run` (validado com Wrangler 4.143.1). O teste isolado nunca envia pagamentos.

Depois da publicação do Cloudflare, além do workflow Google Cloud/Firebase:

```powershell
$env:PUBLIC_API_BASE_URL = 'https://fpacstore.com.br'
npm run verify:live-api
```

Esse teste faz GET de saúde e POST vazio no webhook, que deve retornar `OK (Ignored - No ID)`. Verificar também `/api/products`, página inicial, rota interna e um bundle estático. Não substituir este teste por GET do webhook: ele não comprova que POST chega ao servidor.

## Recuperação

Se necessário, reverter o commit de roteamento e acompanhar a nova publicação no Cloudflare. Isso restaura o comportamento estático anterior, mas também restaura a falha de API no domínio; o endpoint canônico do Firebase continua sendo a alternativa validada. Não alterar DNS ou excluir o Worker para efetuar rollback.

Referências: [configuração de ativos e roteamento](https://developers.cloudflare.com/workers/static-assets/binding/) e [cabeçalhos de ativos](https://developers.cloudflare.com/workers/static-assets/headers/).
