# 执行计划：farm-agent（7+1 轮原子事务拓扑）

> **当前有效。** 本文档定义 farm-agent 改进计划的 7+1 轮原子事务拓扑；执行入口为 [co-agent-conversation-handoff.md](./co-agent-conversation-handoff.md)。前 7 轮拆分以业务原子闭包为主，以对话上下文容量为辅，确保每轮都能独立提交、验证、审计和恢复；第 8 轮是前 7 轮收敛后的架构合流轮，用于统一 Global State Model、Cognitive Event Bus 与 Policy Update Loop。

## 元信息

- **父 Plan**: [co-agent-simplified-v1.md](./co-agent-simplified-v1.md)
- **目标仓库**: `/home/xmm/ai/farm-agent`
- **创建时间**: 2026-05-23
- **设计依据**: 避免单次对话上下文过载导致代码质量下降，将原 8 个 Step 拆分为前 7 轮局部闭包；将 Global State Model / Cognitive Event Bus / Policy Loop 作为第 8 轮后续架构合流闭包
- **总文件数**: 前 7 轮约 27 个独立文件（部分文件在多轮中递进修改）；第 8 轮文件数待独立 spec 确认
- **总操作数**: 前 7 轮 10 新建 + 26 修改；第 8 轮独立统计

---

## 拆分原则

1. **每轮 3-8 个文件**，保证单次对话上下文内可以高质量完成
2. **每轮有独立可验证的交付物**，不依赖"后面再补"
3. **依赖链清晰**——每轮只依赖前序已完成的轮次
4. **高内聚**——同一轮内的文件修改服务于同一个架构目标

---

## 依赖拓扑

```
第1轮 (基础层)
  Step 1+2
     │                   第3轮 (领域基础设施)
     │                     Step 4.2-4.4
     │                        │
     └──────┬─────────────────┘
            ▼
      第2轮 (裁决层)
        Step 3
            │
            ▼
      第4轮 (领域集成)
        Step 4.5-4.8
            │
            ├──────────────────┐
            ▼                  ▼
      第5轮 (语义缓存)     第6轮 (演化闭环)
        Step 5              Step 7
            │                  │
            └────┬─────────────┘
                 ▼
           第7轮 (审计管线)
             Step 8
                 │
                 ▼
           第8轮 (架构合流)
             Global State Model + Cognitive Event Bus + Policy Loop
```

---

## 第1轮：基础层 — 类型收敛 + thinkingLevel 路由

### 上下文

| 属性 | 内容 |
|------|------|
| 覆盖 Step | Step 1 + Step 2 |
| 文件数 | 8 个（全部修改，无新建） |
| 依赖 | 无 |
| 独立验证 | `npx tsc --noEmit` 零类型错误 + fast/deep 分流可观测 |
| 优先级 | P0——所有后续步骤的基础 |

### 文件清单

| # | 文件路径 | 操作 | 改动要点 |
|---|---------|------|---------|
| 1 | `src/types/evidence.ts` | 修改 | Evidence 新增 `chunkId`/`expandable`/`detailUrl`/`score`；新建 `EvidenceRef` + `EvidenceSummary` 接口 |
| 2 | `src/agents/state.ts` | 修改 | 删除 L33-L45 内联 Evidence 定义，改为 `import { Evidence } from "@/types/evidence"`；`CurrentTask` 新增 `thinkingLevel?: "fast" \| "deep"` |
| 3 | `src/agents/prompts/types.ts` | 修改 | 所有内联 evidence 类型替换为 `EvidenceRef[]`；`CurrentTask` 类型新增 `thinkingLevel` |
| 4 | `src/agents/nodes/intention.ts` | 修改 | intention 输出时设置 `currentTask.thinkingLevel`：chat → `"fast"`，其余 → `"deep"` |
| 5 | `src/agents/edges/conditional.ts` | 修改 | `routeByIntent` 按 thinkingLevel 分流：fast → `"response"`，deep → `"retrieval"` |
| 6 | `src/agents/nodes/retrieval.ts` | 修改 | 产出证据时填充 `chunkId` |
| 7 | `src/agents/nodes/interaction-point-detection.ts` | 修改 | evidence 引用替换为新的统一类型 |
| 8 | `src/agents/prompts/interaction-point-detection.ts` | 修改 | evidence 引用替换为新的统一类型 |

### 验证清单

