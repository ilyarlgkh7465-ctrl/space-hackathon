# Start local AI for the Fotoprint demo: LLM (GPU), speech recognition (CPU), speech synthesis (CPU), our server.
# Usage:  powershell -ExecutionPolicy Bypass -File D:\fp-ai\start-ai.ps1 [-Hold] [-Model 4b|8b] [-Lan]
param([switch]$Hold, [string]$Model = '4b', [switch]$Lan, [int]$Ctx = 8192, [int]$Ngl = 99, [string]$Whisper = 'ggml-small-q5_1.bin', [int]$WThreads = 8)
$root = 'D:\fp-ai'
$log = "$root\logs"; New-Item -ItemType Directory -Force -Path $log | Out-Null
$llama = (Get-ChildItem "$root\llama" -Recurse -Filter llama-server.exe | Select-Object -First 1).FullName
$ff = (Get-ChildItem "$root\ffmpeg" -Recurse -Filter ffmpeg.exe | Select-Object -First 1).FullName
$gguf = if ($Model -eq '8b') { "$root\models\Qwen3-8B-Q4_K_M.gguf" } else { "$root\models\Qwen3-4B-Q4_K_M.gguf" }
$alias = "qwen3-$Model"
& "$root\stop-ai.ps1" | Out-Null
$pids = @()
function Run($name, $exe, $argv, $dir) {
  $p = Start-Process -FilePath $exe -ArgumentList $argv -WorkingDirectory $dir -WindowStyle Hidden -PassThru `
       -RedirectStandardOutput "$log\$name.out.log" -RedirectStandardError "$log\$name.err.log"
  "$name pid $($p.Id)"; return $p.Id
}
$pids += Run 'llm' $llama @('-m', $gguf, '--device', 'CUDA0', '-ngl', "$Ngl", '-c', "$Ctx", '-np', '1', '--host', '127.0.0.1', '--port', '8080', '--reasoning', 'auto', '--alias', $alias) $root
$pids += Run 'stt' "$root\whisper\Release\whisper-server.exe" @('-m', "$root\models\$Whisper", '-l', 'ru', '-t', "$WThreads", '--host', '127.0.0.1', '--port', '8090') "$root\whisper\Release"
$pids += Run 'tts' "$root\piper\Scripts\python.exe" @("$root\space-hackathon\tools\tts_server.py", '--engine', 'piper', '--model', "$root\voices\ru_RU-denis-medium.onnx", '--port', '5050') $root
$env:LOCAL_LLM_URL = 'http://127.0.0.1:8080/v1'; $env:LOCAL_LLM_MODEL = $alias; $env:AI_MODE = 'local'
$env:FFMPEG = $ff; $env:PYTHONIOENCODING = 'utf-8'; $env:PYTHONUTF8 = '1'
$srvArgs = @("$root\space-hackathon\server.py", '8800'); if ($Lan) { $srvArgs += '--lan' }
$pids += Run 'server' "$root\python\python.exe" $srvArgs "$root\space-hackathon"
$pids | Set-Content "$root\pids.txt"
"started. open http://localhost:8800/  (logs: $log)"
if ($Hold) { while ($true) { Start-Sleep -Seconds 5; if (-not (Get-Process -Id $pids -ErrorAction SilentlyContinue)) { break } } }
