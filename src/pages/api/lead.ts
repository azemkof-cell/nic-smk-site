/**
 * POST /api/lead — единый приём заявок со всех 5 форм.
 * Повторная валидация, антиспам, пересчёт суммы из /data (цене с клиента не доверяем),
 * номер КП из сквозного счётчика, письмо + Telegram + журнал с фактом согласия.
 */
import type { APIRoute } from 'astro';
import { kpFromCalc, kpFromPackage, kpFromRates, kpNumber, kpText, type Cart, type Kp, type KpLead } from '../../lib/kp';
import { TYPES, type Vals } from '../../lib/calc';
import { formatPhone } from '../../lib/phone';
import { logLead, nextKpSeq, rateLimited, saveKp } from '../../server/store';
import { MAIL_TO, sendMail, sendTelegram, type Attachment } from '../../server/notify';
import { kpPdf } from '../../server/pdf';

export const prerender = false;

const SOURCES = ['callback', 'contacts', 'package', 'calculator', 'rates'] as const;
type Source = (typeof SOURCES)[number];
const LABEL: Record<Source, string> = { callback: 'Перезвоните мне', contacts: 'Контакты', package: 'Пакет', calculator: 'Калькулятор', rates: 'Единичные расценки' };
const CONSENT_VERSION = '2026-10-21';

const str = (v: unknown, max = 300) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || clientAddress || 'unknown';
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  const source = b.source as Source;
  if (!SOURCES.includes(source)) return json({ ok: false, error: 'bad_source' }, 400);

  // Антиспам: ловушка и минимум 3 секунды на заполнение — тихо «принимаем», но не обрабатываем
  const started = Number(b.startedAt) || 0;
  if (str(b.hp) || !started || Date.now() - started < 3000) return json({ ok: true });
  if (rateLimited(ip)) return json({ ok: false, error: 'rate_limited' }, 429);

  const phone = str(b.phone, 20);
  if (!/^\+7\d{10}$/.test(phone)) return json({ ok: false, error: 'phone' }, 422);
  if (b.consent !== true) return json({ ok: false, error: 'consent' }, 422);
  const email = str(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: 'email' }, 422);

  const lead: KpLead = { name: str(b.name, 120), phone: formatPhone(phone.slice(2)), email, org: str(b.org, 200), addr: str(b.addr, 300) };
  const needKp = source === 'package' || source === 'calculator' || source === 'rates';
  if (needKp && (!lead.name || !lead.addr)) return json({ ok: false, error: 'required' }, 422);

  const data = (b.data && typeof b.data === 'object' ? b.data : {}) as Record<string, unknown>;
  const now = new Date();
  let kp: Kp | null = null;
  if (needKp) {
    const no = kpNumber(now, await nextKpSeq());
    const date = now.toISOString();
    if (source === 'package') kp = kpFromPackage(str(data.pack, 10), data.months, lead, no, date);
    if (source === 'calculator') {
      const type = TYPES.some((t) => t.id === data.type) ? String(data.type) : 'sk';
      kp = kpFromCalc(type, (data.vals || {}) as Vals, lead, no, date);
      if (!kp.rows.length) return json({ ok: false, error: 'empty_calc' }, 422);
    }
    if (source === 'rates') {
      kp = kpFromRates((data.cart || {}) as Cart, lead, no, date);
      if (!kp.rows.length) return json({ ok: false, error: 'empty_cart' }, 422);
    }
  }

  const token = kp ? saveKp(kp) : undefined;
  const consent = { given: true, at: now.toISOString(), ip, version: str(b.consentVersion, 20) || CONSENT_VERSION, page: str(b.page, 200), ua: str(request.headers.get('user-agent'), 300) };
  logLead({ at: now.toISOString(), source, lead, direction: str(b.direction, 100), comment: str(b.comment, 2000), kp: kp?.no, total: kp?.total, consent });

  // Уведомления — не роняют заявку при сбое
  const object = lead.addr || str(b.direction, 100) || lead.name || 'без объекта';
  const subject = `Заявка с сайта — ${LABEL[source]} — ${object}`;
  const text = [
    subject,
    '',
    `Имя: ${lead.name || '—'}`,
    `Телефон: ${lead.phone}`,
    email && `E-mail: ${email}`,
    lead.org && `Организация: ${lead.org}`,
    str(b.direction, 100) && `Направление: ${str(b.direction, 100)}`,
    str(b.comment, 2000) && `Комментарий: ${str(b.comment, 2000)}`,
    `Страница: ${consent.page}`,
    `Согласие на обработку ПДн: да, ${consent.at}, IP ${ip}, редакция ${consent.version}`,
    kp && '\n' + kpText(kp),
  ]
    .filter(Boolean)
    .join('\n');

  // Уведомления — в фоне: клиент сразу получает ответ, сбой почты/Telegram не роняет заявку (она уже в журнале)
  void notify(subject, text, kp, email, lead.name);

  return json({ ok: true, kp: kp ? { no: kp.no, date: kp.date, token } : undefined });
};

async function notify(subject: string, text: string, kp: Kp | null, email: string, name: string) {
  let pdf: Attachment | undefined;
  if (kp) {
    try {
      pdf = { filename: kp.no + '.pdf', content: await kpPdf(kp) };
    } catch (e) {
      console.error('[pdf]', e);
    }
  }
  const tasks: Promise<unknown>[] = [sendMail(MAIL_TO, subject, text, pdf ? [pdf] : []), sendTelegram(text, pdf)];
  if (kp && email && pdf)
    tasks.push(sendMail(email, `Коммерческое предложение ${kp.no} — ООО «НИЦ СМК»`, `Здравствуйте${name ? ', ' + name : ''}!\n\nВо вложении коммерческое предложение ${kp.no}. Инженер свяжется с вами в рабочее время.\n\nООО «НИЦ СМК»\n+7 (916) 006-52-06 · ooo.nic-smk@yandex.ru`, [pdf]));
  const results = await Promise.allSettled(tasks);
  results.forEach((r) => r.status === 'rejected' && console.error('[mail]', r.reason));
}