| # | 验证项 | 方法 | 通过标准 |
|---|--------|------|---------|
| 1 | 零类型错误 | `npx tsc --noEmit` | 无类型错误，无 warning |
| 2 | Evidence 无重复定义 | `grep "interface Evidence" src/ -r` | 仅在 `src/types/evidence.ts` 中出现一次 |
| 3 | EvidenceRef 可用 | `npx tsc --noEmit` | 所有使用 EvidenceRef 的文件编译通过 |
| 4 | fast 通道 | 发送"你好" | SSE 事件序列：intention → response（无 retrieval/reasoning/verdict） |
| 5 | deep 通道 | 发送"水稻育秧步骤" | SSE 事件序列：intention → retrieval → reasoning → verdict → response |
| 6 | fast 回复长度 | 分析回复内容 | fast 回复 < 100 tokens |

### 路由代码模板

```typescript
// src/agents/edges/conditional.ts — routeByIntent 改造后：
export function routeByIntent(state: typeof AgentState.State) {
  const thinkingLevel = state.currentTask?.thinkingLevel || "deep"

  if (thinkingLevel === "fast") {
    agentAuditRoute("intention", "response", "fast通道: chat意图直通response")
    return "response"
  }

  agentAuditRoute("intention", "retrieval", "deep通道: 走完整6节点管线")
  return "retrieval"
}
```

---

## 第2轮：裁决层 — ResponseStrategy 集中管理

### 上下文

| 属性 | 内容 |
|------|------|
| 覆盖 Step | Step 3 |
| 文件数 | 3 个（1 新建 + 2 修改） |
| 依赖 | 第1轮（需要 thinkingLevel 类型 + EvidenceRef） |
| 独立验证 | 每种意图产出的 sections/promptHint/maxTokens 符合预期 |
| 设计密度 | ⭐⭐⭐⭐⭐——自声明策略描述符 + 修饰器管道是架构核心 |

### 文件清单

| # | 文件路径 | 操作 | 改动要点 |
|---|---------|------|---------|
| 1 | `src/agents/response-strategy.ts` | **新建** | `StrategyDescriptor` 自声明对象 + `StrategyContext` 裁决上下文 + `registry` 注册表（8 个 descriptor + catch-all 兜底）+ `register()` + `resolveResponseStrategy(ctx)` 遍历裁决 |
| 2 | `src/agents/nodes/response.ts` | 修改 | 构建 `StrategyContext` → 调用 `resolveResponseStrategy(ctx)` 替代硬编码三段分支；`buildStreamingTextPrompt` 追加 `promptHint`；`buildDisplayFromState` 按 strategy.sections 过滤 |
| 3 | `src/agents/types.ts` | 修改 | `DisplayContent["sections"]` 联合类型新增 `"evidence_digest"` \| `"action_steps"` \| `"timeline"` |

### 核心设计

```typescript
// 策略描述符模式（类比 Linux VFS/poll）：
//   每个 descriptor 的 matches 是自包含纯函数
//   不再需要 INTENT_FALLBACK 字符串映射 — 回退由低优先级 catch-all 承担

export interface StrategyDescriptor {
  id: string                          // "fast:chat" / "deep:analysis" / ...
  matches: (ctx: StrategyContext) => boolean  // 自声明匹配规则
  priority: number                    // 10=通用兜底, 20=意图精确匹配
  apply: ResponseStrategy             // 匹配成功后产出的策略
}

// 裁决层：遍历注册表 → filter(matches) → sort(priority) → pick first
export function resolveResponseStrategy(ctx: StrategyContext): ResponseStrategy
```

### 验证清单

| # | 验证项 | 方法 | 通过标准 |
|---|--------|------|---------|
| 1 | fast 策略 | 发送"你好" | system prompt 含"1-2句话"约束，sections 仅含 conclusion |
| 2 | analysis 策略 | 发送"邗江区种水稻分析" | sections 含 conclusion + evidence + reasoning + confidence + risks |
| 3 | planning 策略 | 发送"制定下月种植计划" | sections 含 conclusion + action_steps + timeline + risks，不含 evidence_digest |
| 4 | decision 策略 | 发送选择类问题 | sections 含 conclusion + evidence + reasoning + confidence + risks；promptHint 含"先给最终决策结论" |
| 5 | question 策略 | 发送"水稻育秧步骤" | sections 含 conclusion + evidence_digest + evidence，不含 reasoning |
| 6 | creation 策略 | 发送创建类请求 | sections 含 conclusion + evidence_digest |
| 7 | catch-all 回退 | 发送 conversation 子类型 | 回退到 `deep:fallback`（priority=1） |
| 8 | evidence_digest 降级 | planning 意图 / 无实际证据时 | 不展示 evidence_digest |
| 9 | 类型扩展 | 编译检查 | `DisplayContent.sections` 联合类型含 `evidence_digest` / `action_steps` / `timeline` |

---

## 第3轮：领域基础设施 — 分析专家注册表 + AnalysisContext

### 上下文

