# Fluxo do Controle de Produção 2.0 — F PAC STORE

## Central Operacional de Produção (Fase 7.1 — Retificação da Máquina de Produção)

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

## 2. Regras Operacionais, Elegibilidade Central e Mutações de Estado

1. **Guarda Central de Elegibilidade (`assertProductionOrderEligible`)**:
   - **Somente `payment.status = approved`** libera mutações operacionais e avanço na esteira de produção.
   - **Bloqueio Financeiro (`pending`, `processing`, `rejected`, `cancelled`, `refunded`)**: Pedidos sem pagamento aprovado retornam `400 PRODUCTION_BLOCKED_PAYMENT`.
   - **Bloqueio por Cancelamento (`order.status = cancelled` / `rejected`)**: Pedidos cancelados ou rejeitados retornam `400 PRODUCTION_BLOCKED_CANCELLED`.
   - **Bloqueio por Despacho Logístico (`shipping.status = shipped`, `in_transit`, `delivered`)**: Pedidos que deixaram a fábrica não podem sofrer mutações de produção e retornam `400 PRODUCTION_BLOCKED_SHIPPING`.

2. **Progressão Estritamente Consecutiva (Sem Saltos)**:
   - A avanço normal na produção exige transição rigorosa de 1 passo: `waiting → separacao_corte → estamparia → costura → embalagem → ready → completed`.
   - Saltos de etapas (ex: `waiting → completed` ou `waiting → estamparia`) são **estritamente rejeitados pelo backend** com `400 INVALID_PRODUCTION_TRANSITION` (parâmetro `forceAdmin` não é salvo conduto para burlar a sequência fabril).

3. **Retrocesso Excepcional Exige Justificativa**:
   - Voltar um pedido para uma etapa anterior (ex: `embalagem → estamparia` por defeito no tecido) é permitido somente com justificativa/observação obrigatória (`note`), sendo registrado no histórico de auditoria. Retrocessos sem nota retornam `400 PRODUCTION_REGRESSION_REASON_REQUIRED`.

4. **Regras de Exclusão da Fila Ativa (Kanban)**:
   - Pedidos cancelados (`cancelled`/`rejected`), com pagamento não aprovado (`pending`/`processing`/`rejected`), ou já despachados/entregues (`shipped`/`in_transit`/`delivered`) são automaticamente excluídos da fila ativa de trabalho fabril.

5. **Métricas e Metadados Operacionais**:
   - `priority`: Nível de prioridade (`normal`, `alta`, `urgente`).
   - `assignedTo`: Operador responsável pela etapa de produção.
   - `dueDate` / `productionDueDate`: Prazo limite para conclusão da fabricação.
   - `enteredAt`: Timestamp do exato momento de entrada na etapa atual.
   - `notes`: Histórico acumulativo de observações técnicas da fábrica.

6. **Isolamento Total do Estoque 2.0**:
   - A conclusão da produção (`completed`) **NÃO** altera ou decrementa `physicalQuantity` nem `availableQuantity`. A baixa física ocorre estritamente na confirmação de envio pelo módulo de envio (`shippingStatus = shipped`).

---

## 3. Endpoints de Produção Protegidos

Todos os endpoints operacionais aplicam a guarda central de elegibilidade e trilha de auditoria no histórico do pedido:

- `POST /PUT /api/admin/orders/:orderId/production-status` — Altera estágio da produção.
- `POST /PUT /api/admin/orders/:orderId/production-priority` — Altera prioridade.
- `POST /PUT /api/admin/orders/:orderId/production-assignment` — Atribui operador responsável.
- `POST /PUT /api/admin/orders/:orderId/production-due-date` — Define data limite de produção.
- `POST /api/admin/orders/:orderId/production-notes` — Adiciona observação operacional.


