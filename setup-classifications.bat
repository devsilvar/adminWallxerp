@echo off
echo ==========================================
echo Transaction Classification Setup
echo ==========================================
echo.

echo Step 1: Stopping backend server...
echo Please stop the backend server (Ctrl+C in the terminal running it)
echo.
pause

echo.
echo Step 2: Generating Prisma Client...
cd backend
call npx prisma generate

echo.
echo Step 3: Running Database Migration...
call npx prisma migrate dev --name add_transaction_classification

echo.
echo Step 4: Seeding Classifications...
call npm run prisma:seed

echo.
echo ==========================================
echo Setup Complete!
echo ==========================================
echo.
echo You can now restart the backend server with: npm run dev
echo.
pause