| 属性 | 内容 |
|------|------|
| 覆盖 Step | Step 4.2 + 4.3 + 4.4（注册表 + 上下文 CRUD + 记忆机制） |
| 文件数 | 4 个（2 新建 + 2 修改） |
| 依赖 | 第1轮（需要 state.ts 类型；不依赖第2轮裁决层） |
| 独立验证 | ANALYSIS_EXPERTS 注册表可读取 + AnalysisContext 读写 ChatThread.metadata 成功 |
| 关键决策 | 确认 `AnalysisContext` 存入 `ChatThread.metadata` Json 字段（不改 Prisma Schema） |

### 文件清单

| # | 文件路径 | 操作 | 改动要点 |
|---|---------|------|---------|
| 1 | `src/agents/experts/registry.ts` | **新建** | `AnalysisExpert` 接口 + `ANALYSIS_EXPERTS` 注册表（含 `reportFormats` 字段），初始 3 个专家：crop_compare / roi_analysis / pest_risk |
| 2 | `src/services/analysis-context.ts` | **新建** | `AnalysisContext` + `AnalysisTurnRecord` 类型 + `getAnalysisContext()` / `saveAnalysisContext()` / `activateExpert()` / `deactivateExpert()` / `updateRuntimeInput()` / `appendTurnRecord()` |
| 3 | `src/agents/state.ts` | 修改 | AgentState 新增 `analysisContext: Annotation<AnalysisContext \| null>()` |
| 4 | `src/app/api/agent/chat/stream/route.ts` | 修改 | 请求开始时加载 `getAnalysisContext(threadId)` → 注入 state；请求结束后调用 `saveAnalysisContext(threadId, ctx)` |

### AnalysisExpert 接口模板

```typescript
export interface AnalysisExpert {
  id: string                    // "crop_compare"
  label: string                 // "作物对比分析"
  domain: string                // "种植" | "经济" | "管收"
  description: string
  inputSchema: Array<{ key: string; label: string; required: boolean }>
  outputSections: Array<"conclusion" | "confidence" | "risks" | "evidence" | "reasoning">
  promptTemplate: string        // 推理维度指令片段
  evidenceFilter?: Record<string, unknown>  // RAG 检索过滤条件
  reportFormats: ReportFormat[] // ["md", "pdf", "docx"]
}

export const ANALYSIS_EXPERTS: Record<string, AnalysisExpert> = {
  crop_compare: { /* ... */ },
  roi_analysis: { /* ... */ },
  pest_risk:    { /* ... */ },
}
```

### AnalysisContext 跨轮记忆数据流

```
第1轮: 用户选择 "作物对比" + "ROI测算"
       → activeExperts = ["crop_compare", "roi_analysis"]
       → 存入 ChatThread.metadata.analysisContext

第2轮: 用户追问 "那加上大豆呢？"
       → 加载 analysisContext → activeExperts 仍在
       → 两个专家都参与推理
       → runtimeInputs 更新: crops 追加 "大豆"

第3轮: 用户新增选择 "病虫害风险"
       → activeExperts 追加 "pest_risk"
       → 三个专家同时推理
       → 持久化回 DB
```

### 验证清单

| # | 验证项 | 方法 | 通过标准 |
|---|--------|------|---------|
| 1 | 注册表完整性 | `ANALYSIS_EXPERTS` 含 3 个专家 | 每个专家有四属性（inputSchema/outputSections/promptTemplate/evidenceFilter） |
| 2 | 上下文读 | `getAnalysisContext(threadId)` → 新建 thread 首次调用 | 返回 `null` 或默认空上下文 |
| 3 | 上下文写 | `saveAnalysisContext(threadId, ctx)` → 读 DB 验证 | `ChatThread.metadata.analysisContext` 含写入数据 |
| 4 | 专家激活 | `activateExpert(ctx, "crop_compare")` | `activeExperts` 新增 crop_compare 条目 |
| 5 | 专家去重 | 重复激活同一 expertId | `activeExperts` 中仅出现一次 |
| 6 | 跨轮记忆 | 第1轮激活2个专家 → 第2轮加载 | `activeExperts` 保持 2 个 |

---

## 第4轮：领域集成 — 管线消费 + 报告服务

### 上下文

| 属性 | 内容 |
|------|------|
| 覆盖 Step | Step 4.5 + 4.6 + 4.8（管线消费 + 报告生成 + 下载 API） |
| 文件数 | 6 个（2 新建 + 4 修改） |
| 依赖 | 第2轮（ResponseStrategy）+ 第3轮（AnalysisContext + ANALYSIS_EXPERTS） |
| 独立验证 | 激活专家后 RAG 按 evidenceFilter 过滤 + reasoning prompt 含专家 promptTemplate + 报告下载正常 |

### 文件清单

