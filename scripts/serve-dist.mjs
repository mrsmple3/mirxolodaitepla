/**
 * Минимальный статический сервер по dist — общий для проверок links и lh.
 *
 * Поднимается на том же origin, для которого собран сайт (src/data/site.ts),
 * поэтому canonical, og:url и JSON-LD url на локальной проверке разрешаются
 * в реальные адреса, а не в «битые ссылки».
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  const target = join(DIST, clean);
  if (!target.startsWith(DIST)) return null;
  if (existsSync(target) && statSync(target).isDirectory()) {
    const index = join(target, 'index.html');
    return existsSync(index) ? index : null;
  }
  if (existsSync(target) && statSync(target).isFile()) return target;
  // trailingSlash: 'always' — /path тоже отдаём как /path/index.html
  const asDir = join(target, 'index.html');
  return existsSync(asDir) ? asDir : null;
}

export function serveDist(port) {
  const server = createServer((req, res) => {
    const file = resolveFile(req.url ?? '/');
    if (!file) {
      const notFound = join(DIST, '404.html');
      const has404 = existsSync(notFound);
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      if (has404) createReadStream(notFound).pipe(res);
      else res.end('404');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(res);
  });

  return new Promise((ok, err) => {
    server.once('error', err);
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}

export const closeServer = (server) =>
  new Promise((ok) => {
    server.closeAllConnections?.();
    server.close(() => ok());
  });
