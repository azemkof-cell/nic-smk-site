/** GET /api/kp-pdf?no=…&t=… — PDF сформированного КП (с подписью и печатью) */
import type { APIRoute } from 'astro';
import { loadKp } from '../../server/store';
import { kpPdf } from '../../server/pdf';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const kp = loadKp(url.searchParams.get('no') || '', url.searchParams.get('t') || '');
  if (!kp) return new Response('КП не найдено', { status: 404 });
  try {
    const pdf = await kpPdf(kp);
    return new Response(new Uint8Array(pdf), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(kp.no)}.pdf`, 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    console.error('[kp-pdf]', e);
    return new Response('Не удалось сформировать PDF — воспользуйтесь кнопкой «Распечатать»', { status: 500 });
  }
};
