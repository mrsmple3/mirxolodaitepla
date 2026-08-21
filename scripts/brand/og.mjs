/**
 * Исходник og.png — карточка 1200×630 для Telegram и поиска.
 *
 * Это SVG в коде, а не картинка в редакторе: текст правится здесь, дальше
 * `npm run brand` пересобирает png. Телефон, имя мастера, город и часы берутся
 * из src/data/business.ts — захардкоженного номера тут нет и быть не может.
 *
 * Что обязано читаться с телефона: превью в Telegram ≈ 360 px шириной, то есть
 * всё уменьшится в 3.3 раза. Поэтому кегли крупные, строк мало, и ни одной
 * второстепенной надписи.
 */

import { business, phoneDisplay, openingHoursText } from '../../src/data/business.ts';
import { markSvg, palette } from './marks.mjs';
import { measure, textPath } from './text.mjs';

export const OG = { width: 1200, height: 630 };

/** Строки карточки. Правятся здесь; всё, что про бизнес, приходит из данных. */
const lines = {
  title: business.name,
  who: `Мастер ${business.master.firstName} · ${business.address.addressLocality}`,
  hours: openingHoursText,
  phone: business.phone.display,
};

const MUTED = '#3D464F';
const BRASS = '#A8832C';

/**
 * Риски приборного лимба — та же сигнатура, что делит секции на сайте
 * (`.scale`, SPEC §11.3), только в двойном масштабе: мелкая через 16,
 * крупная латунная через 80.
 */
function scaleBand(y, h = 28) {
  const ticks = [];
  for (let x = 0; x < OG.width; x += 16) ticks.push(`M${x} ${y + h / 2}v${h / 2}`);
  const minor = `<path d="${ticks.join('')}" stroke="${palette.ink}" stroke-width="2"/>`;
  const majors = [];
  for (let x = 0; x < OG.width; x += 80) majors.push(`M${x} ${y}v${h}`);
  const major = `<path d="${majors.join('')}" stroke="${BRASS}" stroke-width="2"/>`;
  return `<g opacity="0.75" fill="none">${minor}${major}</g>`;
}

/** Кегль, при котором строка влезает в колонку. Правка текста не ломает вёрстку. */
function fit(string, face, max, preferred, tracking = 0) {
  const w = measure(string, { face, size: preferred, tracking });
  return w <= max ? preferred : Math.floor(preferred * (max / w));
}

export function ogSvg({ accent }) {
  const M = 80; // поле
  const markSize = 236;
  const markX = OG.width - M - markSize;
  const markY = 206; // центр знака совпадает с оптическим центром текстового блока
  const col = markX - M - 56; // ширина текстовой колонки

  const instSize = 26;
  const instTrack = instSize * 0.09; // тот же трекинг, что у .inst
  const titleSize = fit(lines.title, 'golos700', col, 86);
  const phoneSize = fit(lines.phone, 'golos700', col - 32, 74);

  const mark = markSvg({ accent, size: markSize, bg: '#FFFFFF' });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.width}" height="${OG.height}" viewBox="0 0 ${OG.width} ${OG.height}">
  <rect width="${OG.width}" height="${OG.height}" fill="${palette.dial}"/>
  ${scaleBand(0)}
  ${scaleBand(OG.height - 28)}

  <g transform="translate(${markX} ${markY})">${mark}</g>
  <rect x="${markX + 0.75}" y="${markY + 0.75}" width="${markSize - 1.5}" height="${markSize - 1.5}" rx="${(6 / 32) * markSize}" fill="none" stroke="#C9D2D8" stroke-width="1.5"/>

  ${textPath(lines.who.toUpperCase(), {
    face: 'martian500',
    size: instSize,
    tracking: instTrack,
    x: M,
    y: 168,
    fill: accent,
  })}
  ${textPath(lines.title, { face: 'golos700', size: titleSize, x: M, y: 274, fill: palette.ink })}

  <rect x="${M}" y="368" width="5" height="126" fill="${BRASS}"/>
  ${textPath(lines.hours.toUpperCase(), {
    face: 'martian500',
    size: instSize,
    tracking: instTrack,
    x: M + 32,
    y: 406,
    fill: MUTED,
  })}
  ${textPath(lines.phone, { face: 'golos700', size: phoneSize, x: M + 32, y: 484, fill: palette.ink })}
</svg>`;
}
