import crypto from 'node:crypto';
import sharp from 'sharp';
import { getDb, getStorageBucket } from '../firebase.js';
import { verifyTrackingToken, hashTrackingToken } from './tracking.service.js';

export const MAX_ART_BYTES = 10 * 1024 * 1024;
const origin = 'https://fpacstore.com.br';
const trustedHosts = new Set(['fpacstore.com.br', 'www.fpacstore.com.br', 'fpac-store62.web.app', 'f-pac-store-n-o-s-roupa-identidade-ooc3wzri3q-ue.a.run.app']);
const secretKey = (token: string) => crypto.createHash('sha256').update(`fpac-artwork:${token}`).digest();
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status });

export async function normalizeArtwork(input: Buffer) {
  if (!Buffer.isBuffer(input) || input.length === 0 || input.length > MAX_ART_BYTES) throw fail('A imagem deve ter até 10 MB.', 413);
  try {
    const image = sharp(input, { limitInputPixels: 24_000_000, failOn: 'warning', animated: false });
    const metadata = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw fail('Use uma imagem PNG, JPG ou WebP sem animação.', 415);
    // Decode the actual bitmap, strip metadata and normalize orientation. Keeping
    // a bitmap output prevents SVG/HTML/polyglot active content being served.
    const { data, info } = await image.rotate().png().toBuffer({ resolveWithObject: true });
    if (data.length > 20 * 1024 * 1024) throw fail('Esta imagem é muito grande. Reduza a resolução e tente novamente.', 413);
    return { data, width: info.width, height: info.height };
  } catch (error: any) {
    if (error.status) throw error;
    throw fail('Não foi possível ler a imagem. Use PNG, JPG ou WebP com até 24 megapixels.', 415);
  }
}

export function parsePrivateArtwork(url: string) {
  try {
    const parsed = new URL(url, origin);
    const match = parsed.pathname.match(/^\/api\/artwork\/([a-f0-9-]{36})$/);
    const token = parsed.searchParams.get('token') || '';
    if (parsed.protocol !== 'https:' || !trustedHosts.has(parsed.hostname) || parsed.port || parsed.username || parsed.password || !match || !/^[a-f0-9]{64}$/.test(token)) return null;
    return { id: match[1], token };
  } catch { return null; }
}

export function createArtworkService(deps = { getDb, getStorageBucket }) {
  const validate = async (id: string, token: string) => {
    if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(token)) throw fail('Arte não encontrada.', 404);
    const snap = await deps.getDb().collection('customer_artworks').doc(id).get();
    const record = snap.data();
    if (!snap.exists || !record || !verifyTrackingToken(token, record.tokenHash)) throw fail('Arte não encontrada.', 404);
    return record;
  };
  const save = async (input: Buffer) => {
    const { data, width, height } = await normalizeArtwork(input);
    const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('hex');
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', secretKey(token), iv);
    const encrypted = Buffer.concat([iv, cipher.update(data), cipher.final(), cipher.getAuthTag()]);
    const objectName = `customer-artworks/${id}.bin`;
    await deps.getStorageBucket().file(objectName).save(encrypted, { resumable: false, validation: 'crc32c', metadata: { contentType: 'application/octet-stream', cacheControl: 'private,no-store' } });
    await deps.getDb().collection('customer_artworks').doc(id).set({ objectName, tokenHash: hashTrackingToken(token), width, height, bytes: data.length, createdAt: new Date().toISOString() });
    return { secure_url: `${origin}/api/artwork/${id}?token=${token}`, public_id: id, width, height, bytes: data.length, format: 'png' };
  };
  const read = async (id: string, token: string) => {
    const record = await validate(id, token);
    const [encrypted] = await deps.getStorageBucket().file(record.objectName).download();
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(token), encrypted.subarray(0, 12));
    decipher.setAuthTag(encrypted.subarray(-16));
    return Buffer.concat([decipher.update(encrypted.subarray(12, -16)), decipher.final()]);
  };
  const verifyUrl = async (url: string) => {
    const parsed = parsePrivateArtwork(url);
    if (!parsed) return false;
    try { await validate(parsed.id, parsed.token); return true; } catch { return false; }
  };
  return { save, read, verifyUrl };
}
export const artworkService = createArtworkService();

// Durable quota is shared by all Cloud Run instances; no raw IP is persisted.
export async function claimArtworkQuota(ip: string, database = getDb()) {
  const window = Math.floor(Date.now() / 3_600_000);
  const id = crypto.createHash('sha256').update(`${window}:${ip}`).digest('hex');
  await database.runTransaction(async (tx: any) => {
    const ref = database.collection('artwork_upload_limits').doc(id), snap = await tx.get(ref);
    const count = Number(snap.data()?.count || 0);
    if (count >= 12) throw fail('Limite temporário de envios atingido. Tente novamente mais tarde.', 429);
    tx.set(ref, { count: count + 1, expiresAt: new Date((window + 2) * 3_600_000).toISOString() });
  });
}
