# co-agent 简化版 — 5 对话交接手册

> **用途**：每个新对话开始时，把对应章节粘贴给 LLM，它就知道自己该做什么、上游做了什么、文件当前处于什么状态。

---

## 全局元信息

- **父 Plan**: [co-agent-simplified-v1.md](./co-agent-simplified-v1.md)
- **依赖拓扑图**: [co-agent-simplified-v1-execution-plan.md](./co-agent-simplified-v1-execution-plan.md)
- **目标仓库**: `/home/xmm/ai/farm-agent`
- **总文件数**: 约 27 个独立文件
- **对话数**: 5 个

```
对话1 ── 基础层（类型收敛 + thinkLevel 路由）
            │
            ├──────────────────────┐
            ▼                      ▼
对话2 ── 裁决层 + 领域基础设施
            │
            ▼
对话3 ── 领域集成（管线消费 + 报告服务）
            │
            ├──────────────────────┐
            ▼                      ▼
对话4 ── 语义缓存 + 演化闭环
            │
            ▼
对话5 ── 三层审计管线
```

---

## <对话1> 基础层 — 类型收敛 + thinkingLevel 路由

### 你当前的位置

你是第 1 个对话。上游无依赖，从当前代码基线开始。

### 上游已完成

无（首轮）。

### 你继承的文件状态

所有文件处于原始状态。你需要做的工作是 `co-agent-simplified-v1.md` 的 Step 1 + Step 2。

### 你的 spec 文件

`.trae/specs/co-agent-type-convergence/spec.md`
`.trae/specs/co-agent-type-convergence/tasks.md`
`.trae/specs/co-agent-type-convergence/checklist.md`

### 你要改的文件（8 个，全部修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/types/evidence.ts` | 修改 | Evidence 加 chunkId/expandable/detailUrl/score；新建 EvidenceRef + EvidenceSummary |
| `src/agents/state.ts` | 修改 | 删内联 Evidence → import 统一类型；CurrentTask 加 thinkingLevel |
| `src/agents/prompts/types.ts` | 修改 | 内联 evidence → EvidenceRef[]；CurrentTask 加 thinkingLevel |
| `src/agents/nodes/intention.ts` | 修改 | 输出 thinkingLevel（chat→fast，其余→deep） |
| `src/agents/edges/conditional.ts` | 修改 | routeByIntent 按 thinkingLevel 分流 |
| `src/agents/nodes/retrieval.ts` | 修改 | 产出证据时填 chunkId |
| `src/agents/nodes/interaction-point-detection.ts` | 修改 | evidence 类型引用替换 |
| `src/agents/prompts/interaction-point-detection.ts` | 修改 | evidence 类型引用替换 |

### 你的关键设计

```typescript
// routeByIntent 改造后：
if (thinkingLevel === "fast") return "response"   // chat → 跳 RAG/推理/裁决
return "retrieval"                                 // 其余 → 完整 6 节点
```

### 你的验证标准

- `npx tsc --noEmit` 零类型错误
- grep "interface Evidence" src/ -r 仅在 evidence.ts 出现一次
- "你好" → SSE 无 retrieval/reasoning/verdict 事件
- "水稻育秧步骤" → SSE 含完整 6 节点

### 完成后记录 ADD-7 审计

每改完一个文件，调用 `record_dev_operation`。参考 audit action：
`EVIDENCE_TYPE_UNIFIED / STATE_TYPE_CLEANED / THINKING_LEVEL_ROUTING`

---

## <对话2> 裁决层 + 领域基础设施

### 你当前的位置

你是第 2 个对话。上游对话1 已完成类型收敛 + thinkingLevel 路由。

### 上游已完成（对话1）

