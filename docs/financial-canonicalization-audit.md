# F PAC STORE — Auditoria de Canonicalização Financeira

Status: em andamento
Branch: `fix/admin-financial-canonicalization`
Issue: #22

## Objetivo
Eliminar divergências entre Dashboard Financeiro, DRE, exportações (Google Sheets/CSV) e visão por pedido, fazendo todas as superfícies consumirem o motor canônico de `src/utils/orderFinancial.ts`.

## Divergências confirmadas no `main`

1. `src/components/AdminFinancial.tsx` ainda contém o helper local `calculateFeesAndMargins`.
2. Esse helper calcula taxa, frete, COGS e lucro por regras próprias, apesar de o componente já importar `calculateOrderFinancials`.
3. O helper local usa `order.total` como base, enquanto o motor canônico prioriza snapshot em `order.pricing?.total` e demais fallbacks históricos.
4. O helper local trata `shipping/frete` como custo da loja, enquanto o motor canônico separa valor cobrado, custo real e subsídio.
5. Exportação para Google Sheets e CSV reutiliza `calculateFeesAndMargins`, portanto pode divergir do DRE canônico.
6. O DRE já usa `calculateFinancialDRE`, então hoje existem dois motores financeiros coexistindo no mesmo componente.

## Regra de correção

- Não alterar layout nesta fase.
- Substituir cálculos locais por `calculateOrderFinancials`/helpers canônicos.
- Manter compatibilidade com pedidos legados.
- Validar lint, build e `preflight:production` antes de qualquer merge.
- Fazer reorganização visual e remoção de duplicidades somente em PR posterior.

## Critérios de aceite

- Dashboard e exportações usam o mesmo cálculo de receita, COGS, taxa, frete e lucro.
- Pedido com snapshot histórico não perde seu valor original.
- Frete cobrado do cliente não é confundido com custo real do frete.
- Reembolsos e pagamentos parciais permanecem refletidos pelo motor canônico.
- Nenhuma mudança visual nesta etapa.
