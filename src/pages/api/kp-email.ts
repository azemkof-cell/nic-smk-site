/** POST /api/kp-email {no, t, email} — отправить КП клиенту на почту */
import type { APIRoute } from 'astro';
import { loadKp, rateLimited } from '../../server/store';
import { kpPdf } from '../../server/pdf';
import { sendMail } from '../../server/notify';

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const b = await request.json().catch(() => ({}));
  const email = String(b.email || '').trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return new Response('bad email', { status: 422 });
  if (rateLimited('mail:' + (clientAddress || ''), 10)) return new Response('rate limited', { status: 429 });
  const kp = loadKp(String(b.no || ''), String(b.t || ''));
  if (!kp) return new Response('not found', { status: 404 });
  try {
    const pdf = await kpPdf(kp);
    const ok = await sendMail(email, `Коммерческое предложение ${kp.no} — ООО «НИЦ СМК»`, `Здравствуйте!\n\nВо вложении коммерческое предложение ${kp.no}.\n\nООО «НИЦ СМК»\n+7 (916) 006-52-06 · ooo.nic-smk@yandex.ru`, [{ filename: kp.no + '.pdf', content: pdf }]);
    return new Response(ok ? 'ok' : 'smtp not configured', { status: ok ? 200 : 503 });
  } catch (e) {
    console.error('[kp-email]', e);
    return new Response('error', { status: 500 });
  }
};
