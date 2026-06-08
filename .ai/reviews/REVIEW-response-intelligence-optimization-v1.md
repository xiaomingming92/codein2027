# REVIEW: 响应智能精简 Plan 评审意见

> 评审对象: `PLAN-response-intelligence-optimization-v1.md`
> 评审时间: 2026-05-19
> 总体结论: 方向正确，可执行。以下 4 个改进点为执行前微调建议。

---

## 改进点 1: L1 复杂度控制 — minimal 模式的证据策略应按意图区分

### 问题

Plan 中 minimal 模式仅保留 `conclusion + interaction` sections，`evidenceChain` 被完全过滤掉。但一刀切地去掉所有证据痕迹是有问题的——需要区分"不需要证据"的场景和"需要但不展开"的场景。

### 分析：先验知识 vs 非先验知识

minimal 模式的核心意图是 `chat`（聊天式轻交互），但 `chat` 之下存在两类性质完全不同的对话：

| 类别 | 典型场景 | 是否需要 RAG | 是否需要证据痕迹 |
|------|---------|-------------|-----------------|
| **先验 / 固定答案** | 问候（你好）、天气时间查询、未来固定计划查询、"你是谁"、系统能力说明 | 否，答案是固定的 | **不需要** — 展示了反而多余 |
| **非先验** | "项目A的当前进度"、"上周会议结论是什么"、"这个方案的优缺点" | 是，需要检索知识库 | **需要** — 结论必须有依据支撑 |

关键判断标准：**答案是否依赖知识库中的非固定内容**。如果答案是 LLM 自身知识就能全覆盖的，证据痕迹就是噪音；如果答案来自 RAG 检索结果，即便 minimal 模式也应该保留引用痕迹，否则用户无法区分"AI 随口说的"和"基于文档得出的"。

### 建议

不搞一刀切。在 `response-complexity.ts` 的 `getComplexityPolicy` 中新增一个字段 `showEvidenceDigest`：

```typescript
export interface ComplexityPolicy {
  mode: ResponseComplexityMode
  maxTokens: number
  includeEvidenceChain: boolean
  includeReasoningPath: boolean
  includeConfidence: boolean
  includeRisks: boolean
  requireStructuredOutput: boolean
  // 新增：是否展示精简证据摘要（一行式："基于 X 条证据"）
  showEvidenceDigest: boolean
}

// 意图映射中区分
const INTENT_TO_COMPLEXITY: Record<string, ComplexityPolicy> = {
  chat: {
    mode: "minimal", maxTokens: 256,
    includeEvidenceChain: false,
    showEvidenceDigest: false,  // 聊天不需要证据痕迹
    // ...
  },
  question: {
    mode: "concise", maxTokens: 512,
    includeEvidenceChain: false, // concise 也不展开证据
    showEvidenceDigest: true,    // 但问题类需要一行引用痕迹
    // ...
  },
  // analysis/planning/decision -> includeEvidenceChain: true, 完整展示
}
```

进一步细化——在 `buildDisplayFromState` 中按 `showEvidenceDigest` 追加证据摘要：

```typescript
if (complexity.showEvidenceDigest && !complexity.includeEvidenceChain) {
  // 不展开 evidence section，但追加一行精简引用
  sections.push({
    type: "evidence_digest",
    sourceCount: evidenceChain.evidences.length,
    topSourceName: evidenceChain.evidences[0]?.sourceName || null,
    confidence: evidenceChain.evidences[0]?.confidence || null,
  })
}
```

甚至在运行时根据 `evidenceChain` 的实际来源动态判断——如果所有证据的 source 都是 `"llm-prior"` 或 `"system-fixed"`（先验标记），则 `showEvidenceDigest` 自动降为 `false`，连一行都不显示。

**结论**：`chat` 意图里说"你好"不需要证据痕迹，但如果 `chat` 意图问了"项目进展"，说明意图分类可能不准（应该归为 `question`），或者说 `chat` 类回复如果是非先验的也应该有痕迹。最终的判断标准不是 `intent` 字符串，而是**证据链中是否存在非先验来源**。

---

## 改进点 2: L2 对话记忆 — 追问检测引入意图辅助

### 问题

当前追问检测算法纯依赖关键词重叠率和长度差异：

```
overlapRatio > 0.8 && lengthDiff < 0.2 → "重复提问"
overlapRatio > 0.4 && <= 0.8 → "追问/细化"
否则 → "新问题"
```

以下场景会漏判：
- "帮我分析项目A的风险" → "那项目B呢" — 关键词几乎不重叠，语义追问
- "这个方案可行吗" → "再详细说说" — 零关键词重叠，明显追问
- "下一步怎么做" → "还有呢" — 极短消息，必然是追问

