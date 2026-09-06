from pathlib import Path

root = Path(__file__).resolve().parents[1]
checkout_path = root / 'server/controllers/checkout.controller.ts'
test_path = root / 'scripts/test_checkout_payments.ts'

checkout = checkout_path.read_text()
test = test_path.read_text()

old = '''    } catch (paymentErr: any) {
      logger.error(`⚠️ [MP-PAY-ERR] Cobrança falhou. Liberando reserva de estoque para o pedido ${orderId}`, paymentErr);
      try {
        await storeService.releaseStockReservation(orderId, verifiedItems, `checkout_${orderId}_release_fail`);
      } catch (revertErr) {
        logger.error(`❌ [REVERT-FATAL] Falha crítica ao liberar reserva de estoque após erro de cobrança`, revertErr);
      }
      try {
        const adminInstance = (await import("firebase-admin")).default;
        await storeService.updateOrderStatus(orderId, 'Pagamento Não Realizado', { 
          paymentStatus: 'rejected',
          'payment.status': 'rejected',
          stockReverted: true,
          stockRevertedAcknowledged: true,
          history: adminInstance.firestore.FieldValue.arrayUnion({
            status: 'Pagamento Não Realizado',
            mpStatus: 'rejected',
            timestamp: new Date().toISOString(),
            message: `Falha na cobrança: ${paymentErr.message}`
          })
        });
      } catch (orderUpdateErr) {
        logger.error(`❌ [ORDER-CANCEL-ERR] Falha ao marcar pedido como rejeitado`, orderUpdateErr);
      }
      throw paymentErr;
    }'''

new = '''    } catch (paymentErr: any) {
      logger.error(`⚠️ [MP-PAY-ERR] Cobrança falhou. Liberando reserva de estoque para o pedido ${orderId}`, paymentErr);

      // Never acknowledge a stock reversion before it has actually succeeded.
      // Persist the rejected payment first with an unacknowledged reversion so
      // operational recovery can safely detect/retry a transient inventory failure.
      const adminInstance = (await import("firebase-admin")).default;
      try {
        await storeService.updateOrderStatus(orderId, 'Pagamento Não Realizado', {
          paymentStatus: 'rejected',
          'payment.status': 'rejected',
          stockReverted: true,
          stockRevertedAcknowledged: false,
          history: adminInstance.firestore.FieldValue.arrayUnion({
            status: 'Pagamento Não Realizado',
            mpStatus: 'rejected',
            timestamp: new Date().toISOString(),
            message: `Falha na cobrança: ${paymentErr.message}`
          })
        });
      } catch (orderUpdateErr) {
        logger.error(`❌ [ORDER-CANCEL-ERR] Falha ao marcar pedido como rejeitado`, orderUpdateErr);
      }

      try {
        await storeService.releaseStockReservation(orderId, verifiedItems, `checkout_${orderId}_release_fail`);
        await storeService.updateOrderStatus(orderId, 'Pagamento Não Realizado', {
          stockReverted: true,
          stockRevertedAcknowledged: true
        });
      } catch (revertErr) {
        logger.error(`❌ [REVERT-FATAL] Falha crítica ao liberar reserva de estoque após erro de cobrança`, revertErr);
        // Keep stockRevertedAcknowledged=false. Do not mask the inventory failure.
      }
      throw paymentErr;
    }'''

if old not in checkout:
    raise SystemExit('checkout payment failure anchor not found')
checkout = checkout.replace(old, new, 1)

checks = '''
// A failed Mercado Pago charge must never acknowledge stock release before release succeeds.
assert(checkout.includes('stockRevertedAcknowledged: false'), 'failed charge must persist a pending stock reversion before attempting release');
assert(checkout.indexOf('stockRevertedAcknowledged: false') < checkout.indexOf('releaseStockReservation(orderId, verifiedItems'), 'pending reversion marker must be written before release attempt');
assert(checkout.includes('stockRevertedAcknowledged: true') && checkout.indexOf('stockRevertedAcknowledged: true') > checkout.indexOf('releaseStockReservation(orderId, verifiedItems'), 'reversion acknowledgement must only be written after release succeeds');
'''

if 'failed charge must persist a pending stock reversion' not in test:
    test = test.replace("assert(store.includes('orderData?: any') && store.includes('transaction.set(orderRef'), 'reserveStock must support atomic order creation inside its transaction');", "assert(store.includes('orderData?: any') && store.includes('transaction.set(orderRef'), 'reserveStock must support atomic order creation inside its transaction');\n" + checks)

checkout_path.write_text(checkout)
test_path.write_text(test)
print('checkout reversion acknowledgement patch applied')
