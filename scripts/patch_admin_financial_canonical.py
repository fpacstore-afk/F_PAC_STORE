from pathlib import Path

path = Path('src/components/AdminFinancial.tsx')
text = path.read_text(encoding='utf-8')

old_helper = '''  // Calculate Mercado Pago Rate & COGS per order helper\n  const calculateFeesAndMargins = (order: any) => {\n    const total = order.total || 0;\n    const method = String(order.paymentMethod || '').toLowerCase();\n    const gateway = String(order.gateway || '').toLowerCase();\n    \n    // 1. Calculate gateway/transaction Fee\n    let gatewayFee = 0;\n    if (gateway === 'manual' || order.isManual) {\n      if (method.includes('pix')) {\n        // 0.99% for PIX\n        gatewayFee = total * 0.0099;\n      } else if (method.includes('cartão') || method.includes('cartao') || method.includes('credit')) {\n        // 3.99% + 0.40 for Credit Card\n        gatewayFee = total * 0.0399 + 0.40;\n      } else {\n        // Cash (Dinheiro), Bank Transfer (Transferência), etc have no transactional fees\n        gatewayFee = 0;\n      }\n    } else {\n      // Site/Automatic orders (Gateway Mercado Pago)\n      if (method.includes('pix')) {\n        gatewayFee = total * 0.0099;\n      } else {\n        gatewayFee = total * 0.0399 + 0.40;\n      }\n    }\n\n    // 2. Shipping cost (supporting both manual 'shipping' and 'frete' fields)\n    const shippingCost = order.shipping || order.frete || 0;\n\n    // 3. COGS cost (costPrice calculation)\n    let cogs = 0;\n    if (order.items && Array.isArray(order.items)) {\n      order.items.forEach((item: any) => {\n        const prod = products.find(p => \n          p.id === item.id || \n          p.slug === item.id || \n          p.id === item.slug || \n          p.slug === item.slug\n        );\n        const singleCost = prod?.costPrice || prod?.cost || 0;\n        cogs += singleCost * (item.quantity || 1);\n      });\n    }\n\n    // 4. Net Profit\n    const netProfit = total - gatewayFee - shippingCost - cogs;\n\n    return { gatewayFee, shippingCost, cogs, netProfit };\n  };\n'''

new_helper = '''  // Canonical order financial adapter. Keeps the legacy view shape while\n  // delegating all money math to src/utils/orderFinancial.ts.\n  const calculateFeesAndMargins = (order: any) => {\n    const fin = calculateOrderFinancials(order, products);\n    return {\n      gatewayFee: fin.gatewayFee,\n      shippingCost: fin.shippingActualCost,\n      shippingSubsidy: fin.shippingSubsidy,\n      cogs: fin.cogs,\n      netProfit: fin.netProfit,\n      total: fin.grossTotal,\n      netReceived: fin.netReceived,\n      pendingAmount: fin.pendingAmount\n    };\n  };\n'''

if old_helper not in text:
    raise SystemExit('Expected local financial helper block not found')
text = text.replace(old_helper, new_helper, 1)

start_marker = '  // Order aggregations (Filtered by Period)\n'
end_marker = '  // Initial Investment aggregations & Break-Even calculation\n'
start = text.find(start_marker)
end = text.find(end_marker)
if start == -1 or end == -1 or end <= start:
    raise SystemExit('Order stats block markers not found')

new_order_stats = '''  // Order aggregations (Filtered by Period) — canonical financial engine\n  const orderStats = useMemo(() => {\n    const paidOrders = filteredOrders.filter(o => getOrderPaidAmount(o) > 0);\n    const pendingOrders = filteredOrders.filter(o => getOrderPendingAmount(o) > 0);\n    const pendingPix = pendingOrders.filter(o => {\n      const method = String(o.payment?.method || o.paymentMethod || '').toLowerCase();\n      const methodId = String(o.payment?.methodId || o.paymentMethodId || '').toLowerCase();\n      return method.includes('pix') || methodId === 'pix';\n    });\n\n    const eligibleCheckoutOrders = filteredOrders.filter(o => {\n      const status = getOrderPaymentStatus(o);\n      return !['cancelled', 'rejected'].includes(status) || getOrderPaidAmount(o) > 0;\n    });\n\n    const checkoutSuccessRate = eligibleCheckoutOrders.length > 0\n      ? (paidOrders.length / eligibleCheckoutOrders.length) * 100\n      : 0;\n\n    return {\n      faturamento: dreStats.netReceived,\n      approvedCount: dreStats.paidOrdersCount,\n      pendingCount: pendingOrders.length,\n      pendingPixCount: pendingPix.length,\n      pendingPixValue: pendingPix.reduce((acc, o) => acc + getOrderPendingAmount(o), 0),\n      ticketMedio: dreStats.averageTicket,\n      cogs: dreStats.cogs,\n      gatewayFees: dreStats.gatewayFees,\n      shipping: dreStats.shippingSubsidy,\n      shippingActualCost: dreStats.shippingActualCost,\n      lucroLiquido: dreStats.operatingProfit,\n      conversionRate: checkoutSuccessRate,\n      rawOrders: paidOrders\n    };\n  }, [filteredOrders, dreStats]);\n\n'''
text = text[:start] + new_order_stats + text[end:]

text = text.replace('            total: o.total,', '            total: getOrderTotal(o),')
text = text.replace('`${o.id};${dateStr};${o.customerName};${o.paymentMethod};${Number(o.total || 0).toFixed(2)};', '`${o.id};${dateStr};${o.customerName};${o.paymentMethod};${getOrderTotal(o).toFixed(2)};')
text = text.replace("<span>R$ {Number(order.total || 0).toFixed(2)}</span>", "<span>R$ {getOrderTotal(order).toFixed(2)}</span>")

path.write_text(text, encoding='utf-8')
print('AdminFinancial.tsx canonicalized successfully')
