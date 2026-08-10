# Fluxo do Controle de Produção — F PAC STORE

## Estágios de Produção

1. `waiting` (Aguardando Fila / Pedido Aprovado)
2. `separacao_corte` (Separação de Tecido e Corte)
3. `estamparia` (Aplicação de Estampa e Serigrafia)
4. `costura` (Costura e Acabamento)
5. `embalagem` (Conferência de Qualidade e Embalagem)
6. `ready` (Pronto para Envio)
7. `completed` (Concluído)

## Regras de Transição e Atualização

- **Histórico Append-Only**: Cada avanço de estágio armazena o estágio anterior, o novo estágio, operador, data/hora e observação opcional.
- **Notificação Automática**: Permite disparo configurável de mensagens de WhatsApp ao mudar de estágio.
- **Alteração Manual pelo Admin**: Endpoint `/api/admin/orders/:orderId/production-status`.