- Evidence 接口已在 `src/types/evidence.ts` 中唯一定义（含 chunkId/expandable/detailUrl/score/EvidenceRef/EvidenceSummary）
- `state.ts` 不再内联定义 Evidence，`CurrentTask` 已有 `thinkingLevel?: "fast" | "deep"`
- `prompts/types.ts` 内联 evidence 已替换为 EvidenceRef[]
- `intention.ts` 已输出 thinkingLevel
- `conditional.ts` routeByIntent 已按 thinkingLevel 分流
- `retrieval.ts` 已填充 chunkId
- `interaction-point-detection.ts` 和相关 prompt 文件已使用新统一类型
- `npx tsc --noEmit` 零类型错误

### 恢复上下文的方法

```
1. 执行 session-init SKILL
2. query_audit_logs({ sinceMinutes: 1440, keyword: "EVIDENCE_TYPE_UNIFIED" })
3. query_audit_logs({ sinceMinutes: 1440, keyword: "THINKING_LEVEL_ROUTING" })
→ 确认对话1全部完成
```

### 你要做的工作

覆盖 `co-agent-simplified-v1.md` 的 **Step 3（裁决层）** + **Step 4.2-4.4（领域基础设施）**。两部分互不依赖，都只依赖对话1的类型基础。

### 你的 spec 文件

- `.trae/specs/co-agent-response-strategy/spec.md`
- `.trae/specs/co-agent-response-strategy/tasks.md`
- `.trae/specs/co-agent-response-strategy/checklist.md`
- `.trae/specs/co-agent-expert-registry/spec.md`
- `.trae/specs/co-agent-expert-registry/tasks.md`
- `.trae/specs/co-agent-expert-registry/checklist.md`

### 你要改的文件（7 个：3 新建 + 4 修改）

**裁决层**（Step 3）：

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/agents/response-strategy.ts` | **新建** | StrategyDescriptor + registry + resolveResponseStrategy + 修饰器管道 |
| `src/agents/nodes/response.ts` | 修改 | 消费 resolveResponseStrategy 替代硬编码三段分支 |
| `src/agents/types.ts` | 修改 | DisplayContent.sections 联合类型加 evidence_digest / action_steps / timeline |

**领域基础设施**（Step 4.2-4.4）：

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/agents/experts/registry.ts` | **新建** | AnalysisExpert 接口 + ANALYSIS_EXPERTS（3 个专家含 reportFormats） |
| `src/services/analysis-context.ts` | **新建** | AnalysisContext + AnalysisTurnRecord + CRUD（读写 ChatThread.metadata） |
| `src/agents/state.ts` | 修改 | AgentState 加 analysisContext（**注意**：对话1 已改过此文件） |
| `src/app/api/agent/chat/stream/route.ts` | 修改 | 请求前加载 analysisContext，请求后保存 |

### 裁决层核心设计

```typescript
// 自声明策略描述符 — 类比 Linux VFS/poll
interface StrategyDescriptor {
  id: string                              // "fast:chat" / "deep:analysis"
  matches: (ctx: StrategyContext) => boolean
  priority: number                        // 10=兜底, 20=精确匹配
  apply: ResponseStrategy
}

// 裁决：遍历注册表 → filter(matches) → sort(priority) → 修饰器管道
function resolveResponseStrategy(ctx: StrategyContext): ResponseStrategy
```

注册 9 个策略：fast:chat + deep:analysis/planning/decision/question/creation/modification + deep:fallback

### 你的验证标准

**裁决层**：
- "你好" → sections 仅 conclusion，promptHint 含"1-2句话"
- "邗江区种水稻分析" → sections 含 conclusion + evidence + reasoning + confidence + risks
- "制定下月种植计划" → sections 含 action_steps + timeline，不含 evidence_digest
- "水稻育秧步骤" → sections 含 evidence_digest，不含 reasoning
- 未定义意图 → 回退到 deep:fallback（priority=1）

**领域基础设施**：
- ANALYSIS_EXPERTS 含 3 个专家，每个有四属性
- getAnalysisContext(threadId) 新建 thread 返回 null
- saveAnalysisContext 写入 ChatThread.metadata 成功
- 跨轮记忆：第1轮激活2专家 → 第2轮加载后 activeExperts 保持 2 个

### 完成后记录 ADD-7 审计

