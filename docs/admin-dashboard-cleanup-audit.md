# Auditoria — Dashboard administrativo e legado técnico

## Objetivo
Reduzir legado técnico do painel administrativo sem alterar comportamento de produção nem remover automações ainda potencialmente úteis.

## Remoções seguras nesta etapa
Foram removidos somente dois workflows `workflow_dispatch` que estavam explicitamente arquivados como `archived-one-shot`, executavam apenas `No-op` e declaravam no próprio arquivo que o patch já havia sido aplicado:

- `.github/workflows/apply-checkout-atomic-order.yml`
- `.github/workflows/apply-checkout-reversion-ack.yml`

Esses arquivos não executavam correção, build, teste ou deploy.

## Workflows mantidos por cautela
Os seguintes workflows antigos ainda possuem lógica de escrita e apontam para branches de certificação específicas. Por isso NÃO foram removidos nesta etapa:

- `apply-finance-2-atomic-payment.yml`
- `apply-production-2-fix.yml`
- `apply-production-2-panel-fix.yml`
- `apply-shipping-2-atomic-status.yml`
- `apply-catalog-integration.yml`

Antes de qualquer remoção futura, é obrigatório confirmar que o patch correspondente já está incorporado em `main`, que o script não é mais necessário e que não existe dependência operacional/documental.

## Estado já confirmado em main
O controlador administrativo atual já contém a transição de produção em transação Firestore e a alteração manual de pagamento com ledger e mutação do pedido na mesma transação. Isso mostra que pelo menos parte dos patches históricos já foi incorporada, mas não é evidência suficiente para apagar todos os workflows/scripts relacionados sem auditoria individual.

## Estrutura do Financeiro
`AdminFinancial.tsx` continua como agregador principal e carrega módulos especializados de contas a receber, pagamentos, reembolsos, ledger, contas a pagar, fornecedores, previsão de caixa, drawer financeiro e rentabilidade. A próxima etapa deve priorizar simplificação de navegação/nomenclatura e redução de acoplamento, não reescrever cálculos já canonicalizados.

## Regra de segurança
Nenhum arquivo com lógica ativa será removido apenas por ter nome antigo ou prefixo `apply-`. Remoções futuras exigem confirmação de incorporação em `main` e validação completa de TypeScript, testes, build e preflight de produção.
