#!/bin/bash
# ============================================================
# 运行时环境检测脚本
# 自动检测: OS类型、容器工具(Docker/Podman)、Compose工具
# 导出环境变量供其他脚本使用
# ============================================================

set -e

# --- OS 检测 ---
detect_os() {
  case "$(uname -s)" in
    Darwin*)  echo "macos" ;;
    Linux*)   echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*)  echo "windows" ;;
    *)        echo "unknown" ;;
  esac
}

OS_TYPE=$(detect_os)
export OS_TYPE

# --- 容器运行时检测 ---
# 优先级: podman > docker (两者都有时 Podman 优先)
detect_container() {
  if command -v podman &> /dev/null; then
    echo "podman"
  elif command -v docker &> /dev/null && docker info &> /dev/null 2>&1; then
    echo "docker"
  else
    echo ""
  fi
}

CONTAINER_RUNTIME=$(detect_container)
export CONTAINER_RUNTIME

# --- Compose 工具检测 ---
detect_compose_cmd() {
  if [ "$CONTAINER_RUNTIME" = "docker" ]; then
    if command -v docker &> /dev/null && docker compose version &> /dev/null 2>&1; then
      echo "docker compose"
    elif command -v docker-compose &> /dev/null; then
      echo "docker-compose"
    else
      echo ""
    fi
  elif [ "$CONTAINER_RUNTIME" = "podman" ]; then
    if command -v podman-compose &> /dev/null; then
      echo "podman-compose"
    elif command -v podman &> /dev/null && podman compose version &> /dev/null 2>&1; then
      echo "podman compose"
    else
      echo ""
    fi
  else
    echo ""
  fi
}

COMPOSE_CMD=$(detect_compose_cmd)
export COMPOSE_CMD

# --- Compose 文件检测 ---
detect_compose_file() {
  local project_dir="$1"

  if [ "$CONTAINER_RUNTIME" = "docker" ]; then
    if [ -f "$project_dir/docker-compose.yml" ]; then
      echo "$project_dir/docker-compose.yml"
    elif [ -f "$project_dir/podman-compose.yml" ]; then
      echo "$project_dir/podman-compose.yml"
    else
      echo ""
    fi
  elif [ "$CONTAINER_RUNTIME" = "podman" ]; then
    if [ -f "$project_dir/podman-compose.yml" ]; then
      echo "$project_dir/podman-compose.yml"
    elif [ -f "$project_dir/docker-compose.yml" ]; then
      echo "$project_dir/docker-compose.yml"
    else
      echo ""
    fi
  else
    echo ""
  fi
}

# --- 容器执行命令 ---
detect_container_exec() {
  if [ "$CONTAINER_RUNTIME" = "docker" ]; then
    echo "docker exec"
  elif [ "$CONTAINER_RUNTIME" = "podman" ]; then
    echo "podman exec"
  else
    echo ""
  fi
}

CONTAINER_EXEC=$(detect_container_exec)
export CONTAINER_EXEC

# --- 容器 PS 命令 ---
detect_container_ps() {
  if [ "$CONTAINER_RUNTIME" = "docker" ]; then
    echo "docker ps"
  elif [ "$CONTAINER_RUNTIME" = "podman" ]; then
    echo "podman ps"
  else
    echo ""
  fi
}

CONTAINER_PS=$(detect_container_ps)
export CONTAINER_PS

# --- 打印检测结果（仅在直接调用时输出） ---
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  echo "=== 运行时环境检测 ==="
  echo "OS:              $OS_TYPE"
  echo "容器运行时:      ${CONTAINER_RUNTIME:-未检测到}"
  echo "Compose 命令:    ${COMPOSE_CMD:-未检测到}"
  echo "容器 Exec:       ${CONTAINER_EXEC:-未检测到}"
  echo "容器 PS:         ${CONTAINER_PS:-未检测到}"
  echo ""

  if [ -z "$CONTAINER_RUNTIME" ]; then
    echo "❌ 错误: 未检测到 Docker 或 Podman"
    echo "   请安装 Docker Desktop (推荐) 或 Podman"
    exit 1
  fi

  echo "✅ 检测完成"
fi