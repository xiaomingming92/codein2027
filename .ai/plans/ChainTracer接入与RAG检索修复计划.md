# 计划：ChainTracer 完整接入与 RAG 检索修复

## 问题诊断

### 问题 1：CHAIN\_TRACE\_SAVE 未触发

**根因**：`endChainTrace(traceId)` 返回 null，因为 `traceId` 不匹配。

在 `route.ts` 中：

```typescript
const tracer = startChainTrace(threadId, trigger)  // 生成新的 traceId（内部 randomUUID）
const traceId = randomUUID()                        // 又生成一个不同的 traceId
// ...
const chainTrace = endChainTrace(traceId)           // 用错误的 traceId 查找 → null
```

`startChainTrace` 内部创建 ChainTracer 时生成了 `tracer.getTraceId()`，但 route.ts 又自己生成了一个 `traceId` 传给 `conversationContext`。`endChainTrace` 用的是 route.ts 生成的 `traceId`，而 `activeTracers` Map 的 key 是 ChainTracer 内部生成的 `traceId`——**两个 ID 不一致**。

### 问题 2：RAG 检索结果始终为空

**根因链**（3 层嵌套）：

**层 1：sourceType 过滤条件过严**

```typescript
// searchKnowledgeDocuments 中
where: { sourceType: SOURCE_TYPE.KNOWLEDGE_UPDATE }  // 只查 KNOWLEDGE_UPDATE 类型
```

但用户通过知识库同步的文档（如"农机智能体PRD.md"）可能是 `PROJECT_DOC` 类型。如果文档的 sourceType 是 `PROJECT_DOC`，这个 where 条件会直接过滤掉所有结果。

**层 2：distances 语义反转**

ChromaDB 返回的 `distances` 是**距离**（越小越相似），但代码直接当作 `score` 使用：

```typescript
score: results.distances[0][i]  // distances 是距离，不是相似度
```

在 `retrieval.ts` 中，这个 `score` 被当作 `relevance` 使用：

```typescript
relevance: result.score || 0.5  // distances 越小 = 越相似，但这里当作越大越相似
```

**层 3：检索结果未反映在回复中**

即使 RAG 检索到了文档内容，`response.ts` 中的回复生成逻辑**不直接引用 evidenceChain 中的文档内容**。LLM 收到的 prompt 中只有 `verdictResult` 和 `pendingInteraction`，没有显式传入检索到的文档原文。用户问"查看农机智能体PRD.md"，LLM 可能根本没看到文档内容。

### 两个问题的关系

CHAIN\_TRACE\_SAVE 和 RAG 检索空结果是**两个独立问题**，但 ChainTracer 的完整接入可以帮助诊断 RAG 问题——如果 ChainTracer 正常工作，它记录的 `evidenceChainSnapshot.diff` 会显示检索节点是否添加了证据、添加了多少条，从而快速定位 RAG 是"没检索到"还是"检索到了但没展示"。

***

## 修复计划

### 修复 1：ChainTracer traceId 不匹配（route.ts）

**文件**：`src/app/api/agent/chat/route.ts`

**修改**：使用 `tracer.getTraceId()` 获取 ChainTracer 内部生成的 traceId，而非自己生成。

```typescript
// 修改前
const traceId = randomUUID()
const tracer = startChainTrace(threadId, { ... })

// 修改后
const tracer = startChainTrace(threadId, { ... })
const traceId = tracer.getTraceId()
```

### 修复 2：wrapNodeWithAudit inputSnapshot 为空（index.ts）

**文件**：`src/agents/index.ts`

**修改**：将空对象 `{}` 替换为有意义的状态快照。

```typescript
// 修改前
tracer.recordNode(nodeName, {}, result, startTime, Date.now())

// 修改后
const inputSnapshot = {
  intent: state.currentTask?.intent || state.explicitIntent,
  evidenceCount: state.evidenceChain?.length || 0,
  hasVerdict: !!state.verdictResult,
  hasInteractionPoint: !!state.pendingInteraction,
  query: state.currentTask?.query?.substring(0, 100) || null,
}
tracer.recordNode(nodeName, inputSnapshot, result, startTime, Date.now())
```

### 修复 3：路由决策记录到 tracer（conditional.ts）

**文件**：`src/agents/edges/conditional.ts`

**修改**：在每个路由函数中调用 `tracer.recordRouteDecision()`。

需要从 state 中获取 traceId，然后查找对应的 tracer。由于 `activeTracers` 在 `index.ts` 中是模块级变量，需要导出一个查找函数。

