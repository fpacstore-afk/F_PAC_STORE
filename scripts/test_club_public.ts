import assert from 'node:assert/strict';
import { buildPublicClubRanking } from '../server/services/club.service.js';

const orders = [
  {
    id: 'paid-alice-1',
    customerName: 'Alice Ferreira Santos',
    customerEmail: 'alice@example.com',
    total: 900,
    paymentStatus: 'approved',
    createdAt: '2026-01-10T12:00:00.000Z',
  },
  {
    id: 'partially-refunded-alice',
    customer: { name: 'Alice Ferreira Santos', email: 'alice@example.com' },
    pricing: { total: 200 },
    payment: { status: 'partially_refunded', paidAmount: 200, refundedAmount: 100 },
    createdAt: '2026-02-10T12:00:00.000Z',
  },
  {
    id: 'paid-bruno',
    customerName: 'Bruno Costa',
    customerPhone: '(47) 99999-0000',
    total: 300,
    paymentStatus: 'approved',
    createdAt: '2026-01-09T12:00:00.000Z',
  },
  {
    id: 'cancelled-order',
    customerName: 'Cliente Cancelado',
    customerEmail: 'cancelado@example.com',
    total: 9999,
    paymentStatus: 'approved',
    status: 'cancelled',
  },
  {
    id: 'pending-order',
    customerName: 'Cliente Pendente',
    customerEmail: 'pendente@example.com',
    total: 5000,
    paymentStatus: 'pending',
  },
  {
    id: 'missing-identity',
    customerName: 'Sem Identificador',
    total: 4000,
    paymentStatus: 'approved',
  },
];

const ranking = buildPublicClubRanking(orders, 10);

assert.equal(ranking.length, 2, 'somente clientes identificáveis com pagamento líquido entram no ranking');
assert.equal(ranking[0].publicName, 'Alice S.', 'nome público deve ser protegido');
assert.equal(ranking[0].tier.id, 'ouro', 'nível deve usar o total líquido pago acumulado');
assert.equal(ranking[1].publicName, 'Bruno C.', 'segundo comprador real deve ocupar a posição seguinte');
assert.equal(ranking[1].tier.id, 'prata', 'limite exato de R$ 300 deve resultar no nível Prata');

const serialized = JSON.stringify(ranking);
for (const forbidden of ['alice@example.com', '99999-0000', 'netPaid', 'totalSpent', 'orderCount']) {
  assert.equal(serialized.includes(forbidden), false, `resposta pública não pode expor ${forbidden}`);
}

console.log('✅ Clube F PAC: ranking público agregado, anonimizado e baseado em pagamentos reais.');

