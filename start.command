#!/bin/bash
# Двойной щелчок — запускает все три MVP. Для телефонов в той же Wi-Fi: ./start.command --lan
cd "$(dirname "$0")"
# Голос помощника: Silero (xenia), если он установлен в ~/fp-ai — см. tools/tts_server.py. Без него помощник говорит голосом устройства.
if [ -x "$HOME/fp-ai/silero/bin/python" ] && [ -f "$HOME/fp-ai/models/v4_ru.pt" ] && ! curl -s -m 1 http://127.0.0.1:5050/ >/dev/null; then
  "$HOME/fp-ai/silero/bin/python" tools/tts_server.py --engine silero --model "$HOME/fp-ai/models/v4_ru.pt" --speaker xenia --port 5050 >/dev/null 2>&1 &
  TTS_PID=$!; trap 'kill $TTS_PID 2>/dev/null' EXIT
fi
( sleep 1; open "http://127.0.0.1:8800/" ) &
python3 server.py "$@"
