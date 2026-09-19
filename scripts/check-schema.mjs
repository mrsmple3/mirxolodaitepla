#!/usr/bin/env node
/**
 * Проверка структурированных данных и NAP-консистентности (SPEC §6, §8).
 *
 * Обходит dist/**\/*.html, вытаскивает все application/ld+json, парсит,
 * валидирует обязательные поля по типам и сверяет name / telephone /
 * addressLocality одновременно с business.ts и с видимым текстом страницы.
 *
 * Ненулевой exit code при любой ошибке.
 *
 * Запуск: node --experimental-strip-types scripts/check-schema.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';

import { business, isTodo } from '../src/data/business.ts';
import { GOOGLE_TAG_ID } from '../src/data/site.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
/** По умолчанию dist; каталог можно переопределить — этим пользуется selftest. */
const DIST = resolve(process.argv[2] ?? join(ROOT, 'dist'));

/* ------------------------------------------------------------------ отчёт */

const errors = [];
const warnings = [];
let checksRun = 0;

const fail = (file, check, message) => errors.push({ file, check, message });
const warn = (file, check, message) => warnings.push({ file, check, message });

/** Регистрирует проверку и валит её, если условие не выполнено. */
function expect(cond, file, check, message) {
  checksRun += 1;
  if (!cond) fail(file, check, message);
  return cond;
}

/* ------------------------------------------------------- вспомогательное */

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out.sort();
}

/** Неразрывные пробелы и переносы приводятся к обычному пробелу. */
const normalize = (s) => s.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim();

const typesOf = (node) => {
  const t = node?.['@type'];
  return Array.isArray(t) ? t : t ? [t] : [];
};

const missing = (node, ...fields) => fields.filter((f) => node[f] === undefined || node[f] === '');

/* ---------------------------------------------------- валидаторы по типам */

const KNOWN_TYPES = new Set([
  'HVACBusiness',
  'Service',
  'BreadcrumbList',
  'FAQPage',
  'BlogPosting',
  'WebSite',
  'WebPage',
  'CollectionPage',
]);

const ALL_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function validateHvacBusiness(node, ctx) {
  const { file } = ctx;
  const gone = missing(
    node,
    '@id',
    'name',
    'telephone',
    'url',
    'address',
    'areaServed',
    'openingHoursSpecification',
  );
  expect(gone.length === 0, file, 'HVACBusiness: обязательные поля', `нет полей: ${gone.join(', ')}`);

  // --- NAP против business.ts ---
  expect(
    node['name'] === business.name,
    file,
    'NAP: name = business.ts',
    `JSON-LD name «${node['name']}» ≠ business.name «${business.name}»`,
  );
  expect(
    node['telephone'] === business.phone.raw,
    file,
    'NAP: telephone = business.ts (raw)',
    `JSON-LD telephone «${node['telephone']}» ≠ business.phone.raw «${business.phone.raw}»`,
  );

  const addr = node['address'];
  if (expect(addr && typeof addr === 'object', file, 'HVACBusiness: address — объект', 'address отсутствует или не объект')) {
    expect(
      typesOf(addr).includes('PostalAddress'),
      file,
      'HVACBusiness: address @type',
      `ожидался PostalAddress, получен «${typesOf(addr).join(',') || 'ничего'}»`,
    );
    expect(
      addr['addressLocality'] === business.address.addressLocality,
      file,
      'NAP: addressLocality = business.ts',
      `«${addr['addressLocality']}» ≠ «${business.address.addressLocality}»`,
    );
    expect(
      addr['addressCountry'] === business.address.addressCountry,
      file,
      'NAP: addressCountry = business.ts',
      `«${addr['addressCountry']}» ≠ «${business.address.addressCountry}»`,
    );
    // Офиса нет: streetAddress в service-area business быть не должно.
    expect(
      addr['streetAddress'] === undefined,
      file,
      'HVACBusiness: без streetAddress',
      `офиса нет (business.address.hasOffice = false), но в разметке streetAddress: «${addr['streetAddress']}»`,
    );
  }

  // --- зона выезда ---
  const area = Array.isArray(node['areaServed']) ? node['areaServed'] : [node['areaServed']];
  const areaNames = area.map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean);
  expect(
    business.areaServed.every((a) => areaNames.includes(a)),
    file,
    'HVACBusiness: areaServed = business.ts',
    `в разметке [${areaNames.join(', ')}], в данных [${business.areaServed.join(', ')}]`,
  );

  // --- график ---
  const spec = node['openingHoursSpecification'];
  const specs = Array.isArray(spec) ? spec : [spec];
  const days = specs.flatMap((s) => {
    const d = s?.dayOfWeek;
    return Array.isArray(d) ? d : d ? [d] : [];
  });
  if (business.openingHours.allDay) {
    expect(
      ALL_DAYS.every((d) => days.includes(d)),
      file,
      'График: все семь дней',
      `в openingHoursSpecification только [${days.join(', ')}]`,
    );
    expect(
      specs.every((s) => s?.opens === '00:00' && s?.closes === '23:59'),
      file,
      'График: круглосуточно 00:00–23:59',
      `получено ${JSON.stringify(specs.map((s) => [s?.opens, s?.closes]))}`,
    );
  }

  // --- запрещённое (SPEC §6) ---
  expect(node['offers'] === undefined, file, 'Без offers', 'цен нет — Offer без цены не размечаем');
  expect(
    node['aggregateRating'] === undefined,
    file,
    'Без aggregateRating',
    'своих отзывов нет, размечать их нельзя',
  );
  expect(node['priceRange'] === undefined, file, 'Без priceRange', 'цены не публикуются (SPEC §9)');

  // --- то, чего пока нет в данных ---
  if (business.photos.works.length === 0 && node['image'] === undefined) {
    warn(file, 'HVACBusiness: image', 'фотографий нет — поле image отсутствует (SPEC §1)');
  }
  if (business.sameAs.length === 0 && node['sameAs'] === undefined) {
    warn(file, 'HVACBusiness: sameAs', 'карточек в картах ещё нет — поле sameAs отсутствует (SPEC §10)');
  }

  ctx.businessIds.add(node['@id']);
}

