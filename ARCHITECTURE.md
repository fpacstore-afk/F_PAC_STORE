# Arquitetura Operacional — F PAC STORE (Fase 8.6 — Devoluções & Logística Reversa 2.0)

## Visão Geral

A arquitetura da F PAC STORE foi consolidada na Fase 8.6, integrando o Fluxo de Devolução e Logística Reversa 2.0 (`requestOrderReturnController`, `authorizeOrderReturnController`, `processPhysicalReceiveController`), com separação estrita entre o evento de transporte `returned`, conferência física com checagem de condição e vendabilidade (`processPhysicalReturn`), limite de quantidades por item, idempotência, estorno financeiro desvinculado, e guarda de segurança de clientes.

```
                    FRONTEND (React + Vite + Central Expedição)
                                    │
                                    ▼
                    API GATEWAY (Express + Auth Middleware)
                                    │
            ┌───────────────────────┼───────────────────────┬────────────────┐
            ▼                       ▼                       ▼                ▼
      PAYMENT SVC            PRODUCTION SVC            SHIPPING 2.0 SVC  RETURNS & LOGISTICS 2.0
            │                       │                       │                │
            └───────────────────────┼───────────────────────┴────────────────┘
                                    ▼
                     INVENTORY & LOCK SERVICE (Firestore)
                                    │
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
       HISTÓRICO               AUDITORIA                ESTOQUE & LEDGER
       (history)              (audit_logs)      (stock_reservations, stock_movements, returns)
                                    │
                                    ▼
                            FIRESTORE DATABASE
```

## Princípios de Arquitetura

1. **Camada Única de Serviços**: Apenas a API Express autenticada via `authenticatedFetch` e rotas backend (`/api/shipping/*`, `/api/admin/*`, `/api/orders/:orderId/return-request`) interage com o Firestore e o ecossistema de devoluções.
2. **Separação Estrita de Domínios**:
   - **Pagamento** (`payment.status`): `pending` | `processing` | `approved` | `partially_paid` | `rejected` | `cancelled` | `refunded` | `partially_refunded`
   - **Produção 2.0** (`production.status` / `currentStage`): `waiting` | `separacao_corte` | `estamparia` | `costura` | `embalagem` | `ready` | `completed`
   - **Envio 2.0** (`shipping.status`): `pending` | `label_created` | `shipped` | `in_transit` | `delivered` | `returned`
   - **Devoluções & Logística Reversa 2.0** (`returnStatus` / `returns`): `requested` | `authorized` | `inspected` | `completed`
     - Guarda Central de Elegibilidade (`assertShippingOrderEligible`): Exige pagamento `approved` e produção em `ready` ou `completed`.
     - Trava Atômica de Transação: O documento `shipping_locks/{orderId}` e chaves de idempotência em `stock_idempotency` bloqueiam cliques duplos e duplicidades.
     - Padrão de Duas Passagens em Transações Firestore: Leitura completa prévia de documentos antes da fase de escrita (`reads before writes`) em todas as operações de estoque e devolução.
     - Conferência Física e Re-Estoque Selectivo: Apelos de devolução verificam a integridade do produto (`resellable !== false`). Peças vendáveis retornam ao estoque físico e disponível; peças danificadas ou personalizadas/estampadas permanecem no ledger de avarias sem inflar estoque vendável.
3. **Três Trilhas Separadas de Registros**:
   - **Histórico do Pedido** (`history` / `historyLogs`): Eventos funcionais visíveis no pedido.
   - **Auditoria** (`audit_logs`): Operações administrativas (operador, IP, motivo, alteração de status/prioridade/atribuição).
   - **Movimentação de Estoque, Travas e Devoluções** (`stock_movements`, `stock_reservations`, `shipping_locks`, `returns`): Registros de baixa física, reservas, consumo, travas concorrentes e ledger de devoluções.

