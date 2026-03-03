@echo off
chcp 65001 >nul
title Mesanger - Запуск

cd /d "%~dp0"

echo.
echo === Mesanger: Запуск проекта ===
echo.

echo [1/5] Запуск PostgreSQL...
docker compose up -d 2>nul
if errorlevel 1 docker-compose up -d 2>nul
if errorlevel 1 (
    echo    Docker недоступен. PostgreSQL должен быть на localhost:5432
) else (
    echo    OK
)

echo.
echo [2/5] Ожидание БД (5 сек)...
ping 127.0.0.1 -n 6 >nul 2>nul

echo.
echo [3/5] Применение схемы БД...
cd backend
npx prisma db push
if errorlevel 1 (
    echo    Ошибка Prisma. Проверьте DATABASE_URL в backend\.env
) else (
    echo    OK
)
cd ..

echo.
echo [4/5] Тестовые данные...
call npm run db:seed 2>nul
if errorlevel 1 (
    echo    Seed пропущен (БД недоступна или уже заполнена)
) else (
    echo    OK
)

echo.
echo [5/5] Запуск backend и frontend...
start "Mesanger Backend" cmd /k "call "%~dp0start-backend.bat""
ping 127.0.0.1 -n 4 >nul 2>nul
start "Mesanger Frontend" cmd /k "call "%~dp0start-frontend.bat""

echo.
echo === Готово ===
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:5173
echo.
pause
