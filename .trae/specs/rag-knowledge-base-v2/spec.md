# RAG 知识库 V2 Spec

## Why

当前 `fix-chat-ui-and-add-rag-tab` spec 已完成基础 UI，但知识库存在核心问题：
- 向量化是模拟的（setTimeout + 随机数），没有真实 RAG
- 没有文件去重、版本管理
- 没有文件系统知识库同步能力
- 缺少 Chroma 向量库导出/迁移机制
- Embedding 模型硬编码，不支持云/本地切换
- **LLM（推理模型）硬编码，不支持云/本地切换**
- **上传文件后立即向量化，用户无法批量确认，应该改为两阶段提交**

## What Changes

- **BREAKING**: 废弃 `KnowledgeDocument` 模型，统一使用 `Document` 模型
- **BREAKING**: `Document` 模型增加 `sourceType`、`contentHash`、`vectorIds` 等字段
- **BREAKING**: `DocStatus` 枚举增加 `PENDING_INDEX` 状态，区分"待同步"和"已索引"
- 上传 API 只保存文件和记录，`status=PENDING_INDEX`，**不立即向量化**
- 删除 API 级联清理 Chroma 向量（通过 `vectorIds` 字段）
- 上传改为 HTTP 分块 + SSE 进度推送（替代轮询）
- 新增文件系统知识库同步服务（扫描 `docs/*/knowledge/` 增量同步）
- **"同步知识库"按钮是唯一向量化入口**，批量处理 PENDING_INDEX 文档
- 新增上传文档版本管理（内容哈希去重、乐观锁）
- 新增可插拔 Embedding Provider 架构（云端 OpenAI 兼容风格 / 本地 Ollama）
- **新增可插拔 LLM Provider 架构（云端 OpenAI 兼容风格 / 本地 Ollama）**
- package.json 增加 `kb:sync`、`kb:export`、`kb:import`、`kb:reset` 脚本

## Impact

- Affected specs: `fix-chat-ui-and-add-rag-tab`
- Affected code:
  - `prisma/schema.prisma`
  - `src/app/api/knowledge/*`
  - `src/components/knowledge/knowledge-base-panel.tsx`
  - `src/services/document-indexer.ts`
  - `src/services/knowledge-indexer.ts`
  - `src/services/knowledge-sync.ts`
  - `src/lib/chroma.ts`
  - `src/lib/embeddings/` (新增 provider 目录)
  - `src/lib/llm/` (重构为工厂模式)
  - `src/agents/nodes/retrieval.ts`
  - `src/agents/index.ts`
  - `package.json`

## ADDED Requirements

### Requirement: 两阶段提交（Two-Stage Commit）向量化

The system SHALL use two-stage commit for document vectorization to allow batch confirmation.

#### Scenario: 上传文件（第一阶段）
- **WHEN** user uploads a PDF/MD/TXT file
- **THEN** the file is saved to `uploads/knowledge/` directory
- **AND** a Document record is created with `sourceType = KNOWLEDGE_UPDATE`
- **AND** `status = PENDING_INDEX` (NOT immediately vectorized)
- **AND** `contentHash` is computed for deduplication
- **NOTE**: This is a "draft" state - file is uploaded but NOT yet searchable

#### Scenario: 同步按钮（第二阶段）
- **WHEN** user clicks "同步知识库" button
- **THEN** the system finds all documents with `status = PENDING_INDEX`
- **AND** processes them in batch:
  - Parses file content using `document-parser.ts`
  - Adds to Chroma vector store
  - Updates `Document.vectorIds`
  - Sets `status = INDEXING` during processing
  - Sets `status = INDEXED` upon success
  - Sets `status = ERROR` upon failure
- **NOTE**: This is the "confirm" action - user explicitly confirms which files should be indexed

#### Scenario: 检索时只查询已索引文档
- **WHEN** system performs similarity search
- **THEN** only documents with `status = INDEXED` are searched
- **AND** documents with `status = PENDING_INDEX` are ignored
- **NOTE**: Unconfirmed documents should never appear in search results

### Requirement: 可插拔 LLM Provider 架构

The system SHALL support both cloud and local LLM providers through a unified factory.

#### Scenario: 云端 Provider（OpenAI 兼容风格）
- **WHEN** `LLM_PROVIDER = cloud`
- **THEN** use `@langchain/community/chat_models/openai` (ChatOpenAI from community, not langchain/openai)
- **AND** reads `OPENAI_API_KEY` for authentication
- **AND** reads `LLM_BASE_URL` for custom endpoint (e.g., DashScope, Azure, etc.)
- **AND** reads `LLM_MODEL` for model name
- **NOTE**: 使用 community 版本而非 langchain/openai 版本，因为 community 版本对各种 OpenAI 兼容 API 的兼容性更好

