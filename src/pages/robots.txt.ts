import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nDisallow: /api/\nAllow: /\n\nHost: ${site!.host}\nSitemap: ${new URL('sitemap-index.xml', site).href}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
