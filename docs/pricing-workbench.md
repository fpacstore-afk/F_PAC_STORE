# Preços e orçamentos na Gestão

Acesse `/gestao?tab=pricing` com uma conta administradora.

## Uso

- **Visão geral:** busca por produto, material, fornecedor e cotação; atalhos e pendências.
- **Cadastros:** produtos/fichas, preços por fornecedor/linha/quantidade, estampas, insumos, fornecedores e fretes. Edite ou desative sem apagar o histórico. Custos podem ser específicos por cor e tamanho.
- **Calcular peça:** escolha ficha, linha, cor, tamanho e quantidade. Adicione estampas e custos aplicáveis; confira a memória de cálculo e adicione ao orçamento. A quantidade da faixa comercial é a deste item, não a soma de produtos diferentes.
- **Calcular estampa:** calcula custo por encaixe DTF, valor fixo ou manual. Adicionais podem ser por unidade, por lote do item ou uma vez por pedido inteiro. Na consulta de estampas, a quantidade informada representa o pedido completo. A projeção de venda exige margem e taxa conhecidas.
- **Orçamento atual:** cliente, itens, frete/retirada, desconto, acréscimo, condições, prazo, validade e observações. Salve rascunhos incompletos; finalize somente com preços e frete definidos. Finalizados são imutáveis; duplique para preparar outra proposta.
- **Versão cliente / PDF:** prévia comercial com botão de impressão/salvar PDF. Custos, fornecedores, fontes e margens não entram nesse documento. Nada é enviado automaticamente.
- **Orçamentos salvos:** pesquisa por cliente/produto, data e situação. Carregue registros anteriores para pesquisar além da primeira página. Abrir preserva os valores históricos; duplicar recalcula pelos cadastros atuais.
- **Histórico:** versões anteriores de cadastros e propostas. É possível baixar cada versão interna.
- **Configurações:** folha DTF, espaçamento, margem/taxa inicial, prazo e número de dias para avisar sobre cotação antiga.

## Importação

A importação inicial recebe `{ catalog, archive }` em JSON, somente pela API administrativa. A cópia original é preservada como texto JSON, incluindo as fórmulas e células. A importação não sobrescreve uma base já iniciada; atualizações posteriores são feitas pelos cadastros. A planilha de origem não é alterada e não há sincronização automática.

Valores ausentes são `null`, nunca zero implícito. O subtotal conhecido não é apresentado como custo completo. DTF é dividido pelo número de estampas que cabem numa grade homogênea, testando também rotação de 90 graus; não utiliza preço proporcional à área nem compra arredondada de folhas inteiras.

Preço sugerido = custo / (1 − margem − taxa). Preços unitários de venda são arredondados antes de multiplicar pela quantidade. A margem do item é anterior a descontos e frete. Um preço manual permite orçar mesmo sem custo completo, mas não inventa margem.

## Persistência e segurança

Rotas `/api/admin/pricing-workbench` usam a autenticação administrativa existente. As coleções `pricing_workbench`, `pricing_workbench_quotes`, `pricing_workbench_events` e `pricing_workbench_imports` são privadas, sem acesso direto pelo cliente Firestore. As regras existentes negam acesso por padrão; os testes dos emuladores cobrem visitantes, clientes e administradores.

Cadastros e orçamentos usam transações e versões para impedir sobrescrita silenciosa entre sessões. O servidor recalcula a proposta; não aceita totais fornecidos pelo navegador. Cada salvamento preserva uma memória de cálculo. Não há alterações nas coleções de catálogo, pedidos, fornecedores ou orçamento de marketing já existentes.

Os arquivos reais da planilha e os valores comerciais importados não são publicados no repositório ou no bundle do site. O teste público usa dados sintéticos; a comparação com a fonte real é executada sobre a cópia privada antes da importação.

## Validação

`npm run test:pricing-workbench` verifica encaixe/rotação, faixas, valores ausentes versus zero, restrições, preços manuais, duplicação, validações, HTML seguro, acesso administrativo, importação única, conflitos de versão, snapshots e finalização. A suíte de regras inclui as quatro novas coleções. Execute também lint, build, regressões completas e preflight antes de publicar.

## Custos por pedido inteiro

Use essa aplicação para sacola, panfleto ou brinde compartilhado pelo pedido. O custo é dividido pelo total de peças das linhas em que o adicional está marcado e somado uma única vez; incluir, duplicar, remover ou editar linhas refaz o rateio. A prévia de uma peça considera as outras linhas do orçamento atual. Desmarcar em todas as linhas remove o adicional. A opção antiga Por lote deste item preserva sua semântica, sem migrar cadastros existentes. Custos internos mantêm todas as casas decimais; o preço final de venda continua arredondado em centavos. Propostas preservadas mantêm o resultado salvo.
