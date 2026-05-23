@echo off
REM 团队协同智能体 - 数据库启动脚本 (Windows)
REM 自动检测 Docker/Podman，优先使用 Docker

setlocal

call "%~dp0detect-runtime.bat"

echo === 启动 PostgreSQL ===
echo 运行时: %CONTAINER_RUNTIME% ^| Compose: %COMPOSE_CMD%
echo.

if not exist "%PROJECT_DIR%\data\postgres" mkdir "%PROJECT_DIR%\data\postgres"

if "%COMPOSE_FILE%"=="" (
    echo [ERROR] 未找到 compose 配置文件
    exit /b 1
)

echo 使用 Compose 文件: %COMPOSE_FILE%
%COMPOSE_CMD% -f "%COMPOSE_FILE%" up -d postgres

echo 等待 PostgreSQL 就绪...
:wait_pg
%CONTAINER_EXEC% team-coordinator-postgres pg_isready -U team_admin -d team_coordinator >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo PostgreSQL 正在启动...
    timeout /t 2 /nobreak >nul
    goto wait_pg
)

echo.
echo === PostgreSQL 已就绪 ===
echo.
echo 服务地址: localhost:5432
echo 数据库名: team_coordinator
echo 用户名:   team_admin
echo.
echo 停止服务: %COMPOSE_CMD% -f "%COMPOSE_FILE%" down