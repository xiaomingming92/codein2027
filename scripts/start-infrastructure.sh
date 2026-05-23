#!/bin/bash
# 团队协同智能体 - 基础设施启动脚本
# 自动检测 Docker/Podman，优先使用 Docker

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/detect-runtime.sh"

echo "🚀 启动知识库基础设施服务"
echo "=============================="
echo "运行时: $CONTAINER_RUNTIME | Compose: $COMPOSE_CMD | OS: $OS_TYPE"
echo ""

COMPOSE_FILE=$(detect_compose_file "$PROJECT_DIR")

if [ -z "$COMPOSE_FILE" ]; then
  echo "❌ 错误: 未找到 compose 配置文件"
  exit 1
fi

echo "📦 使用 Compose 文件: $COMPOSE_FILE"
echo ""

echo "🔄 启动 PostgreSQL 和 ChromaDB..."
$COMPOSE_CMD -f "$COMPOSE_FILE" up -d

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 服务启动成功!"
    echo ""
    echo "📊 服务状态:"
    $COMPOSE_CMD -f "$COMPOSE_FILE" ps
    echo ""
    
    echo "⏳ 等待服务就绪 (5秒)..."
    sleep 5
    
    if curl -s http://localhost:5432 > /dev/null 2>&1 || pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
        echo "✅ PostgreSQL 已就绪 (localhost:5432)"
    else
        echo "⚠️  PostgreSQL 可能还在启动中..."
    fi
    
    if curl -s http://localhost:8000/api/v1/heartbeat > /dev/null 2>&1; then
        echo "✅ ChromaDB 已就绪 (localhost:8000)"
        echo ""
        echo "💡 提示:"
        echo "   - Chroma 集合名称: team_coordinator"
        echo "   - 认证 Token: team-coordinator-secret-token-2026"
        echo "   - 数据持久化目录: ./data/chroma"
    else
        echo "⚠️  ChromaDB 可能还在启动中..."
        echo "   请稍后检查: curl http://localhost:8000/api/v1/heartbeat"
    fi
    
    echo ""
    echo "=============================="
    echo "🎉 基础设施已准备就绪!"
    echo "   现在可以运行 npm run dev 启动应用了"
else
    echo ""
    echo "❌ 服务启动失败!"
    echo "   请检查日志: $COMPOSE_CMD -f $COMPOSE_FILE logs"
    exit 1
fi