```typescript
// index.ts 新增导出
export function getActiveTracer(traceId: string): ChainTracer | undefined {
  return activeTracers.get(traceId)
}

// conditional.ts 修改
import { getActiveTracer } from "@/agents"

export function routeByIntent(state: typeof AgentState.State) {
  const intent = state.currentTask?.intent || state.explicitIntent
  const target = "retrieval"

  const traceId = state.conversationContext?.traceId as string
  if (traceId) {
    const tracer = getActiveTracer(traceId)
    tracer?.recordRouteDecision("intention", target, `intent=${intent}`, intent)
  }

  agentAuditRoute("intention", target, `intent=${intent} (所有意图都走RAG)`)
  return target
}
```

### 修复 4：retrieval 节点证据链 diff 记录（retrieval.ts）

**文件**：`src/agents/nodes/retrieval.ts`

**修改**：在检索前后记录证据链快照到 tracer。

```typescript
import { getActiveTracer } from "@/agents"

export async function retrievalNode(state: typeof AgentState.State) {
  const traceId = (state.conversationContext?.traceId as string) || ""

  // 检索前记录
  if (traceId) {
    const tracer = getActiveTracer(traceId)
    if (tracer) {
      tracer.setEvidenceBefore(
        (state.evidenceChain || []).map(e => ({ id: e.id, source: e.source }))
      )
    }
  }

  // ... 现有检索逻辑 ...

  // 检索后记录 diff
  if (traceId) {
    const tracer = getActiveTracer(traceId)
    if (tracer) {
      tracer.recordEvidenceDiff(
        evidenceChain.map(e => ({ id: e.id, source: e.source }))
      )
    }
  }

  return { evidenceChain, retrievalContext }
}
```

### 修复 5：RAG sourceType 过滤条件（retrieval.ts）

**文件**：`src/agents/nodes/retrieval.ts`

**修改**：移除 `where` 条件中的 sourceType 限制，或同时搜索两种类型。

```typescript
// 方案 A：移除 sourceType 过滤（搜索所有类型）
const knowledgeResults = await searchKnowledgeDocuments(currentTask.query, 5)

// 方案 B：搜索函数增加 sourceType 参数
// knowledge-indexer.ts 中：
export async function searchKnowledgeDocuments(
  query: string,
  k: number = 5,
  sourceType?: string  // 可选过滤
): Promise<...> {
  const where = sourceType ? { sourceType } : undefined
  const results = await client.query(collId, {
    query_texts: [query],
    n_results: k,
    where,  // undefined = 不过滤
    include: ["documents", "metadatas", "distances"],
  })
}

// retrieval.ts 中：不传 sourceType，搜索所有类型
const knowledgeResults = await searchKnowledgeDocuments(currentTask.query, 5)
```

选择**方案 B**，保持向后兼容。

### 修复 6：distances 语义修正（retrieval.ts）

**文件**：`src/agents/nodes/retrieval.ts`

**修改**：将 ChromaDB 的 distances（距离）转换为 relevance（相似度）。

```typescript
// 修改前
relevance: result.score || 0.5

// 修改后
relevance: result.score !== undefined ? Math.max(0, 1 - result.score) : 0.5
```

同时在 `knowledge-indexer.ts` 的 `searchKnowledgeDocuments` 中添加注释说明 distances 语义：

```typescript
// ChromaDB distances 是距离值（越小越相似），不是相似度分数
// 调用方需要用 1 - distance 转换为 relevance
score: results.distances[0][i],
```

### 修复 7：检索为 0 时的降级策略（retrieval.ts）

**文件**：`src/agents/nodes/retrieval.ts`

**修改**：当知识库检索结果为 0 时，添加警告证据并审计。当检索结果不为0时.分级展示策略 ：证据链展示引用片段，普通对话展示 RAG 概括 + 引用链条 + "查看原文"按钮，全量文件请求展示全量

```typescript
if (knowledgeResults.length === 0) {
  agentAuditRetrieval(currentTask.query, 0, evidenceChain.length, {
    warning: "知识库无相关文档",
    suggestion: "请先同步知识库或检查 sourceType 过滤条件",
  })
  evidenceChain.push({
    id: `e_empty_${randomUUID().substring(0, 8)}`,
    source: "knowledge_empty",
    type: "warning",
    content: "知识库中未找到相关文档，建议先同步知识库",
    reliability: 0.0,
    relevance: 0.0,
    timestamp: new Date().toISOString(),
    expandable: false,
  })
}
```

