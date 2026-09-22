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

### Etapa 3A publicada e conferida — 21/09/2026, 23:31 UTC

PR #107 integrado como `1fdbd251f3d0eef98b897a09b0535ee79a1e3ea1`. A execução de produção `35667559162`, job `106556573376`, concluiu com sucesso: suíte completa, 18 testes de regras, TypeScript, build, preflight, verificação de saúde da revisão candidata, promoção, Hosting e regras. Revisão Cloud Run `00210-fax`. O log confirma a publicação de `firestore.rules` às 23:31 UTC.

Conferência no navegador da versão publicada: opção “Somente essenciais” fecha o aviso; botão do rodapé reabre as preferências; página de cancelamento sem credenciais orienta o cliente e mantém a ação desabilitada. Não foi cancelado nenhum lembrete real e não foram enviados e-mails/WhatsApp nem criadas cobranças de teste em produção.

Limitação do catálogo: a consulta pública já retornava zero produtos antes destas etapas. Nesta conferência, a gestão de estoque também apresentou zero registros de produtos, enquanto outros indicadores do painel apresentavam valores históricos. Não foram criados produtos fictícios nem alterados estoques para preencher a loja. A divergência de indicadores e a origem do catálogo exigem investigação própria; fluxos de compra completos dependem de produtos reais disponíveis.

### Etapa 4 — repetição de checkout e integridade do catálogo

- Cada tentativa possui chave aleatória persistida na sessão da aba antes da requisição. O servidor reserva a tentativa em transação e cria no máximo um pedido/uma chamada de cobrança para essa chave. Repetições consultam o pagamento original; dados de cartão e contato não ficam no registro de repetição.
- Resultado incerto mantém pedido e estoque reservado. A interface oferece consulta da tentativa; a rotina de servidor reconcilia pelo identificador/referência do provedor. Consulta sem tentativa sela a chave contra uma requisição inicial atrasada. Apenas confirmação explícita de que não houve cobrança permite outra tentativa automática.
- Rejeição/cancelamento confirmados continuam pelo fluxo financeiro existente. Uma resposta atrasada não substitui o estado financeiro canônico na resposta ao cliente. Cancelamento e liberação central de estoque são bloqueados enquanto a criação da cobrança for incerta. Expiração por tempo não cancela silenciosamente cobranças do Mercado Pago.
- O dashboard distingue estoque vinculado ao catálogo de registros sem produto correspondente, preserva os registros antigos e retira suas variações dos alertas de reposição. Falha de leitura passa a ser exibida como falha, e não como confirmação de catálogo vazio.
- Indicadores passam a usar leitores financeiros canônicos e respeitam a opção de ocultar valores. Rótulos explicam recebimentos parciais e o período por criação do pedido; esse painel não substitui a conciliação por data de entrada do módulo financeiro.

Validação isolada: concorrência de cinco solicitações, perda da resposta, timeout depois da aceitação pelo provedor simulado, confirmação ausente, solicitação inicial atrasada, falha de preço, autorização de proprietário, minimização dos registros e separação de estoque sem catálogo. Nenhuma cobrança real foi criada. A proteção é por tentativa, não uma proibição global de compras deliberadas em dispositivos/abas independentes. Uma tentativa incerta sem confirmação do provedor exige reconciliação; não se presume rejeição por ausência temporária na busca.

O catálogo não foi repovoado: faltam cadastros atuais confirmados, e reconstruir produtos a partir de estoque/pedidos históricos poderia inventar preços, disponibilidade e variantes. O novo diagnóstico permite identificar essa condição sem apagar dados. Uploads, ingestão de estatísticas e demais frentes ainda serão tratados em etapas seguintes.

### Etapa 4 publicada — 22/09/2026

PR #108 integrado como `a924eceab322cec80bcbb6fcc9888e4de550c97d`. A execução de produção `35671094406` terminou com sucesso. As 11 verificações de repetição/integridade e a suíte completa passaram; não houve cobrança real.

### Etapa 5 — arquivos de arte dos clientes

- Upload pelo dispositivo e por link passa pelo servidor, com decodificação efetiva de PNG/JPEG/WebP, limite de 10 MB e 24 megapixels, remoção de metadados e saída PNG. SVG, HTML e conteúdo inválido são recusados.
- Artes novas são criptografadas individualmente no bucket. A visualização exige uma chave aleatória de 256 bits no link privado, preservada na sacola/pedido; o banco guarda apenas seu hash. Não é criado token público de download Firebase. Quem receber esse link completo poderá visualizar a arte; não é um recurso para compartilhar publicamente.
- Importação HTTPS bloqueia redes privadas, credenciais e portas alternativas, valida cada redirecionamento, fixa o IP público validado e limita tempo/tamanho. Quota transacional por hora e endereço, com hash sem IP original, complementa o limite local de requisições. Não equivale a proteção absoluta contra ataques distribuídos.
- Gestão envia imagens pelo endpoint autenticado, sem fallback para preset público. As regras mantêm imagens públicas do catálogo, restringem listagem/escrita e negam leitura direta das artes privadas a visitantes.
- Checkout aceita artes próprias apenas quando o registro e sua chave são válidos. Artes antigas de sacolas que apontem para upload público precisam ser reenviadas; pedidos históricos não são alterados nem apagados.