裁决层 action：`STRATEGY_DESCRIPTOR_REGISTRY` / `RESPONSE_STRATEGY_INTEGRATED`
领域基础设施 action：`EXPERT_REGISTRY_CREATED` / `ANALYSIS_CONTEXT_CREATED`

---

## <对话3> 领域集成 — 管线消费 + 报告服务

### 你当前的位置

你是第 3 个对话。上游对话1+2 已完成类型基础、裁决层、分析专家注册表、AnalysisContext。

### 上游已完成（对话1+2）

**对话1**：类型收敛 + thinkingLevel 路由
- Evidence 统一、EvidenceRef/EvidenceSummary 可用
- CurrentTask 含 thinkingLevel 字段
- fast/deep 路由分流正常工作
- `npx tsc --noEmit` 零错误

**对话2**：裁决层 + 领域基础设施
- `src/agents/response-strategy.ts` 存在，resolveResponseStrategy 可用
- `src/agents/nodes/response.ts` 已消费策略裁决（不再硬编码三段分支）
- `DisplayContent.sections` 联合类型含 evidence_digest / action_steps / timeline
- `src/agents/experts/registry.ts` 存在，ANALYSIS_EXPERTS 含 3 个专家
- `src/services/analysis-context.ts` 存在，AnalysisContext CRUD 可用
- `AgentState` 已有 `analysisContext` 字段
- `stream/route.ts` 已有 analysisContext 加载/保存逻辑

### 恢复上下文的方法

```
1. session-init SKILL
2. query_audit_logs({ sinceMinutes: 2880, targetType: "AGENT_STRATEGY" })
3. query_audit_logs({ sinceMinutes: 2880, targetType: "AGENT_NODE", keyword: "EXPERT_REGISTRY" })
→ 确认对话1+2全部完成
```

### 你要做的工作

覆盖 `co-agent-simplified-v1.md` 的 **Step 4.5 + 4.6 + 4.8**（管线节点消费分析专家 + 报告生成 + 下载 API）。

### 你的 spec 文件

`.trae/specs/co-agent-pipeline-integration/spec.md`
`.trae/specs/co-agent-pipeline-integration/tasks.md`
`.trae/specs/co-agent-pipeline-integration/checklist.md`

### 你要改的文件（6 个：2 新建 + 4 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/agents/nodes/retrieval.ts` | 修改 | 合并 activeExperts 的 evidenceFilter → ChromaDB 检索条件 |
| `src/agents/nodes/reasoning.ts` | 修改 | 从 ANALYSIS_EXPERTS 取各专家 promptTemplate + 注入 runtimeInputs |
| `src/agents/nodes/response.ts` | 修改 | 合并 activeExperts 的 outputSections → 传修饰器管道 |
| `src/services/report-generator.ts` | **新建** | generateReport + 4 格式生成器 + inferDefaultFormat + learnFormatPreference 钩子 |
| `src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts` | **新建** | 多格式报告下载 API |
| `package.json` | 修改 | 加依赖：docx / exceljs / pdfmake |

### 管线消费逻辑（核心）

```
retrieval:  activeExperts 非空 → 合并 evidenceFilter → ChromaDB 按来源过滤
            空 → 行为不变（默认检索）

reasoning:  activeExperts 非空 → 追加 [分析上下文] 块 → 各专家独立维度
            空 → 行为不变（默认推理 prompt）

response:   activeExperts 非空 → 合并 outputSections 并集去重 → 传修饰器1
            空 → ResponseStrategy 自行裁决（对话2已实现）
```

### 报告 API

```
GET /threads/{threadId}/messages/{messageId}/report?format=md|pdf|docx|xlsx

不指定 format → 按 activeExperts 推导：
  仅 roi_analysis → xlsx
  仅 crop_compare/pest_risk → md
  混合 → pdf
```

### 你的验证标准

