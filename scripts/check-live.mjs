#!/usr/bin/env node
/**
 * Проверка боевого сайта после выкладки. Ходит по реальному домену и сверяет,
 * что там лежит именно то, что собрано локально.
 *
 * Запуск: npm run live
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import { business } from '../src/data/business.ts';
import { PRODUCTION_SITE_ORIGIN } from '../src/data/site.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const ORIGIN = PRODUCTION_SITE_ORIGIN;

const errors = [];
const notes = [];
let checks = 0;

function expect(cond, name, detail) {
  checks += 1;
  if (!cond) errors.push({ name, detail });
  return cond;
}

function localPages() {
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d)) {
      const f = join(d, e);
      if (statSync(f).isDirectory()) walk(f);
      else if (e.endsWith('.html')) out.push(f);
    }
  })(DIST);
  return out
    .filter((f) => f !== join(DIST, '404.html'))
    .map((f) => `/${relative(DIST, f).replace(/index\.html$/, '').split(sep).join('/')}`)
    .sort();
}

const get = async (url, opts = {}) => {
  const r = await fetch(url, { redirect: 'manual', ...opts });
  return { status: r.status, headers: r.headers, body: r.ok ? await r.text() : '' };
};

console.log(`\nПроверка боевого сайта: ${ORIGIN}\n`);

/* ── 1. Страницы ────────────────────────────────────────────────────── */
const pages = localPages();
for (const path of pages) {
  const url = `${ORIGIN}${path}`;
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    expect(false, `${path} — доступна`, e.message);
    continue;
  }
  if (!expect(res.status === 200, `${path} — код 200`, `получено ${res.status}`)) continue;

  const html = await res.text();
  const root = parse(html, { comment: false });

  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
  expect(
    canonical === `${ORIGIN}${path}`,
    `${path} — canonical`,
    `«${canonical}» вместо «${ORIGIN}${path}»`,
  );

  expect(!html.includes('localhost'), `${path} — без localhost`, 'в разметке остался localhost');

  const tel = root.querySelector('a[href^="tel:"]')?.getAttribute('href');
  expect(tel === `tel:${business.phone.raw}`, `${path} — телефон`, `href «${tel}»`);

  // то же ли это, что собрано локально
  const localFile = join(DIST, path === '/' ? 'index.html' : `${path.slice(1)}index.html`);
  try {
    const localTitle = parse(readFileSync(localFile, 'utf8')).querySelector('title')?.text;
    const liveTitle = root.querySelector('title')?.text;
    expect(
      localTitle === liveTitle,
      `${path} — совпадает с локальной сборкой`,
      `на сайте «${liveTitle}», локально «${localTitle}»`,
    );
  } catch {
    notes.push(`${path}: нет локального файла для сверки`);
  }
}

/* ── 2. Служебное ───────────────────────────────────────────────────── */
const robots = await get(`${ORIGIN}/robots.txt`);
expect(robots.status === 200, 'robots.txt — код 200', `получено ${robots.status}`);
expect(
  robots.body.includes(`Sitemap: ${ORIGIN}/sitemap-index.xml`),
  'robots.txt — ссылка на sitemap',
  robots.body.trim().replace(/\n/g, ' | '),
);

const sitemapIndex = await get(`${ORIGIN}/sitemap-index.xml`);
expect(sitemapIndex.status === 200, 'sitemap-index.xml — код 200', `получено ${sitemapIndex.status}`);

const sitemap = await get(`${ORIGIN}/sitemap-0.xml`);
const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
expect(
  locs.length === pages.length,
  'sitemap — все страницы',
  `в карте ${locs.length}, страниц ${pages.length}`,
);
for (const loc of locs) {
  const r = await fetch(loc, { method: 'HEAD' });
  expect(r.status === 200, `sitemap → ${new URL(loc).pathname} живая`, `код ${r.status}`);
}

/* ── 3. Редиректы и безопасность ────────────────────────────────────── */
const http = await get(`http://masterravshan.uz/`);
expect(
  [301, 302, 307, 308].includes(http.status),
  'http → https редирект',
  `получено ${http.status}`,
);

const www = await get(`https://www.masterravshan.uz/`);
if ([301, 302, 307, 308].includes(www.status)) {
  const to = www.headers.get('location') ?? '';
  expect(to.startsWith(ORIGIN), 'www → основной домен', `редирект на «${to}»`);
} else if (www.status === 200) {
  errors.push({
    name: 'www — дубль сайта',
    detail: 'www отдаёт 200 вместо редиректа: для поиска это второй сайт с тем же содержимым',
  });
  checks += 1;
} else {
  notes.push(`www.masterravshan.uz отдаёт ${www.status} — поддомен не настроен, дубля нет`);
}

/* ── 4. 404 ─────────────────────────────────────────────────────────── */
const notFound = await get(`${ORIGIN}/takoy-stranicy-net-12345/`);
expect(notFound.status === 404, '404 — правильный код', `получено ${notFound.status}`);

/* ── 5. OG-картинка ─────────────────────────────────────────────────── */
const og = await fetch(`${ORIGIN}/og.png`);
expect(og.status === 200, 'og.png — доступна', `код ${og.status}`);
expect(
  (og.headers.get('content-type') ?? '').includes('image/png'),
  'og.png — тип image/png',
  og.headers.get('content-type') ?? 'нет заголовка',
);

/* ── 6. Шрифты и заголовки ──────────────────────────────────────────── */
for (const f of ['golos-text-400', 'golos-text-700', 'martian-mono-500']) {
  const r = await fetch(`${ORIGIN}/fonts/${f}.woff2`);
  expect(r.status === 200, `шрифт ${f}.woff2`, `код ${r.status}`);
}

const home = await fetch(`${ORIGIN}/`);
const enc = home.headers.get('content-encoding') ?? '';
notes.push(`Сжатие главной: ${enc || 'нет'}; сервер: ${home.headers.get('server') ?? '—'}`);
notes.push(`HSTS: ${home.headers.get('strict-transport-security') ?? 'не выставлен'}`);

/* ── Вывод ──────────────────────────────────────────────────────────── */
if (errors.length > 0) {
  console.log('  Проблемы:\n');
  for (const e of errors) console.log(`  ✗ ${e.name}\n      ${e.detail}`);
  console.log('');
}
if (notes.length > 0) {
  console.log('  К сведению:');
  for (const n of notes) console.log(`    ~ ${n}`);
  console.log('');
}
console.log(`  Страниц: ${pages.length}. Проверок: ${checks}. Ошибок: ${errors.length}.\n`);
process.exit(errors.length > 0 ? 1 : 0);
