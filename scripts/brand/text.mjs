/**
 * Текст → контуры. Из тех же .woff2, что отдаёт сайт.
 *
 * Зачем не `<text>`: SVG-текст рисует librsvg внутри sharp, а гарнитуру он ищет
 * через системный набор шрифтов. Golos Text в системе не установлен, и на macOS
 * подсунуть свой файл через fontconfig не выходит — картинка молча собирается
 * Helvetica. Проверено. Контуры снимают вопрос совсем: og.png собирается
 * одинаково на любой машине и на сборщике Cloudflare, шрифты при отрисовке
 * не нужны вообще.
 *
 * Кернинга (GPOS) здесь нет: fontkitten даёт отображение символ → глиф без
 * шейпинга. Для плаката из пяти строк разница невидима.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { create } from 'fontkitten';

const font = (file) => {
  const path = fileURLToPath(new URL(`../../public/fonts/${file}`, import.meta.url));
  return create(readFileSync(path));
};

/** Те же файлы, что грузит браузер: og.png и сайт набраны одним и тем же. */
export const faces = {
  golos400: font('golos-text-400.woff2'),
  golos700: font('golos-text-700.woff2'),
  martian500: font('martian-mono-500.woff2'),
};

/**
 * Ширина строки в пикселях. Нужна, чтобы выравнивать блоки и упирать
 * подложки в реальный текст, а не в глазок.
 */
export function measure(string, { face, size, tracking = 0 }) {
  const f = faces[face];
  const scale = size / f.unitsPerEm;
  let w = 0;
  for (const g of f.glyphsForString(string)) w += g.advanceWidth * scale + tracking;
  return string.length ? w - tracking : 0;
}

/**
 * Строка как один `<path>`. x — левый край, y — базовая линия.
 *
 * Если в подмножестве шрифта нет нужного символа — падаем, а не рисуем
 * пустой прямоугольник: молча испорченная og.png хуже несобравшейся.
 */
export function textPath(string, { face, size, x = 0, y = 0, tracking = 0, fill }) {
  const f = faces[face];
  const scale = size / f.unitsPerEm;

  for (const cp of [...string].map((c) => c.codePointAt(0))) {
    if (cp !== 32 && !f.hasGlyphForCodePoint(cp)) {
      throw new Error(
        `[brand] В ${face} нет символа «${String.fromCodePoint(cp)}» (U+${cp.toString(16).toUpperCase()}).\n` +
          `Подмножество в public/fonts собрано без него — либо меняем текст, либо пересобираем шрифт.`,
      );
    }
  }

  const num = (v) => Math.round(v * 100) / 100;
  let pen = x;
  const d = [];

  for (const glyph of f.glyphsForString(string)) {
    // Шрифтовая система координат смотрит вверх, экранная — вниз.
    const px = (v) => num(pen + v * scale);
    const py = (v) => num(y - v * scale);

    for (const { command, args: a } of glyph.path.commands) {
      if (command === 'moveTo') d.push(`M${px(a[0])} ${py(a[1])}`);
      else if (command === 'lineTo') d.push(`L${px(a[0])} ${py(a[1])}`);
      else if (command === 'quadraticCurveTo') d.push(`Q${px(a[0])} ${py(a[1])} ${px(a[2])} ${py(a[3])}`);
      else if (command === 'bezierCurveTo')
        d.push(`C${px(a[0])} ${py(a[1])} ${px(a[2])} ${py(a[3])} ${px(a[4])} ${py(a[5])}`);
      else if (command === 'closePath') d.push('Z');
    }

    pen += glyph.advanceWidth * scale + tracking;
  }

  return `<path d="${d.join('')}" fill="${fill}"/>`;
}
