import { companyMovementReference } from '../../shared/companyMovements';

/** A unified export must update its original document, never create a second expense. */
export async function saveCompanyMovementFromSheet(db: any, entry: any) {
  const reference = companyMovementReference(String(entry.id));
  if (reference.collection === 'financial_investments') {
    if (!reference.id || reference.id.includes('/')) throw new Error('Referência de gasto de estrutura inválida.');
    const ref = db.collection(reference.collection).doc(reference.id);
    await db.runTransaction(async (transaction: any) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error('Gasto de estrutura não encontrado. Atualize a planilha antes de sincronizar.');
      transaction.update(ref, {
        date: entry.date,
        description: entry.description,
        category: entry.category,
        amount: Number(entry.amount)
      });
    });
    return;
  }
  const isLocal = reference.id.startsWith('local-') || reference.id.startsWith('cf-');
  const ref = isLocal ? db.collection('financial_cashflow').doc() : db.collection('financial_cashflow').doc(reference.id);
  await ref.set({
    id: ref.id,
    date: entry.date || new Date().toISOString().split('T')[0],
    type: entry.type || 'out',
    description: entry.description || '',
    category: entry.category || 'Outros',
    amount: Number(entry.amount || 0)
  }, { merge: true });
}