function validateService(node, ctx) {
  const { file } = ctx;
  const gone = missing(node, 'name', 'provider', 'areaServed');
  expect(gone.length === 0, file, 'Service: обязательные поля', `нет полей: ${gone.join(', ')}`);

  const providerId = node['provider']?.['@id'];
  expect(
    typeof providerId === 'string',
    file,
    'Service: provider по @id',
    'provider должен ссылаться на HVACBusiness через @id, а не дублировать бизнес',
  );
  if (typeof providerId === 'string') ctx.providerRefs.push(providerId);
}

function validateBreadcrumbList(node, ctx) {
  const { file } = ctx;
  const items = node['itemListElement'];
  if (!expect(Array.isArray(items) && items.length > 0, file, 'BreadcrumbList: itemListElement', 'пустой или отсутствует')) return;

  items.forEach((item, i) => {
    expect(
      typesOf(item).includes('ListItem'),
      file,
      'BreadcrumbList: ListItem',
      `элемент ${i + 1} не ListItem`,
    );
    expect(
      item?.position === i + 1,
      file,
      'BreadcrumbList: position по порядку',
      `элемент ${i + 1} имеет position ${item?.position}`,
    );
    expect(
      Boolean(item?.name) && Boolean(item?.item),
      file,
      'BreadcrumbList: name и item',
      `элемент ${i + 1}: name «${item?.name}», item «${item?.item}»`,
    );
  });
}

function validateFaqPage(node, ctx) {
  const { file, visibleText } = ctx;
  const items = node['mainEntity'];
  if (!expect(Array.isArray(items) && items.length > 0, file, 'FAQPage: mainEntity', 'пустой или отсутствует')) return;

  for (const q of items) {
    const question = q?.name;
    const answer = q?.acceptedAnswer?.text;
    expect(
      typesOf(q).includes('Question') && Boolean(question) && Boolean(answer),
      file,
      'FAQPage: Question + acceptedAnswer',
      `вопрос «${question}» без name или без acceptedAnswer.text`,
    );
    // SPEC §6: FAQPage только если вопросы и ответы реально видны на странице.
    if (question) {
      expect(
        visibleText.includes(normalize(question)),
        file,
        'FAQPage: вопрос виден на странице',
        `«${question}» нет в видимом тексте`,
      );
    }
    if (answer) {
      expect(
        visibleText.includes(normalize(answer)),
        file,
        'FAQPage: ответ виден на странице',
        `ответ на «${question}» нет в видимом тексте`,
      );
    }
  }
}

