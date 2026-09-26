@echo off
setlocal

cd /d "%~dp0"

if not exist "chatbot_updated.exe" (
    echo chatbot_updated.exe was not found.
    echo Run build_updated.bat first.
    pause
    exit /b 1
)

REM Fix #13: Check for required frontend assets
if not exist "index.html" (
    echo ERROR: index.html is missing. The chatbot UI will not work.
    pause
    exit /b 1
)

if not exist "style.css" (
    echo WARNING: style.css is missing. The chatbot UI may look broken.
)

if not exist "script.js" (
    echo WARNING: script.js is missing. The chatbot UI may not function.
)

REM Fix #12: Use "if not defined" instead of "%VAR%"=="" to avoid crashes
REM on passwords containing special characters like & | ^ < > "
if not defined GROQ_API_KEY (
    echo WARNING: GROQ_API_KEY is not set.
    echo The chatbot will still run with keyword/FAQ features, but Groq AI requests will use the fallback response.
    echo.
)

if not defined CHATBOT_ADMIN_PASSWORD (
    echo INFO: No CHATBOT_ADMIN_PASSWORD found. Using default password: admin@2026
) else (
    echo INFO: FAQ admin password is loaded from CHATBOT_ADMIN_PASSWORD.
)

echo.
echo Starting Chatbot Assistant...

REM Fix #14: Auto-launch browser before starting the foreground server
start "" "http://127.0.0.1:8080"

chatbot_updated.exe

if errorlevel 1 (
    echo.
    echo The server exited with an error. Check the messages above.
)

pause
endlocal
