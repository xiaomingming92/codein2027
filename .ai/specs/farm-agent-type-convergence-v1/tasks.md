# Tasks: 基础层 — 类型收敛 + thinkingLevel 路由

## Preconditions

- [ ] 已执行 `session-init` SKILL
- [ ] 已执行 `add-paradigm` SKILL（Step 0 文档先行）
- [ ] 已阅读 `.trae/specs/co-agent-type-convergence/spec.md`
- [ ] 已阅读 `.trae/specs/co-agent-type-convergence/checklist.md`
- [ ] 已阅读 `.trae/documents/co-agent-conversation-handoff.md` 的 `<第1轮>` 章节
- [ ] 已确认本轮是第 1 轮/7，上游无依赖
- [ ] 已确认本轮只覆盖 `co-agent-simplified-v1.md` Step 1 + Step 2
- [ ] 已运行或记录基线状态：`npx tsc --noEmit`

## Forbidden

- 禁止修改 Prisma Schema（`prisma/schema.prisma`）
- 禁止修改前端组件（React/Vue 组件文件）
- 禁止覆盖或重构已有 stream-bus / SSE 事件总线逻辑
- 禁止删除现有 Agent 审计、traceId、route decision、structured output
- 禁止引入 worldline / L0-L4 / VerdictRegistry / CapabilityModel
- 禁止把第 2 轮 ResponseStrategy 或第 3 轮 AnalysisContext 提前塞入本轮
- 禁止为了通过类型检查把真实 `source: "knowledge"` 等运行时来源改成不准确来源
- 禁止使用 `any` 规避类型收敛
- 禁止简化代码实现，一切以代码高质量为衡量标准

## Task 1: 统一 Evidence 类型定义

- [ ] 修改 `src/types/evidence.ts`
  - [ ] 新增 `EvidenceSource` union，至少覆盖：`document` / `knowledge` / `knowledge_empty` / `project_context` / `keywords` / `multimodal` / `task` / `economic` / `history` / `team_input` / `sensor`
  - [ ] Evidence 新增 `chunkId?: string`
  - [ ] Evidence 新增 `expandable?: boolean`
  - [ ] Evidence 新增 `detailUrl?: string`
  - [ ] Evidence 新增 `score?: number`
  - [ ] Evidence 的 `source` 改为 `EvidenceSource`
  - [ ] 新增 `EvidenceRef`，字段为 `id` / `chunkId?` / `source` / `reliability` / `relevance` / `docName?` / `contentExcerpt?`
  - [ ] 新增 `EvidenceSummary`，字段为 `id` / `chunkId?` / `source` / `type` / `relevance` / `summary`
  - [ ] 新增 `ThinkingLevel = "fast" | "deep"`
  - [ ] 保留现有 `EvidenceChain` / `ReasoningStep` / `Conclusion` / `ConfidenceBreakdown` / `RiskItem` / helper 函数
- [ ] 验证：`npx tsc --noEmit` 不因类型源头修改出现新增错误
- [ ] 验证：`grep -R "interface Evidence " src/` 暂时可多处命中，但 `src/types/evidence.ts` 已成为最终权威定义

## Task 2: 消除内联 Evidence 重复定义

- [ ] 修改 `src/agents/state.ts`
  - [ ] 删除内联 `interface Evidence`
  - [ ] 新增 `import type { Evidence, ThinkingLevel } from "@/types/evidence"`
  - [ ] `CurrentTask` 新增 `thinkingLevel?: ThinkingLevel`
  - [ ] `evidenceChain` 保持 `Annotation<Evidence[] | null>()`
  - [ ] 不改变其他 AgentState 字段语义
- [ ] 修改 `src/agents/prompts/types.ts`
  - [ ] 新增 `import type { EvidenceRef, ThinkingLevel } from "@/types/evidence"`
  - [ ] `IntentionOutput` 新增或兼容 `thinkingLevel?: ThinkingLevel`，不得依赖 LLM 必填该字段
  - [ ] 所有 prompt 输入中用于引用证据的列表改为 `EvidenceRef[]`
  - [ ] 不允许局部匿名完整 evidence content 结构替代 `EvidenceRef`
