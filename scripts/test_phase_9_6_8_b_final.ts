/**
 * REGRESSÃO COMPLETA E CERTIFICAÇÃO FINAL — FASE 9.6.8-B HARDENED
 * FPAC Store — Sistema de Inteligência & Execução Comercial
 *
 * Valida:
 * 1. Motores Matemáticos Certificados 9.6.1–9.6.7 (sem alteração).
 * 2. Contratos Canônicos 9.6.8-B:
 *    - cycle.linkedForecastId
 *    - budget.approvedSnapshot
 *    - cycle.goalExecutionSnapshots
 *    - goalComparisons
 *    - actionEffectivenessSummary (directActionsCompleted, directActionsSuccess, directActionEffectivenessRate)
 *    - historical learning summary (period filtering, forecast bias, sample size confidence <3, 3-5, >5)
 *    - targetCycleId obrigatório em conversão de insights e validação de ciclo ativo
 *    - Imutabilidade do Review aprovado (outcomeSnapshot SHA256 idêntico)
 *    - Paginação server-side Firestore com validação de cursor
 * 3. Bateria completa de regressão.
 */

import { execSync } from 'child_process';

console.log('========================================================================');
console.log('🛡️ BATERIA FINAL DE CERTIFICAÇÃO & REGRESSÃO — FASE 9.6.8-B');
console.log('========================================================================\n');

const testSuites = [
  { name: '9.6.1 — Motor de Rentabilidade por Pedido/Produto', file: 'scripts/test_phase_9_6_1_certification.ts' },
  { name: '9.6.2 — DRE Financeiro e Custos Fixos/Variáveis', file: 'scripts/test_phase_9_6_2_certification.ts' },
  { name: '9.6.3 — Break-Even e Metas de Lucro Canônicas', file: 'scripts/test_phase_9_6_3_certification.ts' },
  { name: '9.6.4 — Ações Comerciais & Metas Persistentes', file: 'scripts/test_phase_9_6_4_certification.ts' },
  { name: '9.6.4 — Integração Backend Governança Comercial', file: 'scripts/test_phase_9_6_4_backend_integration.ts' },
  { name: '9.6.5 — Planejamento Comercial, Forecast & Cenários', file: 'scripts/test_phase_9_6_5_certification.ts' },
  { name: '9.6.5 — Integração Backend Forecast & Cenários', file: 'scripts/test_phase_9_6_5_backend_integration.ts' },
  { name: '9.6.6 — Orçamento Comercial & Guardrails Financeiros', file: 'scripts/test_phase_9_6_6_f_final.ts' },
  { name: '9.6.6 — Orçamento Comercial & Guardrails UI/State', file: 'scripts/test_phase_9_6_6_f2_final.ts' },
  { name: '9.6.7 — Execução Comercial & Planos de Ação', file: 'scripts/test_phase_9_6_7_certification.ts' },
  { name: '9.6.7 — Integração Backend Execução Comercial', file: 'scripts/test_phase_9_6_7_backend_integration.ts' },
  { name: '9.6.7-F — Certificação Final de Execução Comercial', file: 'scripts/test_phase_9_6_7_f_final.ts' },
  { name: '9.6.8 — Pure Variance Bridge, Calibração & Aprendizado', file: 'scripts/test_phase_9_6_8_pure_variance_bridge.ts' },
  { name: '9.6.8 — Certificação Oficial Pós-Mortem Comercial', file: 'scripts/test_phase_9_6_8_certification.ts' },
  { name: '9.6.8-B — Hardening Backend, Contratos Canônicos & Concorrência', file: 'scripts/test_phase_9_6_8_backend_integration.ts' }
];

let passedCount = 0;
let failedCount = 0;
const failedSuites: { name: string; file: string; error: string }[] = [];

for (const suite of testSuites) {
  console.log(`\n▶️  Executando: ${suite.name} (${suite.file})...`);
  try {
    const output = execSync(`npx tsx ${suite.file}`, { stdio: 'pipe' }).toString();
    console.log(output);
    passedCount++;
    console.log(`✅ [SUCESSO] ${suite.name}`);
  } catch (err: any) {
    failedCount++;
    const errMsg = (err.stdout ? err.stdout.toString() : '') + (err.stderr ? err.stderr.toString() : '') + (err.message || '');
    failedSuites.push({ name: suite.name, file: suite.file, error: errMsg });
    console.error(`❌ [FALHA] ${suite.name}`);
    console.error(errMsg);
  }
}

console.log('\n========================================================================');
console.log(`🏁 RESUMO DA REGRESSÃO GERAL (9.6.1 a 9.6.8-B):`);
console.log(`   Suites Aprovadas: ${passedCount}/${testSuites.length}`);
console.log(`   Suites Falhadas:  ${failedCount}/${testSuites.length}`);
if (failedSuites.length > 0) {
  console.log('\n❌ SUITES QUE FALHARAM:');
  failedSuites.forEach(f => console.log(`   - ${f.name} (${f.file})`));
}
console.log('========================================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('🎉 FASE 9.6.8-B CERTIFICADA COM SUCESSO! 100% DAS SUITES HOMOLOGADAS!');
  process.exit(0);
}
