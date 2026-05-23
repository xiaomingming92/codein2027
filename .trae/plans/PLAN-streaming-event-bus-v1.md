# 流式输出事件总线改造 — 可审计实施计划

## PLAN 元信息

- **Plan 名称**: streaming-event-bus-v1
- **启动时间**: 2026-05-14T09:00:00.000Z
- **主导 AI**: Claude (via Trae IDE)
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| `src/lib/stream-bus-logger.ts` | COMPONENT | COMPONENT_CREATED | 无审计日志器 | 三通道输出(console+file+DB)，10个AuditPhase | ✅ 已完成 |
| `src/agents/stream-bus.ts` | COMPONENT | COMPONENT_CREATED | 无事件总线 | 模块级事件注册表，9种StreamEvent | ✅ 已完成 |
| `src/agents/nodes/response.ts` | COMPONENT | COMPONENT_REFACTOR | invoke() 全量生成 | stream() 逐 token + structured_update | ✅ 已完成 |
| `src/agents/nodes/retrieval.ts` | COMPONENT | COMPONENT_REFACTOR | 无流式事件 | evidence_found 运行时流式 + structured_update 节点结束 | ✅ 已完成 |
| `src/agents/nodes/reasoning.ts` | COMPONENT | COMPONENT_REFACTOR | 无流式事件 | structured_update { reasoningPath } 节点结束 | ✅ 已完成 |
| `src/agents/nodes/verdict.ts` | COMPONENT | COMPONENT_REFACTOR | 无流式事件 | structured_update { verdict } 节点结束 | ✅ 已完成 |
| `src/agents/nodes/intention.ts` | COMPONENT | COMPONENT_REFACTOR | 无流式事件 | structured_update { intent } 节点结束 | ✅ 已完成 |
| `src/agents/nodes/interaction-point-detection.ts` | COMPONENT | COMPONENT_REFACTOR | 无流式事件 | structured_update { interactionPoint } 节点结束 | ✅ 已完成 |
| `src/app/api/agent/chat/stream/route.ts` | API_ROUTE | API_ENDPOINT_MODIFIED | 3字符假流式拆分 | registerStreamBus + thinking降级兼容 | ✅ 已完成 |
| `src/stores/chat-store.ts` | COMPONENT | COMPONENT_REFACTOR | 无 structuredData 增量更新 | 新增 updateLastAssistantStructuredData | ✅ 已完成 |
| `src/components/chat/chat-panel.tsx` | COMPONENT | COMPONENT_REFACTOR | 仅消费 token/thinking/done | 消费 structured_update/evidence_found/rag_search + 新旧token兼容 | ✅ 已完成 |
| `src/components/chat/chat-container.tsx` | COMPONENT | COMPONENT_REFACTOR | 无流式证据/推理展示 | 集成 StreamingEvidenceBar + StreamingReasoningSteps | ✅ 已完成 |
| `src/components/chat/streaming-evidence-bar.tsx` | COMPONENT | COMPONENT_CREATED | 无 | 证据卡片渐进动画，source图标+relevance条+摘要 | ✅ 已完成 |
| `src/components/chat/streaming-reasoning-steps.tsx` | COMPONENT | COMPONENT_CREATED | 无 | 推理步骤渐进动画，step编号+action图标+描述 | ✅ 已完成 |

---

## ADD Step 0：审计阶段定义

### AuditPhase 枚举

```typescript
// src/lib/stream-bus-logger.ts
type StreamBusAuditPhase =
  | "STREAM_BUS_REGISTER"          // 事件总线注册
  | "STREAM_BUS_UNREGISTER"        // 事件总线注销
  | "STREAM_BUS_EMIT"              // 事件推送（通用）
  | "STREAM_BUS_EMIT_RAG_SEARCH"   // RAG 搜索开始
  | "STREAM_BUS_EMIT_EVIDENCE"     // 证据逐条推送（循环内）
  | "STREAM_BUS_EMIT_RAG_RESULT"   // RAG 搜索结果
  | "STREAM_BUS_EMIT_TOKEN"        // LLM token 推送（循环内）
  | "STREAM_BUS_EMIT_STRUCTURED"   // 结构化增量推送
  | "STREAM_BUS_EMIT_DONE"         // 完成事件
  | "STREAM_BUS_EMIT_ERROR"        // 推送失败
```

