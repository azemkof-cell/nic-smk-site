/**
 * Уведомления: письмо на почту компании (SMTP: Яндекс 360 / Unisender), дубль в Telegram, письмо клиенту с КП.
 * Без настроек SMTP/Telegram заявка всё равно сохраняется в журнал (storage/leads.jsonl).
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

export async function sendTelegram(text: string, pdf?: Attachment): Promise<boolean> {
  const token = env('TG_BOT_TOKEN');
  const chat = env('TG_CHAT_ID');
  if (!token || !chat) {
    console.warn('[telegram] TG_BOT_TOKEN/TG_CHAT_ID не заданы');
    return false;
  }
  const api = 'https://api.telegram.org/bot' + token;
  const r = await fetch(api + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }) });
  if (pdf) {
    const fd = new FormData();
    fd.append('chat_id', chat);
    fd.append('document', new Blob([new Uint8Array(pdf.content)], { type: 'application/pdf' }), pdf.filename);
    await fetch(api + '/sendDocument', { method: 'POST', body: fd });
  }
  return r.ok;
}