Oito testes isolados passaram: formatos reais, metadados, conteúdo inválido, criptografia e chave incorreta, quota concorrente, endereços proibidos, DNS/redirecionamentos e limites. Foram acrescentados testes reais de Storage e coleções privadas ao emulador demo. Neste ambiente local o emulador não inicia porque Java 21 não está instalado; a integração depende da aprovação desses testes no CI, que instala Java 21. A publicação das regras Storage só será considerada concluída após confirmação do pipeline.

Limites: arquivos públicos antigos e eventual preset unsigned já existente no Cloudinary não foram apagados/desativados pela mudança de código; isso requer acesso/configuração do provedor. Não foi definida exclusão automática de artes históricas. Upload real no dispositivo do cliente e compra real continuam pendentes de validação operacional.

### Etapa 5 — CI aprovado e verificação de produção

PR #109 integrado como `d51923c04eb3830acf217a2bf20b5ce0dbfb0e80`. CI `35671992207` aprovou código, imagens e as regras reais de Firestore/Storage. Na produção `35672430984`, API (revisão `00214-hum`) e Hosting foram publicados. A etapa final de regras retornou 403 em `firebasestorage.defaultBucket.get`: a conta não pode descobrir o bucket padrão pela API Firebase Storage.

O bucket efetivo já está identificado pela configuração do projeto e pelos arquivos do catálogo: `fpac-store62.firebasestorage.app`. A etapa seguinte configura esse bucket explicitamente na lista `storage` do Firebase CLI, formato suportado pela versão instalada. A publicação continua usando a mesma conta e a autorização de Firebase Rules; nenhuma permissão IAM é ampliada e nenhum recurso alternativo é utilizado. Sucesso das regras continua condicionado à confirmação do pipeline.

Teste pelo navegador da versão atual: importação de um PNG público do logo da própria loja exibiu “Arte importada.” Não houve dados de cliente, cobrança ou mensagem real. O navegador inicialmente serviu HTML antigo (`index-D9V6ysIp.js`); uma URL renovada carregou o arquivo publicado (`index-cRiVvfsU.js`) e o upload protegido funcionou. Será configurada revalidação do HTML para reduzir esse atraso de atualização.

### Etapa 6 — estatísticas, identidade e disponibilidade real

- Escritas anônimas diretas de navegação, quiz e promoções são substituídas por endpoints com limites, campos permitidos, datas do servidor e chave de posse da sessão. Regras bloqueiam criação/edição pelo cliente; leitura e exclusão administrativa continuam permitidas. Atualização atrasada não sobrescreve uma mais recente.
- Telemetria requer consentimento explícito, descarta contatos, rotas privadas, consultas e valores financeiros enviados pelo navegador. Conversão exige acesso ao pedido e estado financeiro aprovado; uma transação conta cada pedido uma vez, inclusive se a confirmação chega depois de outra atualização. Métricas comportamentais continuam sendo amostras de clientes que autorizaram estatísticas, não um censo nem uma proteção antibot completa.
- Quiz compartilha perguntas e cálculo entre cliente/servidor; percentuais somam 100. Resultado e contato opcional são validados; consentimento promocional começa desmarcado. Resultado final é preservado em repetição/atraso, e falha de cadastro aparece com possibilidade de tentar novamente. Histórico antigo não é apagado; opt-ins antigos não são tratados como autorização validada para contato promocional.
- Retirados do quiz contador artificial e promessa de cupom sem validade consultada. Exportações CSV neutralizam fórmulas inseridas em campos de clientes. Eventos promocionais não podem criar receita e são limitados a uma visualização/clique por campanha e sessão.
- PRIME mantém os mockups como prévias, mas só permite adicionar uma combinação ao carrinho com produto cadastrado e estoque confirmado. Prévia sem cadastro não anuncia preço de venda. O servidor também exige produto ativo, inclusive quando o perfil PRIME tem preço fixo. Estoque histórico e cadastros não foram alterados.
- A seleção de entrega local no cálculo de frete passa a usar o CEP da faixa configurada; digitar “Joinville” com outro CEP não concede frete local. O teste usa uma cotação simulada, sem chamar transportadora.
- HTML passa a exigir revalidação, mantendo cache longo para arquivos com nome versionado. Bucket de publicação é explícito, sem solicitação de novos papéis IAM.

Validação: 11 testes isolados de ingestão, 9 de arquivos/catálogo/frete, suíte completa, TypeScript, build e preflight. Adicionadas 30 verificações de negação de leitura/escrita nas coleções de ingestão ao emulador de regras. Nenhum teste cria cobrança, transporta mercadoria ou envia mensagens a contatos reais.

Pendências externas e limites preservados: catálogo real ainda vazio; restabelecer cadastros/preços/variantes exige a fonte comercial correta. Compra real e entrega de mensagens não foram exercitadas. Preset e arquivos antigos do Cloudinary, política de retenção/exclusão histórica, CSP em modo de observação, rollback conjunto de Hosting/API/regras e proteção de branch permanecem abertos. Esta sequência não é certificação integral de segurança nem conclusão de todos os fluxos possíveis.
