import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getDb } from '../firebase.js';
import { artworkService, parsePrivateArtwork } from './artwork.service.js';

const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const clean = (value: any) => JSON.parse(JSON.stringify(value));
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const closed = (order: any) => [order.status, order.productionStatus, order.shippingStatus].some(value => ['cancelled', 'canceled', 'cancelado', 'shipped', 'delivered', 'entregue'].includes(String(value || '').toLowerCase()));
// Receipts, costs and unrelated operational changes do not change the artwork.
export const mockupRecipeFingerprint = (order: any) => hash(JSON.stringify((order.items || []).map((item: any) => ({ name: item.name, color: item.color, size: item.size, quantity: item.quantity, customDetails: item.customDetails || null, customization: item.customization || null, printConfigs: item.printConfigs || null }))));

export function createMockupApprovalService(deps = { getDb, verifyArtwork: artworkService.verifyUrl, readArtwork: artworkService.read, now: () => new Date() }) {
  const db = () => deps.getDb();
  const checkToken = (record: any, token: string) => {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(record?.tokenHash || '') || !timingSafeEqual(Buffer.from(hash(token)), Buffer.from(record.tokenHash))) fail('Link não encontrado ou indisponível.', 404);
  };
  const assertCurrent = (record: any, order: any, requestId: string) => {
    if (!order || closed(order) || record.status === 'revoked' || order.mockupApproval?.requestId !== requestId || order.mockupApproval?.revision !== record.revision || mockupRecipeFingerprint(order) !== record.recipeFingerprint) fail('Esta versão foi substituída ou o pedido mudou. Solicite um novo link à F PAC.', 409);
    if (new Date(record.expiresAt).getTime() <= deps.now().getTime()) fail('Este link expirou. Solicite um novo link à F PAC.', 410);
  };
  const read = async (requestId: string, token: string) => {
    if (!validId(requestId)) fail('Link não encontrado ou indisponível.', 404);
    const snapshot = await db().collection('mockup_approval_requests').doc(requestId).get();
    const record = snapshot.data();
    checkToken(record, token);
    const order = (await db().collection('orders').doc(record.orderId).get()).data();
    assertCurrent(record, order, requestId);
    return record;
  };
  return {
    async issue(orderId: string, input: any, actor: string) {
      if (!validId(orderId) || !Number.isInteger(input?.expectedRevision) || !Array.isArray(input.images) || input.images.length < 1 || input.images.length > 4 || input.images.some((url: any) => typeof url !== 'string' || url.length > 2048 || !parsePrivateArtwork(url)) || typeof input.notes !== 'string' || input.notes.length > 2000) fail('Anexe de uma a quatro imagens do mockup e confira a versão do pedido.');
      if (!(await Promise.all(input.images.map((url: string) => deps.verifyArtwork(url)))).every(Boolean)) fail('Uma das imagens não está disponível. Envie o arquivo novamente.');
      const requestId = randomUUID(), token = randomBytes(32).toString('hex');
      const now = deps.now(), createdAt = now.toISOString(), expiresAt = new Date(now.getTime() + 7 * 86400000).toISOString();
      const result = await db().runTransaction(async (tx: any) => {
        const orderRef = db().collection('orders').doc(orderId), snapshot = await tx.get(orderRef);
        if (!snapshot.exists) fail('Pedido não encontrado.', 404);
        const order = snapshot.data();
        if (closed(order)) fail('Este pedido já foi encerrado ou enviado.');
        if (!order.items?.length) fail('O pedido precisa ter itens antes de preparar o mockup.');
        if (Number(order.mockupApproval?.revision || 0) !== input.expectedRevision) fail('Há uma versão mais recente. Atualize antes de gerar outro link.', 409);
        if (input.expectedRecipeFingerprint !== mockupRecipeFingerprint(order)) fail('As peças ou artes mudaram. Atualize e confira o mockup antes de gerar o link.', 409);
        const revision = input.expectedRevision + 1;
        const recipe = order.items.map((item: any) => clean({ name: String(item.name || 'Peça personalizada'), color: String(item.color || ''), size: String(item.size || ''), quantity: item.quantity }));
        const record = clean({ orderId, revision, status: 'pending', images: input.images, notes: input.notes.trim(), recipe, recipeFingerprint: mockupRecipeFingerprint(order), tokenHash: hash(token), createdAt, expiresAt, createdBy: actor });
        tx.set(db().collection('mockup_approval_requests').doc(requestId), record);
        tx.update(orderRef, { mockupApproval: { requestId, revision, status: 'pending', createdAt, expiresAt } });
        tx.set(db().collection('mockup_approval_events').doc(`${requestId}-issued`), { orderId, requestId, revision, type: 'issued', createdAt, actor });
        return { requestId, revision, expiresAt };
      });
      // The bearer token is returned once and never stored in plaintext.
      return { ...result, url: `https://fpacstore.com.br/aprovar-mockup/${requestId}#token=${token}` };
    },
    async adminStatus(orderId: string) {
      if (!validId(orderId)) fail('Pedido inválido.');
      const order = (await db().collection('orders').doc(orderId).get()).data();
      if (!order) fail('Pedido não encontrado.', 404);
      const rows = await db().collection('mockup_approval_requests').where('orderId', '==', orderId).get();
      return { current: order.mockupApproval || null, recipeFingerprint: mockupRecipeFingerprint(order), history: rows.docs.map((doc: any) => {
        const r = doc.data();
        const current = order.mockupApproval?.requestId === doc.id && r.recipeFingerprint === mockupRecipeFingerprint(order) && !closed(order);
        const expired = r.status !== 'approved' && new Date(r.expiresAt).getTime() <= deps.now().getTime();
        return { requestId: doc.id, revision: r.revision, status: r.status === 'revoked' ? 'revoked' : !current ? 'superseded' : expired ? 'expired' : r.status, createdAt: r.createdAt, approvedAt: r.approvedAt || null, expiresAt: r.expiresAt, images: r.images, imageCount: r.images.length, notes: r.notes, recipe: r.recipe };
      }).sort((a: any, b: any) => b.revision - a.revision) };
    },
    async publicStatus(requestId: string, token: string) {
      const r = await read(requestId, token);
      return { revision: r.revision, status: r.status, notes: r.notes, recipe: r.recipe, imageCount: r.images.length, expiresAt: r.expiresAt, approvedAt: r.approvedAt || null };
    },
    async image(requestId: string, token: string, index: number) {
      const r = await read(requestId, token);
      if (!Number.isInteger(index) || index < 0 || index >= r.images.length) fail('Imagem não encontrada.', 404);
      const parsed = parsePrivateArtwork(r.images[index]);
      if (!parsed) fail('Imagem não encontrada.', 404);
      return deps.readArtwork(parsed.id, parsed.token);
    },
    async approve(requestId: string, token: string, input: any) {
      if (!validId(requestId) || input?.consent !== true || !Number.isInteger(input?.revision)) fail('Confira o mockup e confirme sua aprovação.');
      return db().runTransaction(async (tx: any) => {
        const ref = db().collection('mockup_approval_requests').doc(requestId), snapshot = await tx.get(ref), record = snapshot.data();
        checkToken(record, token);
        const orderRef = db().collection('orders').doc(record.orderId), order = (await tx.get(orderRef)).data();
        assertCurrent(record, order, requestId);
        if (input.revision !== record.revision) fail('A versão mudou. Reabra o link para conferir o mockup atual.', 409);
        if (record.status === 'approved') return { revision: record.revision, approvedAt: record.approvedAt, alreadyApproved: true };
        const approvedAt = deps.now().toISOString();
        tx.update(ref, { status: 'approved', approvedAt });
        tx.update(orderRef, { mockupApproval: { ...order.mockupApproval, status: 'approved', approvedAt } });
        tx.set(db().collection('mockup_approval_events').doc(`${requestId}-approved`), { orderId: record.orderId, requestId, revision: record.revision, type: 'approved', createdAt: approvedAt, source: 'customer_link', recipeFingerprint: record.recipeFingerprint, consentText: 'Conferi as imagens, os detalhes e a versão deste mockup e aprovo a produção conforme esta versão.' });
        return { revision: record.revision, approvedAt, alreadyApproved: false };
      });
    },
    async revoke(orderId: string, requestId: string, actor: string) {
      if (!validId(orderId) || !validId(requestId)) fail('Link inválido.');
      return db().runTransaction(async (tx: any) => {
        const ref = db().collection('mockup_approval_requests').doc(requestId), orderRef = db().collection('orders').doc(orderId);
        const [snapshot, orderSnapshot] = await Promise.all([tx.get(ref), tx.get(orderRef)]);
        if (!snapshot.exists || snapshot.data()?.orderId !== orderId || !orderSnapshot.exists) fail('Link não encontrado.', 404);
        const order = orderSnapshot.data(), now = deps.now().toISOString();
        if (snapshot.data().status === 'revoked') return { revoked: true };
        tx.update(ref, { status: 'revoked', revokedAt: now, revokedBy: actor });
        if (order.mockupApproval?.requestId === requestId) tx.update(orderRef, { mockupApproval: { ...order.mockupApproval, status: 'revoked' } });
        tx.set(db().collection('mockup_approval_events').doc(`${requestId}-revoked`), { orderId, requestId, revision: snapshot.data().revision, type: 'revoked', createdAt: now, actor });
        return { revoked: true };
      });
    },
  };
}
