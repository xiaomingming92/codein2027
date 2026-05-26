# Checklist: 三层审计管线

## Layer 2 运行时审计

- [ ] agent-audit-logger.ts 升级完成：新增 import prisma + setAuditContext/clearAuditContext + writeAuditLog()
- [ ] agentAuditRequest/Response/Error 新增 AuditLog DB 写入
- [ ] agentAuditStrategy(strategyId, ...) 函数可用
- [ ] agentAuditExecutionQuality(signals, compositeScore, ...) 函数可用
- [ ] agentAuditCacheOperation(operation, cacheKey, ...) 函数可用
- [ ] 节点级函数（NodeStart/End/Error/LLMCall/Route/Retrieval）不写 AuditLog 表
- [ ] stream/route.ts 调用 setAuditContext(userId, traceId) 注入 L2 上下文
- [ ] stream/route.ts 调用 clearAuditContext() 清理
- [ ] response.ts 在 resolveResponseStrategy() 后调用 agentAuditStrategy()
- [ ] path-metrics.ts 在 assessExecutionQuality() 后调用 agentAuditExecutionQuality()
- [ ] semantic-cache.ts 在 get/set/evict 时调用 agentAuditCacheOperation()
- [ ] `NODE_ENV=production` 发送消息 → AuditLog 表有 CHAT_REQUEST/STRATEGY_MATCHED/CHAT_RESPONSE
- [ ] 同一 traceId 串联所有 AuditLog 记录
- [ ] AuditLog 表无 NODE_START/NODE_END/LLM_CALL 类型的节点级记录

## Layer 1 开发审计

- [ ] debug-tracer.ts 新建完成：DebugTrace 类型 + createTrace + captureNode + captureSummary + finalizeAndSave + exportFineTuningData
- [ ] isDebugEnabled() = `NODE_ENV === "development"`
- [ ] debug/route.ts 新建完成：GET 端点（format=json/fine-tuning，仅 dev 启用）
- [ ] stream/route.ts 集成 captureNode 和 finalizeAndSave
- [ ] `NODE_ENV=development` 发送消息 → `logs/debug/{threadId}/` 下有 JSON 文件
- [ ] `NODE_ENV=production` 发送消息 → `logs/debug/` 无新文件
- [ ] GET /debug?messageId=xxx 含全部 node trace
- [ ] GET /debug?format=fine-tuning 返回 prompt/response 对 + quality 标签
- [ ] 微调导出自动筛选：followUpCount>0 / confidence<50 被排除

## 编译

- [ ] `npx tsc --noEmit` 零类型错误
