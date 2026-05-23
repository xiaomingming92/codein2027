# Tasks: 三层审计管线

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
