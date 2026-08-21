/**
 * Сборка JSON-LD (SPEC §6). Все значения приходят из business.ts —
 * поэтому NAP в разметке физически не может разойтись с видимым текстом.
 */
import { business, has } from '../data/business.ts';
import { absoluteUrl } from '../data/site.ts';

export type JsonLdNode = Record<string, unknown>;

/** Стабильный @id бизнеса — на него ссылаются Service.provider и BreadcrumbList. */
export const businessId = absoluteUrl('/#business');

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** HVACBusiness — на всех страницах. Не общий LocalBusiness. */
export function hvacBusiness(): JsonLdNode {
  const node: JsonLdNode = {
    '@type': 'HVACBusiness',
    '@id': businessId,
    name: business.name,
    telephone: business.phone.raw,
    url: absoluteUrl('/'),
    address: {
      '@type': 'PostalAddress',
      // streetAddress отсутствует намеренно: офиса нет, это service-area business.
      addressLocality: business.address.addressLocality,
      addressCountry: business.address.addressCountry,
    },
    areaServed: business.areaServed.map((name) => ({ '@type': 'City', name })),
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: [...DAYS],
        opens: '00:00',
        closes: '23:59',
      },
    ],
  };

  // image и sameAs появляются, только когда появятся фото и карточки в картах.
  if (business.photos.works.length > 0) {
    node['image'] = business.photos.works.map((p) => absoluteUrl(p.src));
  }
  if (business.sameAs.length > 0) {
    node['sameAs'] = business.sameAs;
  }

  // offers и aggregateRating не размечаем никогда (SPEC §6).
  return node;
}

/** Service для страниц услуг. provider — ссылкой по @id, не копией бизнеса. */
export function service(opts: {
  name: string;
  path: string;
  description: string;
}): JsonLdNode {
  return {
    '@type': 'Service',
    name: opts.name,
    description: opts.description,
    serviceType: opts.name,
    url: absoluteUrl(opts.path),
    provider: { '@id': businessId },
    areaServed: business.areaServed.map((name) => ({ '@type': 'City', name })),
  };
}

/** BreadcrumbList — на всех внутренних страницах. */
export function breadcrumbs(trail: { name: string; path: string }[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/** FAQPage — только если вопросы и ответы реально видны на странице. */
export function faqPage(items: { question: string; answer: string }[]): JsonLdNode {
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((qa) => ({
      '@type': 'Question',
      name: qa.question,
      acceptedAnswer: { '@type': 'Answer', text: qa.answer },
    })),
  };
}

/** BlogPosting — на статьях. author требует фамилию мастера, иначе сборка падает. */
export function blogPosting(opts: {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
}): JsonLdNode {
  /*
   * Фамилии в данных ещё нет (SPEC §1). Person с одним именем — не выдумка,
   * а ровно то, что стоит в видимом тексте статьи. Когда фамилия появится,
   * достаточно заполнить master.lastName: имя автора соберётся само.
   */
  const lastName = has(business.master.lastName) ? business.master.lastName : null;
  const authorName = lastName
    ? `${business.master.firstName} ${lastName}`
    : business.master.firstName;
  return {
    '@type': 'BlogPosting',
    headline: opts.headline,
    description: opts.description,
    url: absoluteUrl(opts.path),
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(opts.path) },
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    author: { '@type': 'Person', name: authorName },
    publisher: { '@id': businessId },
  };
}

/** Один <script> на страницу: @graph со всеми узлами. */
export function graph(nodes: JsonLdNode[]): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes }).replace(
    /</g,
    '\\u003c',
  );
}
