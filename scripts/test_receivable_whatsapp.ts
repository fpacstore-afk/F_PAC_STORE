import assert from 'node:assert/strict';
import { getReceivableWhatsAppLink } from '../shared/receivableWhatsApp';

const order = {
  id: 'TEST-RECEIVABLE',
  customerName: 'Cliente de teste',
  customerPhone: '(47) 99999-0000',
  pricing: { total: 250.90 },
  total: 999,
  payment: { paidAmount: 150.80, pendingAmount: 999, status: 'partially_paid' },
  items: [
    { name: 'Camiseta Comfort', quantity: 2, color: 'Verde militar', size: 'G' },
    { title: 'Oversized & PRIME +', quantity: 1, color: 'Off white', size: 'M' },
  ],
};
const before = JSON.stringify(order);
const result = getReceivableWhatsAppLink(order);
assert.equal(result.unavailableReason, null);
const url = new URL(result.url!);
assert.equal(url.origin, 'https://wa.me');
assert.equal(url.pathname, '/5547999990000');
const message = url.searchParams.get('text')!;
assert.match(message, /Cliente de teste/);
assert.match(message, /fechamento do caixa/);
assert.match(message, /pedido #TEST-RECEIVABLE/);
assert.match(message, /2x Camiseta Comfort \(Verde militar · Tam\. G\)/);
assert.match(message, /1x Oversized & PRIME \+ \(Off white · Tam\. M\)/);
assert.match(message, /Total da compra: R\$\s250,90/);
assert.match(message, /Valor pendente: R\$\s100,10/);
assert.doesNotMatch(message, /999/);
assert.match(message, /envie o comprovante para darmos baixa no sistema/);
assert.match(message, /_Mensagem automática\. Caso já tenha realizado o pagamento, desconsidere esta mensagem\._$/);
assert.doesNotMatch(message, /atrasado|vencido|multa|juros/i);
assert.equal(JSON.stringify(order), before, 'preparing the draft must not change the order or its payments');

const legacy = getReceivableWhatsAppLink({
  orderId: 'LEGACY',
  name: 'Cliente antigo',
  phone: '+55 (47) 99999-0000',
  totalAmount: 89.90,
  amountPaid: 0,
  items: [{ productName: 'Camiseta tradicional', quantity: 1 }],
});
assert.match(new URL(legacy.url!).searchParams.get('text')!, /Valor pendente: R\$\s89,90/);

const nested = getReceivableWhatsAppLink({
  id: 'NESTED',
  customer: { name: 'Cliente do cadastro', phone: '47999990000' },
  total: 10,
  items: [],
});
assert.match(new URL(nested.url!).searchParams.get('text')!, /Olá, Cliente do cadastro!/);
assert.match(new URL(nested.url!).searchParams.get('text')!, /Itens: consulte os detalhes do pedido/);
const unknown = getReceivableWhatsAppLink({ total: 10, phone: '47999990000', items: [{}] });
const unknownMessage = new URL(unknown.url!).searchParams.get('text')!;
assert.match(unknownMessage, /Item do pedido \(descrição não informada\)/);
assert.doesNotMatch(unknownMessage, /undefined|NaN|1x/);

for (const paid of [
  { payment: { status: 'approved' } },
  { payment: { status: 'pending', paidAmount: 250.90, pendingAmount: 250.90 } },
  { status: 'cancelled', payment: { status: 'pending', paidAmount: 10 } },
  ...['cancelled', 'rejected', 'refunded', 'not_applicable'].map(status => ({ payment: { status } })),
  { isGift: true },
  { orderKind: 'gift' },
]) {
  assert.equal(getReceivableWhatsAppLink({ ...order, ...paid }).url, null, JSON.stringify(paid));
}
for (const phone of ['', '123', 'not-a-phone', undefined]) {
  const invalid = getReceivableWhatsAppLink({ ...order, customerPhone: phone });
  assert.equal(invalid.url, null);
  assert.match(invalid.unavailableReason!, /WhatsApp válido com DDD/);
}
for (const invalid of [
  { pricing: { total: 'invalid' } },
  { pricing: { total: Infinity } },
  { payment: { paidAmount: NaN } },
  { pricing: { total: 10 }, payment: { pendingAmount: 15, status: 'pending' } },
]) {
  assert.equal(getReceivableWhatsAppLink({ ...order, ...invalid }).url, null);
}
const cents = getReceivableWhatsAppLink({ ...order, payment: { paidAmount: 250.80 } });
assert.match(new URL(cents.url!).searchParams.get('text')!, /Valor pendente: R\$\s0,10/);
console.log('PASS receivable WhatsApp drafts: correct customer, items, canonical totals and partial payments, encoded text, receipt request, footer, paid/cancelled/gift safeguards, invalid contacts and unchanged records.');
