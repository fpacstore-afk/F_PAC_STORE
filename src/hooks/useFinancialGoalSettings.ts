import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { emptyFinancialGoalSettings, subscribeFinancialGoalSettings } from '../../shared/financialGoalSettings';

export function useFinancialGoalSettings(monthlyId: string, annualId: string) {
  const key = `${monthlyId}:${annualId}`;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState(() => ({ key, ...emptyFinancialGoalSettings() }));
  useEffect(() => subscribeFinancialGoalSettings(monthlyId, annualId,
    (id, next, error) => onSnapshot(doc(db, 'financial_goals', id),
      snapshot => next(snapshot.exists() ? snapshot.data() : null), error),
    settings => setState({ key, ...settings })
  ), [monthlyId, annualId, key, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { ...(state.key === key ? state : emptyFinancialGoalSettings()), retry };
}
