# Fluxo do Pedido — F PAC STORE

## Ciclo de Vida do Pedido

```
[Carrinho / Checkout]
       │
       ▼
[Pedido Criado] ─── (status: 'received', paymentStatus: 'pending', productionStatus: 'waiting')
       │
       ├─► [Pagamento Aprovado] ───► (paymentStatus: 'approved', productionStatus: 'waiting' / 'separacao_corte')
       │                                     │
       │                                     ├─► Baixa automática no estoque
       │                                     └─► Registro da transação financeira
       │
       └─► [Pagamento Recusado / Cancelado] ───► (paymentStatus: 'rejected' / 'cancelled')
                                                   │
                                                   └─► Reversão/Liberação automática do estoque (se aplicável)
```

## Duas Linhas Independentes de Status

- **Status de Pagamento (`payment.status` / `paymentStatus`)**:
  - `pending` (Aguardando Pagamento)
  - `approved` (Pago / Aprovado)
  - `rejected` (Recusado)
  - `cancelled` (Cancelado)
  - `refunded` (Reembolsado)

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
  - `delivered` (Entregue)
