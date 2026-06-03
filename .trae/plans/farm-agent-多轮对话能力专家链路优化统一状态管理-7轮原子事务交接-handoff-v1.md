# farm-agent — 7 轮原子事务交接手册

> **用途**：每个新对话开始时，把对应轮次章节粘贴给 LLM。它需要明确自己正在执行哪个原子工程事务、上游事务已经提交了什么、当前事务的文件边界是什么、验证标准是什么、完成后记录哪些 ADD-7 审计。

---

## 全局元信息

- **父 Plan**: [co-agent-simplified-v1.md](./co-agent-simplified-v1.md)
- **原子事务拓扑**: [co-agent-simplified-v1-execution-plan.md](./co-agent-simplified-v1-execution-plan.md)
- **目标仓库**: `/home/xmm/ai/farm-agent`
- **总文件数**: 前7轮约 27 个独立文件；第8轮待独立 spec 确认
- **轮次数**: 前7轮局部闭包 + 第8轮架构合流闭包
- **拆分原则**: 前7轮以业务原子闭包为主，以对话上下文容量为辅；第8轮只在前7轮收敛后做统一认知与执行内核

```text
第1轮 ── 基础闭包：类型收敛 + thinkingLevel 路由
            │
            ▼
第1.5轮 ── 核心链路 TS 基线收敛
            │
            ├──────────────┐
            ▼              ▼
第2轮 ── 响应裁决闭包      第3轮 ── 领域上下文闭包
            │              │
            └──────┬───────┘
                   ▼
第4轮 ── 领域消费闭包：管线消费 + 报告服务
            │
            ▼
第5轮 ── 语义缓存闭包
            │
            ▼
第6轮 ── 演化闭环闭包
            │
            ▼
第7轮 ── 三层审计管线闭包
            │
            ▼
第8轮 ── 架构合流闭包：Global State Model + Cognitive Event Bus + Policy Loop
```

---

## 原子事务边界说明

本手册中的“轮”不是按文件数量机械拆分，也不是仅按对话上下文容量拆分，而是按原子工程操作拆分。

原子工程操作定义为：在一个事务边界内，为实现某个工程功能所必须共同提交、共同验证、共同审计、共同恢复的最小一致性闭包。

因此：

- ResponseStrategy 与 AnalysisContext 虽然都依赖第1轮，但属于不同业务闭包，必须拆成第2轮和第3轮。
- SemanticCache 与 EvolutionLoop 虽然有 TTL 学习关联，但一个是复用结果闭包，一个是运行数据反馈闭环，必须拆成第5轮和第6轮。
- 每一轮完成后必须能够独立证明收敛，不能依赖“下一轮再补齐”才能成立。
- 第8轮不是前7轮的补丁，而是前7轮收敛后的架构合流；前7轮禁止提前实现 Global State Model、Cognitive Event Bus、Policy Update Loop、Competition-based Agent Execution。
- 第1轮的 AgentState 收敛是未来 Global State Model 的地基，但第1轮不建立全局状态模型。

### 交接手册与 spec 的优先级

- 本 handoff 是新对话的入口索引，负责说明轮次位置、上下游依赖、文件边界、高风险误区、恢复关键词和审计闭环。
- 具体实现细节以对应 `.trae/specs/co-agent-XXX/spec.md`、`tasks.md`、`checklist.md` 为准。
- 如果 handoff 摘要与 spec/tasks/checklist 存在颗粒度差异，以 spec/tasks/checklist 为准，不允许按 handoff 的简写自行简化实现。
- 每轮完成后的 ADD-7 不只写入 `record_dev_operation`，还必须用 `query_audit_logs` 按 action/targetId/keyword 回查确认落库。

---

## <第1轮> 基础闭包 — 类型收敛 + thinkingLevel 路由

### 你当前的位置

你是第 1 轮。上游无依赖，从当前代码基线开始。

### 原子事务目标

完成 `co-agent-simplified-v1.md` 的 Step 1 + Step 2，建立后续全部事务共享的类型和路由基础。

### 你的 spec 文件

- `.trae/specs/co-agent-type-convergence/spec.md`
- `.trae/specs/co-agent-type-convergence/tasks.md`
- `.trae/specs/co-agent-type-convergence/checklist.md`

### 架构文档

- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统技术架构说明书》.md` — 8.1 节：类型收敛 + thinkingLevel 路由

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
if (thinkingLevel === "fast") return "response"
return "retrieval"
```

### 关键契约细化

- `src/types/evidence.ts` 必须成为 `interface Evidence` 的唯一权威定义。
- EvidenceSource 不得误收窄，必须覆盖当前 `retrieval.ts` 已真实使用的 `knowledge` / `knowledge_empty` / `project_context` / `keywords` / `multimodal`，同时保留父 Plan 预留的 `document` / `task` / `economic` / `history` / `team_input` / `sensor`。
- `EvidenceRef` 是 prompt / strategy / context 的轻量引用句柄，不携带完整 `content`。
- `EvidenceSummary` 是 evidence digest / stream structured output / 展示摘要的轻量结构。
- `CurrentTask.thinkingLevel` 允许可选，但 `routeByIntent` 必须用 `state.currentTask?.thinkingLevel ?? "deep"` 做保守 fallback。
- `intention.ts` 所有返回 `currentTask` 的路径都要考虑 thinkingLevel：LLM parse、parse fallback、explicitIntent。thinkingLevel 应由代码根据最终 intent 计算，不应要求 LLM 必填输出。
- `retrieval.ts` 的 `chunkId` 只能从真实 metadata 提取；没有真实 chunk 标识时保持 undefined 并保留 metadata，禁止用 `randomUUID` 或 `evidenceId` 伪造。
- `routeByIntent` 必须保留 traceId tracer 的 route decision 记录和 `agentAuditRoute`。

### 高风险误区

- 禁止把真实 `source: "knowledge"` 等运行时来源改成不准确的 `"document"` 只为通过类型检查。
- 禁止把 `AgentState.evidenceChain` 从完整 `Evidence[]` 改成 `EvidenceRef[]`。
- 禁止只在 prompt 文案中写 thinkingLevel，而不落到 state。
- 禁止缺失 thinkingLevel 时默认 fast；缺失必须走 deep/retrieval。
- 禁止提前实现第2轮 ResponseStrategy 或第3轮 AnalysisContext。

### ADD-7 审计记录（10条，全部已落库）

第1轮共记录 10 条 ADD-7 审计。**其他 AI Session 恢复上下文时**，必须确认以下 10 条全部命中文档：

#### MCP 工具查询（推荐，AI 直接用）

```text
query_audit_logs({ sinceMinutes: 1440, keyword: "ROUND1_TYPE_CONVERGENCE_COMPLETED" })
```

命中即第1轮完成。若需逐文件验证，用以下 9 个 action 逐一回查：

```text
query_audit_logs({ keyword: "EVIDENCE_TYPE_UNIFIED" })           → src/types/evidence.ts
query_audit_logs({ keyword: "STATE_TYPE_CLEANED" })              → src/agents/state.ts
query_audit_logs({ keyword: "PROMPT_EVIDENCE_REF_ADDED" })       → src/agents/prompts/types.ts
query_audit_logs({ keyword: "THINKING_LEVEL_ASSIGNED" })         → src/agents/nodes/intention.ts
query_audit_logs({ keyword: "THINKING_LEVEL_ROUTING" })          → src/agents/edges/conditional.ts
query_audit_logs({ keyword: "RETRIEVAL_EVIDENCE_CHUNK_ID_ADDED" }) → src/agents/nodes/retrieval.ts
query_audit_logs({ keyword: "INTERACTION_EVIDENCE_TYPE_UNIFIED" })  → src/agents/nodes/interaction-point-detection.ts
query_audit_logs({ keyword: "INTERACTION_PROMPT_EVIDENCE_REF_ADDED" }) → src/agents/prompts/interaction-point-detection.ts
query_audit_logs({ keyword: "AGENT_GRAPH_CONDITIONAL_EDGES_FIXED" })  → src/agents/index.ts（Bug修复）
```

#### SQL 直接查询（管理员/手动验证用）

```sql
-- 确认第1轮完成（命中1条即完成）
SELECT action, "targetId", reason, "createdAt"
FROM "AuditLog"
WHERE action = 'ROUND1_TYPE_CONVERGENCE_COMPLETED'
ORDER BY "createdAt" DESC;

-- 确认第1轮全部 10 条记录
SELECT action, "targetId", "createdAt"
FROM "AuditLog"
WHERE action IN (
  'EVIDENCE_TYPE_UNIFIED',
  'STATE_TYPE_CLEANED',
  'PROMPT_EVIDENCE_REF_ADDED',
  'THINKING_LEVEL_ASSIGNED',
  'THINKING_LEVEL_ROUTING',
  'RETRIEVAL_EVIDENCE_CHUNK_ID_ADDED',
  'INTERACTION_EVIDENCE_TYPE_UNIFIED',
  'INTERACTION_PROMPT_EVIDENCE_REF_ADDED',
  'AGENT_GRAPH_CONDITIONAL_EDGES_FIXED',
  'ROUND1_TYPE_CONVERGENCE_COMPLETED'
)
ORDER BY "createdAt" ASC;
```

#### 恢复判定标准

- 10 条 action 全部命中（时间约 2026-05-25T05:16 ~ 05:17 UTC）
- `ROUND1_TYPE_CONVERGENCE_COMPLETED` 的 afterState 包含 `"第1轮完成"`
- checklist.md 中 130/130 项已全部标记 `[x]`

### 你的验证标准

- `npx tsc --noEmit` 零类型错误
- `grep -R "interface Evidence " src/` 仅在 `src/types/evidence.ts` 出现一次
- “你好” → SSE 无 retrieval/reasoning/verdict 事件
- “水稻育秧步骤” → SSE 含完整 6 节点
- checklist.md 全部由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）
- tasks.md 全部 Task 子项由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）

### 完成后记录 ADD-7 审计

每改完一个文件，调用 `record_dev_operation`。参考 audit action：

- `EVIDENCE_TYPE_UNIFIED`
- `STATE_TYPE_CLEANED`
- `PROMPT_EVIDENCE_REF_ADDED`
- `THINKING_LEVEL_ASSIGNED`
- `THINKING_LEVEL_ROUTING`
- `RETRIEVAL_EVIDENCE_CHUNK_ID_ADDED`
- `INTERACTION_EVIDENCE_TYPE_UNIFIED`
- `INTERACTION_PROMPT_EVIDENCE_REF_ADDED`

---

## <第1.5轮> 核心链路 TS 基线收敛

### 你当前的位置

你是第 1.5 轮。上游第1轮已完成类型收敛 + thinkingLevel 路由。本轮不是业务功能轮，而是进入第2轮前的核心链路 TypeScript 基线收敛。

### 为什么需要第1.5轮

第1轮完成后，全局 `tsc` / `lint` 仍有历史错误。其中 scripts/tests/UI 的问题可以延后，但以下核心链路错误会反复影响第2-7轮：

