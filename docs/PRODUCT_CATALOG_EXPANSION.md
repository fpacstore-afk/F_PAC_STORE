# Preparação do catálogo para novas categorias

## Objetivo

Permitir que a F PAC STORE adicione novas peças (bermudas, casacos, cropped feminino e futuras categorias) sem acoplar o catálogo às coleções atuais FORCE, MARK e PRIME.

## Modelo adotado

- `productType`: tipo físico da peça. Valores canônicos iniciais: `tshirt`, `shorts`, `jacket`, `cropped`, `other`.
- `collection`: linha comercial independente do tipo da peça, por exemplo `force`, `mark`, `prime` ou futuras linhas.
- `category`: campo legado mantido por compatibilidade. Novos cadastros devem preferir `productType`.
- `sizeSystem`: `alpha`, `numeric` ou `custom`, para não presumir que todo produto usa P/M/G/GG.
- `variants`: estrutura opcional por SKU para combinar tamanho, cor, estoque, custo e preço.

## Compatibilidade

Os produtos atuais continuam funcionando sem migração obrigatória. Quando `productType` não estiver presente, a taxonomia tenta interpretar o campo `category` e, por último, o nome do produto. O fallback atual é camiseta, preservando o comportamento do catálogo existente.

## Exibição de categorias

Categorias públicas devem ser derivadas somente de produtos vendáveis/ativos. Assim, Bermudas, Casacos ou Feminino não precisam aparecer vazios antes do primeiro produto ser ativado.

## SKU de variante

O helper `buildVariantSku` produz uma chave previsível no formato:

`<SKU-BASE>-<COR>-<TAMANHO>`

Exemplos:

- `BERMUDA-CARGO-PRETA-M`
- `CASACO-FORCE-PRETO-G`
- `CROPPED-LOGO-OFF-WHITE-P`

## Próximas integrações seguras

1. Usar `getCatalogCategories` e `filterCatalogByCategory` na interface do catálogo para filtros dinâmicos.
2. Expor `productType`, `collection`, `sizeSystem` e variantes no cadastro administrativo de produtos.
3. Evoluir Estoque 2.0 para usar SKU de variante como chave quando novos tipos de produto forem cadastrados, mantendo a regra atual de camisetas até a migração controlada.
4. Criar seção “Compre por categoria” na home somente quando houver categoria ativa, mantendo o carrossel institucional FORCE / MARK / PRIME separado.

Nenhuma migração destrutiva, alteração de produção ou mudança de regra comercial é necessária para esta preparação.
