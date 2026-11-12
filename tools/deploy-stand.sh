#!/bin/bash
# Выкладка открытого стенда: https://fotoprint.130-49-141-77.sslip.io (отдельная служба на сервере, рядом с другими проектами).
#   tools/deploy-stand.sh            — обновить код и экраны (рабочие данные стенда сохраняются)
#   tools/deploy-stand.sh --reset    — то же и вернуть демо-данные к исходным
#   tools/deploy-stand.sh --setup    — первый запуск: пользователь, окружение Python, служба, адрес в Caddy, ключ DeepSeek
# Подключение: FP_SSH="ssh -F <файл настроек> mila" (по умолчанию «ssh mila»). Ключи моделей лежат только на сервере: /etc/fp-stand.env.
set -euo pipefail
cd "$(dirname "$0")/.."
SSH=${FP_SSH:-ssh mila}
HOST=fotoprint.130-49-141-77.sslip.io
PORT=8795
MODE=${1:-}

if [ "$MODE" = "--setup" ]; then
  $SSH bash -s <<EOF
set -e
id fpstand >/dev/null 2>&1 || useradd --system --home /opt/fp --shell /usr/sbin/nologin fpstand
mkdir -p /opt/fp/app/data /var/backups/fp-stand
[ -x /opt/fp/venv/bin/python ] || python3 -m venv /opt/fp/venv
/opt/fp/venv/bin/pip -q install segno
chown -R fpstand:fpstand /opt/fp/app/data
cat > /etc/systemd/system/fp-stand.service <<UNIT
[Unit]
Description=Fotoprint demo stand (space-hackathon server.py)
After=network.target

[Service]
User=fpstand
Group=fpstand
WorkingDirectory=/opt/fp/app
EnvironmentFile=/etc/fp-stand.env
Environment=FP_PUBLIC=1
Environment=FP_AI_PER_DAY=4000
Environment=PYTHONDONTWRITEBYTECODE=1
Environment=STT_HTTP_URL=http://127.0.0.1:8000/api/voice/stt
ExecStart=/opt/fp/venv/bin/python -u /opt/fp/app/server.py $PORT
Restart=always
RestartSec=3
MemoryMax=250M
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/opt/fp/app/data

[Install]
WantedBy=multi-user.target
UNIT
cat > /etc/caddy/fp-stand.caddy <<CADDY
# Стенд хакатона «Фотопринт» — отдельная служба, сайт Mila не трогает
$HOST {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000"
		Referrer-Policy "strict-origin-when-cross-origin"
		X-Content-Type-Options "nosniff"
		Permissions-Policy "camera=(), microphone=(self), geolocation=()"
		-Server
	}
	reverse_proxy 127.0.0.1:$PORT
}
CADDY
BAK=""
if ! grep -q "fp-stand.caddy" /etc/caddy/Caddyfile; then
  BAK=/etc/caddy/Caddyfile.bak-fpstand-\$(date +%Y%m%d-%H%M%S)
  cp /etc/caddy/Caddyfile \$BAK
  printf '\n# Отдельный проект на этом сервере, не Мила: стенд хакатона «Фотопринт»\nimport /etc/caddy/fp-stand.caddy\n' >> /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || { [ -n "\$BAK" ] && cp \$BAK /etc/caddy/Caddyfile; echo "Caddyfile не прошёл проверку — вернул прежний"; exit 1; }
systemctl daemon-reload
systemctl enable -q fp-stand
EOF
  # ключ DeepSeek — из локального файла, на экран не выводится
  grep -E '^LLM_(API_KEY|BASE_URL|MODEL)=' ../flat-inventory/.env | $SSH 'umask 077; cat > /etc/fp-stand.env; chmod 600 /etc/fp-stand.env; wc -l < /etc/fp-stand.env'
fi

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/data"
cp server.py llm_gateway.py assistant_api.py assistant_voice.py pult_api.py pult_ai.py pult_contours.py app_api.py index.html "$STAGE/"
cp -R t1 t2 t3 shared get helper "$STAGE/"
cp -R data/seed "$STAGE/data/seed"
[ -d data/eval ] && cp -R data/eval "$STAGE/data/eval"
rm -f "$STAGE"/t2/test_app_api.py "$STAGE"/t2/*.md
find "$STAGE" -name '.DS_Store' -delete -o -name '__pycache__' -prune -exec rm -rf {} +
python3 -m py_compile "$STAGE"/*.py && rm -rf "$STAGE/__pycache__"

COPYFILE_DISABLE=1 tar --no-xattrs -C "$STAGE" -czf - . | $SSH "
set -e
TS=\$(date +%Y%m%d-%H%M%S)
NEW=/opt/fp/app.new; rm -rf \$NEW; mkdir -p \$NEW; tar -xzf - -C \$NEW --no-same-owner
if [ -d /opt/fp/app/t1 ]; then tar -czf /var/backups/fp-stand/app-\$TS.tgz -C /opt/fp/app --exclude=./data . ; ls -t /var/backups/fp-stand/app-*.tgz | tail -n +11 | xargs -r rm -f; fi
# код и экраны заменяются целиком, рабочие данные остаются; исходные демо-данные (seed) обновляются
for d in /opt/fp/app/*; do case \$(basename \$d) in data) ;; *) rm -rf \$d ;; esac; done
rm -rf /opt/fp/app/data/seed /opt/fp/app/data/eval
cp -R \$NEW/data/seed /opt/fp/app/data/seed; [ -d \$NEW/data/eval ] && cp -R \$NEW/data/eval /opt/fp/app/data/eval
rm -rf \$NEW/data; cp -R \$NEW/. /opt/fp/app/; rm -rf \$NEW
[ '$MODE' = '--reset' ] && find /opt/fp/app/data -maxdepth 1 -name '*.json' -delete
chown -R root:root /opt/fp/app; chown -R fpstand:fpstand /opt/fp/app/data; chmod -R a+rX /opt/fp/app
systemctl restart fp-stand
[ '$MODE' = '--setup' ] && systemctl reload caddy
sleep 2; systemctl is-active fp-stand; curl -s -m 5 http://127.0.0.1:$PORT/api/health
"
echo
echo "Готово: https://$HOST/"
