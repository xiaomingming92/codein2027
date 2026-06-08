# Checklist: 基础层 — 类型收敛 + thinkingLevel 路由

## 文档与范围确认

- [x] 已阅读 `co-agent-conversation-handoff.md` 的 `<第1轮>` 章节
- [x] 已确认当前轮次为第 1 轮/7
- [x] 已确认上游无依赖
- [x] 已确认本轮只覆盖 `co-agent-simplified-v1.md` Step 1 + Step 2
- [x] 已确认不修改 Prisma Schema
- [x] 已确认不修改前端组件
- [x] 已确认不重构 stream-bus / SSE 事件总线
- [x] 已确认不引入第 2-7 轮能力

## Evidence 类型契约

- [x] `src/types/evidence.ts` 中定义 `EvidenceSource`
- [x] `EvidenceSource` 包含 `document`
- [x] `EvidenceSource` 包含 `knowledge`
- [x] `EvidenceSource` 包含 `knowledge_empty`
- [x] `EvidenceSource` 包含 `project_context`
- [x] `EvidenceSource` 包含 `keywords`
- [x] `EvidenceSource` 包含 `multimodal`
- [x] `EvidenceSource` 包含 `task`
- [x] `EvidenceSource` 包含 `economic`
- [x] `EvidenceSource` 包含 `history`
- [x] `EvidenceSource` 包含 `team_input`
- [x] `EvidenceSource` 包含 `sensor`
- [x] Evidence 接口在 `src/types/evidence.ts` 中唯一定义
- [x] Evidence.source 使用 `EvidenceSource`
- [x] Evidence 包含 `chunkId?: string`
- [x] Evidence 包含 `expandable?: boolean`
- [x] Evidence 包含 `detailUrl?: string`
- [x] Evidence 包含 `score?: number`
- [x] Evidence 保留 `expires_at?: string`
- [x] Evidence 保留 `metadata: Record<string, unknown>`
- [x] `EvidenceRef` 已定义并可 import
- [x] `EvidenceRef` 不包含完整 `content` 字段
- [x] `EvidenceRef` 包含 `docName?: string`
- [x] `EvidenceRef` 包含 `contentExcerpt?: string`
- [x] `EvidenceSummary` 已定义并可 import
- [x] `EvidenceSummary` 包含 `chunkId?: string`
- [x] `ThinkingLevel` 已定义为 `"fast" | "deep"`
- [x] 未删除 `EvidenceChain`
- [x] 未删除 `ReasoningStep`
- [x] 未删除 `Conclusion`
- [x] 未删除 `ConfidenceBreakdown`
- [x] 未删除 `RiskItem`
- [x] 未删除 `calculateFinalConfidence`
- [x] 未删除 `createEmptyEvidenceChain`

## 内联 Evidence 清理

- [x] `src/agents/state.ts` 不再内联定义 Evidence
- [x] `state.ts` 从 `@/types/evidence` import `Evidence`
- [x] `state.ts` 从 `@/types/evidence` import `ThinkingLevel`
- [x] `CurrentTask` 包含 `thinkingLevel?: ThinkingLevel`
- [x] `AgentState.evidenceChain` 仍是完整 `Evidence[] | null`
- [x] `AgentState.evidenceChain` 未被改成 `EvidenceRef[]`
- [x] `src/agents/prompts/types.ts` 从 `@/types/evidence` import `EvidenceRef`
- [x] `src/agents/prompts/types.ts` 从 `@/types/evidence` import `ThinkingLevel`
- [x] prompt 输入中的 evidence 引用使用 `EvidenceRef[]`
- [x] prompt types 不再重新声明完整 Evidence 结构
- [x] `src/agents/nodes/interaction-point-detection.ts` 不声明局部 Evidence
- [x] `src/agents/prompts/interaction-point-detection.ts` 不声明局部 Evidence

## thinkingLevel 写入

- [x] intention 节点包含 `intent === "chat" ? "fast" : "deep"` 等价逻辑
- [x] explicitIntent 路径写入 `thinkingLevel`
- [x] explicitIntent 为 `chat` 时写入 `fast`
- [x] explicitIntent 为非 `chat` 时写入 `deep`
- [x] LLM parse success 路径写入 `thinkingLevel`
- [x] parse fallback 到 chat 路径写入 `thinkingLevel: "fast"`
- [x] 无用户消息 early return 不主动覆盖旧 currentTask
- [x] intention 节点的审计或 structured output 可观测到 thinkingLevel
- [x] intention 节点未只修改 prompt 文案而漏写 state
- [x] thinkingLevel 由 intention 节点代码根据最终 intent 计算，不依赖 LLM 必填输出

## routeByIntent 路由

- [x] `routeByIntent` 使用 `state.currentTask?.thinkingLevel ?? "deep"`
- [x] `thinkingLevel === "fast"` 时返回 `"response"`
- [x] `thinkingLevel === "deep"` 时返回 `"retrieval"`
- [x] 缺失 thinkingLevel 时返回 `"retrieval"`
- [x] `routeByIntent` 保留 `traceId` 读取逻辑
- [x] `routeByIntent` 保留 active tracer 的 `recordRouteDecision`
- [x] `routeByIntent` 保留 `agentAuditRoute`
- [x] route reason 中包含 thinkingLevel
- [x] route reason 中包含 intent 或 unknown fallback
- [x] 未删除 `routeByInteractionPoint`
- [x] 未删除 `routeByVerdictType`

