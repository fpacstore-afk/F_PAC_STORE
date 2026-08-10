# Fluxo de Controle de Estoque — F PAC STORE

## Gestão e Movimentações de Estoque

1. **Baixa por Venda**:
   - Acionada na aprovação do pagamento.
   - Deduz quantidade por variante (cor, tamanho, modelo).
   - Registra movimentação do tipo `subtract` na coleção `stock_movements`.

2. **Reversão por Cancelamento / Devolução**:
   - Acionada ao cancelar pedido ou processar devolução.
   - Reacrescenta quantidade das variantes.
   - Registra movimentação do tipo `add` ou `return` com motivo e ID do pedido.

3. **Ajuste Manual**:
   - Endpoint `/api/admin/stock/movement`.
   - Permite acréscimo, redução ou definição direta de quantidade com justificativa.
   - Gera log de auditoria e registro de movimentação com operador e timestamp.

4. **Prevenção de Baixa Dupla**:
   - Flag `stockReverted` impede reposição repetida.
   - Mapeamento de eventos processados impede baixa duplicada.
