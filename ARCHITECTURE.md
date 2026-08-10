# Arquitetura Operacional — F PAC STORE (Fase 4)

## Visão Geral

A arquitetura da F PAC STORE foi evoluída para uma estrutura robusta em camadas, garantindo isolamento de responsabilidades, integridade dos dados e auditoria em tempo real.

```
                    CLIENTE / FRONTEND
                            │
                            ▼
                    API GATEWAY (EXPRESS)
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
      PAYMENT SERVICE  PRODUCTION SVC  SHIPPING SVC
            │               │               │
            └───────────────┼───────────────┘
                            ▼
                    INVENTORY SERVICE
                            │
                            ▼
                   FINANCIAL METRICS
                            │
                            ▼
                   FIRESTORE DATABASE
```

## Princípios de Arquitetura

1. **Separação Estrita de Domínios**: Status de Pagamento, Produção e Envio são linhas independentes.
2. **Imutabilidade do Histórico**: Transições de status e movimentações de estoque são gravadas em append-only com data, hora, operador e justificativa.
3. **Idempotência**: Baixa e reversão de estoque possuem sinalizadores de controle (`stockReverted`, `processedEvents`) impedindo duplicidade.
4. **Auditoria Geral**: Ações administrativas críticas geram logs na coleção `audit_logs`.
5. **Fonte Única de Verdade**: O Firestore centraliza o estado dos pedidos, alimentando consistentemente a Central de Pedidos, o Financeiro, o Estoque e o Painel de Produção.
