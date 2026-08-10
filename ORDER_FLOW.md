# Fluxo do Pedido — F PAC STORE

## Ciclo de Vida do Pedido (FASE 6.8.2 — Fechamento Financeiro e Autorização Final)

```
[Carrinho / Checkout]
       │
       ▼
[Pedido Criado] ─── (status: 'received', paymentStatus: 'pending', productionStatus: 'waiting')
       │
       ├─► [Pagamento Aprovado] ───► (paymentStatus: 'approved', productionStatus: 'waiting')
       │                                     │
       │                                     ├─► Reserva de estoque mantida
       │                                     └─► Registro no Financeiro
       │
       ├─► [Pagamento Parcial] ───► (paymentStatus: 'partially_paid')
       │                                     │
       │                                     └─► Mantém reserva de estoque intacta
       │
       └─► [Cancelamento Seguro] ───► (POST /api/orders/:orderId/cancel)
                                             │
                                             ├─► Autenticação estrita via Firebase Auth ID Token (401 se ausente)
                                             ├─► Autorização hierárquica (Prioridade UID; Email exigindo email_verified=true)
                                             ├─► Liberação automática e idempotente da reserva de estoque
                                             ├─► Preservação da verdade financeira (ORDER CANCELLED ≠ PAYMENT REFUNDED)
                                             └─► Registro no histórico do pedido e audit_logs
```

## Produção 2.0 e Central Operacional (FASE 7)

1. **Desacoplamento Completo**:
   - As máquinas de estado de **Pagamento**, **Produção** e **Envio** operam de forma isolada e paralela.
   - O avanço da produção exige que o pagamento esteja em estado váido (aprovado ou faturamento/parcial autorizado). Pedidos cancelados ou com pagamento recusado são estritamente bloqueados para alterações na esteira de produção.

2. **Garantias de Estoque 2.0**:
   - Nenhuma transição de estágio de produção (mesmo para `completed`) altera as quantidades físicas (`physicalQuantity`) ou disponíveis (`availableQuantity`) no Estoque 2.0.
   - A baixa física do estoque é realizada exclusivamente quando o status de envio é atualizado para `shipped`.

3. **Mutações Rastreáveis da Central de Produção**:
   - Alteração de Estágio: Exige justificativa (`note`) para qualquer retrocesso de etapa.
   - Alteração de Prioridade: `normal` | `alta` | `urgente` (registrado em `history`).
   - Atribuição de Operador Responsável: `assignedTo` (registrado em `history`).
   - Definição de Prazo Limite: `dueDate` (registrado em `history`).
   - Observações Técnicas: `production.notes` (lista acumulativa de notas de fábrica).

---

## Duas Linhas Independentes de Status

- **Status de Pagamento (`payment.status` / `paymentStatus`)**:
  - `pending` (Aguardando Pagamento)
  - `processing` (Em Análise)
  - `approved` (Aprovado / Pago)
  - `partially_paid` (Pagamento Parcial)
  - `rejected` (Rejeitado)
  - `cancelled` (Cancelado)
  - `refunded` (Reembolsado)
  - `partially_refunded` (Reembolso Parcial)

- **Status de Produção (`production.status` / `productionStatus`)**:
  - `waiting` (Aguardando Fila)
  - `separacao_corte` (Separação / Corte)
  - `estamparia` (Estamparia)
  - `costura` (Costura)
  - `embalagem` (Embalagem / CQ)
  - `ready` (Pronto para Envio)
  - `completed` (Finalizado)

- **Status de Envio (`shipping.status` / `shippingStatus`)**:
  - `pending` (Aguardando Etiqueta)
  - `label_created` (Etiqueta Gerada)
  - `shipped` (Enviado)
  - `in_transit` (Em Trânsito)
  - `delivered` (Entregue)
  - `returned` (Devolvido)

## Cancelamento Seguro e Autorização Final (FASE 6.8.2)

1. **Autenticação e Autorização Hierárquica Estritas**:
   - `POST /api/orders/:orderId/cancel` exige cabeçalho `Authorization: Bearer <Firebase ID Token>`.
   - Se o token for inválido ou ausente -> Retorna `401 UNAUTHORIZED`.
   - O e-mail enviado no corpo da requisição (`req.body.email`) é **totalmente ignorado** para autorização.
   - **Prioridade 1 (UID)**: Se o pedido possui `userId`, o `decodedToken.uid` **DEVE** ser exatamente igual ao `order.userId`. Caso haja divergência de UID, a requisição é rejeitada com `403 FORBIDDEN`, mesmo que o e-mail seja idêntico.
   - **Prioridade 2 (E-mail Fallback)**: Apenas se o pedido for histórico ou de visitante (sem `userId`), permite-se autorização por e-mail. Para isso, exige-se obrigatoriamente `decodedToken.email_verified === true` e correspondência com o e-mail do cliente. Se o e-mail do token não estiver verificado -> Retorna `403 EMAIL_NOT_VERIFIED`.

2. **Preservação Absoluta da Verdade Financeira**:
   - Cancelar um pedido **nunca** zera `paidAmount` nem apaga informação financeira real do pedido.
   - **Pedidos `partially_paid`**: `order.status` passa a `'cancelled'`, mas `paidAmount` (ex: R$ 40) e `paymentStatus` = `'partially_paid'` permanecem intactos.
   - **Pedidos `approved`**: `order.status` passa a `'cancelled'`, mas `paidAmount` (ex: R$ 100) e `paymentStatus` = `'approved'` permanecem intactos até um fluxo formal de estorno/reembolso (`refund`).
   - **Pedidos `pending`**: `order.status` e `paymentStatus` passam a `'cancelled'` com `paidAmount = 0` (pois nenhum valor foi pago).
   - **Painel Administrativo**: Tentar alterar manualmente o `paymentStatus` para `cancelled`, `rejected` ou `expired` quando `paidAmount > 0` é rejeitado com `400 INVALID_PAYMENT_TRANSITION`.

3. **Garantias Operacionais**:
   - **Idempotência**: Chamadas repetidas retornam `{ success: true, idempotent: true }` sem re-executar liberações.
   - **Proteção de Envio**: Se `shippingStatus` estiver em `shipped`, `in_transit` ou `delivered`, o cancelamento é bloqueado com erro `ORDER_CANNOT_BE_CANCELLED`.
   - **Liberação de Reserva**: Reserva de estoque é liberada uma única vez de forma idempotente.