- 激活 roi_analysis → retrieval 仅检索"市场行情"+"经济数据"文档
- 激活 crop_compare+roi_analysis → reasoning prompt 含两专家独立维度块
- 多专家激活 → DisplayContent.sections 含各专家对应 type
- GET /report?format=md → 返回 Markdown
- GET /report?format=xlsx → 返回 Excel（3 Sheet）
- 不指定 format 仅 roi 激活 → 默认 xlsx
- 混合专家不指定 format → 默认 pdf
- `npx tsc --noEmit` + 依赖 install 成功

### 完成后记录 ADD-7 审计

action：`PIPELINE_EXPERT_CONSUME` / `REPORT_GENERATOR_CREATED` / `REPORT_DOWNLOAD_API`

---

## <对话4> 语义缓存 + 演化闭环

### 你当前的位置

你是第 4 个对话。上游对话1-3 已完成类型基础、裁决层、分析专家注册表、管线消费、报告服务。

### 上游已完成（对话1-3）

**对话1**：类型收敛 + thinkingLevel 路由
**对话2**：裁决层（response-strategy.ts + 注册表 + resolveResponseStrategy）+ 领域基础设施（ANALYSIS_EXPERTS + AnalysisContext CRUD）
**对话3**：管线消费（retrieval/reasoning/response 已消费 activeExperts）+ 报告服务（report-generator.ts + report API）+ 依赖已安装

### 恢复上下文的方法

```
1. session-init SKILL
2. query_audit_logs({ sinceMinutes: 4320 })
→ 看到 PIPELINE_EXPERT_CONSUME / REPORT_GENERATOR_CREATED
→ 确认对话1-3完成
```

### 你要做的工作

覆盖 `co-agent-simplified-v1.md` 的 **Step 5（语义缓存基础机制）** + **Step 7（演化闭环）**。两部分连续——缓存的 TTL 学习钩子、turnHistory 采集点横跨两步，合并避免"先埋钩子后面忘了挂"。

### 你的 spec 文件

- `.trae/specs/co-agent-semantic-cache/spec.md` / `tasks.md` / `checklist.md`
- `.trae/specs/co-agent-evolution-loop/spec.md` / `tasks.md` / `checklist.md`

### 你要改的文件（8 个：3 新建 + 5 修改）

**语义缓存**（Step 5）：

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/services/semantic-cache.ts` | **新建** | SimpleSemanticCache + buildCacheKey + bumpKbGeneration + CACHE_TTL |
| `src/app/api/agent/chat/stream/route.ts` | 修改 | 缓存查询/存储 + 命中模拟流式（**注意**：对话2/3已改过） |
| `src/services/knowledge-indexer.ts` | 修改 | 索引完成后 bumpKbGeneration() |

**演化闭环**（Step 7）：

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/services/path-metrics.ts` | **新建** | MetricDescriptor 注册表（4 检测器）+ assessExecutionQuality + buildMetricBaselines |
| `src/services/cache-ttl-stats.ts` | **新建** | TtlStats + adaptCacheTtl |
| `src/agents/response-strategy.ts` | 修改 | resolveResponseStrategy 中调 assessExecutionQuality（**注意**：对话2新建） |
| `src/services/analysis-context.ts` | 修改 | 实现 appendTurnRecord 采集逻辑（**注意**：对话2新建） |
| `src/app/api/agent/chat/stream/route.ts` | 修改 | 每轮结束采集 turnHistory（**注意**：本轮已改缓存部分） |

### 缓存核心设计

```
淘汰三层：
  ① kbGeneration 不匹配 → 惰性淘汰（知识库变更时）
  ② 超过 CACHE_TTL[intent] 秒 → 过期
  ③ 超出 MAX_CACHE_SIZE(200) → LRU 最旧

命中时模拟流式：
  cache_hit 事件 → chunkSize=3 分片 → ~1.5s 总耗时 → structured_output
```

### 演化回路核心设计

