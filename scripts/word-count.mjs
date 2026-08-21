#!/usr/bin/env node
/**
 * Объём уникального смысла на странице (SPEC §4: страница существует, только
 * если у неё ≥300 слов собственного содержания). Шапка, подвал, крошки и
 * полоса вызова из подсчёта исключены — они одинаковы везде.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = resolve(process.argv[2] ?? join(ROOT, 'dist'));

function files(d) {
  const o = [];
  for (const e of readdirSync(d)) {
    const f = join(d, e);
    if (statSync(f).isDirectory()) o.push(...files(f));
    else if (e.endsWith('.html')) o.push(f);
  }
  return o;
}

let thin = 0;
console.log('\n  Уникального текста на страницу (без шапки, подвала и крошек)\n');

for (const f of files(DIST).sort()) {
  const r = parse(readFileSync(f, 'utf8'), { comment: false });
  for (const el of r.querySelectorAll('script, style, template, noscript, header, footer, .call-bar, .crumbs')) {
    el.remove();
  }
  const words = r.text
    .replace(/ /g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\d]/u.test(w)).length;

  const url = `/${relative(DIST, f).replace(/index\.html$/, '').split(sep).join('/')}`;
  const is404 = url.endsWith('404.html');
  const ok = words >= 300 || is404;
  if (!ok) thin += 1;
  console.log(`  ${String(words).padStart(5)}  ${ok ? '✓' : '✗'}  ${url}${is404 ? '  (404 — порог не применяется)' : ''}`);
}

console.log(`\n  Страниц ниже порога 300 слов: ${thin}.\n`);
process.exit(thin > 0 ? 1 : 0);