### 可观测数据结构

```typescript
type StreamBusAuditData = {
  traceId: string
  startedAt: Date
  // 各阶段计数
  ragSearchCount: number
  evidenceEmitCount: number
  tokenEmitCount: number
  structuredUpdateCount: number
  // 各阶段耗时
  ragSearchDurationMs: number
  evidenceEmitDurationMs: number
  tokenEmitDurationMs: number
  // 完成
  completedAt?: Date
  totalDurationMs?: number
  error?: string
}
```

### 数据库审计字段

审计数据写入 `AuditLog` 表（已有），通过 `auditTraceEvent()` 函数写入：

```prisma
model AuditLog {
  // ... 现有字段 ...
  traceId  String?   // 关联同一请求的所有审计事件
  // 通过 traceId 可查询完整调用链:
  // STREAM_BUS_REGISTER → STREAM_BUS_EMIT_RAG_SEARCH
  // → STREAM_BUS_EMIT_EVIDENCE (×N) → STREAM_BUS_EMIT_RAG_RESULT
  // → STREAM_BUS_EMIT_STRUCTURED (×6) → STREAM_BUS_EMIT_TOKEN (×N)
  // → STREAM_BUS_EMIT_DONE
}
```

### Step 0 产出检查

- [x] AuditPhase 枚举已定义，包含所有业务阶段
- [x] 每个阶段都有进入/退出标记的定义
- [x] 可观测数据结构已定义
- [x] 数据库审计字段位置已确定（AuditLog 表 traceId 字段）

---

## 一、问题根因

### 全链路诊断

```
用户发送消息
  → LangGraph agent.stream() 逐节点执行
  → 每个节点内部有丰富数据（证据、推理步骤...）
  → 但 LangGraph 节点边界 = async (state) => result
  → 节点内部数据无法实时外泄到 SSE
  → route.ts 只能拿到节点完成后的完整 chunk
  → response 节点用 invoke() 全量生成 → 拆 3 字符 → 同一毫秒全部 enqueue
  → GUI 表现为 "等待 60 秒 → 全部内容一次性出现"
```

### 日志证据

```
stream-chat.log:
  08:44:26  STREAM_START
  08:45:26  TOKEN_CHUNK #20, #40, ..., #920  ← 全部同一毫秒
  08:45:26  STREAM_DONE
```

---

## 二、架构设计

### 2.1 事件总线机制

新增 `src/agents/stream-bus.ts`，复用 `activeTracers` 模式：

```typescript
// 模块级事件注册表
const streamCallbacks = new Map<string, (event: StreamEvent) => void>()

export function registerStreamBus(traceId: string, push: (e: StreamEvent) => void)
export function unregisterStreamBus(traceId: string)
export function emitStreamEvent(traceId: string, event: StreamEvent)
```

**route.ts 注册**：
```typescript
registerStreamBus(traceId, (event) => {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
})
```

**各节点内推送**：
```typescript
emitStreamEvent(traceId, { type: "evidence_found", evidence: {...} })
```

### 2.2 流式事件类型定义

按推送时机分为两层：

#### Layer A: 运行时流式（节点执行过程中实时推送）

```
Phase 2: retrieval（运行时流式）
  rag_search      { query, status: "searching" }          ← ChromaDB 查询前
  evidence_found  { id, source, type, relevance, summary } ← 循环内逐条推送
  rag_result      { count, sources }                       ← 查询完成后

Phase 6: response（运行时流式 — LLM.stream()）
  response_start  {}
  token           { content: "你" }                        ← 逐 token
  token           { content: "好" }
  ...
  response_end    { fullContent }
```

#### Layer B: 节点结束时流式（节点 return 后推送结构化增量）

每个节点完成后，对应的结构化数据已就绪，立即推送 `structured_update` 增量：