#### Scenario: 本地 Provider（Ollama）
- **WHEN** `LLM_PROVIDER = ollama`
- **THEN** use `@langchain/community/chat_models/ollama` (ChatOllama from community)
- **AND** reads `OLLAMA_BASE_URL` (default: "http://localhost:11434")
- **AND** reads `OLLAMA_MODEL` (default: "qwen2.5")

#### Scenario: LLM Provider 配置示例
```bash
# 云端（OpenAI 兼容风格）- 通用方案，适用于 OpenAI/DashScope/Azure 等
LLM_PROVIDER=cloud
OPENAI_API_KEY=sk-xxx
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-vl-plus

# 本地 Ollama
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5
```

#### Scenario: 统一 Provider 配置
- **WHEN** both embedding and LLM use cloud provider
- **THEN** they can use different baseURL and model configurations
- **AND** embedding might use: `EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`, `EMBEDDING_MODEL=text-embedding-v4`
- **AND** LLM might use: `LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`, `LLM_MODEL=qwen-vl-plus`
- **NOTE**: 这允许 embedding 和 LLM 使用不同的提供商或不同的模型

### Requirement: 可插拔 Embedding Provider 架构

The system SHALL support both cloud and local embedding providers through a unified factory.

#### Scenario: 云端 Provider（OpenAI 兼容风格）
- **WHEN** `EMBEDDING_PROVIDER = cloud`
- **THEN** use `@langchain/community/embeddings/openai` (OpenAIEmbeddings from community)
- **AND** reads `OPENAI_API_KEY` for authentication
- **AND** reads `EMBEDDING_BASE_URL` for custom endpoint
- **AND** reads `EMBEDDING_MODEL` for model name
- **NOTE**: All cloud providers (OpenAI, DashScope, Azure, etc.) that support OpenAI-compatible API use this provider

#### Scenario: 本地 Provider（Ollama）
- **WHEN** `EMBEDDING_PROVIDER = ollama`
- **THEN** use `@langchain/community/embeddings/ollama` (OllamaEmbeddings from community)
- **AND** reads `OLLAMA_BASE_URL`
- **AND** reads `OLLAMA_EMBEDDING_MODEL` (default: "nomic-embed-text")

