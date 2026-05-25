# 基础层 — 类型收敛 + thinkingLevel 路由 Spec

## Why

当前代码存在两套 Evidence 定义：`src/types/evidence.ts` 是类型源头，`src/agents/state.ts` 内联定义了另一套 Evidence，且字段不一致。Prompt types 中也存在只服务局部节点的 evidence 结构。重复定义会导致后续 ResponseStrategy、AnalysisContext、SemanticCache、EvolutionLoop、Audit Pipeline 消费证据时出现类型漂移。

当前所有意图都无差别进入完整 6 节点管线：

```text
intention → retrieval → reasoning → interactionPointDetection → verdict → response
```

这会让普通 chat 消息浪费 RAG、推理和裁决成本。第 1 轮必须在所有后续轮次之前统一类型基础，并建立 `fast` / `deep` 双通道路由。

## Documentation First 状态

- 已执行 `find_related_docs({ query: "farm-agent type convergence Evidence thinkingLevel routing", category: "architecture" })`。
- `docs/` 目录未命中直接描述本次 farm-agent 类型收敛与 thinkingLevel 路由的架构文档。
- 本轮规格细化以 `.trae/documents/co-agent-simplified-v1.md`、`.trae/documents/co-agent-simplified-v1-execution-plan.md`、`.trae/documents/co-agent-conversation-handoff.md` 为依据。
- 本次变更是执行规格细化，不修改运行时外部 API、不修改数据库 Schema、不修改前端组件。

## What Changes

- 统一 Evidence 类型源头，`src/types/evidence.ts` 成为唯一允许定义 `interface Evidence` 的文件。
- 合并当前代码已使用字段与父 Plan 预留字段，新增 `chunkId`、`expandable`、`detailUrl`、`score`。
- 新增 `EvidenceRef` 作为 prompt / strategy / context 的轻量证据引用句柄，不携带完整 content。
- 新增 `EvidenceSummary` 作为 evidence digest、stream structured output 和后续展示摘要的轻量结构。
- 删除 `state.ts` 与 `prompts/types.ts` 中的内联 evidence 结构，改为 import 统一类型。
- `CurrentTask` 新增 `thinkingLevel` 字段，intention 节点在所有返回路径中写入。
- `routeByIntent` 以 `thinkingLevel` 为第一分流条件：`fast → response`，`deep → retrieval`。
- retrieval 节点为知识库证据补充 `chunkId`，并保留既有 stream-bus / SSE 事件语义。

## Impact

- Affected specs: 第 1 轮 `co-agent-type-convergence`。
- Affected code: `src/types/evidence.ts`, `src/agents/state.ts`, `src/agents/prompts/types.ts`, `src/agents/nodes/intention.ts`, `src/agents/edges/conditional.ts`, `src/agents/nodes/retrieval.ts`, `src/agents/nodes/interaction-point-detection.ts`, `src/agents/prompts/interaction-point-detection.ts`。
- 父 Plan: [co-agent-simplified-v1.md](../../documents/co-agent-simplified-v1.md)。
- 后续依赖: 第2轮 ResponseStrategy、第3轮 AnalysisContext、第4轮 Pipeline Integration、第5轮 SemanticCache、第6轮 EvolutionLoop、第7轮 Audit Pipeline。

## Final Type Contract

### Requirement: Evidence 类型唯一源头

系统 SHALL 仅在 `src/types/evidence.ts` 中定义 `interface Evidence`。任何其他文件不得重新声明 `interface Evidence`，只能通过 import 复用。

最终 Evidence SHALL 覆盖当前代码已存在来源与父 Plan 预留来源，避免在类型收敛时误收窄运行时已有 evidence source。

```typescript
export type EvidenceSource =
  | "document"
  | "knowledge"
  | "knowledge_empty"
  | "project_context"
  | "keywords"
  | "multimodal"
  | "task"
  | "economic"
  | "history"
  | "team_input"
  | "sensor"

export interface Evidence {
  id: string
  chunkId?: string
  source: EvidenceSource
  type: string
  content: string
  reliability: number
  relevance: number
  timestamp: string
  expires_at?: string
  metadata: Record<string, unknown>
  expandable?: boolean
  detailUrl?: string
  score?: number
}
```

#### Scenario: Evidence 字段合并

