# farm-agent 第1轮 Spec / Handoff Review

## Review 元信息

- **Review 对象**:
  - `.trae/specs/co-agent-type-convergence/spec.md`
  - `.trae/specs/co-agent-type-convergence/tasks.md`
  - `.trae/specs/co-agent-type-convergence/checklist.md`
  - `.trae/documents/co-agent-conversation-handoff.md` 的 `<第1轮>` 章节
- **Review 范围**: 第1轮基础闭包：类型收敛 + thinkingLevel 路由
- **Review 时间**: 2026-05-25
- **结论级别**: 可接受，但建议先修正若干一致性问题后再进入代码执行

---

## 1. 总体结论

第1轮 AI 对 spec、tasks、checklist 和 handoff 的改良方向正确，整体质量高于原始版本。它把第1轮从粗粒度任务列表升级成了一个较完整的基础闭包原子事务，明确了类型权威、路由分流、EvidenceSource 真实性、chunkId 追溯、stream-bus 保护、越界禁止项和 ADD-7 审计粒度。

当前第1轮文档已经基本具备执行条件，但仍存在几处需要收敛的问题：

1. handoff 中 ADD-7 action 列表与 spec/checklist 不一致。
2. handoff 的恢复关键词缺少 interaction 相关 action。
3. tasks.md 中仍有“当前对话”旧表述，应改为“当前轮次”。
4. spec.md Documentation First 中仍有 co-agent 查询表述，应改为 farm-agent。
5. routeByIntent 示例代码可能误导执行者删除 tracer 逻辑。
6. EvidenceRef.docName 必填可能迫使非文档来源伪造 docName。

这些问题不影响整体方向，但会影响后续执行的一致性、审计恢复和代码实现安全性。建议在执行第1轮代码前完成修正。

---

## 2. 正向评价

### 2.1 第1轮原子边界清晰

第1轮现在明确只覆盖：

```text
类型收敛 + thinkingLevel 路由
```

并显式禁止：

```text
ResponseStrategy
AnalysisContext
Prisma Schema
前端组件
stream-bus 重构
worldline / L0-L4 / VerdictRegistry / CapabilityModel
```

这有助于防止第1轮越界实现第2轮或第3轮能力，符合 7 轮原子事务拆分原则。

### 2.2 EvidenceSource 没有误收窄

spec 明确要求 EvidenceSource 同时覆盖当前运行时真实来源和父 Plan 预留来源：

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
```

这是重要改良。第1轮如果只按父 Plan 简写收敛，很容易把当前 retrieval 中真实存在的 `knowledge` / `project_context` / `keywords` / `multimodal` 错改为 `document`，导致运行时语义损坏。

### 2.3 chunkId 追溯约束真实可信

当前文档明确规定：

- chunkId 只能从真实 metadata 提取。
- 支持 `metadata.chunkId` / `metadata.vectorId` / `metadata.id` / `documentId + chunkIndex` / `documentId + chunk_id`。
- 不允许用 random UUID 或 evidenceId 伪造 chunkId。
- 无真实 chunk 标识时允许 `chunkId` 保持 undefined，但必须保留 metadata。

这保证了第1轮增强的是证据追溯能力，而不是制造伪追溯字段。

### 2.4 thinkingLevel fallback 设计正确

文档明确要求：

```typescript
state.currentTask?.thinkingLevel ?? "deep"
```

缺失 thinkingLevel 时保守走 deep/retrieval，而不是 fast/response。这个设计是正确的，因为 fast 是明确可跳过深链路时的优化路径，缺失字段时不应默认跳过 RAG 和推理。

### 2.5 checklist 具备真实约束力

checklist 覆盖了：

- EvidenceSource 每个 union 成员。
- EvidenceRef 不包含完整 content。
- AgentState.evidenceChain 不得改成 EvidenceRef[]。
- routeByIntent 保留 tracer 和 audit。
- retrieval 保留各类 source。
- runtime SSE 验证。
- ADD-7 文件级审计 action。

这已经不是形式化 checklist，而是可用于约束执行质量的验收清单。

---

## 3. 需要修正的问题

### 3.1 handoff 的 ADD-7 action 列表不完整

handoff 第1轮“完成后记录 ADD-7 审计”当前只列出：

```text
EVIDENCE_TYPE_UNIFIED
STATE_TYPE_CLEANED
THINKING_LEVEL_ROUTING
```

但 checklist 和 spec 中第1轮实际文件级 action 更完整：

```text
EVIDENCE_TYPE_UNIFIED
STATE_TYPE_CLEANED
PROMPT_EVIDENCE_REF_ADDED
THINKING_LEVEL_ASSIGNED
THINKING_LEVEL_ROUTING
RETRIEVAL_EVIDENCE_CHUNK_ID_ADDED
INTERACTION_EVIDENCE_TYPE_UNIFIED
INTERACTION_PROMPT_EVIDENCE_REF_ADDED
```

建议 handoff 与 checklist 保持一致，统一列出 8 个 action。否则第2轮通过审计日志恢复上下文时，可能误判第1轮已完成，但 prompt/ref/retrieval/interaction 相关文件未被完整记录。

### 3.2 handoff 的 ADD-7 恢复关键词缺少 interaction 相关 action

handoff 第1轮恢复关键词目前包含：

```text
EVIDENCE_TYPE_UNIFIED
STATE_TYPE_CLEANED
PROMPT_EVIDENCE_REF_ADDED
THINKING_LEVEL_ASSIGNED
THINKING_LEVEL_ROUTING
RETRIEVAL_EVIDENCE_CHUNK_ID_ADDED
```

建议补充：

```text
INTERACTION_EVIDENCE_TYPE_UNIFIED
INTERACTION_PROMPT_EVIDENCE_REF_ADDED
```

恢复关键词和完成审计 action 应使用同一组 8 个 action。

### 3.3 tasks.md 残留“当前对话”旧表述

当前 tasks.md 仍有：

```text
当前对话 ADD-7 `record_dev_operation` 已逐文件记录
```

建议改为：

```text
当前轮次 ADD-7 `record_dev_operation` 已逐文件记录
```

既然 farm-agent 当前执行模型已经确定为 7 轮原子事务，就不应继续把执行单位称为“对话”。

### 3.4 spec.md Documentation First 中仍有 co-agent 查询表述

当前 spec.md Documentation First 部分仍有：

```text
find_related_docs({ query: "co-agent type convergence Evidence thinkingLevel routing", category: "architecture" })
docs/ 目录未命中直接描述本次 co-agent 类型收敛与 thinkingLevel 路由的架构文档
```

建议改为：

```text
find_related_docs({ query: "farm-agent type convergence Evidence thinkingLevel routing", category: "architecture" })
docs/ 目录未命中直接描述本次 farm-agent 类型收敛与 thinkingLevel 路由的架构文档
```

文件名和 spec 目录保留 `co-agent-*` 可以作为历史路径，但正文项目叙述应统一使用 farm-agent。

### 3.5 routeByIntent 示例代码可能误导删除 tracer

spec.md 中 routeByIntent 示例代码展示了完整函数形态，但只显式保留了：

```typescript
agentAuditRoute("intention", target, reason)
return target
```

虽然后续 scenario 写了不能删除 active tracer，但 AI 执行时容易照着示例重写函数，导致现有 tracer route decision 逻辑丢失。

建议将示例改成伪代码，不展示完整函数替换：

```typescript
const thinkingLevel = state.currentTask?.thinkingLevel ?? "deep"
const target = thinkingLevel === "fast" ? "response" : "retrieval"

