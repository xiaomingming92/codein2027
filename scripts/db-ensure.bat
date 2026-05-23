@echo off
REM 团队协同智能体 - 基础设施确保脚本 (Windows)
REM 自动检测 Docker/Podman，优先使用 Docker

setlocal enabledelayedexpansion

call "%~dp0detect-runtime.bat"

set ENV_FILE=%PROJECT_DIR%\.env.development
if exist "%ENV_FILE%" (
    for /f "tokens=*" %%a in (%ENV_FILE%) do (
        set line=%%a
        if not "!line!"=="" if not "!line:~0,1!"=="#" (
            for /f "tokens=1,* delims==" %%b in ("!line!") do set %%b=%%c
        )
    )
)

echo === 检查基础设施状态 ===
echo 运行时: %CONTAINER_RUNTIME%
echo.

echo [1/4] 检查 PostgreSQL...
%CONTAINER_PS% --filter name=team-coordinator-postgres --format "{{.Names}}" | findstr /c:"team-coordinator-postgres" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo    [OK] PostgreSQL 容器已在运行
) else (
    echo    [启动] 启动 PostgreSQL 容器...
    call "%~dp0start-db.bat"
)

echo 等待 PostgreSQL 就绪...
:wait_pg
%CONTAINER_EXEC% team-coordinator-postgres pg_isready -U team_admin -d team_coordinator >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    timeout /t 1 /nobreak >nul
    goto wait_pg
)
echo    [OK] PostgreSQL 已就绪 ^(localhost:5432^)

echo.
echo [2/4] 检查 ChromaDB...
if "%CHROMA_HOST%"=="" set CHROMA_HOST=localhost
if "%CHROMA_PORT%"=="" set CHROMA_PORT=8000

curl -s --connect-timeout 2 "http://%CHROMA_HOST%:%CHROMA_PORT%/api/v1/heartbeat" >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo    [OK] ChromaDB 已在运行 ^(%CHROMA_HOST%:%CHROMA_PORT%^)
) else (
    echo    [启动] 启动 ChromaDB...
    if not exist "%PROJECT_DIR%\data\chroma" mkdir "%PROJECT_DIR%\data\chroma"
    %COMPOSE_CMD% -f "%COMPOSE_FILE%" up -d chromadb 2>nul
    echo    等待 ChromaDB 就绪...
    for /l %%i in (1,1,30) do (
        curl -s --connect-timeout 2 "http://%CHROMA_HOST%:%CHROMA_PORT%/api/v1/heartbeat" >nul 2>nul
        if !ERRORLEVEL! EQU 0 (
            echo    [OK] ChromaDB 已就绪 ^(%CHROMA_HOST%:%CHROMA_PORT%^)
            goto chroma_ready
        )
        timeout /t 1 /nobreak >nul
    )
    echo    [ERROR] ChromaDB 启动超时
)
:chroma_ready

echo.
echo [3/4] 执行数据库迁移...
cd /d "%PROJECT_DIR%"
call npx prisma migrate deploy

echo [4/4] 初始化数据库...
call npx tsx "%PROJECT_DIR%\scripts\init-db.ts"

echo.
echo =========================================
echo 基础设施准备完成！
echo    PostgreSQL: 运行中 ^(localhost:5432^)
echo =========================================