- [ ] 修改 `src/agents/nodes/interaction-point-detection.ts`
  - [ ] evidence 输入/映射使用统一 `Evidence` 或 `EvidenceRef`
  - [ ] 不新增局部 `interface Evidence`
- [ ] 修改 `src/agents/prompts/interaction-point-detection.ts`
  - [ ] prompt evidence 输入使用统一 `EvidenceRef` 或由统一类型派生
  - [ ] 不新增局部 `interface Evidence`
- [ ] 验证：`grep -R "interface Evidence " src/` 仅在 `src/types/evidence.ts` 出现一次
- [ ] 验证：`grep -R "EvidenceRef" src/agents` 能看到 prompt / interaction 相关引用

## Task 3: 实现 thinkingLevel 写入

- [ ] 修改 `src/agents/nodes/intention.ts`
  - [ ] 新增内部计算逻辑：`intent === "chat" ? "fast" : "deep"`
  - [ ] explicitIntent 路径写入 `thinkingLevel`
  - [ ] LLM parse success 路径写入 `thinkingLevel`
  - [ ] parse fallback 到 chat 路径写入 `thinkingLevel: "fast"`
  - [ ] 无用户消息 early return 不主动覆盖旧 state
  - [ ] `stream.structuredOutput` 中可观测到 thinkingLevel 或保留足够审计字段
  - [ ] `agentAudit` extra 中记录 intent 与 thinkingLevel
- [ ] 验证：`grep -n "thinkingLevel" src/agents/nodes/intention.ts`
- [ ] 验证：显式 `chat` intent 和普通 LLM fallback 都不会遗漏 `thinkingLevel`

## Task 4: 实现 routeByIntent fast/deep 分流

- [ ] 修改 `src/agents/edges/conditional.ts`
  - [ ] `const thinkingLevel = state.currentTask?.thinkingLevel ?? "deep"`
  - [ ] `thinkingLevel === "fast"` 时返回 `"response"`
  - [ ] 其他情况返回 `"retrieval"`
  - [ ] 缺失 thinkingLevel 时保守走 `deep/retrieval`
  - [ ] 保留 `traceId` 下的 `getActiveTracer(traceId)?.recordRouteDecision(...)`
  - [ ] 保留 `agentAuditRoute("intention", target, reason)`
  - [ ] reason 中包含 thinkingLevel 与 intent，便于后续 query_audit_logs / 日志排查
- [ ] 验证：手工构造无 thinkingLevel 的 state 时 `routeByIntent` 返回 `retrieval`
- [ ] 验证：fast 通道不会进入 retrieval
- [ ] 验证：deep 通道保持完整链路

## Task 5: 填充 knowledge evidence chunkId

- [ ] 修改 `src/agents/nodes/retrieval.ts`
  - [ ] 为 knowledge result 增加真实 chunkId 提取函数或等价局部逻辑
  - [ ] 提取优先级：`metadata.chunkId` → `metadata.vectorId` → `metadata.id` → `documentId + chunkIndex` → `documentId + chunk_id`
  - [ ] 只有真实 metadata 可追溯时才填 `chunkId`
  - [ ] 禁止用 `evidenceId` 或随机 UUID 伪造 `chunkId`
  - [ ] 保留 `metadata: { ...result.metadata, documentName, distance, isFullDocumentRequest }`
  - [ ] `stream.evidenceFound` 输出中尽量携带 `chunkId`，若事件类型不支持则不得破坏现有事件结构
  - [ ] structured evidence summary 中尽量携带 `chunkId`，并可映射 `EvidenceSummary`
- [ ] 验证：RAG 命中文档时 knowledge evidence 含真实 `chunkId` 或 metadata 中保留可追溯 chunk 标识
- [ ] 验证：`grep -n "chunkId" src/agents/nodes/retrieval.ts`

## Task 6: 全局类型与静态验证

