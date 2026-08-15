process.env.NODE_ENV = 'test';
import { runIntegrityTestSuite } from './server/tests/integrity.test.ts';
import fs from 'fs';

async function main() {
  console.log('Starting test execution...');
  const suite = await runIntegrityTestSuite();
  
  // Categorization
  const categories: Record<string, number> = {
    UNIT: 0,
    CONTROLLER: 0,
    INTEGRATION: 0,
    SECURITY: 0,
    CONCURRENCY: 0,
    MOCKED_EXTERNAL_PROVIDER: 0,
    REGRESSION: 0
  };

  suite.results.forEach(r => {
    const name = r.testName.toLowerCase();
    if (name.includes('estresse') || name.includes('concorrentes') || name.includes('concorrente')) {
      categories.CONCURRENCY++;
    } else if (name.includes('controller') || name.includes('http') || name.includes('real controller')) {
      categories.CONTROLLER++;
    } else if (name.includes('hmac') || name.includes('segurança') || name.includes('token') || name.includes('autenticação') || name.includes('privacidade') || name.includes('whitelist') || name.includes('rules')) {
      categories.SECURITY++;
    } else if (name.includes('melhor envio') || name.includes('etiqueta') || name.includes('reconciliação') || name.includes('webhook')) {
      categories.MOCKED_EXTERNAL_PROVIDER++;
    } else if (name.includes('fase 6') || name.includes('fase 7') || name.includes('estoque') || name.includes('pricing') || name.includes('modelo de estoque')) {
      categories.REGRESSION++;
    } else if (name.includes('transição') || name.includes('state machine') || name.includes('eligibility') || name.includes('bloqueio')) {
      categories.UNIT++;
    } else {
      categories.INTEGRATION++;
    }
  });

  const outputData = {
    timestamp: suite.timestamp,
    totalTests: suite.totalTests,
    passedCount: suite.passedCount,
    failedCount: suite.failedCount,
    categories,
    failures: suite.results.filter(r => !r.passed)
  };

  fs.writeFileSync('test_output.json', JSON.stringify(outputData, null, 2));
  console.log('Wrote output to test_output.json successfully!');
  process.exit(0);
}

main().catch(err => {
  fs.writeFileSync('test_output.json', JSON.stringify({ error: err.message || String(err) }, null, 2));
  console.error('Error running test suite:', err);
  process.exit(1);
});
