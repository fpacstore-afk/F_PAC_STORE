# Preços e orçamentos na Gestão

Acesse `/gestao?tab=pricing` com uma conta administradora.

## Uso

A página tem exatamente três abas principais:

- **Histórico:** pesquisa por projeto, cliente e produto, com filtros de data e situação. Abrir mantém os valores da versão salva. **Usar como base** cria uma nova proposta com os preços dos cadastros atuais, preservando a anterior. Registros antigos continuam disponíveis, mesmo sem nome de projeto.
- **Montar orçamento:** preencha cliente/contato e entrega, depois adicione as peças em sequência. Cada item reúne produto/fornecedor, linha, cor, tamanho, quantidade e suas próprias estampas. Produtos diferentes ficam na mesma tela. Duplicar mantém as informações para editar uma nova variação; remover permite desfazer. Margem, taxa, custo manual, adicionais e composição do custo ficam nos detalhes do item. Um preço de venda manual substitui a sugestão e gera aviso quando não cobre custo e taxa conhecidos. Valores ausentes continuam pendentes. O resumo acompanha os itens; os botões de salvar, finalizar e gerar PDF ficam ao final da página. O nome do projeto é interno, opcional e limitado a 300 caracteres.
- **Calculadora de estampas:** cada linha tem largura, altura e quantidade independente. Todas as linhas compartilham o encaixe físico com rotação e espaçamento. A prévia destaca as medidas e quantas vezes cada folha deve ser repetida. O resumo separa material aplicado, metros estimados, metros de compra, preço por metro e desembolso. É possível ajustar a compra em metros inteiros, com aviso se ficar abaixo da estimativa, ou voltar ao cálculo automático. A sugestão de venda do DTF segue margem/taxa e a base de custo configuradas, sem incluir peça e aplicação. As medidas permanecem ao alternar as três abas durante a sessão.

O botão **Cadastros e ajustes** abre produtos/fichas, preços por fornecedor/linha/quantidade, estampas, insumos, fornecedores e fretes, além da consulta de preços, regras, importação/backup e histórico de alterações. Todos os cadastros, referências e coleções existentes são reutilizados.

Salve rascunhos incompletos; finalize com cliente, preços e frete definidos. Finalizados preservam seus valores; use uma cópia para alterar. O botão **Cliente aprovou · criar pedido** reaproveita os itens, valores e detalhes de estampas na estrutura existente de pedidos e produção. A conversão permanece idempotente e o pagamento começa pendente. Artes e entrega podem ser completadas no pedido.

A **Versão cliente / PDF** usa a prévia comercial e o botão de impressão/salvar PDF. Custos, fornecedores, margem, título interno e mapa de encaixe não entram no documento. Nada é enviado automaticamente.

## Importação

A importação inicial recebe `{ catalog, archive }` em JSON, somente pela API administrativa. A cópia original é preservada como texto JSON, incluindo as fórmulas e células. A importação não sobrescreve uma base já iniciada; atualizações posteriores são feitas pelos cadastros. A planilha de origem não é alterada e não há sincronização automática.

Valores ausentes são `null`, nunca zero implícito. O subtotal conhecido não é apresentado como custo completo. Campos operacionais, como posição da estampa, não escondem custos já conhecidos: são mostrados como pendências específicas antes de adicionar/finalizar a proposta. Valores realmente ausentes continuam pendentes e identificados por componente.

### Desconto de DTF por metragem

Cadastre as faixas privadas em Configurações, com início inclusivo em metros inteiros e preço por metro. Sem faixas, permanece o custo base da folha. O orçamento encaixa estampas de todas as medidas juntas, incluindo rotação, quantidades de todas as linhas e espaço entre artes. Só depois de preencher folhas conjuntas converte o resultado em metros inteiros de compra. O algoritmo tenta três estratégias de encaixe em retângulos livres e escolhe o menor resultado encontrado; não promete o ótimo matemático. A prévia permite conferir a disposição física. Estampas de custo fixo ou manual não compõem a metragem. Uma busca excepcionalmente grande pode ficar pendente para conferência manual, sem inventar um resultado por área.

