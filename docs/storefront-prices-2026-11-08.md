# Preços e apresentação — 08/11/2026

Referência: https://www.instagram.com/reel/DfZ4jEHgbj8/ . A legenda propõe simplificar os números, reduzir os símbolos monetários repetidos e mostrar o preço promocional em fonte relativamente menor que a referência.

O proprietário selecionou **reduzir ao inteiro**. A migração usa apenas os 22 produtos publicados conferidos abaixo, com preços esperados para impedir sobrescrita de uma edição concorrente. Preço base e promocional são reduzidos ao inteiro. A tabela PRIME compartilhada entre interface e servidor também passa de 79,90 para 79 na base oversized e de 119,90 para 119 nos demais modelos; os adicionais inteiros são preservados.

## Produtos conferidos

| ID | Base anterior → nova | Promocional anterior → nova |
| --- | --- | --- |
| `95iMSkEJstNemV7GAY9x` | 89.90 → 89 | 79.90 → 79 |
| `aBzDfilF133AwYjsxB0A` | 69.90 → 69 | 59.90 → 59 |
| `C4utBrpvXm9Tg5921MMY` | 99.90 → 99 | 89.90 → 89 |
| `4916AJClvoJJy0ChjneI` | 69.90 → 69 | 59.90 → 59 |
| `xn8NQoxZZDpEwjWjDfa2` | 69.90 → 69 | 59.90 → 59 |
| `7Aykx8nxgXXTm8h9YSxW` | 89.90 → 89 | 79.90 → 79 |
| `GKyWDKjZxkhGTWuJdCge` | 79.90 → 79 | 79.90 → 79 |
| `wxtqkC9ifCHIFo7xAKTR` | 69.90 → 69 | 59.90 → 59 |
| `N6LyIFPRGAX5lPP4gQ6k` | 69.90 → 69 | 59.90 → 59 |
| `R17UkzBfnTGEZBqfvLUJ` | 99.90 → 99 | 89.90 → 89 |
| `RiQZosIlY5EkmouB0vv4` | 89.90 → 89 | 79.90 → 79 |
| `OyZYHOnbtQcZR7TKTTiq` | 89.90 → 89 | 79.90 → 79 |
| `FIf8ezh9epOQmqVdD6eh` | 69.90 → 69 | 59.90 → 59 |
| `vd7Fcl63mHtVAQoFbGE6` | 69.90 → 69 | 59.90 → 59 |
| `hIYhvAbZC4KaqyfBlEVe` | 99.90 → 99 | 89.90 → 89 |
| `zkcXxGFC8ZeztiaBJJmp` | 89.90 → 89 | 79.90 → 79 |
| `ExMtEtdDTBXHtdt49wl0` | 69.90 → 69 | 59.90 → 59 |
| `gH6kChOZd3uSWy7mAy1X` | 69.90 → 69 | 59.90 → 59 |
| `UwV2QHzyvAmx1ZircSWp` | 99.90 → 99 | 89.90 → 89 |
| `C3TEBskjbJoeloieuwyy` | 89.90 → 89 | 89.90 → 89 |
| `jgaAa9ZFXDzV5eNK2DVw` | 69.90 → 69 | 59.90 → 59 |
| `iS0l5tZ51ckM1pziN0Jy` | 89.90 → 89 | 79.90 → 79 |

## Funcionamento

A gravação é uma transação única, idempotente, executada pela identidade já usada na produção e restrita ao projeto e banco existentes. O registro `catalog_price_changes/catalog-floor-20261108-v1` contém os valores anteriores e novos e a impressão digital do plano. Ele não pode ser lido ou gravado diretamente pelo navegador. Se qualquer preço tiver mudado desde esta conferência, a transação inteira é recusada. O job verifica os valores persistidos antes de promover a versão do site.

A atualização não escreve em pedidos anteriores, recebimentos, custos, estoque nem orçamentos personalizados de empresas. São preços atuais para novas compras. PIX e outros descontos continuam calculados sobre os novos preços e podem gerar centavos reais, sempre exibidos integralmente.

A apresentação usa um componente compartilhado nas vitrines, categorias, busca, página do produto, recomendações e PRIME. Há indicação visível de valores em reais e leitura acessível com a moeda completa. O preço de referência só aparece quando é superior ao atual. Valores inteiros dispensam `,00`; valores fracionados reais não são truncados pela interface. Sacola e checkout mantêm os totais detalhados em BRL. A mudança é registrada no banco, em vez de esconder centavos no navegador enquanto o servidor cobra outro valor.

## Verificação

Testes cobrem preços exatos e moeda acessível, comparações reais de desconto, consistência com o checkout, combinações de preços PRIME, escopo da migração, execução repetida/concorrente, rejeição de plano desatualizado e preservação do histórico financeiro. O pipeline obrigatório executa ainda todas as regressões, TypeScript, build público sem credenciais e emuladores das regras de acesso.

## Evidência da estratégia

As pesquisas citadas são reais, mas não garantem o mesmo efeito comercial na F PAC. O estudo de Cornell foi realizado no almoço de um restaurante; os resultados não são uma promessa de aumento de vendas no comércio eletrônico. A implantação deve ser acompanhada pelas conversões e vendas dos produtos da marca própria no dashboard, separadas das quantidades de uniformes de empresas.

Fontes primárias:

- https://ecommons.cornell.edu/entities/publication/1ca7d603-ee0c-4721-9003-91ca4f87cfa2
- https://production.wordpress.uconn.edu/businessmarketing/wp-content/uploads/sites/724/2014/08/size-does-matter.pdf
- https://experts.illinois.edu/en/publications/comma-n-cents-in-pricing-the-effects-of-auditory-representation-e/

A apresentação preserva a informação exata e legível do preço, conforme os princípios de clareza e precisão descritos no Decreto 5.903/2006 e no Decreto 7.962/2013.