```text
src/app/api/agent/chat/stream/route.ts
src/agents/index.ts
src/lib/agent-audit-logger.ts
src/agents/stream-bus.ts
```

这些文件会在第3、5、6、7轮持续被修改。如果不先收敛，后续每轮都难以判断错误是新引入还是历史遗留。

### 你的 review 文件

- `.trae/documents/farm-agent-global-tsc-lint-baseline-review.md`

### 你要改的文件（4 个，全部修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/app/api/agent/chat/stream/route.ts` | 修改 | 修 Prisma Json 输入类型；移除核心链路 any lint |
| `src/agents/index.ts` | 修改 | 修 Prisma Json 输入类型；清理 agentAudit unused lint |
| `src/lib/agent-audit-logger.ts` | 修改 | 修 AuditLog metadata/details Json 输入类型 |
| `src/agents/stream-bus.ts` | 修改 | 修函数缺少 return 路径 |

### 可选顺手修

如果修法非常局部且不引入新行为，可以顺手修：

```text
src/app/api/agent/chat/route.ts
src/app/api/model/test/route.ts
```

用于补齐 `ModelInfo.multimodal`。但禁止因此扩展到模型配置重构。

### 禁止事项

- 禁止清理全量 scripts lint
- 禁止重构 React UI hooks
- 禁止修复所有 tests
- 禁止改变第1轮 Evidence / thinkingLevel / fast-deep 路由行为
- 禁止引入第2轮 ResponseStrategy
- 禁止把第1.5轮扩大成全局质量清理

### ADD-7 恢复关键词

```text
query_audit_logs({ keyword: "CORE_TS_BASELINE_REVIEW_CREATED" })
query_audit_logs({ keyword: "CORE_STREAM_ROUTE_JSON_FIXED" })
query_audit_logs({ keyword: "CORE_AGENT_INDEX_JSON_FIXED" })
query_audit_logs({ keyword: "CORE_AGENT_AUDIT_JSON_FIXED" })
query_audit_logs({ keyword: "CORE_STREAM_BUS_RETURN_FIXED" })
query_audit_logs({ keyword: "ROUND1_5_CORE_BASELINE_COMPLETED" })
```

### 验证标准

核心链路 TypeScript 验收：

```bash
./node_modules/.bin/tsc --noEmit --pretty false 2>&1 \
  | grep -E "src/app/api/agent/chat/stream/route.ts|src/agents/index.ts|src/lib/agent-audit-logger.ts|src/agents/stream-bus.ts"
```

通过标准：无输出。

核心链路 lint 验收：

```bash
npm run lint -- --max-warnings=0 2>&1 \
  | grep -E "src/app/api/agent/chat/stream/route.ts|src/agents/index.ts|src/lib/agent-audit-logger.ts|src/agents/stream-bus.ts"
```

通过标准：无输出。

- `farm-agent-round1.5-spec-review.md` 第7节 ADD-7 6 个 action 逐项验证已落库

### 完成后记录 ADD-7 审计

- `CORE_TS_BASELINE_REVIEW_CREATED`
- `CORE_STREAM_ROUTE_JSON_FIXED`
- `CORE_AGENT_INDEX_JSON_FIXED`
- `CORE_AGENT_AUDIT_JSON_FIXED`
- `CORE_STREAM_BUS_RETURN_FIXED`
- `ROUND1_5_CORE_BASELINE_COMPLETED`

---

## <第2轮> 响应裁决闭包 — ResponseStrategy 集中管理

### 你当前的位置

你是第 2 轮。上游第1轮已完成类型收敛 + thinkingLevel 路由，第1.5轮已完成核心链路 TS 基线收敛。

### 上游已完成

- Evidence 接口已在 `src/types/evidence.ts` 中唯一定义
- EvidenceRef / EvidenceSummary 可用
- CurrentTask 已有 `thinkingLevel?: "fast" | "deep"`
- intention 已输出 thinkingLevel
- routeByIntent 已按 fast/deep 分流
- `npx tsc --noEmit` 已通过第1轮相关文件验证
- 第1.5轮已修复核心链路 TS 基线：stream route / agents index / agent audit logger / stream-bus

### 恢复上下文的方法

```text
1. 执行 session-init SKILL
2. query_audit_logs({ keyword: "EVIDENCE_TYPE_UNIFIED" })
3. query_audit_logs({ keyword: "THINKING_LEVEL_ROUTING" })
4. query_audit_logs({ keyword: "ROUND1_TYPE_CONVERGENCE_COMPLETED" })
5. query_audit_logs({ keyword: "ROUND1_5_CORE_BASELINE_COMPLETED" })
6. 确认第1轮和第1.5轮全部完成
```

### 原子事务目标

覆盖 `co-agent-simplified-v1.md` 的 Step 3。只建立响应策略裁决闭包，不引入 AnalysisContext 或专家注册表。

### 你的 spec 文件

- `.trae/specs/co-agent-response-strategy/spec.md`
- `.trae/specs/co-agent-response-strategy/tasks.md`
- `.trae/specs/co-agent-response-strategy/checklist.md`

### 架构文档

- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统技术架构说明书》.md` — 8.2 节：ResponseStrategy 响应裁决

### 你要改的文件（4 个：2 新建 + 2 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/agents/response-strategy.ts` | 新建 | StrategyDescriptor + StrategyContext + registry + resolveResponseStrategy + 修饰器管道 |
| `src/agents/response-strategy.test.ts` | 新建 | 纯策略单元测试，覆盖匹配、优先级、降级、activeExperts 合并去重 |
| `src/agents/nodes/response.ts` | 修改 | 消费 resolveResponseStrategy 替代硬编码三段分支，activeExperts 固定传空数组 |
| `src/agents/types/structured-output.ts` | 修改 | DisplayContent.sections 联合类型加 evidence_digest / action_steps / timeline |

### 核心设计

```typescript
interface StrategyDescriptor {
  id: string
  matches: (ctx: StrategyContext) => boolean
  priority: number
  apply: ResponseStrategy
}

function resolveResponseStrategy(ctx: StrategyContext): ResponseStrategy
```

注册策略：fast:chat + deep:analysis/planning/decision/question/creation/modification + deep:fallback。共 8 个 descriptor，deep:fallback 即 catch-all 兜底，不额外创建第 9 个 catch-all。

### 关键契约细化

- `src/agents/response-strategy.ts` 必须是响应策略唯一裁决入口，`response.ts` 只构造 StrategyContext 并消费 resolve 结果。
- StrategyDescriptor 必须自声明 `matches`，不允许退回字符串映射表或硬编码 if/else 长链。
- registry 必须包含 fast:chat、deep:analysis、deep:planning、deep:decision、deep:question、deep:creation、deep:modification、deep:fallback。
- fallback descriptor 必须低优先级但永远可匹配，防止未知意图无策略。
- `src/agents/types/structured-output.ts` 只扩展 DisplayContent.sections 联合类型，不改变既有 section 语义；风险 section 继续使用 `"risk"`，不得新增 `"risks"`。
- `activeExperts` 仅作为 StrategyContext 的可选预留输入；第2轮 `response.ts` 必须传 `activeExperts: []`，不得从 conversationContext / ChatThread.metadata / AnalysisContext 推断专家。
- `maxTokens` 本轮作为策略元数据和 promptHint 约束，不得为此重构 LLM wrapper。
- `timeline` 只有在已有结构化时间数据时生成，无数据时不生成且不编造。

### 高风险误区

- 禁止引入 AnalysisContext、专家注册表、activeExperts 持久化或 ChatThread.metadata 读写；这些属于第3轮。
- 禁止从 conversationContext 猜测 activeExperts 结构；第2轮 response.ts 固定传空数组。
- 禁止把策略逻辑继续散落在 `response.ts` 的硬编码三段分支里。
- 禁止删除第1轮 fast/deep 路由结果；第2轮只消费 thinkingLevel，不重写路由。
- 禁止缺少 deep:fallback，未知意图必须可收敛。
- 禁止新增 `src/agents/types.ts`，真实类型文件是 `src/agents/types/structured-output.ts`。
- 禁止新增 `"risks"` section type、LLM wrapper 重构、report generator 或 timeline 编造。

### 恢复上下文审计查询（新 AI Session 首次启动必读）

> **给后续 AI 助手的说明**：以下每个 `query_audit_logs(...)` 都是 MCP 工具调用，AI 助手在自己的对话中**直接复制粘贴这些参数调用工具即可**，不需要写 SQL，这是 MCP 工具暴露的查询接口。共 8 条审计记录可恢复第2轮完整开发上下文。

#### 第一步：搜索代码文件的改动记录（查看 beforeState/afterState）

文件改了什么、改前改后的合约差异，都在这些记录的 `beforeState` 和 `afterState` 字段里：

```text
query_audit_logs({ targetId: "src/agents/response-strategy.ts" })
```
→ 返回1条：STRATEGY_DESCRIPTOR_REGISTRY。beforeState 为空（新建），afterState 包含 StrategyDescriptor 注册表设计、8个descriptor、resolve 流程。

```text
query_audit_logs({ targetId: "src/agents/response-strategy.test.ts" })
```
→ 返回1条：RESPONSE_STRATEGY_TESTS_ADDED。beforeState 为空（新建），afterState 包含测试覆盖范围。

```text
query_audit_logs({ targetId: "src/agents/nodes/response.ts" })
```
→ 返回2条：RESPONSE_STRATEGY_INTEGRATED（2次迭代）。第1次是初次接入 resolveResponseStrategy 替代硬编码三段分支；第2次是收敛 evidence_digest 数据来源。看这两条 beforeState/afterState 对比可以理解 response 节点的演进。

```text
query_audit_logs({ targetId: "src/agents/types/structured-output.ts" })
```
→ 返回1条：DISPLAY_CONTENT_SECTIONS_EXTENDED。beforeState 只含6个 section，afterState 扩展到9个（新增 evidence_digest / action_steps / timeline），保持 risk 协议不变。

#### 第二步：搜索文档变更记录（恢复 spec 和契约决策）

```text
query_audit_logs({ keyword: "DOC_UPDATED" })
```
→ 返回3条 spec 文档更新：spec.md / tasks.md / checklist.md。read 这些文件即可理解第2轮的设计决策和边界约束。

#### 第三步：按行动词搜索（快速定位特定改动）

```text
query_audit_logs({ keyword: "STRATEGY_DESCRIPTOR_REGISTRY" })
```
→ 返回1条：response-strategy.ts 的创建记录。包含完整的 descriptor 注册表设计摘要。

```text
query_audit_logs({ keyword: "RESPONSE_STRATEGY_TESTS_ADDED" })
```
→ 返回1条：response-strategy.test.ts 的创建记录。包含 9 个测试用例的覆盖说明。

```text
query_audit_logs({ keyword: "RESPONSE_STRATEGY_INTEGRATED" })
```
→ 返回2条：response.ts 的两次接入迭代记录。

