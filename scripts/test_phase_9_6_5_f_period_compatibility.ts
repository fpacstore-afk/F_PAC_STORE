/**
 * TEST SUITE FASE 9.6.5-F — COMPATIBILIDADE CANÔNICA DE PERÍODOS
 * 
 * Verificações obrigatórias:
 * 1. 01/08→31/08 + monthly → MATCH
 * 2. 10/08→20/08 + monthly Agosto → NO MATCH
 * 3. 10/08→20/08 + custom exato → MATCH
 * 4. 10/08→20/08 + monthly mesmas datas → NO MATCH
 * 5. Q3 + quarterly Q3 → MATCH
 * 6. Ano 2026 + yearly 2026 → MATCH
 * 7. Ano 2026 + monthly Agosto → NO MATCH
 * 8. 01/02/2028→29/02/2028 → monthly (Leap Year February)
 */

import assert from 'assert';
import {
  inferCanonicalPeriodFromDates,
  selectCompatibleCommercialGoal
} from '../src/utils/commercialForecast.js';
import { CommercialGoal } from '../src/types/commercialGovernance.js';

async function runPhase965FTests() {
  console.log('======================================================================');
  console.log('🚀 INICIANDO SUÍTE FASE 9.6.5-F — PERIOD COMPATIBILITY');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void) {
    total++;
    try {
      fn();
      passed++;
      console.log(`  ✅ [PASS] ${total}. ${name}`);
    } catch (err: any) {
      console.error(`  ❌ [FAIL] ${total}. ${name}: ${err.message}`);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Helper inferCanonicalPeriodFromDates
  // -------------------------------------------------------------------------
  test('PARTIAL MONTH = CUSTOM: 10/08/2026 a 20/08/2026 infere custom', () => {
    const p = inferCanonicalPeriodFromDates('2026-08-10', '2026-08-20');
    assert.strictEqual(p, 'custom', '10/08 a 20/08 deve inferir custom');
  });

  test('LEAP YEAR FEBRUARY: 01/02/2028 a 29/02/2028 infere monthly em ano bissexto', () => {
    const p2028 = inferCanonicalPeriodFromDates('2028-02-01', '2028-02-29');
    assert.strictEqual(p2028, 'monthly', '01/02 a 29/02/2028 é monthly');

    const p2026 = inferCanonicalPeriodFromDates('2026-02-01', '2026-02-28');
    assert.strictEqual(p2026, 'monthly', '01/02 a 28/02/2026 é monthly');

    const p2026Invalid = inferCanonicalPeriodFromDates('2026-02-01', '2026-02-29');
    assert.strictEqual(p2026Invalid, 'custom', '29/02 em 2026 não é fim de mês válido para monthly');
  });

  test('QUARTER DATES: 01/07 a 30/09 infere quarterly (Q3)', () => {
    assert.strictEqual(inferCanonicalPeriodFromDates('2026-01-01', '2026-03-31'), 'quarterly', 'Q1');
    assert.strictEqual(inferCanonicalPeriodFromDates('2026-04-01', '2026-06-30'), 'quarterly', 'Q2');
    assert.strictEqual(inferCanonicalPeriodFromDates('2026-07-01', '2026-09-30'), 'quarterly', 'Q3');
    assert.strictEqual(inferCanonicalPeriodFromDates('2026-10-01', '2026-12-31'), 'quarterly', 'Q4');
  });

  test('YEAR DATES: 01/01 a 31/12 infere yearly', () => {
    assert.strictEqual(inferCanonicalPeriodFromDates('2026-01-01', '2026-12-31'), 'yearly');
  });

  // -------------------------------------------------------------------------
  // Match Cases in selectCompatibleCommercialGoal
  // -------------------------------------------------------------------------

  test('MONTHLY FULL MATCH: Forecast 01/08→31/08 com Goal monthly Agosto dá MATCH', () => {
    const goals: CommercialGoal[] = [
      {
        id: 'g_aug_monthly',
        title: 'Meta Agosto 2026',
        type: 'revenue',
        targetValue: 10000,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        period: 'monthly',
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      }
    ];

    const match = selectCompatibleCommercialGoal(goals, 'revenue', '2026-08-01', '2026-08-31');
    assert(match !== undefined, 'Deve encontrar a meta mensal de Agosto');
    assert.strictEqual(match!.id, 'g_aug_monthly');
  });

  test('MONTHLY PARTIAL NO MATCH: Forecast custom 10/08→20/08 com Goal monthly Agosto dá NO MATCH', () => {
    const goals: CommercialGoal[] = [
      {
        id: 'g_aug_monthly',
        title: 'Meta Agosto 2026',
        type: 'revenue',
        targetValue: 10000,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        period: 'monthly',
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      }
    ];

    const match = selectCompatibleCommercialGoal(goals, 'revenue', '2026-08-10', '2026-08-20');
    assert.strictEqual(match, undefined, 'Forecast custom parcial não deve dar match com meta monthly');
  });

  test('CUSTOM EXACT MATCH: Forecast custom 10/08→20/08 com Goal custom 10/08→20/08 dá MATCH', () => {
    const goals: CommercialGoal[] = [
      {
        id: 'g_custom_exact',
        title: 'Meta Campanha Especial',
        type: 'revenue',
        targetValue: 5000,
        startDate: '2026-08-10',
        endDate: '2026-08-20',
        period: 'custom',
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-08-10T00:00:00Z',
        updatedAt: '2026-08-10T00:00:00Z'
      }
    ];

    const match = selectCompatibleCommercialGoal(goals, 'revenue', '2026-08-10', '2026-08-20');
    assert(match !== undefined, 'Deve encontrar a meta custom exata');
    assert.strictEqual(match!.id, 'g_custom_exact');
  });

  test('INVALID MONTHLY EXACT NO MATCH: Forecast custom 10/08→20/08 com Goal declarada monthly 10/08→20/08 dá NO MATCH', () => {
    const goals: CommercialGoal[] = [
      {
        id: 'g_invalid_monthly',
        title: 'Meta com período incompatível com datas',
        type: 'revenue',
        targetValue: 5000,
        startDate: '2026-08-10',
        endDate: '2026-08-20',
        period: 'monthly', // Incompatível com 10/08->20/08
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-08-10T00:00:00Z',
        updatedAt: '2026-08-10T00:00:00Z'
      }
    ];

    const match = selectCompatibleCommercialGoal(goals, 'revenue', '2026-08-10', '2026-08-20');
    assert.strictEqual(match, undefined, 'A correspondência exata de datas NÃO pode ignorar tipo de período inválido');
  });

  test('QUARTER MATCH: Forecast Q3 (01/07→30/09) com Goal quarterly Q3 dá MATCH', () => {
    const goals: CommercialGoal[] = [
      {
        id: 'g_q3_rev',
        title: 'Meta Q3 2026',
        type: 'revenue',
        targetValue: 30000,
        startDate: '2026-07-01',
        endDate: '2026-09-30',
        period: 'quarterly',
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z'
      }
    ];

    const match = selectCompatibleCommercialGoal(goals, 'revenue', '2026-07-01', '2026-09-30');
    assert(match !== undefined, 'Deve encontrar meta trimestral');
    assert.strictEqual(match!.id, 'g_q3_rev');
  });

  test('YEAR MATCH: Forecast Ano 2026 (01/01→31/12) com Goal yearly 2026 dá MATCH', () => {
    const goals: CommercialGoal[] = [
      {
        id: 'g_2026_yearly',
        title: 'Meta Anual 2026',
        type: 'revenue',
        targetValue: 120000,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        period: 'yearly',
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z'
      }
    ];

    const match = selectCompatibleCommercialGoal(goals, 'revenue', '2026-01-01', '2026-12-31');
    assert(match !== undefined, 'Deve encontrar meta anual');
    assert.strictEqual(match!.id, 'g_2026_yearly');
  });

  test('MONTHLY VS YEAR NO MATCH: Forecast Ano 2026 (01/01→31/12) com Goal monthly Agosto dá NO MATCH', () => {
    const goals: CommercialGoal[] = [
      {
        id: 'g_aug_monthly',
        title: 'Meta Agosto 2026',
        type: 'revenue',
        targetValue: 10000,
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        period: 'monthly',
        status: 'active',
        createdBy: 'admin',
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z'
      }
    ];

    const match = selectCompatibleCommercialGoal(goals, 'revenue', '2026-01-01', '2026-12-31');
    assert.strictEqual(match, undefined, 'Meta mensal de Agosto não deve ser selecionada para Forecast Anual');
  });

  console.log('\n======================================================================');
  console.log(`📊 RESULTADO FASE 9.6.5-F: ${passed} Passaram | ${total - passed} Falharam`);
  console.log('======================================================================\n');
}

runPhase965FTests();