| # | 文件路径 | 操作 | 改动要点 |
|---|---------|------|---------|
| 1 | `src/agents/nodes/retrieval.ts` | 修改 | 收集所有 activeExperts 的 evidenceFilter，合并为 ChromaDB 检索条件 |
| 2 | `src/agents/nodes/reasoning.ts` | 修改 | 从 ANALYSIS_EXPERTS 取各激活专家的 promptTemplate + 注入 runtimeInputs |
| 3 | `src/agents/nodes/response.ts` | 修改 | 合并所有 activeExperts 的 outputSections → 传给 ResponseStrategy |
| 4 | `src/services/report-generator.ts` | **新建** | `generateReport()` + 4 格式生成器（MD/PDF/DOCX/XLSX）+ `inferDefaultFormat()` + `learnFormatPreference` 钩子 |
| 5 | `src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts` | **新建** | 多格式报告下载 API（路由层） |
| 6 | `package.json` | 修改 | 新增依赖：`docx`、`exceljs`、`pdfmake` |

### 管线消费逻辑

```
retrieval 节点：
  无 activeExperts → 走默认检索逻辑（不变）
  有 activeExperts → 合并各专家的 evidenceFilter
    例：crop_compare.filter ∪ roi_analysis.filter
    → { source: { $in: ["种植技术", "市场行情", "经济数据"] } }

reasoning 节点：
  无 activeExperts → 走默认推理 prompt（不变）
  有 activeExperts → 追加 [分析上下文] 块
    每个激活专家输出一个独立维度块：
    === 作物对比分析 ===
    promptTemplate
    已知参数：{从 runtimeInputs 注入}

response 节点：
  无 activeExperts → 由 ResponseStrategy 决定（不变）
  有 activeExperts → 合并所有 outputSections 并集去重
    传给 ResponseStrategy 的修饰器管道
```

### 报告 API 设计

```
GET /api/agent/chat/threads/{threadId}/messages/{messageId}/report
  ?format=md|pdf|docx|xlsx

不指定 format 时 → 根据 activeExperts 推断默认格式：
  - 只有 roi_analysis 激活 → 默认 xlsx
  - 只有 crop_compare / pest_risk 激活 → 默认 md
  - 多种类专家混合激活 → 默认 pdf

Content-Type 响应头：
  md   → text/markdown; charset=utf-8
  pdf  → application/pdf
  docx → application/vnd.openxmlformats-officedocument.wordprocessingml.document
  xlsx → application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
```

### 验证清单

| # | 验证项 | 方法 | 通过标准 |
|---|--------|------|---------|
| 1 | RAG 按专家过滤 | activeExperts 含 roi_analysis | retrieval 仅检索"市场行情"+"经济数据"来源文档 |
| 2 | 推理按专家维度 | activeExperts 含 crop_compare + roi_analysis | reasoning prompt 含两专家独立分析维度块 |
| 3 | 输出按专家合并 | activeExperts 有多个 | DisplayContent.sections 含各专家对应的 type |
| 4 | MD 下载 | GET /report?format=md | 返回 Markdown，含结论 + 各 section |
| 5 | XLSX 下载 | GET /report?format=xlsx | 返回 Excel，含 3 个 Sheet |
| 6 | DOCX 下载 | GET /report?format=docx | 返回 Word 文档 |
| 7 | PDF 下载 | GET /report?format=pdf | 返回 PDF |
| 8 | 默认格式推导 | 仅 roi_analysis 激活，不指定 format | 默认返回 xlsx |
| 9 | 混合专家回退 | 多类专家混合激活，不指定 format | 默认返回 pdf |

---

## 第5轮：语义缓存

### 上下文

| 属性 | 内容 |
|------|------|
| 覆盖 Step | Step 5（仅基础机制：LRU + TTL + Generation 淘汰，TTL 学习留给第6轮） |
| 文件数 | 3 个（1 新建 + 2 修改） |
| 依赖 | 第4轮（需要 stream/route.ts 中已有 analysisContext 注入点） |
| 独立验证 | 缓存命中/过期/淘汰均正常 |

### 文件清单

| # | 文件路径 | 操作 | 改动要点 |
|---|---------|------|---------|
| 1 | `src/services/semantic-cache.ts` | **新建** | `SimpleSemanticCache` 类 + `CacheKey` + `CacheEntry` + `buildCacheKey()` + `bumpKbGeneration()` + `getKbGeneration()` |
| 2 | `src/app/api/agent/chat/stream/route.ts` | 修改 | 缓存键构建 → 缓存查询 → 命中时模拟流式输出 → 管线执行后缓存写入 |
| 3 | `src/services/knowledge-indexer.ts` | 修改 | 索引完成后调用 `bumpKbGeneration()` |

### 缓存架构

