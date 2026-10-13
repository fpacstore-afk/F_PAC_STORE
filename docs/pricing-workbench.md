# Preços e orçamentos na Gestão

Acesse `/gestao?tab=pricing` com uma conta administradora.

## Uso

- **Visão geral:** busca por produto, material, fornecedor e cotação; atalhos e pendências.
- **Cadastros:** produtos/fichas, preços por fornecedor/linha/quantidade, estampas, insumos, fornecedores e fretes. Edite ou desative sem apagar o histórico. Custos podem ser específicos por cor e tamanho.
- **Calcular peça:** escolha ficha, linha, cor, tamanho e quantidade. Adicione estampas e custos aplicáveis; confira a memória de cálculo e adicione ao orçamento. A quantidade da faixa comercial é a deste item, não a soma de produtos diferentes.
- **Calcular estampa:** adicione uma ou mais artes e confira o custo individual do material, a soma das artes, a compra mínima e a precificação. A quantidade vale igualmente para todas as artes desta consulta; use linhas separadas no orçamento para quantidades diferentes. Valor fixo/manual e adicionais aparecem no resumo de custos. A projeção de venda exige margem e taxa conhecidas.
- **Orçamento atual:** cliente, itens, frete/retirada, desconto, acréscimo, condições, prazo, validade e observações. Salve rascunhos incompletos; finalize somente com preços e frete definidos. Finalizados são imutáveis; duplique para preparar outra proposta.
- **Versão cliente / PDF:** prévia comercial com botão de impressão/salvar PDF. Custos, fornecedores, fontes e margens não entram nesse documento. Nada é enviado automaticamente.
- **Orçamentos salvos:** pesquisa por cliente/produto, data e situação. Carregue registros anteriores para pesquisar além da primeira página. Abrir preserva os valores históricos; duplicar recalcula pelos cadastros atuais.
- **Histórico:** versões anteriores de cadastros e propostas. É possível baixar cada versão interna.
- **Configurações:** folha DTF, espaçamento, margem/taxa inicial, prazo e número de dias para avisar sobre cotação antiga.

## Importação

A importação inicial recebe `{ catalog, archive }` em JSON, somente pela API administrativa. A cópia original é preservada como texto JSON, incluindo as fórmulas e células. A importação não sobrescreve uma base já iniciada; atualizações posteriores são feitas pelos cadastros. A planilha de origem não é alterada e não há sincronização automática.

Valores ausentes são `null`, nunca zero implícito. O subtotal conhecido não é apresentado como custo completo. Campos operacionais, como posição da estampa, não escondem custos já conhecidos: são mostrados como pendências específicas antes de adicionar/finalizar a proposta. Valores realmente ausentes continuam pendentes e identificados por componente.

### Desconto de DTF por metragem

Cadastre as faixas privadas em Configurações, com início inclusivo em metros inteiros e preço por metro. Sem faixas, permanece o custo base da folha. O orçamento encaixa estampas de todas as medidas juntas, incluindo rotação, quantidades de todas as linhas e espaço entre artes. Só depois de preencher folhas conjuntas converte o resultado em metros inteiros de compra. O algoritmo tenta três estratégias de encaixe em retângulos livres e escolhe o menor resultado encontrado; não promete o ótimo matemático. A prévia permite conferir a disposição física. Estampas de custo fixo ou manual não compõem a metragem. Uma busca excepcionalmente grande pode ficar pendente para conferência manual, sem inventar um resultado por área.

A maior faixa cujo início seja menor ou igual à compra define o preço por metro de todo o DTF calculado. O campo Compra real de DTF permite informar metros inteiros de uma compra conjunta ou ajustada após conferir o encaixe/sobras. Deixá-lo vazio restaura a estimativa. Uma compra menor que a estimativa gera aviso.

O quadro interno mostra cada arte DTF por medida e quantidade. **Custo de material por arte** = largura × altura ÷ (largura da folha × altura da folha) × preço da folha na faixa aplicada. O total das artes soma os subtotais sem arredondar entre etapas. Esse valor é uma referência da área impressa, independente do mínimo inteiro comprado. **Valor a pagar pelo DTF** = metros inteiros × preço por metro. A diferença inclui área vazia, espaçamento e arredondamento e não promete aproveitamento de todas as sobras. Custos de peça, aplicação e adicionais aparecem separadamente. O quadro é interno e não entra na versão do cliente.

Em Configurações, selecione **Compra inteira, rateada entre as estampas** para incluir todo o custo comprado na precificação do orçamento. Cada arte recebe custo de compra × área da arte / soma das áreas de todas as cópias, sem arredondamento intermediário; multiplicar os custos unitários pelas quantidades recupera o custo da compra inteira. A área só distribui o custo: a metragem vem do encaixe físico, nunca da área total isolada. O modo anterior **Somente material aplicado** continua disponível e é preservado em bases sem seleção explícita. Prévia, calculadora e servidor usam a mesma regra; orçamentos salvos mantêm a memória anterior até serem atualizados ou duplicados. A versão do cliente não expõe os dados internos nem o mapa de encaixe.

Preço sugerido = custo / (1 − margem − taxa). Preços unitários de venda são arredondados antes de multiplicar pela quantidade. A margem do item é anterior a descontos e frete. Um preço manual permite orçar mesmo sem custo completo, mas não inventa margem.

## Persistência e segurança

Rotas `/api/admin/pricing-workbench` usam a autenticação administrativa existente. As coleções `pricing_workbench`, `pricing_workbench_quotes`, `pricing_workbench_events` e `pricing_workbench_imports` são privadas, sem acesso direto pelo cliente Firestore. As regras existentes negam acesso por padrão; os testes dos emuladores cobrem visitantes, clientes e administradores.

Cadastros e orçamentos usam transações e versões para impedir sobrescrita silenciosa entre sessões. O servidor recalcula a proposta; não aceita totais fornecidos pelo navegador. Cada salvamento preserva uma memória de cálculo. Não há alterações nas coleções de catálogo, pedidos, fornecedores ou orçamento de marketing já existentes.

Os arquivos reais da planilha e os valores comerciais importados não são publicados no repositório ou no bundle do site. O teste público usa dados sintéticos; a comparação com a fonte real é executada sobre a cópia privada antes da importação.

## Validação

`npm run test:pricing-workbench` verifica encaixe/rotação, faixas, valores ausentes versus zero, restrições, preços manuais, duplicação, validações, HTML seguro, acesso administrativo, importação única, conflitos de versão, snapshots e finalização. A suíte de regras inclui as quatro novas coleções. Execute também lint, build, regressões completas e preflight antes de publicar.

## Custos por pedido inteiro

Use essa aplicação para sacola, panfleto ou brinde compartilhado pelo pedido. O custo é dividido pelo total de peças das linhas em que o adicional está marcado e somado uma única vez; incluir, duplicar, remover ou editar linhas refaz o rateio. A prévia de uma peça considera as outras linhas do orçamento atual. Desmarcar em todas as linhas remove o adicional. A opção antiga Por lote deste item preserva sua semântica, sem migrar cadastros existentes. Custos internos mantêm todas as casas decimais; o preço final de venda continua arredondado em centavos. Propostas preservadas mantêm o resultado salvo.
