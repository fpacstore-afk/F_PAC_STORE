import { placePrimeArtwork } from '../shared/primePlacement';
import { createCatalogArtworkBoundsService } from '../server/services/catalogArtworkBounds.service';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import sharp from 'sharp';
import { requireIsolatedTestDb } from './requireIsolatedTestDb.ts';
import { createArtworkService, normalizeArtwork, claimArtworkQuota, MAX_ART_BYTES, parsePrivateArtwork } from '../server/services/artwork.service.ts';
import { publicArtworkAddress, remoteArtworkUrl, fetchRemoteArtwork } from '../server/services/remoteArtwork.service.ts';
import { calculateOrderPricing } from '../server/services/pricing.service.ts';
import { MelhorEnvioService } from '../server/services/melhor-envio.service.ts';

const db = requireIsolatedTestDb();
const objects = new Map<string, { bytes: Buffer; options: any }>();
const bucket = { file: (name: string) => ({ save: async (bytes: Buffer, options: any) => { objects.set(name, { bytes, options }); }, download: async () => [objects.get(name)!.bytes] }) };
const art = createArtworkService({ getDb: () => db, getStorageBucket: () => bucket as any });
const input = await sharp({ create: { width: 30, height: 20, channels: 4, background: { r: 120, g: 20, b: 30, alpha: 0.7 } } }).png().toBuffer();
let count = 0;
async function check(name: string, fn: () => void | Promise<void>) { await fn(); count++; console.log('PASS ' + name); }
await check('PNG, JPEG and WebP decode to normalized PNG with original dimensions', async () => {
  for (const image of [input, await sharp(input).jpeg().toBuffer(), await sharp(input).webp().toBuffer()]) {
    const normalized = await normalizeArtwork(image);
    assert.equal(normalized.width, 30); assert.equal(normalized.height, 20);
    assert.equal((await sharp(normalized.data).metadata()).format, 'png');
  }
});
await check('EXIF metadata and trailing active content do not reach the stored image', async () => {
  const privateExif = await sharp(input).jpeg().withExif({ IFD0: { Artist: 'private-fixture-name' } }).toBuffer();
  assert.ok((await sharp(privateExif).metadata()).exif);
  const { data } = await normalizeArtwork(Buffer.concat([privateExif, Buffer.from('<script>private-fixture</script>')]));
  assert.equal((await sharp(data).metadata()).exif, undefined);
  assert.equal(data.includes(Buffer.from('private-fixture')), false);
});
await check('HTML, SVG, empty, damaged and oversized files fail closed', async () => {
  for (const bytes of [Buffer.from('<html>image.png</html>'), Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'), Buffer.alloc(0), input.subarray(0, 40), Buffer.alloc(MAX_ART_BYTES + 1)]) {
    await assert.rejects(normalizeArtwork(bytes), (e: any) => [413, 415].includes(e.status));
  }
  const hugePixels = await sharp({ create: { width: 6000, height: 5000, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(normalizeArtwork(hugePixels), (e: any) => e.status === 415);
});
await check('private artwork round trips encrypted without a public download token or stored secret', async () => {
  const saved = await art.save(input);
  const parsed = parsePrivateArtwork(saved.secure_url)!;
  assert.ok(parsed);
  const record = (await db.collection('customer_artworks').doc(parsed.id).get()).data();
  const stored = objects.get(record.objectName)!;
  assert.equal(stored.options.metadata.metadata?.firebaseStorageDownloadTokens, undefined);
  assert.notDeepEqual(stored.bytes, input);
  assert.doesNotMatch(JSON.stringify(record), new RegExp(parsed.token));
  assert.deepEqual(await art.read(parsed.id, parsed.token), (await normalizeArtwork(input)).data);
  assert.equal(await art.verifyUrl(saved.secure_url), true);
  const wrongToken = (parsed.token[0] === 'a' ? 'b' : 'a') + parsed.token.slice(1);
  await assert.rejects(art.read(parsed.id, wrongToken), (e: any) => e.status === 404);
  assert.equal(await art.verifyUrl(saved.secure_url.replace(parsed.token, wrongToken)), false);
  assert.equal(await art.verifyUrl(saved.secure_url.replace('fpacstore.com.br', 'evil.example')), false);
  assert.equal(await art.verifyUrl('https://res.cloudinary.com/any/image/upload/fake.png'), false);
  stored.bytes[20] ^= 1;
  await assert.rejects(art.read(parsed.id, parsed.token));
});
await check('upload quota is shared and atomic across simultaneous requests', async () => {
  const results = await Promise.allSettled(Array.from({ length: 16 }, () => claimArtworkQuota('192.0.2.125', db)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 12);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.status === 429).length, 4);
  const records = await db.collection('artwork_upload_limits').get();
  assert.doesNotMatch(JSON.stringify(records.docs.map((d: any) => d.data())), /192\.0\.2\.125/);
});
await check('remote import blocks private networks, credentials, non-HTTPS and disguised IPs', () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '172.16.1.1', '192.168.1.1', '::1', '0.0.0.0', '224.0.0.1']) assert.equal(publicArtworkAddress(address), false);
  assert.equal(publicArtworkAddress('8.8.8.8'), true);
  for (const url of ['http://example.com/image', 'https://127.1/image', 'https://2130706433/image', 'https://user:pass@example.com/a', 'https://example.com:8443/a', 'file:///etc/passwd', 'https://[::1]/a']) assert.throws(() => remoteArtworkUrl(url));
});
const transport = (address: string, response: { location?: string; body?: Buffer; size?: number }, onGet?: (options: any) => void): any => ({
  lookup: async () => [{ address, family: 4 }],
  get: (_url: URL, options: any, callback: any) => {
    onGet?.(options);
    const request = new EventEmitter();
    queueMicrotask(() => {
      const result: any = new EventEmitter();
      result.statusCode = response.location ? 302 : 200;
      result.headers = { ...(response.location ? { location: response.location } : {}), ...(response.size ? { 'content-length': response.size } : {}) };
      result.resume = () => {}; result.destroy = () => {};
      callback(result);
      queueMicrotask(() => { if (response.body) result.emit('data', response.body); result.emit('end'); });
    });
    return request;
  },
});
await check('validated DNS is pinned, private DNS and redirect targets never get fetched', async () => {
  let requests = 0;
  const optionsCheck = (options: any) => {
    requests++;
    options.lookup('rebound.example', {}, (error: any, address: string) => { assert.equal(error, null); assert.equal(address, '8.8.8.8'); });
    assert.equal(options.headers.Authorization, undefined);
  };
  assert.deepEqual(await fetchRemoteArtwork('https://fixture.example/a', 0, AbortSignal.timeout(5000), transport('8.8.8.8', { body: input }, optionsCheck)), input);
  await assert.rejects(fetchRemoteArtwork('https://fixture.example/a', 0, AbortSignal.timeout(5000), transport('127.0.0.1', { body: input }, () => requests++)));
  assert.equal(requests, 1);
  await assert.rejects(fetchRemoteArtwork('https://fixture.example/a', 0, AbortSignal.timeout(5000), transport('8.8.8.8', { location: 'https://169.254.169.254/metadata' }, () => requests++)));
  assert.equal(requests, 2);
});
await check('remote imports enforce redirect, byte and abort limits', async () => {
  await assert.rejects(fetchRemoteArtwork('https://fixture.example/a', 0, AbortSignal.timeout(5000), transport('8.8.8.8', { location: '/loop' })));
  await assert.rejects(fetchRemoteArtwork('https://fixture.example/a', 0, AbortSignal.timeout(5000), transport('8.8.8.8', { size: MAX_ART_BYTES + 1 })));
  await assert.rejects(fetchRemoteArtwork('https://fixture.example/a', 0, AbortSignal.abort(), transport('8.8.8.8', { body: input })));
});
await check('PRIME pricing requires the correct plain base and recalculates graduated prices', async () => {
  await db.collection('designs').doc('fixture-design').set({ name: 'Fixture', availableSizes: ['10x10'], pngUrl: 'https://example.invalid/fixture.png' });
  const input: any = { customerInfo: { cep: '89234100' }, items: [{ slug: 'prime-custom', baseProductSlug: 'fixture-base', color: 'Preto', size: 'M', quantity: 1, printConfigs: [{ stampId: 'fixture-design', stamp: 'Fixture', location: 'Frente', printSize: '10x10' }] }] };
  await assert.rejects(calculateOrderPricing(input), /peça lisa disponível/);
  await db.collection('products').doc('fixture-base').set({ name: 'Fixture base', slug: 'fixture-base', price: 100, productFinish: 'plain', baseModel: 'Oversized', status: 'inactive', colors: ['Preto'], sizes: ['M'] });
  await assert.rejects(calculateOrderPricing(input), /peça lisa disponível/);
  await db.collection('products').doc('fixture-base').update({ status: 'active' });
  const result = await calculateOrderPricing(input);
  assert.equal(result.verifiedItems[0].price, 87.90);
  assert.equal(result.verifiedItems[0].parentSlug, 'fixture-base');
  const placement = placePrimeArtwork('oversized', 'M', 'front', '10x10', { sourceWidth: 100, sourceHeight: 100, crop: { left: 0, top: 0, width: 1, height: 1 } }, { xCm: 3, yCm: 7 });
  input.items[0].printConfigs[0].placement = placement;
  const positioned = await calculateOrderPricing(input);
  assert.deepEqual(positioned.verifiedItems[0].customization.prints[0].placement, placement);
  input.items[0].printConfigs[0].placement.xCm = 90;
  await assert.rejects(calculateOrderPricing(input), /ultrapassa a área/);
  input.items[0].printConfigs[0].placement.xCm = 3;
  const original = MelhorEnvioService.prototype.calculateShipping;
  let quotes = 0;
  MelhorEnvioService.prototype.calculateShipping = async () => { quotes++; return [{ id: 1, price: 25 }] as any; };
  try {
    const remote = await calculateOrderPricing({ ...input, customerInfo: { cep: '01001000', city: 'Joinville' } });
    assert.equal(remote.pricing.shipping, 25); assert.equal(quotes, 1);
    await assert.rejects(calculateOrderPricing({ ...input, customerInfo: { city: 'Joinville' } }), /CEP inválido/);
  } finally { MelhorEnvioService.prototype.calculateShipping = original; }
});
await check('catalog measurements trim transparent padding, cache pixels and recheck publication without accepting arbitrary URLs', async () => {
  const padded = await sharp({ create: { width: 60, height: 80, channels: 4, background: '#ffaa00' } }).extend({ top: 10, bottom: 10, left: 20, right: 20, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  let reads = 0;
  const measure = createCatalogArtworkBoundsService({ getDb: () => db, fetchRemoteArtwork: async () => { reads++; return padded; } });
  await db.collection('designs').doc('measurement-fixture').set({ status: 'active', pngUrl: 'https://example.invalid/fixture.png' });
  const bounds = await measure('measurement-fixture');
  assert.deepEqual(bounds, { sourceWidth: 100, sourceHeight: 100, crop: { left: .2, top: .1, width: .6, height: .8 } });
  assert.deepEqual(await measure('measurement-fixture'), bounds); assert.equal(reads, 1);
  await db.collection('designs').doc('measurement-fixture').update({ status: 'draft' });
  await assert.rejects(measure('measurement-fixture'), /não encontrada/); assert.equal(reads, 1);
  await assert.rejects(measure('https://example.invalid/secret'), /não encontrada/);
});
console.log(`${count} private artwork and catalog security checks passed. No external storage or network used.`);

await check('checkout rejects oversized catalog sleeves, right-side catalog logos and hoodie sleeves', async () => {
  const item = { slug: 'prime-custom', baseProductSlug: 'fixture-base', color: 'Preto', size: 'M', price: 0.01, printConfigs: [{ stampId: 'fixture-design', stamp: 'Fixture', location: 'Manga Esquerda', printSize: '2x3' }] };
  const quote = () => calculateOrderPricing({ customerInfo: { cep:'89234100' }, items:[item] });
  assert.equal((await quote()).verifiedItems[0].price,79.9);
  item.printConfigs[0].printSize = '10x10'; await assert.rejects(quote(), /2 × 3/);
  item.printConfigs[0].printSize = '2x3'; item.printConfigs[0].location = 'Manga Direita'; await assert.rejects(quote(), /braço esquerdo/);
  item.slug='hoodie-custom'; await assert.rejects(quote(), /Área de estampa/);
});
