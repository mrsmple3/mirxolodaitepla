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

/**
 * Сборка .ico из готовых PNG.
 *
 * Формат ICO с 2003 года разрешает класть внутрь целый PNG вместо BMP, и все
 * живые браузеры это читают. Поэтому кодировщик тут — заголовок плюс таблица
 * записей: ни библиотеки, ни зависимости ради шести файлов не нужно.
 *
 * Зачем вообще .ico, когда в <head> объявлены и SVG, и PNG: за `/favicon.ico`
 * ходят по умолчанию, не читая разметку, — часть краулеров, читалок и старых
 * клиентов. Без файла они получали 404, а на этом сайте 404 отдаёт целую
 * страницу в 37 КБ. Теперь получают иконку.
 */
function icoFromPngs(images) {
  const HEADER = 6;
  const ENTRY = 16;
  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = HEADER + ENTRY * images.length;
  const entries = [];
  for (const { size, data } of images) {
    const e = Buffer.alloc(ENTRY);
    // 256 пишется нулём — в один байт оно не влезает. У нас максимум 48.
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // палитра не используется
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // цветовых плоскостей
    e.writeUInt16LE(32, 6); // бит на пиксель
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

// ── Векторная иконка: её берут все современные браузеры ────────────────
writeFileSync(
  out('favicon.svg'),
  '<!-- Собрано scripts/make-brand.mjs из scripts/brand/marks.mjs. Правки — там. -->\n' +
    markSvg({ accent }) +
    '\n',
);
record('favicon.svg');

// ── Растровые запасные ────────────────────────────────────────────────
/*
 * Отдельного файла на 48 px нет намеренно: 48 лежит внутри favicon.ico,
 * а для поиска Google просит квадрат со стороной, кратной 48, — эту роль
 * играет icon-192.png, на него и ссылается <head>. 32 и 180 под правило
 * не подходят и в поиск не предлагаются.
 */
await icon(180, true);
record('apple-touch-icon.png');

await icon(192);
record('icon-192.png');

await icon(512);
record('icon-512.png');

// ── favicon.ico: за ним ходят по умолчанию, не читая <head> ────────────
writeFileSync(
  out('favicon.ico'),
  icoFromPngs(
    await Promise.all(
      [16, 32, 48].map(async (size) => ({
        size,
        data: await sharp(Buffer.from(markSvg({ accent, size })))
          .resize(size, size)
          .flatten({ background: palette.dial })
          .png({ compressionLevel: 9, effort: 10 })
          .toBuffer(),
      })),
    ),
  ),
);
record('favicon.ico');

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
