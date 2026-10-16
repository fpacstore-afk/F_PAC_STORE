export interface FinancialGoalSettings {
  monthlyGoal: number;
  annualGoal: number;
  loaded: boolean;
  error: string | null;
}

type GoalDocument = { monthlyGoal?: unknown; annualGoal?: unknown } | null;
type GoalSubscriber = (id: string, next: (data: GoalDocument) => void, error: () => void) => () => void;

export const emptyFinancialGoalSettings = (): FinancialGoalSettings => ({
  monthlyGoal: 0, annualGoal: 0, loaded: false, error: null
});

const amount = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

// Keep the two subscriptions independent of arrival order. An explicit annual
// zero overrides legacy data, while a missing annual document preserves it.
export function subscribeFinancialGoalSettings(
  monthlyId: string,
  annualId: string,
  subscribe: GoalSubscriber,
  onChange: (settings: FinancialGoalSettings) => void
): () => void {
  let active = true;
  let monthly: GoalDocument = null, annual: GoalDocument = null;
  let monthlyLoaded = false, annualLoaded = false;
  let monthlyFailed = false, annualFailed = false;
  const publish = () => {
    if (!active) return;
    const failed = monthlyFailed || annualFailed;
    onChange({
      monthlyGoal: amount(monthly?.monthlyGoal),
      annualGoal: amount(annual?.annualGoal ?? monthly?.annualGoal),
      loaded: monthlyLoaded && annualLoaded && !failed,
      error: failed ? 'Não foi possível carregar as metas. Tente novamente.' : null
    });
  };
  publish();
  const stopMonthly = subscribe(monthlyId, data => {
    monthly = data; monthlyLoaded = true; monthlyFailed = false; publish();
  }, () => { monthlyFailed = true; publish(); });
  const stopAnnual = subscribe(annualId, data => {
    annual = data; annualLoaded = true; annualFailed = false; publish();
  }, () => { annualFailed = true; publish(); });
  return () => { active = false; stopMonthly(); stopAnnual(); };
}
