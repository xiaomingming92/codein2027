#!/bin/bash
# 团队协同智能体 - 数据库启动脚本
# 自动检测 Docker/Podman，优先使用 Docker

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/detect-runtime.sh"

echo "=== 启动 PostgreSQL ==="
echo "运行时: $CONTAINER_RUNTIME | Compose: $COMPOSE_CMD"
echo ""

mkdir -p "$PROJECT_DIR/data/postgres"

COMPOSE_FILE=$(detect_compose_file "$PROJECT_DIR")

if [ -n "$COMPOSE_FILE" ]; then
  echo "使用 Compose 文件: $COMPOSE_FILE"
  $COMPOSE_CMD -f "$COMPOSE_FILE" up -d postgres
else
  echo "❌ 错误: 未找到 compose 配置文件"
  exit 1
fi

echo "等待 PostgreSQL 就绪..."
until $CONTAINER_EXEC team-coordinator-postgres pg_isready -U team_admin -d team_coordinator 2>/dev/null; do
  echo "PostgreSQL 正在启动..."
  sleep 2
done

echo ""
echo "=== PostgreSQL 已就绪 ==="
echo ""
echo "服务地址: localhost:5432"
echo "数据库名: team_coordinator"
echo "用户名:   team_admin"
echo ""
echo "停止服务: $COMPOSE_CMD -f $COMPOSE_FILE down"