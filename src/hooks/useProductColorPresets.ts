import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { changeProductColorPresets, readProductColorPresets, type ProductColorPreset } from '../../shared/productColorPresets';

export function useProductColorPresets(active: boolean) {
  const [presets, setPresets] = useState<ProductColorPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const pending = useRef(false);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    setError(false);
    return onSnapshot(doc(db, 'settings', 'product_color_presets'), snapshot => {
      try {
        setPresets(readProductColorPresets(snapshot.data()));
        setError(false);
      } catch {
        setError(true);
      }
      setLoading(false);
    }, () => {
      setError(true);
      setLoading(false);
    });
  }, [active]);

  async function change(action: Parameters<typeof changeProductColorPresets>[1]) {
    if (loading || error) throw new Error('Aguarde o carregamento da seleção rápida ou reabra o cadastro.');
    if (pending.current) throw new Error('Aguarde a alteração de cor em andamento.');
    pending.current = true;
    setSaving(true);
    try {
      // Read inside the transaction so edits from another open registration are preserved.
      return await runTransaction(db, async transaction => {
        const reference = doc(db, 'settings', 'product_color_presets');
        const snapshot = await transaction.get(reference);
        const colors = changeProductColorPresets(readProductColorPresets(snapshot.data()), action);
        transaction.set(reference, { colors, updatedAt: serverTimestamp() }, { merge: true });
        return colors;
      });
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  return { presets, loading, saving, error, change };
}
