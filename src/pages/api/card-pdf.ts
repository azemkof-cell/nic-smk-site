/** GET /api/card-pdf — карточка предприятия ООО «НИЦ СМК» в PDF (из data/requisites.json) */
import type { APIRoute } from 'astro';
import { requisites } from '../../lib/data';
import { escapeHtml as e } from '../../lib/format';
import { htmlToPdf, wrapDoc } from '../../server/pdf';

export const prerender = false;
let cache: Buffer | null = null;

export const GET: APIRoute = async () => {
  try {
    if (!cache) {
      const c = requisites.contacts;
      const rows = [...requisites.company.map((r) => [r.field, r.value]), ['Телефон', c.phone], ['E-mail', c.email], ['Режим работы', c.hours], ['Аттестат аккредитации', requisites.accreditation]]
        .map(([k, v]) => `<tr><td style="padding:9px 12px;border-bottom:1px solid #E2E2DC;color:#5B6066;width:38%;vertical-align:top">${e(k)}</td><td style="padding:9px 12px;border-bottom:1px solid #E2E2DC;font-weight:700">${e(v)}</td></tr>`)
        .join('');
      const html = `<div style="border-bottom:3px solid #F5C02B;padding-bottom:16px;margin-bottom:20px"><div style="font-weight:800;font-size:16px">ООО «НИЦ СМК»</div><div style="color:#3A3F45">Научно-испытательный центр строительных материалов и конструкций</div></div>
<h1 style="font-family:'Unbounded',sans-serif;font-weight:600;font-size:24px;margin:0 0 16px">Карточка предприятия</h1>
<table style="width:100%;border-collapse:collapse;font-size:13.5px">${rows}</table>`;
      cache = await htmlToPdf(wrapDoc(html, 'Карточка предприятия ООО «НИЦ СМК»'));
    }
    return new Response(new Uint8Array(cache), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': "attachment; filename*=UTF-8''karta-predpriyatiya-nic-smk.pdf", 'Cache-Control': 'public, max-age=3600' } });
  } catch (err) {
    console.error('[card-pdf]', err);
    return new Response('Не удалось сформировать PDF', { status: 500 });
  }
};
