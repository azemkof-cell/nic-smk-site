// Продакшен-сервер: сборка Astro (статика + /api) с gzip/brotli-сжатием и кэшированием ассетов.
// Запуск: npm run build && npm start  (PORT, HOST — из окружения)
process.env.ASTRO_NODE_AUTOSTART = 'disabled';
import http from 'node:http';
import compression from 'compression';

const { handler } = await import('./dist/server/entry.mjs');
const compress = compression({ threshold: 1024 });

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/_astro/') || req.url?.startsWith('/fonts/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  compress(req, res, () => handler(req, res));
});
const port = Number(process.env.PORT || 4321);
const host = process.env.HOST || '0.0.0.0';
server.listen(port, host, () => console.log(`НИЦ СМК: http://${host}:${port}`));
