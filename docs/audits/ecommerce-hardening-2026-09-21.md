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

## Etapa 2 — catálogo público e sacola

- Todas as telas públicas de produtos, busca, categorias e PRIME passam pela projeção `/api/products`, com lista permitida de campos também nas estruturas aninhadas. Produtos em rascunho, inativos ou arquivados não são publicados.
- Disponibilidade pública derivada do estoque físico menos reservas, sem expor estoque físico, reservas, fornecedores ou custos. Gestão continua com a leitura operacional autenticada.
- Acesso direto a documentos de produtos restrito à gestão nas regras; configurações públicas limitadas à leitura individual de `config/brand`.
- Sacola não remove nem reduz itens automaticamente. Falha de consulta é distinta de indisponibilidade; quantidades de variações repetidas são somadas antes de continuar.
- Cache curto e compartilhado reduz leituras repetidas. Catálogo e consulta de pagamento têm limites independentes. Cache Firestore suporta múltiplas abas.
- Oito regressões isoladas adicionais, além de 18 verificações de regras reais no emulador demo, adicionadas à validação/publicação. As regras devem ser publicadas após o frontend migrado; nenhuma política de acesso é considerada ativa apenas por estar no código.

Etapa 1 publicada pelo PR #105, com pipeline de produção concluído. Tela `/success` sem pedido conferida no navegador: não exibe confirmação indevida. Teste de cobrança real não executado.

### Bloqueio de publicação das regras — 21/09/2026

PR #106 integrado como `bfee4f9f651d067c04e718f16227e444f05ca3d1`. CI e os 18 testes reais de regras passaram. Na execução de produção `35660130790`, a API (revisão `00204-siy`) e o frontend foram publicados; a etapa final de regras falhou com HTTP 403 ao consultar `firestore.googleapis.com` pela API Service Usage.

Conta de implantação: `github-fpac-cicd@fpac-store62.iam.gserviceaccount.com`. Projeto: `fpac-store62`. Precisa de revisão de permissões pelo administrador, incluindo consulta de serviços e publicação de regras Firebase. Não houve tentativa de contornar a restrição, mudar IAM ou usar outra credencial.

**As novas regras de proteção dos documentos NÃO estão confirmadas em produção.** O frontend/API já usam a projeção mínima, mas isso não substitui a regra de acesso no banco. Não repetir o deploy antes de resolver a permissão. O catálogo já estava vazio antes destes ajustes.

### Rascunho local da etapa 3 — não publicado

Branch `fix/privacy-automation-safety-20260922`. Iniciados consentimento de estatísticas, remoção de geolocalização externa e identificação pessoal na telemetria, redaction de rotas privadas, dados de checkout em sessão com limite de quatro horas e consentimento/token de posse para recuperação de sacola.

Este rascunho está incompleto e **não deve ser integrado/publicado** sem nova revisão e testes. Antes de seguir: validar controles de consentimento/revogação, não prometer opt-out por palavra-chave sem integração, escapar campos interpolados no HTML de recuperação, testar propriedade do token e atualizações simultâneas, evitar que leads legados ocupem toda a consulta de recuperação e concluir os testes automatizados. O bloqueio de permissão acima interrompeu a execução.

### Retomada após ajuste IAM — 21/09/2026, 22:47 UTC

O usuário confirmou a inclusão de Service Usage Viewer. A tentativa 2 da execução `35660130790` (job `106545581890`) passou na consulta de `firestore.googleapis.com`, nos testes e na publicação do site/API. A revisão Cloud Run `00206-kod` foi promovida. A validação das regras falhou em seguida com HTTP 403 em `firebaserules.googleapis.com/v1/projects/fpac-store62:test`.

