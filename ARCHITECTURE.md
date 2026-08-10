# Arquitetura Operacional — F PAC STORE (Fase 7 — Produção 2.0)

## Visão Geral

A arquitetura da F PAC STORE foi retificada e consolidada para uma estrutura em camadas segura, eliminando acessos diretos de escrita do frontend para dados críticos de pedidos, pagamentos, produção e estoque.

```
                    FRONTEND (React + Vite + Kanban)
                            │
                            ▼
                    API GATEWAY (Express + Auth Middleware)
                            │
            ┌───────────────┼───────────────┬────────────────┐
            ▼               ▼               ▼                ▼
      PAYMENT SVC    PRODUCTION SVC    SHIPPING SVC     ADMIN OPS SVC
            │               │               │                │
            └───────────────┼───────────────┴────────────────┘
                            ▼
                    INVENTORY SERVICE (Firestore Transactions)
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
       HISTÓRICO       AUDITORIA        ESTOQUE
       (history)      (audit_logs)  (stock_movements)
                            │
                            ▼
                    FIRESTORE DATABASE
```

## Princípios de Arquitetura

1. **Camada Única de Serviços**: Apenas `src/services/orders/orderService.ts` atua como camada cliente oficial para pedidos, chamando a API Express autenticada via `authenticatedFetch`.
2. **Separação Estrita de Domínios**:
   - **Pagamento** (`payment.status`): `pending` | `processing` | `approved` | `partially_paid` | `rejected` | `cancelled` | `refunded`
   - **Produção 2.0** (`production.status` / `currentStage`): `waiting` | `separacao_corte` | `estamparia` | `costura` | `embalagem` | `ready` | `completed`
     - Metadados Operacionais: `priority` (`normal`|`alta`|`urgente`), `assignedTo`, `dueDate`, `enteredAt`, `notes`.
     - Regra de Retrocesso: Exige justificativa obrigatória (`note`).
   - **Envio** (`shipping.status`): `pending` | `label_created` | `shipped` | `in_transit` | `delivered` | `returned`
3. **Proteção de Estoque contra Concorrência e Insuficiência**:
   - Operações de baixa e ajuste utilizam `db.runTransaction` no Firestore Server.
   - Nenhuma mutação na esteira de produção altera `physicalQuantity` ou `availableQuantity`. A baixa física ocorre estritamente na confirmação de envio (`shipped`).
4. **Três Trilhas Separadas de Registros**:
   - **Histórico do Pedido** (`history` / `historyLogs`): Eventos funcionais visíveis no pedido.
   - **Auditoria** (`audit_logs`): Operações administrativas (operador, IP, motivo, alteração de status/prioridade/atribuição).
   - **Movimentação de Estoque** (`stock_movements`): Registros físicos/fiscais de entradas, saídas, reservas e ajustes.
5. **Idempotência**:
   - Mapeamento de eventos e transições de produção idempotentes impedem duplicidade em requisições repetidas ou reprocessamentos.

