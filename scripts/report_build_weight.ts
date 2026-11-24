import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = 'dist/assets';
const files = readdirSync(root).filter(name => /\.(js|css)$/.test(name)).map(name => {
  const bytes = readFileSync(join(root, name));
  return { name, rawKiB: Math.round(bytes.length / 1024), gzipKiB: Math.round(gzipSync(bytes).length / 1024) };
}).sort((a, b) => b.gzipKiB - a.gzipKiB);
const total = files.reduce((n, file) => n + file.gzipKiB, 0);
console.log('Build local: maiores arquivos JS/CSS (KiB; gzip é estimativa, não transferência real)');
console.table(files.slice(0, 12));
console.log(`${files.length} arquivos JS/CSS; soma gzip aproximada ${total} KiB se todos forem carregados. Rotas usam apenas uma parte desse total.`);
