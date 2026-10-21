#!/bin/sh
# Перезапуск локального сервера (для проверки)
cd "$(dirname "$0")/.."
[ -f .server.pid ] && kill "$(cat .server.pid)" 2>/dev/null
PORT=${PORT:-4321} HOST=${HOST:-127.0.0.1} nohup node server.mjs > "${LOG:-/tmp/nicsmk-server.log}" 2>&1 &
echo $! > .server.pid
