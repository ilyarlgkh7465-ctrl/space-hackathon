#!/bin/bash
# Сертификат для показа с телефонов: браузер даёт микрофон только по https.
# Делает свой корневой сертификат (его один раз ставят на телефоны) и сертификат сервера под адреса ноутбука.
#
#   tools/make_cert.sh [папка] [адрес или имя ...]
#   tools/make_cert.sh ~/fp-ai/certs 192.168.137.1 192.168.100.228 DESKTOP-UG4C0T4
#
# 192.168.137.1 — постоянный адрес ноутбука, когда он раздаёт свой Wi-Fi («Мобильный хот-спот» Windows).
# В папке появятся: ca.crt (ставить на телефоны), server.crt и server.key (нужны серверу), ca.key (никому не отдавать).
# На ноутбук копируются ca.crt, server.crt, server.key — в папку certs рядом с проектом (D:\fp-ai\certs).
set -euo pipefail
DIR="${1:-$HOME/fp-ai/certs}"; shift || true
NAMES=("$@"); [ ${#NAMES[@]} -eq 0 ] && NAMES=(192.168.137.1)
mkdir -p "$DIR"; cd "$DIR"

if [ ! -f ca.key ]; then
  openssl genrsa -out ca.key 2048 2>/dev/null
  openssl req -x509 -new -key ca.key -sha256 -days 825 -out ca.crt -subj "/O=Fotoprint demo/CN=Fotoprint demo root" \
    -extensions v3_ca -config <(printf '[req]\ndistinguished_name=dn\n[dn]\n[v3_ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n')
fi

SAN="DNS:localhost,IP:127.0.0.1"
for n in "${NAMES[@]}"; do
  if [[ "$n" =~ ^[0-9.]+$ ]]; then SAN="$SAN,IP:$n"; else SAN="$SAN,DNS:$n"; fi
done
openssl genrsa -out server.key 2048 2>/dev/null
openssl req -new -key server.key -out server.csr -subj "/O=Fotoprint demo/CN=${NAMES[0]}" 2>/dev/null
# срок 397 дней: iPhone не принимает сертификаты сервера длиннее 398 дней
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 397 -sha256 \
  -extfile <(printf 'basicConstraints=CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=%s\n' "$SAN") 2>/dev/null
rm -f server.csr ca.srl
chmod 600 ca.key server.key
echo "Готово: $DIR"
openssl x509 -in server.crt -noout -subject -enddate -ext subjectAltName 2>/dev/null || openssl x509 -in server.crt -noout -text | grep -A1 "Subject Alternative"