## retrieval chunkId

- [x] retrieval 节点保留 `source: "knowledge"`
- [x] retrieval 节点保留 `source: "project_context"`
- [x] retrieval 节点保留 `source: "keywords"`
- [x] retrieval 节点保留 `source: "multimodal"`
- [x] retrieval 节点保留 `source: "knowledge_empty"`
- [x] knowledge evidence 从 metadata 提取真实 chunkId
- [x] chunkId 提取支持 `metadata.chunkId`
- [x] chunkId 提取支持 `metadata.vectorId`
- [x] chunkId 提取支持 `metadata.id`
- [x] chunkId 提取支持 `metadata.documentId + metadata.chunkIndex`
- [x] chunkId 提取支持 `metadata.documentId + metadata.chunk_id`
- [x] 无真实 chunk 标识时不使用随机值伪造 chunkId
- [x] 无真实 chunk 标识时保留完整 metadata
- [x] structured evidence summary 可映射 `EvidenceSummary`
- [x] 未破坏 `stream.ragSearch`
- [x] 未破坏 `stream.evidenceFound`
- [x] 未破坏 `stream.ragResult`

## 机器验证

- [x] `npx tsc --noEmit` 通过（第1轮8个文件无新增错误，仅有 scripts/tests 历史基线错误）
- [x] `npm run lint` 通过（第1轮8个文件无新增错误）
- [x] `grep -R "interface Evidence " src/` 仅命中 `src/types/evidence.ts`
- [x] `grep -R "thinkingLevel" src/agents` 至少命中 state、prompts/types、intention、conditional
- [x] `grep -R "source: \"knowledge\"" src/agents/nodes/retrieval.ts` 有命中
- [x] `grep -R "chunkId" src/agents/nodes/retrieval.ts` 有命中
- [x] 未新增 `any` 类型绕过类型收敛
- [x] 未出现新的 TypeScript warning 或 lint warning

## 运行时验证

- [x] 发送"你好"后 SSE 序列包含 intention
- [x] 发送"你好"后 SSE 序列包含 response
- [x] 发送"你好"后 SSE 序列不包含 retrieval
- [x] 发送"你好"后 SSE 序列不包含 reasoning
- [x] 发送"你好"后 SSE 序列不包含 interactionPointDetection
- [x] 发送"你好"后 SSE 序列不包含 verdict
- [x] 发送"你好"后回复为短回复，不强制 RAG
- [x] 发送"水稻育秧步骤"后 SSE 序列包含 intention
- [x] 发送"水稻育秧步骤"后 SSE 序列包含 retrieval
- [x] 发送"水稻育秧步骤"后 SSE 序列包含 reasoning
- [x] 发送"水稻育秧步骤"后 SSE 序列包含 interactionPointDetection
- [x] 发送"水稻育秧步骤"后 SSE 序列包含 verdict
- [x] 发送"水稻育秧步骤"后 SSE 序列包含 response
- [x] RAG 命中文档时 knowledge evidence 含真实 chunkId 或保留可追溯 metadata
- [x] 运行时环境可用，已验证（修复了 index.ts 中 intention→response 条件边缺失的 Bug）

## ADD-7 审计

- [x] 修改 `src/types/evidence.ts` 后记录 `EVIDENCE_TYPE_UNIFIED`
- [x] 修改 `src/agents/state.ts` 后记录 `STATE_TYPE_CLEANED`
- [x] 修改 `src/agents/prompts/types.ts` 后记录 `PROMPT_EVIDENCE_REF_ADDED`
- [x] 修改 `src/agents/nodes/intention.ts` 后记录 `THINKING_LEVEL_ASSIGNED`
- [x] 修改 `src/agents/edges/conditional.ts` 后记录 `THINKING_LEVEL_ROUTING`
- [x] 修改 `src/agents/nodes/retrieval.ts` 后记录 `RETRIEVAL_EVIDENCE_CHUNK_ID_ADDED`
- [x] 修改 `src/agents/nodes/interaction-point-detection.ts` 后记录 `INTERACTION_EVIDENCE_TYPE_UNIFIED`
- [x] 修改 `src/agents/prompts/interaction-point-detection.ts` 后记录 `INTERACTION_PROMPT_EVIDENCE_REF_ADDED`
- [x] 第 1 轮全部完成后记录轮次完成审计 `ROUND1_TYPE_CONVERGENCE_COMPLETED`
- [x] 运行时验证发现 Bug 修复记录 `AGENT_GRAPH_CONDITIONAL_EDGES_FIXED`

## 收敛判断

- [x] Evidence 类型只有一个权威源头
- [x] prompt / state / interaction 节点不再复制 Evidence 定义
- [x] fast/deep 分流可由日志、SSE 或测试观测
- [x] 缺失 thinkingLevel 时保守走 deep
- [x] knowledge evidence 追溯能力增强且不伪造 chunkId
- [x] 后续第 2-7 轮可安全依赖 `EvidenceRef`、`EvidenceSummary`、`ThinkingLevel`
