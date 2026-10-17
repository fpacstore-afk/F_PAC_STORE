# Custos automáticos dos pedidos

No pedido manual personalizado, a referência da peça usa os cadastros privados de
Orçamentos. A mesma função de cálculo resolve fornecedor, linha, cor, tamanho,
faixa de quantidade, estampas e insumos. Cada arte pode usar uma regra própria.
Medidas em centímetros aceitam `10 x 10`, `10 × 10 cm` e valores decimais; medidas
não reconhecidas ficam pendentes, sem presumir formato ou unidade.

Insumos marcados como padrão entram nos novos personalizados. O operador pode
retirar exceções e confirma embalagem, aplicação e demais insumos. Custos ausentes
não viram zero confirmado. O total manual substitui a composição automática e só
fica conferido com valor, motivo e confirmação explícita; zero é permitido.

DTF usa a base configurada no orçamento (material consumido ou compra inteira),
com rateio por área e faixas de preço. O encaixe continua sendo uma estimativa por
retângulos. Insumos por pedido são rateados uma única vez entre as linhas que os
utilizam. Peças com total manual continuam participando do lote físico de DTF e
do denominador dos insumos compartilhados.

O servidor resolve os valores atuais ao criar e rejeita uma prévia com versão de
cadastro desatualizada. Os campos de custo enviados pelo navegador são apenas uma
prévia. Cada linha guarda composição, origem, data, pendências e valores; o pedido
guarda as referências privadas necessárias para futuras edições aos preços da venda.
Uma repetição da criação preserva os valores já salvos.

Editar tamanho, quantidade ou artes recalcula o custo com as referências guardadas,
sem atualizar silenciosamente para preços novos. O histórico de edição preserva as
linhas anteriores. Alterar peça ou arte de um custo manual exige nova conferência;
pedidos antigos sem composição continuam com o tratamento conservador anterior.
Recebimentos, preço de venda e pagamentos não são criados pela mudança de custo.

Produtos de catálogo usam o registro privado de custo. Composição parcial e custos
variáveis de estampas de produtos montados/PRIME ficam sinalizados quando não
estiverem cobertos pelo cadastro. Converter orçamento preserva seus custos e passa
a guardar também os componentes da proposta.

A Central Financeira mostra os valores históricos, os componentes e as pendências.
Taxa do pagamento e frete real são apurados separadamente. Frete cobrado do cliente
não comprova o custo pago pela loja; resultado permanece provisório enquanto essas
despesas ou componentes precisarem de confirmação. O botão de privacidade oculta
também as origens que contêm valores monetários.

Conferência prática: criar itens com tamanhos e estampas diferentes, conferir custos
padrão e insumos por pedido, salvar, atualizar o cadastro e reabrir o pedido antigo.
Editar quantidades/medidas e conferir o novo rateio e o histórico. Testar custo manual
zero, custo pendente, valores ocultos, brinde e uso no celular. Usar pedidos de teste
identificados, sem cobranças nem notificações a clientes reais.