```
缓存键三元组:
  compositeKey = queryHash(16) + ":" + intentHash(8) + ":" + contextHash(8)

淘汰策略（三层）:
  1. Generation-based: kbGeneration 不匹配 → 惰性淘汰（知识库变更时触发）
  2. TTL-based: 超过 CACHE_TTL[intent] 秒 → 过期淘汰
  3. LRU: 超出 MAX_CACHE_SIZE(200) → 删除最旧条目

缓存命中时模拟流式输出:
  - 推送 cache_hit 事件（含 sourceTraceId + cachedAt）
  - 按 chunkSize=3 分片推送 token 事件
  - 目标总耗时 ≈ 1.5s（自适应延迟）
  - 最后推送 structured_output 事件（与正常流程一致）
```

### 验证清单

| # | 验证项 | 方法 | 通过标准 |
|---|--------|------|---------|
| 1 | 缓存命中 | 同一问题发送两次 | 第一次走完整管线，第二次 SSE 首事件为 `cache_hit` |
| 2 | TTL 过期 | 等待超过 TTL 后重发 | 重新走完整管线 |
| 3 | Generation 过期 | 上传新文档后发送相同问题 | kbGeneration 不匹配 → 走完整管线 |
| 4 | 模拟流式 | 缓存命中时观察 SSE | token 事件分片推送，总耗时 0.5-1.5s |
| 5 | LRU 淘汰 | 填充超过 200 条缓存 | 最旧条目被逐出 |
| 6 | 缓存不阻塞 | 管线执行 + 缓存写入并发 | 缓存写入失败不影响响应返回 |

---

## 第6轮：策略演化闭环

### 上下文

| 属性 | 内容 |
|------|------|
| 覆盖 Step | Step 7 |
| 文件数 | 5 个（2 新建 + 3 修改） |
| 依赖 | 第4轮（AnalysisContext.turnHistory）+ 第5轮（缓存基础设施） |
| 独立验证 | turnHistory 累积正确 + TTL 自主学习有 AuditLog 记录 |

### 文件清单

| # | 文件路径 | 操作 | 改动要点 |
|---|---------|------|---------|
| 1 | `src/services/path-metrics.ts` | **新建** | `MetricDescriptor` 注册表（4 检测器）+ `assessExecutionQuality()` 复合裁决 + `buildMetricBaselines()` 全局基准 |
| 2 | `src/services/cache-ttl-stats.ts` | **新建** | `TtlStats` 读写 + `adaptCacheTtl()` |
| 3 | `src/agents/response-strategy.ts` | 修改 | `resolveResponseStrategy` 中调用 `assessExecutionQuality()` |
| 4 | `src/services/analysis-context.ts` | 修改 | 实现 `appendTurnRecord()` 采集逻辑 |
| 5 | `src/app/api/agent/chat/stream/route.ts` | 修改 | 每轮结束采集 `turnHistory` |

### 三条演化回路

```
回路一：语义缓存 TTL 自主学习
  → 缓存过期 → LLM 重新运行 → 与旧 verdictConfidence 对比
  → 相同（±5%）→ TTL 上调（浪费了一次调用，说明 TTL 太短）
  → 不同 → TTL 不变/下调
  → 学习数据：logs/cache-ttl-stats.json

回路二：下载格式偏好学习
  → learnFormatPreference() 在 report-generator.ts 中
  → 同一场景 ≥5 条下载记录 + 最高频格式 >60%
  → 偏好 > inferDefaultFormat 规则

回路三：多维度执行度 — 裁决层自检
  4 个 MetricDescriptor 检测器：
  ┌─────────────┬─────────────┬──────────┬─────────────────────┐
  │ 维度         │ 算法         │ 样本门槛  │ 修正方向             │
  ├─────────────┼─────────────┼──────────┼─────────────────────┤
  │ 置信度轨迹   │ 线性回归 β   │ ≥5 轮    │ β<-3 → augment_prompt│
  │ 证据覆盖率   │ 3轮递减+低均值│ ≥3 轮   │ relax_evidence_filter│
  │ 追问率       │ followUp>0占比│ ≥5 轮   │ ≥40% → activate_expert│
  │ 置信度波动率 │ 标准差 σ     │ ≥5 轮   │ σ>15% → augment_prompt│
  └─────────────┴─────────────┴──────────┴─────────────────────┘

  复合裁决：逐维度检测 → severity×priority 加权评分 → 单一 StrategyAdjustment
```

### 验证清单

