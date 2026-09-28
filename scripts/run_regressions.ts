import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// One source of truth for PR validation and production deployment.
const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
for (const name of Object.keys(scripts).filter(key => key.startsWith('test:') && key !== 'test:all')) {
  console.log(`\nRunning ${name}`);
  const invocation = String(scripts[name]).replace(/^(?:NODE_ENV|USE_MOCK_DB|K_SERVICE)=\S+\s+/, '').trim();
  const [declaredCommand, ...declaredArgs] = invocation.split(/\s+/);
  const command = declaredCommand === 'node' ? process.execPath : declaredCommand;
  const args = declaredArgs;
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', USE_MOCK_DB: 'true', K_SERVICE: '' } });
  if (result.status !== 0) process.exit(result.status || 1);
}
