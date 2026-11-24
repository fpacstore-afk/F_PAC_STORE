import { getAuth } from 'firebase-admin/auth';
import { getDb } from '../firebase.js';
import { PURCHASE_CASHBACK_LIFETIME_DAYS, SIGNUP_BONUS_CENTS, redeemableCashbackCents } from '../../shared/cashbackPolicy.js';

type Account = { availableCents: number; pendingCents: number; heldCents: number; debtCents: number };
const empty = (): Account => ({ availableCents: 0, pendingCents: 0, heldCents: 0, debtCents: 0 });
const accountRef = (uid: string) => getDb().collection('cashback_accounts').doc(uid);
const iso = () => new Date().toISOString();
const amount = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
const accountData = (value: any): Account => ({ availableCents: amount(value?.availableCents), pendingCents: amount(value?.pendingCents), heldCents: amount(value?.heldCents), debtCents: amount(value?.debtCents) });
const eligibleUser = (uid: string) => typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);

/** One permanent welcome credit per eligible account; spendable only after e-mail verification. */
export async function ensureSignupBonus(uid: string, startedAt: string) {
  if (!eligibleUser(uid) || !startedAt) return;
  getDb();
  const user = await getAuth().getUser(uid);
  const created = Date.parse(user.metadata.creationTime || '');
  // The campaign configuration can be initialized by the same first signup.
  // Allow its immediate account creation without granting credits to old accounts.
  if (!Number.isFinite(created) || created < Date.parse(startedAt) - 5 * 60_000) return;
  await applySignupBonus(getDb(), uid, user.emailVerified === true);
}

/** Transactional stage transition, also exercised against the isolated test database. */
export async function applySignupBonus(db: any, uid: string, verified: boolean) {
  if (!eligibleUser(uid)) throw new Error('Conta inválida.');
  const ref = db.collection('cashback_accounts').doc(uid), creditRef = ref.collection('credits').doc('signup');
  await db.runTransaction(async (tx: any) => {
    const [accountSnap, creditSnap] = await Promise.all([tx.get(ref), tx.get(creditRef)]);
    const account = accountData(accountSnap.data());
    if (!creditSnap.exists) {
      tx.set(creditRef, { source: 'signup', originalCents: SIGNUP_BONUS_CENTS, remainingCents: SIGNUP_BONUS_CENTS,
        spentCents: 0, status: verified ? 'available' : 'pending_verification', expiresAt: null, createdAt: iso() });
      if (verified) account.availableCents += SIGNUP_BONUS_CENTS;
      tx.set(ref, { ...account, createdAt: accountSnap.data()?.createdAt || iso(), updatedAt: iso() }, { merge: true });
    } else if (verified && creditSnap.data()?.status === 'pending_verification') {
      const remaining = amount(creditSnap.data()?.remainingCents);
      tx.update(creditRef, { status: 'available', verifiedAt: iso() });
      tx.set(ref, { ...account, availableCents: account.availableCents + remaining, updatedAt: iso() }, { merge: true });
    }
  });
}

export async function expireCashback(uid: string) {
  if (!eligibleUser(uid)) return;
  const ref = accountRef(uid), now = iso();
  const snap = await ref.collection('credits').where('status', '==', 'available').limit(200).get();
  const expired = snap.docs.filter(doc => doc.data().expiresAt && doc.data().expiresAt <= now);
  if (!expired.length) return;
  await getDb().runTransaction(async tx => {
    const [accountSnap, ...credits] = await Promise.all([tx.get(ref), ...expired.map(doc => tx.get(doc.ref))]);
    const account = accountData(accountSnap.data());
    for (const credit of credits) {
      const data = credit.data();
      if (!data || data.status !== 'available' || !data.expiresAt || data.expiresAt > now) continue;
      const remaining = amount(data.remainingCents);
      account.availableCents = Math.max(0, account.availableCents - remaining);
      tx.update(credit.ref, { status: 'expired', remainingCents: 0, expiredAt: now });
    }
    tx.set(ref, { ...account, updatedAt: now }, { merge: true });
  });
}