```
Phase 1: intention 结束
  structured_update { intent: { type, source, original } }

Phase 2: retrieval 结束
  structured_update { evidenceChain: { evidences: [...], totalScore, sourceBreakdown } }

Phase 3: reasoning 结束
  structured_update { reasoningPath: { steps: [...], traces: [...] } }

Phase 4: interactionPointDetection 结束
  structured_update { interactionPoint: { type, description, options } | null }

Phase 5: verdict 结束
  structured_update { verdict: { type, conclusion, confidence, risks } }

Phase 6: response 结束
  structured_update { displayContent: { summary, sections } }
```

#### Layer C: 完成

```
done  { threadId, traceId, chainTrace, worldLines }
```

#### 为什么 reasoning 不用运行时流式？

reasoning 节点当前用 `invoke()` 调用 LLM 输出 JSON（含 `reasoning_path` 数组）。要运行时流式需要：
1. 改为 `stream()` + 增量 JSON 解析
2. 在 token 流中识别步骤边界

复杂度高，收益有限（reasoning LLM 调用通常 5-10 秒）。节点结束时一次性 parse 后逐 step 推送 `structured_update` 已足够渐进。

### 2.3 response 节点改造：invoke → stream

当前：
```typescript
const response = await getLLM().invoke(prompt)  // 等待完整文本
responseContent = response.content as string
```

改为：
```typescript
const llmStream = await getLLM().stream(prompt)
for await (const chunk of llmStream) {
  const token = chunk.content as string
  emitStreamEvent(traceId, { type: "token", content: token })
  responseContent += token
}
```

### 2.4 structuredResponse 不再依赖 LLM 输出

当前 `displayContent` 依赖 LLM 返回的 JSON parse。流式场景下 LLM 输出纯文本，无法 parse JSON。

改为从 agent state 直接构建：
```typescript
// 不依赖 LLM 输出，从 state 构建
const structuredResponse: StructuredAgentResponse = {
  traceId,
  intent: { type: intent, source: ..., original: ... },
  evidenceChain: structuredEvidenceChain,    // 来自 state.evidenceChain
  reasoningPath: structuredReasoningPath,    // 来自 state.verdictResult
  verdict: structuredVerdict,                // 来自 state.verdictResult
  interactionPoint: pendingInteraction,      // 来自 state.pendingInteraction
  worldLines: [],
  displayContent: {
    summary: responseContent,                // 来自流式累积
    sections: buildSectionsFromState(state), // 从 state 构建
  },
}
```

### 2.5 流式 prompt 与结构化 prompt 分离

| 场景 | Prompt | 输出格式 | LLM 调用方式 |
|------|--------|---------|------------|
| 流式回答 | 纯文本 prompt | 自然语言 | `stream()` |
| 结构化解析（可选） | JSON prompt | `{"summary":"...","sections":[...]}` | `invoke()`（流式结束后） |

---

## 三、GUI 消费端映射

### 3.1 Layer A: 运行时流式事件

| 事件类型 | 消费组件 | 视觉效果 |
|---------|---------|---------|
| `rag_search` | `StatusIndicator` | "正在搜索知识库: {query}" |
| `evidence_found` | 新增 `StreamingEvidenceBar` | 消息气泡下方逐条出现证据卡片 |
| `rag_result` | `StatusIndicator` | "检索完成: 5 条证据" |
| `token` | `chat-container.tsx` 消息气泡 | 逐字打字机效果 |

### 3.2 Layer B: 节点结束时 structured_update 增量

| 增量字段 | 消费组件 | 视觉效果 |
|---------|---------|---------|
| `intent` | `StatusIndicator` | "意图: analysis" |
| `evidenceChain` | `EvidenceChainPanel` | 证据链面板出现（可折叠） |
| `reasoningPath` | `ReasoningPathPanel` | 推理路径面板出现（步骤逐条展开） |
| `interactionPoint` | `InteractionPointSection` | 交互选项面板出现（如有） |
| `verdict` | `ConfidenceBreakdown` + `RiskDetailPanel` | 置信度 + 风险面板出现 |
| `displayContent` | `StructuredResponseRenderer` | 摘要 + 各 section 渲染 |

