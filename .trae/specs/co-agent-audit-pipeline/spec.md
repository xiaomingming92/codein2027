# 三层审计管线 Spec

## Why

现有 `agent-audit-logger.ts` 只写 console + 文件（文件仅 dev 开启），不写 `AuditLog` DB 表。生产环境 `NODE_ENV=production` 时，AuditLog 表为空，前端无法查询"谁在什么时候做了什么"。需要在前面所有功能稳定后，补齐 Layer 2 运行时审计（始终写 AuditLog 表），并建立 Layer 1 开发审计（仅 dev 启用，节点级 debug trace + 微调数据导出）。

## What Changes

- 升级 `agent-audit-logger.ts` 为真正的 Layer 2 运行时审计（始终写 AuditLog 表），新增 agentAuditStrategy/ExecutionQuality/CacheOperation 函数
- 新建 `debug-tracer.ts` 作为 Layer 1 开发审计（仅 dev 启用，节点级详细 trace）
- 新建 `debug/route.ts` Debug 面板 API + 微调数据导出
- 各模块在关键路径上调用对应的审计函数

## Impact

- Affected specs: 无
- Affected code: `src/lib/agent-audit-logger.ts`（修改升级）, `src/services/debug-tracer.ts`（新建）, `src/app/api/agent/chat/threads/[threadId]/debug/route.ts`（新建）, `src/app/api/agent/chat/stream/route.ts`, `src/agents/nodes/response.ts`, `src/services/path-metrics.ts`, `src/services/semantic-cache.ts`
- 父 Plan: [co-agent-simplified-v1.md](../../documents/co-agent-simplified-v1.md)
- 依赖: 第6轮(演化闭环) — 需要在 path-metrics + cache 中调用审计函数

## ADDED Requirements

### Requirement: 三层职责边界

| 层次 | 消费者 | 写入 | 开关 |
|------|-------|------|------|
| L1 开发审计 | AI 助手 + 开发者 | `logs/debug/{threadId}/` 文件 + Debug API | `NODE_ENV=development` |
| L2 运行时审计 | UI 组件 + 最终用户 | `AuditLog` DB 表 | 始终开启 |
| L3 控制台 | 开发者 | `console.log` | `LOG_LEVEL` |

### Requirement: Layer 2 运行时审计（agent-audit-logger.ts 升级）

系统 SHALL 升级 `agent-audit-logger.ts`，使 `agentAuditRequest/Response/Error` 在新增长 AuditLog DB 通道（第三个通道）：

| 函数 | 新增 L2 写入 | AuditLog.targetType | AuditLog.action |
|------|------------|---------------------|-----------------|
| `agentAuditRequest()` | ✅ | `AGENT_SESSION` | `CHAT_REQUEST` |
| `agentAuditResponse()` | ✅ | `AGENT_SESSION` | `CHAT_RESPONSE` |
| `agentAuditError()` | ✅ | `AGENT_SESSION` | `CHAT_ERROR` |

节点级函数（agentAuditNodeStart/End/Error、agentAuditLLMCall/Error、agentAuditRoute、agentAuditRetrieval）SHALL 不写 AuditLog 表——这些是 L1 粒度。

#### Scenario: 生产环境 AuditLog 写入
- **WHEN** `NODE_ENV=production` 发送消息
- **THEN** AuditLog 表有 CHAT_REQUEST / STRATEGY_MATCHED / CHAT_RESPONSE 记录

#### Scenario: traceId 串联
- **WHEN** 通过 query_audit_logs({ traceId }) 查询
- **THEN** 同一请求的所有 AuditLog 记录共享相同 traceId

### Requirement: Layer 2 专用审计函数

系统 SHALL 新增三个 Layer 2 专用函数：

- `agentAuditStrategy(strategyId, thinkingLevel, intent, candidateCount, extra?)` — 策略匹配审计（写入 STRATEGY_MATCHED）
- `agentAuditExecutionQuality(signals, compositeScore, adjustment?)` — 执行质量审计（写入 EXECUTION_QUALITY）
- `agentAuditCacheOperation(operation, cacheKey, extra?)` — 缓存操作审计（写入 CACHE_HIT/MISS/SET/EVICT）

### Requirement: Layer 2 上下文注入

stream/route.ts SHALL 在请求开始时调用 `setAuditContext(userId, traceId)` 注入 Layer 2 上下文，在 finally 块中调用 `clearAuditContext()` 清理。

### Requirement: Layer 1 Debug Trace

系统 SHALL 在 `NODE_ENV=development` 时启用 `debug-tracer.ts`，采集每节点的完整 trace：

| 节点 | 记录内容 | 格式 |
|------|---------|------|
| intention | prompt + rawOutput + parsed intent/thinkingLevel | JSON 片段 |
| retrieval | expertEvidenceFilters + results（chunkId/reliability/relevance） | JSON 片段 |
| reasoning | prompt（含专家 promptTemplate + evidence）+ rawOutput + parsed | JSON 片段 |
| verdict | verdictResult（conclusion/confidence/risks/reasoningPath） | JSON 片段 |
| response-strategy | matchedDescriptor + allCandidates + modifications + finalStrategy | JSON 片段 |
| response | prompt + rawOutput + displayContent.sections | JSON 片段 |
| execution-quality | 4 个 metric signals + compositeScore | JSON 片段 |

完整 DebugTrace 写入 `logs/debug/{threadId}/{messageIndex:03d}-{role}-{messageId}.json`。

#### Scenario: dev 环境 trace 写入
- **WHEN** `NODE_ENV=development` 发送消息
- **THEN** `logs/debug/{threadId}/` 下有 JSON 文件，按 messageIndex 升序

#### Scenario: 生产环境 L1 关闭
- **WHEN** `NODE_ENV=production` 发送消息
- **THEN** `logs/debug/` 无新文件（debug-tracer 整体跳过）

### Requirement: 微调数据导出

系统 SHALL 提供 `GET /api/agent/chat/threads/{threadId}/debug?format=fine-tuning` 端点（仅 dev 启用），从 debug trace 文件转换为微调训练数据集。

自动筛选规则：
- followUpCount > 0 → 排除
- confidence < 50 → 排除
- chat 意图 → 排除
- confidence ≥ 90 且 followUpCount=0 → quality="excellent"
- confidence ≥ 75 且 followUpCount=0 → quality="good"
- strategyAdjusted=true → quality="acceptable"

## MODIFIED Requirements

### Requirement: response.ts 集成策略审计

response 节点 SHALL 在 `resolveResponseStrategy()` 后调用 `agentAuditStrategy(strategyId, thinkingLevel, intent, candidateCount)`。

### Requirement: path-metrics.ts 集成执行度审计

`assessExecutionQuality()` 后 SHALL 调用 `agentAuditExecutionQuality(signals, compositeScore)`。

### Requirement: semantic-cache.ts 集成缓存审计

每次 `get/set/evict` SHALL 调用 `agentAuditCacheOperation(operation, cacheKey)`。

## REMOVED Requirements

无
