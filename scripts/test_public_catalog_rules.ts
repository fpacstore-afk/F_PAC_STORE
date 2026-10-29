import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, runTransaction } from 'firebase/firestore';
import { changeProductColorPresets, readProductColorPresets } from '../shared/productColorPresets';
import { ref, uploadBytes, getMetadata, listAll } from 'firebase/storage';

// Never connect these tests to production. Explicit demo project plus emulator guard.
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const environment = await initializeTestEnvironment({ projectId: 'demo-fpac-ecommerce-audit', firestore: { rules: readFileSync('firestore.rules', 'utf8') }, storage: { rules: readFileSync('storage.rules', 'utf8') } });
try {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [path, data] of Object.entries({ 'products/shirt': { name: 'Audit fixture', costPrice: 35 }, 'inventory/shirt': { stock: 10 }, 'config/brand': { logo: '/logo.png' }, 'config/private': { internal: true }, 'designs/fp-stock': { name: 'FP preta', stockBalance: 6, stockBySize: { '8x6': 2 } }, 'instagram_media_library/fixture': { url: 'https://res.cloudinary.com/example/image/upload/sample.jpg', caption: 'Rascunho privado' } })) await setDoc(doc(db, path), data);
  });
  const guest = environment.unauthenticatedContext().firestore();
  const customer = environment.authenticatedContext('customer', { email: 'customer@example.invalid', email_verified: true }).firestore();
  const unverified = environment.authenticatedContext('unverified-admin-email', { email: 'fpacstore@gmail.com', email_verified: false }).firestore();
  const claimed = environment.authenticatedContext('claimed-admin', { admin: true }).firestore();
  const manager = environment.authenticatedContext('manager', { email: 'fpacstore@gmail.com', email_verified: true }).firestore();
  for (const db of [guest, customer, unverified]) {
    await assertFails(getDoc(doc(db, 'products/shirt')));
    await assertFails(getDocs(collection(db, 'products')));
    await assertFails(getDoc(doc(db, 'inventory/shirt')));
    await assertFails(getDoc(doc(db, 'designs/fp-stock')));
    await assertFails(getDocs(collection(db, 'designs')));
    await assertFails(getDoc(doc(db, 'config/private')));
    await assertFails(getDocs(collection(db, 'config')));
    await assertFails(getDoc(doc(db, 'instagram_media_library/fixture')));
    await assertFails(getDocs(collection(db, 'instagram_media_library')));
    await assertFails(setDoc(doc(db, 'instagram_media_library/forged'), { url: 'https://example.invalid/image.jpg' }));
    await assertFails(setDoc(doc(db, 'products/shirt'), { price: 1 }));
    await assertSucceeds(getDoc(doc(db, 'config/brand')));
  }
  await assertSucceeds(getDoc(doc(claimed, 'products/shirt')));
  await assertSucceeds(getDoc(doc(manager, 'products/shirt')));
  await assertSucceeds(getDocs(collection(manager, 'products')));
  await assertSucceeds(getDoc(doc(manager, 'inventory/shirt')));
  await assertSucceeds(getDoc(doc(manager, 'designs/fp-stock')));
  await assertSucceeds(getDocs(collection(manager, 'designs')));
  await assertSucceeds(getDocs(collection(manager, 'config')));
  await assertSucceeds(getDoc(doc(manager, 'instagram_media_library/fixture')));
  await assertSucceeds(getDocs(collection(manager, 'instagram_media_library')));
  await assertSucceeds(setDoc(doc(manager, 'instagram_media_library/manager-upload'), { url: 'https://res.cloudinary.com/example/image/upload/manager.jpg', caption: '' }));
  console.log('Firestore access rules, including the private Instagram media library, passed against the isolated demo emulator.');
  const presetReference = doc(manager, 'settings', 'product_color_presets');
  await assertSucceeds(runTransaction(manager, async transaction => {
    const snapshot = await transaction.get(presetReference);
    transaction.set(presetReference, { colors: changeProductColorPresets(readProductColorPresets(snapshot.data()), { type: 'remove', name: 'Preto' }) });
  }));
  const storedPresets = await assertSucceeds(getDoc(presetReference));
  assert.ok(!storedPresets.data()?.colors.some(color => color.name === 'Preto'), 'removed presets must stay absent on a fresh read');
  assert.equal((await getDoc(doc(manager, 'inventory/shirt'))).data()?.stock, 10, 'preset deletion must preserve physical stock');
  assert.equal((await getDoc(doc(manager, 'products/shirt'))).data()?.name, 'Audit fixture', 'preset deletion must preserve products');
  for (const db of [guest, customer, unverified]) {
    await assertFails(getDoc(doc(db, 'settings', 'product_color_presets')));
    await assertFails(setDoc(doc(db, 'settings', 'product_color_presets'), { colors: [] }));
  }
  console.log('Quick-color presets persist with admin-only access and preserve product stock.');
  for (const db of [guest, customer, unverified]) {
    for (const path of ['customer_artworks/fixture', 'artwork_upload_limits/fixture']) {
      await assertFails(setDoc(doc(db, path), { tokenHash: 'forged' }));
      await assertFails(getDoc(doc(db, path)));
    }
  }
  await environment.withSecurityRulesDisabled(async context => {
    for (const name of ['catalog-media/images/public.png', 'Musicas do Site/audio/public.mp3', 'customer-artworks/private.bin', 'private-uploads/secret.pdf']) {
      await uploadBytes(ref(context.storage(), name), new Uint8Array([1, 2, 3]));
    }
  });
  for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('customer'), environment.authenticatedContext('unverified', { email: 'fpacstore@gmail.com', email_verified: false })]) {
    const storage = context.storage();
    await assertSucceeds(getMetadata(ref(storage, 'catalog-media/images/public.png')));
    await assertSucceeds(getMetadata(ref(storage, 'Musicas do Site/audio/public.mp3')));
    await assertFails(getMetadata(ref(storage, 'customer-artworks/private.bin')));
    await assertFails(getMetadata(ref(storage, 'private-uploads/secret.pdf')));
    await assertFails(listAll(ref(storage, 'catalog-media')));
    await assertFails(uploadBytes(ref(storage, 'catalog-media/forged.png'), new Uint8Array([1])));
    await assertFails(uploadBytes(ref(storage, 'customer-artworks/forged.bin'), new Uint8Array([1])));
  }
  const claimStorage = environment.authenticatedContext('claimed-admin', { admin: true }).storage();
  await assertSucceeds(getMetadata(ref(claimStorage, 'customer-artworks/private.bin')));
  const adminStorage = environment.authenticatedContext('manager', { email: 'fpacstore@gmail.com', email_verified: true }).storage();
  await assertSucceeds(getMetadata(ref(adminStorage, 'customer-artworks/private.bin')));
  await assertSucceeds(listAll(ref(adminStorage, 'catalog-media')));
  console.log('8 private artwork Firestore and 16 real Storage rule checks passed.');
  for (const collectionName of ['visitor_sessions', 'identity_quiz_sessions', 'promotion_analytics', 'analytics_conversions', 'public_ingestion_limits']) {
    await environment.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), collectionName, 'existing'), { protected: true }); });
    for (const db of [guest, customer, unverified]) {
      await assertFails(getDoc(doc(db, collectionName, 'existing')));
      await assertFails(setDoc(doc(db, collectionName, 'new'), { forged: true }));
      await assertFails(setDoc(doc(db, collectionName, 'existing'), { forged: true }, { merge: true }));
    }
  }
  console.log('30 ingestion privacy and write-denial rule checks passed.');
  for (const collectionName of ['pricing_workbench','pricing_workbench_quotes','pricing_workbench_events','pricing_workbench_imports','mockup_approval_requests','mockup_approval_events']) {
    await environment.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), collectionName, 'private'), { cost: 99 }); });
    for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('customer'), environment.authenticatedContext('manager', { email: 'fpacstore@gmail.com' })]) {
      await assertFails(getDoc(doc(context.firestore(), collectionName, 'private')));
      await assertFails(setDoc(doc(context.firestore(), collectionName, 'private'), { cost: 0 }));
    }
  }
  console.log('Pricing data is accessible only through the authenticated server API.');
} finally { await environment.cleanup(); }
