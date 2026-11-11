#!/bin/bash
# Двойной щелчок — запускает все три MVP. Для телефонов в той же Wi-Fi: ./start.command --lan
cd "$(dirname "$0")"
( sleep 1; open "http://127.0.0.1:8800/" ) &
python3 server.py "$@"
