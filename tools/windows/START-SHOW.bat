@echo off
rem Zapusk dlya pokaza s telefonov: server viden v seti, https na 8443 (esli est sertifikat v D:\fp-ai\certs).
powershell -NoProfile -ExecutionPolicy Bypass -File D:\fp-ai\start-ai.ps1 -Lan
echo.
echo Stranica podklyucheniya telefonov seychas otkroetsya v brauzere.
echo Esli Windows sprosit pro dostup k seti - razreshite dlya chastnyh setey.
timeout /t 4 /nobreak >nul
start "" http://localhost:8800/connect.html
pause