```text
query_audit_logs({ keyword: "DISPLAY_CONTENT_SECTIONS_EXTENDED" })
```
→ 返回1条：structured-output.ts 的 section 类型扩展记录。

#### 恢复顺序建议

新 AI Session 启动后，按以下顺序恢复上下文最快：

```
1. session-init SKILL（强制前置）
2. query_audit_logs({})                         → 查看最近所有操作
3. query_audit_logs({ keyword: "RESPONSE_STRATEGY" })  → 看第2轮所有记录（应该返回8条）
4. read ".trae/specs/co-agent-response-strategy/spec.md"
5. read ".trae/specs/co-agent-response-strategy/tasks.md"
6. read ".trae/specs/co-agent-response-strategy/checklist.md"
```

步骤3 搜索 `"RESPONSE_STRATEGY"` 可以一次性拉取全部 8 条第2轮审计记录（含代码修改 + 文档更新），是最快的一键恢复方式。

### 验证标准

#### 已完成验证

- 单测 `src/agents/response-strategy.test.ts` 覆盖 fast/deep/fallback/priority/evidence_digest 降级/activeExperts 合并去重，9 个测试已通过。
- 本轮目标文件 lint 已通过：`response-strategy.ts` / `response-strategy.test.ts` / `response.ts` / `structured-output.ts`。
- `npx tsc --noEmit` 全局仍有历史基线错误，但过滤本轮目标文件无 TypeScript 错误。
- checklist.md 全部由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）
- tasks.md 全部 Task 子项由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）

#### 未执行的端到端对话验证（必须保留给后续复测）

以下对应 `.trae/specs/co-agent-response-strategy/checklist.md#L37-L41`，第2轮代码实现时未启动服务跑真实聊天端到端验证，因此不得视为已完成：

- “你好” → sections 仅 conclusion，promptHint 含“1-2句话”
- “邗江区种水稻分析” → sections 含 conclusion + evidence + reasoning + confidence + risk
- “制定下月种植计划” → sections 含 action_steps + timeline（仅当已有结构化时间数据），不含 evidence_digest，不编造 timeline
- “水稻育秧步骤” → sections 含 evidence_digest，不含 reasoning
- 未定义意图 → 回退到 deep:fallback（priority=1）

### 完成后记录 ADD-7 审计

代码实施阶段已完成记录（可通过 `query_audit_logs({ keyword: "RESPONSE_STRATEGY" })` 一键拉取全部8条）：

- `STRATEGY_DESCRIPTOR_REGISTRY` — src/agents/response-strategy.ts 新建
- `RESPONSE_STRATEGY_TESTS_ADDED` — src/agents/response-strategy.test.ts 新建
- `RESPONSE_STRATEGY_INTEGRATED` — src/agents/nodes/response.ts 修改（2次迭代）
- `DISPLAY_CONTENT_SECTIONS_EXTENDED` — src/agents/types/structured-output.ts 修改
- `DOC_UPDATED` × 3 — spec.md / tasks.md / checklist.md 文档同步
- `DOC_UPDATED` × 1 — 本 handoff 审计查询指南追加

> 后续 Session 恢复上下文请使用上文「恢复上下文审计查询」章节中的查询语句。

---

## <第3轮> 领域上下文闭包 — 分析专家注册表 + AnalysisContext

### 你当前的位置

你是第 3 轮。上游第1轮完成类型基础，第2轮完成响应裁决闭包。本轮只建立专家和上下文基础设施，不消费专家能力。

### 上游已完成

- EvidenceRef / EvidenceSummary 可用
- CurrentTask.thinkingLevel 可用
- `src/agents/response-strategy.ts` 存在
- `src/agents/nodes/response.ts` 已消费策略裁决
- DisplayContent.sections 已支持 evidence_digest / action_steps / timeline

### 恢复上下文审计查询（新 AI Session 首次启动必读）

> **给后续 AI 助手的说明**：以下每个 `query_audit_logs(...)` 都是 MCP 工具调用，AI 助手在自己的对话中**直接复制粘贴这些参数调用工具即可**，不需要写 SQL，这是 MCP 工具暴露的查询接口。共 4 条代码修改记录 + 4 条文档/汇总记录可恢复第3轮完整开发上下文。

#### 第一步：搜索代码文件的改动记录（查看 beforeState/afterState）

文件改了什么、改前改后的合约差异，都在这些记录的 `beforeState` 和 `afterState` 字段里：

```text
query_audit_logs({ targetId: "src/agents/experts/registry.ts" })
```
→ 返回1条：`EXPERT_REGISTRY_CREATED`。beforeState 为空（新建），afterState 包含 AnalysisExpert 接口设计、3个专家配置（crop_compare / roi_analysis / pest_risk）、reportFormats 字段。

```text
query_audit_logs({ targetId: "src/services/analysis-context.ts" })
```
→ 返回1条：`ANALYSIS_CONTEXT_CREATED`。beforeState 为空（新建），afterState 包含 AnalysisContext 类型设计、AnalysisTurnRecord 结构、6 个 CRUD 函数签名。

```text
query_audit_logs({ targetId: "src/agents/state.ts" })
```
→ 返回多条：第1轮 `EVIDENCE_TYPE_UNIFIED` + `THINKING_LEVEL_ASSIGNED`、第3轮 `AGENT_STATE_ANALYSIS_CONTEXT_ADDED`。第3轮记录 afterState 含 analysisContext 字段定义和 conversationContext 职责边界说明。

```text
query_audit_logs({ targetId: "src/app/api/agent/chat/stream/route.ts" })
```
→ 返回多条：第1.5轮 `CORE_STREAM_ROUTE_JSON_FIXED`、stream-bus 改造记录、第3轮 `STREAM_ROUTE_ANALYSIS_CONTEXT_LOADED`。第3轮记录 afterState 含 analysisContext 加载/保存逻辑，beforeState 说明本轮不改已有 SS E/stream-bus/auditData 逻辑。

#### 第二步：搜索文档变更记录（恢复 spec 和契约决策）

```text
query_audit_logs({ keyword: "DOC_UPDATED" })
```
→ 返回 3+ 条 spec 文档更新：spec.md / tasks.md / checklist.md。read 这些文件即可理解第3轮的设计决策、边界约束、metadata 共存策略和 risks→risk 修正。

#### 第三步：按行动词搜索（快速定位特定改动）

```text
query_audit_logs({ keyword: "EXPERT_REGISTRY_CREATED" })
```
→ 返回1条：registry.ts 新建。包含完整的 AnalysisExpert 接口和 3 个专家配置摘要。

```text
query_audit_logs({ keyword: "ANALYSIS_CONTEXT_CREATED" })
```
→ 返回1条：analysis-context.ts 新建。包含 AnalysisContext 类型和 CRUD 设计摘要。

```text
query_audit_logs({ keyword: "AGENT_STATE_ANALYSIS_CONTEXT_ADDED" })
```
→ 返回1条：state.ts 递进修改。afterState 含 analysisContext 字段定义，保留第1轮 Evidence/thinkingLevel 变更。

```text
query_audit_logs({ keyword: "STREAM_ROUTE_ANALYSIS_CONTEXT_LOADED" })
```
→ 返回1条：route.ts 递进修改。afterState 含 analysisContext 加载/保存逻辑，保留已有 stream-bus/auditData 路径。

#### 恢复顺序建议

新 AI Session 启动后，按以下顺序恢复上下文最快：

```
1. session-init SKILL（强制前置）
2. query_audit_logs({})                                    → 查看最近所有操作
3. query_audit_logs({ keyword: "ROUND3_EXPERT" })           → 看第3轮所有记录（应该返回 8 条）
4. read ".trae/specs/co-agent-expert-registry/spec.md"
5. read ".trae/specs/co-agent-expert-registry/tasks.md"
6. read ".trae/specs/co-agent-expert-registry/checklist.md"
```

步骤3 搜索 `"ROUND3_EXPERT"` 可以一次性拉取全部 8 条第3轮审计记录（含代码修改 + 文档更新 + 汇总），是最快的一键恢复方式。

### 原子事务目标

覆盖 `co-agent-simplified-v1.md` 的 Step 4.2 + Step 4.3 + Step 4.4，建立分析专家注册表和跨轮 AnalysisContext 持久化机制。

### 你的 spec 文件

- `.trae/specs/co-agent-expert-registry/spec.md`
- `.trae/specs/co-agent-expert-registry/tasks.md`
- `.trae/specs/co-agent-expert-registry/checklist.md`

### 架构文档

- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统技术架构说明书》.md` — 8.3 节：分析专家注册表 + 跨轮 AnalysisContext
- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统决策管线架构说明书》.md` — thinkingLevel 路由拓扑图 + analysisContext 状态字段

### 你要改的文件（4 个：2 新建 + 2 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/agents/experts/registry.ts` | 新建 | AnalysisExpert 接口 + ANALYSIS_EXPERTS（3 个专家含 reportFormats） |
| `src/services/analysis-context.ts` | 新建 | AnalysisContext + AnalysisTurnRecord + CRUD（读写 ChatThread.metadata） |
| `src/agents/state.ts` | 修改 | AgentState 加 analysisContext |
| `src/app/api/agent/chat/stream/route.ts` | 修改 | 请求前加载 analysisContext，请求后保存 |

> **实现中新增修改项**（执行 AI 发现 streamAgent 需要分析上下文人参，此为合理扩展，非越界）：
>
> | 文件 | 操作 | 说明 |
> |------|------|------|
> | `src/agents/index.ts` | 修改 | `streamAgent` 入参新增 `analysisContext` 字段，从 route.ts 传入供管线节点消费 |
>
> 新增原因：`analysisContext` 需要在 `AgentState` 中从 `stream/route.ts` → `streamAgent` → 各节点传递，`index.ts` 是必经入口。

### 关键契约细化

- 本轮只建立专家注册表与 AnalysisContext 持久化，不消费专家能力。
- `AnalysisContext` 必须写入现有 `ChatThread.metadata`，禁止修改 Prisma Schema。
- `activateExpert` 必须对 expertId 去重。
- `AnalysisExpert` 至少包含 inputSchema、outputSections、promptTemplate、evidenceFilter、reportFormats。
- `outputSections` 中的 section type 必须使用 DisplayContent 协议的单数形式 `"risk"`（非 `"risks"`），与第2轮 ResponseStrategy.sections 保持一致。
- `saveAnalysisContext` 必须浅合并到现有 `ChatThread.metadata`（`{ ...existingMetadata, analysisContext }`），保留已有的 auditData 字段不覆盖。
- `activateExpert` 无效 expertId 时静默忽略 + `console.warn`，不抛异常。
- `stream/route.ts` 只负责请求前加载和请求后保存 AnalysisContext，不在本轮改 retrieval/reasoning/response 消费逻辑。

### 高风险误区

- 禁止在第3轮修改 retrieval/reasoning/response 以消费专家；那属于第4轮。
- 禁止新建数据库模型或字段。
- 禁止把 AnalysisContext 存在内存 Map 中作为唯一来源；必须可跨轮持久化。
- 禁止让 activeExperts 重复累积同一 expertId。
- 禁止因父 Plan 中"功能范围精简"表述而降低代码实现质量。

