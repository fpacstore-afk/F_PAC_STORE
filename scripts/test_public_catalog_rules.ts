import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

// Never connect these tests to production. Explicit demo project plus emulator guard.
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const environment = await initializeTestEnvironment({ projectId: 'demo-fpac-ecommerce-audit', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
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
} finally { await environment.cleanup(); }
