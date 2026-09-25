// The same manual categories are offered in the form and accepted when saving.
export const MANUAL_CASH_FLOW_CATEGORIES = [
  { value: 'Tráfego Pago', label: 'Tráfego Pago' },
  { value: 'Fornecedor', label: 'Fornecedor' },
  { value: 'Envio/Frete', label: 'Envio / Frete' },
  { value: 'Combustível', label: 'Combustível' },
  { value: 'Refeição', label: 'Refeição' },
  { value: 'Testes', label: 'Testes' },
  { value: 'Retirada', label: 'Retirada Pró-Labore' },
  { value: 'Ajuste Caixa', label: 'Ajuste Caixa' },
  { value: 'Brinde', label: 'Brinde' },
  { value: 'Outros', label: 'Outros' }
] as const;

export const CASH_FLOW_DESCRIPTION_OPTIONS = [
  'Pagamento de fornecedor',
  'Compra de peças lisas',
  'Compra de materiais para produção',
  'Pagamento de frete',
  'Anúncios e divulgação',
  'Abastecimento de combustível',
  'Refeição durante o trabalho',
  'Testes de produtos e estampas',
  'Brinde para cliente',
  'Retirada pró-labore',
  'Ajuste de caixa',
  'Entrada de dinheiro no caixa',
  'Reembolso recebido'
] as const;