- [ ] 运行 `npx tsc --noEmit`
- [ ] 运行 `npm run lint`
- [ ] 运行 `grep -R "interface Evidence " src/`
- [ ] 运行 `grep -R "thinkingLevel" src/agents`
- [ ] 运行 `grep -R "source: \"knowledge\"" src/agents/nodes/retrieval.ts`
- [ ] 运行 `grep -R "chunkId" src/agents/nodes/retrieval.ts`
- [ ] 确认 `src/types/evidence.ts` 是唯一 Evidence 定义位置
- [ ] 确认无 `any` 类型绕过新增契约

## Task 7: 运行时行为验证

- [ ] 启动项目所需基础设施或确认已有服务可用
- [ ] 发送“你好”
  - [ ] SSE 序列包含 intention 与 response
  - [ ] SSE 序列不包含 retrieval
  - [ ] SSE 序列不包含 reasoning
  - [ ] SSE 序列不包含 interactionPointDetection
  - [ ] SSE 序列不包含 verdict
  - [ ] 回复保持短回答，不强制 RAG
- [ ] 发送“水稻育秧步骤”
  - [ ] SSE 序列包含 intention
  - [ ] SSE 序列包含 retrieval
  - [ ] SSE 序列包含 reasoning
  - [ ] SSE 序列包含 interactionPointDetection
  - [ ] SSE 序列包含 verdict
  - [ ] SSE 序列包含 response
- [ ] 若环境无法运行 SSE 验证，必须在最终说明中明确阻塞原因，并保留静态验证结果

## Task 8: Checklist 与 ADD-7 审计

- [ ] 每完成一个 Task 后读取 `checklist.md`
- [ ] 对照 checklist 逐项验证
- [ ] 可确认项在 checklist 中勾选
- [ ] 每个代码文件完成后调用 `record_dev_operation`
- [ ] 审计 action 参照 spec 中 `ADD-7 Audit Strategy`
- [ ] 本轮全部完成后记录一次第1轮完成审计，关键词包含 `EVIDENCE_TYPE_UNIFIED` 与 `THINKING_LEVEL_ROUTING`

## Task Dependencies

- Task 2 依赖 Task 1
- Task 3 依赖 Task 2
- Task 4 依赖 Task 3
- Task 5 依赖 Task 1
- Task 6 依赖 Task 1-5
- Task 7 依赖 Task 1-6
- Task 8 贯穿 Task 1-7

## Verification

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `grep -R "interface Evidence " src/`
- [ ] `grep -R "thinkingLevel" src/agents`
- [ ] 当前 spec `checklist.md` 全部通过或明确标注运行环境阻塞项
- [ ] 当前轮次 ADD-7 `record_dev_operation` 已逐文件记录

## 对话启动（将此段粘贴给新的 LLM 对话）

你在执行 farm-agent 改进的 **第1轮**（基础层 — 类型收敛 + thinkingLevel 路由）。上游无依赖，从当前代码基线开始。

**启动步骤（按顺序）：**
1. 执行 `session-init` SKILL（恢复上下文）
2. 执行 `add-paradigm` SKILL（Step 0 文档先行）
3. 阅读 `.trae/specs/co-agent-type-convergence/spec.md`
4. 按本文档 `tasks.md` 顺序执行，每完成一个 Task 读 `checklist.md` 逐项验证并勾选
5. 全部完成后调用 `record_dev_operation` 逐文件记录 ADD-7 审计

**文件清单（8 修改）：**
`src/types/evidence.ts` / `src/agents/state.ts` / `src/agents/prompts/types.ts` / `src/agents/nodes/intention.ts` / `src/agents/edges/conditional.ts` / `src/agents/nodes/retrieval.ts` / `src/agents/nodes/interaction-point-detection.ts` / `src/agents/prompts/interaction-point-detection.ts`

**关键提醒：** 当前执行第1轮/7+1。禁止修改 Prisma Schema、前端组件、stream-bus 逻辑。不得把真实 `source: "knowledge"` 等来源误改成不准确来源。缺失 thinkingLevel 时必须 fallback 到 deep/retrieval。完成后立即 record_dev_operation 并用 query_audit_logs 回查（第2轮将通过 query_audit_logs 恢复上下文）。
