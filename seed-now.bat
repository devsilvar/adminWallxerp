@echo off
echo Seeding Transaction Classifications...
echo.
cd backend
call npx tsx prisma/seeds/transaction-classifications.ts
echo.
echo Done! Restart your frontend and try again.
pause
