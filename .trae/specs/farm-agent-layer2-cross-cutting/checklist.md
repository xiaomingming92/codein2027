# Checklist: Layer 2 Agent 域运行时审计自动记录

## Phase 1: AuditCallback 类实现

- [ ] Task 2: `AuditCallback` 继承自 `BaseCallbackHandler`（`@langchain/core`），编译通过 ← spec R1
- [ ] Task 2: `AGENT_NODE_NAMES` Set 含全部 6 个 Agent 节点名
- [ ] Task 2: `handleChainStart` 过滤非 Agent 节点（RunnableSequence 等）不写 AuditLog
- [ ] Task 2: `handleChainEnd` 正确计算 `durationMs`（`Date.now() - nodeStartTimes.get(runId).startTime`）
- [ ] Task 2: `handleChainError` 写入含 `error.message` 和 `durationMs` ← ADD-6 失败路径等价
- [ ] Task 2: `handleLLMEnd` 提取 `llmOutput?.tokenUsage` 写入 AuditLog
- [ ] Task 2: `handleToolStart/End/Error` 覆盖完整（start 含 inputPreview、end 含 outputLength、error 含 error）
- [ ] Task 2: `writeAuditLog()` 使用 `.catch()` fire-and-forget，不阻塞 Agent pipeline

## Phase 2: Callback 注入

- [ ] Task 3: `runAgent()` 中创建 `AuditCallback` 并追加到 `config.callbacks`
- [ ] Task 3: `streamAgent()` 中创建 `AuditCallback` 并追加到 `config.callbacks`
- [ ] Task 3: `traceId` 来源于 `conversationContext.traceId`（由 L1 tracer 生成）
- [ ] Task 3: callbacks 数组追加而非覆盖（保留用户传入的其他 callbacks）
- [ ] Task 3: 每次调用创建新 `AuditCallback` 实例（避免跨请求状态污染）

## Phase 3: 兼容性

- [ ] Task 4: `agent-audit-logger.ts` 现有导出（`agentAudit*`、`writeAuditLog`、`setAuditContext`）不变
- [ ] Task 4: `wrapNodeWithAudit` 的 L1 dev-logger（console + file）行为不变
- [ ] Task 4: `auditNodeEvent()` 的 DB 写入与 callback 的 DB 写入不冲突（同名 action 但不同来源）

## 编译与类型检查

- [ ] Task 5: `npx tsc --noEmit` 编译通过
- [ ] Task 5: 无 `any` 类型逃逸
- [ ] Task 5: 无 unused import 警告

## ADD 规则合规检查

- [ ] ADD-2 阶段标记对称：callback 的 handleChainStart/End/Error 成对出现
- [ ] ADD-4 三通道输出：`writeAuditLog` 写入 AuditLog DB 表，`console.error` 兜底。file 通道由 L1 dev-logger 覆盖。
- [ ] ADD-6 失败路径等价：`handleChainError` 写入 `error.message` + `durationMs`，信息密度与 `handleChainEnd` 一致
- [ ] Plan/Spec 一致性：代码实现与 spec.md Requirements 一致

## 手动验证（未执行的端到端验证，实施后逐项勾选）

- [ ] 端到端：发送聊天消息 → Agent pipeline 执行 → `query_audit_logs({ targetType: "AGENT_NODE" })` 返回所有节点记录
- [ ] 端到端：LLM 调用 → `query_audit_logs({ targetType: "AGENT_LLM" })` 返回 token 用量记录
- [ ] 端到端：Tool 调用 → `query_audit_logs({ targetType: "AGENT_TOOL" })` 返回 tool 输入/输出记录
- [ ] 端到端：节点异常 → `query_audit_logs({ action: "NODE_ERROR_*" })` 返回错误记录
- [ ] 端到端：非 Agent 节点的 chain 不产生 AuditLog（过滤生效）
- [ ] 端到端：同一请求的 L1 dev-logger（console + file）和 L2 callback（AuditLog DB）使用相同 `traceId`
