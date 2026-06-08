#!/bin/bash
# 数据库等待就绪脚本
# 自动检测 Docker/Podman

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/detect-runtime.sh"

ENV_FILE="$PROJECT_DIR/.env.${NODE_ENV:-development}"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

until $CONTAINER_EXEC farm-agent-postgres pg_isready -U farm_admin -d farm_agent 2>/dev/null; do
  echo "等待 PostgreSQL..."
  sleep 1
done
echo "PostgreSQL 已就绪"