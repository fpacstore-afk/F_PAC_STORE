# Custos do catálogo

Em Estoque, “Preencher custos zerados” completa apenas custos privados ausentes ou zerados. Valores positivos já registrados são preservados. Cada produto é conferido novamente em uma transação, com registro anterior/posterior e operador em `product_cost_events`; repetir a ação não duplica atualizações. Estoque, preços de venda e custos históricos dos pedidos não são alterados.

Novos cadastros usam as cotações autenticadas de Preços & orçamentos. O modelo identifica o fornecedor/produto: oversized Suedine da Tiggas, tradicional Suedine da Zimm, cropped/Boxy feminina da Tiggas e bermuda Linho Cargo da Tiggas. Não há tabela de preços privados embutida no código. Modelos sem referência continuam exigindo cadastro de custo.

A referência usa a faixa individual, sem presumir uma compra no atacado. Para produtos estampados, usa as medidas cadastradas, rotação e espaçamento da folha DTF e o maior custo entre as receitas de cores. Adicionais padrão por unidade entram uma vez; valores por pedido dependem do lote real e permanecem pendentes. Uma medida ausente/inválida não se transforma em estampa gratuita.

Os valores são identificados como estimativa parcial, com fonte, componentes e pendências. Conferir lote/frete real, aproveitamento DTF, aplicação, embalagem, energia, tributos e rateios antes de tratar o valor como custo completo. Abrir um produto com custo registrado e salvar um campo sem relação com a receita preserva esse custo. Alterar modelo ou receita permite recalcular a referência. A API recalcula referências novas a partir dos cadastros privados, sem confiar em valores calculados pelo navegador.

Validação: `npm run test:catalog-product-costs` verifica fornecedores, faixas, receitas por cor, medidas inválidas, parcelas por pedido, preenchimento repetido e preservação de registros, pedidos e estoque.
