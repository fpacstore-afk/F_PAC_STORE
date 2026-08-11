# 🚚 FLUXO OFICIAL DE LOGÍSTICA & ENVIO 2.0 (SHIPPING 2.0) — F PAC STORE

> **FASE 8.5 — RASTREAMENTO & ENTREGA 2.0 (TRACKING, ATUALIZAÇÃO LOGÍSTICA E ENTREGA SEGURA)**  
> *Versão Canônica do Backend — O fluxo pós-despacho `shipped` → `in_transit` → `delivered` consolida o rastreamento, eventos logísticos, idempotência e inviolabilidade do estado terminal.*

---

## 1. MODELO CANÔNICO DO DOMÍNIO DE ENVIO & TRACKING

O status de envio do pedido no documento `OrderCanonical` (`/server/types/order.types.ts`) é representado por `shipping.status` e espelhado em `shippingStatus`.

Os únicos status válidos do domínio canônico são:

| Status Canônico | Descrição Operacional | Significado do Sistema |
| :--- | :--- | :--- |
| `pending` | Aguardando Envio | Pedido aprovado e em produção, aguardando finalização para ser liberado. |
| `label_created` | Etiqueta Gerada | Etiqueta criada via integração Melhor Envio (`shippingLabelId`). **NÃO consome estoque**. |
| `shipped` | Despachado | **PONTO ÚNICO DE CONSUMO FÍSICO DO ESTOQUE** (`consumeStockReservation()`). Transição atômica de reserva ativa para consumida. |
| `in_transit` | Em Trânsito | Pedido em movimentação logística rumo ao destino (`inTransitAt`). **NÃO altera estoque**. |
| `delivered` | Entregue | Entrega confirmada (`deliveredAt`). Estado terminal de envio. **NÃO altera estoque**. |
| `returned` | Devolvido | Devolução logística informada pela transportadora. **NÃO altera estoque nem realiza reembolso financeiro automaticamente** (exige `processPhysicalReturn` para recebimento físico e estorno financeiro via sistema de pagamento). |

---

## 2. REGRAS DE RASTREAMENTO & VALIDAÇÃO DE DADOS DE ENVIO

1. **Validação Estrita de Código de Rastreio (`validateTrackingInfo`)**:
   - `trackingCode`: deve ser uma string de texto válida (mínimo 2 caracteres), rejeitando `null`, `undefined`, `[object Object]`, numéricos, arrays ou strings vazias (`INVALID_TRACKING_CODE`).
   - `carrier`: deve ser uma string de texto com nome da transportadora/serviço.
   - `trackingUrl`: deve ser uma URL válida com protocolo `http://` ou `https://` (`INVALID_TRACKING_URL`).
2. **Histórico Estruturado de Eventos Logísticos (`shipping.trackingEvents`)**:
   - Cada atualização logística ou evento via webhook grava um item estruturado no array `shipping.trackingEvents`:
   ```json
   {
     "eventId": "evt_1723348200_abc12",
     "status": "in_transit",
     "timestamp": "2026-08-11T03:30:00.000Z",
     "eventAt": "2026-08-11T03:30:00.000Z",
     "source": "admin | webhook | melhor_envio",
     "carrier": "Correios",
     "trackingCode": "AB123456789BR",
     "trackingUrl": "https://rastreamento.correios.com.br/app/index.php?codigo=AB123456789BR",
     "description": "Objeto em trânsito - por favor aguarde"
   }
   ```
3. **Consulta Pública de Rastreio (`GET /api/orders/:orderId/tracking`)**:
   - Endpoint público e limitado para verificação de rastreio pelo cliente.
   - Retorna apenas informações públicas não sensíveis (`shippingStatus`, `carrier`, `trackingCode`, `trackingUrl`, `inTransitAt`, `deliveredAt`, `isLocalDelivery`, `trackingEvents`).
   - NÃO expõe chaves secretas, tokens, emails do operador ou notas internas administrativas.

---

## 3. ENTREGA PRÓPRIA / RETIRADA LOCAL (JOINVILLE)

1. **Sem Código Fictício**: Pedidos de Entrega Própria (`isLocalDeliveryOrder`) NÃO geram e NÃO exigem código de rastreio fictício ou artificial.
2. **Fluxo Simplificado**: Podem transicionar diretamente de `shipped` para `delivered`.
3. **Registro de Conclusão**: Ao marcar como `delivered`, o sistema registra `deliveredAt` e nota operacional de conclusão de entrega local.

---

## 4. INVARIÂNCIA, IDEMPOTÊNCIA & PROTEÇÃO CONTRA FORA DE ORDEM

1. **Garantia de Invariância**:
   - A transição para `in_transit` ou `delivered` **NUNCA** altera a quantidade de estoque físico, reservado ou disponível.
   - A transição para `in_transit` ou `delivered` **NUNCA** altera `payment.status` ou `production.status`.
2. **Proteção de Estado Terminal (`delivered`)**:
   - Um pedido marcado como `delivered` não pode ter seu status revertido para `shipped`, `in_transit`, `label_created` ou `pending` (`INVALID_SHIPPING_TRANSITION`).
   - Eventos webhooks fora de ordem recebidos após `delivered` registram o log no histórico `shipping.trackingEvents`, mas preservam o status `delivered` e o timestamp `deliveredAt`.
3. **Idempotência de Webhook (`POST /api/shipping/webhook/tracking`)**:
   - Todo evento de rastreio possui chave de idempotência `shipping_event_${eventId}` gravada em `idempotency_records`.
   - Eventos duplicados são identificados e respondidos com `{ success: true, idempotent: true }` sem duplicação de dados.

---

## 5. MÁQUINA DE ESTADOS DO ENVIO (`canTransitionShippingStatus`)

```text
[ pending ] ──► [ label_created ] ──► [ shipped ] ──► [ in_transit ] ──► [ delivered ] (Terminal)
     │                 │                  │                │                 │
     └─────────────────┴──────────────────┴────────────────┴─────────────────┴──► [ returned ] (Terminal)
```

### Regras da Máquina de Estados:
- **Zero Saltos Proibidos**: Saltos que queimam etapas sem despacho (ex: `pending` -> `delivered`, `pending` -> `in_transit`, `label_created` -> `in_transit`, `label_created` -> `delivered`) são estritamente rejeitados com HTTP 400 (`INVALID_SHIPPING_TRANSITION`).
- **Ponto Obrigatório**: O pedido deve obrigatoriamente passar por `shipped` para que o estoque seja devidamente consumido.
- **Proteção de Regressão**: `delivered` não pode regredir para `shipped` ou `in_transit`. Permite apenas `returned` em casos de devolução pós-entrega.
- **Idempotência**: Repetir o mesmo status (ex: `in_transit` -> `in_transit`) é seguro e idempotente.

---

## 6. AUDITORIA & REGISTRO DE MUTAÇÕES

Todas as alterações de envio gravam histórico estruturado no pedido:

```json
{
  "type": "shipping_update",
  "status": "shipped",
  "previousStatus": "label_created",
  "timestamp": "2026-08-11T03:30:00.000Z",
  "message": "Status de envio alterado para shipped",
  "operator": "admin@fpacstore.com.br"
}
```

Além disso, todas as mutações registram logs permanentes no Firestore via `recordAuditLog`.
