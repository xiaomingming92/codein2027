# Tasks: 三层审计管线

## Preconditions

- [ ] 已执行 `session-init` SKILL
- [ ] 已执行 `add-paradigm` SKILL（Step 0 文档先行）
- [ ] 上游第1-6轮 ADD-7 审计记录存在（`query_audit_logs({ sinceMinutes: 5760, keyword: "EVOLUTION_LOOP_INTEGRATED" })`）
- [ ] `npx tsc --noEmit` 在上游完成后通过
- [ ] 所有业务功能稳定（管线消费、缓存、演化闭环已上线）

## Forbidden

- 禁止修改 Prisma Schema（`prisma/schema.prisma`）
- 禁止修改前端组件（React/Vue 组件文件）
- 禁止覆盖或重构已有 stream-bus / SSE 事件总线逻辑
- 禁止将节点级 debug trace（NODE_START/NODE_END/LLM_CALL）写入生产 AuditLog 表
- 禁止简化代码实现，一切以代码高质量为衡量标准
- 禁止 clearAuditContext 不在 finally 块中（防止跨请求状态泄漏）
- 禁止生产环境（NODE_ENV=production）写入 debug trace 文件

- [ ] Task 1: 升级 agent-audit-logger.ts 为 Layer 2
  - [ ] 修改 `src/lib/agent-audit-logger.ts`
  - [ ] 新增 `import { prisma }` 引用
  - [ ] 新增 `currentUserId` 和 `currentTraceId` 模块级变量
  - [ ] 实现 `setAuditContext(userId, traceId)` 和 `clearAuditContext()`
  - [ ] 实现 `writeAuditLog(action, targetType, targetId, extra?, reason?)` — fire-and-forget
  - [ ] 升级 `agentAuditRequest/Response/Error` 新增 AuditLog DB 写入通道
  - [ ] 新增 `agentAuditStrategy(strategyId, thinkingLevel, intent, candidateCount, extra?)`
  - [ ] 新增 `agentAuditExecutionQuality(signals, compositeScore, adjustment?)`
  - [ ] 新增 `agentAuditCacheOperation(operation, cacheKey, extra?)`
  - [ ] 验证：`npx tsc --noEmit` 零类型错误

- [ ] Task 2: 新建 debug-tracer.ts Layer 1 开发审计
  - [ ] 新建 `src/services/debug-tracer.ts`
  - [ ] 定义 `DebugTrace` 接口（含所有节点 trace + 汇总 + 微调标签）
  - [ ] 实现 `isDebugEnabled()` — `NODE_ENV === "development"`
  - [ ] 实现 `createTrace(threadId, messageId, messageIndex, role)` — 初始化 trace
  - [ ] 实现 `captureNode(trace, nodeName, data)` — 追加节点数据
  - [ ] 实现 `captureSummary(trace, data)` — 写入汇总（totalLatency/totalTokens/confidence/cacheHit）
  - [ ] 实现 `finalizeAndSave(trace)` — 写入 `logs/debug/{threadId}/{messageIndex:03d}-{role}-{messageId}.json`
  - [ ] 实现 `exportFineTuningData(threadId)` — 从文件读取并转换为微调格式
  - [ ] 验证：`NODE_ENV=development` 发送消息后文件写入正确

- [ ] Task 3: 新建 debug API 路由
  - [ ] 新建 `src/app/api/agent/chat/threads/[threadId]/debug/route.ts`
  - [ ] GET handler：仅 dev 启用（检查 NODE_ENV）
  - [ ] 支持 `?messageId=xxx` 查询单条 trace
  - [ ] 支持 `?format=fine-tuning` 导出微调数据
  - [ ] 默认返回所有 message 的 trace 摘要列表
  - [ ] 验证：dev 环境 GET /debug 返回 JSON

- [ ] Task 4: 集成 L2 审计到 stream/route.ts
  - [ ] 修改 `src/app/api/agent/chat/stream/route.ts`
  - [ ] 请求开始时调用 `setAuditContext(userId, traceId)` 注入 L2 上下文
  - [ ] 管线完成后调用 `clearAuditContext()` 清理
  - [ ] 验证：生产环境 AuditLog 表有 CHAT_REQUEST 记录

