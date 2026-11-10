# Auditoria de descoberta no catálogo — 09/11/2026

## Causa confirmada

A bermuda de linho cargo FPAC-PROD-9620 estava publicada, com imagens e disponibilidade no endpoint público. A página da categoria selecionava MARK ou FORCE automaticamente. Como a coleção registrada do produto era TODOS, a navegação principal mostrava incorretamente uma categoria vazia, embora o catálogo completo e a página direta continuassem contendo o produto.

O mesmo mecanismo podia ocultar produtos de outras categorias cadastrados em TODOS ou sem uma linha comercial específica.

## Correção

A categoria abre sem filtro comercial, com a opção Todos selecionada. FORCE e MARK continuam filtros explícitos, e a classificação registrada de cada produto permanece preservada. A navegação mostra as linhas que têm produtos ou que foram solicitadas explicitamente pelo endereço. PRIME conserva o acesso ao configurador.

Uma linha vazia informa que existem outras opções na categoria e oferece acesso a Todos. Uma categoria efetivamente sem produtos tem uma mensagem distinta. Erros de carregamento continuam sendo apresentados como indisponibilidade, sem parecer um catálogo vazio. Produtos inativos, rascunhos e bases internas continuam fora da vitrine pública.

Na página de compra, os rótulos de tamanho seguem o tipo de peça. Bermuda, regata e boné não recebem uma ficha de gola de camiseta; acabamentos e modelagem ausentes permanecem em conferência. O aviso de peças base também usa texto aplicável aos diferentes produtos. A tabela de bermudas não apresenta desenho, manga ou pontos de medição de camiseta.

## Verificação

- Conferência da projeção pública: 24 produtos, distribuídos em cinco categorias com produtos publicados; as outras duas categorias estão sem produtos publicados.
- Regressão das sete famílias com TODOS, FORCE, MARK, múltiplas linhas e produtos sem linha; exclusão de produtos não publicados; filtros explícitos e acesso ao configurador.
- Precificação autoritativa da bermuda, validação de disponibilidade e oito reservas de compra seguidas de cancelamento idempotente em banco isolado. Quantidades físicas e reservas são conservadas; não há chamada a serviços externos nesses testes.
- Suíte completa de regressões, TypeScript, build, regras de segurança e preflight de publicação.

A auditoria cobre os fluxos exercitados; não constitui garantia de ausência de qualquer falha. Compras com cobrança real ficam fora dos testes de certificação.
