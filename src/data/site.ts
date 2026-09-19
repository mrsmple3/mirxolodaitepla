/**
 * Origin, на котором собирается сайт.
 *
 * По умолчанию — боевой домен. Проверки (`npm run verify`) собирают сайт
 * с `SITE_URL=http://localhost:4321` и поднимают dist ровно на этом origin,
 * иначе canonical, og:url и JSON-LD url выглядели бы как ссылки на чужой
 * недоступный домен: SEO-аудит Lighthouse и linkinator падают на этом.
 */
const PRODUCTION_ORIGIN = 'https://masterravshan.uz';

const raw = process.env['SITE_URL']?.trim();

export const SITE_ORIGIN: string = (raw || PRODUCTION_ORIGIN).replace(/\/+$/, '');

/** Сборка идёт на локальный origin — значит, это проверка, а не прод. */
export const SITE_ORIGIN_IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(SITE_ORIGIN);

/** Боевой домен — для сверки в проверках. */
export const PRODUCTION_SITE_ORIGIN = PRODUCTION_ORIGIN;

/** Абсолютный URL страницы по её пути. Пути всегда со слэшем на конце. */
export function absoluteUrl(path: string): string {
  return new URL(path, `${SITE_ORIGIN}/`).href;
}

/**
 * Тег Google (Google Ads). Единственный разрешённый клиентский JS на сайте —
 * по прямому решению заказчика. Ставится в <head> каждой страницы через Base.astro;
 * scripts/check-schema.mjs пропускает только его и только с этим ID.
 */
export const GOOGLE_TAG_ID = 'AW-18405480299';
