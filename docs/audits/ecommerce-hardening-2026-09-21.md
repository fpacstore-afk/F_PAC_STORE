# Correções da auditoria do e-commerce

## Etapa 1 — pagamento, acesso e integridade

Base: `7360353fce3dcc29f4613eca92fe2367fe1dda66`.

- PIX copia o código da cobrança fornecido pelo Mercado Pago; não uma chave fixa. QR de contingência gerado localmente.
- Consulta de pagamento exige proprietário autenticado ou token de acompanhamento; ambas as rotas usam a mesma autorização e retornam apenas status, sem dados pessoais.
- Consulta pública não executa reconciliação nem modifica pedidos; confirmação continua pela rotina de pagamento e webhook.
- Identidade do checkout deriva do token Firebase validado no servidor, nunca de `body.userId`. Token inválido retorna 401, sem rebaixamento silencioso para visitante.
- Cartão pendente não aparece como pagamento confirmado. A tela de resultado consulta o servidor; evento de compra somente após aprovação.
- Retirado o código que apagava automaticamente produtos cujo nome continha TEST/TESTE ao abrir a gestão. Nenhum produto foi apagado nesta correção.
- Retirados depoimentos padrão fictícios e a alternância pública de moderação. Avaliações existentes preservadas.
- Publicação passa a executar todas as suítes de regressão isoladas, além de TypeScript, build e preflight.

### Validação local

`npm run test:all`, `npm run lint`, `npm run build`, `NODE_ENV=production npm run preflight:production` e `git diff --check` passaram. A nova suíte contém 14 verificações, incluindo acesso negado/permitido, identidade, resposta mínima e ausência de mutações na consulta. Os testes usam banco em memória e não geram cobranças reais.

### Limites e próximos passos

Esta etapa não equivale a uma certificação de segurança nem a um teste de pagamento real. Ainda devem ser tratados: regras de leitura de dados públicos, uploads, consentimento e retenção de dados, segurança das automações de recuperação, idempotência ponta a ponta de tentativas de checkout, proteções de publicação, desempenho e experiência móvel. Compras reais, mensagens a clientes, exclusões de dados e alteração de credenciais não fazem parte dos testes executados.
