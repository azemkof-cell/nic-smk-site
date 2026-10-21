#!/bin/bash
# Первичная настройка сервера Ubuntu 24.04 (запускать от root один раз).
# Ставит Node 22, nginx, certbot, Chromium для PDF, пользователя nicsmk.
set -euo pipefail
apt-get update
apt-get install -y curl ca-certificates nginx certbot ufw
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
id nicsmk >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin nicsmk
mkdir -p /opt/nic-smk /var/www/certbot
chown -R nicsmk:nicsmk /opt/nic-smk
# Chromium + системные библиотеки для генерации PDF КП
cd /opt/nic-smk && sudo -u nicsmk -H npx -y playwright@1.56.1 install chromium
npx -y playwright@1.56.1 install-deps chromium
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
echo "Готово. Дальше — шаги из deploy/README.md"
