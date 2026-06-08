# Layer 2 Agent 域运行时审计自动记录 Spec

## Why

farm-agent 的 Agent 域（LangGraph pipeline）当前通过 `wrapNodeWithAudit()` 手动在每个节点中写入审计日志。这有两个根本问题：

1. **仅覆盖节点层级**：LLM 调用（token 用量）和 Tool 调用（输入/输出）完全在 `wrapNodeWithAudit` 之外，没有 Layer 2 AuditLog 记录
2. **手动包装 = 无法保证覆盖率**：每新增一个节点就必须手动添加审计包装，遗漏一个就丢失一个

LangChain 提供了 `BaseCallbackHandler`（`@langchain/core/callbacks/base`）——LangGraph 生态的标准扩展机制。通过注入到 `agent.invoke()/stream()` 的 `config.callbacks` 中，可以自动捕获所有 LangGraph 生命周期事件（chain start/end/error、LLM end、tool start/end/error），实现 Agent 域 Layer 2 运行时审计的完全自动化。

**为什么不是 HTTP `withRuntimeAudit()`**：HTTP 包装器拦截的是 HTTP 请求入口，Agent 域在 LangGraph pipeline 内部执行，不经过 HTTP 层（`stream/route.ts` 只做 HTTP ↔ Agent 桥接）。Agent 域的正确横切点在 `agent.invoke()` / `agent.stream()` 的 `config.callbacks`。

## What Changes

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/layer2-callback.ts` | 新建 | `AuditCallback extends BaseCallbackHandler` 类 |
| `src/agents/index.ts` | 修改 | `runAgent()` 和 `streamAgent()` 注入 `AuditCallback` |
| `src/lib/agent-audit-logger.ts` | 修改 | 新增 `writeAuditLogFromCallback()` 辅助函数（如需要） |

## Impact

- Affected specs: 无（首次 Agent 域 Layer 2 横切方案实施，替代了原 HTTP 包装器方案中不覆盖 Agent 域的部分）
- Affected code: `src/lib/layer2-callback.ts`（新建）、`src/agents/index.ts`（修改）、`src/lib/agent-audit-logger.ts`（修改）
- 父 Plan: `.trae/plans/farm-agent-layer2-cross-cutting-plan-v1.md`
- 依赖: 无新增 npm 依赖（`@langchain/core` v1.1.48 已有 `BaseCallbackHandler`）
- 后续依赖: Round 7 "三层审计管线" Plan 将本 Plan 作为 L2 自动审计的 Agent 域实现

## Boundaries

本次只允许实现：
- `AuditCallback extends BaseCallbackHandler` 类（`src/lib/layer2-callback.ts`）
- `runAgent()` / `streamAgent()` 中注入 callback（`src/agents/index.ts`）
- 必要时在 `agent-audit-logger.ts` 中新增辅助方法

本次禁止实现：
- 知识库 API Route 的 Layer 2 审计（属于后续独立 Plan，使用 HTTP 层方案）
- 在节点文件（`response.ts`、`path-metrics.ts`、`semantic-cache.ts` 等）中手动添加审计调用
- HTTP `withRuntimeAudit()` 包装器
- `@RuntimeAudit` 装饰器
- `BaseCallbackHandler` 未覆盖的自定义事件处理
- 移除或重构现有 `wrapNodeWithAudit`（L1 dev-logger）

## Requirements

### Requirement: AuditCallback 类
系统 SHALL 提供 `AuditCallback extends BaseCallbackHandler` 类，在 Agent pipeline 执行过程中自动写入 AuditLog 表。

#### Scenario: 节点开始
- **WHEN** LangGraph 执行到一个 Agent 节点（intention/retrieval/reasoning 等）
- **THEN** `handleChainStart` 被触发，写入 `NODE_START_{nodeName}` 记录到 AuditLog 表（targetType=AGENT_NODE）

#### Scenario: 节点完成
- **WHEN** LangGraph 节点执行完成
- **THEN** `handleChainEnd` 被触发，写入 `NODE_END_{nodeName}` 记录，含 `durationMs` 和 `outputKeys`

#### Scenario: 节点错误
- **WHEN** LangGraph 节点执行抛出异常
- **THEN** `handleChainError` 被触发，写入 `NODE_ERROR_{nodeName}` 记录，含 `error.message` 和 `durationMs`

#### Scenario: LLM 调用
- **WHEN** Agent 节点内部产生 LLM 调用
- **THEN** `handleLLMEnd` 被触发，写入 `AGENT_LLM_CALL` 记录，含 `tokenUsage`

#### Scenario: Tool 调用
- **WHEN** Agent 节点内部调用 Tool（如 knowledge_search）
- **THEN** `handleToolStart` 写入 `AGENT_TOOL_START_{toolName}`，`handleToolEnd` 写入 `AGENT_TOOL_END`（含 outputLength/outputPreview），失败时 `handleToolError` 写入 `AGENT_TOOL_ERROR`

#### Scenario: 非 Agent 节点 chain 过滤
- **WHEN** LangGraph 触发内部 chain（如 RunnableSequence、RunnableLambda 等非 Agent 节点的 chain）
- **THEN** `handleChainStart` 检查 `chain.name` 不在 `AGENT_NODE_NAMES` 中，跳过不写 AuditLog

### Requirement: Callback 注入
系统 SHALL 在 `runAgent()` 和 `streamAgent()` 中自动注入 `AuditCallback` 实例。

#### Scenario: invoke 调用
- **WHEN** 调用 `runAgent(input, config)`
- **THEN** 创建 `new AuditCallback(traceId)` 并注入到 `config.callbacks`，执行 `agent.invoke(input, { ...config, callbacks: [auditCallback] })`

#### Scenario: stream 调用
- **WHEN** 调用 `streamAgent(input, config)`
- **THEN** 创建 `new AuditCallback(traceId)` 并注入到 `config.callbacks`，执行 `agent.stream(input, { ...config, callbacks: [auditCallback] })`

#### Scenario: callbacks 数组追加
- **WHEN** `config` 中已有其他 callbacks
- **THEN** `AuditCallback` 追加到 callbacks 数组末尾，不覆盖已有 callbacks

### Requirement: traceId 一致性
系统 SHALL 确保 L2 callback 写入的 `traceId` 与 L1 dev-logger 的 `traceId` 相同。

#### Scenario: traceId 来源
- **WHEN** `input.conversationContext.traceId` 存在（由 `stream/route.ts` 中 `tracer.getTraceId()` 设置）
- **THEN** 使用该 traceId

#### Scenario: traceId 回退
- **WHEN** `input.conversationContext.traceId` 不存在
- **THEN** 使用 `crypto.randomUUID()` 生成新 traceId

### Requirement: 写入不阻塞
系统 SHALL 确保 AuditLog 写入不阻塞 Agent pipeline 执行。

#### Scenario: 写入失败
- **WHEN** `prisma.auditLog.create()` 失败
- **THEN** `.catch()` 捕获并 `console.error`，不影响 Agent 响应
