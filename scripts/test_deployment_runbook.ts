import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/deploy-cloud-run.yml', 'utf8');
const runbook = readFileSync('DEPLOYMENT_RUNBOOK.md', 'utf8');

for (const value of ['f-pac-store-n-o-s-roupa-identidade', 'us-east1', 'fpac-store62']) {
  assert.match(workflow, new RegExp(value), `workflow must declare ${value}`);
  assert.match(runbook, new RegExp(value), `runbook must match the production workflow: ${value}`);
}
assert.doesNotMatch(runbook, /ais-pre-5qzcpkpneat5vzmwyn7iab|us-west2/, 'runbook must not point recovery work at the retired service');
assert.match(runbook, /--no-traffic/, 'manual recovery must keep a candidate isolated before promotion');
assert.match(runbook, /deploy-cloud-run\.yml/, 'the automated workflow must remain the documented source of truth');
assert.match(workflow, /Aguardando a revisão candidata concluir após o prazo do gcloud/, 'workflow must tolerate delayed candidate readiness before failing');
assert.match(workflow, /gcloud run revisions describe/, 'workflow must check the candidate Ready condition after a delayed deploy');
assert.match(workflow, /--quiet \|\| DEPLOY_STATUS=\$\?/, 'workflow must capture a gcloud readiness deadline without aborting the shell');

console.log('Deployment runbook matches the production workflow.');