### 建议

在 `detectFollowUp` 中增加一层意图辅助判断，不替换现有算法，而是在关键词重叠不足时作为兜底：

```typescript
export function detectFollowUp(
  currentMsg: string,
  historyMessages: Array<{ role: string; content: string }>,
  currentIntent?: string,
  lastIntent?: string,
): FollowUpResult {
  // 1. 先用原有关键词重叠算法
  const keywordResult = detectByKeywordOverlap(currentMsg, historyMessages)

  // 2. 意图辅助兜底（仅在关键词算法判定为"新问题"时启用）
  if (keywordResult.status === "new") {
    const lastUserMsg = getLastUserMessage(historyMessages)
    const isShortMsg = currentMsg.length < 20
    const intentMatch = currentIntent && lastIntent && currentIntent === lastIntent

    if (isShortMsg && intentMatch) {
      return { status: "follow_up", reason: "短消息+意图一致", confidence: 0.7 }
    }

    if (isShortMsg) {
      return { status: "follow_up", reason: "短消息疑似追问", confidence: 0.5 }
    }
  }

  return keywordResult
}
```

意图信息在 `currentTask.intent` 和 `memory.lastIntent` 中已经存在，不额外增加计算成本。

---

## 改进点 3: L3 语义缓存 — KB 同步清缓存触发机制需明确

### 问题

Plan 定义了 `CACHE_EVICT_KB_SYNC` 阶段，`SemanticCache.clear()` 方法也已定义，但触发链不明确：

- 谁调用 `clear()`？
- 在什么时机调用？
- 是全量清空还是按 topic 部分失效？

### 行业方案对比

语义缓存在知识库变更时的失效策略，业界主要有以下几种：

| 方案 | 原理 | 失效精度 | 实现复杂度 | 存储开销 | 代表 |
|------|------|---------|-----------|---------|------|
| **Generation-based** | 全局 KB 版本号，缓存条目存 `kbGeneration`，查时对比，不匹配 = stale | 全局（一锅端） | ⭐ 极低 | 每个条目 +1 int | Memcached CAS、浏览器 Service Worker |
| **Hash-based（内容寻址）** | 将所用文档的内容 hash 打入缓存键，文档变了 hash 变，旧条目自然不命中 | 文档级（精准） | ⭐⭐ 低 | 无额外存储（hash 在 key 里） | Git object store、Nix store、Docker layer cache |
| **Document-Level 引用追踪** | 缓存条目存 `referencedDocIds[]`，文档变更后扫描全量条目，逐个比对删除匹配项 | 文档级（精准） | ⭐⭐⭐ 中 | 每个条目 +1 数组 | Elasticsearch percolator、LlamaIndex IngestionCache |
| **全量清空（clear）** | 什么都不管直接清 | 全局 | ⭐ 极低 | 无 | 简单场景 |

### 建议：Generation + Hash 双重保障

全量清空在 500 条规模下确实代价不高，但语义上粗放——文档 B 更新了，为什么把文档 A 相关的合法缓存也删了？这不优雅。

推荐 **Generation-based 主策略 + Hash-based 兜底**，零扫描成本、精准到文档级：

#### 核心设计

```typescript
// src/services/semantic-cache.ts

// 全局知识库 generation，每次索引完成后自增
let kbGeneration = 0

export function bumpKbGeneration(): number {
  kbGeneration++
  return kbGeneration
}

export function getKbGeneration(): number {
  return kbGeneration
}

// CacheEntry 新增字段
interface CacheEntry {
  responseContent: string
  displayContent: DisplayContent
  createdAt: Date
  ttl: number
  hitCount: number
  sourceTraceId: string
  // 新增：创建时的 KB generation
  kbGeneration: number
}

// 查询时对比 generation
get(key: CacheKey): CacheEntry | null {
  const entry = this.store.get(key.compositeKey)
  if (!entry) return null

  // TTL 过期
  if (Date.now() - entry.createdAt.getTime() > entry.ttl * 1000) {
    this.store.delete(key.compositeKey)
    this.recordEviction("TTL", key.compositeKey, entry)
    return null
  }

  // Generation 过期：文档被更新过，此缓存条目引用的证据可能已过时
  if (entry.kbGeneration < kbGeneration) {
    this.store.delete(key.compositeKey)
    this.recordEviction("KB_GENERATION_STALE", key.compositeKey, entry, {
      entryGeneration: entry.kbGeneration,
      currentGeneration: kbGeneration,
    })
    return null
  }

  entry.hitCount++
  return entry
}
```

#### 触发链

