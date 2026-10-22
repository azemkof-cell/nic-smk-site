import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// Telegram «висит» (как ETIMEDOUT с сервера): отправка должна быстро вернуть false и не бросать исключение
let server: http.Server;
beforeAll(async () => {
  server = http.createServer(() => {
    /* никогда не отвечаем */
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as AddressInfo).port;
  process.env.TG_API_BASE = `http://127.0.0.1:${port}`;
  process.env.TG_BOT_TOKEN = 'test';
  process.env.TG_CHAT_ID = '-5305988730';
  process.env.TG_TIMEOUT_MS = '300';
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe('Telegram необязателен', () => {
  it('таймаут → false, без исключения, быстро', async () => {
    const { sendTelegram } = await import('../src/server/notify');
    const t0 = Date.now();
    await expect(sendTelegram('тест')).resolves.toBe(false);
    expect(Date.now() - t0).toBeLessThan(2000);
    // повторная попытка сразу пропускается (Telegram помечен недоступным)
    const t1 = Date.now();
    await expect(sendTelegram('тест 2')).resolves.toBe(false);
    expect(Date.now() - t1).toBeLessThan(50);
  });
  it('без токена — просто false', async () => {
    delete process.env.TG_BOT_TOKEN;
    const { sendTelegram } = await import('../src/server/notify');
    await expect(sendTelegram('тест')).resolves.toBe(false);
  });
});