recordExistingTraceRouteDecision(traceId, target, reason)
agentAuditRoute("intention", target, reason)

return target
```

或者在示例中显式保留当前代码已有的 tracer 调用。

### 3.6 EvidenceRef.docName 必填可能不适合所有 evidence source

当前 EvidenceRef 定义为：

```typescript
export interface EvidenceRef {
  id: string
  chunkId?: string
  source: EvidenceSource
  reliability: number
  relevance: number
  docName: string
  contentExcerpt?: string
}
```

`docName` 必填对 `knowledge` / `document` 来源合理，但对以下来源不一定成立：

```text
project_context
keywords
multimodal
knowledge_empty
team_input
sensor
```

如果 docName 必填，执行者可能为了通过类型检查伪造文档名。

建议改为：

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

如果后续 UI 或 prompt 需要稳定展示名，可以引入更通用的：

```typescript
label: string
```

但第1轮为了最小变更，建议先将 `docName` 改为可选。

### 3.7 thinkingLevel 不应成为 LLM 必填结构化输出

tasks.md 已写明：

```text
IntentionOutput 新增或兼容 thinkingLevel?: ThinkingLevel，不得依赖 LLM 必填该字段
```

这个方向正确。建议 spec.md 再补一句：

```text
thinkingLevel 应由 intention 节点代码根据最终 intent 计算，不应要求 LLM 在 structured output 中必填。
```

否则执行者可能把 thinkingLevel 加进 LLM schema 并要求模型输出，增加不必要的不稳定性。

---

## 4. 越界检查

本次第1轮文档改良没有明显越界。

当前新增或强化的内容仍属于基础闭包：

```text
EvidenceSource
EvidenceRef
EvidenceSummary
ThinkingLevel
routeByIntent fast/deep
retrieval chunkId
interaction evidence 类型替换
```

其中 `EvidenceSummary` 虽然会被后续轮次消费，但作为统一类型提前定义是合理的。`chunkId` 也属于 Evidence 追溯基础，不属于第4轮管线消费。

没有看到第1轮提前实现：

```text
ResponseStrategy
AnalysisContext
ExpertRegistry
SemanticCache
EvolutionLoop
Audit Pipeline
```

因此原子边界基本守住。

---

## 5. 建议修正优先级

### 高优先级

1. handoff 第1轮 ADD-7 action 补齐为 8 个。
2. handoff 第1轮恢复关键词补齐 interaction 两个 action。
3. routeByIntent 示例代码避免误导删除 tracer。
4. EvidenceRef.docName 改为可选，或引入 label + docName?。

### 中优先级

5. tasks.md “当前对话”改为“当前轮次”。
6. spec.md Documentation First 的 co-agent 查询表述改为 farm-agent。
7. spec.md 补充 thinkingLevel 不应作为 LLM 必填输出。

---

## 6. 最终建议

第1轮改良后的 spec/tasks/checklist/handoff 可以作为执行基础，但建议先完成上述修正，再让代码执行 AI 开始修改源代码。

推荐执行顺序：

```text
先修正文档一致性
  ↓
复查 handoff / spec / tasks / checklist 的 action 与术语一致性
  ↓
再进入第1轮代码修改
  ↓
逐文件 record_dev_operation
  ↓
用 query_audit_logs 回查第1轮 8 个 action
```

第1轮完成的判定不应只看 `npx tsc --noEmit`，还必须确认：

```text
Evidence 唯一源头成立
thinkingLevel 所有返回路径写入或 fallback 成立
fast/deep SSE 行为成立
retrieval chunkId 不伪造
ADD-7 审计 action 完整落库
```
