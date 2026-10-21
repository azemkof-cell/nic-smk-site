#!/bin/bash
# Обновление сайта на сервере: из каталога проекта на сервере (/opt/nic-smk)
#   sudo -u nicsmk ./deploy/deploy.sh && sudo systemctl restart nic-smk
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
npm test
npm run build
echo "Сборка готова. Перезапустите: sudo systemctl restart nic-smk"
