# Fluxo Financeiro e de Pagamento — F PAC STORE

## Processamento de Pagamento

1. **Início (PIX ou Cartão)**:
   - Requisição via Mercado Pago API.
   - Pedido gerado com `paymentStatus = 'pending'`.

2. **Aprovação (`approved`)**:
   - Confirmado via Webhook ou verificação ativa do painel.
   - Atualiza `payment.paidAmount` e `payment.pendingAmount = 0`.
   - Dispara baixa de estoque atômica (`adjustStock(items, 'subtract')`).
   - Refletido automaticamente no Financeiro.

3. **Cancelamento / Reembolso (`cancelled` / `refunded`)**:
   - Reverte o estoque caso a baixa já tenha ocorrido.
   - Marca `stockReverted = true` e grava log de movimentação do estoque.
   - Atualiza métricas financeiras.

4. **Alteração Manual pelo Administrador**:
   - Endpoint seguro `/api/admin/orders/:orderId/payment-status`.
   - Exige motivo obrigatório.
   - Grava evento de auditoria em `audit_logs` e no histórico do pedido.