```
知识库文档变更（create/update/delete）
  → KnowledgeIndexer 索引完成后
  → 调用 bumpKbGeneration() （全局版本号 +1）
  → 记录 CACHE_GENERATION_BUMPED 审计
  → 无需扫描任何缓存条目
  → 下次查询时自动感知 stale，惰性淘汰
```

实现上，在 `knowledge-indexer.ts` 中仅一行：

```typescript
// src/services/knowledge-indexer.ts
await this.completeIndexing(documentId)
// 通知缓存：KB 版本号递增，已有条目在下次 get 时惰性失效
bumpKbGeneration()
respIntelAudit("CACHE_GENERATION_BUMPED", "知识库变更触发 generation 递增", {
  newGeneration: getKbGeneration(),
  trigger: "knowledge_index_complete",
  documentId,
})
```

#### 进一步：Hash-based 精准化（可在 generation 稳定后追加）

如果未来需要更细粒度——只失效"真正引用了变更文档"的缓存条目，可以在 CacheKey 中嵌入所用文档的内容 hash：

```typescript
function buildCacheKey(
  query: string,
  intent: string,
  projectId?: string,
  threadId?: string,
  evidenceChain?: Evidence[],
): CacheKey {
  // 对 evidenceChain 中每条证据的 sourceName + content snippet 做 hash
  const evidenceHash = hashEvidenceChain(evidenceChain)
  // evidenceHash 变了 → compositeKey 变了 → 旧条目永不命中，无需主动删除
  const compositeKey = `${hashQuery(query)}:${intent}:${projectId || ""}:${evidenceHash}`

  return { queryHash, intentHash, contextHash, compositeKey }
}
```

此时即使不递增 generation，文档变更后新查询生成的新 hash 天然不会命中旧条目。旧条目靠 LRU/TTL 自然淘汰。

### 推荐方案总结

```
当前阶段（500 条上限）:
  Generation-based 主策略
  → 极简：一行 bumpKbGeneration()，零扫描
  → 精确度：全局级（可以接受）

后续精细化:
  + Hash-based 精准化
  → evidenceHash 打入 cacheKey
  → 精确度：文档级
  → 旧条目靠 LRU/TTL 自然淘汰，无需主动删除
```

这两种方案都不需要全量清空，不需要扫描 Map，O(1) 操作，也无需引入外部依赖。

---

## 改进点 4: L3 语义缓存 — 模拟流式延迟需自适应

### 问题

Plan 中缓存命中后的模拟流式输出使用固定 10ms 间隔：

```typescript
const tokens = splitIntoTokens(cacheEntry.responseContent, 3)
for (const token of tokens) {
  controller.enqueue(...)
  await sleep(10)  // 固定延迟
}
```

comprehensive 模式回复可能达到 2048 tokens，拆成 3 字/token = 682 个事件 × 10ms = **6.8 秒**，比实际 LLM 流式还慢。

### 建议

使用自适应延迟，让总时长始终卡在 1~2 秒内：

```typescript
function streamCachedResponse(
  content: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<void> {
  const chunkSize = 3
  const tokens = splitIntoTokens(content, chunkSize)
  const totalTokens = tokens.length

  // 自适应延迟：目标总时长 1.5 秒，最少 5ms/片
  const targetTotalMs = 1500
  const delayPerToken = Math.max(5, Math.floor(targetTotalMs / totalTokens))

  for (let i = 0; i < tokens.length; i++) {
    controller.enqueue(
      encoder.encode(JSON.stringify({ type: "token", content: tokens[i] }) + "\n")
    )
    if (i < tokens.length - 1) {
      await sleep(delayPerToken)
    }
  }
}
```

同时，缓存命中时可以追加一个 SSE 事件标记来源：

```typescript
controller.enqueue(encoder.encode(JSON.stringify({
  type: "cache_hit",
  sourceTraceId: cacheEntry.sourceTraceId,
  cachedAt: cacheEntry.createdAt,
}) + "\n"))
```

前端收到此事件后可以在 UI 上显示"⚡ 缓存响应"的小标记，让用户感知到响应加速了。

---

## 总结

| 编号 | 改进点 | 严重程度 | 是否需要改 Plan | 实现复杂度 |
|------|--------|----------|----------------|-----------|
| 1 | minimal 模式证据痕迹 | 中 | 否（Plan 执行时实现即可） | 低 |
| 2 | 追问检测意图辅助 | 中 | 否 | 低 |
| 3 | KB 同步清缓存触发链 | 高 | 否（补充说明） | 低 |
| 4 | 模拟流式自适应延迟 | 中 | 否 | 低 |

四个改进点均不改变 Plan 的整体架构和文件清单，在执行阶段自然融入即可。