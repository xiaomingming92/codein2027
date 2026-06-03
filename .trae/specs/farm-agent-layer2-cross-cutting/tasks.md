# Tasks: Layer 2 Agent 域运行时审计自动记录

## Preconditions

- [ ] `@langchain/core` v1.1.48 已安装（确认 `BaseCallbackHandler` 可用）
- [ ] `prisma/schema.prisma` 中 `AuditLog` 模型存在且已迁移
- [ ] `npx tsc --noEmit` 当前通过
- [ ] 数据库正在运行

## Forbidden

- 禁止在节点文件（`response.ts`、`path-metrics.ts` 等）中手动添加审计调用
- 禁止使用 HTTP `withRuntimeAudit()` 包装 Agent 域（方向错误）
- 禁止移除或重构现有 `wrapNodeWithAudit`（L1 dev-logger 保留）
- 禁止引入新的 npm 依赖（`@langchain/core` 已有）

---

- [ ] Task 1: 阅读现有代码
  - [ ] 阅读 `src/agents/index.ts` 中 `wrapNodeWithAudit` 和 `auditNodeEvent` 实现
  - [ ] 阅读 `src/lib/agent-audit-logger.ts` 中 `writeAuditLog` 函数签名和 `AuditLog` 写入方式
  - [ ] 阅读 `@langchain/core` 中 `BaseCallbackHandler` 的 TS 类型定义（`node_modules/@langchain/core/dist/callbacks/base.d.ts`）
  - [ ] 理解 `agent.invoke()` 和 `agent.stream()` 的 `config.callbacks` 参数结构
  - [ ] 确认 `AgentState` 中 `conversationContext.traceId` 字段存在

- [ ] Task 2: 创建 `src/lib/layer2-callback.ts`
  - [ ] 定义 `AGENT_NODE_NAMES` Set（intention, retrieval, reasoning, interactionPointDetection, verdict, response）
  - [ ] 实现 `AuditCallback extends BaseCallbackHandler` 类
  - [ ] 覆盖 `handleChainStart(chain, runId, parentRunId?)` — 过滤非 Agent 节点，记录 NODE_START
  - [ ] 覆盖 `handleChainEnd(output, runId, parentRunId?)` — 计算 durationMs，记录 NODE_END
  - [ ] 覆盖 `handleChainError(err, runId, parentRunId?)` — 记录 NODE_ERROR 含 error.message
  - [ ] 覆盖 `handleLLMEnd(output, runId)` — 提取 tokenUsage，记录 AGENT_LLM_CALL
  - [ ] 覆盖 `handleToolStart(tool, input, runId)` — 记录 AGENT_TOOL_START_{toolName}
  - [ ] 覆盖 `handleToolEnd(output, runId)` — 记录 AGENT_TOOL_END 含 outputLength
  - [ ] 覆盖 `handleToolError(err, runId)` — 记录 AGENT_TOOL_ERROR
  - [ ] 实现 `writeAuditLog()` 私有方法，fire-and-forget 写入 `prisma.auditLog.create()`
  - [ ] 实现 `nodeStartTimes` Map 管理 runId → { nodeName, startTime } 映射
  - [ ] 验证标准：`AuditCallback` 类编译通过，类型无 `any` 逃逸

- [ ] Task 3: 修改 `src/agents/index.ts` 注入 callbacks
  - [ ] 在 `runAgent()` 中：
    - [ ] 从 `input.conversationContext?.traceId` 获取 traceId（fallback 到 `crypto.randomUUID()`）
    - [ ] 创建 `new AuditCallback(traceId)`
    - [ ] 将 callback 追加到 `config.callbacks` 数组（不覆盖已有 callbacks）
    - [ ] 调用 `agent.invoke(agentInput, { ...config, callbacks: [...] })`
  - [ ] 在 `streamAgent()` 中：
    - [ ] 同上逻辑
    - [ ] 调用 `agent.stream(agentInput, { ...config, callbacks: [...] })`
  - [ ] 添加 `import { AuditCallback } from "@/lib/layer2-callback"`
  - [ ] 验证标准：`runAgent()` 和 `streamAgent()` 编译通过，`npx tsc --noEmit` 无新增错误

- [ ] Task 4: 修改 `src/lib/agent-audit-logger.ts`
  - [ ] 确认 `writeAuditLog()` 函数签名与 callback 的调用方式兼容
  - [ ] 如果 `AuditCallback` 类的 `writeAuditLog()` 方法自包含（直接调用 `prisma.auditLog.create()`），此步骤可精简为审查兼容性
  - [ ] 如果需要复用 `agent-audit-logger.ts` 的 `setAuditContext` / `writeAuditLog`，添加 `writeAuditLogFromCallback()` 适配函数
  - [ ] 验证标准：agent-audit-logger.ts 现有导出不变，向后兼容

- [ ] Task 5: 编译与类型检查
  - [ ] `npx tsc --noEmit` 通过
  - [ ] 无 `any` 类型逃逸
  - [ ] 无 unused import 警告

## Task Dependencies

```
Task 1 (阅读代码) ──┐
                     │
                     ▼
Task 2 (创建 layer2-callback.ts) ← 核心文件
                     │
                     ├──────────────┐
                     ▼              ▼
Task 3 (agents/index.ts)    Task 4 (agent-audit-logger.ts)
                     │              │
                     └──────┬───────┘
                            ▼
                     Task 5 (编译检查)
```

Task 3 和 Task 4 可并行执行（任务 3 依赖 import 路径确认，任务 4 只审查兼容性）。

## Verification

- [ ] `npx tsc --noEmit` 编译通过
- [ ] 发送聊天消息后 `query_audit_logs({ targetType: "AGENT_NODE" })` 返回 `NODE_START_*` / `NODE_END_*` 记录
- [ ] LLM 调用后 `query_audit_logs({ targetType: "AGENT_LLM" })` 返回 `AGENT_LLM_CALL` 记录（含 tokenUsage）
- [ ] Tool 调用后 `query_audit_logs({ targetType: "AGENT_TOOL" })` 返回 `AGENT_TOOL_START_*` / `AGENT_TOOL_END` 记录
- [ ] 失败路径：模拟节点异常后 AuditLog 有 `NODE_ERROR_*` 记录（ADD-6）
- [ ] 现有 L1 dev-logger（`wrapNodeWithAudit` console + file）行为不变
- [ ] 非 Agent 节点的 chain（RunnableSequence 等）不产生 AuditLog 记录（过滤生效）
