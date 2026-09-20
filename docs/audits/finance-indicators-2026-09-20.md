# Indicadores financeiros — revisão técnica em andamento

## Retificação do fundador

Os valores do diagnóstico anterior, parte 2, foram desconsiderados por orientação do fundador. Os valores da parte 3 foram contestados e não estão validados. Não usar esses números, suas somas ou diferenças para cálculos, limpeza de dados ou decisões empresariais. Solicitar valores corretos apenas quando necessários à conciliação de itens concretos.

Nenhum registro de produção foi modificado nesta revisão. A proposta permanece em rascunho, sem autorização de publicação. Os testes usam dados fictícios em memória, não os números contestados.

## Fontes e escopos identificados

| Tela | Origem e escopo | Situação |
|---|---|---|
| Visão Geral | Pedidos filtrados por criação; caixa, investimentos e anúncios por suas datas | Ainda exige revisão dos recebimentos por competência de caixa e conciliação histórica. |
| Contas a Receber | Consulta própria de pedidos; indicadores globais; filtros aplicados à lista | Corrigida a consulta limitada aos últimos 50 pedidos. Paginação visual mantida. Erro de leitura não mostra saldos zerados. |
| Projeção de caixa | Consulta completa de pedidos, contas a pagar, caixa e anúncios | Cálculo de movimentos compartilhado com Visão Geral e servidor. Vencimentos reais controlam horizontes. |
| Metas | Registros de pagamento ou data de pagamento; fallback legado de criação | Pendente: tratar estornos por data, registros incompletos e fallback sem presumir recebimento no mês de criação. |
| Rentabilidade | Custos de itens, snapshots e estimativas | Pendente: confirmar custos reais, cobertura e classificação; resultado estimado não equivale a lucro real. |

## Correções desta etapa

- Totais de recebíveis não dependem de carregar páginas adicionais; registros legados sem `createdAt` não são excluídos pela ordenação do Firestore. A lista continua paginada em 20 itens. Consultar todos os pedidos aumenta o volume de leitura; para uma base maior, migrar os totais para agregações de servidor com paginação independente.
- Cálculo comum de entradas, estornos, taxas, fretes, movimentos manuais e anúncios. Lançamentos cancelados/anulados são tratados de forma consistente. Taxas padrão e fretes legados ainda podem ser estimativas; a tela explicita que o saldo calculado não é saldo bancário conciliado.
- Uma liquidação vinculada à conta a pagar entra uma vez. Se só parte do pagamento foi espelhada em caixa, acrescenta-se apenas a diferença efetivamente paga. A vinculação usa referência estável, nunca descrição ou valor semelhante.
- A previsão usa o saldo restante e os vencimentos individuais das parcelas. Não antecipa toda a dívida para o próximo vencimento; não projeta mais que o saldo a receber ou a pagar.
- Saldos sem vencimento confiável são mostrados à parte. O antigo vencimento presumido de criação mais 24 horas foi removido da leitura financeira de recebíveis. Isso não altera vencimentos gravados nem a expiração definida pelo provedor no checkout.
- Datas são comparadas pelo dia em São Paulo; um vencimento sem data não vira atraso. Erros numéricos na previsão são recusados com mensagem, em vez de serializados como zero.
- Pedidos cancelados deixam de gerar recebíveis, mantendo os valores de pagamentos e estornos efetivamente registrados no cálculo de caixa.

## Validação

- 11 cenários de projeção/reconciliação: mesma base produz mesmo caixa entre módulos; espelhamento parcial de contas a pagar; cancelamento com recebimento; parcelas em horizontes diferentes; falta de vencimento; parcelas desatualizadas; vencimentos comuns a recebíveis e previsão; virada de dia no Brasil; valor inválido; controlador lendo 61 pedidos fictícios incluindo dívida antiga.
- 9 testes anteriores de leitores financeiros; 6 testes Financeiro 2.0; 9 verificações da auditoria integrada; TypeScript e build.
- As antigas verificações que procuravam nomes de variáveis no código foram substituídas por cenários comportamentais para as fórmulas refatoradas.
- Não houve teste bancário, compra real, estorno real ou conferência ponta a ponta mobile da versão proposta. Essas validações continuam pendentes.

## Limites que permanecem

Compartilhar a fórmula não basta quando as telas usam períodos ou fontes distintos. A Visão Geral ainda não recebe liquidações legadas ausentes dos movimentos de caixa, enquanto a projeção lê contas a pagar para cobrir esse caso. Conciliação entre pagamentos, movimentos manuais, anúncios, estoque, aportes e retiradas continua necessária. Não haverá reconstrução automática de valores descartados.

Também faltam apuração dos recebimentos e estornos por data real, confirmação de taxas e fretes efetivamente pagos, revisão do CMV, separação de investimento/estoque/despesa e validação em desktop e celular. Este documento não certifica saldo, faturamento ou lucro real da empresa, nem declara a auditoria geral concluída.
