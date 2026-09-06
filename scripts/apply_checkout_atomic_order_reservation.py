from pathlib import Path

root = Path(__file__).resolve().parents[1]
store_path = root / 'server/services/store.service.ts'
checkout_path = root / 'server/controllers/checkout.controller.ts'
test_path = root / 'scripts/test_checkout_payments.ts'

store = store_path.read_text()
checkout = checkout_path.read_text()
test = test_path.read_text()

old_sig = "export async function reserveStock(orderId: string, items: any[], idempotencyKey?: string) {\n  const db = getDb();\n  const effectiveIdempotencyKey = idempotencyKey || `reserve_order_${orderId}`;\n  const normalizedItems = aggregateInventoryItems(items);\n\n  return db.runTransaction(async (transaction) => {\n    const duplicate = await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey);\n    if (duplicate) return { success: true, idempotent: true };\n\n    const itemReads: any[] = [];"
new_sig = "export async function reserveStock(orderId: string, items: any[], idempotencyKey?: string, orderData?: any) {\n  const db = getDb();\n  const effectiveIdempotencyKey = idempotencyKey || `reserve_order_${orderId}`;\n  const normalizedItems = aggregateInventoryItems(items);\n\n  return db.runTransaction(async (transaction) => {\n    const duplicate = await isIdempotentDuplicate(transaction, db, effectiveIdempotencyKey);\n    if (duplicate) return { success: true, idempotent: true };\n\n    const orderRef = db.collection('orders').doc(orderId);\n    if (orderData) {\n      const existingOrder = await transaction.get(orderRef);\n      if (existingOrder.exists) {\n        throw new Error(`Order ${orderId} already exists before checkout reservation`);\n      }\n    }\n\n    const itemReads: any[] = [];"
if old_sig not in store:
    raise SystemExit('reserveStock signature anchor not found')
store = store.replace(old_sig, new_sig, 1)

old_write_anchor = "    recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, undefined, { orderId, type: 'reserve' });\n\n    for (const { item, physicalSlug, variantKey, requestedQty, invRef, invDoc, stats } of itemReads) {"
new_write_anchor = "    if (orderData) {\n      transaction.set(orderRef, {\n        ...orderData,\n        createdAt: admin.firestore.FieldValue.serverTimestamp(),\n        updatedAt: admin.firestore.FieldValue.serverTimestamp()\n      });\n    }\n\n    recordIdempotencyKey(transaction, db, effectiveIdempotencyKey, undefined, undefined, { orderId, type: 'reserve' });\n\n    for (const { item, physicalSlug, variantKey, requestedQty, invRef, invDoc, stats } of itemReads) {"
if old_write_anchor not in store:
    raise SystemExit('reserveStock write anchor not found')
store = store.replace(old_write_anchor, new_write_anchor, 1)

old_checkout = "    // Save order record and reserve stock atomically\n    await storeService.createOrder(orderId, canonicalOrder);\n    await storeService.reserveStock(orderId, verifiedItems, `checkout_${orderId}_reserve`);"
new_checkout = "    // Save the order record and reserve stock in the SAME Firestore transaction.\n    // If inventory validation fails, neither the order nor any reservation is persisted.\n    await storeService.reserveStock(\n      orderId,\n      verifiedItems,\n      `checkout_${orderId}_reserve`,\n      canonicalOrder\n    );"
if old_checkout not in checkout:
    raise SystemExit('checkout order/reservation anchor not found')
checkout = checkout.replace(old_checkout, new_checkout, 1)

insert = "\n// Order creation and stock reservation must be one Firestore transaction.\nassert(checkout.includes('canonicalOrder\\n    );') && !checkout.includes('createOrder(orderId, canonicalOrder)'), 'checkout must not persist an order before its stock reservation');\nassert(store.includes('orderData?: any') && store.includes('transaction.set(orderRef'), 'reserveStock must support atomic order creation inside its transaction');\n"
if "const storePath = path.join(root, 'server/services/store.service.ts');" not in test:
    test = test.replace("const paymentPath = path.join(root, 'server/services/payment.service.ts');", "const paymentPath = path.join(root, 'server/services/payment.service.ts');\nconst storePath = path.join(root, 'server/services/store.service.ts');")
    test = test.replace("const payment = fs.readFileSync(paymentPath, 'utf8');", "const payment = fs.readFileSync(paymentPath, 'utf8');\nconst store = fs.readFileSync(storePath, 'utf8');")
if 'checkout must not persist an order before its stock reservation' not in test:
    test = test.replace("assert(payment.includes('Payment identity mismatch for order'), 'approved orders must reject a different provider payment id');", "assert(payment.includes('Payment identity mismatch for order'), 'approved orders must reject a different provider payment id');" + insert)

store_path.write_text(store)
checkout_path.write_text(checkout)
test_path.write_text(test)
print('checkout atomic order/reservation patch applied')