```
回路一：缓存过期 → LLM重跑 → 对比旧结论 → 相同±5% → TTL↑20%
回路二：同场景下载≥5次 + 最高频>60% → inferDefaultFormat 被偏好覆盖
回路三：4 维度复合裁决
  ├─ 置信度轨迹（线性回归β < -3）→ augment_prompt
  ├─ 证据覆盖率（3轮递减+低均值）→ relax_evidence_filter
  ├─ 追问率（≥40%）→ activate_expert
  └─ 置信度波动率（σ > 15%）→ augment_prompt
```

### 你的验证标准

**缓存**：
- 同问题两次 → 第2次 cache_hit，SSE 首事件 cache_hit
- 超 TTL 后重发 → 走完整管线
- 上传文档后重发 → kbGeneration 不匹配 → 走完整管线
- 缓存命中 token 分片推送，0.5-1.5s

**演化**：
- 每轮后 turnHistory 长度 = 总轮数
- 同场景 3 次过期结论相同 → TTL 上调 20%
- 连续 5 轮置信度下降 → promptHint 追加"信息缺口"
- 删除 metadata → 系统回退初始常量

### 完成后记录 ADD-7 审计

缓存 action：`SEMANTIC_CACHE_CREATED`
演化 action：`PATH_METRICS_CREATED` / `CACHE_TTL_STATS_CREATED` / `EVOLUTION_LOOP_INTEGRATED`

---

## <对话5> 三层审计管线

### 你当前的位置

你是第 5 个对话。上游对话1-4 已完成全部业务功能：类型基础、裁决层、分析专家、管线消费、报告服务、语义缓存、演化闭环。

### 上游已完成（对话1-4）

**对话1**：类型收敛 + thinkingLevel 路由
**对话2**：裁决层 + 领域基础设施
**对话3**：管线消费 + 报告服务
**对话4**：语义缓存 + 演化闭环（path-metrics.ts 和 cache-ttl-stats.ts 存在，assessExecutionQuality 已集成到 resolveResponseStrategy，turnHistory 采集已完成，adaptCacheTtl 已在 stream/route.ts 调用）

### 恢复上下文的方法

```
1. session-init SKILL
2. query_audit_logs({ sinceMinutes: 5760 })
→ 看到 EVOLUTION_LOOP_INTEGRATED / SEMANTIC_CACHE_CREATED
→ 确认对话1-4完成
```

### 你要做的工作

覆盖 `co-agent-simplified-v1.md` 的 **Step 8**（三层审计管线）。这是最后一步，把所有审计能力补齐。L2（生产 AuditLog）优先于 L1（dev debug trace）。

### 你的 spec 文件

`.trae/specs/co-agent-audit-pipeline/spec.md`
`.trae/specs/co-agent-audit-pipeline/tasks.md`
`.trae/specs/co-agent-audit-pipeline/checklist.md`

### 你要改的文件（7 个：2 新建 + 5 修改）

| 文件 | 操作 | 层次 | 改什么 |
|------|------|------|--------|
| `src/lib/agent-audit-logger.ts` | **修改升级** | L2 | +prisma + setAuditContext/clearAuditContext + writeAuditLog；agentAuditRequest/Response/Error 加 DB 通道；新增 agentAuditStrategy/ExecutionQuality/CacheOperation |
| `src/services/debug-tracer.ts` | **新建** | L1 | DebugTrace + createTrace + captureNode + captureSummary + finalizeAndSave + exportFineTuningData（仅 NODE_ENV=dev） |
| `src/app/api/agent/chat/threads/[threadId]/debug/route.ts` | **新建** | L1 | Debug 面板 API + 微调导出（format=json/fine-tuning，仅 dev） |
| `src/app/api/agent/chat/stream/route.ts` | 修改 | L1+L2 | setAuditContext + captureNode + finalizeAndSave（**注意**：对话2/3/4已改过） |
| `src/agents/nodes/response.ts` | 修改 | L2 | resolveResponseStrategy 后调 agentAuditStrategy（**注意**：对话2/3已改过） |
| `src/services/path-metrics.ts` | 修改 | L2 | assessExecutionQuality 后调 agentAuditExecutionQuality（**注意**：对话4新建） |
| `src/services/semantic-cache.ts` | 修改 | L2 | get/set/evict 时调 agentAuditCacheOperation（**注意**：对话4新建） |

