@echo off
REM Phase 7 DVA Testing Quick Start
REM This script helps you test the DVA webhook flow

echo ============================================
echo Phase 7: DVA Webhook Testing
echo ============================================
echo.

REM Check if ngrok is installed
where ngrok >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] ngrok is not installed!
    echo.
    echo Install options:
    echo   1. winget install ngrok
    echo   2. choco install ngrok
    echo   3. Download from https://ngrok.com/download
    echo.
    echo After installing, sign up at https://dashboard.ngrok.com/signup
    echo Then run: ngrok config add-authtoken YOUR_TOKEN
    echo.
    pause
    exit /b 1
)

echo [OK] ngrok is installed
echo.

REM Check if backend dependencies are installed
if not exist "backend\node_modules\" (
    echo [INFO] Installing backend dependencies...
    cd backend
    call npm ci
    cd ..
    echo.
)

echo Next steps:
echo.
echo 1. Open a NEW terminal and run:
echo    cd backend
echo    npm run dev
echo.
echo 2. Open ANOTHER terminal and run:
echo    ngrok http 3000
echo.
echo 3. Copy the ngrok HTTPS URL (e.g., https://abc123.ngrok.io)
echo.
echo 4. Come back here and press any key to continue...
pause >nul

echo.
set /p NGROK_URL="Enter your ngrok URL (e.g., https://abc123.ngrok.io): "

if "%NGROK_URL%"=="" (
    echo [ERROR] No URL provided
    pause
    exit /b 1
)

echo.
echo Testing webhook endpoint...
node test-dva-webhook.js %NGROK_URL%

echo.
echo ============================================
echo Test complete!
echo.
echo Check:
echo - Backend logs for webhook processing
echo - Database for paystack_webhook_events row
echo - Database for sales_transactions row (pending/needs_verification)
echo.
echo See DVA_TEST_GUIDE.md for detailed verification steps.
echo ============================================
pause
