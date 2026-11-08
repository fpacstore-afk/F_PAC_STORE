# Auditoria de segurança — F PAC STORE — 08/11/2026

Referência solicitada: https://www.instagram.com/reel/DfavSnnD808/ . A análise usa os sete riscos descritos na legenda pública. Não houve acesso ao áudio integral do vídeo.

Escopo: frontend, APIs Express, Firebase Auth, regras Firestore/Storage, exposição de artefatos, pagamentos, uploads, rastreio e dependências de produção. Os testes de escrita usam banco em memória ou emuladores `demo-fpac-ecommerce-audit`, sem pagamentos, pedidos ou contas reais.

## Resultado por risco do vídeo

| Risco | Verificação e resultado |
| --- | --- |
| Chaves privadas no navegador | O build público é inspecionado e rejeita credenciais reconhecidas e valores privados do ambiente. A configuração Vite rejeita variáveis privadas com prefixo público. Nenhuma chave privada real foi identificada nos arquivos examinados; exemplos e detectores não são credenciais. A chave pública do Firebase não é uma credencial administrativa. |
| Banco acessível diretamente | Encontrada leitura pública de `estampas`, coleção legada com possibilidade de campos operacionais. Leitura agora exige administrador. O PRIME usa `/api/stamps`, que reúne os registros atuais e legados por projeção permitida, sem custos, estoque bruto ou arquivos de produção. Uma versão atual inativa prevalece sobre uma versão legada ativa. |
| Arquivos de ambiente publicados | `.env` real não é versionado; há `.env.example` com valores de exemplo. O servidor bloqueia arquivos privados e o build limita o conteúdo publicado. O backup ZIP legado do repositório está inválido e não pôde ser inspecionado integralmente; ele não faz parte do diretório frontend publicado. Não foi realizada certificação de todo o histórico Git. |
| Login validado só na interface | As APIs validam ID tokens no servidor. Administração, cancelamento, devolução e rastreio agora verificam também revogação, independentemente da antiga opção de ambiente. Claims/roles administrativas não podem ser gravadas pelo próprio cliente. |
| Acesso ao pedido de outro cliente por ID | Propriedade é validada por UID; o fallback de e-mail só atende pedidos sem UID e exige e-mail verificado. Rastreio também admite token aleatório cujo hash é armazenado. Testes negam outro cliente e não expõem dados pessoais. Respostas de rastreio agora são privadas, sem cache, com erros genéricos e parâmetros de token tipados. |
| Formulários sem proteção contra abuso | Encontrada criação direta de avaliações que contornava a API. O envio agora usa API com validação, limite compartilhado de 5 tentativas por hora por IP e identidade derivada do token. Cliente não controla autor, data ou compra verificada. A gravação direta de avaliações está restrita à administração. Também foi encerrada a criação pública na coleção legada `interactions`, sem chamadas atuais no código. Checkout, leads e uploads já têm limites próprios. O cadastro direto no Firebase Auth depende ainda dos controles do provedor. |
| Painel oculto sem autorização real | Middleware administrativo exige ID token válido e autorização no servidor, ou segredo de integração no servidor. O segredo de sincronização é aceito somente na rota específica. Testes cobrem visitante, cliente comum, e-mail administrativo não verificado e administrador válido. |

## Alterações e preservação de funcionamento

A loja mantém avaliações públicas, escolha de estampas e links seguros de rastreio. As escritas e leituras sensíveis passam por validação no servidor. O envio de avaliações de visitante permanece disponível; `verified` é definido como falso pelo servidor, sem inventar confirmação de compra. Limites por IP reduzem abuso, mas não são garantia contra redes distribuídas de bots.

Não houve migração nem exclusão de pedidos, clientes ou dados financeiros. Não foram substituídas credenciais nem alterados valores de produtos.

## Validação reproduzível

- `npm run test:all`: 89 suítes isoladas aprovadas na execução local.
- `npm run test:security-hardening`: 12 cenários, incluindo identidade e limite de avaliações, revogação, propriedade e cache de rastreio.
- `npm run lint`, `npm run build` e `NODE_ENV=production npm run preflight:production`.
- `npm audit --omit=dev`: nenhuma vulnerabilidade conhecida na consulta de 08/11/2026.
- `npm run verify:security-rules`: testes de visitante, cliente, e-mail administrativo não verificado e administrador nos emuladores Firestore e Storage. A execução local requer Java 21; o pipeline obrigatório provisiona essa versão antes de testar e publicar.
- O pipeline também verifica rotas e artefatos privados no candidato antes de promover tráfego e testa novamente os endpoints publicados. As regras Firebase são publicadas no mesmo fluxo.

## Limites e acompanhamento

Auditoria é uma verificação com escopo e data; não comprova ausência de qualquer vulnerabilidade nem de exploração anterior. Não foram feitos testes de carga, invasões de contas, leitura de pedidos reais ou varredura de dados de clientes.

MFA, proteção contra enumeração e reCAPTCHA do Firebase Auth só podem ser confirmados com leitura autorizada da configuração do provedor. O deploy tenta essa leitura sem acessar contas; resultado `not_verified` significa configuração não confirmada, não proteção ausente. Não foram habilitados mecanismos que exigem configuração de chaves ou adesão dos administradores sem validar essas dependências.

O app separado de orçamento/mockups não pertence a este repositório e precisa de auditoria própria. Esta entrega cobre a loja principal `fpacstore.com.br` e seu backend.

Documentação primária: https://firebase.google.com/docs/rules/rules-and-auth , https://firebase.google.com/docs/auth/admin/verify-id-tokens , https://firebase.google.com/docs/projects/api-keys e https://firebase.google.com/docs/app-check .
