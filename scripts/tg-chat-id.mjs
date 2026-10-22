// Определяет chat_id группы, куда добавлен бот.
// 1) Напишите в группе «Заявки с сайта» любое сообщение (например, /start@имя_бота).
// 2) На сервере: TG_BOT_TOKEN=... node scripts/tg-chat-id.mjs   (или node --env-file=.env scripts/tg-chat-id.mjs)
const token = process.env.TG_BOT_TOKEN;
if (!token) { console.error('Задайте TG_BOT_TOKEN'); process.exit(1); }
const base = (process.env.TG_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
const r = await fetch(`${base}/bot${token}/getUpdates`, { signal: AbortSignal.timeout(10000) }).then((x) => x.json()).catch((e) => { console.error('api.telegram.org недоступен:', e.cause?.code || e.name); process.exit(2); });
if (!r.ok) { console.error('Ошибка Telegram:', r.description); process.exit(1); }
const chats = new Map();
for (const u of r.result) {
  const c = (u.message || u.my_chat_member || u.channel_post || u.edited_message)?.chat;
  if (c) chats.set(c.id, `${c.type} «${c.title || c.username || c.first_name}»`);
}
if (!chats.size) console.log('Сообщений пока нет. Напишите что-нибудь в группе и запустите снова.\nЕсли в группе включена приватность бота — отправьте команду /start@имя_бота.');
for (const [id, name] of chats) console.log(`TG_CHAT_ID=${id}   # ${name}`);