### 修复 8：response 节点引用检索到的文档内容（response.ts）

**文件**：`src/agents/nodes/response.ts`

**修改**：在回复生成的 prompt 中显式传入 evidenceChain 中的文档内容，让 LLM 能引用检索到的原文。

当前 `responsePrompt.build(input)` 的 `ResponseInput` 不包含 evidenceChain 的文档内容。需要扩展：

```typescript
// ResponseInput 类型扩展
interface ResponseInput {
  query: string
  intent: string
  verdictResult?: { ... }
  interactionPoint?: { ... }
  // 新增：检索到的文档内容
  retrievedDocuments?: Array<{
    source: string
    content: string
    relevance: number
  }>
}

// responseNode 中构建 input 时
const input: ResponseInput = {
  query: ...,
  intent: ...,
  verdictResult: ...,
  interactionPoint: ...,
  retrievedDocuments: (evidenceChain || [])
    .filter(e => e.source === "knowledge" && e.type === "document")
    .map(e => ({
      source: e.metadata?.name as string || e.source,
      content: e.content,
      relevance: e.relevance,
    })),
}
```

同时在 `responsePrompt` 模板中添加文档内容引用指令。

***

## 实施顺序（按 ADD 范式）

### Step 0：审计阶段定义

```typescript
type TracerRAGFixPhase =
  | "TRACER_TRACEID_FIX"          // 修复 traceId 不匹配
  | "TRacer_INPUT_SNAPSHOT_FIX"   // 修正 inputSnapshot 为空
  | "TRACER_ROUTE_DECISION"       // 接入路由决策记录
  | "TRACER_EVIDENCE_DIFF"        // 接入证据链 diff
  | "RAG_SOURCETYPE_FIX"          // 修复 sourceType 过滤
  | "RAG_DISTANCES_FIX"           // 修复 distances 语义
  | "RAG_EMPTY_DEGRADATION"       // 检索为 0 降级策略
  | "RAG_CONTENT_IN_RESPONSE"     // 回复引用文档内容
```

### Step 1：审计基础设施（已有）

- `agent-audit-logger.ts` 已存在
- `chat-persistence-logger.ts` 已存在
- 无需新建审计日志器

### Step 2：逐个修复 + 审计植入

按优先级排序：

1. **修复 1**：ChainTracer traceId 不匹配 → CHAIN\_TRACE\_SAVE 立即生效
2. **修复 2**：inputSnapshot 为空 → 审计数据有意义
3. **修复 5**：sourceType 过滤 → RAG 可能立即恢复
4. **修复 6**：distances 语义 → relevance 数值正确
5. **修复 7**：检索为 0 降级 → 有审计数据可诊断
6. **修复 8**：response 引用文档内容 → 用户能看到文档
7. **修复 3**：路由决策记录 → ChainTracer 完整
8. **修复 4**：证据链 diff → ChainTracer 完整

### Step 3-6：运行验证 + AI 合规检查

***

## 文件变更清单

| 文件                                  | 修改内容                                            | 优先级 |
| ----------------------------------- | ----------------------------------------------- | --- |
| `src/app/api/agent/chat/route.ts`   | 修复 traceId 不匹配                                  | P0  |
| `src/agents/index.ts`               | 修正 inputSnapshot + 导出 getActiveTracer           | P0  |
| `src/services/knowledge-indexer.ts` | searchKnowledgeDocuments 增加 sourceType 可选参数     | P1  |
| `src/agents/nodes/retrieval.ts`     | sourceType 修复 + distances 修正 + 空结果降级 + 证据链 diff | P1  |
| `src/agents/nodes/response.ts`      | 回复引用检索到的文档内容                                    | P1  |
| `src/agents/prompts/response.ts`    | prompt 模板添加文档引用指令                               | P1  |
| `src/agents/edges/conditional.ts`   | 路由决策记录到 tracer                                  | P2  |
| `src/agents/nodes/verdict.ts`       | 模型参数快照记录到 tracer                              | P2  |

***

## 验收标准

1. CHAIN\_TRACE\_SAVE 正常触发，chainTrace 写入数据库
2. ChainTracer 的 5 个 record 方法全部被正确调用
3. 用户输入"查看农机智能体PRD.md"时，RAG 能检索到文档内容
4. 回复中包含文档原文或摘要
5. distances 转换为正确的 relevance 值
6. 检索为 0 时有降级警告证据
7. TypeScript 编译通过

