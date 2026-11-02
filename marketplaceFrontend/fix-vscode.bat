@echo off
echo ========================================
echo  FIX RED ASTRO FILES IN VS CODE
echo ========================================
echo.

echo Step 1: Regenerating Astro types...
call npm run typecheck
echo.

echo Step 2: Types generated successfully!
echo.

echo ========================================
echo  NEXT STEPS IN VS CODE:
echo ========================================
echo.
echo 1. Make sure you have the "Astro" extension installed
echo    - Press Ctrl+Shift+X
echo    - Search for "Astro"
echo    - Install "Astro" by Astro Technology Company
echo.
echo 2. Reload VS Code window:
echo    - Press Ctrl+Shift+P
echo    - Type "Reload Window"
echo    - Press Enter
echo.
echo 3. Restart TypeScript server:
echo    - Press Ctrl+Shift+P
echo    - Type "TypeScript: Restart TS Server"
echo    - Press Enter
echo.
echo ========================================

pause
