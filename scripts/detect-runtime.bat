@echo off
REM ============================================================
REM 运行时环境检测脚本 (Windows)
REM 自动检测: 容器工具(Docker/Podman)、Compose工具
REM ============================================================

setlocal enabledelayedexpansion

REM --- 容器运行时检测 ---
REM 优先级: podman > docker
set CONTAINER_RUNTIME=
set COMPOSE_CMD=
set CONTAINER_EXEC=
set CONTAINER_PS=

where podman >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    set CONTAINER_RUNTIME=podman
    set CONTAINER_EXEC=podman exec
    set CONTAINER_PS=podman ps
    
    where podman-compose >nul 2>nul
    if !ERRORLEVEL! EQU 0 (
        set COMPOSE_CMD=podman-compose
    ) else (
        podman compose version >nul 2>nul
        if !ERRORLEVEL! EQU 0 set COMPOSE_CMD=podman compose
    )
)

if "%CONTAINER_RUNTIME%"=="" (
    where docker >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        docker info >nul 2>nul
        if !ERRORLEVEL! EQU 0 (
            set CONTAINER_RUNTIME=docker
            set CONTAINER_EXEC=docker exec
            set CONTAINER_PS=docker ps
            
            docker compose version >nul 2>nul
            if !ERRORLEVEL! EQU 0 (
                set COMPOSE_CMD=docker compose
            ) else (
                where docker-compose >nul 2>nul
                if !ERRORLEVEL! EQU 0 set COMPOSE_CMD=docker-compose
            )
        )
    )
)

REM --- Compose 文件检测 ---
set COMPOSE_FILE=
set PROJECT_DIR=%~dp0..

if "%CONTAINER_RUNTIME%"=="docker" (
    if exist "%PROJECT_DIR%\docker-compose.yml" (
        set COMPOSE_FILE=%PROJECT_DIR%\docker-compose.yml
    ) else if exist "%PROJECT_DIR%\podman-compose.yml" (
        set COMPOSE_FILE=%PROJECT_DIR%\podman-compose.yml
    )
) else if "%CONTAINER_RUNTIME%"=="podman" (
    if exist "%PROJECT_DIR%\podman-compose.yml" (
        set COMPOSE_FILE=%PROJECT_DIR%\podman-compose.yml
    ) else if exist "%PROJECT_DIR%\docker-compose.yml" (
        set COMPOSE_FILE=%PROJECT_DIR%\docker-compose.yml
    )
)

REM --- 验证 ---
if "%CONTAINER_RUNTIME%"=="" (
    echo [ERROR] 未检测到 Docker 或 Podman
    echo 请安装 Docker Desktop ^(推荐^) 或 Podman
    exit /b 1
)

endlocal & set CONTAINER_RUNTIME=%CONTAINER_RUNTIME% & set COMPOSE_CMD=%COMPOSE_CMD% & set CONTAINER_EXEC=%CONTAINER_EXEC% & set CONTAINER_PS=%CONTAINER_PS% & set COMPOSE_FILE=%COMPOSE_FILE% & set PROJECT_DIR=%PROJECT_DIR%