A maior faixa cujo início seja menor ou igual à compra define o preço por metro de todo o DTF calculado. O campo Compra real de DTF permite informar metros inteiros de uma compra conjunta ou ajustada após conferir o encaixe/sobras. Deixá-lo vazio restaura a estimativa. Uma compra menor que a estimativa gera aviso.

O quadro interno mostra cada arte DTF por medida e quantidade. **Custo de material por arte** = largura × altura ÷ (largura da folha × altura da folha) × preço da folha na faixa aplicada. O total das artes soma os subtotais sem arredondar entre etapas. Esse valor é uma referência da área impressa, independente do mínimo inteiro comprado. **Valor a pagar pelo DTF** = metros inteiros × preço por metro. A diferença inclui área vazia, espaçamento e arredondamento e não promete aproveitamento de todas as sobras. Custos de peça, aplicação e adicionais aparecem separadamente. O quadro é interno e não entra na versão do cliente.

Em Configurações, selecione **Compra inteira, rateada entre as estampas** para incluir todo o custo comprado na precificação do orçamento. Cada arte recebe custo de compra × área da arte / soma das áreas de todas as cópias, sem arredondamento intermediário; multiplicar os custos unitários pelas quantidades recupera o custo da compra inteira. A área só distribui o custo: a metragem vem do encaixe físico, nunca da área total isolada. O modo **Somente material aplicado** usa esse mesmo custo por área da arte também na composição da peça, sem ratear a sobra da folha por rendimento de grade. Ele continua disponível e é preservado em bases sem seleção explícita. Prévia, calculadora e servidor usam a mesma regra; orçamentos salvos mantêm a memória anterior até serem atualizados ou duplicados. A versão do cliente não expõe os dados internos nem o mapa de encaixe.

Preço sugerido = custo / (1 − margem − taxa). Preços unitários de venda são arredondados antes de multiplicar pela quantidade. A margem do item é anterior a descontos e frete. Um preço manual permite orçar mesmo sem custo completo, mas não inventa margem.

## Persistência e segurança

Rotas `/api/admin/pricing-workbench` usam a autenticação administrativa existente. As coleções `pricing_workbench`, `pricing_workbench_quotes`, `pricing_workbench_events` e `pricing_workbench_imports` são privadas, sem acesso direto pelo cliente Firestore. As regras existentes negam acesso por padrão; os testes dos emuladores cobrem visitantes, clientes e administradores.

Cadastros e orçamentos usam transações e versões para impedir sobrescrita silenciosa entre sessões. O servidor recalcula a proposta; não aceita totais fornecidos pelo navegador. Cada salvamento preserva uma memória de cálculo. Não há alterações nas coleções de catálogo, pedidos, fornecedores ou orçamento de marketing já existentes.

Os arquivos reais da planilha e os valores comerciais importados não são publicados no repositório ou no bundle do site. O teste público usa dados sintéticos; a comparação com a fonte real é executada sobre a cópia privada antes da importação.

## Validação

`npm run test:pricing-workbench` verifica encaixe/rotação, faixas, valores ausentes versus zero, restrições, preços manuais, duplicação, validações, HTML seguro, acesso administrativo, importação única, conflitos de versão, snapshots e finalização. A suíte de regras inclui as quatro novas coleções. Execute também lint, build, regressões completas e preflight antes de publicar.

## Custos por pedido inteiro

Use essa aplicação para sacola, panfleto ou brinde compartilhado pelo pedido. O custo é dividido pelo total de peças das linhas em que o adicional está marcado e somado uma única vez; incluir, duplicar, remover ou editar linhas refaz o rateio. A prévia de uma peça considera as outras linhas do orçamento atual. Desmarcar em todas as linhas remove o adicional. A opção antiga Por lote deste item preserva sua semântica, sem migrar cadastros existentes. Custos internos mantêm todas as casas decimais; o preço final de venda continua arredondado em centavos. Propostas preservadas mantêm o resultado salvo.
