/**
 * Единственный источник правды о бизнесе (SPEC §2, §3).
 *
 * Телефон, город, график, зона выезда, услуги — только отсюда.
 * Захардкоженное значение в разметке = баг.
 */

/** Маркер отсутствующих данных. Не должен попадать в разметку. */
export type Todo = `TODO: ${string}`;
export type Maybe<T> = T | Todo;

export const isTodo = (v: unknown): v is Todo =>
  typeof v === 'string' && v.startsWith('TODO:');

/**
 * Достаёт значение, которое пойдёт в видимый текст или в JSON-LD.
 * Если данных нет — валит сборку, а не подставляет правдоподобный текст.
 */
export function required<T>(value: Maybe<T>, field: string): T {
  if (isTodo(value)) {
    throw new Error(
      `[business.ts] Поле «${field}» не заполнено: ${value}\n` +
        `Данных нет — значит, на сайте этого нет. Уберите блок или получите данные (SPEC §1).`,
    );
  }
  return value as T;
}

/** Есть ли данные — для условного рендера блоков. */
export const has = <T>(value: Maybe<T> | undefined | null): value is T =>
  value !== undefined && value !== null && !isTodo(value);

export type Season = 'summer' | 'winter';

export interface Photo {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export type Domain = 'ac' | 'boiler';

export interface Service {
  /** URL без слэшей: 'ustanovka-konditsionera'. */
  slug: string;
  /** Кондиционеры или котлы — от этого зависит группировка на главной. */
  domain: Domain;
  /** Короткое имя для карточек, навигации и JSON-LD Service.name. */
  name: string;
  h1: string;
  metaTitle: string;
  metaDescription: Maybe<string>;
  /** К какому сезону относится услуга — от этого зависит порядок на главной. */
  season: Season | 'all';
  /**
   * Цены не публикуются (SPEC §9). Поле существует, чтобы решение «показать цены»
   * позже не потребовало переписывания шаблонов. На страницы не выводится.
   */
  price?: { from: number; currency: 'UZS' };
  /**
   * live    — страница собрана;
   * planned — интент утверждён, контента ещё нет (шаг 3);
   * blocked — нельзя делать, пока заказчик не ответит (SPEC §1).
   */
  status: 'live' | 'planned' | 'blocked';
  /** Почему blocked. */
  blockedBy?: string;
}

export interface Business {
  name: string;
  master: {
    firstName: string;
    lastName: Maybe<string>;
    experienceYears: Maybe<number>;
    /** Пусто = не упоминаем. */
    certifications: string[];
    /** Решает судьбу /ustanovka-kotla/ (SPEC §1, §4.6). */
    gasClearance: Maybe<boolean>;
  };
  /** raw — в href="tel:" и в JSON-LD telephone. display — в видимый текст. Форматы не смешиваются. */
  phone: { raw: string; display: string };
  telegram: { url: string; label: string };
  address: {
    addressLocality: string;
    addressCountry: string;
    /** Офиса нет: service-area business, streetAddress в JSON-LD отсутствует. */
    hasOffice: false;
  };
  areaServed: string[];
  /** Та же зона выезда обычным текстом — склонения не выводятся кодом. */
  areaServedText: string;
  openingHours: { allDay: true };
  season: Season;
  services: Service[];
  photos: { works: Photo[]; portrait: Maybe<Photo> };
  /** Боевой домен. Origin конкретной сборки — в src/data/site.ts. */
  url: Maybe<string>;
  /** Карточки в картах — когда появятся. */
  sameAs: string[];
}

export const business: Business = {
  name: 'Мир холода и тепла',

  master: {
    firstName: 'Ровшан',
    lastName: 'TODO: фамилия мастера — нужна для Person в статьях и /o-mastere/',
    experienceYears: 'TODO: число лет в профессии; без цифры про стаж не пишем вообще',
    certifications: [],
    /** Подтверждено заказчиком 21.08.2026: допуск есть, установку газовых котлов делает. */
    gasClearance: true,
  },

  phone: {
    raw: '+998909045010',
    display: '+998 90 904 50 10',
  },

  telegram: {
    // Username не получен, ссылка строится по номеру (SPEC §1).
    url: 'https://t.me/+998909045010',
    label: 'Telegram',
  },

  address: {
    addressLocality: 'Ташкент',
    addressCountry: 'UZ',
    hasOffice: false,
  },

  areaServed: ['Ташкент'],
  areaServedText: 'Выезжаю по Ташкенту, офиса нет — приезжаю к вам',

  openingHours: { allDay: true },

  /** Переключается вручную: май–сентябрь 'summer', ноябрь–март 'winter'. */
  season: 'summer',

  services: [
    {
      slug: 'ustanovka-konditsionera',
      domain: 'ac',
      name: 'Установка кондиционера',
      h1: 'Установка кондиционера в Ташкенте',
      metaTitle: 'Установка кондиционера в Ташкенте — монтаж сплит-систем',
      metaDescription: 'Монтаж сплит-системы в Ташкенте: вальцовка, опрессовка азотом, вакуумирование, уклон дренажа. Работаю сам. Фото в Telegram — назову цену за 10 минут.',
      season: 'summer',
      status: 'live',
    },
    {
      slug: 'chistka-konditsionera',
      domain: 'ac',
      name: 'Чистка кондиционера',
      h1: 'Чистка кондиционера в Ташкенте',
      metaTitle: 'Чистка кондиционера в Ташкенте',
      metaDescription: 'Чистка кондиционера в Ташкенте: испаритель, крыльчатка, фильтры, дренажная ванна. Откуда запах из блока и почему капает вода. Цена по фото за 10 минут.',
      season: 'summer',
      status: 'live',
    },
    {
      slug: 'zapravka-konditsionera-freonom',
      domain: 'ac',
      name: 'Заправка фреоном',
      h1: 'Заправка кондиционера фреоном в Ташкенте',
      metaTitle: 'Заправка кондиционера фреоном в Ташкенте',
      metaDescription: 'Заправка кондиционера фреоном в Ташкенте. Сначала поиск утечки и опрессовка азотом, потом R32 или R410A. Почему просто долить фреон — выброшенные деньги.',
      season: 'summer',
      status: 'live',
    },
    {
      slug: 'remont-konditsionerov',
      domain: 'ac',
      name: 'Ремонт кондиционеров',
      h1: 'Ремонт кондиционеров в Ташкенте',
      metaTitle: 'Ремонт кондиционеров в Ташкенте',
      metaDescription: 'Ремонт кондиционеров в Ташкенте: не морозит, течёт, шумит, выключается, ошибка на дисплее. Что проверить самому до вызова. Работаю сам, круглосуточно.',
      season: 'all',
      status: 'live',
    },
    {
      slug: 'ustanovka-kotla',
      domain: 'boiler',
      name: 'Установка котла',
      h1: 'Установка котла в Ташкенте',
      metaTitle: 'Установка котла в Ташкенте — монтаж и обвязка',
      metaDescription:
        'Установка газового котла в Ташкенте: монтаж, обвязка отопительного контура, дымоход, опрессовка и пуск. Пришлите фото котельной — назову цену.',
      season: 'winter',
      status: 'live',
    },
    {
      slug: 'obsluzhivanie-kotlov',
      domain: 'boiler',
      name: 'Ремонт котлов',
      h1: 'Ремонт и обслуживание котлов в Ташкенте',
      metaTitle: 'Ремонт и обслуживание котлов в Ташкенте',
      metaDescription: 'Обслуживание и ремонт котлов в Ташкенте: падает давление, тухнет, не греет воду. Накипь в теплообменнике и расширительный бак. Профилактика до холодов.',
      season: 'winter',
      status: 'live',
    },
  ],

  photos: {
    works: [],
    portrait: 'TODO: портрет мастера; стоковые фото запрещены (SPEC §4.9)',
  },

  url: 'https://masterravshan.uz',

  sameAs: [],
};

/** Услуги с собранными страницами — единственное, на что можно ставить ссылки. */
export const liveServices = (): Service[] =>
  business.services.filter((s) => s.status === 'live');

/** Порядок услуг для главной: сначала сезонные, потом всесезонные. Без blocked. */
export const servicesBySeason = (season: Season = business.season): Service[] => {
  const rank = (s: Service): number => (s.season === season ? 0 : s.season === 'all' ? 1 : 2);
  return business.services
    .filter((s) => s.status !== 'blocked')
    .slice()
    .sort((a, b) => rank(a) - rank(b));
};

/**
 * Услуги двумя группами: кондиционеры и котлы. Летом первой идёт группа
 * кондиционеров, зимой — котлов. Шесть карточек подряд читаются как список,
 * две группы — как понятная развилка «у меня холод или у меня тепло».
 */
export const serviceGroups = (
  season: Season = business.season,
): { domain: Domain; label: string; services: Service[] }[] => {
  const groups = [
    { domain: 'ac' as Domain, label: 'Кондиционеры' },
    { domain: 'boiler' as Domain, label: 'Котлы' },
  ];
  const lead: Domain = season === 'summer' ? 'ac' : 'boiler';
  return groups
    .sort((a, b) => (a.domain === lead ? -1 : b.domain === lead ? 1 : 0))
    .map((g) => ({
      ...g,
      services: business.services.filter((s) => s.status === 'live' && s.domain === g.domain),
    }))
    .filter((g) => g.services.length > 0);
};

/** Ссылка «позвонить». Формат raw не меняется нигде на сайте. */
export const telHref = `tel:${business.phone.raw}`;

/**
 * display с неразрывными пробелами — единственный вид, в котором телефон
 * попадает в видимый текст. Формат тот же, номер просто не рвётся переносом.
 */
export const phoneDisplay = business.phone.display.replace(/ /g, '\u00a0');

/** Часы работы обычным текстом. Совпадает с openingHoursSpecification в JSON-LD. */
export const openingHoursText = 'Круглосуточно, без выходных';
