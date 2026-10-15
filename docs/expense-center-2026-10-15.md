# Central de Despesas — 15/10/2026

## Auditoria das fontes e estratégia de migração

Os registros de despesas da loja estão em três coleções Firestore: `financial_cashflow` (movimentações manuais e antigos custos), `financial_investments` (equipamentos e investimentos antigos) e `financial_traffic` (campanhas pagas). `financial_events` é o ledger de auditoria, não uma quarta fonte para somar gastos. Pedidos e recebimentos são contabilizados à parte. Pagamentos de contas a pagar podem ter um espelho com referência explícita em `financial_cashflow`; esse vínculo não deve gerar uma segunda despesa.

A Central de Despesas projeta essas três fontes em uma lista de leitura. Preserva documento, data, valor, categoria, descrição e coleção de origem. **Nenhum documento histórico é copiado, apagado ou migrado fisicamente (0 migrações).** Referências explícitas a investimento ou tráfego representado por movimentação são exibidas uma só vez. Quantias iguais não são deduplicadas por suposição: a auditoria destaca possíveis repetições por data, categoria e valor para verificação humana.

Novos lançamentos rápidos são gravados em `financial_cashflow`, com evento de ledger e chave de idempotência. A forma de pagamento é opcional e fica vazia se não informada. O servidor consulta registros da mesma data, categoria e valor antes de criar uma despesa rápida, retornando 409 quando encontra um possível duplicado. Um segundo pagamento real pode ser confirmado explicitamente. A edição modifica somente o documento de origem e cria evento imutável com valores anteriores; a anulação preserva o registro com status `voided`.

## Verificação antes e depois em produção

1. Com acesso de administrador, anotar contagem e soma ativa por origem, a soma da Central e eventuais possíveis duplicidades. Confirmar que a soma da Central é a soma das origens menos **somente** os espelhos com referência explícita.
2. Conferir individualmente os lançamentos de 30/09, 14/10 e 15/10 solicitados pelo proprietário, sem inferir existência apenas pela conversa. Não recriar registros sem confirmação no banco.
3. Após a publicação, comparar as mesmas contagens e totais. Como a unificação é somente uma projeção, a publicação por si só não deve alterar nenhum documento ou total de caixa. Eventuais lançamentos feitos depois da comparação são variações legítimas e precisam ser registrados separadamente.
4. Testar criação, edição e anulação em ambiente isolado; em produção, conferir a atualização do histórico e indicadores após o lançamento real de 15/10, se autorizado e se ele ainda não existir.

Os testes usam o Firestore isolado em memória e não têm acesso aos registros reais. O relatório de produção só pode afirmar quantos registros foram encontrados e quais totais foram reconciliados após uma leitura administrativa autenticada.