export async function getCashbackWallet(uid: string) {
  if (!eligibleUser(uid)) throw new Error('Conta inválida.');
  await expireCashback(uid);
  const ref = accountRef(uid);
  const [account, credits] = await Promise.all([ref.get(), ref.collection('credits').orderBy('createdAt', 'desc').limit(40).get()]);
  return { ...accountData(account.data()), credits: credits.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
}

/** A provider retry can safely replay this operation. Never issue a reward for card or a non-catalogue order. */
export async function earnPurchaseCashback(order: any) {
  const program = order?.cashbackProgram;
  const uid = order?.userId;
  if (!eligibleUser(uid) || program?.source !== 'checkout_link' || program?.paymentMethod !== 'pix' ||
    program?.catalogueOnly !== true || order?.paymentStatus !== 'approved' || !amount(program?.earnedCents) ||
    order?.payment?.provider !== 'mercadopago' || order?.payment?.methodId !== 'pix' || !order?.payment?.providerPaymentId ||
    order?.status_pagamento !== 'approved') return;
  const ref = accountRef(uid), creditRef = ref.collection('credits').doc(`purchase_${order.id}`);
  await getDb().runTransaction(async tx => {
    const [accountSnap, creditSnap] = await Promise.all([tx.get(ref), tx.get(creditRef)]);
    if (creditSnap.exists) return;
    const account = accountData(accountSnap.data());
    account.pendingCents += program.earnedCents;
    tx.set(creditRef, { source: 'purchase', orderId: order.id, originalCents: program.earnedCents,
      remainingCents: 0, spentCents: 0, status: 'pending', createdAt: iso(), expiresAt: null });
    tx.set(ref, { ...account, updatedAt: iso() }, { merge: true });
  });
}

export async function releasePurchaseCashback(order: any) {
  if (!eligibleUser(order?.userId) || order?.shippingStatus !== 'delivered' || order?.paymentStatus !== 'approved') return;
  await earnPurchaseCashback(order);
  const ref = accountRef(order.userId), creditRef = ref.collection('credits').doc(`purchase_${order.id}`);
  await getDb().runTransaction(async tx => {
    const [accountSnap, creditSnap] = await Promise.all([tx.get(ref), tx.get(creditRef)]);
    const credit = creditSnap.data();
    if (!credit || credit.status !== 'pending') return;
    const account = accountData(accountSnap.data());
    const earned = amount(credit.originalCents);
    account.pendingCents = Math.max(0, account.pendingCents - earned);
    const applied = Math.max(0, earned - account.debtCents);
    account.debtCents = Math.max(0, account.debtCents - earned);
    account.availableCents += applied;
    const expiresAt = new Date(Date.now() + PURCHASE_CASHBACK_LIFETIME_DAYS * 86400000).toISOString();
    tx.update(creditRef, { status: 'available', remainingCents: applied, releasedAt: iso(), expiresAt });
    tx.set(ref, { ...account, updatedAt: iso() }, { merge: true });
  });
}

export async function reversePurchaseCashback(order: any) {
  if (!eligibleUser(order?.userId) || !order?.cashbackProgram) return;
  const ref = accountRef(order.userId), creditRef = ref.collection('credits').doc(`purchase_${order.id}`);
  await getDb().runTransaction(async tx => {
    const [accountSnap, creditSnap] = await Promise.all([tx.get(ref), tx.get(creditRef)]);
    const credit = creditSnap.data();
    if (!credit || credit.status === 'reversed') return;
    const account = accountData(accountSnap.data());
    const original = amount(credit.originalCents);
    if (credit.status === 'pending') account.pendingCents = Math.max(0, account.pendingCents - original);
    else {
      const remaining = amount(credit.remainingCents);
      account.availableCents = Math.max(0, account.availableCents - remaining);
      account.debtCents += amount(credit.spentCents);
    }
    tx.update(creditRef, { status: 'reversed', remainingCents: 0, reversedAt: iso() });
    tx.set(ref, { ...account, updatedAt: iso() }, { merge: true });
  });
}

export async function holdCashback(uid: string, orderId: string, requestedCents: number, discountedProductCents: number) {
  if (!eligibleUser(uid) || !/^[A-Za-z0-9_-]{1,128}$/.test(orderId) || !Number.isSafeInteger(requestedCents) || requestedCents <= 0) throw new Error('Crédito inválido.');
  await expireCashback(uid);
  const ref = accountRef(uid), holdRef = getDb().collection('cashback_holds').doc(orderId);
  const credits = await ref.collection('credits').where('status', '==', 'available').limit(200).get();
  return getDb().runTransaction(async tx => {
    const [accountSnap, holdSnap, ...freshCredits] = await Promise.all([tx.get(ref), tx.get(holdRef), ...credits.docs.map(doc => tx.get(doc.ref))]);
    if (holdSnap.exists) {
      const hold = holdSnap.data()!;
      if (hold.uid !== uid || hold.amountCents !== requestedCents) throw new Error('Esta tentativa já possui outro crédito reservado.');
      return hold;
    }
    const account = accountData(accountSnap.data());
    if (requestedCents > redeemableCashbackCents(account.availableCents, discountedProductCents)) throw new Error('Saldo de cashback insuficiente ou limite excedido.');
    let remaining = requestedCents;
    const allocations: Array<{ id: string; cents: number }> = [];
    const ordered = freshCredits.filter(doc => doc.exists && doc.data()?.status === 'available')
      .sort((a, b) => String(a.data()?.expiresAt || '9999').localeCompare(String(b.data()?.expiresAt || '9999')));
    for (const credit of ordered) {
      const used = Math.min(remaining, amount(credit.data()?.remainingCents));
      if (!used) continue;
      allocations.push({ id: credit.id, cents: used });
      tx.update(credit.ref, { remainingCents: amount(credit.data()?.remainingCents) - used });
      remaining -= used;
      if (!remaining) break;
    }
    if (remaining) throw new Error('Saldo inconsistente. Tente novamente.');
    account.availableCents -= requestedCents;
    account.heldCents += requestedCents;
    tx.set(ref, { ...account, updatedAt: iso() }, { merge: true });
    const hold = { uid, orderId, amountCents: requestedCents, allocations, status: 'held', createdAt: iso() };
    tx.create(holdRef, hold);
    return hold;
  });
}

export async function settleCashbackHold(orderId: string, paid: boolean) {
  const holdRef = getDb().collection('cashback_holds').doc(orderId);
  const holdSnap = await holdRef.get();
  const hold = holdSnap.data();
  if (!hold || hold.status !== 'held') return;
  const ref = accountRef(hold.uid);
  await getDb().runTransaction(async tx => {
    const [accountSnap, current, ...credits] = await Promise.all([tx.get(ref), tx.get(holdRef), ...hold.allocations.map((a: any) => tx.get(ref.collection('credits').doc(a.id)))]);
    if (current.data()?.status !== 'held') return;
    const account = accountData(accountSnap.data());
    account.heldCents = Math.max(0, account.heldCents - hold.amountCents);
    if (!paid) {
      hold.allocations.forEach((allocation: any, index: number) => {
        const credit = credits[index], data = credit.data();
        if (data?.status === 'available' && (!data.expiresAt || data.expiresAt > iso())) {
          tx.update(credit.ref, { remainingCents: amount(data.remainingCents) + allocation.cents });
          account.availableCents += allocation.cents;
        }
      });
    } else hold.allocations.forEach((allocation: any, index: number) => {
      const credit = credits[index], data = credit.data();
      if (data) {
        tx.update(credit.ref, { spentCents: amount(data.spentCents) + allocation.cents });
        if (data.status === 'reversed') account.debtCents += allocation.cents;
      }
    });
    tx.set(ref, { ...account, updatedAt: iso() }, { merge: true });
    tx.update(holdRef, { status: paid ? 'spent' : 'released', updatedAt: iso() });
  });
}

/** Restore a spent discount once when its order is fully cancelled, refunded or returned. */
export async function restoreRedeemedCashback(orderId: string) {
  const holdRef = getDb().collection('cashback_holds').doc(orderId), saved = (await holdRef.get()).data();
  if (!saved || saved.status === 'refunded' || saved.status === 'released') return;
  if (saved.status === 'held') { await settleCashbackHold(orderId, false); return; }
  const ref = accountRef(saved.uid);
  await getDb().runTransaction(async tx => {
    const [accountSnap, holdSnap, ...credits] = await Promise.all([tx.get(ref), tx.get(holdRef), ...saved.allocations.map((a: any) => tx.get(ref.collection('credits').doc(a.id)))]);
    const hold = holdSnap.data();
    if (!hold || hold.status !== 'spent') return;
    const account = accountData(accountSnap.data());
    hold.allocations.forEach((allocation: any, index: number) => {
      const credit = credits[index], data = credit.data();
      if (!data) return;
      const spentCents = Math.max(0, amount(data.spentCents) - allocation.cents);
      if (data.status === 'available' && (!data.expiresAt || data.expiresAt > iso())) {
        tx.update(credit.ref, { spentCents, remainingCents: amount(data.remainingCents) + allocation.cents });
        account.availableCents += allocation.cents;
      } else {
        tx.update(credit.ref, { spentCents });
        if (data.status === 'reversed') account.debtCents = Math.max(0, account.debtCents - allocation.cents);
      }
    });
    tx.set(ref, { ...account, updatedAt: iso() }, { merge: true });
    tx.update(holdRef, { status: 'refunded', updatedAt: iso() });
  });
}
