import assert from 'node:assert/strict';
import { subscribeFinancialGoalSettings, type FinancialGoalSettings } from '../shared/financialGoalSettings';

function harness(monthlyId = '2026-10', annualId = '2026-annual') {
  const listeners = new Map<string, { next: (value: any) => void; error: () => void }>();
  const states: FinancialGoalSettings[] = [];
  const stopped: string[] = [];
  const stop = subscribeFinancialGoalSettings(monthlyId, annualId, (id, next, error) => {
    listeners.set(id, { next, error });
    return () => { stopped.push(id); };
  }, state => states.push(state));
  return { listeners, states, stopped, stop, latest: () => states.at(-1)! };
}

let scenarios = 0;
for (const annualFirst of [false, true]) {
  for (const annualDocument of [null, { annualGoal: 25000 }, { annualGoal: 0 }]) {
    const h = harness();
    const events = [
      () => h.listeners.get('2026-10')!.next({ monthlyGoal: 2000, annualGoal: 18000 }),
      () => h.listeners.get('2026-annual')!.next(annualDocument)
    ];
    if (annualFirst) events.reverse();
    assert.equal(h.latest().loaded, false);
    events[0]();
    assert.equal(h.latest().loaded, false, 'must wait for both sources before allowing edits');
    events[1]();
    assert.equal(h.latest().loaded, true);
    assert.equal(h.latest().monthlyGoal, 2000);
    assert.equal(h.latest().annualGoal, annualDocument === null ? 18000 : annualDocument.annualGoal,
      'the annual goal must not depend on subscription arrival order; an explicit zero wins');
    h.stop();
    scenarios++;
  }
}

const updated = harness();
updated.listeners.get('2026-10')!.next({ monthlyGoal: 2000, annualGoal: 18000 });
updated.listeners.get('2026-annual')!.next({ annualGoal: 25000 });
updated.listeners.get('2026-10')!.next({ monthlyGoal: 2100, annualGoal: 19000 });
assert.equal(updated.latest().annualGoal, 25000, 'updating legacy monthly data must not replace a dedicated annual goal');
updated.listeners.get('2026-annual')!.next(null);
assert.equal(updated.latest().annualGoal, 19000, 'removing the dedicated goal restores the current legacy value');
scenarios++;

updated.listeners.get('2026-annual')!.error();
assert.equal(updated.latest().loaded, false, 'a failed source must prevent saving a partial or zeroed goal');
assert.match(updated.latest().error!, /Não foi possível carregar/);
scenarios++;

const countBeforeStop = updated.states.length;
updated.stop();
updated.listeners.get('2026-10')!.next({ monthlyGoal: 999999 });
updated.listeners.get('2026-annual')!.error();
assert.equal(updated.states.length, countBeforeStop, 'late callbacks from an old period must be ignored');
assert.deepEqual(updated.stopped.sort(), ['2026-10', '2026-annual']);
const nextYear = harness('2027-01', '2027-annual');
nextYear.listeners.get('2027-annual')!.next(null);
nextYear.listeners.get('2027-01')!.next(null);
assert.deepEqual(nextYear.latest(), { monthlyGoal: 0, annualGoal: 0, loaded: true, error: null },
  'a new period with no saved goals must not inherit values from the previous year');
nextYear.stop();
scenarios++;

console.log(`Financial goals: ${scenarios} regression scenarios passed; no database connections or writes.`);
