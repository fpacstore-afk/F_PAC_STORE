# Fluxo de Controle de Estoque — F PAC STORE

## Gestão e Movimentações de Estoque

1. **Baixa por Venda**:
   - Acionada na aprovação do pagamento.
   - Executada dentro de **Transação Atômica do Firestore** (`db.runTransaction`).
   - Se a quantidade solicitada for maior do que o estoque disponível, a operação é **REJEITADA** com `OutOfStockError` (`INSUFFICIENT_STOCK`), sem mascaramento por `Math.max(0, ...)`.
   - Registra movimentação do tipo `subtract` na coleção `stock_movements`.

2. **Reversão por Cancelamento / Devolução**:
   - Acionada ao cancelar pedido ou processar devolução.
   - Reacrescenta quantidade das variantes atomicamente.
   - Registra movimentação do tipo `add` ou `return` com motivo e ID do pedido.
   - A flag `stockReverted` é ativada no pedido para impedir reposição duplicada.

3. **Ajuste Manual**:
   - Endpoint protegido `/api/admin/stock/movement`.
   - Permite acréscimo, redução ou definição direta de quantidade com justificativa.
   - Valida autorização e gera log de auditoria em `audit_logs` e registro físico em `stock_movements`.

4. **Proteção contra Concorrência e Idempotência**:
   - Transações do Firestore garantem que apenas uma requisição consiga a última unidade do produto em vendas concorrentes.
   - Mapeamento de idempotência impede baixa ou reajuste duplicado em retentativas.
