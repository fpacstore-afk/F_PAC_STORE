# Fluxo Financeiro e de Pagamento — F PAC STORE

## Modelo Unificado de PaymentStatus (FASE 6.8, 6.8.1 & 6.8.2)

A F PAC STORE utiliza o tipo canônico `PaymentStatus` unificado em toda a aplicação (frontend, backend, banco de dados e regras de segurança):

```typescript
export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'partially_paid'
  | 'partially_refunded';
```

## Domínio de Estados e Regras Financeiras (FASE 6.8.2)

1. **`pending` (Pendente)**:
   - Pedido criado aguardando confirmação de pagamento (PIX ou Cartão).
   - Mantém reserva temporária de estoque na coleção `stock_reservations`.

2. **`processing` (Em Análise)**:
   - Transação em processamento ou análise de risco pelo gateway (Mercado Pago).
   - Mantém reserva temporária de estoque sem alteração de saldo físico.

3. **`approved` (Aprovado)**:
   - Pagamento confirmado integralmente (`paidAmount == total`, `pendingAmount == 0`).
   - Mantém reserva de estoque ativa para processamento pela produção.
   - Atualiza métricas financeiras.

4. **`partially_paid` (Pagamento Parcial)**:
   - Registro de pagamento de um sinal ou parcela.
   - `paidAmount` e `pendingAmount` são calculados de forma transparente.
   - **NÃO altera nem devolve estoque físico** — mantém a reserva ativa intacta.

5. **`partially_refunded` (Reembolso Parcial)**:
   - Registro de devolução parcial de valores ao cliente.
   - **NÃO altera nem movimenta o estoque físico automaticamente**.

6. **`rejected` (Rejeitado)**:
   - Transação negada ou expirada no gateway.
   - Libera automaticamente a reserva de estoque via `releaseStockReservation()`.

7. **`cancelled` (Cancelado)**:
   - Cancelamento efetuado pelo cliente ou administrador.
   - **Atenção (FASE 6.8.2)**: `ORDER CANCELLED ≠ PAYMENT REFUNDED`. Cancelar o pedido altera `order.status = 'cancelled'`, mas **preserva integralmente** `paidAmount` e o status de pagamento original se houver valor recebido.
   - Libera a reserva de estoque via `releaseStockReservation()` de forma estritamente idempotente.

8. **`refunded` (Reembolsado)**:
   - Estorno total efetuado via operação financeira dedicada.
   - Estado terminal de pagamento.

## Regras de Cancelamento Autenticado e Preservação Financeira (FASE 6.8.2)

- **Autenticação Obrigatória**: Chamadas ao endpoint `POST /api/orders/:orderId/cancel` devem incluir token de autenticação Firebase Auth (`Authorization: Bearer <ID Token>`). Requisições sem token resultam em `401 UNAUTHORIZED`.
- **Hierarquia Estrita de Autorização**:
  - O e-mail enviado no corpo da requisição (`req.body.email`) é **totalmente ignorado**.
  - **Prioridade 1 (UID)**: Se o pedido possuir `order.userId`, o token `decodedToken.uid` **deve** ser exatamente igual ao `order.userId`. Mismatch de UID resulta em `403 FORBIDDEN` (mesmo que o e-mail seja igual).
  - **Prioridade 2 (Fallback Email)**: Se o pedido for histórico/guest (sem `userId`), permite-se propriedade por e-mail, exigindo obrigatoriamente `decodedToken.email_verified === true`. Se `email_verified` for falso -> `403 EMAIL_NOT_VERIFIED`.
- **Preservação de `paidAmount`**:
  - Pedido `partially_paid` (Ex: Total R$ 100, Pago R$ 40): Ao cancelar, `order.status = 'cancelled'`, mas `paidAmount = 40` e `paymentStatus = 'partially_paid'` continuam registrados no histórico financeiro.
  - Pedido `approved` (Ex: Total R$ 100, Pago R$ 100): Ao cancelar, `order.status = 'cancelled'`, mas `paidAmount = 100` e `paymentStatus = 'approved'` permanecem intactos. Reembolso exige operação dedicada.
  - Pedido `pending` (Pago R$ 0): `order.status = 'cancelled'`, `paymentStatus = 'cancelled'`, `paidAmount = 0`.
- **Proteção do Painel Administrativo**:
  - Alterações manuais de status de pagamento para `cancelled`, `rejected` ou `expired` quando `paidAmount > 0` são rejeitadas com `400 INVALID_PAYMENT_TRANSITION`.

## Transições Permitidas na Máquina de Estados (`canTransitionPaymentStatus`)

- `pending` -> `processing`, `approved`, `partially_paid`, `rejected`, `cancelled`
- `processing` -> `approved`, `partially_paid`, `rejected`, `cancelled`
- `partially_paid` -> `approved`, `partially_paid`, `refunded`, `partially_refunded`
- `approved` -> `partially_refunded`, `refunded`
- `rejected` -> `pending`, `cancelled`
- `cancelled` -> `[]` (Terminal — proibida reversão para `approved`)
- `refunded` -> `[]` (Terminal — proibida reversão para `approved`)
- `partially_refunded` -> `refunded`
