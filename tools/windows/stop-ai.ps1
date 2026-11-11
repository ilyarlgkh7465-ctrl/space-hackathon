# Stop everything started by start-ai.ps1
$root = 'D:\fp-ai'
if (Test-Path "$root\pids.txt") { Get-Content "$root\pids.txt" | ForEach-Object { Stop-Process -Id ([int]$_) -Force -ErrorAction SilentlyContinue }; Remove-Item "$root\pids.txt" -Force }
Get-Process llama-server, whisper-server -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "name='python.exe'" | Where-Object { $_.CommandLine -match 'fp-ai' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
"stopped"
