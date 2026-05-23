# RAG 知识库系统技术文档

## 目录

- [1. 系统架构](#1-系统架构)
- [2. 分层设计](#2-分层设计)
- [3. 数据流转](#3-数据流转)
- [4. 触发流程](#4-触发流程)
- [5. CLI 命令](#5-cli-命令)
- [6. 日志查看](#6-日志查看)
- [7. ChromaDB 配置](#7-chromadb-配置)
- [8. SQL 查询](#8-sql-查询)
- [9. 环境变量](#9-环境变量)
- [10. Agent 审计日志](#10-agent-审计日志)
- [11. 故障排查](#11-故障排查)

---

## 1. 系统架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          用户界面层                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │  知识库管理面板    │  │  聊天对话界面      │  │  文档上传        │      │
│  │  (同步/查看/删除)  │  │  (RAG问答)        │  │  (拖拽上传)      │      │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘      │
└───────────┼──────────────────────┼──────────────────────┼───────────────┘
            │                      │                      │
            ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          API 路由层                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │ /api/knowledge/  │  │ /api/agent/      │  │ /api/knowledge/  │      │
│  │ sync (SSE流式)   │  │ chat/stream      │  │ upload           │      │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘      │
└───────────┼──────────────────────┼──────────────────────┼───────────────┘
            │                      │                      │
            ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          服务层                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │ knowledge-sync   │  │ LangGraph Agent  │  │ document-parser  │      │
│  │ (同步/变更检测)   │  │ (意图→检索→推理)  │  │ (文档解析)       │      │
│  └────────┬─────────┘  └────────┬─────────┘  └──────────────────┘      │
│           │                      │                                     │
│  ┌────────┴─────────┐  ┌────────┴─────────┐                           │
│  │ knowledge-indexer│  │ retrieval-node   │                           │
│  │ (分块/向量化)     │  │ (RAG检索)        │                           │
│  └────────┬─────────┘  └────────┬─────────┘                           │
└───────────┼──────────────────────┼─────────────────────────────────────┘
            │                      │
            ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          存储层                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│  │   PostgreSQL     │  │    ChromaDB      │  │   文件系统        │      │
│  │ (文档元数据/状态) │  │ (向量数据)        │  │ (docs/*/knowledge)│     │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 分层设计

### 2.1 文件结构

```
src/
├── app/api/
│   ├── knowledge/
│   │   ├── sync/route.ts          # 同步 API (POST=SSE流式, GET=统计)
│   │   ├── upload/route.ts        # 上传 API
│   │   └── documents/
│   │       ├── route.ts           # 文档列表 API
│   │       └── [id]/
│   │           ├── route.ts       # 文档删除 API
│   │           └── progress/route.ts  # SSE 进度推送
│   └── agent/
│       ├── chat/route.ts          # 同步聊天 API
│       └── stream/route.ts        # 流式聊天 API (SSE)
│
├── services/
│   ├── knowledge-sync.ts          # 知识库同步核心服务
│   ├── knowledge-indexer.ts       # 向量化核心服务 (DirectChromaClient)
│   ├── document-parser.ts         # 文档解析服务
│   ├── document-indexer.ts        # 文档索引服务 (LangChain Chroma)
│   └── reasoning-engine.ts        # 证据链推理引擎
│
├── agents/
│   ├── index.ts                   # LangGraph 工作流定义
│   ├── state.ts                   # Agent 状态定义
│   ├── nodes/
│   │   ├── intention.ts           # 意图识别节点
│   │   ├── retrieval.ts           # RAG 检索节点 ★
│   │   ├── reasoning.ts           # 推理节点
│   │   ├── verdict.ts             # 裁决节点
│   │   └── response.ts            # 回复生成节点
│   ├── edges/
│   │   └── conditional.ts         # 条件路由
│   └── tools/
│       └── impl/
│           ├── search-documents.ts  # Agent 工具: 文档搜索
│           └── index-documents.ts   # Agent 工具: 文档索引
│
├── lib/
│   ├── audit-logger.ts            # 审计日志 (console + 文件双写)
│   ├── prisma.ts                  # Prisma 客户端
│   ├── embeddings/index.ts        # Embedding 配置
│   ├── llm/index.ts               # LLM 配置
│   └── chroma.ts                  # LangChain Chroma 封装
│
├── constants/
│   └── doc-status.ts              # 文档状态常量 + UI状态映射
│
├── components/knowledge/
│   └── knowledge-base-panel.tsx   # 知识库管理前端组件
│
└── dto/
    └── agent.dto.ts               # 聊天请求/响应 DTO

scripts/
├── kb-sync.ts                     # CLI: 同步知识库
├── kb-reset.ts                    # CLI: 重置知识库
├── kb-export.ts                   # CLI: 导出知识库
└── kb-import.ts                   # CLI: 导入知识库

logs/knowledge-base/
└── kb-audit.log                   # 审计日志文件
```

### 2.2 核心模块职责

| 模块 | 职责 | 关键函数 |
|------|------|---------|
| `knowledge-sync.ts` | 同步文件系统知识库到数据库和向量库 | `syncKnowledgeBase()`, `getSyncStats()` |
| `knowledge-indexer.ts` | 文档解析、分块、向量化入库 | `indexKnowledgeDocument()`, `searchKnowledgeDocuments()`, `deleteKnowledgeVectors()` |
| `document-parser.ts` | 解析 PDF/DOCX/MD/TXT/图片等格式 | `parseDocument()`, `parseDocumentFromBuffer()` |
| `audit-logger.ts` | 审计日志双写（console + 文件） | `audit()`, `auditDoc()`, `auditToken()`, `auditSummary()` |
| `retrieval.ts` | RAG 检索节点，调用向量搜索 | `retrievalNode()` |
| `doc-status.ts` | 状态常量统一管理 | `DOC_STATUS`, `SOURCE_TYPE`, `STATUS_DISPLAY` |

---

## 3. 数据流转

### 3.1 知识入库流程（同步按钮 / kb:sync）

```
docs/*/knowledge/          PostgreSQL              ChromaDB
     │                        │                       │
     │  ① 扫描文件系统         │                       │
     ├───────────────────────►│                       │
     │                        │                       │
     │  ② 对比 contentHash    │                       │
     │     检测变更            │                       │
     │                        │                       │
     │  ③ 新增/修改文档        │                       │
     ├───────────────────────►│  创建 Document 记录    │
     │                        │  status=INDEXING       │
     │                        │                       │
     │  ④ 解析文档内容         │                       │
     │  ⑤ 文本分块 (1000字/块) │                       │
     │  ⑥ 逐块向量化           │                       │
     ├────────────────────────┼──────────────────────►│
     │                        │  add vectors           │
     │                        │                       │
     │  ⑦ 更新状态             │                       │
     ├───────────────────────►│  status=INDEXED        │
     │                        │  vectorIds=[...]       │
     │                        │  metadata.lastSyncAudit│
```

### 3.2 RAG 检索流程（聊天对话）

```
用户提问
    │
    ▼
POST /api/agent/chat 或 /api/agent/stream
    │
    ▼
LangGraph 工作流:
    │
    ├─► intentionNode (LLM 意图识别)
    │      提取: intent, entities, query
    │
    ├─► routeByIntent (条件路由)
    │      question/decision → retrieval
    │      creation/modification/chat → response
    │
    ├─► retrievalNode (RAG 检索) ★
    │      searchKnowledgeDocuments(query, 5)
    │      → DirectChromaClient.query()
    │      → ChromaDB /api/v1/collections/{id}/query
    │      → 返回 {content, metadata, score}[]
    │      → 构建 evidenceChain
    │
    ├─► reasoningNode (LLM 推理)
    │      基于 evidenceChain 生成推理路径
    │
    ├─► verdictNode (LLM 裁决)
    │      生成裁决结论和置信度
    │
    └─► responseNode (回复生成)
           格式化输出用户友好的回复
```

### 3.3 文档状态机

```
                    PROJECT_DOC                  KNOWLEDGE_UPDATE
                    ──────────                  ────────────────
初始状态:           PENDING                      PENDING_INDEX
                    │                            │
同步触发:           INDEXING                     PENDING → INDEXING
                    │                            │
向量化成功:         INDEXED                      INDEXED
                    │                            │
文件变更:           OUTDATED                     (不变)
                    │
向量化失败:         ERROR                        ERROR
                    │
重试:               INDEXING → INDEXED/ERROR     INDEXING → INDEXED/ERROR
```

### 3.4 UI 状态映射

| 数据库状态 (DocStatus) | UI 显示 | 含义 |
|----------------------|---------|------|
| `PENDING_INDEX` | pending | 待索引（上传文档等待同步） |
| `PENDING` | processing | 处理中（静态文档等待同步） |
| `INDEXING` | processing | 正在向量化 |
| `INDEXED` | ready | 已就绪 |
| `OUTDATED` | outdated | 已过期 |
| `ERROR` | error | 错误 |

---

## 4. 触发流程

### 4.1 前端按钮触发

```
用户点击 "同步知识库" 按钮
    │
    ▼
knowledge-base-panel.tsx → handleSync()
    │
    ▼
fetch POST /api/knowledge/sync
    │
    ▼
route.ts → POST handler
    │  创建 SSE ReadableStream
    │
    ▼
syncKnowledgeBase(onProgress)
    │
    ├─ Phase 1: 扫描 docs/*/knowledge/ 目录
    ├─ Phase 2: 检测变更 (contentHash 对比)
    ├─ Phase 3: 处理删除的文件
    ├─ Phase 4: 处理修改的文件
    ├─ Phase 5: 处理新增的文件
    ├─ Phase 6: 处理用户上传的待索引文档
    ├─ Phase 7: 重试失败的静态文档
    │
    ▼
SSE 推送进度 → 前端实时更新
    │
    ▼
完成后刷新文档列表和统计
```

### 4.2 CLI 触发

```bash
# 同步知识库（与前端按钮共享同一核心函数 syncKnowledgeBase）
npm run kb:sync

# 重置知识库（删除 ChromaDB 集合 → 重置数据库状态 → 重新同步）
npm run kb:reset

# 查看审计日志
npm run kb:logs

# 清空日志
npm run kb:logs:clear
```

### 4.3 触发方式对比

| 触发方式 | 入口 | 核心函数 | 响应方式 |
|---------|------|---------|---------|
| 前端按钮 | `handleSync()` → `POST /api/knowledge/sync` | `syncKnowledgeBase()` | SSE 流式 |
| CLI kb:sync | `scripts/kb-sync.ts` | `syncKnowledgeBase()` | 控制台输出 |
| CLI kb:reset | `scripts/kb-reset.ts` | 删除集合 + `syncKnowledgeBase()` | 控制台输出 |

**注意**: `kb:sync` 和前端按钮**不互相调用**，它们是两个独立入口，共享同一个核心函数 `syncKnowledgeBase()`。

---

## 5. CLI 命令

### 5.1 命令列表

| 命令 | 说明 | 用法 |
|------|------|------|
| `npm run kb:sync` | 同步知识库 | 扫描文件系统 → 检测变更 → 向量化 |
| `npm run kb:reset` | 重置知识库 | 删除 ChromaDB 集合 → 重置状态 → 重新同步 |
| `npm run kb:export` | 导出知识库 | 导出为压缩包 |
| `npm run kb:import` | 导入知识库 | 从压缩包导入 |
| `npm run kb:logs` | 查看日志 | 显示最近 100 行审计日志 |
| `npm run kb:logs:clear` | 清空日志 | 清空审计日志文件 |

### 5.2 kb:reset 执行流程

```
步骤 1/4: 删除 ChromaDB 集合
    DELETE /api/v1/collections/{collection_name}
    重置内存中的 DirectChromaClient 缓存

步骤 2/4: 重置数据库文档状态
    所有 PROJECT_DOC → status=PENDING, vectorIds=[]
    所有 KNOWLEDGE_UPDATE → status=PENDING_INDEX, vectorIds=[]

步骤 3/4: 重新同步知识库
    调用 syncKnowledgeBase() 完整流程

步骤 4/4: 验证结果
    查询最终文档状态，输出统计
```

---

## 6. 日志查看

### 6.1 日志配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `KB_LOG_DIR` | `logs/knowledge-base` | 日志目录 |
| `KB_LOG_FILE` | `kb-audit.log` | 日志文件名 |
| `KB_ENABLE_FILE_LOG` | `true` (development) | 是否启用文件日志 |

### 6.2 日志格式

```
[KB-AUDIT] [ISO时间戳] [阶段] 详细信息 | {JSON额外数据}
[KB-AUDIT] ═══ [阶段] 开始(N个): 描述 ═══
[KB-AUDIT] ═══ [阶段] 结束: 描述 ═══
```

### 6.3 日志阶段

| 阶段 | 说明 |
|------|------|
| `SYNC_START` | 同步开始/结束 |
| `SCAN` | 文件系统扫描结果 |
| `DETECT_CHANGES` | 变更检测结果 |
| `PHASE_DELETED` | 删除阶段（每个文档） |
| `PHASE_MODIFIED` | 修改阶段（每个文档） |
| `PHASE_ADDED` | 新增阶段（每个文档） |
| `PHASE_KNOWLEDGE_UPDATE` | 上传文档处理（每个文档） |
| `PHASE_RETRY` | 重试失败文档 |
| `VECTORIZE_START` | 文档开始向量化 |
| `VECTORIZE_CHUNK` | 每个 chunk 的 token/duration |
| `VECTORIZE_DONE` | 向量化完成摘要 |
| `VECTORIZE_FAIL` | 向量化失败 |
| `SYNC_DONE` | 同步异常终止 |

### 6.4 日志查看命令

```bash
# 查看最近 100 行日志
npm run kb:logs

# 直接查看日志文件
cat logs/knowledge-base/kb-audit.log

# 实时跟踪日志
tail -f logs/knowledge-base/kb-audit.log

# 过滤特定文档的日志
grep "智能体总体架构说明书" logs/knowledge-base/kb-audit.log

# 过滤向量化失败的日志
grep "VECTORIZE_FAIL" logs/knowledge-base/kb-audit.log

# 过滤特定时间段的日志
grep "2026-05-12T01:1" logs/knowledge-base/kb-audit.log

# 清空日志
npm run kb:logs:clear
```

### 6.5 日志示例

```
[KB-AUDIT] ═══ [SYNC_START] 开始: 同步知识库 ═══
[KB-AUDIT] [2026-05-12T01:17:55.108Z] [SCAN] 发现 9 个文件
[KB-AUDIT] [2026-05-12T01:17:55.111Z] [DETECT_CHANGES] 新增:0 修改:0 删除:0 未变:9
[KB-AUDIT] ═══ [PHASE_RETRY] 开始 (9个): 重试未完成索引的静态文档 ═══
[KB-AUDIT] [2026-05-12T01:17:55.165Z] [VECTORIZE_START] 📄 《智能体总体架构说明书》.md (cmp0zf6co0000lz4x180qjpi5) → 开始向量化
[KB-AUDIT] [2026-05-12T01:17:55.215Z] [VECTORIZE_CHUNK] 块#0 《智能体总体架构说明书》.md | {"tokens_estimated":221,"duration_ms":9}
[KB-AUDIT] [2026-05-12T01:17:55.286Z] [VECTORIZE_DONE] 《智能体总体架构说明书》.md 完成 | {"total_tokens_estimated":1759,"total_duration_ms":115,"vectors":8}
[KB-AUDIT] ═══ [PHASE_RETRY] 结束: 完成重试 9 个文档 ═══
[KB-AUDIT] ═══ [SYNC_START] 结束: 同步完成: 新增 9, 更新 0, 删除 0 | 上传文档 0 | 错误 0 ═══
```

---

## 7. ChromaDB 配置

### 7.1 连接参数

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `CHROMA_HOST` | `localhost` | ChromaDB 主机 |
| `CHROMA_PORT` | `8000` | ChromaDB 端口 |
| `CHROMA_COLLECTION` | `team_coordinator` | 集合名称 |
| `CHROMA_AUTH_TOKEN` | (空) | Bearer Token 认证 |

### 7.2 客户端实现

项目使用 **DirectChromaClient**（直接 HTTP 调用 ChromaDB REST API），而非 LangChain 的 Chroma SDK，原因是 LangChain 的 Chroma 封装不支持 Bearer Token 认证。

```
DirectChromaClient
├── getOrCreateCollection(name)   → POST /api/v1/collections
├── add(collectionId, data)       → POST /api/v1/collections/{id}/add
├── query(collectionId, data)     → POST /api/v1/collections/{id}/query
├── delete(collectionId, data)    → POST /api/v1/collections/{id}/delete
└── count(collectionId)           → GET  /api/v1/collections/{id}/count
```

### 7.3 ChromaDB 运维命令

```bash
# 检查 ChromaDB 状态
npm run db:status

# 查看集合信息
curl -s -H "Authorization: Bearer $CHROMA_AUTH_TOKEN" \
  "http://localhost:8000/api/v1/collections/team_coordinator"

# 查看向量数量（需要集合 UUID）
curl -s -H "Authorization: Bearer $CHROMA_AUTH_TOKEN" \
  "http://localhost:8000/api/v1/collections/{UUID}/count"

# 查看所有集合
curl -s -H "Authorization: Bearer $CHROMA_AUTH_TOKEN" \
  "http://localhost:8000/api/v1/collections"

# 心跳检测
curl -s "http://localhost:8000/api/v1/heartbeat"
```

### 7.4 向量化参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 分块大小 | 1000 字符 | `RecursiveCharacterTextSplitter.chunkSize` |
| 分块重叠 | 100 字符 | `RecursiveCharacterTextSplitter.chunkOverlap` |
| 分隔符优先级 | `\n\n` > `\n` > `。！？` > `.!?` > ` ` | 中文优先分隔 |
| Embedding 模型 | `text-embedding-v4` (阿里云百炼) | 通过 `getEmbeddings()` 配置 |
| Chunk ID 格式 | `{documentId}-chunk-{index}` | 确保幂等性 |

---

## 8. SQL 查询

### 8.1 常用诊断查询

```sql
-- 查看所有知识库文档状态
SELECT id, name, status, source_type,
       COALESCE(array_length(vector_ids, 1), 0) AS vector_count,
       metadata->>'path' AS file_path,
       metadata->>'lastSyncAudit' AS last_audit
FROM "Document"
WHERE source_type IN ('PROJECT_DOC', 'KNOWLEDGE_UPDATE')
ORDER BY updated_at DESC;

-- 统计各状态文档数量
SELECT status, source_type, COUNT(*) AS count
FROM "Document"
WHERE source_type IN ('PROJECT_DOC', 'KNOWLEDGE_UPDATE')
GROUP BY status, source_type
ORDER BY status;

-- 查找向量化失败的文档
SELECT id, name, status, metadata
FROM "Document"
WHERE status = 'ERROR'
  AND source_type IN ('PROJECT_DOC', 'KNOWLEDGE_UPDATE');

-- 查找卡在处理中的文档（vectorIds 为空但状态不是 PENDING）
SELECT id, name, status,
       vector_ids,
       metadata->>'path' AS file_path
FROM "Document"
WHERE status IN ('INDEXING')
  AND source_type = 'PROJECT_DOC'
  AND (vector_ids IS NULL OR vector_ids = '{}');

-- 查看文档审计信息
SELECT name,
       metadata->'lastSyncAudit'->>'vectorizedAt' AS vectorized_at,
       metadata->'lastSyncAudit'->>'vectorCount' AS vector_count,
       metadata->'lastSyncAudit'->>'totalTokens' AS total_tokens,
       metadata->'lastSyncAudit'->>'totalDurationMs' AS duration_ms,
       metadata->'lastSyncAudit'->>'chunkCount' AS chunk_count
FROM "Document"
WHERE source_type = 'PROJECT_DOC'
  AND metadata->'lastSyncAudit' IS NOT NULL;

-- 查看特定文档的完整信息
SELECT id, name, status, source_type, content_hash,
       vector_ids, metadata, created_at, updated_at
FROM "Document"
WHERE name = '《智能体总体架构说明书》.md';

-- 重置单个文档状态（用于手动修复）
UPDATE "Document"
SET status = 'PENDING', vector_ids = '{}'
WHERE id = '文档ID';

-- 删除所有知识库文档（慎用！）
DELETE FROM "Document"
WHERE source_type IN ('PROJECT_DOC', 'KNOWLEDGE_UPDATE');
```

### 8.2 通过 psql 执行

```bash
# 进入数据库
podman exec -it team-coordinator-postgres psql -U team_admin -d team_coordinator

# 或者直接执行查询
podman exec -it team-coordinator-postgres psql -U team_admin -d team_coordinator \
  -c "SELECT name, status, source_type FROM \"Document\" WHERE source_type = 'PROJECT_DOC';"
```

---

## 9. 环境变量

### 9.1 完整配置参考

```env
# Database - PostgreSQL
DATABASE_URL="postgresql://team_admin:team_secure_pass_2024@localhost:5432/team_coordinator?schema=public"

# Chroma Vector Database
CHROMA_HOST="localhost"
CHROMA_PORT="8000"
CHROMA_COLLECTION="team_coordinator"
CHROMA_AUTH_TOKEN="your-chroma-auth-token"

# JWT
JWT_SECRET="your-jwt-secret"
JWT_EXPIRES_IN="7d"

# LLM - Alibaba Cloud 百炼
OPENAI_API_KEY="your-api-key"
LLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
LLM_MODEL="qwen-vl-plus"
EMBEDDING_MODEL="text-embedding-v4"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"

# Knowledge Base Logging
KB_LOG_DIR="logs/knowledge-base"
KB_LOG_FILE="kb-audit.log"
KB_ENABLE_FILE_LOG="true"
```

### 9.2 环境变量说明

| 变量 | 必需 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接字符串 |
| `CHROMA_HOST` | ✅ | ChromaDB 主机地址 |
| `CHROMA_PORT` | ✅ | ChromaDB 端口 |
| `CHROMA_COLLECTION` | ✅ | ChromaDB 集合名称 |
| `CHROMA_AUTH_TOKEN` | ✅ | ChromaDB Bearer Token |
| `OPENAI_API_KEY` | ✅ | LLM/Embedding API Key |
| `LLM_BASE_URL` | ✅ | LLM API Base URL |
| `LLM_MODEL` | ❌ | 聊天模型（默认 qwen-vl-plus） |
| `EMBEDDING_MODEL` | ❌ | Embedding 模型（默认 text-embedding-v4） |
| `KB_LOG_DIR` | ❌ | 日志目录（默认 logs/knowledge-base） |
| `KB_LOG_FILE` | ❌ | 日志文件名（默认 kb-audit.log） |
| `KB_ENABLE_FILE_LOG` | ❌ | 启用文件日志（默认 development=true） |
| `AGENT_LOG_DIR` | ❌ | Agent日志目录（默认 logs/agent） |
| `AGENT_LOG_FILE` | ❌ | Agent日志文件名（默认 agent-audit.log） |
| `AGENT_ENABLE_FILE_LOG` | ❌ | 启用Agent文件日志（默认 development=true） |

---

## 10. Agent 审计日志

### 10.1 概述

Agent 工作流（聊天对话）的每一层都有审计日志，覆盖从 API 请求到 LLM 调用到节点执行的完整链路。

### 10.2 日志配置

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `AGENT_LOG_DIR` | `logs/agent` | 日志目录 |
| `AGENT_LOG_FILE` | `agent-audit.log` | 日志文件名 |
| `AGENT_ENABLE_FILE_LOG` | `true` (development) | 是否启用文件日志 |

### 10.3 日志格式

```
[AGENT-AUDIT] [ISO时间戳] [阶段] 详细信息 | {JSON额外数据}
```

### 10.4 日志阶段

| 阶段 | 说明 | 关键数据 |
|------|------|---------|
| `CHAT_REQUEST` | 请求进入 | threadId, messageCount, preview |
| `CHAT_RESPONSE` | 响应返回 | threadId, durationMs, verdictType |
| `CHAT_ERROR` | 请求失败 | threadId, error, context, stack |
| `NODE_START` | 节点开始 | nodeName |
| `NODE_END` | 节点完成 | nodeName, durationMs, 阶段特定数据 |
| `NODE_ERROR` | 节点失败 | nodeName, error |
| `LLM_CALL` | LLM调用成功 | model, durationMs, inputLength, outputLength |
| `LLM_ERROR` | LLM调用失败 | model, error |
| `ROUTE` | 条件路由决策 | fromNode, toNode, reason |
| `RETRIEVAL_RESULT` | 检索结果 | query, resultCount, evidenceCount |

### 10.5 审计覆盖层

```
┌─ API 路由层 ─────────────────────────────────────────────┐
│  CHAT_REQUEST → [工作流] → CHAT_RESPONSE / CHAT_ERROR    │
└──────────────────────────────────────────────────────────┘
         │
┌─ 工作流层 ───────────────────────────────────────────────┐
│  NODE_START(intention) → NODE_END(intention)              │
│  ROUTE(intention → retrieval/response)                    │
│  NODE_START(retrieval) → NODE_END(retrieval)              │
│  NODE_START(reasoning) → NODE_END(reasoning)              │
│  NODE_START(verdict) → NODE_END(verdict)                  │
│  NODE_START(response) → NODE_END(response)                │
└──────────────────────────────────────────────────────────┘
         │
┌─ LLM 层 ─────────────────────────────────────────────────┐
│  LLM_CALL(model, durationMs, inputLength, outputLength)   │
│  LLM_ERROR(model, error)                                  │
└──────────────────────────────────────────────────────────┘
```

### 10.6 日志查看命令

```bash
# 查看 Agent 审计日志（最近 100 行）
npm run agent:logs

# 实时跟踪
tail -f logs/agent/agent-audit.log

# 过滤 LLM 错误
grep "LLM_ERROR" logs/agent/agent-audit.log

# 过滤特定节点的日志
grep "NODE_START.*intention\|NODE_END.*intention" logs/agent/agent-audit.log

# 过滤路由决策
grep "ROUTE" logs/agent/agent-audit.log

# 过滤请求失败
grep "CHAT_ERROR" logs/agent/agent-audit.log

# 清空日志
npm run agent:logs:clear
```

### 10.7 诊断工具

```bash
# 一键诊断所有服务连通性
npm run agent:diagnose
```

输出示例：
```
═══════════════════════════════════════
  Agent 诊断工具
═══════════════════════════════════════

✅ [环境变量] 所有必需变量已配置
   已配置: DATABASE_URL, OPENAI_API_KEY, LLM_BASE_URL, CHROMA_HOST, CHROMA_PORT

✅ [LLM API] 连通正常, 响应: "OK" (1234ms)
   provider=cloud, model=qwen-vl-plus, baseURL=https://dashscope.aliyuncs.com/...

✅ [ChromaDB] 连通正常, 集合数: 1, 目标集合向量数: 59 (56ms)
   url=http://localhost:8000, collection=team_coordinator

✅ [PostgreSQL] 连通正常, 文档总数: 9, 已索引: 9 (12ms)
   DATABASE_URL=postgresql://team_admin:****@localhost:5432/...

═══════════════════════════════════════
  ✅ 所有服务连通正常
═══════════════════════════════════════
```

### 10.8 日志示例

一次完整的聊天请求日志：

```
[AGENT-AUDIT] [2026-05-12T02:00:00.000Z] [CHAT_REQUEST] 请求进入 thread=abc123 | {"threadId":"abc123","messageCount":1,"preview":"帮我分析一下水稻种植方案"}
[AGENT-AUDIT] [2026-05-12T02:00:00.001Z] [NODE_START] ▶ intention
[AGENT-AUDIT] [2026-05-12T02:00:00.050Z] [LLM_CALL] LLM调用 model=qwen-vl-plus | {"model":"qwen-vl-plus","durationMs":49,"inputLength":234,"outputLength":87}
[AGENT-AUDIT] [2026-05-12T02:00:00.051Z] [NODE_END] intention 解析成功: intent=decision | {"intent":"decision","keywords":["水稻","种植","方案"]}
[AGENT-AUDIT] [2026-05-12T02:00:00.051Z] [ROUTE] intention → retrieval | {"reason":"intent=decision"}
[AGENT-AUDIT] [2026-05-12T02:00:00.052Z] [NODE_START] ▶ retrieval
...
```