- **WHEN** 任意 Agent 节点 import `Evidence`。
- **THEN** `Evidence` 同时支持知识库证据、项目上下文证据、关键词证据、多模态证据、空检索警告证据和父 Plan 预留业务证据。
- **AND** `chunkId` 为可选字段，只对可追溯到具体 chunk 的文档证据强制填充。

#### Scenario: Evidence source 不误收窄

- **WHEN** retrieval 节点继续产出 `source: "knowledge" | "project_context" | "keywords" | "multimodal" | "knowledge_empty"`。
- **THEN** TypeScript 编译通过。
- **AND** 不允许为了通过类型检查把这些真实来源改成不准确的 `"document"`。

### Requirement: EvidenceRef 引用句柄

系统 SHALL 在 `src/types/evidence.ts` 定义 `EvidenceRef`，用于 prompt、strategy、context 中引用证据，避免重复传递完整 content。

```typescript
export interface EvidenceRef {
  id: string
  chunkId?: string
  source: EvidenceSource
  reliability: number
  relevance: number
  docName?: string
  contentExcerpt?: string
}
```

#### Scenario: Prompt 引用证据

- **WHEN** prompt types 中需要传递证据列表。
- **THEN** 使用 `EvidenceRef[]`。
- **AND** `EvidenceRef` 不包含完整 `content` 字段。
- **AND** `contentExcerpt` 只能存放截断摘要，不承担完整证据内容职责。

### Requirement: EvidenceSummary 展示摘要

系统 SHALL 在 `src/types/evidence.ts` 定义 `EvidenceSummary`，用于 stream structured output、evidence digest 和后续展示摘要。

```typescript
export interface EvidenceSummary {
  id: string
  chunkId?: string
  source: EvidenceSource
  type: string
  relevance: number
  summary: string
}
```

#### Scenario: Stream 输出证据摘要

- **WHEN** retrieval 节点通过 `stream.evidenceFound` 或 structured output 输出证据摘要。
- **THEN** 输出结构可映射为 `EvidenceSummary`。
- **AND** summary 必须来自真实 evidence content 的截断或业务摘要，不得伪造。

### Requirement: ThinkingLevel 类型

系统 SHALL 定义并复用统一的 `ThinkingLevel` 类型。

```typescript
export type ThinkingLevel = "fast" | "deep"
```

`CurrentTask` SHALL 增加 `thinkingLevel?: ThinkingLevel`。字段保持可选，以兼容旧 state、显式 intent、异常 fallback 和后续历史消息恢复；路由处必须做保守 fallback。thinkingLevel 应由 intention 节点代码根据最终 intent 计算，不应要求 LLM 在 structured output 中必填。

## Route Behavior Contract

### Requirement: intention 节点写入 thinkingLevel

系统 SHALL 在 intention 节点所有可返回 `currentTask` 的路径中写入 `thinkingLevel`。

| 场景 | intent 来源 | thinkingLevel |
|------|------------|---------------|
| LLM 解析为 `chat` | `parsed.intent` | `fast` |
| LLM 解析为非 `chat` | `parsed.intent` | `deep` |
| LLM 解析失败 fallback 到 `chat` | fallback | `fast` |
| `explicitIntent === "chat"` | explicit | `fast` |
| `explicitIntent` 为其他值 | explicit | `deep` |
| 无用户消息，沿用旧 `currentTask` | state | 不主动覆盖，交给路由 fallback |

#### Scenario: fast 通道

- **WHEN** 用户发送“你好”。
- **THEN** intention 节点输出 `currentTask.intent = "chat"`。
- **AND** `currentTask.thinkingLevel = "fast"`。
- **AND** SSE 事件序列不得出现 retrieval、reasoning、interactionPointDetection、verdict。

#### Scenario: deep 通道

- **WHEN** 用户发送“水稻育秧步骤”。
- **THEN** intention 节点输出非 chat 意图或显式 deep 语义。
- **AND** `currentTask.thinkingLevel = "deep"`。
- **AND** SSE 事件序列应覆盖完整深链路。

### Requirement: routeByIntent 按 thinkingLevel 分流

`routeByIntent` SHALL 以 `state.currentTask?.thinkingLevel ?? "deep"` 作为分流依据。

```typescript
const intent = state.currentTask?.intent || state.explicitIntent
const thinkingLevel = state.currentTask?.thinkingLevel ?? "deep"
const target = thinkingLevel === "fast" ? "response" : "retrieval"
const reason = `thinkingLevel=${thinkingLevel}, intent=${intent || "unknown"}`

recordExistingTraceRouteDecision(traceId, target, reason)
agentAuditRoute("intention", target, reason)
return target
```

