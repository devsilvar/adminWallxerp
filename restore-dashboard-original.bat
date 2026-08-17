@echo off
echo ========================================
echo   Dashboard Design Rollback Tool
echo ========================================
echo.
echo This will restore your ORIGINAL dashboard design
echo from backup: Dashboard.backup-2026-08-15-original.tsx
echo.
echo Press any key to continue or Ctrl+C to cancel...
pause > nul

echo.
echo Restoring original dashboard...
copy /Y "frontend\src\pages\Dashboard.backup-2026-08-15-original.tsx" "frontend\src\pages\Dashboard.tsx"

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   SUCCESS! Original design restored
    echo ========================================
    echo.
    echo Your dashboard has been reverted to the original design.
    echo Refresh your browser to see the changes.
    echo.
) else (
    echo.
    echo ========================================
    echo   ERROR: Restore failed
    echo ========================================
    echo.
    echo Please manually copy the backup file:
    echo From: frontend\src\pages\Dashboard.backup-2026-08-15-original.tsx
    echo To:   frontend\src\pages\Dashboard.tsx
    echo.
)

echo Press any key to exit...
pause > nul
