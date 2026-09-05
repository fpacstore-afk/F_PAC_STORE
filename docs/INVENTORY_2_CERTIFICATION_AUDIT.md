# ESTOQUE 2.0 — Auditoria de certificação

Status: CERTIFICADO — zero bloqueios críticos/altos no escopo ESTOQUE 2.0.

## Evidências confirmadas

- `server/services/store.service.ts` mantém `physicalQuantity`, `reservedQuantity` e deriva `availableQuantity = physicalQuantity - reservedQuantity`.
- Reserva, liberação, consumo, devolução física e ajustes são transacionais no Firestore, com leituras antes das escritas.
- Itens que resolvem para a mesma identidade física são agregados antes das operações, evitando sobrescrita por linhas duplicadas.
- A identidade de reserva inclui `orderId + productSlug + variantKey`, eliminando colisões entre produtos com a mesma variante.
- Idempotência canônica usa `stock_idempotency` e inclui produto + variante nas chaves por item, mantendo leitura compatível do legado.
- Saída manual valida `availableQuantity` e não consome estoque reservado.
- Consumo da reserva exige físico e reservado suficientes e bloqueia qualquer resultado negativo.
- Cancelamentos, expirações, rejeições e reembolsos antes do envio liberam a reserva; após envio, a reposição ocorre somente pelo fluxo de devolução física.
- Devolução revendável não personalizada incrementa estoque físico; item danificado/personalizado gera `non_sellable_return` sem voltar ao estoque vendável.
- Movimentações são append-only em `stock_movements` e o painel consulta a identidade oficial `productSlug`.
- O painel administrativo trata a API de Inventory 2.0 como autoridade: falha da mutação oficial impede confirmação de sucesso; campos de quantidade no produto são apenas espelhos de compatibilidade atualizados depois da mutação oficial.
- Variantes com quantidade zero permanecem representadas e não recebem estoque fictício.
- O catálogo de estampas (`Design`) não possui campo de estoque finito; portanto PRIME consome a variante física da camisa base. A arte selecionada é recurso de design/produção, não uma segunda unidade física de estoque.

## Validação automatizada

O workflow `Validate Pull Request` da branch executa, em sequência:

1. TypeScript (`npm run lint`)
2. regressão PRIME (`npm run test:prime-sizing`)
3. regressão Catálogo (`npm run test:catalog-products`)
4. suíte ESTOQUE 2.0 (`npm run test:inventory-2`)
5. build (`npm run build`)
6. production preflight (`npm run preflight:production`)

A suíte ESTOQUE 2.0 cobre estrutura transacional, proteção contra estoque negativo, reserva/consumo/liberação, identidade e idempotência, agregação de linhas duplicadas, painel administrativo, checkout/pagamento, transição de envio e ausência de estoque finito de estampas.

## Conclusão

ESTOQUE 2.0 está certificado no PR empilhado da branch `fix/inventory-2-certification`, preservando PRIME e Catálogo. A certificação não implica merge na `main` nem deploy em produção; ambos permanecem fora deste bloco e dependem de autorização explícita.