以上为行为伪代码，不是完整函数替换。实现时必须保留当前 `routeByIntent` 中已有的 traceId tracer、route decision、agent audit 与其他路由函数。

#### Scenario: thinkingLevel fallback

- **WHEN** `currentTask.thinkingLevel` 未定义。
- **THEN** 默认按 `deep` 处理。
- **AND** 不允许因为字段缺失跳过 retrieval。

#### Scenario: traceId 路由审计兼容

- **WHEN** `state.conversationContext.traceId` 存在。
- **THEN** `routeByIntent` 仍需调用 active tracer 的 route decision 记录。
- **AND** 不得删除现有 `agentAuditRoute` 调用。

## File-level Change Matrix

| 文件 | 目标状态 | 禁止事项 | 验证方式 |
|------|----------|----------|----------|
| `src/types/evidence.ts` | 定义 `EvidenceSource`、`Evidence`、`EvidenceRef`、`EvidenceSummary`、`ThinkingLevel` | 禁止删除现有 `EvidenceChain`、`ReasoningStep`、`Conclusion`、`ConfidenceBreakdown` 等导出 | `npx tsc --noEmit`；`grep -R "interface Evidence " src/` |
| `src/agents/state.ts` | 删除内联 `Evidence`；import `Evidence` 与 `ThinkingLevel`；`CurrentTask.thinkingLevel?: ThinkingLevel` | 禁止改变 `AgentState` 其他字段语义；禁止把 `evidenceChain` 改成摘要类型 | `grep -n "interface Evidence" src/agents/state.ts` 无结果 |
| `src/agents/prompts/types.ts` | import `EvidenceRef` 与 `ThinkingLevel`；prompt evidence list 使用 `EvidenceRef[]`；相关 CurrentTask 类型携带 thinkingLevel | 禁止继续定义匿名完整 evidence content 结构；禁止引入 `any` | `grep -n "content: string" src/agents/prompts/types.ts` 人工确认不属于 evidence ref |
| `src/agents/nodes/intention.ts` | LLM、fallback、explicit intent 路径都设置 thinkingLevel | 禁止只改 prompt 文案不落 state；禁止 explicitIntent 路径漏写 | `grep -n "thinkingLevel" src/agents/nodes/intention.ts` |
| `src/agents/edges/conditional.ts` | `routeByIntent` 按 thinkingLevel 分流，保留 traceId 与 agent audit | 禁止删除 tracer；禁止删除 deep 链路；禁止缺失 fallback | fast/deep SSE 验证；审计日志含 route decision |
| `src/agents/nodes/retrieval.ts` | knowledge evidence 填充 `chunkId`；structured summary 可映射 EvidenceSummary | 禁止为非文档来源伪造 chunkId；禁止吞掉 `result.metadata` | RAG 查询后 evidenceChain 中 knowledge evidence 有 chunkId 或 metadata 中有可追溯 chunk 标识 |
| `src/agents/nodes/interaction-point-detection.ts` | 使用统一 Evidence/EvidenceRef 类型 | 禁止定义局部 Evidence | `grep -n "interface Evidence"` 无结果 |
| `src/agents/prompts/interaction-point-detection.ts` | 使用统一 EvidenceRef 或由统一类型派生的输入 | 禁止重复写匿名完整 evidence 类型 | TypeScript 编译通过 |

## ChunkId Contract

### Requirement: retrieval 节点填充 chunkId

知识库检索结果当前返回 `{ content, metadata, distance, relevance }`。retrieval 节点 SHALL 从 metadata 中优先提取真实 chunk 标识：

1. `metadata.chunkId`
2. `metadata.vectorId`
3. `metadata.id`
4. `metadata.documentId` + `metadata.chunkIndex`
5. `metadata.documentId` + `metadata.chunk_id`

如果以上均不存在，则 `chunkId` 可以保持 undefined，但必须保留完整 metadata，不得用随机值伪造 chunkId。

#### Scenario: 有真实 chunk 标识

- **WHEN** Chroma metadata 中存在 `chunkId`、`vectorId` 或可组合的 document/chunk index。
- **THEN** `Evidence.chunkId` 填入该真实标识。

#### Scenario: 无真实 chunk 标识

- **WHEN** Chroma metadata 不包含任何可追溯 chunk 标识。
- **THEN** `Evidence.chunkId` 保持 undefined。
- **AND** metadata 原样保留，后续可通过 metadata 排查索引链路。

