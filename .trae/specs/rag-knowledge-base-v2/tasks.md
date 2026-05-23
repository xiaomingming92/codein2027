# Tasks

## Phase 1: 统一文档模型（数据层对齐）

- [x] Task 1.1: 修改 Prisma schema，废弃 KnowledgeDocument，扩展 Document 模型
  - [x] SubTask 1.1.1: 给 Document 添加 sourceType、contentHash 字段
  - [x] SubTask 1.1.2: 添加 SourceType 枚举（PROJECT\_DOC / KNOWLEDGE\_UPDATE）
  - [x] SubTask 1.1.3: 添加 DocStatus 枚举（PENDING\_INDEX / PENDING / INDEXING / INDEXED / OUTDATED / ERROR）
  - [x] SubTask 1.1.4: 使 projectId 可选，支持知识库文档无项目关联
  - [x] SubTask 1.1.5: 添加复合唯一索引 @@unique(\[name, version, sourceType])
  - [x] SubTask 1.1.6: 删除 KnowledgeDocument 模型
  - [x] SubTask 1.1.7: 生成并执行数据库迁移
- [x] Task 1.2: 迁移现有 KnowledgeDocument 数据到 Document 表
  - [x] SubTask 1.2.1: 编写数据迁移脚本
  - [x] SubTask 1.2.2: 运行迁移，验证数据完整性
- [x] Task 1.3: 更新 API 层，/api/knowledge/\* 改为操作 Document 表
  - [x] SubTask 1.3.1: 重写 GET /api/knowledge/documents，查询 Document 表
  - [x] SubTask 1.3.2: 重写 POST /api/knowledge/upload，创建 Document 记录
  - [x] SubTask 1.3.3: 重写 DELETE /api/knowledge/documents/:id，删除 Document 记录
- [x] Task 1.4: 更新前端 KnowledgeBasePanel，适配新 API 返回格式
  - [x] SubTask 1.4.1: 修改接口类型定义
  - [x] SubTask 1.4.2: 测试列表展示、上传、删除功能

## Phase 2: 真实向量化（核心能力）

- [x] Task 2.1: 实现文档解析 + 向量化服务
  - [x] SubTask 2.1.1: 创建 `src/services/knowledge-indexer.ts`，封装知识库文档向量化逻辑
  - [x] SubTask 2.1.2: 调用 `parseDocumentFromBuffer` 解析文件
  - [x] SubTask 2.1.3: 调用 `chroma.addDocuments` 写入向量
  - [x] SubTask 2.1.4: 记录返回的 vectorIds 到 Document 表
  - [x] SubTask 2.1.5: 更新 Document.status 为 INDEXED 或 ERROR
- [x] Task 2.2: 上传 API 改为两阶段提交（不立即向量化）
  - [x] SubTask 2.2.1: POST /api/knowledge/upload 只保存文件和记录
  - [x] SubTask 2.2.2: 设置 status = PENDING_INDEX，不立即触发向量化
  - [x] SubTask 2.2.3: 返回 { status: "pending_index" } 告知用户待同步
- [x] Task 2.3: 删除 API 级联清理 Chroma 向量
  - [x] SubTask 2.3.1: DELETE /api/knowledge/documents/:id 先查 vectorIds
  - [x] SubTask 2.3.2: 调用 chroma.delete({ ids: vectorIds })
  - [x] SubTask 2.3.3: 再删数据库记录和文件
- [x] Task 2.4: 实现 SSE 进度推送端点
  - [x] SubTask 2.4.1: 创建 GET /api/knowledge/documents/:id/progress
  - [x] SubTask 2.4.2: 返回 text/event-stream，推送 PENDING → PARSING → INDEXING → INDEXED/ERROR
- [x] Task 2.5: 前端接入 SSE 进度推送
  - [x] SubTask 2.5.1: 移除前端 setTimeout 模拟进度
  - [x] SubTask 2.5.2: 使用 fetch + ReadableStream 连接 SSE 端点
  - [x] SubTask 2.5.3: 实时更新文档状态 UI
- [x] Task 2.6: Agent retrievalNode 接入知识库检索
  - [x] SubTask 2.6.1: 修改 retrievalNode，调用 similaritySearch 时包含 KNOWLEDGE\_UPDATE 文档
  - [x] SubTask 2.6.2: 验证 Agent 能检索到知识库内容
  - [x] SubTask 2.6.3: 检索时只查询 status = INDEXED 的文档

## Phase 3: 文件系统知识库同步（一级知识库）

