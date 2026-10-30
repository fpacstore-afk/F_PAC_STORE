# Correção de recebimentos manuais

A gestão oferece **Corrigir valor recebido** na lista de contas a receber e na Central Financeira do Pedido. A ação atende a baixa registrada por engano, inclusive quando o pedido foi marcado integralmente como pago. O usuário informa o **total efetivamente recebido**, um motivo e confirma a prévia do saldo restante.

Exemplo: em uma venda de R$ 2.565,00 marcada como quitada, informar R$ 570,00 como recebido deixa R$ 1.995,00 em aberto. A correção não muda o preço da venda e não é uma devolução de dinheiro.

## Comportamento

- Disponível para recebimentos manuais, inclusive após entrega. Pagamentos vinculados a um provedor, cobranças com resultado incerto, pedidos cancelados e estornos ainda ativos são recusados. Um estorno real não é apagado para abrir caminho à correção.
- Aceita total correto entre zero e o total do pedido, estritamente menor que o recebido registrado. Recebimentos adicionais continuam no fluxo Registrar pagamento.
- Atualiza os saldos e seus espelhos, recalcula o status e redistribui o valor confirmado nas parcelas existentes, mantendo valores e vencimentos das parcelas.
- Preserva total, itens, produção, entrega, estoque, reservas e os lançamentos antigos. Não chama APIs de pagamento, envio ou mensagens.
- Acrescenta `payment_correction` com a diferença assinada, motivo, operador, antes/depois e referência à projeção anterior. Auditoria, evento e pedido são gravados na mesma transação.
- Rejeita prévias financeiras desatualizadas e chaves reutilizadas com outro pedido ou conteúdo. Repetir a mesma solicitação não cria outra correção e devolve o estado financeiro atual.

## Recebimentos por data

Os `paymentLogs` e o histórico original continuam intactos. `paymentReceiptBasis` guarda uma projeção dos recebimentos válidos após a correção, com a posição até a qual os logs foram considerados. Novos pagamentos posteriores são somados uma vez a essa base.

O ajuste retira primeiro valores sem data comprovada e depois os recebimentos mais recentes. As datas dos valores mantidos são preservadas. Histórico incompleto ou conflitante permanece como valor sem data para conferência; não se inventa uma entrada na data da correção. A mesma projeção atende caixa, metas e indicadores que usam `summarizeReceipts`.

Correções não contam como novos recebimentos no contador do ledger. São exibidas como **Correção de recebimento**, com diferença negativa; não como reembolso.

A gaveta de Produção sinaliza quando há correções e mostra o recebido válido, o saldo devedor e os ajustes, para que os lançamentos originais preservados não sejam confundidos com o saldo atual.

## Fluxos antigos

Os atalhos de reparo que zeravam o saldo ou alteravam o total da venda após reversão de estorno foram substituídos pela correção explícita. As rotas antigas respondem `409 PAYMENT_CORRECTION_REQUIRED`. Reverter um estorno de pagamento parcial passa a preservar o saldo devedor correto, em vez de forçar quitação.

A reversão manual de estorno também recusa pagamentos vinculados ao provedor: uma devolução efetiva exige conciliação no gateway e não deve ser apresentada como dinheiro restaurado apenas por alteração cadastral.

Retries de pagamento manual também passam a conferir pedido, valor e método da chave original e retornar os saldos atuais. A resposta inclui os dados financeiros atualizados para a gaveta não manter um saldo antigo enquanto aguarda o listener.

## Segurança e validação

`POST /api/admin/orders/:orderId/payment-correction` permanece sob `adminApiLimiter` e `authenticateAdmin`. Valores são validados em centavos, motivo e confirmação são obrigatórios, e a identidade vem do middleware, não do corpo da requisição.

`npm run test:payment-correction` reproduz quitação equivocada, estornos e reversão em banco isolado, preservação de histórico e datas, pagamentos posteriores, replay, correções concorrentes, saldo zero recebido, falta de data, bloqueio de gateway e acesso anônimo. A suíte completa, TypeScript, build e preflight fazem parte da publicação normal. Os testes não usam pedidos reais nem enviam cobranças ou mensagens.
