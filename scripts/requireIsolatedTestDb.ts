import { getDb } from '../server/firebase.js';

/** Certification fixtures must never use the store's real Firestore. */
export function requireIsolatedTestDb() {
  if (process.env.NODE_ENV === 'production' || process.env.K_SERVICE ||
      (process.env.NODE_ENV !== 'test' && process.env.USE_MOCK_DB !== 'true')) {
    throw new Error('UNSAFE_TEST_DATABASE: run with NODE_ENV=test and an isolated in-memory database.');
  }
  const db = getDb();
  if (db.isIsolatedInMemoryDatabase !== true) {
    throw new Error('UNSAFE_TEST_DATABASE: the initialized database is not an isolated in-memory database.');
  }
  return db;
}