- [x] Task 3.1: 实现文件系统扫描服务
  - [x] SubTask 3.1.1: 创建 `src/services/knowledge-sync.ts`
  - [x] SubTask 3.1.2: 实现 scanKnowledgeDirectories() 扫描 docs/\*/knowledge/
  - [x] SubTask 3.1.3: 计算每个文件的 contentHash 和 mtime
- [x] Task 3.2: 修复 sourceType 和 projectId 逻辑
  - [x] SubTask 3.2.1: 同步静态文件时使用 `sourceType = PROJECT_DOC`
  - [x] SubTask 3.2.2: 根据父目录名设置 `projectId`（如 "农业智能体(把地种智能体)"）
  - [x] SubTask 3.2.3: 查询时按 `sourceType = PROJECT_DOC` 而非 `KNOWLEDGE_UPDATE`
- [x] Task 3.3: 实现变更检测逻辑
  - [x] SubTask 3.3.1: 对比文件系统与数据库记录
  - [x] SubTask 3.3.2: 分类：added / modified / renamed / deleted / unchanged
- [x] Task 3.4: 实现增量索引
  - [x] SubTask 3.4.1: 新增文件：解析 + 向量化
  - [x] SubTask 3.4.2: 修改文件：删除旧向量 + 重新向量化
  - [x] SubTask 3.4.3: 删除文件：从向量库和数据库清理
- [x] Task 3.5: 创建同步 API
  - [x] SubTask 3.5.1: POST /api/knowledge/sync 触发同步
  - [x] SubTask 3.5.2: 返回同步统计结果
- [x] Task 3.6: 前端添加"同步知识库"按钮
  - [x] SubTask 3.6.1: 在 KnowledgeBasePanel 添加同步按钮
  - [x] SubTask 3.6.2: 显示同步进度和统计结果
- [x] Task 3.7: package.json 添加 kb:sync 脚本
  - [x] SubTask 3.7.1: 创建 scripts/kb-sync.ts
  - [x] SubTask 3.7.2: 在 package.json 添加 "kb:sync": "tsx scripts/kb-sync.ts"

## Phase 3.5: 两阶段提交同步（统一同步入口）

- [x] Task 3.8: 重构同步服务，支持批量处理待索引文档
  - [x] SubTask 3.8.1: 修改 syncKnowledgeBase() 同时处理 PROJECT_DOC 和 KNOWLEDGE_UPDATE
  - [x] SubTask 3.8.2: PROJECT_DOC: 处理 status = PENDING 的文件
  - [x] SubTask 3.8.3: KNOWLEDGE_UPDATE: 处理 status = PENDING_INDEX 的文件
  - [x] SubTask 3.8.4: 同步过程中设置 status = INDEXING
- [x] Task 3.9: 更新同步统计，显示待索引文档数量
  - [x] SubTask 3.9.1: getSyncStats() 返回 PENDING_INDEX 文档数量
  - [x] SubTask 3.9.2: 前端显示 "N 个文档待同步"

## Phase 4: 上传文档版本管理（二级知识库）

- [x] Task 4.1: 上传 API 实现内容去重
  - [x] SubTask 4.1.1: 计算上传文件的 contentHash
  - [x] SubTask 4.1.2: 查询是否已存在相同 contentHash
  - [x] SubTask 4.1.3: 存在则返回错误提示
- [x] Task 4.2: 上传 API 实现版本递增
  - [x] SubTask 4.2.1: 同名文件上传时，查询最新版本号
  - [x] SubTask 4.2.2: 使用数据库事务 + 乐观锁创建新版本
  - [x] SubTask 4.2.3: 旧版本标记为 OUTDATED，删除旧向量
- [x] Task 4.3: 检索时过滤旧版本
  - [x] SubTask 4.3.1: similaritySearch 只返回 status = ACTIVE 的文档
  - [x] SubTask 4.3.2: 验证检索结果不包含 OUTDATED 版本

## Phase 5: 可插拔 Embedding Provider 架构

- [x] Task 5.1: 创建 Embedding Provider 工厂函数
  - [x] SubTask 5.1.1: 创建 `src/lib/embeddings/index.ts`
  - [x] SubTask 5.1.2: 根据 `EMBEDDING_PROVIDER` 环境变量选择 cloud 或 ollama
  - [x] SubTask 5.1.3: 导出统一的 embeddings 实例获取函数
- [x] Task 5.2: 实现 Cloud Provider（OpenAI 兼容风格）
  - [x] SubTask 5.2.1: 使用 `@langchain/community/embeddings/openai` 而非 `@langchain/openai`
  - [x] SubTask 5.2.2: 支持 `OPENAI_API_KEY`、`EMBEDDING_BASE_URL`、`EMBEDDING_MODEL`
