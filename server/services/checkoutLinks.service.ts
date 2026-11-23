import crypto from 'crypto';
import { getDb } from '../firebase.js';
import { calculateOrderPricing } from './pricing.service.js';

const digest = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const validId = (id: unknown) => typeof id === 'string' && /^link_[a-f0-9]{32}$/.test(id);
const validToken = (token: unknown) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
type Selection = { slug: string; color: string; size: string; quantity: number; garmentModelId?: string };
const selection = (item: any): Selection => ({
  slug: String(item?.slug || item?.productId || item?.id || '').trim(),
  color: String(item?.color || '').trim(), size: String(item?.size || '').trim(), quantity: Number(item?.quantity),
  ...(item?.garmentModelId ? { garmentModelId: String(item.garmentModelId).trim() } : {}),
});
const sameSelection = (a: any[], b: any[]) => a.length === b.length && a.every((entry, i) => {
  const left = selection(entry), right = selection(b[i]);
  return left.slug === right.slug && left.color === right.color && left.size === right.size && left.quantity === right.quantity && left.garmentModelId === right.garmentModelId;
});

export async function createCheckoutLink(input: any, actor: string) {
  if (!Array.isArray(input?.items) || input.items.length < 1 || input.items.length > 12) throw new Error('Escolha até 12 itens do catálogo.');
  const items = input.items.map(selection);
  if (items.some((item: Selection) => !item.slug || item.slug.length > 160 || !item.color || !item.size || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 30)) throw new Error('Produto, cor, tamanho ou quantidade inválidos.');
  if (input.items.some((item: any) => item.printConfigs || item.customization || item.baseProductSlug)) throw new Error('Produtos personalizados não participam deste link.');
  const { verifiedItems } = await calculateOrderPricing({ items, customerInfo: {} }, { priceOnly: true });
  if (verifiedItems.some(item => item.customization)) throw new Error('Produtos personalizados não participam do cashback.');
  const id = `link_${crypto.randomBytes(16).toString('hex')}`, token = crypto.randomBytes(32).toString('hex');
  const contact = { name: String(input?.customer?.name || '').trim().slice(0, 120), email: String(input?.customer?.email || '').trim().slice(0, 160), phone: String(input?.customer?.phone || '').replace(/[^0-9+()\s-]/g, '').slice(0, 30) };
  const doc = { items, contact, tokenHash: digest(token), createdBy: actor, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), status: 'active' };
  await getDb().collection('checkout_links').doc(id).create(doc);
  return { id, token, items: verifiedItems.map(publicItem), customer: contact, expiresAt: doc.expiresAt };
}

const publicItem = (item: any) => ({ id: item.id, slug: item.slug, productId: item.productId, name: item.name, color: item.color, size: item.size,
  quantity: item.quantity, price: item.price, image: item.image || '', category: item.category || '', garmentModelId: item.garmentModelId || undefined });

export async function openCheckoutLink(id: unknown, token: unknown) {
  if (!validId(id) || !validToken(token)) throw new Error('Link inválido.');
  const snapshot = await getDb().collection('checkout_links').doc(id).get(), data = snapshot.data();
  if (!data || data.tokenHash !== digest(token as string) || data.status !== 'active' || data.expiresAt <= new Date().toISOString()) throw new Error('Este link expirou ou foi utilizado. Solicite outro à loja.');
  const { verifiedItems } = await calculateOrderPricing({ items: data.items, customerInfo: {} }, { priceOnly: true });
  return { id, items: verifiedItems.map(publicItem), customer: data.contact, expiresAt: data.expiresAt };
}

export async function verifyCheckoutLink(id: unknown, token: unknown, submitted: any[], verified: any[]) {
  if (!validId(id) || !validToken(token)) return false;
  const data = (await getDb().collection('checkout_links').doc(id).get()).data();
  return Boolean(data && data.tokenHash === digest(token as string) && data.status === 'active' && data.expiresAt > new Date().toISOString()
    && sameSelection(data.items, submitted) && verified.every(item => !item.customization));
}

export async function claimCheckoutLink(id: string, orderId: string) {
  const ref = getDb().collection('checkout_links').doc(id);
  await getDb().runTransaction(async tx => {
    const snap = await tx.get(ref), link = snap.data();
    if (!link || link.status !== 'active' || link.expiresAt <= new Date().toISOString() || (link.claimedBy && link.claimedBy !== orderId)) throw new Error('Este link já está em uso. Peça um novo link à loja.');
    tx.update(ref, { claimedBy: orderId, claimedAt: new Date().toISOString() });
  });
}

export async function releaseCheckoutLink(id: string, orderId: string) {
  const ref = getDb().collection('checkout_links').doc(id);
  await getDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.data()?.claimedBy === orderId && snap.data()?.status === 'active') tx.update(ref, { claimedBy: null, claimedAt: null });
  });
}

export async function finishCheckoutLink(id: string, orderId: string, status: string) {
  const ref = getDb().collection('checkout_links').doc(id);
  await getDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.data()?.claimedBy !== orderId) return;
    if (status === 'approved') tx.update(ref, { status: 'used', usedBy: orderId, usedAt: new Date().toISOString() });
    else if (['rejected', 'cancelled', 'refunded'].includes(status) && snap.data()?.status === 'active') tx.update(ref, { claimedBy: null, claimedAt: null });
  });
}
