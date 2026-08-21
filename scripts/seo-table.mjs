#!/usr/bin/env node
/**
 * Поисковый слой одним взглядом: URL → title (длина) → description (длина)
 * → h1 → типы JSON-LD. Читает собранный dist, ничего не меняет.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = resolve(process.argv[2] ?? join(ROOT, 'dist'));

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = htmlFiles(DIST).sort();
const rows = [];

for (const file of files) {
  const root = parse(readFileSync(file, 'utf8'), { comment: false });
  const url = `/${relative(DIST, file).replace(/index\.html$/, '').split(sep).join('/')}`;

  const types = new Set();
  for (const block of root.querySelectorAll('script[type="application/ld+json"]')) {
    let data;
    try {
      data = JSON.parse(block.text);
    } catch {
      types.add('НЕВАЛИДНЫЙ JSON');
      continue;
    }
    const nodes = Array.isArray(data['@graph']) ? data['@graph'] : [data];
    for (const n of nodes) {
      const t = n?.['@type'];
      for (const one of Array.isArray(t) ? t : [t]) if (one) types.add(one);
    }
  }

  rows.push({
    url,
    title: root.querySelector('title')?.text?.trim() ?? '',
    description: root.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    h1: root.querySelector('h1')?.text?.replace(/\s+/g, ' ').trim() ?? '',
    types: [...types].join(' + '),
  });
}

const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].length));

const W = { url: 42, title: 52, desc: 5, h1: 44, types: 46 };

console.log('');
console.log(
  '  ' +
    pad('URL', W.url) +
    pad('TITLE', W.title) +
    pad('LEN', 5) +
    pad('DESC', 6) +
    pad('H1', W.h1) +
    'JSON-LD',
);
console.log('  ' + '─'.repeat(W.url + W.title + 5 + 6 + W.h1 + W.types));

let problems = 0;
for (const r of rows) {
  const tl = [...r.title].length;
  const dl = [...r.description].length;
  const titleFlag = tl > 60 ? '!' : ' ';
  const descFlag = dl < 140 || dl > 160 ? '!' : ' ';
  if (titleFlag === '!' || descFlag === '!') problems += 1;

  console.log(
    '  ' +
      pad(clip(r.url, W.url - 2), W.url) +
      pad(clip(r.title, W.title - 2), W.title) +
      pad(`${tl}${titleFlag}`, 5) +
      pad(`${dl}${descFlag}`, 6) +
      pad(clip(r.h1, W.h1 - 2), W.h1) +
      r.types,
  );
}

console.log('');
console.log(`  Страниц: ${rows.length}. Пороги: title ≤ 60, description 140–160.`);
console.log(`  Отмечено «!»: ${problems}.`);
console.log('');