function validateBlogPosting(node, ctx) {
  const { file } = ctx;
  const gone = missing(node, 'headline', 'datePublished', 'author', 'mainEntityOfPage');
  expect(gone.length === 0, file, 'BlogPosting: обязательные поля', `нет полей: ${gone.join(', ')}`);

  expect(
    /^\d{4}-\d{2}-\d{2}/.test(String(node['datePublished'] ?? '')),
    file,
    'BlogPosting: datePublished в ISO',
    `получено «${node['datePublished']}»`,
  );
  expect(
    typesOf(node['author']).includes('Person') && Boolean(node['author']?.name),
    file,
    'BlogPosting: author — Person с именем',
    `получено ${JSON.stringify(node['author'])}`,
  );
}

const VALIDATORS = {
  HVACBusiness: validateHvacBusiness,
  Service: validateService,
  BreadcrumbList: validateBreadcrumbList,
  FAQPage: validateFaqPage,
  BlogPosting: validateBlogPosting,
};

/* ------------------------------------------------ проверки самой страницы */

/** Телефон в видимом тексте — всегда в формате display, в href — всегда raw. */
function checkPhoneFormat(file, root, visibleText) {
  const telHrefs = root
    .querySelectorAll('a[href^="tel:"]')
    .map((a) => a.getAttribute('href'));

  expect(
    telHrefs.length > 0,
    file,
    'Телефон: есть tel:-ссылка',
    'на странице ни одной ссылки href="tel:" (SPEC §8, «пол качества»)',
  );

  for (const href of telHrefs) {
    expect(
      href === `tel:${business.phone.raw}`,
      file,
      'Телефон: href="tel:" использует raw',
      `«${href}» ≠ «tel:${business.phone.raw}»`,
    );
  }

  // Любая последовательность, похожая на узбекский номер в видимом тексте:
  // скобки, дефисы, точки и слипшиеся цифры — всё это чужой формат.
  const PHONE_LIKE = /\+?\s*\(?\s*998[\d\s().\u2010\u2011\u2012\u2013\u2014-]{7,}\d/g;
  const found = normalize(visibleText).match(PHONE_LIKE) ?? [];
  for (const raw of found) {
    expect(
      raw.trim() === business.phone.display,
      file,
      'Телефон: единый формат в видимом тексте',
      `«${raw.trim()}» ≠ «${business.phone.display}» (формат display из business.ts)`,
    );
  }
}

function checkTelegram(file, root) {
  const links = root
    .querySelectorAll('a[href*="t.me"]')
    .map((a) => a.getAttribute('href'));
  for (const href of links) {
    expect(
      href === business.telegram.url,
      file,
      'Telegram: ссылка из business.ts',
      `«${href}» ≠ «${business.telegram.url}»`,
    );
  }
}

function checkNapVisible(file, visibleText) {
  const wanted = [
    ['name', business.name],
    ['telephone (display)', business.phone.display],
    ['addressLocality', business.address.addressLocality],
  ];
  for (const [label, value] of wanted) {
    expect(
      visibleText.includes(value),
      file,
      `NAP в видимом тексте: ${label}`,
      `«${value}» не найдено в видимом тексте страницы`,
    );
  }
}

/** Забытая заглушка не должна тихо уехать в прод (SPEC §3, §8). */
function checkNoTodo(file, html, visibleText) {
  expect(!/TODO:/.test(html), file, 'Нет TODO: в разметке', 'в HTML найдено «TODO:»');
  expect(!/TODO:/.test(visibleText), file, 'Нет TODO: в видимом тексте', 'в тексте страницы найдено «TODO:»');
}

/**
 * Запрещённые формулировки.
 * «Гарантия» — SPEC §2: формальной гарантии нет, обещать её нельзя.
 * Остальное — SPEC §4.1: вода, ради отсутствия которой сайт и пишется.
 */
const FORBIDDEN = [
  ['Без слова «гарантия»', /гарант\w*/i, 'формальной гарантии нет, обещать её нельзя (SPEC §2)'],
  ['Без «качественно и в срок»', /качественно и в срок/i, 'вода (SPEC §4.1)'],
  ['Без «индивидуального подхода»', /индивидуальн\w+ подход/i, 'вода (SPEC §4.1)'],
  ['Без «широкого спектра»', /широк\w+ спектр/i, 'вода (SPEC §4.1)'],
  ['Без «нашей команды»', /наша команда/i, 'мастер работает сам, бригады нет (SPEC §4.1)'],
  ['Без «в современном мире»', /в современном мире/i, 'вода (SPEC §7)'],
  ['Без непроверяемых титулов', /лидер рынка|№\s?1 в/i, 'ничем не подтверждено'],
];

function checkForbiddenClaims(file, visibleText) {
  for (const [name, re, why] of FORBIDDEN) {
    const hit = visibleText.match(re);
    expect(hit === null, file, name, `найдено «${hit?.[0]}» — ${why}`);
  }
}

function checkHeadings(file, root) {
  const h1 = root.querySelectorAll('h1');
  expect(h1.length === 1, file, 'Ровно один <h1>', `найдено ${h1.length}`);

  const levels = root
    .querySelectorAll('h1,h2,h3,h4,h5,h6')
    .map((h) => Number(h.tagName.slice(1)));
  for (let i = 1; i < levels.length; i += 1) {
    expect(
      levels[i] - levels[i - 1] <= 1,
      file,
      'Иерархия заголовков без пропусков',
      `h${levels[i - 1]} → h${levels[i]}`,
    );
  }
}

function checkLandmarks(file, root) {
  expect(root.querySelectorAll('main').length === 1, file, 'Ровно один <main>', `найдено ${root.querySelectorAll('main').length}`);
  expect(root.querySelectorAll('nav').length >= 1, file, 'Есть <nav>', 'ни одного <nav>');

  const skip = root.querySelector('a.skip-link');
  expect(Boolean(skip), file, 'Есть skip-link', 'нет ссылки .skip-link');
  if (skip) {
    const target = skip.getAttribute('href') ?? '';
    expect(
      target.startsWith('#') && Boolean(root.querySelector(target)),
      file,
      'skip-link ведёт на существующий якорь',
      `href="${target}" — цели нет в документе`,
    );
  }
}

/**
 * Тег Google — единственное разрешённое исключение (решение заказчика, CLAUDE.md):
 * загрузчик gtag.js, инлайн-конфиг и отправка конверсии — ровно с GOOGLE_TAG_ID
 * из src/data/site.ts.
 */
function isGoogleTag(s) {
  const src = s.getAttribute('src');
  if (src) return src === `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`;
  const code = s.textContent.trim();
  const isConfig = code.startsWith('window.dataLayer') && code.includes(`gtag('config', '${GOOGLE_TAG_ID}')`);
  const isConversion =
    code.includes(`CONVERSION_LABEL = '${GOOGLE_TAG_ID}/`) && code.includes("gtag('event', 'conversion'");
  return isConfig || isConversion;
}

/** Zero client-side JS (CLAUDE.md, SPEC §8) и ни одного внешнего запроса из HTML. */
function checkNoClientJs(file, root) {
  const scripts = root
    .querySelectorAll('script')
    .filter((s) => (s.getAttribute('type') ?? '') !== 'application/ld+json')
    .filter((s) => !isGoogleTag(s));
  expect(
    scripts.length === 0,
    file,
    'Zero client-side JS',
    `найдено ${scripts.length} <script>: ${scripts.map((s) => s.getAttribute('src') ?? 'inline').join(', ')}`,
  );

  const external = [];
  for (const el of root.querySelectorAll('link[href], img[src], source[src], source[srcset], iframe[src]')) {
    const url = el.getAttribute('href') ?? el.getAttribute('src') ?? el.getAttribute('srcset') ?? '';
    if (/^https?:\/\//.test(url) && !url.startsWith(pageOrigin)) external.push(url);
  }
  expect(
    external.length === 0,
    file,
    'Ни одного внешнего запроса из HTML',
    `внешние ресурсы: ${external.join(', ')}`,
  );

  expect(
    root.querySelectorAll('iframe').length === 0,
    file,
    'Без iframe',
    'встроенные карты и виджеты через iframe запрещены (SPEC §4.10, §9)',
  );
}

function checkMeta(file, root) {
  const title = root.querySelector('title')?.text?.trim() ?? '';
  expect(title.length > 0, file, 'Есть <title>', 'пустой или отсутствует');
  expect(
    title.length <= 60,
    file,
    'title ≤ 60 символов',
    `${title.length} символов: «${title}»`,
  );

  const desc = root.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
  expect(desc.length > 0, file, 'Есть meta description', 'отсутствует');
  expect(
    desc.length >= 140 && desc.length <= 160,
    file,
    'description 140–160 символов',
    `${desc.length} символов: «${desc}»`,
  );

  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '';
  expect(canonical.startsWith('http'), file, 'Есть абсолютный canonical', `«${canonical}»`);

  expect(
    root.querySelector('html')?.getAttribute('lang') === 'ru',
    file,
    'lang="ru"',
    `получено «${root.querySelector('html')?.getAttribute('lang')}»`,
  );
}

/** Изображения: явные размеры, lazy везде кроме hero (CLAUDE.md, SPEC §8). */
function checkImages(file, root) {
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src') ?? '(без src)';
    expect(
      Boolean(img.getAttribute('width')) && Boolean(img.getAttribute('height')),
      file,
      'Изображения: явные width/height',
      `${src} — без размеров, это CLS`,
    );
    expect(
      img.getAttribute('alt') !== undefined,
      file,
      'Изображения: есть alt',
      `${src} — без alt`,
    );
    const isHero = img.getAttribute('fetchpriority') === 'high';
    expect(
      isHero || img.getAttribute('loading') === 'lazy',
      file,
      'Изображения: loading="lazy" везде кроме hero',
      `${src} — без loading="lazy" и без fetchpriority="high"`,
    );
    expect(
      img.closest('picture') !== null,
      file,
      'Изображения: обёрнуты в <picture>',
      `${src} — нужен <picture> с AVIF + WebP + fallback`,
    );
  }
}

/* ------------------------------------------------------------------- ход */

let pageOrigin = '';

function checkFile(file) {
  const rel = relative(ROOT, file).startsWith('..') ? relative(DIST, file) : relative(ROOT, file);
  const html = readFileSync(file, 'utf8');
  const root = parse(html, { comment: false });

  const visibleRoot = parse(html, { comment: false });
  for (const el of visibleRoot.querySelectorAll('script, style, template, noscript')) el.remove();
  const visibleText = normalize(visibleRoot.text);

  pageOrigin = (() => {
    const c = root.querySelector('link[rel="canonical"]')?.getAttribute('href');
    try {
      return c ? new URL(c).origin : '';
    } catch {
      return '';
    }
  })();

  const ctx = { file: rel, visibleText, businessIds: BUSINESS_IDS, providerRefs: PROVIDER_REFS };

  checkMeta(rel, root);
  checkHeadings(rel, root);
  checkLandmarks(rel, root);
  checkNoClientJs(rel, root);
  checkImages(rel, root);
  checkNoTodo(rel, html, visibleText);
  checkForbiddenClaims(rel, visibleText);
  checkNapVisible(rel, visibleText);
  checkPhoneFormat(rel, root, visibleText);
  checkTelegram(rel, root);

  // --- JSON-LD ---
  const blocks = root.querySelectorAll('script[type="application/ld+json"]');
  if (!expect(blocks.length > 0, rel, 'Есть JSON-LD', 'ни одного application/ld+json — HVACBusiness нужен на всех страницах')) {
    return;
  }

  const nodes = [];
  for (const [i, block] of blocks.entries()) {
    let data;
    try {
      data = JSON.parse(block.text);
      checksRun += 1;
    } catch (e) {
      fail(rel, 'JSON-LD: валидный JSON', `блок ${i + 1}: ${e.message}`);
      continue;
    }
    expect(
      data['@context'] === 'https://schema.org',
      rel,
      'JSON-LD: @context',
      `блок ${i + 1}: «${data['@context']}»`,
    );
    const graph = data['@graph'];
    nodes.push(...(Array.isArray(graph) ? graph : [data]));
  }

  const seenTypes = new Set();
  for (const node of nodes) {
    const types = typesOf(node);
    if (!expect(types.length > 0, rel, 'JSON-LD: у узла есть @type', JSON.stringify(node).slice(0, 120))) continue;

    for (const type of types) {
      seenTypes.add(type);
      if (!expect(KNOWN_TYPES.has(type), rel, 'JSON-LD: известный @type', `«${type}» не входит в набор типов сайта (SPEC §6) — опечатка?`)) {
        continue;
      }
      VALIDATORS[type]?.(node, ctx);
    }
  }

  expect(
    seenTypes.has('HVACBusiness'),
    rel,
    'HVACBusiness на странице',
    'по SPEC §6 он обязателен на всех страницах',
  );

  // На 404 хлебных крошек нет и быть не должно: страница не в иерархии сайта.
  const relToDist = relative(DIST, file);
  const isHome = relToDist === 'index.html';
  const is404 = relToDist === '404.html';
  if (!isHome && !is404) {
    expect(
      seenTypes.has('BreadcrumbList'),
      rel,
      'BreadcrumbList на внутренней странице',
      'обязателен на всех внутренних страницах (SPEC §6)',
    );
  }

  // provider должен указывать на бизнес именно этой сборки
  for (const ref of ctx.providerRefs.splice(0)) {
    expect(
      BUSINESS_IDS.has(ref),
      rel,
      'Service: provider ссылается на HVACBusiness страницы',
      `provider.@id «${ref}» не совпадает ни с одним @id бизнеса`,
    );
  }
}

/* --------------------------------------------------------------- запуск */

const BUSINESS_IDS = new Set();
const PROVIDER_REFS = [];

console.log('\nПроверка структурированных данных и NAP\n');

// Заглушки в самих данных — это нормально до получения информации,
// но их надо видеть, чтобы не забыть.
const dataTodos = [];
(function walk(value, path) {
  if (isTodo(value)) dataTodos.push(`${path}: ${value}`);
  else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k);
  }
})(business, '');