| # | 验证项 | 方法 | 通过标准 |
|---|--------|------|---------|
| 1 | turnHistory 采集 | 每轮管线结束后 dump analysisContext | turnHistory 长度 = 总轮数 |
| 2 | TTL 自主学习 | 同场景 3 次过期后结论相同 | TTL 上调 20% |
| 3 | TTL 不误调 | 同场景 3 次过期后结论不同 | TTL 不变或下调 |
| 4 | 下载格式偏好 | 同场景 PDF 占 8/10 | inferDefaultFormat 返回 PDF 而非规则默认 MD |
| 5 | 置信度轨迹检测 | 连续 5 轮置信度下降（78→65→58→50→42） | β < -3 → promptHint 追加"信息缺口" |
| 6 | 证据覆盖检测 | 连续 3 轮证据量递减 + 低于全局均值×0.5 | 触发 relax_evidence_filter |
| 7 | 追问率检测 | 5 轮中 2 轮有追问（40%） | 建议 activate_expert（pest_risk） |
| 8 | 演化可回滚 | 删除 `ChatThread.metadata.turnHistory` | 系统回退到初始常量 |

---

## 第7轮：三层审计管线

### 上下文

| 属性 | 内容 |
|------|------|
| 覆盖 Step | Step 8 |
| 文件数 | 7 个（2 新建 + 5 修改） |
| 依赖 | 第6轮（需要 path-metrics + cache-ttl-stats 中的审计调用点） |
| 独立验证 | 生产环境 AuditLog 表有记录 + dev 环境 debug trace 文件正常 |

### 三层职责边界

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 1 开发审计（仅 dev）                                     │
│   debug-tracer.ts → logs/debug/{threadId}/ + Debug API       │
│   每节点 input/output/裁决 → 10-50KB/trace                    │
├──────────────────────────────────────────────────────────────┤
│ Layer 2 运行时审计（始终开启）                                  │
│   agent-audit-logger.ts → AuditLog DB 表                      │
│   高层事件: CHAT_REQUEST/RESPONSE/ERROR/STRATEGY_MATCHED       │
│            EXECUTION_QUALITY/CACHE_HIT/MISS/SET/EVICT          │
├──────────────────────────────────────────────────────────────┤
│ Layer 3 控制台                                                │
│   console.log → 所有 audit 函数都走                            │
│   开关: LOG_LEVEL                                              │
└──────────────────────────────────────────────────────────────┘
```

### 文件清单

| # | 文件路径 | 操作 | 层次 | 改动要点 |
|---|---------|------|------|---------|
| 1 | `src/lib/agent-audit-logger.ts` | **修改（升级）** | L1+L2+L3 | 新增 `import { prisma }` + `setAuditContext/clearAuditContext` + `writeAuditLog()`；`agentAuditRequest/Response/Error` 新增 DB 通道；新增 `agentAuditStrategy/ExecutionQuality/CacheOperation` 三个 L2 专用函数 |
| 2 | `src/services/debug-tracer.ts` | **新建** | L1 | `DebugTrace` 类型 + `captureNode()` + `captureSummary()` + `exportFineTuningData()`（`NODE_ENV=development` 时激活） |
| 3 | `src/app/api/agent/chat/threads/[threadId]/debug/route.ts` | **新建** | L1 | Debug 面板 API + 微调数据导出（`format=json|fine-tuning`，仅 dev 启用） |
| 4 | `src/app/api/agent/chat/stream/route.ts` | 修改 | L1+L2 | 调用 `setAuditContext(userId, traceId)` 注入 L2 上下文；每个节点完成事件调用 `captureNode()`（L1）；管线完成后调用 `captureSummary()`（L1） |
| 5 | `src/agents/nodes/response.ts` | 修改 | L2 | `resolveResponseStrategy()` 后调用 `agentAuditStrategy()` |
| 6 | `src/services/path-metrics.ts` | 修改 | L2 | `assessExecutionQuality()` 后调用 `agentAuditExecutionQuality()` |
| 7 | `src/services/semantic-cache.ts` | 修改 | L2 | 每次 `get/set/evict` 调用 `agentAuditCacheOperation()` |

### agent-audit-logger.ts 升级要点

```
升级前（双通道）:
  agentAuditRequest()    → console + file（仅 dev）
  agentAuditResponse()   → console + file（仅 dev）
  agentAuditError()      → console + file（仅 dev）

升级后（三通道）:
  agentAuditRequest()    → console + file + AuditLog DB（channel=L2, action=CHAT_REQUEST）
  agentAuditResponse()   → console + file + AuditLog DB（channel=L2, action=CHAT_RESPONSE）
  agentAuditError()      → console + file + AuditLog DB（channel=L2, action=CHAT_ERROR）
  agentAuditStrategy()   → 新增: console + AuditLog DB（channel=L2, action=STRATEGY_MATCHED）
  agentAuditExecutionQuality() → 新增: console + AuditLog DB（channel=L2, action=EXECUTION_QUALITY）
  agentAuditCacheOperation()   → 新增: console + AuditLog DB（channel=L2, action=CACHE_HIT/MISS/SET/EVICT）

