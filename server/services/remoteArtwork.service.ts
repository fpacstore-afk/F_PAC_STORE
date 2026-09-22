import https from 'node:https';
import dns from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { MAX_ART_BYTES } from './artwork.service.js';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(address, prefix, 'ipv4');
export const publicArtworkAddress = (address: string) => isIP(address) === 4 && !blocked.check(address, 'ipv4');
export function remoteArtworkUrl(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > 2048) throw new Error('Informe um link HTTPS direto para a imagem.');
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hostname.includes(':') || (isIP(url.hostname) && !publicArtworkAddress(url.hostname))) throw new Error('Use um link público HTTPS direto para a imagem.');
  return url;
}

const network = { lookup: dns.lookup, get: https.get };
export async function fetchRemoteArtwork(raw: string, redirects = 0, signal = AbortSignal.timeout(15_000), transport = network): Promise<Buffer> {
  const url = remoteArtworkUrl(raw);
  if (redirects > 3 || signal.aborted) throw new Error('Não foi possível importar esse link. Envie a imagem do dispositivo.');
  const addresses = await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
    const abort = () => reject(new Error('Tempo limite ao consultar o endereço da imagem.'));
    signal.addEventListener('abort', abort, { once: true });
    void transport.lookup(url.hostname, { family: 4, all: true }).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
  if (signal.aborted) throw new Error('Tempo limite ao importar a imagem.');
  if (!addresses.length || addresses.some(item => !publicArtworkAddress(item.address))) throw new Error('O endereço da imagem não é permitido.');
  // Pin the validated DNS address. Each redirect is separately resolved/validated;
  // requests never carry user cookies, credentials or authorization headers.
  return new Promise((resolve, reject) => {
    const req = transport.get(url, { signal, family: 4, lookup: (_hostname, options: any, callback: any) => options.all ? callback(null, [{ address: addresses[0].address, family: 4 }]) : callback(null, addresses[0].address, 4), headers: { Accept: 'image/png,image/jpeg,image/webp' } }, response => {
      if ([301,302,303,307,308].includes(response.statusCode || 0) && response.headers.location) {
        response.resume();
        try { void fetchRemoteArtwork(new URL(response.headers.location, url).href, redirects + 1, signal, transport).then(resolve, reject); }
        catch (error) { reject(error); } return;
      }
      if (response.statusCode !== 200 || Number(response.headers['content-length'] || 0) > MAX_ART_BYTES) { response.destroy(); reject(new Error('Não foi possível baixar essa imagem. Envie o arquivo do dispositivo.')); return; }
      let bytes = 0; const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_ART_BYTES) { response.destroy(); reject(new Error('A imagem deve ter até 10 MB.')); }
        else chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    req.on('error', reject);
  });
}
