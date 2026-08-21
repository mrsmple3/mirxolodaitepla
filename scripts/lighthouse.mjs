#!/usr/bin/env node
/**
 * Lighthouse mobile по собранному dist. Пороги — CLAUDE.md / SPEC §8.
 *
 * Прогоняет каждую HTML-страницу из dist (кроме 404), печатает таблицу
 * и валит сборку, если хоть один порог не взят.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

import { closeServer, serveDist } from './serve-dist.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const PORT = 4321;

const THRESHOLDS = {
  performance: { min: 95, label: 'Performance' },
  accessibility: { min: 95, label: 'Accessibility' },
  'best-practices': { min: 95, label: 'Best Practices' },
  seo: { min: 100, label: 'SEO' },
};

const METRICS = {
  'largest-contentful-paint': { max: 2000, label: 'LCP', unit: 'ms' },
  'cumulative-layout-shift': { max: 0.05, label: 'CLS', unit: '' },
};

/** Собирает абсолютные пути к html. Преобразование в URL — отдельно: если делать
 *  его здесь, на каждом уровне рекурсии relative() применяется повторно. */
function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

function pages() {
  return htmlFiles(DIST)
    .filter((f) => f !== join(DIST, '404.html'))
    .map((f) => `/${relative(DIST, f).replace(/index\.html$/, '').split(sep).join('/')}`)
    .sort();
}

const urls = pages();
if (urls.length === 0) {
  console.error('\n  ✗ В dist нет ни одной страницы — сначала npm run build\n');
  process.exit(1);
}

const server = await serveDist(PORT);
const chrome = await chromeLauncher.launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
});

const rows = [];
const problems = [];

try {
  for (const path of urls) {
    const url = `http://localhost:${PORT}${path}`;
    const run = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      // Пресет по умолчанию — mobile: эмуляция Moto G Power и 4G-троттлинг.
      screenEmulation: { mobile: true, width: 412, height: 823, deviceScaleFactor: 1.75 },
      formFactor: 'mobile',
    });

    const lhr = run?.lhr;
    if (!lhr) {
      problems.push(`${path}: Lighthouse не вернул отчёт`);
      continue;
    }

    const row = { path };

    for (const [key, { min, label }] of Object.entries(THRESHOLDS)) {
      const score = Math.round((lhr.categories[key]?.score ?? 0) * 100);
      row[label] = score;
      if (score < min) problems.push(`${path}: ${label} ${score} < ${min}`);
    }

    for (const [key, { max, label, unit }] of Object.entries(METRICS)) {
      const value = lhr.audits[key]?.numericValue ?? Number.POSITIVE_INFINITY;
      row[label] = unit === 'ms' ? `${Math.round(value)} ms` : value.toFixed(3);
      if (value > max) {
        problems.push(`${path}: ${label} ${row[label]} > ${unit === 'ms' ? `${max} ms` : max}`);
      }
    }

    rows.push(row);
  }
} finally {
  chrome.kill();
  await closeServer(server);
}

console.log('\nLighthouse (mobile)\n');
console.table(rows);

console.log(
  '  Пороги: Performance ≥ 95, SEO = 100, Accessibility ≥ 95, Best Practices ≥ 95, ' +
    'LCP < 2000 ms, CLS < 0.05\n',
);

if (problems.length > 0) {
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log('');
  process.exit(1);
}

console.log(`  ✓ Все пороги взяты на ${rows.length} стр.\n`);
