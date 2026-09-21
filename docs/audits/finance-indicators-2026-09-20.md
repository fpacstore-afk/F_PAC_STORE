# Indicadores financeiros — revisão técnica em andamento

## Retificação do fundador

Os valores do diagnóstico anterior, parte 2, foram desconsiderados por orientação do fundador. Os valores da parte 3 foram contestados e não estão validados. Não usar esses números, suas somas ou diferenças para cálculos, limpeza de dados ou decisões empresariais. Solicitar valores corretos apenas quando necessários à conciliação de itens concretos.

Nenhum registro de produção foi modificado nesta revisão. A proposta permanece em rascunho, sem autorização de publicação. Os testes usam dados fictícios em memória, não os números contestados.

## Fontes e escopos identificados

| Tela | Origem e escopo | Situação |
|---|---|---|
| Visão Geral | Recebimentos por data de pagamento/estorno; rentabilidade mantém pedidos por criação | Indicador recebido usa o cálculo comum com Metas. Rentabilidade continua por coorte de pedidos, com escopo identificado; conciliação histórica pendente. |
| Contas a Receber | Consulta própria de pedidos; indicadores globais; filtros aplicados à lista | Corrigida a consulta limitada aos últimos 50 pedidos. Paginação visual mantida. Erro de leitura não mostra saldos zerados. |
| Projeção de caixa | Consulta completa de pedidos, contas a pagar, caixa e anúncios | Cálculo de movimentos compartilhado com Visão Geral e servidor. Vencimentos reais controlam horizontes. |
| Metas | Histórico de recebimentos e estornos com datas registradas | Removido fallback de criação. Valores sem data ou com histórico divergente exigem conferência; a meta anual ainda é armazenada no documento mensal e requer revisão. |
| Rentabilidade | Custos de itens, snapshots e estimativas | Pendente: confirmar custos reais, cobertura e classificação; resultado estimado não equivale a lucro real. |

## Correções desta etapa

- Totais de recebíveis não dependem de carregar páginas adicionais; registros legados sem `createdAt` não são excluídos pela ordenação do Firestore. A lista continua paginada em 20 itens. Consultar todos os pedidos aumenta o volume de leitura; para uma base maior, migrar os totais para agregações de servidor com paginação independente.
- Cálculo comum de entradas, estornos, taxas, fretes, movimentos manuais e anúncios. Lançamentos cancelados/anulados são tratados de forma consistente. Taxas padrão e fretes legados ainda podem ser estimativas; a tela explicita que o saldo calculado não é saldo bancário conciliado.
- Uma liquidação vinculada à conta a pagar entra uma vez. Se só parte do pagamento foi espelhada em caixa, acrescenta-se apenas a diferença efetivamente paga. A vinculação usa referência estável, nunca descrição ou valor semelhante.
- A previsão usa o saldo restante e os vencimentos individuais das parcelas. Não antecipa toda a dívida para o próximo vencimento; não projeta mais que o saldo a receber ou a pagar.
- Saldos sem vencimento confiável são mostrados à parte. O antigo vencimento presumido de criação mais 24 horas foi removido da leitura financeira de recebíveis. Isso não altera vencimentos gravados nem a expiração definida pelo provedor no checkout.
- Datas são comparadas pelo dia em São Paulo; um vencimento sem data não vira atraso. Erros numéricos na previsão são recusados com mensagem, em vez de serializados como zero.
- Pedidos cancelados deixam de gerar recebíveis, mantendo os valores de pagamentos e estornos efetivamente registrados no cálculo de caixa.

## Recebimentos e estornos por data

- Visão Geral e Metas compartilham `shared/financialReceipts.ts`. Pagamentos parciais entram nas próprias datas; estornos são descontados quando registrados, inclusive quando geram resultado mensal negativo. Um pagamento realizado depois da entrega continua sendo recebido na data financeira.
- Não se usa criação/entrega do pedido como prova da data de pagamento. Histórico parcial mantém o valor restante sem mês definido. Esses registros são sinalizados, sem apagar ou reconstruir movimentos antigos.
- Identificadores de eventos evitam dupla contagem. Pagamentos diferentes de mesmo valor/data permanecem separados. Eventos conflitantes ou cuja soma supera o valor capturado são sinalizados, sem rateio arbitrário.
- Metas e indicador de recebimento usam o mesmo limite de data corrente no Brasil. Datas financeiras futuras não antecipam a meta realizada. O percentual pode superar 100%; apenas a barra visual é limitada.
- Alterações administrativas de pagamento/estorno passam a registrar o incremento, em vez do acumulado. Repetir a mesma chave de operação não altera novamente o pedido ou histórico; reutilizá-la com outro pedido/status/valor de estorno é recusado.
- Estorno parcial sem valor, negativo, inválido ou acima do disponível é recusado. Não se presume que um pedido sem recebimento tenha dinheiro a devolver. Aprovar novamente um pagamento sem valor novo não muda sua data de recebimento.
- Anotações existentes são preservadas. Novos pagamentos manuais e estornos recebem identificadores estáveis nos respectivos históricos.
- Atualizações do Mercado Pago preservam o valor capturado, leem o total acumulado em `transaction_amount_refunded` e registram apenas o incremento de cada estorno. Notificações repetidas não duplicam movimentos.
- Pagamento, estorno e falha de cobrança não sobrescrevem mais `order.status`, `productionStatus` ou `shippingStatus`. Pedidos manuais novos também gravam cada domínio em seu campo canônico.
- O cadastro manual não mistura mais pagamento com a etapa operacional. O formulário limpa pagamento, parcelas e vencimento depois de salvar, e pedidos cancelados não registram recebimento inicial. Um pedido já entregue pode continuar com saldo pendente e ser quitado depois sem perder os estados de produção e entrega.

