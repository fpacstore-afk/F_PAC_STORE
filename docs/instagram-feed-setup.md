# Feed oficial do Instagram — configuração de produção

## Arquitetura implementada

- A Home consulta somente `GET /api/instagram/feed` na mesma origem.
- O backend consulta a Instagram Graph API v25.0.
- O token nunca é enviado ao navegador.
- As respostas ficam em cache por 15 minutos no processo e por 5 minutos no CDN/navegador.
- Falhas da Meta não derrubam a Home; o site mantém apenas o link oficial para `@f_pac_store`.
- Cards manuais do Firestore não são usados como se fossem um feed real.

## Pré-requisitos da conta

1. `@f_pac_store` precisa ser uma conta profissional do Instagram: **Empresa** ou **Criador de conteúdo**.
2. Criar ou selecionar um app em Meta for Developers.
3. Adicionar o produto **Instagram** e configurar **Instagram API with Instagram Login**.
4. Autorizar a conta com a permissão básica de leitura indicada pelo painel atual da Meta.
5. Gerar o token para a conta autorizada.

## Variáveis do Cloud Run

- Segredo obrigatório: `INSTAGRAM_ACCESS_TOKEN`
- Variável opcional: `INSTAGRAM_GRAPH_API_VERSION=v25.0`

O segredo deve ser criado no Google Cloud Secret Manager e mapeado para o serviço Cloud Run. Nunca usar variável `VITE_*`, arquivo versionado ou valor literal no código.

## Validação depois da autorização

1. Abrir `https://fpacstore.com.br/api/instagram/feed?limit=6`.
2. Confirmar `configured: true` e uma lista `items` com publicações reais.
3. Abrir a Home em janela anônima.
4. Confirmar imagem/capa, indicação de vídeo e abertura da publicação correta.
5. Conferir celular, tablet e desktop.

## Manutenção

Tokens emitidos pela Meta têm ciclo de vida próprio. A data de expiração precisa ser registrada quando o token for gerado e sua renovação deve ocorrer antes do vencimento. A Home continuará funcional, com o botão para o perfil oficial, caso a API esteja temporariamente indisponível.
