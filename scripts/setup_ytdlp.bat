@echo off
echo Setting up yt-dlp for Windows...
call npx tsx scripts/download_ytdlp.ts
if %errorlevel% neq 0 (
    echo Failed to setup yt-dlp.
    exit /b %errorlevel%
)
echo Setup completed.
pause
