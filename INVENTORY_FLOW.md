# 📦 FLUXO OFICIAL DE ESTOQUE 2.0 (INVENTORY 2.0) — F PAC STORE

> **FASE 8.4 — DESPACHO & ESTOQUE 2.0 (CONSUMO FÍSICO, IDEMPOTÊNCIA E CONSISTÊNCIA TRANSACIONAL)**  
> *Versão Canônica do Backend — O estoque é gerido pelo modelo de 3 variáveis canônicas.*

---

## 1. MODELO CANÔNICO DE ESTOQUE (`physicalQuantity`, `reservedQuantity`, `availableQuantity`)

Todas as variantes de produto gerenciam seu estoque por 3 variáveis estritas:

- `physicalQuantity` (Estoque Físico Real): Quantidade total de unidades físicas presentes no depósito.
- `reservedQuantity` (Estoque Reservado): Quantidade total reservada por pedidos com pagamento aprovado aguardando envio.
- `availableQuantity` (Estoque Disponível): Calculado dinamicamente via `availableQuantity = max(0, physicalQuantity - reservedQuantity)`.

---

## 2. ETAPAS DO CICLO DE VIDA DO ESTOQUE

### 1. Reserva Transacional na Aprovação do Pagamento (`reserveStock`)
- **Gatilho**: Transição de pagamento para `approved` (`paymentStatus = approved`).
- **Ação**:
  - `reservedQuantity` aumenta na quantidade do pedido.
  - `availableQuantity` diminui.
  - `physicalQuantity` permanece INALTERADO.
  - Cria registro ativo na coleção `stock_reservations` com status `active`.
  - Registra movimentação do tipo `reservation_create` em `stock_movements`.

### 2. Consumo Físico no Despacho (`consumeStockReservation`)
- **Gatilho Único**: `shipping.status = shipped`.
- **Ação**:
  - `physicalQuantity` diminui na quantidade do pedido.
  - `reservedQuantity` diminui na quantidade do pedido.
  - `availableQuantity` (`physicalQuantity - reservedQuantity`) permanece consistente.
  - Atualiza a reserva em `stock_reservations` para status `consumed`.
  - Registra movimentação do tipo `reservation_consumption` em `stock_movements`.
  - **Nenhuma outra etapa** (`label_created`, `in_transit`, `delivered`) consome ou altera o estoque.

### 3. Liberação de Reserva por Cancelamento / Rejeição (`releaseStockReservation`)
- **Gatilho**: Pedido cancelado ou pagamento rejeitado/estornado antes do despacho.
- **Ação**:
  - `reservedQuantity` diminui na quantidade do pedido.
  - `availableQuantity` aumenta na mesma proporção.
  - `physicalQuantity` permanece INALTERADO.
  - Atualiza a reserva para status `released`.
  - Registra movimentação do tipo `reservation_release` em `stock_movements`.

### 4. Devolução Física Pós-Despacho (`processPhysicalReturn`) — FASE 8.6
- **Gatilho**: Entrada de devolução física conferida via `/api/admin/orders/:orderId/returns/physical-receive`.
- **Ação**:
  - Valida limites de devolução por item em relação à quantidade originalmente comprada menos devoluções anteriores (`INVALID_RETURN_QUANTITY`).
  - **Itens Vendáveis (Aptos para Revenda)**: `physicalQuantity` e `availableQuantity` aumentam exclusivamente se a peça estiver em perfeitas condições (`resellable !== false` e não for personalizada/estampada).
  - **Itens Avariados ou Personalizados**: Registrados no ledger e histórico de devoluções, mas **NÃO incrementam estoque vendável**.
  - `reservedQuantity` permanece INALTERADO.
  - Registra movimentação em `stock_movements` (`type: return` ou `type: non_sellable_return`) e atualiza o histórico/ledger de devolução (`returns`) no pedido.
  - **Idempotência**: Chave única `physical_return:{orderId}:{orderItemId}:{returnId}` evita entradas duplicadas.
  - **Totalmente independente de estornos financeiros**.

### 5. Saída / Entrada Manual (`adjustStock`)
- **Saída Manual**: Exige `availableQuantity >= quantidade`. **Proibido consumir estoque reservado** por pedidos ativos.
- **Entrada Manual**: Incrementa `physicalQuantity` e `availableQuantity`.

---

## 3. GARANTIA TRANSACIONAL E IDEMPOTÊNCIA PERSISTENTE

1. **Padrão de Duas Passagens em Transações Firestore**:
   - Todas as operações em `store.service.ts` (`reserveStock`, `releaseStockReservation`, `consumeStockReservation`, `processPhysicalReturn`, `adjustStock`) executam em **duas passagens estritas**:
     1. Passagem 1: Todos os `transaction.get` (leituras do Firestore).
     2. Passagem 2: Todos os `transaction.update` / `transaction.set` (escritas no Firestore).
   - Impede o erro de violação do Firestore (`reads must precede writes`).
2. **Subcoleção / Documentos de Idempotência**:
   - Chaves de idempotência gravadas atomicamente no Firestore em `stock_idempotency` garantem que duplicidades (duplo clique, retries de rede) sejam ignoradas sem causar baixas de estoque duplicadas.
