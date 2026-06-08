@echo off
REM 团队协同智能体 - 数据库停止脚本 (Windows)
REM 自动检测 Docker/Podman，优先使用 Docker

setlocal

call "%~dp0detect-runtime.bat"

echo === 停止 PostgreSQL 和 Chroma ===
echo 运行时: %CONTAINER_RUNTIME% ^| Compose: %COMPOSE_CMD%

if not "%COMPOSE_FILE%"=="" (
    %COMPOSE_CMD% -f "%COMPOSE_FILE%" down
) else (
    echo 尝试直接停止容器...
    %CONTAINER_RUNTIME% stop farm-agent-postgres farm-agent-chroma 2>nul
    %CONTAINER_RUNTIME% rm farm-agent-postgres farm-agent-chroma 2>nul
)

echo.
echo === 数据库服务已停止 ===
echo.
echo 注意: 数据保存在 data\postgres 和 data\chroma 目录中
echo 如需清除数据: rmdir /s /q data\postgres data\chroma