let files = [];
try {
  files = htmlFiles(DIST);
} catch {
  console.error('  ✗ Нет каталога dist — сначала npm run build\n');
  process.exit(1);
}

if (files.length === 0) {
  console.error('  ✗ В dist нет ни одного .html\n');
  process.exit(1);
}

for (const file of files) checkFile(file);

// @id бизнеса обязан быть одинаковым на всех страницах.
checksRun += 1;
if (BUSINESS_IDS.size > 1) {
  fail('(все страницы)', '@id бизнеса единый', `разные @id: ${[...BUSINESS_IDS].join(', ')}`);
}

/* --------------------------------------------------------------- вывод */

const byFile = new Map();
for (const e of errors) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}

const relOf = (f) => (relative(ROOT, f).startsWith('..') ? relative(DIST, f) : relative(ROOT, f));

for (const file of files.map(relOf)) {
  const errs = byFile.get(file) ?? [];
  console.log(`  ${errs.length === 0 ? '✓' : '✗'} ${file}`);
  for (const e of errs) console.log(`      ✗ ${e.check}\n        ${e.message}`);
}
for (const [file, errs] of byFile) {
  if (files.some((f) => relOf(f) === file)) continue;
  console.log(`  ✗ ${file}`);
  for (const e of errs) console.log(`      ✗ ${e.check}\n        ${e.message}`);
}

if (warnings.length > 0) {
  console.log('\n  Предупреждения (не валят сборку):');
  for (const w of warnings) console.log(`    ~ ${w.file} — ${w.check}: ${w.message}`);
}

if (dataTodos.length > 0) {
  console.log(`\n  Незаполненные данные в business.ts (${dataTodos.length}) — в разметку не попали:`);
  for (const t of dataTodos) console.log(`    • ${t}`);
}

console.log(
  `\n  Страниц: ${files.length}. Проверок: ${checksRun}. Ошибок: ${errors.length}. Предупреждений: ${warnings.length}.\n`,
);

process.exit(errors.length > 0 ? 1 : 0);
