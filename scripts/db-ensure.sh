#!/bin/bash
# 团队协同智能体 - 基础设施确保脚本
# 自动检测 Docker/Podman，优先使用 Docker
# 检查并启动 PostgreSQL + ChromaDB，执行数据库迁移和初始化

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

source "$SCRIPT_DIR/detect-runtime.sh"

ENV_FILE="$PROJECT_DIR/.env.${NODE_ENV:-development}"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

COMPOSE_FILE=$(detect_compose_file "$PROJECT_DIR")

echo "=== 检查基础设施状态 ==="
echo "运行时: $CONTAINER_RUNTIME | OS: $OS_TYPE"
echo ""

# 检查 PostgreSQL
echo "📦 [1/4] 检查 PostgreSQL..."
if $CONTAINER_PS --filter name=farm-agent-postgres --format '{{.Names}}' | grep -q farm-agent-postgres; then
  echo "   ✅ PostgreSQL 容器已在运行"
else
  echo "   🔄 启动 PostgreSQL 容器..."
  bash "$SCRIPT_DIR/start-db.sh"
fi

echo "⏳ 等待 PostgreSQL 就绪..."
until $CONTAINER_EXEC farm-agent-postgres pg_isready -U farm_admin -d farm_agent 2>/dev/null; do
  sleep 1
done
echo "   ✅ PostgreSQL 已就绪 (localhost:5432)"

# 检查 ChromaDB
echo ""
echo "🔍 [2/4] 检查 ChromaDB..."
CHROMA_HOST="${CHROMA_HOST:-localhost}"
CHROMA_PORT="${CHROMA_PORT:-8000}"

if curl -s --connect-timeout 2 "http://${CHROMA_HOST}:${CHROMA_PORT}/api/v1/heartbeat" > /dev/null 2>&1; then
  echo "   ✅ ChromaDB 已在运行 (${CHROMA_HOST}:${CHROMA_PORT})"
elif $CONTAINER_PS --filter name=farm-agent-chroma --format '{{.Names}}' | grep -q farm-agent-chroma; then
  echo "   ⏳ ChromaDB 容器存在但未就绪，等待启动..."
  
  for i in {1..30}; do
    if curl -s --connect-timeout 2 "http://${CHROMA_HOST}:${CHROMA_PORT}/api/v1/heartbeat" > /dev/null 2>&1; then
      echo "   ✅ ChromaDB 已就绪"
      break
    fi
    
    if [ $i -eq 30 ]; then
      echo "   ❌ ChromaDB 启动超时，尝试重启..."
      $CONTAINER_RUNTIME restart farm-agent-chroma || true
      sleep 5
    else
      sleep 1
    fi
  done
else
  echo "   🔄 启动 ChromaDB 容器..."
  
  mkdir -p "$PROJECT_DIR/data/chroma"
  
  cd "$PROJECT_DIR"
  
  if [ -n "$COMPOSE_FILE" ]; then
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d chromadb 2>/dev/null || {
      echo "   ⚠️  Compose 启动失败，尝试手动启动..."
      $CONTAINER_RUNTIME run -d \
        --name farm-agent-chroma \
        --restart unless-stopped \
        -p "${CHROMA_HOST}:${CHROMA_PORT}:8000" \
        -v "$PROJECT_DIR/data/chroma:/chroma/chroma" \
        -e TZ="Asia/Shanghai" \
        -e CHROMA_SERVER_AUTH_TOKENS="${CHROMA_AUTH_TOKEN:-farm-agent-chroma-token-2026}" \
        -e CHROMA_SERVER_AUTH_CREDENTIALS="${CHROMA_AUTH_TOKEN:-farm-agent-chroma-token-2026}" \
        chromadb/chroma:0.4.24 > /dev/null 2>&1
      
      if [ $? -ne 0 ]; then
        echo "   ❌ 无法启动 ChromaDB 容器"
      fi
    }
  else
    echo "   ❌ 未找到 compose 配置文件，无法自动启动 ChromaDB"
  fi
  
  echo "   ⏳ 等待 ChromaDB 就绪..."
  for i in {1..30}; do
    if curl -s --connect-timeout 2 "http://${CHROMA_HOST}:${CHROMA_PORT}/api/v1/heartbeat" > /dev/null 2>&1; then
      echo "   ✅ ChromaDB 已就绪 (${CHROMA_HOST}:${CHROMA_PORT})"
      break
    fi
    
    if [ $i -eq 30 ]; then
      echo "   ❌ ChromaDB 启动超时 (30秒)"
      echo "   💡 请检查: curl http://${CHROMA_HOST}:${CHROMA_PORT}/api/v1/heartbeat"
      echo "   💡 或手动: $COMPOSE_CMD -f $COMPOSE_FILE up -d chromadb"
    else
      sleep 1
    fi
  done
fi

# 验证 Chroma 连接
if curl -s --connect-timeout 2 "http://${CHROMA_HOST}:${CHROMA_PORT}/api/v1/heartbeat" > /dev/null 2>&1; then
  CHROMA_COLLECTION="${CHROMA_COLLECTION:-farm_agent}"
  echo "   📚 集合名称: ${CHROMA_COLLECTION}"
  echo "   🔐 认证: ${CHROMA_AUTH_TOKEN:+已配置}${CHROMA_AUTH_TOKEN:-未配置(无认证)}"
else
  echo "   ⚠️  ChromaDB 未就绪，向量化功能将不可用"
fi

# 生成 Prisma Client
echo ""
echo "🔧 [3/5] 生成 Prisma Client..."
cd "$PROJECT_DIR"
npx prisma generate

# 执行数据库迁移
echo ""
echo "🗄️  [4/5] 执行数据库迁移..."
npx prisma migrate deploy

# 安全初始化
echo ""
echo "🎬 [5/5] 初始化数据库..."
npx tsx "$SCRIPT_DIR/init-db.ts"

echo ""
echo "========================================="
echo "✅ 基础设施准备完成！"
echo "   PostgreSQL: ✅ 运行中 (localhost:5432)"
echo "   ChromaDB: $(curl -s --connect-timeout 2 'http://localhost:8000/api/v1/heartbeat' > /dev/null 2>&1 && echo '✅ 运行中 (localhost:8000)' || echo '❌ 未运行')"
echo "========================================="