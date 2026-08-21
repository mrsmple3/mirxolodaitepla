/**
 * Знак, фавиконки, манифест и og.png — из одного исходника.
 *
 * Рисунок знака живёт в scripts/brand/marks.mjs, карточка — в scripts/brand/og.mjs,
 * данные (телефон, имя, город, часы, сезон) — в src/data/business.ts. Здесь только
 * растеризация: SVG → PNG через sharp.
 *
 * Шаг сборки, а не ручная операция: `npm run build` зовёт этот скрипт сам
 * (prebuild), поэтому картинки не могут разойтись с данными. Отдельно —
 * `npm run brand`.
 *
 * Цвет знака ставит сезон из business.ts: летом синий порт, зимой красный.
 * Синий и красный вместе не встречаются нигде, включая иконку (SPEC §11.4).
 */

import { writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { business } from '../src/data/business.ts';
import { markSvg, palette, MARK } from './brand/marks.mjs';
import { ogSvg } from './brand/og.mjs';

const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));

const accent = business.season === 'winter' ? palette.high : palette.low;

/** Растр знака. bleed — квадрат без скругления: iOS и лаунчеры режут сами. */
const icon = (size, bleed = false) =>
  sharp(Buffer.from(markSvg({ accent, size, bleed })))
    .flatten({ background: palette.dial })
    .png({ compressionLevel: 9, palette: true, effort: 10 })
    .toFile(out(bleed ? 'apple-touch-icon.png' : `icon-${size}.png`));

const written = [];
const record = (name) => written.push([name, statSync(out(name)).size]);

// ── Векторная иконка: её берут все современные браузеры ────────────────
writeFileSync(
  out('favicon.svg'),
  '<!-- Собрано scripts/make-brand.mjs из scripts/brand/marks.mjs. Правки — там. -->\n' +
    markSvg({ accent }) +
    '\n',
);
record('favicon.svg');

// ── Растровые запасные ────────────────────────────────────────────────
await sharp(Buffer.from(markSvg({ accent, size: 32 })))
  .flatten({ background: palette.dial })
  .png({ compressionLevel: 9, palette: true, effort: 10 })
  .toFile(out('favicon-32.png'));
record('favicon-32.png');

await icon(180, true);
record('apple-touch-icon.png');

await icon(192);
record('icon-192.png');

await icon(512);
record('icon-512.png');

// ── Манифест ──────────────────────────────────────────────────────────
const manifest = {
  // short_name нет намеренно: сокращать «Мир холода и тепла» не во что,
  // а придумывать новое имя бренду в манифесте — не дело манифеста.
  name: business.name,
  lang: 'ru',
  start_url: '/',
  id: '/',
  // Не приложение: сайту нужен звонок, а не установка на домашний экран.
  display: 'browser',
  background_color: palette.dial,
  theme_color: '#FFFFFF',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
};
writeFileSync(out('site.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
record('site.webmanifest');

// ── OG-карточка ───────────────────────────────────────────────────────
await sharp(Buffer.from(ogSvg({ accent })))
  .png({ compressionLevel: 9, palette: true, effort: 10 })
  .toFile(out('og.png'));
record('og.png');

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} КБ`;
console.log(`  знак «${MARK}», сезон ${business.season}, акцент ${accent}`);
for (const [name, size] of written) console.log(`  public/${name.padEnd(22)} ${kb(size).padStart(9)}`);

// Предел Telegram и Facebook для превью — единицы мегабайт, но карточка,
// которая тянется дольше страницы, не показывается вовсе. Держим 300 КБ.
const ogSize = written.find(([n]) => n === 'og.png')[1];
if (ogSize > 300 * 1024) {
  throw new Error(`[brand] og.png весит ${kb(ogSize)} — больше 300 КБ. Упрощайте карточку.`);
}
