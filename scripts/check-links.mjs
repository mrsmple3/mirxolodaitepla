#!/usr/bin/env node
/**
 * 0 битых ссылок в dist (SPEC §8).
 *
 * dist поднимается на том же origin, для которого собран сайт, — иначе
 * canonical и og:url выглядят как битые ссылки на чужой домен.
 * Если сборка сделана под реальный домен, ссылки на него не проверяются:
 * до запуска его ещё нет.
 */
import { LinkChecker } from 'linkinator';
import { SITE_ORIGIN, SITE_ORIGIN_IS_LOCAL } from '../src/data/site.ts';
import { closeServer, serveDist } from './serve-dist.mjs';

const origin = new URL(SITE_ORIGIN);
const localPort = SITE_ORIGIN_IS_LOCAL ? Number(origin.port || 80) : 4321;
const localOrigin = SITE_ORIGIN_IS_LOCAL ? SITE_ORIGIN : `http://localhost:${localPort}`;

let server;
try {
  server = await serveDist(localPort);
} catch (e) {
  console.error(`\n  ✗ Не удалось поднять dist на порту ${localPort}: ${e.message}\n`);
  process.exit(1);
}

console.log(`\nПроверка ссылок: ${localOrigin}\n`);

const checker = new LinkChecker();
const skips = SITE_ORIGIN_IS_LOCAL ? [] : [`^${SITE_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`];

// Отдельными точками входа: sitemap (проверит, что все его URL живые) и robots.txt.
const seeds = [`${localOrigin}/`, `${localOrigin}/sitemap-index.xml`, `${localOrigin}/robots.txt`];

const result = await checker.check({
  path: seeds,
  recurse: true,
  timeout: 15000,
  concurrency: 10,
  linksToSkip: skips,
});

await closeServer(server);

const broken = result.links.filter((l) => l.state === 'BROKEN');
const scanned = result.links.filter((l) => l.state !== 'SKIPPED');
const skipped = result.links.filter((l) => l.state === 'SKIPPED');

for (const link of broken) {
  console.log(`  ✗ ${link.status ?? '—'}  ${link.url}`);
  console.log(`      со страницы ${link.parent}`);
}

if (skipped.length > 0) {
  console.log(`  Пропущено ссылок: ${skipped.length} (tel:, mailto: и внешние по правилам выше)`);
}

console.log(
  `\n  Проверено ссылок: ${scanned.length}. Битых: ${broken.length}.\n`,
);

process.exit(broken.length > 0 ? 1 : 0);
