# Запуск сайта на сервере

**Быстрый путь:** зайти на сервер под root и выполнить `bash install.sh` (файл `deploy/install.sh`). Если скрипт прервался, просто запустите его ещё раз: выполненные шаги пропускаются. Работает на Ubuntu 24.04 и 26.04 (для 26.04 Chromium ставится сборкой Playwright под 24.04, при неудаче — Google Chrome). Telegram необязателен: если api.telegram.org с сервера недоступен, заявки приходят на почту. Скрипт сам обновит систему, создаст ключ для GitHub, спросит пароли, соберёт сайт, настроит nginx и HTTPS, отправит тестовую заявку. Ниже — те же шаги вручную.

Рекомендуемый сервер: Timeweb Cloud, Москва, 2 vCPU / 4 ГБ RAM / 50 ГБ NVMe, Ubuntu 24.04.
4 ГБ памяти нужны для генерации PDF КП: Chromium вместе с сайтом занимает около 1,5 ГБ.

## 1. Сервер (один раз)

```bash
# на сервере, от root
scp -r nic-smk root@IP:/opt/            # или git clone в /opt/nic-smk
bash /opt/nic-smk/deploy/setup-server.sh
```

## 2. Секреты

```bash
cp /opt/nic-smk/.env.example /opt/nic-smk/.env
nano /opt/nic-smk/.env        # SMTP_PASS — пароль приложения Яндекса, TG_BOT_TOKEN — токен бота
chown nicsmk:nicsmk /opt/nic-smk/.env && chmod 600 /opt/nic-smk/.env
```

Пароль приложения и токен бота вписываются только в этот файл на сервере. Их не нужно пересылать в чатах и письмах, и в репозиторий они не попадают (`.env` в `.gitignore`).

**chat_id группы «Заявки с сайта»:** напишите в группе любое сообщение (если бот молчит — команду `/start@имя_бота`), затем:

```bash
cd /opt/nic-smk && sudo -u nicsmk node --env-file=.env scripts/tg-chat-id.mjs
```

Скрипт выведет строку `TG_CHAT_ID=-100…`. Её нужно вставить в `.env`.

Проверка почты и Telegram без формы:

```bash
sudo -u nicsmk node --env-file=.env scripts/test-notify.mjs
```

## 3. Сборка и запуск

```bash
cd /opt/nic-smk && sudo -u nicsmk ./deploy/deploy.sh
cp deploy/nic-smk.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now nic-smk
```

## 4. DNS в REG.RU и HTTPS

Tilda остаётся на nic-smk.ru, пока новый сайт проверяется на тестовом адресе **new.nic-smk.ru**.

1. В REG.RU → «DNS-серверы и управление зоной» добавить запись **A `new` → IP сервера**.
   Записи **MX и TXT (почта Яндекс 360) не трогать**: иначе перестанет работать ooo.nic-smk@yandex.ru.
2. Сертификат для тестового адреса и nginx:
   ```bash
   certbot certonly --webroot -w /var/www/certbot -d new.nic-smk.ru
   ```
   Пока сертификата для nic-smk.ru ещё нет, блоки `nic-smk.ru` и `www` в конфиге надо временно закомментировать. Затем:
   ```bash
   cp deploy/nginx-nic-smk.conf /etc/nginx/sites-available/nic-smk.conf
   ln -s /etc/nginx/sites-available/nic-smk.conf /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx
   ```
3. Проверка на https://new.nic-smk.ru: тестовая заявка из каждой формы (почта и Telegram), карта на «Контактах», PDF КП.
4. Переключение: за сутки снизить TTL записей `@` и `www` до 300. Затем заменить их A-записи (сейчас на Tilda) на IP сервера. После этого:
   ```bash
   certbot certonly --webroot -w /var/www/certbot -d nic-smk.ru -d www.nic-smk.ru
   # раскомментировать блоки nic-smk.ru / www, затем
   nginx -t && systemctl reload nginx
   ```
   Редиректы: http → https и www.nic-smk.ru → nic-smk.ru (301) уже в конфиге.
5. Tilda отключать после того, как сайт открывается на nic-smk.ru и пришли тестовые заявки.
6. Яндекс.Вебмастер: добавить https://nic-smk.ru и отправить `sitemap-index.xml`.

## Обновление сайта

Одна команда от root (консоль Timeweb или SSH). Пароли не спрашивает: берёт их из существующего `.env`.

```bash
sudo -u nicsmk git -C /opt/nic-smk pull --ff-only && bash /opt/nic-smk/deploy/update.sh
```

Скрипт подтянет код из GitHub, прогонит тесты, соберёт сайт и перезапустит службу. Если тесты или сборка упадут, перезапуска не будет.

PDF документов (аттестат, выписки СРО) положить в `public/docs/` под именами из основного README и пересобрать сайт.
