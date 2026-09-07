from pathlib import Path

path = Path('src/components/AdminFinancial.tsx')
text = path.read_text()

legacy_block = """    const approvedOrders = orders.filter(o => {\n      const s = getNormalizedStatus(o.status);\n      return ['pagamento aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered', 'enviado', 'concluído', 'concluido'].includes(s);\n    });"""
canonical_block = """    const approvedOrders = orders.filter(o =>\n      getOrderPaymentStatus(o) === 'approved' || getOrderPaidAmount(o) > 0\n    );"""
text = text.replace(legacy_block, canonical_block)

legacy_history = """    const approvedHistory = orders.filter(o => {\n      const s = getNormalizedStatus(o.status);\n      return ['pagamento aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered', 'enviado', 'concluído', 'concluido'].includes(s);\n    });"""
canonical_history = """    const approvedHistory = orders.filter(o =>\n      getOrderPaymentStatus(o) === 'approved' || getOrderPaidAmount(o) > 0\n    );"""
text = text.replace(legacy_history, canonical_history)

legacy_table = """                          const isApproved = ['Pagamento Aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered'].includes(order.status);"""
canonical_table = """                          const isApproved = getOrderPaymentStatus(order) === 'approved' || getOrderPaidAmount(order) > 0;"""
text = text.replace(legacy_table, canonical_table)

legacy_helper = """  // Helper to normalize status checks\n  const getNormalizedStatus = (status: string) => {\n    return String(status || '').trim().toLowerCase();\n  };\n\n"""
text = text.replace(legacy_helper, '')

if "getNormalizedStatus(" in text:
    raise SystemExit('Legacy status helper still referenced; aborting')

if "['pagamento aprovado', 'payment_approved', 'separacao', 'embalagem', 'shipped', 'delivered', 'enviado', 'concluído', 'concluido']" in text:
    raise SystemExit('Legacy approved status list still present; aborting')

path.write_text(text)
