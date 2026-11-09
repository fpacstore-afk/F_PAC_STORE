# Auditoria de pedidos e disponibilidade — 09/11/2026

## Diagnóstico

O pedido manual consultava diretamente a quantidade do produto estampado, enquanto a reserva no servidor usa o modelo exato da peça lisa compartilhada. A tela ainda oferecia uma opção de forçar venda sem estoque marcada por padrão, sem correspondência no servidor. Isso permitia montar um pedido que só falhava na confirmação.

Uma segunda falha mantinha `inventory.available = false` depois de receber peças em uma base anteriormente zerada. O saldo da variante aumentava, mas o bloqueio agregado impedia a venda. A conferência autenticada da grade e do histórico confirmou esse cenário. Uma cor/tamanho sem entrada e sem saldo continua indisponível: outra gola, tecido ou tamanho não deve cobrir a venda.

## Correções

- A prévia administrativa usa o mesmo resolvedor físico das transações e desconta todos os itens já incluídos no rascunho, inclusive estampas diferentes que compartilham a base.
- A seleção mostra saldo por modelo, cor e tamanho; a confirmação verifica o pedido inteiro antes de enviar. A opção de forçar estoque foi removida; os registros históricos conservam seu fluxo explícito.
- Entradas, reservas, liberações, produção, ajustes e devoluções sincronizam o indicador agregado de disponibilidade. Saldos físicos, reservas e produtos permanecem separados.
- Foi acrescentada conferência autenticada de todos os registros de estoque. O reparo altera exclusivamente o indicador agregado desatualizado, sem criar entrada de compra, contagem ou pedido. Uma impressão digital da prévia impede aplicar uma correção após mudança concorrente. O reparo tem registro privado e repetição idempotente; `active = false`, variantes desativadas, saldos sem produto vinculado e modelos ainda não classificados continuam protegidos.
- Movimentações individuais validam operação, identificadores e quantidade inteira e protegem a repetição com uma chave transacional. Recebimentos em variantes prontas antes zeradas ficam verificáveis sem conferir retroativamente saldos antigos não contados.
- A vitrine e o botão de aumentar quantidade da sacola usam o mesmo limite por modelo e por estoque compartilhado, inclusive entre estampas diferentes. Botões de quantidade e remoção têm nomes acessíveis.
- Totais públicos de produtos com opções de modelo excluem cores/tamanhos que o produto não oferece. Dados numéricos inválidos não autorizam uma venda.

## Validação

A suíte inclui testes existentes de compras, preços, reservas, pagamentos simulados, cancelamento, devolução, produção, expedição, pedidos manuais, PDV, caixa, financeiro, upload, autenticação e proteção de dados. Foram adicionados treze cenários específicos de estoque e um conjunto de reparo de disponibilidade, cobrindo repetição, falta real, saldo compartilhado, última unidade, reposição, edição de reserva integral e concorrência da prévia.

Testes de mutação utilizam banco em memória isolado; os novos testes proíbem chamadas de rede. Nenhuma cobrança, pedido fictício ou notificação a cliente é usada para certificar a correção. O histórico real é consultado pelo painel administrativo. A consulta e a correção dos indicadores calculados em produção preservam quantidades e reservas.

A passagem da suíte não certifica ausência de toda falha possível. Compras reais com cobrança não fazem parte desta validação. Formatos, integrações e comportamento específicos de dispositivo continuam dependentes das condições reais de uso.
