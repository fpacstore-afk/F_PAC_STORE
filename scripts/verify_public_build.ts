import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';
import { privateEnvironmentValues } from './clientCredentialSafety.ts';

/** Inspect only the deployable frontend; never print matching content or credentials. */
export function inspectPublicBuild(root: string, environment = process.env): string[] {
  const failures: string[] = [];
  const privateValues = privateEnvironmentValues(environment);
  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (entry.isSymbolicLink()) { failures.push(`${relative}: symbolic link`); continue; }
      if (/^\.(?:env(?:\..*)?|git|svn|hg)$/i.test(entry.name) || /\.(?:cjs|map|pem|key|ts|tsx|jsx|sql|sqlite|db|bak)$/i.test(entry.name) ||
          (entry.isDirectory() && /^(?:build-server|node_modules|server|scripts)$/i.test(entry.name))) {
        failures.push(`${relative}: private artifact`); continue;
      }
      if (entry.isDirectory()) { walk(absolute); continue; }
      if (!entry.isFile() || !/\.(?:js|mjs|html|json|txt|svg|css|xml|md)$/i.test(entry.name)) continue;
      const content = readFileSync(absolute, 'utf8');
      if (/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/.test(content) ||
          /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{70,}|(?:AKIA|ASIA)[A-Z0-9]{16}|sk-(?:proj-|svcacct-|ant-)?[A-Za-z0-9_-]{32,})\b/.test(content) ||
          privateValues.some(value => content.includes(value))) {
        failures.push(`${relative}: credential signature`);
      }
    }
  }
  walk(root);
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const failures = inspectPublicBuild(path.resolve('dist'), loadEnv('production', process.cwd(), ''));
  if (failures.length) {
    console.error('Public build rejected:\n' + failures.join('\n'));
    process.exitCode = 1;
  } else console.log('PASS public build contains no backend artifacts, source maps or recognized private credential signatures.');
}
