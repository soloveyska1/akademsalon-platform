#!/usr/bin/env bash
# Праздничная лента «Кладовой 6 лет» на akademsalon.ru (11–17.10.2026): файлы сайта не трогаем.
# nginx отдаёт /6let-ribbon.js из /var/www/kladovaya-6let и вставляет его перед </body> страниц
# (sub_filter в location / сервера akademsalon.ru). Скрипт сам решает по дате, показывать ли ленту.
#
#   bash install_kladovaya_6let_ribbon.sh apply      # бэкап конфига, правка, nginx -t, reload; не прошло — откат
#   bash install_kladovaya_6let_ribbon.sh rollback   # вернуть конфиг из последнего бэкапа и перезагрузить
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
CONF=$(readlink -f /etc/nginx/sites-enabled/api)
MARK="# kladovaya-6let:20261010"
BACKUPS=/root/salon_bot/backups

case "${1:-}" in
  apply)
    grep -q "$MARK" "$CONF" && { echo "уже стоит — второй раз не ставлю"; exit 0; }
    install -d -m 0755 /var/www/kladovaya-6let
    install -m 0644 "$HERE/kladovaya_6let_ribbon.js" /var/www/kladovaya-6let/ribbon.js
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    mkdir -p "$BACKUPS"
    cp -a "$CONF" "$BACKUPS/nginx-api-kladovaya-6let-$stamp"
    python3 - "$CONF" "$MARK" <<'PY'
import sys
from pathlib import Path
path, mark = Path(sys.argv[1]), sys.argv[2]
s = path.read_text(encoding="utf-8")
anchor = "    location / {\n        root /var/www/academic_saloon/current;\n"
if s.count(anchor) != 1:
    raise SystemExit(f"место правки найдено {s.count(anchor)} раз(а), нужно ровно 1")
location = (
    f"    location = /6let-ribbon.js {{  {mark}\n"
    "        alias /var/www/kladovaya-6let/ribbon.js;\n"
    "        default_type application/javascript;\n"
    "        add_header Cache-Control \"public, max-age=300\" always;\n"
    "        include /etc/nginx/snippets/akademsalon-security-headers.conf;\n"
    "    }\n\n"
)
inject = (
    f"        sub_filter '</body>' '<script src=\"/6let-ribbon.js\" defer></script></body>';  {mark}\n"
    f"        sub_filter_once on;  {mark}\n"
)
s = s.replace(anchor, location + anchor + inject)
path.write_text(s, encoding="utf-8")
PY
    if nginx -t 2>&1 | tail -2 && nginx -t >/dev/null 2>&1; then
      systemctl reload nginx
      echo "поставлено, бэкап $BACKUPS/nginx-api-kladovaya-6let-$stamp"
    else
      cp -a "$BACKUPS/nginx-api-kladovaya-6let-$stamp" "$CONF"
      echo "nginx -t не прошёл — конфиг возвращён"; exit 1
    fi
    ;;
  rollback)
    last=$(ls -1t "$BACKUPS"/nginx-api-kladovaya-6let-* 2>/dev/null | head -1)
    [ -n "$last" ] || { echo "бэкапа нет"; exit 1; }
    cp -a "$last" "$CONF"
    nginx -t && systemctl reload nginx && echo "конфиг возвращён из $last"
    ;;
  *) echo "apply | rollback"; exit 2 ;;
esac
