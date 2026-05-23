#!/bin/bash
# 数据库状态检查脚本
# 自动检测 Docker/Podman

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/detect-runtime.sh"

echo "📦 基础设施状态:"
echo ""

echo "PostgreSQL:"
$CONTAINER_PS --filter name=team-coordinator-postgres --format "  {{.Status}} ({{.Ports}})" 2>/dev/null || echo "  ❌ 未运行"

echo ""

echo "ChromaDB:"
curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1 && echo "  ✅ 运行中 (localhost:8000)" || echo "  ❌ 未运行 (localhost:8000)"