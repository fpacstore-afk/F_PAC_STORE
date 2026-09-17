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
    userId: 'alice-user',
    customer: { name: 'Alice Ferreira Santos', email: 'alice@example.com' },
    pricing: { total: 200 },
    payment: { status: 'partially_refunded', paidAmount: 200, refundedAmount: 100 },
    createdAt: '2026-02-10T12:00:00.000Z',
  },
  {
    id: 'paid-alice-new-email',
    userId: 'alice-user',
    name: 'Alice Ferreira Santos',
    email: 'alice.novo@example.com',
    customerCpf: '123.456.789-01',
    total: 900,
    paymentStatus: 'approved',
    createdAt: '2026-03-10T12:00:00.000Z',
  },
  {
    id: 'paid-alice-cpf-bridge',
    customerName: 'Alice Ferreira Santos',
    customerCpf: '12345678901',
    customerPhone: '+55 (47) 99999-1111',
    total: 100,
    paymentStatus: 'approved',
    createdAt: '2026-04-10T12:00:00.000Z',
  },
  {
    id: 'paid-alice-phone-bridge',
    customerName: 'Alice Ferreira Santos',
    customerPhone: '(47) 99999-1111',
    total: 50,
    paymentStatus: 'approved',
    createdAt: '2026-05-10T12:00:00.000Z',
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
  {
    id: 'same-name-different-customer',
    customerName: 'Bruno Costa',
    customerEmail: 'outro-bruno@example.com',
    total: 200,
    paymentStatus: 'approved',
    createdAt: '2026-01-11T12:00:00.000Z',
  },
];

const ranking = buildPublicClubRanking(orders, 10);

assert.equal(ranking.length, 3, 'pedidos devem ser unidos por identificadores fortes, nunca apenas pelo nome');
assert.equal(ranking[0].publicName, 'Alice S.', 'nome público deve ser protegido');
assert.equal(ranking[0].tier.id, 'diamante', 'nível deve usar o total líquido pago de todos os pedidos do mesmo cliente');
assert.equal(ranking[1].publicName, 'Bruno C.', 'segundo comprador real deve ocupar a posição seguinte');
assert.equal(ranking[1].tier.id, 'prata', 'limite exato de R$ 300 deve resultar no nível Prata');
assert.equal(ranking[2].publicName, 'Bruno C.', 'nomes iguais com identidades distintas não podem ser unidos');

const serialized = JSON.stringify(ranking);
for (const forbidden of ['alice@example.com', '99999-0000', 'netPaid', 'totalSpent', 'orderCount']) {
  assert.equal(serialized.includes(forbidden), false, `resposta pública não pode expor ${forbidden}`);
}

console.log('✅ Clube F PAC: ranking público agregado, anonimizado e baseado em pagamentos reais.');
