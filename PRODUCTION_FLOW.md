# Fluxo do Controle de Produção 2.0 — F PAC STORE

## Central Operacional de Produção (Fase 7)

A Central Operacional de Produção 2.0 da F PAC STORE organiza a fabricação em uma esteira visível, rastreável e integrada de 7 estágios canônicos.

---

## 1. Estágios Canônicos de Produção

1. **`waiting`** — Aguardando Fila / Pedido Aprovado
2. **`separacao_corte`** — Separação de Tecido e Corte
3. **`estamparia`** — Aplicação de Estampa e Serigrafia (Estamparia PRIME)
4. **`costura`** — Costura e Acabamento
5. **`embalagem`** — Conferência de Controle de Qualidade (CQ) e Embalagem
6. **`ready`** — Pronto para Envio / Expedição
7. **`completed`** — Concluído

---

## 2. Regras Operacionais e Mutações de Estado

1. **Proteção Financeira**: Pedidos com pagamento pendente/recusado ou cancelado são bloqueados na esteira e sinalizados com tag de aviso. Não é possível alterar produção de pedidos cancelados ou com pagamento recusado.
2. **Retrocesso Exige Justificativa**: Mover um pedido para uma etapa anterior exige obrigatoriamente o envio de uma nota de justificativa (`note`), armazenada no histórico de auditoria.
3. **Métricas e Metadados Operacionais**:
   - `priority`: Nível de prioridade (`normal`, `alta`, `urgente`).
   - `assignedTo`: Operador responsável pela etapa de produção.
   - `dueDate` / `productionDueDate`: Prazo limite para conclusão da fabricação.
   - `enteredAt`: Timestamp do exato momento de entrada na etapa atual.
   - `notes`: Histórico acumulativo de observações técnicas da fábrica.
4. **Isolamento Total do Estoque 2.0**: A conclusão da produção (`completed`) **NÃO** altera ou decrementa `physicalQuantity` nem `availableQuantity`. A baixa física ocorre estritamente na confirmação de envio pelo módulo de envio (`shippingStatus = shipped`).
5. **Ficha de Produção**: Permite impressão em lote ou individual da ordem de fabricação contendo especificações técnicas de tamanho, cor, estampa, posição e observações de fabricação.

---

## 3. Endpoints de Produção Protegidos

- `POST /PUT /api/admin/orders/:orderId/production-status` — Altera estágio da produção.
- `POST /PUT /api/admin/orders/:orderId/production-priority` — Altera prioridade.
- `POST /PUT /api/admin/orders/:orderId/production-assignment` — Atribui operador responsável.
- `POST /PUT /api/admin/orders/:orderId/production-due-date` — Define data limite de produção.
- `POST /api/admin/orders/:orderId/production-notes` — Adiciona observação operacional.

