@echo off
setlocal

cd /d "%~dp0"

echo ================================================
echo  Chatbot Assistant - Updated Build
echo ================================================
echo.

echo Checking g++...
where g++ >nul 2>nul
if errorlevel 1 (
    echo ERROR: g++ was not found in PATH.
    echo Install MinGW-w64/MSYS2 or add g++ to PATH.
    echo.
    pause
    exit /b 1
)

if not exist "chatbot.cpp" (
    echo ERROR: chatbot.cpp is missing.
    pause
    exit /b 1
)

if not exist "httplib.h" (
    echo ERROR: httplib.h is missing.
    pause
    exit /b 1
)

REM Fix #10: Check if chatbot_updated.exe is already running
tasklist /FI "IMAGENAME eq chatbot_updated.exe" 2>nul | findstr /i "chatbot_updated.exe" >nul
if not errorlevel 1 (
    echo ERROR: chatbot_updated.exe is currently running.
    echo Please close it before rebuilding.
    echo.
    pause
    exit /b 1
)

echo.
echo Compiling updated chatbot.cpp...
echo Output: chatbot_updated.exe
echo.

REM Fix #11: Added -static-libgcc -static-libstdc++ for standalone portability
g++ -std=c++17 -O2 -I. chatbot.cpp -o chatbot_updated.exe -static-libgcc -static-libstdc++ -lcurl -lws2_32 -lwinpthread

if errorlevel 1 (
    echo.
    echo ================================================
    echo BUILD FAILED
    echo ================================================
    echo Check the compiler messages above.
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo BUILD SUCCESSFUL
echo ================================================
echo.
echo New file: chatbot_updated.exe
echo.
echo Before running, set GROQ_API_KEY in your Windows environment.
echo Optional: set CHATBOT_ADMIN_PASSWORD to change the FAQ admin password.
echo Default FAQ admin password: admin123
echo.
echo Your original chatbot.exe was NOT overwritten.
echo.
pause
endlocal