## Custo automático no cadastro de produtos

- A fonte foi modelada por perfil de `modelo base + acabamento + linha comercial`. O perfil mais específico prevalece; `TODOS` funciona como curinga controlado.
- Os três pontos de cadastro localizados passam a preencher o custo automaticamente e deixam o campo somente leitura quando há um perfil compatível. Sem perfil, o preenchimento manual continua disponível e é identificado como tal.
- A sincronização do Google Sheets ganhou uma aba persistente `CUSTOS PRODUTO`. Alterar o resultado calculado nessa fonte, com o acionador configurado, atualiza o documento central e os produtos compatíveis. A sincronização exige `SHEETS_SYNC_SECRET`; a chave não é incluída no código-fonte.
- O valor inicial auditado para Oversized Premium estampada FORCE é R$ 30,51. Ele exclui a taxa de checkout de R$ 0,79 e a entrega, que são contabilizadas separadamente. O perfil permanece `partial`: não é tratado como custo completo enquanto aproveitamento/perda de DTF, mão de obra, energia, outros custos, rateio fixo e frete da embalagem não forem confirmados.
- O valor inicial da peça lisa é R$ 29,91 e também permanece parcial pelos componentes pendentes.
- Cada custo privado grava origem, perfil, cobertura e data do cálculo em `product_costs`, coleção exclusiva do administrador. Os documentos públicos em `products` deixam de receber custo; cadastros e sincronizações removem os campos legados. Checkout e pedidos manuais gravam `unitCostSnapshot`, `totalCostSnapshot` e cobertura no item. Mudanças futuras na planilha atualizam novas vendas sem reescrever o CMV histórico dos pedidos existentes.
- Resultados baseados em perfil parcial são classificados como estimados nas leituras financeiras. A taxa do gateway continua fora do COGS, evitando dupla contagem.

## Validação

- 11 cenários de projeção/reconciliação: mesma base produz mesmo caixa entre módulos; espelhamento parcial de contas a pagar; cancelamento com recebimento; parcelas em horizontes diferentes; falta de vencimento; parcelas desatualizadas; vencimentos comuns a recebíveis e previsão; virada de dia no Brasil; valor inválido; controlador lendo 61 pedidos fictícios incluindo dívida antiga.
- 13 cenários novos de datas de recebimento: parcelas entre meses, estornos posteriores, histórico incompleto, duplicação por identificador, tentativas recusadas, datas do Brasil e controladores administrativos de estorno executados em memória, com repetição e preservação do histórico.
- 5 cenários do provedor: estorno parcial, estorno total sem campo acumulado legado, notificação rejeitada fora de ordem, bloqueio de estorno acima da captura e replay sem duplicação, preservando entrega/produção.
- 3 cenários do pedido manual: mapeamento operacional independente, bloqueio de recebimento inicial em pedido cancelado e entrega preservada durante pagamento parcial, quitação e replay.
- Verificações da automação e privacidade de custos: seleção de perfil, precedência específica, validação do payload da planilha, exclusão da taxa de checkout, bloqueio de cobertura completa com componentes pendentes, metadados, gravação administrativa privada, regras de acesso, limpeza dos campos públicos, snapshots históricos, autenticação e sintaxe do Apps Script.
- 9 testes anteriores de leitores financeiros; 6 testes Financeiro 2.0; 9 verificações da auditoria integrada; TypeScript e build.
- As antigas verificações que procuravam nomes de variáveis no código foram substituídas por cenários comportamentais para as fórmulas refatoradas.
- Não houve teste bancário, compra real, estorno real ou conferência ponta a ponta mobile da versão proposta. Essas validações continuam pendentes.

## Limites que permanecem

Compartilhar a fórmula não basta quando as telas usam períodos ou fontes distintos. A Visão Geral ainda não recebe liquidações legadas ausentes dos movimentos de caixa, enquanto a projeção lê contas a pagar para cobrir esse caso. Conciliação entre pagamentos, movimentos manuais, anúncios, estoque, aportes e retiradas continua necessária. Não haverá reconstrução automática de valores descartados.

O leitor por data está preparado, mas continuam pendentes a conferência das datas históricas, confirmação de taxas e fretes efetivamente pagos, revisão do CMV, separação de investimento/estoque/despesa e validação em desktop e celular. Foram localizados outros pontos ainda não corrigidos nesta etapa:

- A meta anual está salva em documentos mensais, permitindo divergência ao trocar o mês. Não foi feita migração automática.
- Registros históricos ainda podem conter rótulos financeiros antigos em `order.status`. Esta etapa impede novas sobreposições, mas não migra automaticamente documentos antigos sem conciliação individual.
- Filtros de rentabilidade e despesa ainda precisam revisar datas ausentes e alinhar períodos/fonte de custos. O resultado por pedidos não equivale a lucro de caixa conciliado.
- A automação da planilha só fica ativa após importar o arquivo para Google Sheets, instalar o Apps Script, configurar a chave segura e o acionador. O arquivo XLSX armazenado isoladamente não envia alterações ao site por conta própria.
- O código agora separa os custos novos em `product_costs` e mantém `products` sem custo. Documentos públicos históricos só serão limpos pela primeira sincronização/correção administrativa depois de uma publicação autorizada; nenhuma migração foi executada em produção nesta proposta.

 Este documento não certifica saldo, faturamento ou lucro real da empresa, nem declara a auditoria geral concluída.
