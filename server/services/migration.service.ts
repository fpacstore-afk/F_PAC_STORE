import { getDb } from "../firebase.js";
import { logger } from "../utils/logger.js";
import { OrderCanonical, OrderStatus, PaymentStatus, ProductionStatus, ShippingStatus } from "../types/order.types.js";

interface MigrationReport {
  timestamp: string;
  totalOrders: number;
  migratedOrders: number;
  alreadyCanonical: number;
  failedOrders: number;
  details: Array<{ orderId: string; status: 'migrated' | 'skipped' | 'failed'; message?: string }>;
}

/**
 * Migration Service: Safely and idempotently updates existing legacy Firestore orders
 * to include canonical sub-objects (customer, pricing, payment, production, shipping)
 * while preserving all original data and timestamps.
 */
export async function migrateOrdersToCanonical(dryRun = false): Promise<MigrationReport> {
  const db = getDb();
  logger.info(`🚀 [MIGRATION] Starting order migration to canonical schema (dryRun: ${dryRun})...`);

  const report: MigrationReport = {
    timestamp: new Date().toISOString(),
    totalOrders: 0,
    migratedOrders: 0,
    alreadyCanonical: 0,
    failedOrders: 0,
    details: []
  };

  try {
    const snapshot = await db.collection('orders').get();
    report.totalOrders = snapshot.size;

    for (const docSnap of snapshot.docs) {
      const orderId = docSnap.id;
      const data = docSnap.data();

      try {
        // Check if order already has all canonical sub-objects
        if (data.customer && data.pricing && data.payment && data.production && data.shipping) {
          report.alreadyCanonical++;
          report.details.push({ orderId, status: 'skipped', message: 'Already canonical' });
          continue;
        }

        // Map legacy values
        const totalAmount = Number(data.total || data.transaction_amount || 0);
        const subtotalAmount = Number(data.subtotal || totalAmount);
        const couponDisc = Number(data.couponDiscount || 0);
        const pixDisc = Number(data.pixDiscount || 0);
        const shippingVal = Number(data.shipping || data.shippingFee || 0);

        const customerObj = data.customer || {
          name: data.customerName || 'Cliente',
          email: data.customerEmail || 'nao-informado@fpac.com',
          phone: data.customerPhone || '',
          phone2: data.customerPhone2 || '',
          cpf: data.customerCpf || '',
          address: data.address || '',
          number: data.number || '',
          complement: data.complement || '',
          neighborhood: data.neighborhood || '',
          city: data.city || '',
          state: data.state || '',
          cep: data.cep || ''
        };

        const pricingObj = data.pricing || {
          subtotal: subtotalAmount,
          couponDiscount: couponDisc,
          promotionalDiscount: Number(data.promotionalDiscount || 0),
          pixDiscount: pixDisc,
          shipping: shippingVal,
          total: totalAmount,
          currency: 'BRL'
        };

        const mpStatus = String(data.paymentStatus || data.status_pagamento || 'pending');
        let canonicalPaymentStatus: PaymentStatus = 'pending';
        if (mpStatus === 'approved') canonicalPaymentStatus = 'approved';
        else if (['rejected', 'cancelled', 'expired'].includes(mpStatus)) canonicalPaymentStatus = 'rejected';

        const paymentObj = data.payment || {
          status: canonicalPaymentStatus,
          method: data.paymentMethod || 'PIX',
          methodId: data.paymentMethodId || 'pix',
          provider: 'mercadopago',
          providerPaymentId: String(data.mercadoPagoId || data.payment_id || ''),
          paidAmount: canonicalPaymentStatus === 'approved' ? totalAmount : 0,
          pendingAmount: canonicalPaymentStatus === 'approved' ? 0 : totalAmount,
          paidAt: data.paidAt || data.data_pagamento || null
        };

        const prodStatusStr = String(data.productionStatus || 'waiting');
        const productionObj = data.production || {
          status: (['waiting', 'separation', 'cutting', 'printing', 'sewing', 'packaging', 'ready', 'completed'].includes(prodStatusStr) ? prodStatusStr : 'waiting') as ProductionStatus,
          currentStage: data.currentStage || 'Processando'
        };

        const shipStatusStr = String(data.shippingStatus || 'pending');
        const shippingObj = data.shipping || {
          status: (['pending', 'label_created', 'shipped', 'in_transit', 'delivered', 'returned'].includes(shipStatusStr) ? shipStatusStr : 'pending') as ShippingStatus,
          method: data.shippingMethod || 'Melhor Envio',
          methodName: data.shippingMethodName || 'Entrega Padrão',
          trackingCode: data.trackingCode || data.tracking_code || undefined
        };

        const updatePayload = {
          customer: customerObj,
          pricing: pricingObj,
          payment: paymentObj,
          production: productionObj,
          shipping: shippingObj,

          // Preserve backward compatibility top-level fields
          customerName: customerObj.name,
          customerEmail: customerObj.email,
          customerPhone: customerObj.phone,
          customerCpf: customerObj.cpf,
          total: totalAmount,
          subtotal: subtotalAmount,
          couponDiscount: couponDisc,
          shippingFee: shippingVal,
          paymentStatus: data.paymentStatus || 'pending',
          productionStatus: productionObj.status,
          shippingStatus: shippingObj.status,
          status: data.status || 'received',

          canonicalMigratedAt: new Date().toISOString()
        };

        if (!dryRun) {
          await db.collection('orders').doc(orderId).update(updatePayload);
        }

        report.migratedOrders++;
        report.details.push({ orderId, status: 'migrated', message: 'Canonical fields attached' });

      } catch (err: any) {
        report.failedOrders++;
        report.details.push({ orderId, status: 'failed', message: err.message });
      }
    }

    logger.info(`✅ [MIGRATION] Completed migration. Total: ${report.totalOrders}, Migrated: ${report.migratedOrders}, Already Canonical: ${report.alreadyCanonical}, Failed: ${report.failedOrders}`);
    return report;

  } catch (err: any) {
    logger.error(`❌ [MIGRATION-FATAL] Migration process failed: ${err.message}`);
    throw err;
  }
}