Novo bloqueio confirmado: validação/publicação de Firebase Rules. Papel documentado para a conta de implantação: `roles/firebaserules.admin` (Firebase Rules Admin), incluindo `firebaserules.rulesets.test`, criação de rulesets e atualização de releases. Nenhuma modificação IAM foi feita pelo agente. A publicação das novas regras permanece **não confirmada**; aguardar ajuste pelo administrador antes de repetir.

No rascunho local, durante essa execução: removidas promessas de cancelamento por palavra-chave sem integração e de estoque reservado; escapados campos de cliente/produto no HTML de recuperação; adicionada validação da sessão no serviço; filtro de consentimento aplicado antes do limite da consulta; rotina de 24 horas passa a executar mesmo quando a fila inicial está vazia. Dez testes isolados passaram, sem envio de mensagens reais. TypeScript passou antes da adição do arquivo de teste.

A etapa 3 continua **incompleta e não publicada**. Ainda revisar concorrência entre captura/revogação, confirmação e repetição de revogações com rede indisponível, expiração e minimização de dados, campos antigos persistidos, controle de escrita de telemetria e comportamento das consultas em Firestore real. Os dez testes não cobrem esses pontos pendentes.

### Regras publicadas — 21/09/2026, 23:16 UTC

Após o usuário confirmar Firebase Rules Admin, a tentativa 3 da execução `35660130790`, job `106552870722`, concluiu todas as etapas com sucesso. O log confirma compilação e publicação de `firestore.rules` às 23:16 UTC. Cloud Run: revisão `00208-gix`. API `/api/health` respondeu `status: ok`. Consulta anônima de documento de produto por REST retornou HTTP 403; não foram lidos dados pessoais nesse teste.

### Etapa 3A — privacidade e autorização dos lembretes

O rascunho foi revisado e ampliado com:

- Estatísticas opcionais mediante escolha explícita, com alteração pelo rodapé. Removidas identificação pessoal, consulta externa de localização e parâmetros/rotas privadas da telemetria do cliente.
- Dados de contato, CPF, endereço e observações do checkout ficam na sessão da aba por até quatro horas de atividade, excluídos da persistência compartilhada da sacola. A migração limpa esses campos da persistência antiga e o logout limpa a sessão do checkout.
- Recuperação exige autorização opcional, token de posse e prazo máximo de 48 horas. Captura mínima não inclui CPF, endereço ou arquivos de arte. Leads antigos sem consentimento não recebem lembretes.
- Revogação é definitiva para aquela sessão; uma captura atrasada não restaura consentimento. Nova autorização cria outra sessão. Cancelamentos com falha de rede permanecem pendentes na aba, com aviso, botão de nova tentativa e repetição ao reconectar.
- Link de cancelamento separado da autorização de edição, com segredo no fragmento da URL e confirmação explícita. A resposta não expõe o contato. A confirmação não depende da sessão original do navegador.
- Cada etapa automática é reservada em transação; consentimento/pagamento são consultados novamente antes do envio. Rotinas concorrentes não duplicam o mesmo lembrete. A segunda etapa não depende da existência de novos leads na fila inicial.
- Campos interpolados em e-mail são escapados. Não se promete estoque reservado nem cancelamento por palavra-chave sem integração. Falha ou ausência da integração WhatsApp não aparece como mensagem enviada; erros retornados pelo provedor de e-mail são tratados.

Validação: suíte `test:privacy-safety` com 16 verificações isoladas, suíte completa de regressão e TypeScript passaram. As chamadas de teste não usaram integrações reais nem enviaram mensagens. Testes locais não equivalem a entrega efetiva de WhatsApp/e-mail em produção. O envio real depende das credenciais já configuradas.

Escopo seguinte da auditoria: substituir as escritas públicas de telemetria/quiz por ingestão com validação e propriedade, controlar uploads públicos, revisar idempotência do checkout, melhorar proteção/recuperação da publicação e validar desempenho/acessibilidade. Dados históricos pessoais não foram apagados. A expiração dos lembretes impede novos disparos, mas não implementa exclusão automática de registros históricos.
