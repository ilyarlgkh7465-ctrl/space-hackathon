# Install Silero TTS (Russian voice "xenia") for the Fotoprint demo laptop. Run once:
#   powershell -ExecutionPolicy Bypass -File D:\fp-ai\space-hackathon\tools\windows\setup-silero.ps1
# Needs internet for PyTorch CPU (about 250 MB). The model v4_ru.pt (40 MB) comes from models.silero.ai.
# If that site is blocked in this network, copy v4_ru.pt to D:\fp-ai\models by hand (for example with scp from the Mac)
# and run this script again. After that START.bat picks Silero automatically; without it the old Piper voice is used.
$ErrorActionPreference = 'Stop'
$root = 'D:\fp-ai'
$py = "$root\python\python.exe"
$venv = "$root\silero"
$model = "$root\models\v4_ru.pt"
New-Item -ItemType Directory -Force -Path "$root\models" | Out-Null
if (-not (Test-Path "$venv\Scripts\python.exe")) { & $py -m venv $venv }
& "$venv\Scripts\python.exe" -m pip install --upgrade pip
& "$venv\Scripts\python.exe" -m pip install torch numpy --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple
if (-not (Test-Path $model)) {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri 'https://models.silero.ai/models/tts/ru/v4_ru.pt' -OutFile $model
  } catch {
    "model download failed: $($_.Exception.Message)"
    "copy v4_ru.pt to $model by hand and run this script again"
    exit 1
  }
}
& "$venv\Scripts\python.exe" -c "import torch; m = torch.package.PackageImporter(r'$model').load_pickle('tts_models', 'model'); print('silero ok, speakers:', m.speakers)"
Copy-Item "$root\space-hackathon\tools\windows\start-ai.ps1" "$root\start-ai.ps1" -Force
"done. restart with START.bat - the assistant now speaks with the Silero voice xenia"
