// Проверка каналов уведомлений без формы: письмо на MAIL_TO и сообщение в Telegram.
//   node --env-file=.env scripts/test-notify.mjs
import nodemailer from 'nodemailer';
const e = process.env;
const text = 'Проверка уведомлений сайта НИЦ СМК — ' + new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
try {
  const t = nodemailer.createTransport({ host: e.SMTP_HOST, port: Number(e.SMTP_PORT || 465), secure: (e.SMTP_SECURE || 'true') !== 'false', auth: { user: e.SMTP_USER, pass: e.SMTP_PASS } });
  await t.verify();
  await t.sendMail({ from: e.MAIL_FROM || e.SMTP_USER, to: e.MAIL_TO || 'ooo.nic-smk@yandex.ru', subject: 'Проверка: заявки с сайта', text });
  console.log('Почта: OK, письмо отправлено на', e.MAIL_TO || 'ooo.nic-smk@yandex.ru');
} catch (err) { console.log('Почта: ОШИБКА —', err.message); }
try {
  const r = await fetch(`https://api.telegram.org/bot${e.TG_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: e.TG_CHAT_ID, text }) }).then((x) => x.json());
  console.log(r.ok ? 'Telegram: OK' : 'Telegram: ОШИБКА — ' + r.description);
} catch (err) { console.log('Telegram: ОШИБКА —', err.message); }
