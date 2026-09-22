import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getMetadata, listAll } from 'firebase/storage';

// Never connect these tests to production. Explicit demo project plus emulator guard.
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const environment = await initializeTestEnvironment({ projectId: 'demo-fpac-ecommerce-audit', firestore: { rules: readFileSync('firestore.rules', 'utf8') }, storage: { rules: readFileSync('storage.rules', 'utf8') } });
try {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [path, data] of Object.entries({ 'products/shirt': { name: 'Audit fixture', costPrice: 35 }, 'inventory/shirt': { stock: 10 }, 'config/brand': { logo: '/logo.png' }, 'config/private': { internal: true } })) await setDoc(doc(db, path), data);
  });
  const guest = environment.unauthenticatedContext().firestore();
  const customer = environment.authenticatedContext('customer', { email: 'customer@example.invalid', email_verified: true }).firestore();
  const manager = environment.authenticatedContext('manager', { email: 'fpacstore@gmail.com', email_verified: true }).firestore();
  for (const db of [guest, customer]) {
    await assertFails(getDoc(doc(db, 'products/shirt')));
    await assertFails(getDocs(collection(db, 'products')));
    await assertFails(getDoc(doc(db, 'inventory/shirt')));
    await assertFails(getDoc(doc(db, 'config/private')));
    await assertFails(getDocs(collection(db, 'config')));
    await assertFails(setDoc(doc(db, 'products/shirt'), { price: 1 }));
    await assertSucceeds(getDoc(doc(db, 'config/brand')));
  }
  await assertSucceeds(getDoc(doc(manager, 'products/shirt')));
  await assertSucceeds(getDocs(collection(manager, 'products')));
  await assertSucceeds(getDoc(doc(manager, 'inventory/shirt')));
  await assertSucceeds(getDocs(collection(manager, 'config')));
  console.log('18 real Firestore rule checks passed against isolated demo emulator.');
  for (const db of [guest, customer]) {
    for (const path of ['customer_artworks/fixture', 'artwork_upload_limits/fixture']) {
      await assertFails(setDoc(doc(db, path), { tokenHash: 'forged' }));
      await assertFails(getDoc(doc(db, path)));
    }
  }
  await environment.withSecurityRulesDisabled(async context => {
    for (const name of ['catalog-media/images/public.png', 'customer-artworks/private.bin']) {
      await uploadBytes(ref(context.storage(), name), new Uint8Array([1, 2, 3]));
    }
  });
  for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('customer')]) {
    const storage = context.storage();
    await assertSucceeds(getMetadata(ref(storage, 'catalog-media/images/public.png')));
    await assertFails(getMetadata(ref(storage, 'customer-artworks/private.bin')));
    await assertFails(listAll(ref(storage, 'catalog-media')));
    await assertFails(uploadBytes(ref(storage, 'catalog-media/forged.png'), new Uint8Array([1])));
    await assertFails(uploadBytes(ref(storage, 'customer-artworks/forged.bin'), new Uint8Array([1])));
  }
  const adminStorage = environment.authenticatedContext('manager', { email: 'fpacstore@gmail.com', email_verified: true }).storage();
  await assertSucceeds(getMetadata(ref(adminStorage, 'customer-artworks/private.bin')));
  await assertSucceeds(listAll(ref(adminStorage, 'catalog-media')));
  console.log('8 private artwork Firestore and 12 real Storage rule checks passed.');
  for (const collectionName of ['visitor_sessions', 'identity_quiz_sessions', 'promotion_analytics', 'analytics_conversions', 'public_ingestion_limits']) {
    await environment.withSecurityRulesDisabled(async context => { await setDoc(doc(context.firestore(), collectionName, 'existing'), { protected: true }); });
    for (const db of [guest, customer]) {
      await assertFails(getDoc(doc(db, collectionName, 'existing')));
      await assertFails(setDoc(doc(db, collectionName, 'new'), { forged: true }));
      await assertFails(setDoc(doc(db, collectionName, 'existing'), { forged: true }, { merge: true }));
    }
  }
  console.log('30 ingestion privacy and write-denial rule checks passed.');
} finally { await environment.cleanup(); }
