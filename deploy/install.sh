#!/bin/bash
# Полная установка сайта НИЦ СМК на чистый сервер Ubuntu (24.04 / 26.04).
# Запуск от root:  curl -fsSL … или скопировать файл и выполнить:  bash install.sh
# Скрипт интерактивный: пароли и токены вводятся с клавиатуры и сохраняются только в /opt/nic-smk/.env.
set -euo pipefail

REPO_SSH="git@github.com:azemkof-cell/nic-smk-site.git"
APP=/opt/nic-smk
USER_APP=nicsmk
DOMAIN=nic-smk.ru
STAGING=new.nic-smk.ru
YM_ID=113721593
MAIL=ooo.nic-smk@yandex.ru

say()  { printf '\n\033[1;33m== %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;31m! %s\033[0m\n' "$*"; }
pause(){ read -r -p "$* [Enter — продолжить] " _; }

[ "$(id -u)" = 0 ] || { echo "Запустите от root"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

# ---------- 1. Обновление системы и автообновления безопасности ----------
say "1/7 Обновление системы"
apt-get update
apt-get -y -o Dpkg::Options::=--force-confold full-upgrade
apt-get install -y sudo curl ca-certificates git nginx certbot ufw unattended-upgrades dnsutils openssh-client
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades
ok "Автообновления безопасности включены"
ufw allow OpenSSH >/dev/null && ufw allow 'Nginx Full' >/dev/null && ufw --force enable >/dev/null
ok "Файрвол: открыты только SSH, 80, 443"

# Node.js ≥ 20: из репозитория Ubuntu, иначе NodeSource
NODE_MAJOR=$(apt-cache policy nodejs | awk '/Candidate/ {split($2,a,"."); sub(/^[0-9]+:/,"",a[1]); print a[1]}')
if [ "${NODE_MAJOR:-0}" -ge 20 ] 2>/dev/null; then
  apt-get install -y nodejs npm
else
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
ok "Node $(node -v)"

id "$USER_APP" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$USER_APP"
HOME_APP=$(getent passwd "$USER_APP" | cut -d: -f6)

# ---------- 2. Deploy key и клонирование ----------
say "2/7 Ключ доступа к GitHub (только чтение)"
install -d -m 700 -o "$USER_APP" -g "$USER_APP" "$HOME_APP/.ssh"
if [ ! -f "$HOME_APP/.ssh/deploy_key" ]; then
  sudo -u "$USER_APP" ssh-keygen -t ed25519 -N '' -C "nic-smk server deploy key" -f "$HOME_APP/.ssh/deploy_key" >/dev/null
fi
cat > "$HOME_APP/.ssh/config" <<EOF
Host github.com
  IdentityFile $HOME_APP/.ssh/deploy_key
  IdentitiesOnly yes
EOF
chown "$USER_APP:$USER_APP" "$HOME_APP/.ssh/config"; chmod 600 "$HOME_APP/.ssh/config"
sudo -u "$USER_APP" sh -c "ssh-keyscan -t ed25519 github.com >> '$HOME_APP/.ssh/known_hosts' 2>/dev/null"

if [ ! -d "$APP/.git" ]; then
  echo
  echo "Добавьте этот ключ в GitHub:"
  echo "  https://github.com/azemkof-cell/nic-smk-site/settings/keys → Add deploy key"
  echo "  Title: nic-smk server;  галочку «Allow write access» НЕ ставить"
  echo
  cat "$HOME_APP/.ssh/deploy_key.pub"
  echo
  until sudo -u "$USER_APP" git ls-remote "$REPO_SSH" >/dev/null 2>&1; do pause "Ключ ещё не принят GitHub. Добавьте его и нажмите"; done
  install -d -o "$USER_APP" -g "$USER_APP" "$APP"
  sudo -u "$USER_APP" git clone "$REPO_SSH" "$APP"
fi
ok "Код в $APP ($(sudo -u "$USER_APP" git -C "$APP" log --oneline -1))"

# ---------- 3. Подпись и печать ----------
say "3/7 Подпись и печать для КП"
install -d -m 700 -o "$USER_APP" -g "$USER_APP" "$APP/private"
until [ -s "$APP/private/sign.png" ] && [ -s "$APP/private/stamp.png" ]; do
  IP=$(curl -fsS4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  echo "Скопируйте файлы со своего компьютера (из папки проекта nic-smk), например в PowerShell:"
  echo "  scp private\\sign.png private\\stamp.png root@$IP:$APP/private/"
  pause "Когда файлы скопированы, нажмите"
done
chown "$USER_APP:$USER_APP" "$APP"/private/*.png; chmod 600 "$APP"/private/*.png
ok "sign.png и stamp.png на месте (доступны только пользователю $USER_APP)"

# ---------- 4. .env ----------
say "4/7 Настройки и секреты (.env)"
ENVF="$APP/.env"
getv() { grep -E "^$1=" "$ENVF" 2>/dev/null | head -1 | cut -d= -f2- || true; }
SMTP_PASS=$(getv SMTP_PASS); TG_BOT_TOKEN=$(getv TG_BOT_TOKEN); TG_CHAT_ID=$(getv TG_CHAT_ID)
[ -n "$SMTP_PASS" ] || read -r -s -p "Пароль приложения Яндекса для $MAIL: " SMTP_PASS; echo
[ -n "$TG_BOT_TOKEN" ] || read -r -s -p "Токен Telegram-бота: " TG_BOT_TOKEN; echo
if [ -z "$TG_CHAT_ID" ]; then
  echo "Напишите любое сообщение в группе «Заявки с сайта» (если бот молчит — /start@имя_бота)."
  pause "Когда написали, нажмите"
  TG_BOT_TOKEN="$TG_BOT_TOKEN" node "$APP/scripts/tg-chat-id.mjs" || true
  read -r -p "Вставьте значение TG_CHAT_ID для группы «Заявки с сайта» (обычно начинается с -100): " TG_CHAT_ID
fi
umask 077
cat > "$ENVF" <<EOF
PORT=4321
HOST=127.0.0.1
DATA_DIR=$APP/storage
PRIVATE_DIR=$APP/private
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=$MAIL
SMTP_PASS=$SMTP_PASS
MAIL_FROM=ООО «НИЦ СМК» <$MAIL>
MAIL_TO=$MAIL
TG_BOT_TOKEN=$TG_BOT_TOKEN
TG_CHAT_ID=$TG_CHAT_ID
LEAD_LIMIT_PER_HOUR=5
PUBLIC_YM_ID=$YM_ID
EOF
umask 022
chown "$USER_APP:$USER_APP" "$ENVF"; chmod 600 "$ENVF"
ok ".env создан (права 600)"

# ---------- 5. Сборка, Chromium, служба ----------
say "5/7 Сборка сайта и Chromium для PDF"
cd "$APP"
sudo -u "$USER_APP" npm ci
sudo -u "$USER_APP" npm test
sudo -u "$USER_APP" env PUBLIC_YM_ID=$YM_ID npm run build
sudo -u "$USER_APP" -H npx -y playwright@1.56.1 install chromium
npx -y playwright@1.56.1 install-deps chromium || warn "install-deps не распознал систему — PDF проверим ниже"
cp deploy/nic-smk.service /etc/systemd/system/nic-smk.service
systemctl daemon-reload && systemctl enable --now nic-smk && systemctl restart nic-smk
sleep 3
curl -fsS -o /dev/null http://127.0.0.1:4321/ && ok "Сайт отвечает на 127.0.0.1:4321" || { warn "Сайт не запустился:"; journalctl -u nic-smk -n 30 --no-pager; exit 1; }

# ---------- 6. nginx и HTTPS ----------
say "6/7 nginx и HTTPS"
MYIP=$(curl -fsS4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
install -d /var/www/certbot
rm -f /etc/nginx/sites-enabled/default
dns_ok() { [ "$(dig +short A "$1" @1.1.1.1 | tail -1)" = "$MYIP" ]; }

write_nginx() {
  local names="$1" main_cert="$2" stg_cert="$3"
  {
    echo "upstream nicsmk { server 127.0.0.1:4321; keepalive 16; }"
    echo "server { listen 80; listen [::]:80; server_name $names;"
    echo "  location /.well-known/acme-challenge/ { root /var/www/certbot; }"
    if [ "$main_cert" = 1 ] || [ "$stg_cert" = 1 ]; then echo "  location / { return 301 https://\$host\$request_uri; } }"; else echo "  location / { return 503; } }"; fi
    local proxy='location / { proxy_pass http://nicsmk; proxy_http_version 1.1; proxy_set_header Connection ""; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; proxy_set_header X-Forwarded-Proto https; proxy_read_timeout 60s; }'
    if [ "$main_cert" = 1 ]; then
      cat <<EOF
server { listen 443 ssl http2; listen [::]:443 ssl http2; server_name www.$DOMAIN;
  ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
  return 301 https://$DOMAIN\$request_uri; }
server { listen 443 ssl http2; listen [::]:443 ssl http2; server_name $DOMAIN;
  ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem; ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
  add_header Strict-Transport-Security "max-age=31536000" always; client_max_body_size 1m;
  $proxy }
EOF
    fi
    if [ "$stg_cert" = 1 ]; then
      cat <<EOF
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

write_nginx "$DOMAIN www.$DOMAIN $STAGING" 0 0
MAIN=0; STG=0
if dns_ok "$DOMAIN" && dns_ok "www.$DOMAIN"; then
  certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" -d "www.$DOMAIN" --agree-tos -m "$MAIL" -n && MAIN=1
else
  warn "$DOMAIN / www.$DOMAIN ещё не указывают на $MYIP (сейчас Tilda) — сертификат для основного домена выпущу позже"
fi
if dns_ok "$STAGING"; then
  certbot certonly --webroot -w /var/www/certbot -d "$STAGING" --agree-tos -m "$MAIL" -n && STG=1
else
  warn "$STAGING не указывает на $MYIP — добавьте A-запись new → $MYIP в REG.RU и перезапустите скрипт"
fi
write_nginx "$DOMAIN www.$DOMAIN $STAGING" $MAIN $STG
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/sh
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
ok "nginx настроен (основной домен: $([ $MAIN = 1 ] && echo HTTPS || echo ждёт DNS); тестовый $STAGING: $([ $STG = 1 ] && echo HTTPS || echo ждёт DNS))"

# ---------- 7. Проверка: почта, Telegram, заявка, PDF ----------
say "7/7 Проверка уведомлений, заявки и PDF КП"
sudo -u "$USER_APP" node --env-file="$ENVF" "$APP/scripts/test-notify.mjs"
T=$(( $(date +%s%3N) - 5000 ))
RESP=$(curl -fsS -X POST http://127.0.0.1:4321/api/lead -H 'Content-Type: application/json' \
  -d "{\"source\":\"calculator\",\"name\":\"ТЕСТ сервера\",\"phone\":\"+79160065206\",\"org\":\"ТЕСТ — не обрабатывать\",\"addr\":\"Проверка установки сайта\",\"consent\":true,\"consentVersion\":\"2026-10-21\",\"startedAt\":$T,\"page\":\"/install-test\",\"data\":{\"type\":\"asphalt\",\"vals\":{\"kind\":\"euro\",\"area\":\"5000\"}}}")
echo "Ответ /api/lead: $RESP"
NO=$(echo "$RESP" | sed -n 's/.*"no":"\([^"]*\)".*/\1/p'); TOK=$(echo "$RESP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
if [ -n "$NO" ]; then
  curl -fsS -o /tmp/kp-test.pdf "http://127.0.0.1:4321/api/kp-pdf?no=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$NO")&t=$TOK" \
    && [ "$(head -c 4 /tmp/kp-test.pdf)" = "%PDF" ] && ok "PDF КП $NO сформирован: $(du -k /tmp/kp-test.pdf | cut -f1) КБ (/tmp/kp-test.pdf)" \
    || { warn "PDF не сформировался:"; journalctl -u nic-smk -n 30 --no-pager | grep -iE "pdf|chrom|error" || true; }
else
  warn "Заявка не принята — смотрите journalctl -u nic-smk"
fi
journalctl -u nic-smk -n 20 --no-pager | grep -E "\[mail\]|\[telegram\]|\[notify\]" && warn "Есть ошибки уведомлений (выше)" || ok "Ошибок отправки в журнале нет"

echo
ok "Готово. Проверьте почту $MAIL и группу «Заявки с сайта»: должны прийти «Проверка уведомлений» и заявка «ТЕСТ сервера» с PDF."
[ $STG = 1 ] && echo "Тестовый адрес: https://$STAGING"
[ $MAIN = 1 ] && echo "Сайт: https://$DOMAIN"
[ $MAIN = 0 ] && echo "После переключения A-записей @ и www на $MYIP запустите скрипт ещё раз — он выпустит сертификат для $DOMAIN и включит редиректы."