#### Scenario: Provider 配置示例
```bash
# 云端（OpenAI 兼容风格）- 通用方案，适用于 OpenAI/DashScope/Azure 等
EMBEDDING_PROVIDER=cloud
OPENAI_API_KEY=sk-xxx
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v4

# 本地 Ollama
EMBEDDING_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### Requirement: 统一文档模型

The system SHALL provide a unified `Document` model supporting both project documents and knowledge base documents.

#### Scenario: 知识库文档存储
- **WHEN** user uploads a file to knowledge base
- **THEN** the file is stored in `Document` table with `sourceType = KNOWLEDGE_UPDATE`
- **AND** `status = PENDING_INDEX` (awaiting sync confirmation)
- **AND** the file is saved to `uploads/knowledge/` directory
- **AND** the existing project document functionality remains unaffected

#### Scenario: PROJECT_DOC vs KNOWLEDGE_UPDATE 区分
- **WHEN** file is in `docs/*/knowledge/` directory (static project document)
- **THEN** `sourceType = PROJECT_DOC`
- **AND** `projectId` is set to the parent directory name (e.g., "农业智能体(把地种智能体)", "团队协作智能体")
- **AND** `status = PENDING` initially, becomes `INDEXED` after sync
- **WHEN** file is uploaded via upload API (dynamic knowledge document)
- **THEN** `sourceType = KNOWLEDGE_UPDATE`
- **AND** `status = PENDING_INDEX` (awaiting user confirmation)
- **AND** `projectId` is null or user-specific

### Requirement: 文件系统知识库同步

The system SHALL support scanning `docs/*/knowledge/` directories and incrementally syncing to the vector store.

#### Scenario: 同步静态项目文档
- **WHEN** system syncs `docs/*/knowledge/` directories
- **THEN** documents are stored with `sourceType = PROJECT_DOC`
- **AND** `projectId` is set to the parent directory name
- **AND** `metadata.path` stores the relative file path
- **AND** `status = PENDING` initially, becomes `INDEXED` after sync

#### Scenario: 同步上传的待索引文档（KNOWLEDGE_UPDATE）
- **WHEN** user clicks "同步知识库" button
- **THEN** the system processes TWO types of pending documents:
  1. `sourceType = PROJECT_DOC` with `status = PENDING` (from file system changes)
  2. `sourceType = KNOWLEDGE_UPDATE` with `status = PENDING_INDEX` (from user uploads)
- **NOTE**: This allows both static files and user uploads to be indexed in one operation

#### Scenario: 手动同步
- **WHEN** user clicks "同步知识库" button
- **THEN** the system:
  - Scans all `docs/*/knowledge/` directories for PROJECT_DOC changes
  - Finds all KNOWLEDGE_UPDATE documents with `status = PENDING_INDEX`
  - Detects changes: added / modified / renamed / deleted / unchanged
  - Processes only changed files
  - Displays sync statistics

#### Scenario: 命令行同步
- **WHEN** developer runs `npm run kb:sync`
- **THEN** the system performs the same sync operation as the UI button

### Requirement: 上传文档版本管理

The system SHALL support content deduplication and version control for uploaded documents.

#### Scenario: 内容去重
- **WHEN** user uploads a file with identical content to an existing file (same contentHash)
- **THEN** the system rejects the upload with "相同内容的文件已存在"
- **AND** returns the existing document info
- **NOTE**: Only checks against `status = INDEXED` or `status = PENDING_INDEX` documents

#### Scenario: 版本递增
- **WHEN** user uploads a file with the same name but different content
- **THEN** the system creates a new version (version + 1)
- **AND** marks the old version as `status = OUTDATED`
- **AND** deletes old vectors from Chroma
- **NOTE**: New version starts with `status = PENDING_INDEX`, requires sync to become INDEXED

### Requirement: Chroma 向量库持久化

The system SHALL support exporting and importing Chroma vector data.

#### Scenario: 导出向量库
- **WHEN** developer runs `npm run kb:export`
- **THEN** the system exports all vectors and metadata to a JSON file

#### Scenario: 导入向量库
- **WHEN** developer runs `npm run kb:import`
- **THEN** the system imports vectors from the JSON backup

#### Scenario: 重置向量库
- **WHEN** developer runs `npm run kb:reset`
- **THEN** the system clears all vectors and re-indexes from database documents with `status = INDEXED`

## MODIFIED Requirements

### Requirement: Document Model

**Current**:
```prisma
model Document {
  id        String    @id @default(cuid())
  projectId String
  project   Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name      String
  type      String
  content   String?
  filePath  String?
  vectorIds String[]
  tags      String[]
  status    DocStatus @default(PENDING)
  version   Int       @default(1)
  metadata  Json?
  taskId    String?
  userId    String?
  createdBy String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum DocStatus {
  PENDING
  INDEXED
  OUTDATED
  ERROR
}
```

**New**:
```prisma
model Document {
  id          String      @id @default(cuid())
  sourceType  SourceType  @default(PROJECT_DOC)
  projectId   String?
  project     Project?    @relation(fields: [projectId], references: [id], onDelete: Cascade)
  name        String
  type        String
  content     String?
  filePath    String?
  vectorIds   String[]
  contentHash String?
  tags        String[]
  status      DocStatus   @default(PENDING)
  version     Int         @default(1)
  metadata    Json?
  taskId      String?
  userId      String?
  createdBy   String
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@unique([name, version, sourceType])
}

enum SourceType {
  PROJECT_DOC      // 静态项目文档: docs/*/knowledge/ 下的文件
  KNOWLEDGE_UPDATE // 动态上传文档: 用户通过上传接口添加的文档
}

enum DocStatus {
  PENDING_INDEX  // 待索引: 上传后等待同步确认（KNOWLEDGE_UPDATE 专用）
  PENDING        // 待处理: PROJECT_DOC 初始状态，等待同步
  INDEXING       // 正在索引: 同步过程中
  INDEXED        // 已索引: 可以被检索
  OUTDATED      // 已过期: 被新版本取代
  ERROR          // 错误: 向量化失败
}
```

**Migration**: Existing `KnowledgeDocument` records must be migrated to `Document` with `sourceType = KNOWLEDGE_UPDATE` and `status = PENDING_INDEX` before the `KnowledgeDocument` model is dropped.

## REMOVED Requirements

### Requirement: Immediate Vectorization on Upload

**Reason**: Replaced by two-stage commit pattern. Upload now only creates a draft record, sync button is the only trigger for vectorization.

**Migration**: Existing documents with `status = PENDING` should be treated as requiring sync.

### Requirement: KnowledgeDocument Model

**Reason**: Unified into `Document` model with `sourceType` field.

**Migration**: Run migration script to transfer existing `KnowledgeDocument` data to `Document` table.
