# Auditoria de padronização de status administrativos

Issue principal: #24

## Achados confirmados

- `src/pages/AdminOrders.tsx` mistura no mesmo campo `status` valores de pagamento, produção, expedição e aliases legados.
- `src/utils/orderFinancial.ts` já oferece normalização canônica de pagamento via `normalizePaymentStatus` e `getOrderPaymentStatus`.
- `src/constants/productionStages.ts` já oferece estágios canônicos de produção via `PRODUCTION_STAGES` e compatibilidade legada via `legacyMatches`/`getStageFromStatus`.
- `src/services/orders/orderService.ts` já separa atualização de pagamento de atualização de produção, mas ainda aceita aliases manuais para compatibilidade.

## Diretriz da correção

1. Lógica financeira deve usar status de pagamento canônico.
2. Lógica operacional deve usar status de produção canônico.
3. `order.status` deve ficar apenas como fallback de compatibilidade para pedidos legados quando os campos específicos não existirem.
4. Rótulos de interface devem ser derivados dos status canônicos, sem regravar pedidos históricos no Firestore.
5. Não remover aliases antigos enquanto houver compatibilidade necessária.

## Critérios de aceite

- filtros e badges não dependem de comparações ad hoc com textos legados;
- pagamento e produção não são tratados como o mesmo domínio;
- pedidos antigos continuam legíveis;
- TypeScript passa;
- testes de pedidos, produção, financeiro e checkout passam;
- build passa;
- production preflight passa;
- diff final não contém migração destrutiva de dados.
