import type { Request, Response } from 'express';
import sharp from 'sharp';
import { CATALOG_IMAGE_FOLDER, CATALOG_IMAGE_WIDTHS, isCatalogImageName } from '../../shared/catalogImageSizes.js';
import { getStorageBucket } from '../firebase.js';

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const CACHE_BYTES = 12 * 1024 * 1024;
const active = new Map<string, Promise<Buffer>>();
const cached = new Map<string, Buffer>();
const waiters: Array<() => void> = [];
let running = 0;
let cachedBytes = 0;

async function convertCatalogImage(name: string, width: number) {
  const input = getStorageBucket().file(CATALOG_IMAGE_FOLDER + name).createReadStream();
  const timeout = setTimeout(() => input.destroy(new Error('Catalog image read timed out')), 12_000);
  try {
    const chunks: Buffer[] = [];
    let byteLength = 0;
    for await (const chunk of input) {
      byteLength += chunk.length;
      if (byteLength > MAX_SOURCE_BYTES) throw new Error('Catalog image exceeds byte limit');
      chunks.push(chunk);
    }
    const image = sharp(Buffer.concat(chunks), { limitInputPixels: 24_000_000, failOn: 'warning' });
    const { format, pages } = await image.metadata();
    if (!['png', 'jpeg', 'webp'].includes(format || '') || (pages ?? 1) > 1) throw new Error('Unsupported catalog image');
    return await image.rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  } finally {
    clearTimeout(timeout);
    input.destroy();
  }
}

async function resizeCatalogImage(name: string, width: number) {
  if (running >= 2) await new Promise<void>(resolve => waiters.push(resolve));
  else running++;
  try {
    return await convertCatalogImage(name, width);
  } finally {
    const next = waiters.shift();
    if (next) next();
    else running--;
  }
}

export async function serveCatalogImage(req: Request, res: Response) {
  const name = String(req.params.name);
  const width = CATALOG_IMAGE_WIDTHS.find(candidate => String(candidate) === req.params.width);
  res.setHeader('Cache-Control', 'no-store');
  if (!width || !isCatalogImageName(name) || Object.keys(req.query).length) return res.sendStatus(404);
  const key = `${width}/${name}`;
  let image = cached.get(key);

  try {
    if (!image) {
      let pending = active.get(key);
      if (!pending) {
        if (active.size >= 20) return res.sendStatus(503);
        pending = resizeCatalogImage(name, width).then(buffer => {
          if (buffer.length <= CACHE_BYTES) {
            for (const [oldKey, oldImage] of cached) {
              if (cachedBytes + buffer.length <= CACHE_BYTES) break;
              cached.delete(oldKey);
              cachedBytes -= oldImage.length;
            }
            cached.set(key, buffer);
            cachedBytes += buffer.length;
          }
          return buffer;
        }).finally(() => active.delete(key));
        active.set(key, pending);
      }
      image = await pending;
    }
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.type('image/webp').send(image);
  } catch {
    // A missing or unsupported original falls back to the catalog's original URL.
    res.sendStatus(404);
  }
}
