import assert from 'node:assert/strict';
import { requireIsolatedTestDb } from './requireIsolatedTestDb';
import { calculateOrderPricing } from '../server/services/pricing.service';
import { checkStock, reserveStock } from '../server/services/store.service';

// Fixtures must never reach real storage, shipping, email or payment services.
const db = requireIsolatedTestDb();
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Unexpected network request in isolated variant test'); };
const now = new Date('2026-10-16T12:00:00Z').getTime();
const context = { priceOnly: true, now };
const shirt = {
  id: 'variant-fixture', slug: 'variant-fixture', name: 'Fixture', status: 'active', price: 100,
  productFinish: 'printed', stockMode: 'ready_only',
  colors: [{ name: 'Preto' }, { name: 'Branco' }, { name: 'Off White_Azul' }],
  sizes: ['M', 'G', 'Único'],
};
const selection = { slug: shirt.slug, color: 'Branco', size: 'G', quantity: 1 };
const quote = (item: any) => calculateOrderPricing({ items: [item], customerInfo: {} }, context);
let checks = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn(); checks++; console.log(`PASS ${name}`);
}
const mismatch = (error: any) => error?.code === 'CHECKOUT_VARIANT_MISMATCH';

try {
  await db.collection('products').doc(shirt.id).set(shirt);
  await db.collection('inventory').doc(shirt.slug).set({ variants: {
    Preto_M: { physicalQuantity: 3, reservedQuantity: 0, physicalCountVerified: true },
    Branco_G: { physicalQuantity: 2, reservedQuantity: 0, physicalCountVerified: true },
    'Off White_Azul_Único': { physicalQuantity: 1, reservedQuantity: 0, physicalCountVerified: true },
  } });

  await check('forged stock key is rejected before shipping, reservation or payment', async () => {
    await assert.rejects(calculateOrderPricing({
      items: [{ ...selection, variantKey: 'Preto_M' }], customerInfo: { cep: '89234100' },
    }, { lookupPostcode: async () => { throw new Error('Shipping must not run for a forged variant'); } }), mismatch);
    assert.equal((await db.collection('orders').get()).size, 0);
    assert.equal((await db.collection('stock_reservations').get()).size, 0);
    assert.equal((await db.collection('inventory').doc(shirt.slug).get()).data().variants.Preto_M.reservedQuantity, 0);
  });

  await check('unavailable reported variant cannot borrow the key of an in-stock variant', async () => {
    const inventory = (await db.collection('inventory').doc(shirt.slug).get()).data();
    await db.collection('inventory').doc(shirt.slug).update({ variants: { ...inventory.variants,
      Branco_G: { ...inventory.variants.Branco_G, physicalQuantity: 0 },
    } });
    await assert.rejects(quote({ ...selection, variantKey: 'Preto_M' }), mismatch);
    const { verifiedItems } = await quote(selection);
    assert.equal((await checkStock(verifiedItems)).isAvailable, false);
    await db.collection('inventory').doc(shirt.slug).set(inventory);
  });

  await check('omitted or matching identifiers derive the same server identity', async () => {
    for (const ids of [{}, { variantKey: 'Branco_G' }, { variantId: 'Branco_G' },
      { variantKey: 'Branco_G', variantId: 'variant-fixture_Branco_G' },
      { variantKey: '', variantId: '' }, { variantKey: null, variantId: null }]) {
      const item = (await quote({ ...selection, ...ids })).verifiedItems[0];
      assert.equal(item.variantKey, 'Branco_G'); assert.equal(item.variantId, 'Branco_G');
      assert.equal(item.color, 'Branco'); assert.equal(item.size, 'G');
    }
  });

  await check('different-product, different-selection and malformed IDs are rejected', async () => {
    for (const ids of [{ variantId: 'Preto_M' }, { variantId: 'variant-fixture_Preto_M' },
      { variantId: 'other-product_Branco_G' }, { variantKey: ['Branco_G'] },
      { variantKey: { key: 'Branco_G' } }, { variantId: ['Branco_G'] }, { variantKey: false }]) {
      await assert.rejects(quote({ ...selection, ...ids }), mismatch);
    }
  });

  await check('valid checkout reserves exactly the described color and size', async () => {
    const { verifiedItems } = await quote({ ...selection, variantId: 'variant-fixture_Branco_G' });
    await reserveStock('VARIANT-ORDER', verifiedItems, 'variant-reservation', { items: verifiedItems });
    const inventory = (await db.collection('inventory').doc(shirt.slug).get()).data();
    assert.equal(inventory.variants.Preto_M.reservedQuantity, 0);
    assert.equal(inventory.variants.Branco_G.reservedQuantity, 1);
    const order = (await db.collection('orders').doc('VARIANT-ORDER').get()).data();
    assert.equal(order.items[0].color, 'Branco'); assert.equal(order.items[0].size, 'G');
    assert.equal(order.items[0].inventoryAllocations[0].variantKey, 'Branco_G');
  });

  await check('legacy labels, parent IDs and products without variant matrices remain supported', async () => {
    const legacy = { ...shirt, id: 'legacy-doc', slug: 'legacy-shirt', parentSlug: shirt.slug };
    await db.collection('products').doc(legacy.id).set(legacy);
    for (const prefix of [legacy.id, legacy.slug, legacy.parentSlug]) {
      const item = (await quote({ slug: legacy.slug, color: 'Off White_Azul', size: 'Único',
        variantKey: 'Off White_Azul_Único', variantId: `${prefix}_Off White_Azul_Único` })).verifiedItems[0];
      assert.equal(item.variantKey, 'Off White_Azul_Único');
      assert.equal(item.variantId, 'Off White_Azul_Único');
    }
    await db.collection('products').doc('legacy-no-matrix').set({ slug: 'legacy-no-matrix', status: 'active', price: 80 });
    const item = (await quote({ slug: 'legacy-no-matrix', color: 'Padrão', size: 'M' })).verifiedItems[0];
    assert.equal(item.variantKey, 'Padrão_M');
    const defaulted = (await quote({ slug: 'legacy-no-matrix' })).verifiedItems[0];
    assert.equal(defaulted.variantKey, 'Padrão_M');
  });

  await check('selected variant must respect catalog colors, sizes and disabled combinations', async () => {
    await assert.rejects(quote({ ...selection, color: 'Azul' }), /Cor ou tamanho indisponível/);
    await assert.rejects(quote({ ...selection, color: 'Preto_Removido' }), /Cor ou tamanho indisponível/);
    await assert.rejects(quote({ ...selection, size: 'XXL' }), /Cor ou tamanho indisponível/);
    await db.collection('products').doc('inactive-color').set({ ...shirt, slug: 'inactive-color',
      colors: [{ name: 'Branco', active: false }],
    });
    await assert.rejects(quote({ ...selection, slug: 'inactive-color' }), /Cor ou tamanho indisponível/);
    await db.collection('products').doc('inactive-variant').set({ ...shirt, slug: 'inactive-variant',
      variants: [{ colorName: 'Branco', size: 'G', active: false }],
    });
    await assert.rejects(quote({ ...selection, slug: 'inactive-variant' }), /Cor ou tamanho indisponível/);
  });

  await check('PRIME derives the selected blank variant and rejects forged keys', async () => {
    await db.collection('products').doc('prime-blank').set({ ...shirt, slug: 'prime-blank',
      productFinish: 'plain', status: 'draft', primeBaseEnabled: true, baseModel: 'Oversized Premium 240GSM',
    });
    const prime = { slug: 'prime-custom', baseProductSlug: 'prime-blank', color: 'Branco', size: 'G',
      printConfigs: [], variantId: 'prime_Branco_G',
    };
    const item = (await quote(prime)).verifiedItems[0];
    assert.equal(item.variantKey, 'Branco_G'); assert.equal(item.variantId, 'Branco_G');
    assert.equal(item.productId, 'prime-blank'); assert.equal(item.parentSlug, 'prime-blank');
    assert.equal(item.customization?.type, 'prime-custom');
    await assert.rejects(quote({ ...prime, variantKey: 'Preto_M' }), mismatch);
  });

  await check('the selected supplier model validates its own disabled combinations', async () => {
    const design = { ...shirt, slug: 'model-design', baseModel: 'Fixture model' };
    const base = { ...shirt, slug: 'model-blank', productFinish: 'plain', status: 'draft',
      baseModel: 'Fixture model', garmentModelId: 'MODEL-1',
      variants: [{ colorName: 'Branco', size: 'G', active: false }],
    };
    await db.collection('products').doc(design.slug).set(design);
    await db.collection('products').doc(base.slug).set(base);
    await assert.rejects(quote({ ...selection, slug: design.slug, garmentModelId: 'MODEL-1' }), /Cor ou tamanho indisponível/);
  });

  await check('legacy manual stock reservations keep their existing variant identifiers', async () => {
    // Manual operations use store.service directly and are deliberately not repriced.
    const manual = { productId: shirt.id, slug: shirt.slug, color: 'Preto', size: 'M', quantity: 1,
      variantKey: 'Preto_M', variantId: 'variant-fixture_Preto_M',
    };
    await reserveStock('MANUAL-VARIANT', [manual], 'manual-variant-reservation', { isManual: true, items: [manual] });
    const order = (await db.collection('orders').doc('MANUAL-VARIANT').get()).data();
    assert.equal(order.items[0].variantId, manual.variantId);
    assert.equal(order.items[0].inventoryAllocations[0].variantKey, 'Preto_M');
  });
} finally {
  globalThis.fetch = originalFetch;
}
console.log(`${checks} checkout variant identity regressions passed; isolated database, no external requests.`);