### 3.3 Layer C: 完成事件

| 事件类型 | 消费组件 | 说明 |
|---------|---------|------|
| `done` | `chat-panel.tsx` | 停止 streaming |

### 3.4 用户视角时间线

```
t=0s   用户发送消息
t=1s   StatusIndicator: "正在分析意图..."
t=2s   StatusIndicator: "意图: analysis"  ← intention 结束
t=3s   StatusIndicator: "正在搜索知识库: 水稻种植..."
t=4s   StreamingEvidenceBar: 证据1 出现
t=5s   StreamingEvidenceBar: 证据2 出现
t=6s   StreamingEvidenceBar: 证据3 出现
t=7s   EvidenceChainPanel 出现（完整面板）  ← retrieval 结束
t=8s   StatusIndicator: "正在推理..."
t=15s  ReasoningPathPanel 出现（步骤1→2→3→4） ← reasoning 结束
t=16s  StatusIndicator: "正在裁决..."
t=22s  ConfidenceBreakdown + RiskDetailPanel 出现 ← verdict 结束
t=23s  消息气泡开始逐字出现: "根据分析..."     ← response LLM.stream()
t=35s  消息气泡完成，StructuredResponseRenderer 渲染
```

---

## 四、实施步骤

### Step 1: 创建事件总线 `stream-bus.ts` (P0)

- 定义 `StreamEvent` 联合类型（含 `rag_search`、`evidence_found`、`rag_result`、`token`、`structured_update`、`done`）
- 实现 `registerStreamBus` / `unregisterStreamBus` / `emitStreamEvent`
- 复用 `traceId` 作为 key

### Step 2: 改造 route.ts (P0)

- 注册事件总线，所有事件直接转发到 SSE
- 删除 3 字符假流式拆分逻辑
- 保留 `thinking` 事件作为降级兼容

### Step 3: 改造 response 节点 (P0) — Layer A 运行时流式

- `invoke()` → `stream()`
- 逐 token `emitStreamEvent("token", ...)`
- 流式结束后 `emitStreamEvent("structured_update", { displayContent })`
- `structuredResponse` 从 state 构建，不依赖 LLM JSON

### Step 4: 改造 retrieval 节点 (P1) — Layer A 运行时流式 + Layer B 节点结束

- 查询前 `emitStreamEvent("rag_search", ...)`
- 循环内逐条 `emitStreamEvent("evidence_found", ...)`
- 查询后 `emitStreamEvent("rag_result", ...)`
- 节点 return 前 `emitStreamEvent("structured_update", { evidenceChain })`

### Step 5: 改造 reasoning 节点 (P1) — Layer B 节点结束

- 节点 return 前 `emitStreamEvent("structured_update", { reasoningPath })`

### Step 6: 改造 verdict 节点 (P1) — Layer B 节点结束

- 节点 return 前 `emitStreamEvent("structured_update", { verdict })`

### Step 7: 改造 intention / interactionPointDetection 节点 (P1) — Layer B 节点结束

- intention return 前 `emitStreamEvent("structured_update", { intent })`
- interactionPointDetection return 前 `emitStreamEvent("structured_update", { interactionPoint })`

### Step 8: 改造 chat-panel.tsx (P2)

- 消费 `structured_update` 事件，渐进构建 `StructuredAgentResponse`
- 消费 `evidence_found` 事件，驱动 `StreamingEvidenceBar`
- 新增 `StreamingEvidenceBar` 组件

### Step 9: 验证 (P2)

- 发送消息，观察 SSE 事件流
- 确认逐 token 渐进到达
- 确认 `structured_update` 在每个节点结束后正确推送
- 确认 GUI 面板逐个出现（证据链 → 推理路径 → 置信度 → 回复文本）
- 确认 Matrix Rain 随内容量增长

---

## 五、兼容策略

- 保留现有 `thinking` 事件（一行摘要），作为不支持新事件类型的 GUI 降级方案
- 保留现有 `token` / `done` 事件格式不变
- `streamCharPool` → `MatrixRainBackground` 链路零改动
- 非流式 `/api/agent/chat` 路由不受影响