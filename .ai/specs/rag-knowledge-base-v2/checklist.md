# Checklist

## Phase 1: 统一文档模型（数据层对齐）

- [x] Prisma schema 已修改，Document 模型包含 sourceType、contentHash 字段
- [x] SourceType 枚举已添加（PROJECT_DOC / KNOWLEDGE_UPDATE）
- [x] DocStatus 枚举已添加（PENDING_INDEX / PENDING / INDEXING / INDEXED / OUTDATED / ERROR）
- [x] projectId 已改为可选
- [x] @@unique([name, version, sourceType]) 索引已添加
- [x] KnowledgeDocument 模型已删除
- [x] 数据库迁移已执行
- [x] 现有 KnowledgeDocument 数据已迁移到 Document 表
- [x] GET /api/knowledge/documents 已重写
- [x] POST /api/knowledge/upload 已重写
- [x] DELETE /api/knowledge/documents/:id 已重写
- [x] 前端 KnowledgeBasePanel 已适配新 API

## Phase 2: 真实向量化（核心能力）

- [x] knowledge-indexer.ts 已创建
- [x] parseDocumentFromBuffer 已集成
- [x] chroma.addDocuments 已集成
- [x] vectorIds 已记录到 Document 表
- [x] Document.status 已正确更新
- [x] Task 2.2: 上传 API 改为两阶段提交
  - [x] POST /api/knowledge/upload 只保存文件和记录
  - [x] status = PENDING_INDEX，不立即触发向量化
  - [x] 返回 { status: "pending_index" }
- [x] 删除 API 级联清理 Chroma 向量
- [x] SSE 进度推送端点已创建
- [x] 前端使用 fetch + ReadableStream 接收 SSE
- [x] Agent retrievalNode 已接入知识库检索
- [x] 检索时只查询 status = INDEXED 的文档

## Phase 3: 文件系统知识库同步

- [x] Task 3.2: 修复 sourceType 和 projectId 逻辑
  - [x] 同步静态文件使用 `sourceType = PROJECT_DOC`
  - [x] 根据父目录名设置 `projectId`
  - [x] 查询时按 `sourceType = PROJECT_DOC` 而非 `KNOWLEDGE_UPDATE`
- [x] Task 3.4: 增量索引实现
  - [x] 新增文件解析 + 向量化
  - [x] 修改文件删除旧向量 + 重建
  - [x] 删除文件清理向量库和数据库

## Phase 3.5: 两阶段提交同步（统一同步入口）

- [x] Task 3.8: 重构同步服务，支持批量处理待索引文档
  - [x] syncKnowledgeBase() 同时处理 PROJECT_DOC 和 KNOWLEDGE_UPDATE
  - [x] PROJECT_DOC: 处理 status = PENDING 的文件
  - [x] KNOWLEDGE_UPDATE: 处理 status = PENDING_INDEX 的文件
  - [x] 同步过程中设置 status = INDEXING
- [x] Task 3.9: 更新同步统计，显示待索引文档数量
  - [x] getSyncStats() 返回 PENDING_INDEX 文档数量
  - [x] 前端显示 "N 个文档待同步"

## Phase 4: 上传文档版本管理

- [x] 上传 API 实现内容去重（contentHash）
- [x] 上传 API 实现版本递增
- [x] 旧版本标记为 OUTDATED
- [x] 旧向量已清理

## Phase 5: 可插拔 Embedding Provider 架构

- [x] Task 5.1: Embedding Provider 工厂函数已创建
  - [x] src/lib/embeddings/index.ts 已创建
  - [x] 根据 EMBEDDING_PROVIDER 选择 cloud 或 ollama
- [x] Task 5.2: Cloud Provider（OpenAI 兼容风格）已实现
  - [x] OpenAIEmbeddings + 自定义 baseURL
  - [x] 支持 OPENAI_API_KEY、EMBEDDING_BASE_URL、EMBEDDING_MODEL
- [x] Task 5.3: Ollama Provider（本地）已实现
  - [x] OllamaEmbeddings
  - [x] 支持 OLLAMA_BASE_URL、OLLAMA_EMBEDDING_MODEL
- [x] Task 5.4: knowledge-indexer.ts 已重构使用工厂函数
- [x] Task 5.5: retrieval.ts 已重构使用工厂函数

## Phase 5.5: 可插拔 LLM Provider 架构（已完成）

- [x] Task 5.6: LLM Provider 工厂函数已创建
  - [x] src/lib/llm/index.ts 已创建
  - [x] LLMProviderType 类型定义（cloud / ollama）
  - [x] getLLMConfig() 和 getLLM() 工厂函数
  - [x] 导出 llm 和 llmWithTools 实例
- [x] Task 5.7: Cloud LLM Provider 已实现
  - [x] 使用 @langchain/openai (ChatOpenAI)
  - [x] 支持 LLM_PROVIDER=cloud 环境变量
  - [x] 支持 OPENAI_API_KEY、LLM_BASE_URL、LLM_MODEL
  - [x] temperature、maxTokens 等参数已配置
- [x] Task 5.8: Ollama LLM Provider 已实现
  - [x] 使用 @langchain/ollama (ChatOllama)
  - [x] 支持 LLM_PROVIDER=ollama 环境变量
  - [x] 支持 OLLAMA_BASE_URL、OLLAMA_MODEL
- [x] Task 5.9: agents/index.ts 已重构使用 LLM 工厂函数
  - [x] 使用 getLLM() 获取 llm 实例
  - [x] agent 编译时使用正确的 LLM
- [x] Task 5.10: 所有使用 llm 的地方已更新
  - [x] src/agents/nodes/* 中的 llm 调用已更新
  - [x] setAgentTools 和 llmWithTools 使用方式已更新
  - [x] MultimodalContent 类型已保留

## Phase 6: Chroma 向量库持久化

- [x] kb:export 脚本已创建
- [x] kb:import 脚本已创建
- [x] kb:reset 脚本已创建
