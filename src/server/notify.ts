/**
 * Уведомления: письмо на почту компании (SMTP: Яндекс 360 / Unisender), дубль в Telegram, письмо клиенту с КП.
 * Без настроек SMTP/Telegram заявка всё равно сохраняется в журнал (storage/leads.jsonl).
 * Telegram необязателен: при недоступности api.telegram.org (таймаут) заявка уходит только на почту.
 * TG_API_BASE позволяет ходить в Bot API через свой прокси/зеркало, если прямой доступ закрыт.
 */
import nodemailer from 'nodemailer';

const env = (k: string) => process.env[k] || '';
export const MAIL_TO = env('MAIL_TO') || 'ooo.nic-smk@yandex.ru';

let transport: nodemailer.Transporter | null = null;
function mailer() {
  if (!env('SMTP_HOST')) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env('SMTP_HOST'),
      port: Number(env('SMTP_PORT') || 465),
      secure: (env('SMTP_SECURE') || 'true') !== 'false',
      auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  }
  return transport;
}

export interface Attachment {
  filename: string;
  content: Buffer;
}

export async function sendMail(to: string, subject: string, text: string, attachments: Attachment[] = []): Promise<boolean> {
  const t = mailer();
  if (!t) {
    console.warn('[mail] SMTP не настроен, письмо не отправлено:', subject);
    return false;
  }
  await t.sendMail({ from: env('MAIL_FROM') || env('SMTP_USER'), to, subject, text, attachments });
  return true;
}

const TG_TIMEOUT = Number(env('TG_TIMEOUT_MS') || 8000);
let tgDownUntil = 0;

/** Дубль в Telegram. Никогда не бросает исключение: false — не отправлено (не настроено или недоступно). */
export async function sendTelegram(text: string, pdf?: Attachment): Promise<boolean> {
  const token = env('TG_BOT_TOKEN');
  const chat = env('TG_CHAT_ID');
  if (!token || !chat) return false;
  // После таймаута 10 минут не пытаемся — чтобы не копить висящие запросы
  if (Date.now() < tgDownUntil) return false;
  const api = (env('TG_API_BASE') || 'https://api.telegram.org').replace(/\/$/, '') + '/bot' + token;
  try {
    const r = await fetch(api + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(TG_TIMEOUT),
    });
    if (!r.ok) {
      console.warn('[telegram] ответ', r.status, (await r.text().catch(() => '')).slice(0, 200));
      return false;
    }
    if (pdf) {
      const fd = new FormData();
      fd.append('chat_id', chat);
      fd.append('document', new Blob([new Uint8Array(pdf.content)], { type: 'application/pdf' }), pdf.filename);
      await fetch(api + '/sendDocument', { method: 'POST', body: fd, signal: AbortSignal.timeout(TG_TIMEOUT * 2) }).catch(() => undefined);
    }
    return true;
  } catch (e) {
    tgDownUntil = Date.now() + 10 * 60_000;
    console.warn('[telegram] недоступен, заявка ушла только на почту:', (e as Error).message);
    return false;
  }
}