### ADD-7 恢复关键词

> 已移至上方「恢复上下文审计查询」章节，此处保留摘要供快速索引：
>
> 一键汇总: `query_audit_logs({ keyword: "ROUND3_EXPERT" })` → 应返回 8 条
> 逐个: `EXPERT_REGISTRY_CREATED` / `ANALYSIS_CONTEXT_CREATED` / `AGENT_STATE_ANALYSIS_CONTEXT_ADDED` / `STREAM_ROUTE_ANALYSIS_CONTEXT_LOADED` / `DOC_UPDATED` × 3 / `ROUND3_EXPERT_CONTEXT_COMPLETED`

### 验证标准

#### ✅ 已完成验证（2026-05-25）

- `npx tsc --noEmit` 通过（新增代码零类型错误）
- ANALYSIS_EXPERTS 含 3 个专家，每个有 inputSchema/outputSections/promptTemplate/evidenceFilter/reportFormats
- getAnalysisContext(threadId) 新建 thread 返回默认空上下文（createDefaultContext）
- saveAnalysisContext 写入 ChatThread.metadata 成功（浅合并 JSON.parse/JSON.stringify，保留已有 auditData）
- activateExpert 对同一 expertId 去重，无效 expertId 静默忽略 + console.warn
- 第1轮激活2专家 → 第2轮加载后 activeExperts 保持 2 个
- checklist.md 21 项全部由 `[ ]` 更新为 `[x]`，每项附带代码行号证据
- tasks.md 6 个 Task（0-5）全部由 `[ ]` 更新为 `[x]`，每项附带代码行号证据
- 架构文档闭环完成：技术架构说明书 8.3 节 + 决策管线说明书与实现一致

#### 未执行的端到端对话验证（保留给运行时复测）

- 发送消息后 ChatThread.metadata 含 analysisContext 数据
- stream/route.ts 修改后 SSE token 流式输出、stream-bus 事件推送、auditData 写入均正常
- 跨轮对话中 activeExperts 保持激活状态

### 完成后记录 ADD-7 审计（✅ 全部已落库 2026-05-25 09:00:13~09:00:30 UTC）

可通过 `query_audit_logs({ keyword: "ROUND3_EXPERT" })` 一键拉取汇总，或按 action 逐个查询：

| 文件 | action | 状态 |
|------|--------|:--:|
| `src/agents/experts/registry.ts` | `EXPERT_REGISTRY_CREATED` | ✅ |
| `src/services/analysis-context.ts` | `ANALYSIS_CONTEXT_CREATED` | ✅ |
| `src/agents/state.ts` | `AGENT_STATE_ANALYSIS_CONTEXT_ADDED` | ✅ |
| `src/agents/index.ts` | `AGENT_INDEX_ANALYSIS_CONTEXT_ADDED` | ✅ |
| `src/app/api/agent/chat/stream/route.ts` | `STREAM_ROUTE_ANALYSIS_CONTEXT_LOADED` | ✅ |
| 汇总 | `ROUND3_EXPERT_CONTEXT_COMPLETED` | ✅ |

> 实际审计落库 6 条（5 文件级 + 1 汇总）。spec/tasks/checklist 的 DOC_UPDATED 已在 review 阶段（实施前）完成，本轮代码实施阶段无需重复记录。

---

## <第4轮> 领域消费闭包 — 管线消费 + 报告服务

### 你当前的位置

你是第 4 轮。上游第1-3轮已完成类型基础、响应裁决、专家注册表和 AnalysisContext。本轮把专家能力接入实际 Agent 管线，并提供报告生成与下载。

### 上游已完成

- `src/agents/response-strategy.ts` 可用
- `ANALYSIS_EXPERTS` 可用
- `AnalysisContext` CRUD 可用
- AgentState 已有 analysisContext
- stream/route.ts 已有 analysisContext 加载/保存逻辑

### 恢复上下文的方法

```text
1. 执行 session-init SKILL
2. query_audit_logs({ keyword: "EXPERT_REGISTRY_CREATED" })
3. query_audit_logs({ keyword: "ANALYSIS_CONTEXT_CREATED" })
4. 确认第1-3轮全部完成
```

### 原子事务目标

覆盖 `co-agent-simplified-v1.md` 的 Step 4.5 + Step 4.6 + Step 4.8。让 activeExperts 被 retrieval / reasoning / response / report 服务实际消费。

### 你的 spec 文件

- `.trae/specs/co-agent-pipeline-integration/spec.md`
- `.trae/specs/co-agent-pipeline-integration/tasks.md`
- `.trae/specs/co-agent-pipeline-integration/checklist.md`

### 架构文档

- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统技术架构说明书》.md` — 8.4 节：分析专家管线消费（retrieval/reasoning/response）+ 报告生成服务
- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统决策管线架构说明书》.md` — 专家管线消费数据流 + 报告 API 拓扑

### 你要改的文件（7 个：3 新建 + 4 修改）~~（6 个：2 新建 + 4 修改）~~ **[2026-06-03 修订: 新增 filter-types.ts]**

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/agents/experts/filter-types.ts` | 新建 | ChromaWhereExpression 受限类型定义 **[2026-06-03 ADDED: 方案 C]** |
| `src/agents/nodes/retrieval.ts` | 修改 | 合并 activeExperts 的 evidenceFilter → ChromaDB 检索条件（~~Record<string, unknown>~~ → ChromaWhereExpression） **[2026-06-03 修订]** |
| `src/agents/nodes/reasoning.ts` | 修改 | 从 ANALYSIS_EXPERTS 取各专家 promptTemplate + 注入 runtimeInputs |
| `src/agents/nodes/response.ts` | 修改 | 合并 activeExperts 的 outputSections → 传修饰器管道 |
| `src/services/report-generator.ts` | 新建 | generateReport + 4 格式生成器 + inferDefaultFormat + learnFormatPreference 钩子 |
| `src/app/api/agent/chat/threads/[threadId]/messages/[messageId]/report/route.ts` | 新建 | 多格式报告下载 API |
| `package.json` | 修改 | 加依赖：docx / exceljs / pdfmake |

### 管线消费逻辑

```text
retrieval:  activeExperts 非空 → 合并 evidenceFilter → ChromaDB 按来源过滤
            空 → 行为不变

reasoning:  activeExperts 非空 → 追加 [分析上下文] 块 → 各专家独立维度
            空 → 行为不变

response:   activeExperts 非空 → 合并 outputSections 并集去重 → 传修饰器管道
            空 → ResponseStrategy 自行裁决
```

### 报告 API

```text
GET /api/agent/chat/threads/{threadId}/messages/{messageId}/report?format=md|pdf|docx|xlsx

不指定 format：
  仅 roi_analysis → xlsx
  仅 crop_compare/pest_risk → md
  混合 → pdf
```

### 关键契约细化

- 本轮首次消费 activeExperts，必须同时覆盖 retrieval / reasoning / response / report 服务。
- retrieval 在 activeExperts 为空时行为必须与第1轮 deep 管线一致。
- reasoning 只追加专家上下文块，不覆盖原核心推理 prompt。
- response 合并专家 outputSections 时必须并集去重，并继续尊重第2轮 ResponseStrategy。
- report-generator 必须真实生成 md/pdf/docx/xlsx，不允许留下空 hook。
- 依赖变更必须记录 DEPENDENCY_ADDED，并确认 package.json 与 lock 文件一致。

### 高风险误区

- 禁止绕过 ResponseStrategy 直接在 response.ts 写专家分支。
- 禁止在 activeExperts 为空时改变原管线行为。
- 禁止报告 API 返回固定 mock 内容。
- 禁止依赖新增后不运行安装/类型验证。
- 禁止把第5轮语义缓存提前接入。

**[2026-06-03 修订: 记录已知核心风险]**

### 核心风险点

| 风险 | 当前状态 | 影响范围 | 触发条件 | 缓解建议 |
|------|---------|---------|---------|---------|
| 多专家异字段过滤合并 | `mergeExpertEvidenceFilters` 按同字段 `$in` 取并集，异字段隐式为 AND | 第5-7轮（15+ 专家，filter 字段多样化） | 两个专家使用不同 filter 字段（如 `cateId` vs `tags`） | 改合并逻辑为 `$or` 包装：`{ $or: [ expert1_filter, expert2_filter, ... ] }`。ChromaDB 原生支持 `$or`，零额外依赖。 |

详细分析：当前 3 个专家的 `evidenceFilter` 都只使用 `cateId` 字段，`$in` 取并集是正确的。但当专家扩展到 15+（第5-7轮），不同专家可能按不同 metadata 维度过滤（一个按分类 `cateId`，一个按标签 `tags`，一个按时间范围），此时同字段 AND 语义会过窄（要求文档同时满足所有专家的过滤条件），需要改为 `$or` 包装语义（任一专家匹配即可）。这是 Review 文档 `farm-agent-round4-spec-review-v2.md` 第 9 节已论证的已知问题，第4轮不做变更。

### ADD-7 恢复关键词

```text
query_audit_logs({ keyword: "PIPELINE_EXPERT_CONSUME" })
query_audit_logs({ keyword: "REPORT_GENERATOR_CREATED" })
query_audit_logs({ keyword: "REPORT_DOWNLOAD_API" })
query_audit_logs({ keyword: "DEPENDENCY_ADDED" })
```

### 验证标准

- 激活 roi_analysis → retrieval 仅检索“市场行情”+“经济数据”文档
- 激活 crop_compare+roi_analysis → reasoning prompt 含两专家独立维度块
- 多专家激活 → DisplayContent.sections 含各专家对应 type
- GET /report?format=md → 返回 Markdown
- GET /report?format=xlsx → 返回 Excel（3 Sheet）
- 不指定 format 仅 roi 激活 → 默认 xlsx
- 混合专家不指定 format → 默认 pdf
- `npx tsc --noEmit` + 依赖 install 成功
- checklist.md 全部由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）
- tasks.md 全部 Task 子项由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）

### 完成后记录 ADD-7 审计

- `PIPELINE_EXPERT_CONSUME`
- `REPORT_GENERATOR_CREATED`
- `REPORT_DOWNLOAD_API`
- `DEPENDENCY_ADDED`

---

## <第5轮> 语义缓存闭包 — LRU + TTL + kbGeneration

### 你当前的位置

你是第 5 轮。上游第1-4轮已完成类型基础、响应裁决、领域上下文、专家管线消费和报告服务。本轮只完成缓存基础机制，不实现完整演化闭环。

### 上游已完成

- 完整 deep 管线可用
- activeExperts 已被 retrieval/reasoning/response 消费
- report-generator 与 report API 已存在
- stream/route.ts 已承载 AnalysisContext 加载与保存

### 恢复上下文的方法

```text
1. 执行 session-init SKILL
2. query_audit_logs({ keyword: "PIPELINE_EXPERT_CONSUME" })
3. query_audit_logs({ keyword: "REPORT_GENERATOR_CREATED" })
4. 确认第1-4轮全部完成
```

### 原子事务目标

覆盖 `co-agent-simplified-v1.md` 的 Step 5。实现 SimpleSemanticCache、cache key、TTL、LRU、kbGeneration 淘汰和 cache_hit SSE 模拟流式。

### 你的 spec 文件

- `.trae/specs/co-agent-semantic-cache/spec.md`
- `.trae/specs/co-agent-semantic-cache/tasks.md`
- `.trae/specs/co-agent-semantic-cache/checklist.md`

### 架构文档

- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统技术架构说明书》.md` — 8.5 节：语义缓存层（LRU + TTL + kbGeneration）
- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统决策管线架构说明书》.md` — 缓存命中/穿透数据流 + cache_hit SSE 流式

### 你要改的文件（3 个：1 新建 + 2 修改）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/services/semantic-cache.ts` | 新建 | SimpleSemanticCache + buildCacheKey + bumpKbGeneration + CACHE_TTL |
| `src/app/api/agent/chat/stream/route.ts` | 修改 | 缓存查询/存储 + 命中模拟流式 |
| `src/services/knowledge-indexer.ts` | 修改 | 索引完成后 bumpKbGeneration() |

