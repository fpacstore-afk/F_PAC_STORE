from pathlib import Path

path = Path('src/pages/AdminOrders.tsx')
source = path.read_text(encoding='utf-8')
old = "triggerStatusEmail(order, order.shipping?.status || order.shippingStatus || order.production?.status || order.productionStatus || order.paymentStatus || order.status)"
new = "triggerStatusEmail(order, (order as any).shipping?.status || order.shippingStatus || (order as any).production?.status || order.productionStatus || order.paymentStatus || order.status)"
if old not in source:
    if new in source:
        print('Already patched')
    else:
        raise SystemExit('Expected status email expression not found')
else:
    path.write_text(source.replace(old, new, 1), encoding='utf-8')
    print('Patched AdminOrders TypeScript status access')