- [x] Task 5.3: 实现 Ollama Provider（本地）
  - [x] SubTask 5.3.1: 使用 `@langchain/community/embeddings/ollama`
  - [x] SubTask 5.3.2: 支持 `OLLAMA_BASE_URL`、`OLLAMA_EMBEDDING_MODEL`
- [x] Task 5.4: 重构 knowledge-indexer.ts 使用工厂函数
  - [x] SubTask 5.4.1: 移除硬编码的 `OpenAIEmbeddings`
  - [x] SubTask 5.4.2: 改用 `getEmbeddings()` 工厂函数
- [x] Task 5.5: 重构 retrieval.ts 使用工厂函数
  - [x] SubTask 5.5.1: 移除硬编码的 embeddings 配置
  - [x] SubTask 5.5.2: 改用 `getEmbeddings()` 工厂函数

## Phase 5.5: 可插拔 LLM Provider 架构（已完成）

- [x] Task 5.6: 创建 LLM Provider 工厂函数
  - [x] SubTask 5.6.1: 重构 `src/lib/llm.ts` 为 `src/lib/llm/index.ts`
  - [x] SubTask 5.6.2: 创建 `LLMProviderType` 类型定义（cloud / ollama）
  - [x] SubTask 5.6.3: 创建 `getLLMConfig()` 和 `getLLM()` 工厂函数
  - [x] SubTask 5.6.4: 导出 `llm` 和 `llmWithTools` 实例
- [x] Task 5.7: 实现 Cloud LLM Provider
  - [x] SubTask 5.7.1: 使用 `@langchain/openai` (ChatOpenAI)
  - [x] SubTask 5.7.2: 支持 `LLM_PROVIDER=cloud` 环境变量
  - [x] SubTask 5.7.3: 支持 `OPENAI_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL`
  - [x] SubTask 5.7.4: 配置 temperature、maxTokens 等参数
- [x] Task 5.8: 实现 Ollama LLM Provider
  - [x] SubTask 5.8.1: 使用 `@langchain/ollama` (ChatOllama)
  - [x] SubTask 5.8.2: 支持 `LLM_PROVIDER=ollama` 环境变量
  - [x] SubTask 5.8.3: 支持 `OLLAMA_BASE_URL`、`OLLAMA_MODEL`
- [x] Task 5.9: 重构 agents/index.ts 使用 LLM 工厂函数
  - [x] SubTask 5.9.1: 移除对 `src/lib/llm` 的直接依赖
  - [x] SubTask 5.9.2: 使用 `getLLM()` 获取 llm 实例
  - [x] SubTask 5.9.3: 确保 agent 编译时使用正确的 LLM
- [x] Task 5.10: 更新所有使用 llm 的地方
  - [x] SubTask 5.10.1: 检查 `src/agents/nodes/*` 中的 llm 调用
  - [x] SubTask 5.10.2: 更新 `setAgentTools` 和 `llmWithTools` 的使用方式
  - [x] SubTask 5.10.3: 确保多模态内容处理正常

## Phase 6: Chroma 向量库持久化与迁移

- [x] Task 6.1: 实现向量库导出
  - [x] SubTask 6.1.1: 创建 scripts/kb-export.ts
  - [x] SubTask 6.1.2: 从 Chroma 读取所有向量 + 元数据
  - [x] SubTask 6.1.3: 序列化为 JSON 文件
  - [x] SubTask 6.1.4: package.json 添加 "kb:export"
- [x] Task 6.2: 实现向量库导入
  - [x] SubTask 6.2.1: 创建 scripts/kb-import.ts
  - [x] SubTask 6.2.2: 从 JSON 恢复向量到 Chroma
  - [x] SubTask 6.2.3: package.json 添加 "kb:import"
- [x] Task 6.3: 实现向量库重置
  - [x] SubTask 6.3.1: 创建 scripts/kb-reset.ts
  - [x] SubTask 6.3.2: 清空 Chroma 集合，从数据库重新索引
  - [x] SubTask 6.3.3: package.json 添加 "kb:reset"

# Task Dependencies

- Phase 1 完成后才能开始 Phase 2
- Phase 2 完成后才能开始 Phase 3
- **Phase 3.5 依赖 Phase 2 和 Phase 3**（统一同步入口）
- Phase 3 和 Phase 4 可并行
- Phase 5 可在任何阶段完成，但建议在 Phase 2 之后
- **Phase 5.5 依赖 Phase 5**（复用相同的 provider 架构设计）
- Phase 6 依赖 Phase 2 和 Phase 3