节点级函数不写 AuditLog 表（agentAuditNodeStart/End/Error、agentAuditLLMCall/Error、
agentAuditRoute、agentAuditRetrieval 仍只写 console + file）— 这些是 L1 粒度，在
logs/agent/agent-audit.log 文件中（dev only）。
```

### 微调数据导出

```
GET /api/agent/chat/threads/{threadId}/debug?format=fine-tuning

返回:
[
  {
    "instruction": "你是一个农业分析智能体...",
    "input": "邗江区种水稻，帮我分析一下",
    "output": "邗江区水稻主栽建议南粳9108...",
    "quality": "good",
    "metadata": {
      "confidence": 78, "followUpCount": 2,
      "strategy": "deep:analysis", "experts": ["crop_compare", "roi_analysis"]
    }
  }
]

自动筛选规则:
  - followUpCount > 0 → 排除
  - confidence < 50 → 排除
  - chat 意图 → 排除
  - confidence >= 90 && followUpCount = 0 → quality="excellent"
  - confidence >= 75 && followUpCount = 0 → quality="good"
  - strategyAdjusted = true → quality="acceptable"
```

### 验证清单

| # | 验证项 | 方法 | 通过标准 |
|---|--------|------|---------|
| 1 | **L2: AuditLog 写入（生产）** | `NODE_ENV=production` 发送消息 → 查询 AuditLog 表 | AuditLog 表有 CHAT_REQUEST/STRATEGY_MATCHED/CHAT_RESPONSE |
| 2 | **L2: traceId 串联** | `query_audit_logs({ traceId })` | 同一请求所有 AuditLog 共享相同 traceId |
| 3 | **L2: 环境无关** | `NODE_ENV=production` 发送消息 | AuditLog 表仍有记录（不依赖 NODE_ENV） |
| 4 | **L2: 节点函数不写 DB** | 发送消息后查询 AuditLog WHERE targetType='AGENT_NODE' | 无 NODE_START/NODE_END/LLM_CALL 记录 |
| 5 | **L1: trace 写入** | `NODE_ENV=development` 发送消息 → `ls logs/debug/{threadId}/` | 有 JSON 文件，按 messageIndex 升序 |
| 6 | **L1: 生产关闭** | `NODE_ENV=production` → `ls logs/debug/` | 无新文件（debug-tracer 整体跳过） |
| 7 | **L1: trace 完整性** | GET /debug?messageId=xxx | 含全部 9 个 node trace |
| 8 | **微调导出** | GET /debug?format=fine-tuning | prompt/response 对 + quality 标签 |
| 9 | **质量筛选** | 导出后检查 | followUpCount>0 / confidence<50 被排除 |
| 10 | **缓存审计** | 相同问题发两次 → 查 AuditLog | CACHE_MISS + CACHE_SET（第1次），CACHE_HIT（第2次） |
| 11 | **执行度审计** | 多轮对话（≥5轮）→ 查 AuditLog | afterState 含 signals + compositeScore |

---

## 第8轮：架构合流闭包 — Global State Model + Cognitive Event Bus + Policy Loop

### 上下文

| 属性 | 内容 |
|------|------|
| 覆盖阶段 | 前 7 轮全部完成后的 L4 架构合流 |
| 文件数 | 待独立 spec 确认 |
| 依赖 | 第1-7轮全部完成，且 ADD-7 审计可通过 query_audit_logs 完整恢复 |
| 独立验证 | GlobalSystemState 可表达 chat/agent/memory/tool/policy/audit/feedback 全局状态；Cognitive Event Bus 可串联 Thought → Decision → Action → Feedback → PolicyUpdate |
| 设计密度 | ⭐⭐⭐⭐⭐——这是从 L2/L3 初期迈向 L4 adaptive coordination system 的架构闭包 |

### 为什么第8轮必须独立

前 7 轮的目标是局部闭包收敛：类型、策略、上下文、专家消费、缓存、演化、审计。GPT 结构评价指出，系统真正的问题不是功能不足，而是四套系统并行发展但没有统一认知与执行内核：

```text
交互系统: chat-thread / chat-ui / streaming / input
记忆系统: RAG / semantic-cache / retrieval
认知系统: co-agent / reasoning / response-strategy / expert-registry / evolution-loop
执行系统: event-bus / mcp-server / audit / workspace-pmo
```

第8轮不能提前塞进前7轮，否则会破坏原子事务边界；它必须在前7轮稳定后，将这些闭包合流。

### 第8轮核心目标

1. **Global State Model**
   - 定义 `GlobalSystemState`，统一 chat state、agent state、memory state、tool execution state、policy state、audit state、feedback state。
   - 明确 `AgentState` 与 `GlobalSystemState` 的关系：第1轮收敛后的 AgentState 是 Global State 的认知子域，不再是孤立局部状态。

2. **Cognitive Event Bus**
   - 将 event bus 从 UI/logging/streaming 事件升级为认知执行事件中枢。
   - 标准事件链：`ThoughtStarted → IntentDetected → RouteDecided → EvidenceRetrieved → ReasoningPathGenerated → StrategyResolved → ActionProposed → FeedbackObserved → PolicyUpdated`。

3. **Policy Update Loop**
   - 将第6轮 path metrics / TTL stats / turnHistory 与第7轮 L2 AuditLog 合并为可解释策略更新闭环。
   - 每次策略更新必须具备 input metrics、decision reason、affected policy、rollback data。

4. **Competition-based Agent Execution**
   - 在 Global State 和 Cognitive Event Bus 完成后，引入 multiple reasoning paths、scoring、arbitration。
   - 多路径必须共享同一 evidence/reference/state schema，否则禁止比较和仲裁。

### 第8轮禁止事项

- 禁止回头破坏前7轮已收敛的文件边界。
- 禁止把 Global State Model 做成只读文档而没有真实状态转换接口。
- 禁止把 Cognitive Event Bus 继续停留在日志事件或 UI 事件层。
- 禁止在无统一 state schema 的情况下实现 multi-agent competition。
- 禁止绕过 ADD-7；第8轮本身也必须逐文件记录并 query_audit_logs 回查。

### 第8轮预期 spec

```text
.trae/specs/farm-agent-global-state/spec.md
.trae/specs/farm-agent-global-state/tasks.md
.trae/specs/farm-agent-global-state/checklist.md
```

---

## 附录 A：总览对照

| 轮次 | 覆盖 Step | 文件数 | 新建 | 修改 | 依赖 | 核心风险 |
|------|----------|--------|------|------|------|---------|
| **1. 基础层** | 1+2 | 8 | 0 | 8 | 无 | 类型替换遗漏 |
| **2. 裁决层** | 3 | 3 | 1 | 2 | 第1轮 | 策略匹配遗漏意图 |
| **3. 领域基础设施** | 4.2-4.4 | 4 | 2 | 2 | 第1轮 | ChatThread.metadata 写入失败 |
| **4. 领域集成** | 4.5-4.8 | 6 | 2 | 4 | 第2+3轮 | promptTemplate 拼接错误 |
| **5. 语义缓存** | 5 | 3 | 1 | 2 | 第4轮 | 缓存键冲突 |
| **6. 演化闭环** | 7 | 5 | 2 | 3 | 第4+5轮 | 误触发策略降级 |
| **7. 审计管线** | 8 | 7 | 2 | 5 | 第6轮 | 生产 AuditLog 写入失败 |

## 附录 B：每轮对话启动规范

每轮对话开始时，必须按 P0 规则执行：

```
1. session-init SKILL — 查询 query_audit_logs 恢复上下文
   → 找到上一轮的 ADD-7 审计记录
   → 确认上一轮的验证清单全部通过
   → 评估是否影响本轮的依赖假设