## Forbidden Scope

- 禁止修改 Prisma Schema。
- 禁止修改前端组件。
- 禁止覆盖或重构 stream-bus / SSE 事件总线逻辑。
- 禁止引入 worldline / L0-L4 / VerdictRegistry / CapabilityModel。
- 禁止删除现有 Agent 审计、traceId、stream structured output。
- 禁止为了通过类型检查把真实运行时 source 改成不准确的宽泛值。
- 禁止使用 `any` 规避类型收敛。
- 禁止把第 2 轮及后续能力提前塞入第 1 轮。

## Machine-verifiable Acceptance

```bash
npx tsc --noEmit
npm run lint
grep -R "interface Evidence " src/
grep -R "thinkingLevel" src/agents
grep -R "source: \"knowledge\"" src/agents/nodes/retrieval.ts
grep -R "chunkId" src/agents/nodes/retrieval.ts
```

通过标准：

- `npx tsc --noEmit` 无类型错误。
- `npm run lint` 无新增 lint 错误。
- `grep -R "interface Evidence " src/` 仅命中 `src/types/evidence.ts`。
- `thinkingLevel` 至少出现在 state、prompt types、intention、conditional 中。
- retrieval 保留 `source: "knowledge"`，没有为了适配类型改成不准确 source。
- retrieval 中存在真实 chunkId 提取逻辑。

## Runtime Acceptance

| 场景 | 输入 | 通过标准 |
|------|------|----------|
| fast 通道 | “你好” | SSE 序列包含 intention、response；不包含 retrieval、reasoning、interactionPointDetection、verdict |
| deep 通道 | “水稻育秧步骤” | SSE 序列包含 intention、retrieval、reasoning、interactionPointDetection、verdict、response |
| fallback 通道 | 手工构造无 thinkingLevel 的 currentTask | routeByIntent 返回 retrieval |
| evidence 追溯 | RAG 查询命中文档 chunk | knowledge evidence 含真实 chunkId 或保留可追溯 metadata |

## ADD-7 Audit Strategy

| 文件 | targetType | action | afterState 摘要 |
|------|------------|--------|-----------------|
| `src/types/evidence.ts` | COMPONENT | EVIDENCE_TYPE_UNIFIED | EvidenceSource/Evidence/EvidenceRef/EvidenceSummary/ThinkingLevel 已统一 |
| `src/agents/state.ts` | COMPONENT | STATE_TYPE_CLEANED | 删除内联 Evidence，CurrentTask 增加 thinkingLevel |
| `src/agents/prompts/types.ts` | COMPONENT | PROMPT_EVIDENCE_REF_ADDED | prompt evidence 改为 EvidenceRef[] |
| `src/agents/nodes/intention.ts` | COMPONENT | THINKING_LEVEL_ASSIGNED | intention 所有路径写入 thinkingLevel |
| `src/agents/edges/conditional.ts` | COMPONENT | THINKING_LEVEL_ROUTING | routeByIntent fast/deep 分流，缺省 deep |
| `src/agents/nodes/retrieval.ts` | COMPONENT | RETRIEVAL_EVIDENCE_CHUNK_ID_ADDED | knowledge evidence 填充真实 chunkId 或保留 metadata |
| `src/agents/nodes/interaction-point-detection.ts` | COMPONENT | INTERACTION_EVIDENCE_TYPE_UNIFIED | interaction 节点消费统一类型 |
| `src/agents/prompts/interaction-point-detection.ts` | COMPONENT | INTERACTION_PROMPT_EVIDENCE_REF_ADDED | interaction prompt 消费统一引用类型 |

## MODIFIED Requirements

### Requirement: state.ts 内联 Evidence 定义迁移

**Reason**: `state.ts` 内联 Evidence 与 `src/types/evidence.ts` 重复定义，字段不一致，会破坏后续能力的共享类型基础。

**Migration**: 删除 `state.ts` 内联 `interface Evidence`，改为 `import type { Evidence, ThinkingLevel } from "@/types/evidence"`。

## REMOVED Requirements

### Requirement: 任意文件局部声明 Evidence

**Reason**: 局部 Evidence 会导致类型漂移，后续轮次无法可靠消费证据。

**Migration**: 所有节点、prompt、state 均从 `src/types/evidence.ts` import 或使用 `Pick<Evidence, ...>` / `EvidenceRef` / `EvidenceSummary`。