### 缓存核心设计

```text
淘汰三层：
  ① kbGeneration 不匹配 → 惰性淘汰
  ② 超过 CACHE_TTL[intent] 秒 → 过期
  ③ 超出 MAX_CACHE_SIZE(200) → LRU 最旧

命中时模拟流式：
  cache_hit 事件 → chunkSize=3 分片 → structured_output
```

### 原子边界要求

~~缓存 key 至少包含：normalizedQuery + intent + sorted(activeExperts) + kbGeneration。~~ → **[2026-06-03 修订: review 后 kbGeneration 改放入 CacheEntry 作为出生版本号，在 get() 中惰性淘汰]**

缓存 key 是三元组：normalizedQuery + intent + sorted(activeExperts)。kbGeneration 不是 key 成员，而是 CacheEntry 出生版本号字段，get() 时通过 entry 字段比对执行 Layer 1 淘汰。

本轮可以暴露后续演化需要消费的 TTL 数据结构，但不能留下空 hook；所有导出的接口必须在本轮有真实行为。

### 关键契约细化

- SimpleSemanticCache 必须具备真实 get/set/evict 行为，不允许只定义接口。
- ~~cache key 至少包含 normalizedQuery、intent、sorted(activeExperts)、kbGeneration。~~ → **[2026-06-03 修订]** cache key 是三元组（normalizedQuery + intent + sorted(activeExperts)），kbGeneration 作为 CacheEntry 出生版本号在 get() 中惰性淘汰。
- 淘汰顺序必须覆盖 kbGeneration 不匹配、TTL 过期、LRU 超容量。
- cache_hit 必须模拟流式输出，不得直接一次性返回破坏 SSE 体验。
- knowledge-indexer 完成索引后必须 bumpKbGeneration，使知识库更新能失效旧缓存。

### stream/route.ts 插入点（第5轮交付物事实）

**[2026-06-03]** 第5轮在 `stream/route.ts` 中新增了以下插入点，后续轮次修改该文件时需注意绕开：

1. for-await 循环内 intention chunk 之后 — 缓存查询（deep 通道，HIT 时 `break` + 模拟流式 + 持久化 + `done` + `controller.close()` + `return`）
2. responseOutput 处理之后、done 事件之前 — fire-and-forget `cache.set()`（`Promise.resolve().then()` 包裹，try-catch 不抛异常）
3. 缓存命中时会提前 `return`，后续代码不会执行
4. 建议：
  - 第6轮插入点：
    1. responseOutput 处理后 → turnHistory 采集 + TTL 自适应
      在 cache.set() 之后、done 事件之前
### 高风险误区

- 禁止把 EvolutionLoop 的 TTL 自适应完整实现提前塞入第5轮；第5轮只做缓存基础机制。
- 禁止 cache key 忽略 activeExperts，否则专家上下文会串答案。
- ~~禁止 cache key 忽略 kbGeneration，否则知识库更新后仍命中旧答案。~~ → **[2026-06-03 修订]** 禁止 CacheEntry 不记录 kbGeneration（出生版本号），否则知识库更新后旧缓存无法惰性淘汰。淘汰依赖 get() 中的 entry 字段比对，不依赖 key。
- 禁止 cache_hit 跳过 ~~structured_output~~ → **[2026-06-03 修订]** `done` 事件中的 displayContent 数据（与正常流式的 done 事件结构一致）。

### ADD-7 恢复关键词

```text
query_audit_logs({ keyword: "SEMANTIC_CACHE_CREATED" })
query_audit_logs({ targetId: "src/services/semantic-cache.ts" })
query_audit_logs({ targetId: "src/app/api/agent/chat/stream/route.ts" })
query_audit_logs({ targetId: "src/services/knowledge-indexer.ts" })
```

### 验证标准

- 同问题两次 → 第2次 cache_hit，SSE 首事件 cache_hit
- 超 TTL 后重发 → 走完整管线
- 上传文档后重发 → kbGeneration 不匹配 → 走完整管线
- 缓存命中 token 分片推送，0.5-1.5s
- `npx tsc --noEmit` 通过
- checklist.md 全部由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）
- tasks.md 全部 Task 子项由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）


### 完成后记录 ADD-7 审计（✅ 全部已落库 2026-06-03 06:31 UTC）

| action | targetType | targetId | 说明 |
|--------|-----------|----------|------|
| `SEMANTIC_CACHE_CREATED` | COMPONENT | `src/services/semantic-cache.ts` | 新建语义缓存模块 |
| `STREAM_CACHE_INTEGRATED` | API_ROUTE | `src/app/api/agent/chat/stream/route.ts` | stream/route.ts 集成缓存 |
| `KB_INDEXER_BUMP_GENERATION` | COMPONENT | `src/services/knowledge-indexer.ts` | 索引完成后 bumpKbGeneration |

可通过 `query_audit_logs({ keyword: "SEMANTIC_CACHE" })` 一键拉取汇总，或按 action 逐个查询：

```text
query_audit_logs({ keyword: "SEMANTIC_CACHE_CREATED" })
query_audit_logs({ keyword: "STREAM_CACHE_INTEGRATED" })
query_audit_logs({ keyword: "KB_INDEXER_BUMP_GENERATION" })
```

---

## <第6轮> 演化闭环闭包 — 路径质量 + TTL 自适应 + turnHistory

### 你当前的位置

你是第 6 轮。上游第1-5轮已完成完整业务管线和语义缓存基础机制。本轮消费已有缓存和上下文数据，建立演化闭环。

### 上游已完成

- SimpleSemanticCache 可用
- buildCacheKey / CACHE_TTL / kbGeneration 可用
- stream/route.ts 已接入缓存 get/set
- knowledge-indexer 已接入 bumpKbGeneration
- AnalysisContext 可读写 ChatThread.metadata
- ResponseStrategy 可裁决回复策略

### 恢复上下文的方法

```text
1. 执行 session-init SKILL
2. query_audit_logs({ keyword: "SEMANTIC_CACHE_CREATED" })
3. query_audit_logs({ keyword: "PIPELINE_EXPERT_CONSUME" })
4. 确认第1-5轮全部完成
```

### 原子事务目标

覆盖 `co-agent-simplified-v1.md` 的 Step 7。实现路径质量检测、TTL 统计、自适应策略、turnHistory 采集和 ResponseStrategy 调整信号。

### 你的 spec 文件

- `.trae/specs/co-agent-evolution-loop/spec.md`
- `.trae/specs/co-agent-evolution-loop/tasks.md`
- `.trae/specs/co-agent-evolution-loop/checklist.md`

### 架构文档

- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统技术架构说明书》.md` — 8.6 节：演化闭环（路径质量 + TTL 自适应 + turnHistory）
- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统决策管线架构说明书》.md` — 演化回路数据流 + ResponseStrategy 调整信号

### 你要改的文件（5 个：2 新建 + 3 修改）

| 文件 | 操作 | 改什么 | 状态 |
|------|------|--------|:--:|
| `src/services/path-metrics.ts` | 新建 | MetricDescriptor 注册表（4 检测器）+ MetricContribution 自包含贡献 + assessExecutionQuality（收集+排序+合并）+ buildMetricBaselines | ✅ |
| `src/services/cache-ttl-stats.ts` | 新建 | TtlStats（含 lastAdjustedAt）+ recordCacheHit/Miss/Expiry + adaptCacheTtl（±20%）+ loadStats（4 边界区分）+ persistStats | ✅ |
| `src/agents/response-strategy.ts` | 修改 | StrategyContext +turnHistory/+baselines；resolveResponseStrategy 同步调 assessExecutionQuality + try-catch 降级 | ✅ |
| `src/services/analysis-context.ts` | 修改 | appendTurnRecord 已在第3轮实现；本轮在 stream/route.ts 接入调用点 | ✅（无代码改动） |
| `src/app/api/agent/chat/stream/route.ts` | 修改 | ~~捕获 intent/thinkingLevel/verdictConfidence/evidenceCount~~ → [2026-06-03 修订] 捕获 intent/thinkingLevel/verdictConfidence/evidenceCount/strategyDescriptorId → turnHistory 采集（appendTurnRecord）→ getAdaptedTtl 替代硬编码 CIT → adaptCacheTtl 调用 → finally 块 clearAuditContext | ✅ |

> **[2026-06-03 修订]** 5 个文件全部交付完成。~~原计划 `analysis-context.ts` 需要进一步完善 appendTurnRecord~~ → 第3轮已实现完整签名，本轮仅需在 stream/route.ts 接入调用点（代码未改但功能闭合）。~~回路二 `report-generator.ts` 本不在本轮文件清单中~~ → 见下方"回路二归属说明"。

### 回路二归属说明

回路二（下载格式偏好学习）涉及 `src/services/report-generator.ts` 的 `learnFormatPreference()` 和 `ChatThread.metadata.downloadHistory`，但本轮文件清单只有 5 个文件（2新建+3修改），未含 `report-generator.ts`。