### agent-audit-logger.ts 升级要点（核心）

```
升级前：双通道（console + file），文件仅 dev 开
升级后：三通道（console + file + AuditLog DB）

升级的函数：
  agentAuditRequest()    → + AuditLog(CHAT_REQUEST)
  agentAuditResponse()   → + AuditLog(CHAT_RESPONSE)
  agentAuditError()      → + AuditLog(CHAT_ERROR)

新增的函数（仅 L2，始终写 DB）：
  agentAuditStrategy()         → AuditLog(STRATEGY_MATCHED)
  agentAuditExecutionQuality() → AuditLog(EXECUTION_QUALITY)
  agentAuditCacheOperation()   → AuditLog(CACHE_HIT/MISS/SET/EVICT)

不变（不写 DB，L1 粒度）：
  agentAuditNodeStart/End/Error、agentAuditLLMCall/Error、
  agentAuditRoute、agentAuditRetrieval → 仍只写 console + file
```

### 三层职责边界

```
L1 开发审计（仅 dev）:
  debug-tracer.ts → logs/debug/{threadId}/ + Debug API
  每节点 input/output/裁决，10-50KB/trace
  微调数据导出：GET /debug?format=fine-tuning

L2 运行时审计（始终开）:
  agent-audit-logger.ts → AuditLog DB 表
  高层事件：CHAT_REQUEST/RESPONSE/ERROR/STRATEGY_MATCHED
           EXECUTION_QUALITY/CACHE_HIT/MISS/SET/EVICT

L3 控制台:
  console.log，开关：LOG_LEVEL
```

### 你的验证标准

**L2 生产写入**：`NODE_ENV=production` → AuditLog 表有 CHAT_REQUEST / STRATEGY_MATCHED / CHAT_RESPONSE

**L2 traceId 串联**：`query_audit_logs({ traceId })` → 同请求所有记录共享 traceId

**L2 节点不写 DB**：AuditLog 表无 NODE_START/NODE_END/LLM_CALL 记录

**L1 dev**：`NODE_ENV=development` → `logs/debug/{threadId}/` 有 JSON 文件

**L1 生产关闭**：`NODE_ENV=production` → `logs/debug/` 无新文件

**微调导出**：GET /debug?format=fine-tuning → 含 quality 标签，followUp>0 被排除

**缓存审计**：第1次 CACHE_MISS+CACHE_SET，第2次 CACHE_HIT

**执行度审计**：afterState 含 signals + compositeScore

### 完成后记录 ADD-7 审计

action：`AUDIT_LOGGER_LAYER2_UPGRADE` / `DEBUG_TRACER_CREATED` / `DEBUG_PANEL_API` / `RESPONSE_STRATEGY_AUDIT` / `EXECUTION_QUALITY_AUDIT` / `SEMANTIC_CACHE_AUDIT`

---

## 附录：每对话启动模板

新对话开始时，直接把下面内容 + 对应章节粘贴给 LLM：

```
## 上下文

你在执行 co-agent 简化版改进的 [对话N]。上游 [对话1~N-1] 已完成。
先读 .trae/documents/co-agent-conversation-handoff.md 的 <对话N> 章节。

## 启动步骤（按顺序）

1. 执行 session-init SKILL
2. 执行 add-paradigm SKILL（Step 0 文档先行）
3. 读 .trae/specs/co-agent-XXX/spec.md
4. 按 .trae/specs/co-agent-XXX/tasks.md 顺序执行
5. 每完成一个 Task：读 checklist.md → 逐项验证 → 勾选
6. 全部完成后：record_dev_operation 写入 ADD-7 审计

## 关键提醒

- 对话已开 [N]/5，完成后立即 record_dev_operation
- 禁止简化代码实现
- 保持与上游文件修改的兼容（注意带 ⚠ 标记的已在前面轮次改过的文件）
```
