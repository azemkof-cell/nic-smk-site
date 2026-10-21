// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://nic-smk.ru',
  trailingSlash: 'never',
  build: { format: 'directory', inlineStylesheets: 'always' },
  // Страницы собираются в статику; /api/* — серверные эндпоинты (Node)
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  integrations: [preact(), sitemap({ filter: (p) => !p.includes('/404') })],
  image: { responsiveStyles: false },
});
