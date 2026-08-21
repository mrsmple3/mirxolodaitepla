#!/usr/bin/env node
/**
 * Проверка проверок.
 *
 * Берёт собранный dist, портит в копии по одной вещи и убеждается, что
 * check-schema.mjs это ловит: падает и называет именно ту проверку.
 * Зелёный чекер, который не умеет краснеть, не стоит ничего.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const CHECKER = join(ROOT, 'scripts', 'check-schema.mjs');

/** [название кейса, что портим, какую проверку обязан назвать чекер] */
const CASES = [
  [
    'телефон в тексте в чужом формате',
    (h) => h.replace(/\+998\s90\s904\s50\s10/, '+998 (90) 904-50-10'),
    'Телефон: единый формат в видимом тексте',
  ],
  [
    'href="tel:" не из raw',
    (h) => h.replace('tel:+998909045010', 'tel:998909045010'),
    'Телефон: href="tel:" использует raw',
  ],
  [
    'name в JSON-LD разошёлся с business.ts',
    (h) => h.replace('"name":"Мир холода и тепла"', '"name":"Мир холода и тепла "'),
    'NAP: name = business.ts',
  ],
  [
    'telephone в JSON-LD в формате display',
    (h) => h.replace('"telephone":"+998909045010"', '"telephone":"+998 90 904 50 10"'),
    'NAP: telephone = business.ts (raw)',
  ],
  [
    'город в JSON-LD не тот',
    (h) => h.replace('"addressLocality":"Ташкент"', '"addressLocality":"Tashkent"'),
    'NAP: addressLocality = business.ts',
  ],
  [
    'уличный адрес у бизнеса без офиса',
    (h) => h.replace('"addressLocality":"Ташкент"', '"streetAddress":"ул. Навои, 1","addressLocality":"Ташкент"'),
    'HVACBusiness: без streetAddress',
  ],
  [
    'название пропало из видимого текста',
    (h) => h.replaceAll('>Мир холода и тепла<', '>Мир холода<'),
    'NAP в видимом тексте: name',
  ],
  [
    'график не круглосуточный',
    (h) => h.replace('"closes":"23:59"', '"closes":"18:00"'),
    'График: круглосуточно 00:00–23:59',
  ],
  [
    'offers без цены',
    (h) => h.replace('"telephone":', '"offers":{"@type":"Offer"},"telephone":'),
    'Без offers',
  ],
  [
    'aggregateRating на своих отзывах',
    (h) => h.replace('"telephone":', '"aggregateRating":{"@type":"AggregateRating","ratingValue":5},"telephone":'),
    'Без aggregateRating',
  ],
  [
    'опечатка в @type',
    (h) => h.replace('"@type":"HVACBusiness"', '"@type":"HVACBussiness"'),
    'JSON-LD: известный @type',
  ],
  ['битый JSON-LD', (h) => h.replace('"@context"', '"@context'), 'JSON-LD: валидный JSON'],
  [
    'JSON-LD убрали совсем',
    (h) => h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ''),
    'Есть JSON-LD',
  ],
  [
    'забытая заглушка уехала в разметку',
    (h) => h.replace('</main>', '<p>TODO: дописать</p></main>'),
    'Нет TODO: в видимом тексте',
  ],
  [
    'обещание гарантии',
    (h) => h.replace('</main>', '<p>Даю гарантию на работы.</p></main>'),
    'Без слова «гарантия»',
  ],
  ['второй h1', (h) => h.replace('</main>', '<h1>Ещё заголовок</h1></main>'), 'Ровно один <h1>'],
  [
    'пропуск уровня заголовка',
    (h) => h.replace('</h1>', '</h1><h4>Сразу четвёртый уровень</h4>'),
    'Иерархия заголовков без пропусков',
  ],
  [
    'клиентский JS',
    (h) => h.replace('</body>', '<script src="/app.js"></script></body>'),
    'Zero client-side JS',
  ],
  [
    'внешний ресурс из HTML',
    (h) => h.replace('</head>', '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head>'),
    'Ни одного внешнего запроса из HTML',
  ],
  [
    'встроенная карта через iframe',
    (h) => h.replace('</main>', '<iframe src="/map"></iframe></main>'),
    'Без iframe',
  ],
  [
    'Telegram-ссылка мимо business.ts',
    (h) => h.replaceAll('https://t.me/+998909045010', 'https://t.me/master'),
    'Telegram: ссылка из business.ts',
  ],
  [
    'картинка без размеров и без picture',
    (h) => h.replace('</main>', '<img src="/a.webp" alt="">'.concat('</main>')),
    'Изображения: явные width/height',
  ],
  ['skip-link убрали', (h) => h.replace(/<a class="skip-link"[\s\S]*?<\/a>/, ''), 'Есть skip-link'],
  [
    'skip-link ведёт в никуда',
    (h) => h.replace('href="#main"', 'href="#content"'),
    'skip-link ведёт на существующий якорь',
  ],
  ['<main> убрали', (h) => h.replace('<main id="main"', '<div id="main"').replace('</main>', '</div>'), 'Ровно один <main>'],
  [
    'title длиннее 60 символов',
    (h) => h.replace(/<title>[^<]*<\/title>/, `<title>${'a'.repeat(61)}</title>`),
    'title ≤ 60 символов',
  ],
  [
    'description не в диапазоне 140–160',
    (h) => h.replace(/(<meta name="description" content=")[^"]*(")/, '$1Коротко$2'),
    'description 140–160 символов',
  ],
  ['canonical убрали', (h) => h.replace(/<link rel="canonical"[^>]*>/, ''), 'Есть абсолютный canonical'],
  ['lang не ru', (h) => h.replace('<html lang="ru"', '<html lang="en"'), 'lang="ru"'],
];

function runChecker(dir) {
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', CHECKER, dir],
    { encoding: 'utf8' },
  );
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const source = join(DIST, 'index.html');
let original;
try {
  original = readFileSync(source, 'utf8');
} catch {
  console.error('\n  ✗ Нет dist/index.html — сначала npm run build\n');
  process.exit(1);
}

console.log('\nПроверка проверок: чекер обязан краснеть\n');

let failed = 0;

// Контрольный прогон: на нетронутом dist чекер обязан быть зелёным.
{
  const { code } = runChecker(DIST);
  const ok = code === 0;
  if (!ok) failed += 1;
  console.log(`  ${ok ? '✓' : '✗'} чистый dist — чекер зелёный`);
}

for (const [name, mutate, expectedCheck] of CASES) {
  const dir = mkdtempSync(join(tmpdir(), 'mht-selftest-'));
  try {
    cpSync(DIST, dir, { recursive: true });
    const broken = mutate(original);
    if (broken === original) {
      console.log(`  ✗ ${name} — мутация ничего не изменила, кейс протух`);
      failed += 1;
      continue;
    }
    writeFileSync(join(dir, 'index.html'), broken);

    const { code, out } = runChecker(dir);
    const caught = code !== 0 && out.includes(expectedCheck);
    if (!caught) failed += 1;
    console.log(`  ${caught ? '✓' : '✗'} ${name}`);
    if (!caught) {
      console.log(`      ожидали провал проверки «${expectedCheck}», получили exit ${code}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n  Кейсов: ${CASES.length + 1}. Не отработало: ${failed}.\n`);
process.exit(failed > 0 ? 1 : 0);
