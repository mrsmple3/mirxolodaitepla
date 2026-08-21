// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { SITE_ORIGIN, SITE_ORIGIN_IS_LOCAL } from './src/data/site.ts';

if (SITE_ORIGIN_IS_LOCAL) {
  console.warn(
    `\n[i] Проверочная сборка на ${SITE_ORIGIN}. В прод такой dist не выкладывать:\n` +
      `    canonical, Open Graph, sitemap и JSON-LD url указывают на localhost.\n` +
      `    Боевая сборка — просто npm run build.\n`,
  );
}

export default defineConfig({
  site: SITE_ORIGIN,
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  integrations: [sitemap()],
  compressHTML: true,
  devToolbar: { enabled: false },
});