- [ ] Task 5: 集成 L1 trace 到 stream/route.ts
  - [ ] 请求开始时 `createTrace()`（仅 dev）
  - [ ] 每个节点完成事件调用 `captureNode()`
  - [ ] 管线完成后调用 `captureSummary()` + `finalizeAndSave()`
  - [ ] 验证：dev 环境 `logs/debug/{threadId}/` 有完整 JSON trace 文件

- [ ] Task 6: 各模块集成 L2 审计调用
  - [ ] `src/agents/nodes/response.ts`：resolveResponseStrategy() 后调用 `agentAuditStrategy()`
  - [ ] `src/services/path-metrics.ts`：assessExecutionQuality() 后调用 `agentAuditExecutionQuality()`
  - [ ] `src/services/semantic-cache.ts`：每次 get/set/evict 调用 `agentAuditCacheOperation()`
  - [ ] 验证：各审计调用编译通过且不阻塞主流程

- [ ] Task 7: 端到端验证
  - [ ] L2 生产写入：`NODE_ENV=production` → AuditLog 表有记录
  - [ ] L2 traceId 串联：同一请求所有 AuditLog 共享相同 traceId
  - [ ] L2 环境无关：生产环境 AuditLog 表仍有记录
  - [ ] L2 节点函数不写 DB：AuditLog 表无 NODE_START/NODE_END/LLM_CALL
  - [ ] L1 trace 写入：`NODE_ENV=development` → `logs/debug/` 有文件
  - [ ] L1 生产关闭：`NODE_ENV=production` → `logs/debug/` 无新文件
  - [ ] L1 trace 完整性：GET /debug?messageId=xxx → 含全部 node trace
  - [ ] 微调导出：GET /debug?format=fine-tuning → prompt/response 对 + quality 标签
  - [ ] 质量筛选：followUpCount>0 / confidence<50 被排除
  - [ ] 缓存审计：第1次 CACHE_MISS+CACHE_SET，第2次 CACHE_HIT
  - [ ] 执行度审计：afterState 含 signals + compositeScore

# Task Dependencies

- Task 4 依赖 Task 1（需要 setAuditContext 函数）
- Task 5 依赖 Task 2（需要 createTrace/captureNode）
- Task 6 依赖 Task 1（需要 agentAudit* 新函数）
- Task 6 各子任务可并行
- Task 7 依赖 Task 1-6 全部完成

## Verification

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`（如项目已配置）
- 当前 spec `checklist.md` 全部通过
- L2: `NODE_ENV=production` → AuditLog 表有 CHAT_REQUEST / STRATEGY_MATCHED / CHAT_RESPONSE
- L2: AuditLog 表无 NODE_START/NODE_END/LLM_CALL 节点级记录
- L1: `NODE_ENV=development` → `logs/debug/` 有文件
- L1: `NODE_ENV=production` → `logs/debug/` 无新文件
- 当前对话 ADD-7 `record_dev_operation` 已逐文件记录

## 对话启动（将此段粘贴给新的 LLM 对话）

你在执行 farm-agent 改进的 **第7轮（最后一轮）**（三层审计管线）。上游第1-6轮已完成全部业务功能。

**启动步骤（按顺序）：**
1. 执行 `session-init` SKILL → `query_audit_logs({ sinceMinutes: 5760 })` 确认第1-6轮全部完成
2. 执行 `add-paradigm` SKILL
3. 阅读 `specs/co-agent-audit-pipeline/spec.md`
4. 按本文档 tasks.md 顺序执行。执行优先级：L2 高层 AuditLog → traceId 串联 → L1 debug trace → 微调导出

**文件清单（2新建+5修改）：**
`agent-audit-logger.ts`(改-L2升级) / `debug-tracer.ts`(新-L1) / `debug/route.ts`(新-L1) / `stream/route.ts`(改-L1+L2) / `response.ts`(改-L2) / `path-metrics.ts`(改-L2) / `semantic-cache.ts`(改-L2)

**⚠️ agent-audit-logger.ts 历史混合式日志器，升级为 L2 但保持旧函数（NodeStart/End/Route/Retrieval）仍只写 console+file，不写 AuditLog DB。**
**⚠️ clearAuditContext() 必须在 stream/route.ts 的 finally 块中调用，防止跨请求状态泄漏。**
**⚠️ 生产环境 NODE_ENV=production 时 debug-tracer 必须整体跳过，不可写任何文件。**

**关键提醒：** 当前执行第7轮/7（最后一轮），完成后整个 farm-agent 改进计划完工。record_dev_operation 后即可验收。
