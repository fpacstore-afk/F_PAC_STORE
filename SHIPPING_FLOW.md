# Fluxo de Envio e Logística — F PAC STORE

## Etapas do Envio

1. **Pronto para Envio**: Pedido concluído na produção.
2. **Geração de Etiqueta**: Integração com Melhor Envio via `/api/shipping/create-label`.
   - Impede criação duplicada via validação de `shippingLabelId`.
3. **Código de Rastreamento**: Código salvo no documento do pedido (`trackingCode`).
4. **Despacho / Enviado**: Status alterado para `shipped`.
5. **Entrega Concluída**: Status atualizado para `delivered`.
