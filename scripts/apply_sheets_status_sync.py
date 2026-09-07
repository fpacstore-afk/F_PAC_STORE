from pathlib import Path

path = Path('src/components/AdminFinancial.tsx')
text = path.read_text(encoding='utf-8')
old = "    const ordStr = (orders || []).map(o => `${o.id}_${o.status}`).join('|');"
new = "    const ordStr = (orders || []).map(o => `${o.id}_${o.status || ''}_${o.paymentStatus || o.payment?.status || ''}_${o.productionStatus || o.production?.status || ''}_${o.shippingStatus || o.shipping?.status || o.deliveryStatus || ''}`).join('|');"
if old not in text:
    raise SystemExit('Target line not found; refusing to modify file')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('AdminFinancial currentDataHash updated with canonical order status domains')
