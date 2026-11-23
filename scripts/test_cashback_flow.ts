import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.ts';
import { cashbackRate, purchaseCashbackCents, redeemableCashbackCents } from '../shared/cashbackPolicy.ts';
import { earnPurchaseCashback, releasePurchaseCashback, reversePurchaseCashback, getCashbackWallet, holdCashback, settleCashbackHold, restoreRedeemedCashback } from '../server/services/cashback.service.ts';
import { verifyCheckoutLink, claimCheckoutLink, finishCheckoutLink } from '../server/services/checkoutLinks.service.ts';

const db = requireIsolatedTestDb();
assert.equal(cashbackRate(5999), 0);
assert.equal(cashbackRate(6000), 2);
assert.equal(cashbackRate(15000), 3);
assert.equal(cashbackRate(25000), 4);
assert.equal(purchaseCashbackCents({ source: 'checkout_link', paymentMethod: 'credit_card', hasAccount: true, catalogueOnly: true, productSubtotalCents: 25000, paidProductCents: 25000 }), 0);
assert.equal(purchaseCashbackCents({ source: 'checkout_link', paymentMethod: 'pix', hasAccount: true, catalogueOnly: false, productSubtotalCents: 25000, paidProductCents: 25000 }), 0);
assert.equal(purchaseCashbackCents({ source: 'checkout_link', paymentMethod: 'pix', hasAccount: true, catalogueOnly: true, productSubtotalCents: 25000, paidProductCents: 25000 }), 1000);
assert.equal(redeemableCashbackCents(500, 6000), 500);
assert.equal(redeemableCashbackCents(5000, 10000), 1000);

const uid = 'cashback_test_customer', orderId = 'FPAC-cashback-test';
const order = { id: orderId, userId: uid, paymentStatus: 'approved', shippingStatus: 'pending',
  payment: { provider: 'mercadopago', methodId: 'pix', providerPaymentId: 'mp_pix_1' }, status_pagamento: 'approved',
  cashbackProgram: { source: 'checkout_link', paymentMethod: 'pix', catalogueOnly: true, earnedCents: 600 } };
await earnPurchaseCashback(order);
await earnPurchaseCashback(order);
assert.equal((await getCashbackWallet(uid)).pendingCents, 600, 'a confirmação duplicada não duplica o saldo');
await releasePurchaseCashback({ ...order, shippingStatus: 'delivered' });
await releasePurchaseCashback({ ...order, shippingStatus: 'delivered' });
assert.equal((await getCashbackWallet(uid)).availableCents, 600, 'a entrega duplicada não duplica o crédito');
await holdCashback(uid, 'FPAC-second-order', 400, 6000);
assert.equal((await getCashbackWallet(uid)).heldCents, 400);
await settleCashbackHold('FPAC-second-order', true);
assert.equal((await getCashbackWallet(uid)).availableCents, 200);
await reversePurchaseCashback(order);
await reversePurchaseCashback(order);
assert.equal((await getCashbackWallet(uid)).debtCents, 400, 'o estorno recupera o que já foi usado');
await restoreRedeemedCashback('FPAC-second-order');
await restoreRedeemedCashback('FPAC-second-order');
assert.equal((await getCashbackWallet(uid)).debtCents, 0, 'cancelamento da compra que usou crédito remove a dívida uma única vez');

const id = `link_${'a'.repeat(32)}`, token = 'b'.repeat(64);
const items = [{ slug: 'shirt', color: 'Preta', size: 'M', quantity: 1 }];
await db.collection('checkout_links').doc(id).create({ items, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), status: 'active', expiresAt: new Date(Date.now() + 60000).toISOString() });
assert.equal(await verifyCheckoutLink(id, token, items, [{ customization: undefined }]), true);
assert.equal(await verifyCheckoutLink(id, 'c'.repeat(64), items, [{}]), false);
assert.equal(await verifyCheckoutLink(id, token, [{ ...items[0], quantity: 2 }], [{}]), false);
assert.equal(await verifyCheckoutLink(id, token, items, [{ customization: { type: 'prime-custom' } }]), false);
await claimCheckoutLink(id, 'FPAC-first');
await assert.rejects(claimCheckoutLink(id, 'FPAC-second'), /já está em uso/);
await finishCheckoutLink(id, 'FPAC-first', 'approved');
assert.equal(await verifyCheckoutLink(id, token, items, [{}]), false, 'um link pago não pode ser reutilizado');
console.log('PASS cashback Pix, entrega, estorno, saldo usado, repetição e link único');
