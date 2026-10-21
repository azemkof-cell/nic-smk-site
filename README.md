# Сайт НИЦ СМК — nic-smk.ru

Многостраничный сайт испытательной лаборатории ООО «НИЦ СМК» по ТЗ (`01_ТЗ_промт.md`) и макету.

**Стек:** Astro 5 (статическая сборка) + острова на Preact + TypeScript; серверные эндпоинты `/api/*` на Node (`@astrojs/node`). Отдельного бэкенда нет: один процесс `node server.mjs` отдаёт статику со сжатием и обрабатывает заявки.

## Быстрый старт

```bash
npm install
npm run build        # сборка: dist/client (статика) + dist/server (API)
npm start            # http://localhost:4321
npm run dev          # режим разработки
npm test             # юнит-тесты калькулятора и маски телефона (vitest)
npm run e2e          # сквозные проверки в браузере (нужен запущенный сервер и Chromium)
```

Требуется Node 20+. Для PDF коммерческого предложения нужен Chromium (`CHROMIUM_PATH`, либо `npx playwright install chromium`).

## Где менять данные (без правки кода)

| Что | Файл |
|---|---|
| 138 единичных расценок (цены, нормативы, «от») | `data/rates.json` |
| Пакеты «Стандарт / Профессионал / Эксперт», стационарный пост | `data/packages.json` |
| Индексы Минстроя (раз в квартал) и шкала ПП РФ № 468 | `data/indices.json` |
| Нормы калькулятора; цены — ссылками на `rates.json` по `id` | `data/calculator.json` |
| Реквизиты, контакты, аккредитация | `data/requisites.json` |

Цена меняется одной строкой в `rates.json` и сразу попадает в расценки, калькулятор, КП и на сервер (пересчёт заявки) после `npm run build`.
Расценки и цены рендерятся при сборке (индексируются поисковиками).

## Страницы

`/` · `/stroitelnyj-kontrol` · `/kontrol-monolita` · `/laboratoriya` · `/elektrolaboratoriya` · `/obsledovanie` · `/ceny` · `/ceny/rascenki` · `/kalkulyator` · `/kontakty` · `/personalnye-dannye` · 404.
Блок пакетов — один компонент (`src/components/islands/PackagesBlock.tsx`) на Главной, «Контроле монолита» и «Ценах».

## Заявки и КП

- Все 5 форм (`callback`, `contacts`, `package`, `calculator`, `rates`) шлют `POST /api/lead`.
- Сервер повторно валидирует, **пересчитывает сумму из `/data`** (цене с клиента не доверяет), выдаёт сквозной номер `КП-ДДММГГ-NNN`, сохраняет КП и журнал в `DATA_DIR` (с фактом согласия: дата, IP, версия текста).
- Письмо на `MAIL_TO` с PDF КП, дубль в Telegram, клиенту — письмо с КП, если указан e-mail.
- Антиспам: поле-ловушка, минимум 3 с на заполнение, лимит 5 заявок с IP в час.
- `GET /api/kp-pdf?no=…&t=…` — PDF КП (Chromium, кириллица вшита шрифтами). Подпись и печать берутся из `PRIVATE_DIR` и **попадают только в PDF**, в браузер не отдаются.
- `POST /api/kp-email` — «Отправить на e-mail»; `GET /api/card-pdf` — карточка предприятия.
- Без настроенных SMTP/Telegram заявки всё равно пишутся в `storage/leads.jsonl` (в лог выводится предупреждение).

Настройки — переменные окружения, пример в `.env.example`.

## Деплой (Yandex Cloud / Selectel / Timeweb)

1. `npm ci && npm run build` (при сборке задать `PUBLIC_YM_ID`).
2. Скопировать `dist/`, `server.mjs`, `package.json`, `node_modules` (или `npm ci --omit=dev` на сервере), `private/` (подпись и печать).
3. Запуск: `node server.mjs` под systemd/pm2, переменные из `.env.example`.
4. Nginx перед Node — для HTTPS; `/api/kp-pdf` и `/api/lead` проксировать с `X-Forwarded-For`.
5. Подключить Яндекс.Вебмастер, отправить `https://nic-smk.ru/sitemap-index.xml`.

301-редиректы со старых адресов Tilda — в `astro.config.mjs` → `redirects` (сейчас примеры; дополнить по текущему sitemap nic-smk.ru до переноса).

PDF аттестата и выписок СРО положить в `public/docs/` (`attestat-akkreditacii.pdf`, `svidetelstvo-elektrolaboratorii.pdf`, `vypiska-sro-izyskaniya.pdf`, `vypiska-sro-proektirovanie.pdf`, `vypiska-sro-stroitelstvo.pdf`) — ссылки «Копия (PDF)» появятся после сборки автоматически.

## Аналитика

Метрика загружается только после «Принять» в cookie-баннере. Цели: `lead_{source}`, `phone_click`, `email_click`, `kp_generated`, `kp_pdf`, `kp_print`, `calc_type`. Вебвизор включён; запись содержимого полей в настройках счётчика не включать.

## Проверено

- Контрольные примеры ТЗ — `tests/calc.test.ts` (СК 250 и 1 000 млн, асфальт, грунт, ПДУ, монолит, анкеры, обследование 300/1 000 м², ИД, пакет 270 000 ₽); маска — `tests/phone.test.ts`.
- `scripts/e2e.mjs` — маска на вводе/вставке/Backspace, калькулятор → КП, пакеты → КП, расценки → КП, корзина в localStorage, бургер и Esc.
- `scripts/shots.mjs` — скриншоты 1440/390 и проверка горизонтальной прокрутки.
- Lighthouse мобайл (локально): Performance 97–99, Accessibility 100, SEO 100, LCP ≤ 2,3 с на всех страницах.

## Открытые вопросы из ТЗ (не закрыты)

Дубли в прайсе (2.10/2.18 и др.) оставлены как есть; реальные фото объектов; PDF документов; Telegram-получатель и CRM; индексы IV кв. 2026; список старых URL Tilda для редиректов; тексты политики/согласия — показать юристу.
