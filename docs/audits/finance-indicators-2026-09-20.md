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

## Validação

- 11 cenários de projeção/reconciliação: mesma base produz mesmo caixa entre módulos; espelhamento parcial de contas a pagar; cancelamento com recebimento; parcelas em horizontes diferentes; falta de vencimento; parcelas desatualizadas; vencimentos comuns a recebíveis e previsão; virada de dia no Brasil; valor inválido; controlador lendo 61 pedidos fictícios incluindo dívida antiga.
- 13 cenários novos de datas de recebimento: parcelas entre meses, estornos posteriores, histórico incompleto, duplicação por identificador, tentativas recusadas, datas do Brasil e controladores administrativos de estorno executados em memória, com repetição e preservação do histórico.
- 9 testes anteriores de leitores financeiros; 6 testes Financeiro 2.0; 9 verificações da auditoria integrada; TypeScript e build.
- As antigas verificações que procuravam nomes de variáveis no código foram substituídas por cenários comportamentais para as fórmulas refatoradas.
- Não houve teste bancário, compra real, estorno real ou conferência ponta a ponta mobile da versão proposta. Essas validações continuam pendentes.

## Limites que permanecem

Compartilhar a fórmula não basta quando as telas usam períodos ou fontes distintos. A Visão Geral ainda não recebe liquidações legadas ausentes dos movimentos de caixa, enquanto a projeção lê contas a pagar para cobrir esse caso. Conciliação entre pagamentos, movimentos manuais, anúncios, estoque, aportes e retiradas continua necessária. Não haverá reconstrução automática de valores descartados.

O leitor por data está preparado, mas continuam pendentes a conferência das datas históricas, confirmação de taxas e fretes efetivamente pagos, revisão do CMV, separação de investimento/estoque/despesa e validação em desktop e celular. Foram localizados outros pontos ainda não corrigidos nesta etapa:

- O tratamento de status do provedor em `payment.service.ts` precisa preservar o capturado e registrar montante/data do estorno; hoje a expressão de `paidAmount` retorna zero fora de `approved`. Exige validar a API e os eventos do provedor antes da mudança.
- A meta anual está salva em documentos mensais, permitindo divergência ao trocar o mês. Não foi feita migração automática.
- Algumas rotas administrativas de alteração financeira ainda alteram o status operacional. O fluxo de registro manual preserva a entrega, mas todas as rotas precisam da mesma revisão antes de certificar independência completa.
- Filtros de rentabilidade e despesa ainda precisam revisar datas ausentes e alinhar períodos/fonte de custos. O resultado por pedidos não equivale a lucro de caixa conciliado.

 Este documento não certifica saldo, faturamento ou lucro real da empresa, nem declara a auditoria geral concluída.
