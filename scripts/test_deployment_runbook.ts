import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isFirestoreQuotaExhausted } from '../server/utils/firestoreQuota.ts';

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
assert.match(workflow, /--fail-with-body/, 'catalog check must keep the 503 response body for classification');
assert.match(workflow, /CATALOG_QUOTA_EXHAUSTED/, 'a known Firestore quota exhaustion must not block an otherwise healthy deploy');
assert.match(workflow, /previous_revision=/, 'workflow must record the currently serving revision before promotion');
assert.match(workflow, /Restore prior Cloud Run revision after a post-deploy failure/, 'workflow must roll back production traffic after failed post-deploy checks');
assert.match(workflow, /to-revisions="\\$\{PREVIOUS_REVISION\}=100"/, 'rollback must route all traffic back to the prior revision');
const catalogCheck = workflow.split('- name: Firestore catalog check candidate')[1]?.split('- name: Promote validated revision')[0] || '';
assert.match(catalogCheck, /for attempt in 1 2 3 4 5 6/, 'catalog retries must be separate requests');
assert.doesNotMatch(catalogCheck, /--retry\b/, 'curl retries would append multiple JSON responses to the catalog file');
assert.match(catalogCheck, /api\/products" > candidate-catalog\.json/, 'each attempt must replace the prior response body');
assert.equal(isFirestoreQuotaExhausted({ code: 8, message: 'Free daily read units exhausted' }), true);
assert.equal(isFirestoreQuotaExhausted({ code: 'RESOURCE_EXHAUSTED' }), true);
assert.equal(isFirestoreQuotaExhausted({ code: 7, message: 'Permission denied' }), false);
assert.equal(isFirestoreQuotaExhausted({ code: 14, message: 'Service unavailable' }), false);

console.log('Deployment runbook matches the production workflow.');