**决策**：回路二推迟到后续轮次或独立 spec 处理。本轮只完成回路一（TTL 自主学习）和回路三（4 维度复合裁决）。详见 [spec-review 第4节](file:///home/xmm/ai/farm-agent/.trae/reviews/farm-agent-多轮对话能力专家链路优化统一状态管理-round6-演化闭环闭包-spec-review-v1.md#L82-90)。

### Step 0.6 架构文档偏差修正记录

验收后回看架构文档（ADD-0.1 第6步），发现 3 处偏差，均已修正：

| 编号 | 偏差位置 | 文档描述 | 实际实现 | 修正方式 |
|:--:|------|------|------|------|
| 偏差1 | 架构文档 8.6.5 L1576 | 描述为 `assessExecutionQuality()` 异步 `.then()` 模式 | `resolveResponseStrategy` 中同步调用 + try-catch 降级 | **[2026-06-03]** 文档修正为同步 + try-catch 描述 |
| 偏差2 | 架构文档 8.6.4 MetricDescriptor | 旧版 action 类型（`StrategyAdjustment`），detect 只返回布尔值 | `detect()` 返回完整 `MetricContribution`，含 action/description/promptFragment/threshold/current | **[2026-06-03]** 文档补充编程时与运行时耦合说明，增量更新 |
| 偏差3 | 架构文档 8.6.5 示例代码 | 仅有 `promptSupplement` 处理，缺少 `dominantAction` 分支 | `response-strategy.ts` L132-135 有 `dominantAction === "relax_evidence_filter"` 分支 | **[2026-06-03]** 文档补充 relax_evidence_filter 分支逻辑 |

> 所有偏差已由开发者确认修正方向为"修正文档以匹配代码"。

### 演化回路核心设计

```text
回路一：缓存过期 → LLM重跑 → 对比旧结论 → 相同±5% → TTL↑20%
回路二：同场景下载≥5次 + 最高频>60% → inferDefaultFormat 被偏好覆盖
回路三：4 维度复合裁决
  ├─ 置信度轨迹（线性回归β < -3）→ augment_prompt
  ├─ 证据覆盖率（3轮递减+低均值）→ relax_evidence_filter
  ├─ 追问率（≥40%）→ activate_expert
  └─ 置信度波动率（σ > 15%）→ augment_prompt
```

### 关键契约细化

- 本轮消费第5轮缓存基础机制，建立路径质量、TTL 自适应和 turnHistory 的闭环。
- path-metrics 必须用 MetricDescriptor 注册表，检测器可组合、可扩展。
- cache-ttl-stats 必须真实记录命中/过期/结论稳定性，并由 adaptCacheTtl 产出可解释调整。
- appendTurnRecord 必须采集每轮关键上下文，不得只定义空函数。
- ResponseStrategy 只能消费质量信号调整 promptHint/策略信号，不能破坏第2轮 descriptor 架构。

### 高风险误区

- 禁止把第7轮三层审计提前塞入第6轮。
- 禁止 TTL 自适应只改常量而不记录统计依据。
- 禁止 turnHistory 只保存在内存，必须落入 AnalysisContext/metadata 链路。
- 禁止路径质量检测失败时中断主聊天流程；应降级并保留审计/诊断信息。

~~### ADD-7 恢复关键词~~ → ### 恢复上下文审计查询 [2026-06-03 修订: 升级为完整恢复审计查询，含分步组织和预期命中数]

~~```text
query_audit_logs({ keyword: "PATH_METRICS_CREATED" })
query_audit_logs({ keyword: "CACHE_TTL_STATS_CREATED" })
query_audit_logs({ keyword: "EVOLUTION_LOOP_INTEGRATED" })
query_audit_logs({ targetId: "src/services/path-metrics.ts" })
query_audit_logs({ targetId: "src/services/cache-ttl-stats.ts" })
```~~ → [2026-06-03 修订: 升级为分步组织的完整恢复审计查询]

**第一步 — 按 targetId 搜代码文件**：
```text
query_audit_logs({ targetId: "src/services/path-metrics.ts" })        → PATH_METRICS_CREATED
query_audit_logs({ targetId: "src/services/cache-ttl-stats.ts" })     → CACHE_TTL_STATS_CREATED
query_audit_logs({ targetId: "src/agents/response-strategy.ts" })     → EVOLUTION_LOOP_INTEGRATED（策略集成）
query_audit_logs({ targetId: "src/app/api/agent/chat/stream/route.ts" }) → EVOLUTION_LOOP_INTEGRATED（管线接入）
```

**第二步 — 搜文档变更（DOC_UPDATED）**：
```text
query_audit_logs({ targetType: "DOC", keyword: "8.6" })             → 架构文档 8.6 节 4 次 DOC_UPDATED
query_audit_logs({ targetType: "DOC", keyword: "演化闭环" })         → 架构文档演化闭环相关更新
query_audit_logs({ targetType: "DOC", action: "DOC_POST_IMPLEMENTATION_REVIEW" }) → Step 0.6 偏差修正记录
```

**第三步 — 按 action 关键词快速定位**：
```text
query_audit_logs({ keyword: "PATH_METRICS" })          → 预期 1 条（PATH_METRICS_CREATED）
query_audit_logs({ keyword: "CACHE_TTL_STATS" })       → 预期 1 条（CACHE_TTL_STATS_CREATED）
query_audit_logs({ keyword: "EVOLUTION_LOOP" })        → 预期 2 条（response-strategy + stream/route）
query_audit_logs({ keyword: "DOC_POST_IMPLEMENTATION" }) → 预期 3 条（偏差1/2/3 修正）
```

**一键汇总**：
```text
query_audit_logs({ keyword: "EVOLUTION_LOOP" })
→ 返回全部 8 条本轮 ADD-7 审计记录
```

**恢复顺序建议**（新 AI Session）：
1. `session-init` SKILL → `query_audit_logs({})`
2. `query_audit_logs({ keyword: "EVOLUTION_LOOP" })` → 确认第6轮已完成
3. 若命中 < 3 条 → 可能第6轮未完成，回退到第5轮 handoff
4. Read `.trae/specs/co-agent-evolution-loop/spec.md` + `tasks.md` + `checklist.md`
5. Read 架构文档 8.6 节确认最终合约

### 验证标准

- 每轮后 turnHistory 长度 = 总轮数
~~→~~ [2026-06-03 已验证] stream/route.ts L392-410：每轮响应完成后采集 turn/intent/thinkingLevel/strategyDescriptorId/activeExpertIds/verdictConfidence/evidenceCount → `appendTurnRecord()` 追加，turnHistory 自增。`appendTurnRecord` 函数签名已支持全部字段（analysis-context.ts L157-168）。

- 同场景 3 次过期结论相同 → TTL 上调 20%
~~→~~ [2026-06-03 已验证] cache-ttl-stats.ts L126-147：`adaptCacheTtl()` 检查 `expiredCount >= MIN_EXPIRY_EVENTS(3)`，若 `reconfirmedCount/(reconfirmedCount+divergedCount) >= 0.95` → `TTL * TTL_ADJUST_FACTOR_UP(1.2)`，不超过 `maxTtl = defaultTtl * MAX_TTL_MULTIPLIER(10)`。

- 连续 5 轮置信度下降 → promptHint 追加"信息缺口"
~~→~~ [2026-06-03 已验证] path-metrics.ts confidence_trajectory 检测器：`linearRegression()` 计算 β 斜率，β < -3 → `promptFragment = "信息可能存在缺口..."`，`requiresExpertSuggestion = true`。由 `assessExecutionQuality` 收集后合并到 `adjustment.promptSupplement`，`resolveResponseStrategy` 拼接到 `baseStrategy.promptHint`（response-strategy.ts L126-130）。

- 删除 metadata → 系统回退初始常量
~~→~~ [2026-06-03 已验证] cache-ttl-stats.ts `loadStats()` 4 边界区分：ENOENT → 静默使用 DEFAULT_TTL；EACCES/JSON腐败 → console.warn + DEFAULT_TTL。删除 `logs/cache-ttl-stats.json` 即触发 ENOENT 路径。`path-metrics.ts buildMetricBaselines` 按需从 ChatThread 聚合，不单独持久化，baselines 为 null 时 `assessExecutionQuality` 跳过检测。
- `npx tsc --noEmit` 通过
~~→~~ [2026-06-03 已验证] 见下方"已完成验证"附录。

- checklist.md 全部由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）
~~→~~ [2026-06-03 已验证] `.trae/specs/co-agent-evolution-loop/checklist.md` 全部 8 项已勾选，每项附代码行号证据。

- tasks.md 全部 Task 子项由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）
~~→~~ [2026-06-03 已验证] `.trae/specs/co-agent-evolution-loop/tasks.md` 全部 6 个 Task 已完成，L9 增量更新（四元组→三元组）。

**已完成验证**（可验证证据）：
- `npx tsc --noEmit` 编译通过 ✓（path-metrics.ts / cache-ttl-stats.ts / response-strategy.ts / stream/route.ts 无类型错误）
- `check_phase_symmetry` MCP 工具：stream/route.ts + response-strategy.ts 阶段标记对称 ✓
- `check_failure_path` MCP 工具：catch 块等价审计 ✓
- `loadStats()` 4 边界覆盖：ENOENT / EACCES / JSON腐败 / 正常 ✓

**未执行的端到端验证**（保留给运行时复测）：
- [ ] 多轮实际对话后 turnHistory 自增验证（需 5+ 轮真实对话）
- [ ] 缓存过期后 reconfirmedCount 自增验证（需真实缓存过期 + LLM 重跑）
- [ ] 删除 logs/cache-ttl-stats.json 后系统回退初始常量（需运行时操作）
- [ ] 低样本量下 baselines 为 null（< 3 线程）→ assessExecutionQuality 跳过检测

### 完成后记录 ADD-7 审计

~~- `PATH_METRICS_CREATED`
- `CACHE_TTL_STATS_CREATED`
- `EVOLUTION_LOOP_INTEGRATED`~~ → [2026-06-03 修订: 扩展为完整审计记录表，含 8 条记录]

| action | targetType | targetId | 说明 | 状态 |
|--------|-----------|----------|------|:--:|
| `PATH_METRICS_CREATED` | `SERVICE` | `src/services/path-metrics.ts` | 新建 MetricDescriptor 注册表（4 检测器）+ MetricContribution + assessExecutionQuality + buildMetricBaselines | ✅ 已落库 |
| `CACHE_TTL_STATS_CREATED` | `SERVICE` | `src/services/cache-ttl-stats.ts` | 新建 TtlStats（7字段含 lastAdjustedAt）+ recordCacheHit/Miss/Expiry + adaptCacheTtl（±20%）+ loadStats（4边界） | ✅ 已落库 |
| `EVOLUTION_LOOP_INTEGRATED` | `AGENT` | `src/agents/response-strategy.ts` | StrategyContext +turnHistory/+baselines；resolveResponseStrategy 同步调 assessExecutionQuality + try-catch 降级 + relax_evidence_filter 分支 | ✅ 已落库 |
| `EVOLUTION_LOOP_INTEGRATED` | `API_ROUTE` | `src/app/api/agent/chat/stream/route.ts` | 捕获 4 变量（intent/thinkingLevel/verdictConfidence/evidenceCount）→ turnHistory 采集 → getAdaptedTtl 替代硬编码 CIT → finally 块 clearAuditContext | ✅ 已落库 |
| `DOC_UPDATED` | `DOC` | `docs/.../技术架构说明书.md#8.6` | 新增 8.6 节演化闭环（8.6.1-8.6.8）+ loadStats 4 边界表 + MetricContribution 接口 + 编程时/运行时耦合说明 | ✅ 已落库 |
| `DOC_UPDATED` | `DOC` | `docs/.../技术架构说明书.md#8.6.5` | 修正 8.6.5 同步+try-catch 描述（偏差1） | ✅ 已落库 |
| `DOC_UPDATED` | `DOC` | `docs/.../技术架构说明书.md#8.6.4` | 补充编程时与运行时耦合说明（偏差2） | ✅ 已落库 |
| `DOC_POST_IMPLEMENTATION_REVIEW` | `DOC` | `docs/.../技术架构说明书.md#8.6.5` | 补充 dominantAction===relax_evidence_filter 分支（偏差3） | ✅ 已落库 |

~~---~~

### 收尾补充：回路三 UI 闭环 — strategy_adjustment 流式事件 [2026-06-03 修订]

\[新增\] 回路三触发质量调整时，前端用户应能看到自动调参标记（否则用户体验差——不知道回答为什么变了）。本轮在 LLM 流式输出前推送 `strategy_adjustment` 事件，前端在推理链管线时间线中展示。

#### 你要改的文件（5 个）

| 文件 | 操作 | 改什么 |
|------|------|--------|
| `src/agents/stream-bus.ts` | 修改 | StreamEvent 加 `strategy_adjustment` 类型 |
| `src/agents/node-stream-controller.ts` | 修改 | 加 `emitStrategyAdjustment()` 方法 |
| `src/agents/nodes/response.ts` | 修改 | `responseStart()` 前检查 evolutionAdjustment 并 emit |
| `src/agents/response-strategy.ts` | 修改 | ResponseStrategy + `evolutionAdjustment?` 字段；resolveResponseStrategy 填充 |
| `src/stores/chat-store.ts` | 修改 | 加 `streamingStrategyAdjustment` 状态 |
| `src/components/chat/chat-panel.tsx` | 修改 | 解析 `{ type: "strategy_adjustment" }` 事件 |

#### 核心设计

```
resolveResponseStrategy() → assessExecutionQuality() → StrategyAdjustment
  → if (signals.length > 0) → emitStrategyAdjustment(controller, ...)
    → SSE: { type: "strategy_adjustment", signals, dominantAction, promptSupplement }
  → 前端 NodeProgressTimeline 展示"质量自检"标记 + 展开维度表
  → 然后 responseStart() → token → ...
```

#### 高风险误区

- 禁止 adjustment 事件阻塞 token 流式输出（emit 后立即 continue，不 await）
- 禁止在无调整时推送空事件（前端不需要处理无调整场景）

> 回路三 UI 闭环不修改 stream/route.ts（事件由 response 节点内部 emit，走现有 stream bus 通道），不新增 API，不修改 Prisma Schema。

---
~~---

## <第7轮> 三层审计管线闭包 + 回路一闭合

### 你当前的位置

你是第 7 轮。上游第1-6轮已完成全部业务功能：类型基础、响应裁决、分析专家、管线消费、报告服务、语义缓存和演化闭环。本轮补齐三层审计能力并闭合回路一（TTL 自主学习）。

### 上游已完成

- ResponseStrategy 可用
- AnalysisContext 可用
- activeExperts 已接入管线
- report-generator 和 report API 可用
- semantic-cache 可用
- path-metrics 和 cache-ttl-stats 可用
- turnHistory 采集已完成
- adaptCacheTtl 已在 stream/route.ts 调用
~~- recordCacheHit/Miss/Expiry 已定义但零调用（回路一待闭合）~~ → - recordCacheHit/Miss/Expiry 已定义但零调用：第5轮创建 TTL 统计基础设施后**故意不闭合回路**（原子事务边界约束），将调用点接入职责**交接**给第7轮。这是正常的多轮交接，不是遗留缺陷。 [2026-06-03 修订: 澄清交接语义]

### 恢复上下文的方法

```text
1. 执行 session-init SKILL
2. query_audit_logs({ keyword: "EVOLUTION_LOOP_INTEGRATED" })
3. query_audit_logs({ keyword: "SEMANTIC_CACHE_CREATED" })
4. query_audit_logs({ keyword: "CORE_AGENT_AUDIT_JSON_FIXED" })
5. query_audit_logs({ keyword: "CORE_AGENT_INDEX_JSON_FIXED" })
6. query_audit_logs({ keyword: "CORE_STREAM_ROUTE_JSON_FIXED" })
7. 确认第1-6轮与第1.5轮核心链路基线全部完成
```

### 原子事务目标

做两件事：
1. **三层审计管线**：L1 debug-tracer（仅 dev）+ L2 AuditCallback 自动审计（始终）+ L3 console（LOG_LEVEL）
2. **回路一闭合**：接入 `recordCacheHit/Miss/Expiry` → TTL 自主学习回路运转

覆盖 `co-agent-simplified-v1.md` 的 Step 8。L2 运行时审计通过 `AuditCallback extends BaseCallbackHandler`（LangChain 标准回调）自动捕获所有节点/LLM/Tool 生命周期，节点文件零改动。设计细节由 sub-plan 承载。

### 你的 spec 文件

- `.trae/specs/co-agent-audit-pipeline/spec.md`
- `.trae/specs/co-agent-audit-pipeline/tasks.md`
- `.trae/specs/co-agent-audit-pipeline/checklist.md`
- **Sub-Plan**: `.trae/plans/farm-agent-layer2-cross-cutting-plan-v1.md`
  - Sub-Plan Spec: `.trae/specs/farm-agent-layer2-cross-cutting/spec.md`
  - Sub-Plan Tasks: `.trae/specs/farm-agent-layer2-cross-cutting/tasks.md`
  - Sub-Plan Checklist: `.trae/specs/farm-agent-layer2-cross-cutting/checklist.md`

### 架构文档

- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统技术架构说明书》.md` — 8.7 节：三层审计管线（L1 debug trace + L2 AuditCallback + L3 console）
- `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统决策管线架构说明书》.md` — 三层审计数据流 + traceId 贯穿

### 你要改的文件（7 个：3 新建 + 4 修改）

| 文件 | 操作 | 层次 | 改什么 |
|------|------|------|--------|
| `src/lib/layer2-callback.ts` | **新建** | L2 | `AuditCallback extends BaseCallbackHandler`（sub-plan 实现，覆盖节点/LLM/Tool 生命周期） |
| `src/agents/index.ts` | **修改** | L2 | `runAgent/streamAgent` 注入 `AuditCallback` |
| `src/lib/agent-audit-logger.ts` | **修改** | L1+L2 | `setAuditContext/clearAuditContext` + callback 兼容性审查（废弃手动 audit 函数，保留 L1 文件日志） |
| `src/services/debug-tracer.ts` | **新建** | L1 | `DebugTrace` + `captureNode/captureSummary/exportFineTuningData` |
| `src/app/api/agent/chat/threads/[threadId]/debug/route.ts` | **新建** | L1 | Debug API（`format=json|fine-tuning`，仅 dev） |
| `src/app/api/agent/chat/stream/route.ts` | **修改** | L1+回路一 | `setAuditContext/captureNode/finalizeAndSave` + `recordCacheExpiry` |
| `src/services/semantic-cache.ts` | **修改** | 回路一 | get() 中接入 `recordCacheHit/Miss`（回路一闭合） |

### 核心设计

L2 运行时审计通过 `AuditCallback extends BaseCallbackHandler`（LangChain 标准扩展机制）实现完全自动化。节点文件（response.ts、path-metrics.ts、semantic-cache.ts 等）零改动——不再需要手动调用 `agentAuditStrategy/ExecutionQuality/CacheOperation`。

```typescript
// src/lib/layer2-callback.ts（sub-plan 实现）
class AuditCallback extends BaseCallbackHandler {
  handleChainStart → NODE_START_{name}        // 所有节点进入
  handleChainEnd   → NODE_END_{name}           // 所有节点退出（含 durationMs）
  handleChainError → NODE_ERROR_{name}         // 所有节点异常
  handleLLMEnd     → AGENT_LLM_CALL            // 所有 LLM 调用（含 tokenUsage）
  handleToolStart  → AGENT_TOOL_START_{name}   // 所有 Tool 进入
  handleToolEnd    → AGENT_TOOL_END            // 所有 Tool 退出（含 outputLength）
  handleToolError  → AGENT_TOOL_ERROR          // 所有 Tool 异常
}

// 注入: src/agents/index.ts
agent.invoke(input, { callbacks: [new AuditCallback(traceId)] })
```

设计细节、实现任务和验证清单见 sub-plan 的 spec/tasks/checklist 三件套。

### 关键契约细化

- L2 运行时审计通过 `AuditCallback` 自动捕获 LangGraph 生命周期事件，**节点文件零改动**。
- `AuditCallback` 与 `wrapNodeWithAudit`（L1 dev-logger）共存，两者互不干扰。
- L1 开发审计只在 development 生效，输出 debug trace 文件和 Debug API。
- L3 控制台输出受 LOG_LEVEL 控制，不替代 L1/L2。
- `agent-audit-logger.ts` 原有的 `agentAuditStrategy/ExecutionQuality/CacheOperation` 手动调用函数在本轮废弃（由 AuditCallback 替代），但 `agentAuditRequest/Response/Error` 等函数保留用于 L1 文件日志。
- `semantic-cache.ts` get() 中接入 `recordCacheHit/Miss`（回路一闭合，共 2 行代码）。
- `stream/route.ts` 缓存过期重跑后接入 `recordCacheExpiry`（回路一闭合，共 1 行代码）。
- 所有 L2 事件必须携带 traceId，支持 `query_audit_logs({ traceId })` 还原调用链。
- Debug fine-tuning export 必须排除 followUp>0 或低质量样本，防止污染微调数据。
- Sub-plan 的 spec/tasks/checklist 优先于本 handoff 摘要；实现细节以 sub-plan 为准。

### 高风险误区

- 禁止在本轮手动调用 `agentAuditStrategy/ExecutionQuality/CacheOperation`（这些由 AuditCallback 自动覆盖）。
- 禁止把 L1 debug trace 在 production 中打开。
- 禁止把 L2 AuditLog 降级成 console/file。
- 禁止 debug API 暴露敏感信息或无鉴权数据面。
- 禁止忘记在 `semantic-cache.ts` get() 中接入 `recordCacheHit/Miss`（回路一闭合的关键 2 行）。
- 禁止破坏已有 agent-audit-logger API，必须兼容上游调用。
- 禁止提前实现第8轮 Global State Model / Cognitive Event Bus / Policy Loop。

### ADD-7 恢复关键词

```text
query_audit_logs({ keyword: "LAYER2_CALLBACK_CREATED" })
query_audit_logs({ keyword: "AUDIT_CALLBACK_INJECTED" })
query_audit_logs({ keyword: "DEBUG_TRACER_CREATED" })
query_audit_logs({ keyword: "DEBUG_PANEL_API" })
query_audit_logs({ keyword: "STREAM_AUDIT_CONTEXT" })
query_audit_logs({ keyword: "CACHE_TTL_LOOP_CLOSED" })
query_audit_logs({ keyword: "SEMANTIC_CACHE_TTL_HOOK" })
```

### 验证标准

#### 已完成验证

- `npx tsc --noEmit` 通过（新增代码零类型错误）
- checklist.md 全部由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）
- tasks.md 全部 Task 子项由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）

#### 未执行的端到端验证（保留给运行时复测）

- `NODE_ENV=production` → AuditLog 表有 NODE_START/NODE_END/AGENT_LLM_CALL 记录（AuditCallback 自动写入，替代原手动 STRATEGY_MATCHED/EXECUTION_QUALITY/CACHE_HIT 等）
- `query_audit_logs({ traceId })` → 同请求所有记录共享 traceId
- `NODE_ENV=development` → `logs/debug/{threadId}/` 有 JSON 文件
- `NODE_ENV=production` → `logs/debug/` 无新文件
- GET /debug?format=fine-tuning → 含 quality 标签，followUp>0 被排除
- 第1次缓存未命中 → recordCacheMiss 被调用，第2次命中 → recordCacheHit + adaptCacheTtl 生效

### 完成后记录 ADD-7 审计

- `LAYER2_CALLBACK_CREATED` — src/lib/layer2-callback.ts 新建
- `AUDIT_CALLBACK_INJECTED` — src/agents/index.ts 注入 AuditCallback
- `AUDIT_LOGGER_COMPAT_REVIEW` — src/lib/agent-audit-logger.ts 兼容性审查
- `DEBUG_TRACER_CREATED` — src/services/debug-tracer.ts 新建
- `DEBUG_PANEL_API` — src/app/api/agent/chat/threads/[threadId]/debug/route.ts 新建
- `STREAM_AUDIT_CONTEXT` — src/app/api/agent/chat/stream/route.ts 修改
- `CACHE_TTL_LOOP_CLOSED` — 回路一闭合汇总（semantic-cache + stream/route 接入点）

---

## <第8轮> 架构合流闭包 — Global State Model + Cognitive Event Bus + Policy Loop

### 你当前的位置

你是第 8 轮。上游第1-7轮已完成局部闭包收敛：类型基础、响应裁决、领域上下文、管线消费、语义缓存、演化闭环、三层审计管线。本轮不再做局部补丁，而是建立统一认知与执行内核。

### 上游已完成

- AgentState 已完成类型基础收敛，Evidence / EvidenceRef / EvidenceSummary / ThinkingLevel 可用
- ResponseStrategy 已集中裁决
- AnalysisContext 与 ExpertRegistry 可用
- activeExperts 已接入 retrieval / reasoning / response / report
- SemanticCache、kbGeneration、TTL 基础机制可用
- path metrics、cache ttl stats、turnHistory 已可作为 feedback 数据
- 三层审计管线可用，L2 AuditLog 支持 traceId 查询

### 恢复上下文的方法

```text
1. 执行 session-init SKILL
2. query_audit_logs({ keyword: "EVIDENCE_TYPE_UNIFIED" })
3. query_audit_logs({ keyword: "RESPONSE_STRATEGY_INTEGRATED" })
4. query_audit_logs({ keyword: "ANALYSIS_CONTEXT_CREATED" })
5. query_audit_logs({ keyword: "PIPELINE_EXPERT_CONSUME" })
6. query_audit_logs({ keyword: "SEMANTIC_CACHE_CREATED" })
7. query_audit_logs({ keyword: "EVOLUTION_LOOP_INTEGRATED" })
8. query_audit_logs({ keyword: "AUDIT_LOGGER_LAYER2_UPGRADE" })
9. query_audit_logs({ keyword: "CORE_STREAM_BUS_RETURN_FIXED" })
10. 确认第1-7轮、第1.5轮核心链路基线全部完成且可恢复
```

### 原子事务目标

建立 farm-agent 的统一认知与执行内核：

```text
GlobalSystemState
  ├─ chat state
  ├─ agent cognitive state
  ├─ memory / RAG / cache state
  ├─ tool / execution state
  ├─ policy state
  ├─ audit state
  └─ feedback state

Cognitive Event Bus
  Thought → Decision → Action → Feedback → PolicyUpdate

Policy Update Loop
  Observation → Decision → Execution → Feedback → Update Policy
```

### 你的 spec 文件

第8轮必须新建独立 spec，不允许直接复用前7轮 spec：

- `.trae/specs/farm-agent-global-state/spec.md`
- `.trae/specs/farm-agent-global-state/tasks.md`
- `.trae/specs/farm-agent-global-state/checklist.md`

### 关键契约细化

- GlobalSystemState 是 single source of truth for "what is happening"，不替代各子系统实现，但统一它们的状态解释。
- AgentState 是 GlobalSystemState 的认知子域，不允许继续作为孤立状态孤岛扩张。
- Cognitive Event Bus 必须承载认知执行事件，而不只是 UI event / logging event / streaming event。
- Policy Update Loop 必须消费第6轮 feedback 数据和第7轮 L2 audit 数据，产出可解释、可回滚的 policy update。
- Competition-based Agent Execution 只能在统一 state schema 和 cognitive event schema 完成后实现。

### 高风险误区

- 禁止把第8轮退化成再加几个字段的状态补丁。
- 禁止只写 Global State 文档，不实现状态转换接口。
- 禁止把 event bus 继续当日志管道使用。
- 禁止在未统一 evidence/reference/state schema 前实现多 reasoning path 仲裁。
- 禁止破坏第1-7轮已通过验证的局部闭包。

### ADD-7 恢复关键词

```text
query_audit_logs({ keyword: "GLOBAL_STATE_MODEL_CREATED" })
query_audit_logs({ keyword: "COGNITIVE_EVENT_BUS_CREATED" })
query_audit_logs({ keyword: "POLICY_UPDATE_LOOP_CREATED" })
query_audit_logs({ keyword: "COMPETITION_EXECUTION_SCAFFOLD" })
```

### 验证标准

- GlobalSystemState 可表达 chat / agent / memory / tool / policy / audit / feedback 全局状态
- 第1-7轮关键状态均能映射到 GlobalSystemState 子域
- Cognitive Event Bus 能表达 Thought → Decision → Action → Feedback → PolicyUpdate
- Policy Update 记录包含 input metrics、decision reason、affected policy、rollback data
- 多路径推理只建立 scaffold，不在缺少统一评分标准时强行仲裁
- `npx tsc --noEmit` 通过
- checklist.md 全部由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）
- tasks.md 全部 Task 子项由 `[ ]` 更新为 `[x]`（依据代码证据逐项验证后勾选）

### 完成后记录 ADD-7 审计

- `GLOBAL_STATE_MODEL_CREATED`
- `COGNITIVE_EVENT_BUS_CREATED`
- `POLICY_UPDATE_LOOP_CREATED`
- `COMPETITION_EXECUTION_SCAFFOLD`

---

## 每轮收敛判定补充规则

> 以下规则与 `add-paradigm` SKILL Step 8 收敛条件并列，是每轮原子事务完成的强制性前置条件。

### checklist 证据要求

每轮结束时，`checklist.md` 必须满足以下条件才算收敛：

- [ ] **全部项已勾选**（不得有空勾选、不得有"推测通过"）
- [ ] **每项勾选有可验证证据**：
  - 编译/类型项：附 `npx tsc --noEmit` 输出或错误数
  - 运行项：附终端输出、截图或日志摘要
  - 代码项：附文件路径 + 行号引用
  - 跨轮依赖项：附 `query_audit_logs` 查询结果（如"确认第1轮已完成"）
- [ ] **未执行项诚实保留**：无法在当前轮次验证的项（如运行时端到端验收），保留为未勾选 `- [ ]`，并在旁注明"待后续运行时验证"
- [ ] **证据可直接获取**：后续 AI Session 通过 `query_audit_logs` 按 targetId/keyword 可查到 checklist 对应的验证证据

### tasks 证据要求

- [ ] **全部任务已完成**（tasks.md 中全部 `- [x]`）
- [ ] **每个任务有对应的 checklist 项覆盖**（不允许 task 完成但无 checklist 验证记录）
- [ ] **task 完成状态与 ADD-7 审计记录一致**：每完成一个 task 的代码修改，必须有对应的 `record_dev_operation` 记录

### 收敛声明规则

当前轮次 AI 不得自行声明"本轮已收敛"并直接进入下一轮。收敛声明只能由以下角色做出：

1. **开发者确认** — 开发者审核 checklist/tasks 证据后宣布收敛
2. **Review AI 确认** — 独立的 review AI Session 通过 `query_audit_logs` 验证后宣布收敛

执行 AI 的职责是完成 checklist/tasks 并附证据，而非自我判定收敛。

---

## 附录：每轮启动模板

新对话开始时，直接把下面内容 + 对应轮次章节粘贴给 LLM：

```text
## 上下文

你在执行 farm-agent 改进的 [第N轮]。
上游 [第1轮~第N-1轮] 已完成。
先读 .trae/documents/co-agent-conversation-handoff.md 的 <第N轮> 章节。

## 启动步骤（按顺序）

1. 执行 session-init SKILL
2. 执行 add-paradigm SKILL（含 Step 0 文档先行）
3. 读本轮对应 .trae/specs/co-agent-XXX/spec.md（含其中的「文档先行三步闭环」章节，按 spec 的指示更新架构文档）
4. 读本轮对应 .trae/specs/co-agent-XXX/tasks.md
5. 读本轮对应 .trae/specs/co-agent-XXX/checklist.md
6. 按 tasks.md 顺序执行代码修改
7. 每完成一个 Task：读 checklist.md → 逐项验证 → **附可验证证据** → 勾选
8. 每完成一个文件修改：record_dev_operation 写入 ADD-7 审计
9. 写入审计后：query_audit_logs 按 action/targetId/keyword 回查确认落库
10. 全部代码完成后：按本轮 handoff 的 ADD-7 恢复关键词逐项回查，确认当前轮次可被下一轮恢复
11. **收敛后：回到 add-paradigm SKILL Step 0.6，验收后回看架构文档，标记偏差点，通知开发者决策**

## 关键提醒

- 当前执行的是 [第N轮]/8
- 当前轮次是一个原子工程事务，不允许拆到下一轮补齐
- handoff 是入口索引；具体实现以 spec/tasks/checklist 为准
- **架构文档同步**：代码执行前（Step 0）更新架构文档 → 代码执行后（Step 0.6）回看架构文档确认一致性
- **checklist 证据要求**：每项勾选必须有可验证证据，不得空勾选或"推测通过"。未执行项必须诚实保留为未勾选状态
- **tasks 证据要求**：全部任务完成后，每个 task 必须有对应的 checklist 验证记录
- **禁止自行声明收敛**：收敛声明只能由开发者或 Review AI 做出，执行 AI 不得自我判定"本轮已收敛"
- 禁止简化代码实现
- 禁止跳过 MCP 回查；只写 record_dev_operation 不算审计闭环完成
- 保持与上游文件修改兼容，特别注意 handoff 中标记的历史修改文件
```
