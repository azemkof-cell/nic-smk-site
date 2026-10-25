#!/bin/bash
# Обновление сайта на сервере: новый код из GitHub → тесты → сборка → перезапуск.
# Ничего не спрашивает: настройки и секреты берутся из существующего /opt/nic-smk/.env.
# Запуск от root:  bash /opt/nic-smk/deploy/update.sh
set -euo pipefail
APP=/opt/nic-smk
U=nicsmk
cd "$APP"
[ -s .env ] || { echo "Нет $APP/.env — сначала выполните deploy/install.sh"; exit 1; }

OLD=$(sudo -u $U git rev-parse --short HEAD)
sudo -u $U git pull --ff-only
NEW=$(sudo -u $U git rev-parse --short HEAD)
echo "Код: $OLD → $NEW"

YM=$(grep -E '^PUBLIC_YM_ID=' .env | cut -d= -f2- || true)
sudo -u $U npm ci --no-audit --no-fund
sudo -u $U npm test
sudo -u $U env PUBLIC_YM_ID="${YM:-113721593}" npm run build
mkdir -p /var/lib/nicsmk-install && sudo -u $U git rev-parse HEAD > /var/lib/nicsmk-install/built-rev

cp deploy/nic-smk.service /etc/systemd/system/nic-smk.service
systemctl daemon-reload
systemctl restart nic-smk
for i in $(seq 1 20); do curl -fsS -o /dev/null http://127.0.0.1:4321/ && break; sleep 1; done
if curl -fsS -o /dev/null http://127.0.0.1:4321/; then
  echo "✓ Сайт обновлён до $NEW и отвечает"
else
  echo "! Сайт не запустился:"; journalctl -u nic-smk -n 30 --no-pager; exit 1
fi
