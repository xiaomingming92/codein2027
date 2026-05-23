#!/bin/bash
# 团队协同智能体 - 数据库停止脚本
# 自动检测 Docker/Podman，优先使用 Docker

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/detect-runtime.sh"

echo "=== 停止 PostgreSQL 和 Chroma ==="
echo "运行时: $CONTAINER_RUNTIME | Compose: $COMPOSE_CMD"

COMPOSE_FILE=$(detect_compose_file "$PROJECT_DIR")

if [ -n "$COMPOSE_FILE" ]; then
  $COMPOSE_CMD -f "$COMPOSE_FILE" down
else
  echo "尝试直接停止容器..."
  $CONTAINER_RUNTIME stop team-coordinator-postgres team-coordinator-chroma 2>/dev/null || true
  $CONTAINER_RUNTIME rm team-coordinator-postgres team-coordinator-chroma 2>/dev/null || true
fi

echo ""
echo "=== 数据库服务已停止 ==="
echo ""
echo "注意: 数据保存在 data/postgres 和 data/chroma 目录中"
echo "如需清除数据: rm -rf data/postgres data/chroma"