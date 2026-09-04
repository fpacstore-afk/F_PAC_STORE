# ESTOQUE 2.0 — Auditoria de certificação

Status: EM CORREÇÃO — não certificado.

## Evidências confirmadas

- `server/services/store.service.ts` mantém `physicalQuantity`, `reservedQuantity` e deriva `availableQuantity`.
- Reserva, liberação, consumo, devolução física e ajustes usam transações Firestore.
- Saída manual valida estoque disponível e não deve consumir quantidade reservada.
- Consumo de reserva valida físico/reservado/disponível para impedir valores negativos.
- Movimentações são registradas em `stock_movements`.

## Bloqueadores encontrados

### 1. Colisão de chave de reserva

A reserva atualmente usa `stock_reservations/{orderId}_{variantKey}`. Como `productSlug` não participa da chave, dois produtos diferentes com a mesma variante (ex.: `Preto_M`) dentro do mesmo pedido podem apontar para o mesmo documento de reserva.

Correção obrigatória: identidade canônica deve incluir `orderId + productSlug + variantKey`, com leitura compatível do formato legado durante migração.

### 2. Linhas duplicadas da mesma variante não são agregadas antes da transação

`reserveStock`, `releaseStockReservation`, `consumeStockReservation` e `adjustStock` percorrem as linhas individualmente. Duas linhas com o mesmo `productSlug + variantKey` podem ler o mesmo snapshot inicial e gerar atualização final incorreta.

Correção obrigatória: normalizar/agrupar itens por identidade física antes das leituras da transação e somar as quantidades.

### 3. Idempotência por variante não inclui o produto

A chave auxiliar usa apenas `effectiveIdempotencyKey + variantKey`, repetindo o risco de colisão entre produtos diferentes.

Correção obrigatória: incluir `productSlug + variantKey` na identidade por item. O armazenamento canônico deve seguir a coleção prevista pelo fluxo Stock 2.0 (`stock_idempotency`), mantendo leitura do legado enquanto necessário.

### 4. Histórico do painel e backend usam campos diferentes

O backend registra `productSlug` em `stock_movements`, enquanto o painel `ProductManagementDrawer` consulta histórico com `where('productId', '==', product.id)`. Isso pode ocultar movimentações oficiais.

Correção obrigatória: padronizar a identidade do produto no movimento e manter compatibilidade de leitura.

### 5. Persistência do painel pode divergir do inventário oficial

O painel salva primeiro `products.stock`/`variantsStock` e depois chama a API de estoque. Erros da movimentação são apenas registrados no console e a tela ainda mostra sucesso. Isso cria duas fontes de verdade divergentes.

Correção obrigatória: mutação de estoque oficial deve ser obrigatória para sucesso; falha de inventário deve impedir confirmação de salvamento. O documento de produto não deve ser tratado como autoridade de quantidade física.

### 6. PRIME ainda não comprova consumo separado de camisa base + estampa

`pricing.service.ts` normaliza `prime-custom` para `parentSlug = 'prime'`, portanto o fluxo de estoque atualmente aponta para a variante física da camisa PRIME. Ainda não foi encontrada baixa transacional separada da estampa escolhida em `customization.prints`.

Correção obrigatória antes da certificação: localizar a fonte canônica do estoque de estampas e consumir/reservar os componentes do PRIME na mesma unidade transacional ou definir explicitamente, com evidência no repositório, que a estampa não é item controlado em estoque.

## Critérios para certificação

A certificação só pode ser marcada como concluída quando os bloqueadores acima forem eliminados e houver validação para: concorrência/oversell, idempotência, cancelamento/liberação, despacho/consumo, devolução revendável e não revendável, ajuste manual, variante zerada preservada, regressão PRIME, regressão Catálogo, TypeScript, build e production preflight.
