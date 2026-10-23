#!/bin/bash
# Установка сайта НИЦ СМК на сервер Ubuntu (24.04 / 26.04). Запуск от root:  bash install.sh
# Повторный запуск продолжает с места остановки: выполненные шаги пропускаются,
# сборка повторяется только при новом коде. Пароли вводятся с клавиатуры и хранятся только в /opt/nic-smk/.env.
set -euo pipefail

REPO_SSH="git@github.com:azemkof-cell/nic-smk-site.git"
APP=/opt/nic-smk
USER_APP=nicsmk
DOMAIN=nic-smk.ru
STAGING=new.nic-smk.ru
YM_ID=113721593
MAIL=ooo.nic-smk@yandex.ru
TG_CHAT_DEFAULT=-5305988730
PW_VERSION=1.56.1
STATE=/var/lib/nicsmk-install

say()  { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;31m! %s\033[0m\n' "$*"; }
pause(){ read -r -p "$* [Enter — продолжить] " _; }
mark() { touch "$STATE/$1"; }
done_(){ [ -f "$STATE/$1" ]; }
# apt занят (например, автообновления запустились сразу после включения) — ждём, а не падаем
wait_apt() {
  local n=0
  # unattended-upgrade-shutdown работает постоянно — его не ждём, только сам прогон обновлений и apt/dpkg
  while pgrep -x 'apt|apt-get|dpkg' >/dev/null 2>&1 || pgrep -f '^/usr/bin/python3 /usr/bin/unattended-upgrade( |$)' >/dev/null 2>&1; do
    [ $n = 0 ] && echo "Жду, пока завершится другой процесс apt/dpkg (автообновления)…"
    n=$((n + 1)); sleep 5
    [ $n -gt 360 ] && { warn "apt занят больше 30 минут"; break; }
  done
}
apt_get() { wait_apt; apt-get -o DPkg::Lock::Timeout=1800 "$@"; }

[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive
mkdir -p "$STATE"

# ---------- 1. Система ----------
if done_ system; then ok "1/7 Система уже обновлена — пропускаю"; else
  say "1/7 Обновление системы"
  apt_get update
  apt_get -y -o Dpkg::Options::=--force-confold full-upgrade
  apt_get install -y sudo curl wget ca-certificates git nginx certbot ufw unattended-upgrades dnsutils openssh-client
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  systemctl enable --now unattended-upgrades
  ok "Автообновления безопасности включены"
  ufw allow OpenSSH >/dev/null && ufw allow 'Nginx Full' >/dev/null && ufw --force enable >/dev/null
  ok "Файрвол: открыты только SSH, 80, 443"
  NODE_MAJOR=$(apt-cache policy nodejs | awk '/Candidate/ {v=$2; sub(/^[0-9]+:/,"",v); split(v,a,"."); print a[1]}')
  if [ "${NODE_MAJOR:-0}" -ge 20 ] 2>/dev/null; then apt_get install -y nodejs npm
  else wait_apt; curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt_get install -y nodejs; fi
  mark system
fi
ok "Node $(node -v)"
id "$USER_APP" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$USER_APP"
HOME_APP=$(getent passwd "$USER_APP" | cut -d: -f6)

# ---------- 2. Код ----------
say "2/7 Код из GitHub"
install -d -m 700 -o "$USER_APP" -g "$USER_APP" "$HOME_APP/.ssh"
[ -f "$HOME_APP/.ssh/deploy_key" ] || sudo -u "$USER_APP" ssh-keygen -t ed25519 -N '' -C "nic-smk server deploy key" -f "$HOME_APP/.ssh/deploy_key" >/dev/null
printf 'Host github.com\n  IdentityFile %s/.ssh/deploy_key\n  IdentitiesOnly yes\n' "$HOME_APP" > "$HOME_APP/.ssh/config"
chown "$USER_APP:$USER_APP" "$HOME_APP/.ssh/config"; chmod 600 "$HOME_APP/.ssh/config"
grep -q github.com "$HOME_APP/.ssh/known_hosts" 2>/dev/null || sudo -u "$USER_APP" sh -c "ssh-keyscan -t ed25519 github.com >> '$HOME_APP/.ssh/known_hosts' 2>/dev/null"
if [ ! -d "$APP/.git" ]; then
  echo "Добавьте ключ: https://github.com/azemkof-cell/nic-smk-site/settings/keys → Add deploy key"
  echo "Title: nic-smk server; «Allow write access» НЕ отмечать"; echo
  cat "$HOME_APP/.ssh/deploy_key.pub"; echo
  until sudo -u "$USER_APP" git ls-remote "$REPO_SSH" >/dev/null 2>&1; do pause "Ключ ещё не принят GitHub. Добавьте его и нажмите"; done
  install -d -o "$USER_APP" -g "$USER_APP" "$APP"
  sudo -u "$USER_APP" git clone "$REPO_SSH" "$APP"
else
  sudo -u "$USER_APP" git -C "$APP" pull --ff-only || warn "git pull не прошёл — продолжаю с текущим кодом"
fi
ok "Код: $(sudo -u "$USER_APP" git -C "$APP" log --oneline -1)"
# Если запущена старая копия скрипта — продолжаем свежей версией из репозитория
if [ -z "${NICSMK_REEXEC:-}" ] && [ "$(readlink -f "$0")" != "$APP/deploy/install.sh" ] && ! cmp -s "$0" "$APP/deploy/install.sh"; then
  ok "Скрипт обновился — перезапускаю новую версию"
  NICSMK_REEXEC=1 exec bash "$APP/deploy/install.sh"
fi

# ---------- 3. Подпись и печать ----------
say "3/7 Подпись и печать для КП"
install -d -m 700 -o "$USER_APP" -g "$USER_APP" "$APP/private"
until [ -s "$APP/private/sign.png" ] && [ -s "$APP/private/stamp.png" ]; do
  IP=$(curl -fsS4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  echo "Скопируйте с компьютера (PowerShell, из папки проекта nic-smk):"
  echo "  scp private\\sign.png private\\stamp.png root@$IP:$APP/private/"
  pause "Когда файлы скопированы, нажмите"
done
chown "$USER_APP:$USER_APP" "$APP"/private/*.png; chmod 600 "$APP"/private/*.png
ok "sign.png и stamp.png на месте"

# ---------- 4. .env ----------
say "4/7 Настройки (.env)"
ENVF="$APP/.env"
touch "$ENVF"; chown "$USER_APP:$USER_APP" "$ENVF"; chmod 600 "$ENVF"
has()  { grep -qE "^$1=" "$ENVF"; }
getv() { grep -E "^$1=" "$ENVF" | head -1 | cut -d= -f2- || true; }
setv() { # setv KEY VALUE — заменить или добавить
  local k="$1" v="$2" tmp; tmp=$(mktemp)
  grep -vE "^$k=" "$ENVF" > "$tmp" || true; printf '%s=%s\n' "$k" "$v" >> "$tmp"
  cat "$tmp" > "$ENVF"; rm -f "$tmp"
}
defv() { has "$1" || setv "$1" "$2"; }
defv PORT 4321; defv HOST 127.0.0.1
defv DATA_DIR "$APP/storage"; defv PRIVATE_DIR "$APP/private"
defv SMTP_HOST smtp.yandex.ru; defv SMTP_PORT 465; defv SMTP_SECURE true
defv SMTP_USER "$MAIL"; defv MAIL_FROM "ООО «НИЦ СМК» <$MAIL>"; defv MAIL_TO "$MAIL"
defv LEAD_LIMIT_PER_HOUR 5; defv PUBLIC_YM_ID "$YM_ID"
if [ -z "$(getv SMTP_PASS)" ]; then read -r -s -p "Пароль приложения Яндекса для $MAIL: " P; echo; setv SMTP_PASS "$P"; fi
if ! has TG_BOT_TOKEN; then read -r -s -p "Токен Telegram-бота (Enter — пропустить, Telegram необязателен): " P; echo; setv TG_BOT_TOKEN "$P"; fi
[[ "$(getv TG_CHAT_ID)" =~ ^-?[0-9]+$ ]] || setv TG_CHAT_ID "$TG_CHAT_DEFAULT"
ok ".env готов (права 600). TG_CHAT_ID=$(getv TG_CHAT_ID)"

# ---------- 5. Сборка и служба ----------
say "5/7 Сборка сайта"
cd "$APP"
REV=$(sudo -u "$USER_APP" git rev-parse HEAD)
if [ "$(cat "$STATE/built-rev" 2>/dev/null)" = "$REV" ] && [ -f "$APP/dist/server/entry.mjs" ]; then
  ok "Сборка $REV уже есть — пропускаю"
else
  sudo -u "$USER_APP" npm ci
  sudo -u "$USER_APP" npm test
  sudo -u "$USER_APP" env PUBLIC_YM_ID="$YM_ID" npm run build
  echo "$REV" > "$STATE/built-rev"
  ok "Сайт собран"
fi

# ---------- 5б. Chromium для PDF ----------
say "5б/7 Chromium для PDF КП"
chrome_ok() { # запускается ли браузер от имени пользователя сайта
  [ -x "$1" ] && sudo -u "$USER_APP" -H timeout 60 "$1" --headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage --dump-dom 'data:text/html,<p>ok</p>' 2>/dev/null | grep -q '<p>ok</p>'
}
CHROME="$(getv CHROMIUM_PATH)"
if [ -n "$CHROME" ] && chrome_ok "$CHROME"; then
  ok "Chromium уже работает: $CHROME"
else
  CHROME=""
  # Библиотеки, нужные Chromium (список Playwright для Ubuntu 24.04; отсутствующие пакеты пропускаются)
  DEPS="libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 libatspi2.0-0t64 libcairo2 libcups2t64 libdbus-1-3 libdrm2 libexpat1 libgbm1 libglib2.0-0t64 libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1 libfontconfig1 libfreetype6 fonts-liberation fonts-dejavu-core"
  AVAIL=""; for p in $DEPS; do apt-cache show "$p" >/dev/null 2>&1 && AVAIL="$AVAIL $p"; done
  apt_get install -y $AVAIL >/dev/null && ok "Библиотеки для Chromium установлены"
  # Вариант А: сборка Playwright для Ubuntu 24.04 (официально 26.04 ещё не поддерживается)
  sudo -u "$USER_APP" -H env PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx -y "playwright@$PW_VERSION" install chromium || warn "Playwright не скачал Chromium"
  CAND=$(ls -d "$HOME_APP"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -V | tail -1 || true)
  if [ -n "$CAND" ] && chrome_ok "$CAND"; then CHROME="$CAND"
  else
    [ -n "$CAND" ] && { warn "Chromium Playwright не запустился. Недостающие библиотеки:"; ldd "$CAND" | grep "not found" || true; }
    # Вариант Б: Google Chrome (официальный .deb, ставит зависимости сам и обновляется через apt)
    say "Пробую Google Chrome"
    if wget -q -O /tmp/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
       && apt_get install -y /tmp/google-chrome.deb; then
      chrome_ok /usr/bin/google-chrome-stable && CHROME=/usr/bin/google-chrome-stable
    fi
    rm -f /tmp/google-chrome.deb
  fi
  if [ -n "$CHROME" ]; then setv CHROMIUM_PATH "$CHROME"; ok "PDF будет формироваться через $CHROME"
  else warn "Chromium не удалось запустить — сайт и заявки работают, но PDF КП не формируется (клиент может распечатать КП из браузера). Пришлите вывод выше."; fi
fi

cp "$APP/deploy/nic-smk.service" /etc/systemd/system/nic-smk.service
systemctl daemon-reload && systemctl enable nic-smk >/dev/null 2>&1 && systemctl restart nic-smk
for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS -o /dev/null http://127.0.0.1:4321/ && break; sleep 1; done
curl -fsS -o /dev/null http://127.0.0.1:4321/ && ok "Сайт отвечает на 127.0.0.1:4321" || { warn "Сайт не запустился:"; journalctl -u nic-smk -n 30 --no-pager; exit 1; }

# ---------- 6. nginx и HTTPS ----------
say "6/7 nginx и HTTPS"
MYIP=$(curl -fsS4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
install -d /var/www/certbot
rm -f /etc/nginx/sites-enabled/default
dns_ok() { [ "$(dig +short A "$1" @1.1.1.1 | tail -1)" = "$MYIP" ]; }
cert_ok() { [ -s "/etc/letsencrypt/live/$1/fullchain.pem" ]; }

write_nginx() {
  local main_cert="$1" stg_cert="$2"
  local proxy='location / { proxy_pass http://nicsmk; proxy_http_version 1.1; proxy_set_header Connection ""; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto https; proxy_read_timeout 60s; }'
  {
    echo "upstream nicsmk { server 127.0.0.1:4321; keepalive 16; }"
    echo "server { listen 80; listen [::]:80; server_name $DOMAIN www.$DOMAIN $STAGING;"
    echo "  location /.well-known/acme-challenge/ { root /var/www/certbot; }"
    echo "  location / { return 301 https://\$host\$request_uri; } }"
    if [ "$main_cert" = 1 ]; then cat <<EOF
server { listen 443 ssl http2; listen [::]:443 ssl http2; server_name www.$DOMAIN;
  ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
  return 301 https://$DOMAIN\$request_uri; }
server { listen 443 ssl http2; listen [::]:443 ssl http2; server_name $DOMAIN;
  ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
  add_header Strict-Transport-Security "max-age=31536000" always; client_max_body_size 1m;
  $proxy }
EOF
    fi
    if [ "$stg_cert" = 1 ]; then cat <<EOF
server { listen 443 ssl http2; listen [::]:443 ssl http2; server_name $STAGING;
  ssl_certificate /etc/letsencrypt/live/$STAGING/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/$STAGING/privkey.pem;
  add_header X-Robots-Tag "noindex, nofollow" always;
  location = /robots.txt { return 200 "User-agent: *\nDisallow: /\n"; }
  $proxy }
EOF
    fi
  } > /etc/nginx/sites-available/nic-smk.conf
  ln -sf /etc/nginx/sites-available/nic-smk.conf /etc/nginx/sites-enabled/nic-smk.conf
  nginx -t && systemctl reload nginx
}

MAIN=0; STG=0
cert_ok "$DOMAIN" && MAIN=1
cert_ok "$STAGING" && STG=1
write_nginx $MAIN $STG
if [ $MAIN = 0 ]; then
  if dns_ok "$DOMAIN" && dns_ok "www.$DOMAIN"; then
    certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" -d "www.$DOMAIN" --agree-tos -m "$MAIL" -n && MAIN=1
  else warn "$DOMAIN / www ещё не указывают на $MYIP — сертификат основного домена выпущу после переключения DNS"; fi
fi
if [ $STG = 0 ]; then
  if dns_ok "$STAGING"; then certbot certonly --webroot -w /var/www/certbot -d "$STAGING" --agree-tos -m "$MAIL" -n && STG=1
  else warn "$STAGING не указывает на $MYIP — добавьте A-запись new → $MYIP в REG.RU"; fi
fi
write_nginx $MAIN $STG
install -d /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
ok "nginx: $DOMAIN — $([ $MAIN = 1 ] && echo HTTPS || echo ждёт DNS); $STAGING — $([ $STG = 1 ] && echo HTTPS || echo ждёт DNS)"

# ---------- 7. Проверка ----------
say "7/7 Проверка почты, Telegram, заявки и PDF"
sudo -u "$USER_APP" node --env-file="$ENVF" "$APP/scripts/test-notify.mjs" || true
SINCE=$(date '+%Y-%m-%d %H:%M:%S')
T=$(( $(date +%s%3N) - 5000 ))
RESP=$(curl -fsS -X POST http://127.0.0.1:4321/api/lead -H 'Content-Type: application/json' \
  -d "{\"source\":\"calculator\",\"name\":\"ТЕСТ сервера\",\"phone\":\"+79160065206\",\"org\":\"ТЕСТ — не обрабатывать\",\"addr\":\"Проверка установки сайта\",\"consent\":true,\"consentVersion\":\"2026-10-21\",\"startedAt\":$T,\"page\":\"/install-test\",\"data\":{\"type\":\"asphalt\",\"vals\":{\"kind\":\"euro\",\"area\":\"5000\"}}}" || true)
echo "Ответ /api/lead: $RESP"
NO=$(echo "$RESP" | sed -n 's/.*"no":"\([^"]*\)".*/\1/p'); TOK=$(echo "$RESP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$NO" ]; then
  ENC=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$NO")
  if curl -fsS --max-time 90 -o /tmp/kp-test.pdf "http://127.0.0.1:4321/api/kp-pdf?no=$ENC&t=$TOK" && [ "$(head -c 4 /tmp/kp-test.pdf)" = "%PDF" ]; then
    ok "PDF КП $NO: $(du -k /tmp/kp-test.pdf | cut -f1) КБ (/tmp/kp-test.pdf)"
  else warn "PDF не сформировался"; fi
else warn "Заявка не принята"; fi
echo "Жду отправку уведомлений (до 40 с)…"; sleep 40
LOG=$(journalctl -u nic-smk --since "$SINCE" --no-pager)
echo "$LOG" | grep -E "\[mail\]|\[pdf\]" && warn "Ошибки почты/PDF — см. выше" || ok "Письмо с заявкой отправлено без ошибок"
echo "$LOG" | grep -q "\[telegram\]" && warn "Telegram недоступен с сервера — заявки приходят только на почту (это не ошибка)" || true

echo
ok "Проверьте ящик $MAIL: «Проверка: заявки с сайта» и «Заявка с сайта — Калькулятор — Проверка установки сайта» с PDF."
[ $STG = 1 ] && echo "Тестовый адрес: https://$STAGING"
[ $MAIN = 1 ] && echo "Сайт: https://$DOMAIN"
[ $MAIN = 0 ] && echo "После переключения A-записей @ и www на $MYIP запустите: bash $APP/deploy/install.sh — выпустится сертификат и включатся редиректы."
exit 0