2. add-paradigm SKILL — 功能分析 + 审计阶段定义
   → Step 0: 文档先行（确认本轮涉及的 project 文档是否已更新）
   → Step 1-7: 按 ADD 范式执行本轮开发
```

每轮对话结束时，必须按 ADD-7 规则写入审计记录：

```
本轮涉及的文件 × targetType/action/beforeState/afterState → record_dev_operation
本轮完成的验证清单 × 验证结果 → AuditLog 记录
```

---

## 附录 C：跨轮文件修改追踪

以下文件在多轮中递进修改，注意上下文继承：

| 文件 | 第1轮 | 第2轮 | 第3轮 | 第4轮 | 第5轮 | 第6轮 | 第7轮 |
|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `src/agents/state.ts` | ✅ | | ✅ | | | | |
| `src/agents/nodes/retrieval.ts` | ✅ | | | ✅ | | | |
| `src/agents/nodes/response.ts` | | ✅ | | ✅ | | | ✅ |
| `src/agents/nodes/reasoning.ts` | | | | ✅ | | | |
| `src/app/api/agent/chat/stream/route.ts` | | | ✅ | | ✅ | ✅ | ✅ |
| `src/agents/response-strategy.ts` | | ✅(新建) | | | | ✅ | |
| `src/services/analysis-context.ts` | | | ✅(新建) | | | ✅ | |
| `src/services/semantic-cache.ts` | | | | | ✅(新建) | | ✅ |
| `src/services/path-metrics.ts` | | | | | | ✅(新建) | ✅ |
