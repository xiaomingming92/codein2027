# farm-agent 第2轮 Spec / Handoff Review

## Review 元信息

- **Review 对象**:
  - `.trae/specs/co-agent-response-strategy/spec.md`
  - `.trae/specs/co-agent-response-strategy/tasks.md`
  - `.trae/specs/co-agent-response-strategy/checklist.md`
  - `.trae/documents/co-agent-conversation-handoff.md` 的 `<第2轮>` 章节
- **Review 范围**: 第2轮响应裁决闭包：ResponseStrategy 集中管理
- **Review 时间**: 2026-05-25
- **结论级别**: 方向正确，但建议先修正若干契约细节后再进入代码执行

---

## 1. 总体结论

第2轮 spec、tasks、checklist 和 handoff 的整体方向正确，已经把 response 节点中分散的 prompt 约束、sections 组合和回复策略抽象为独立的 ResponseStrategy 裁决层。它明确要求使用 StrategyDescriptor registry、自声明 matches、priority 排序、装饰器管道和 deep:fallback 收敛未知意图，能够有效避免继续在 `response.ts` 中堆叠硬编码三段分支。

当前第2轮文档已经具备较好的执行基础，但仍存在若干需要在代码执行前收敛的问题：

1. spec/handoff/tasks 中的类型文件路径与当前仓库真实路径不一致。
2. registry 策略数量在 handoff/tasks/checklist 中存在 8 个与 9 个的表述冲突。
3. section type 中 `risks` 与当前真实协议 `risk` 不一致。
4. `showEvidenceDigest` 与 `sections` 的关系尚未定义清楚。
5. `hasNonPriorEvidence` 的判定规则缺失，容易导致实现者各自发挥。
6. `activeExperts` 装饰器容易越界到第3轮专家注册表，需要明确本轮仅预留输入。
7. `maxTokens` 是否真实接入 LLM 调用缺少边界说明。
8. `buildDisplayFromState` 对新增 sections 的数据来源和空数据行为需要细化。
9. fast/chat greeting 场景必须明确也走策略裁决并产出 conclusion section。
10. tasks 中的单元测试要求缺少测试文件位置和最小场景集合。

这些问题不影响第2轮架构方向，但会影响后续执行的一致性、类型安全、前端协议兼容和原子事务边界。建议在执行第2轮代码前完成修正。

---

## 2. 正向评价

### 2.1 第2轮原子边界清晰

第2轮明确只覆盖：

```text
ResponseStrategy 集中裁决
```

并显式禁止：

```text
AnalysisContext
专家注册表
activeExperts 持久化
Prisma Schema
前端组件
stream-bus / SSE 事件总线重构
第1轮 fast/deep 路由重写
worldline / L0-L4 / VerdictRegistry / CapabilityModel
```

这有助于防止第2轮越界实现第3轮或第4轮能力，符合 7 轮原子事务拆分原则。

### 2.2 StrategyDescriptor registry 方向正确

spec 明确要求策略使用描述符注册表：

```typescript
interface StrategyDescriptor {
  id: string
  matches: (ctx: StrategyContext) => boolean
  priority: number
  apply: ResponseStrategy
}

function resolveResponseStrategy(ctx: StrategyContext): ResponseStrategy
```

并禁止退回字符串映射表、switch/case 或 if/else 长链。这是本轮最重要的架构约束：策略由 descriptor 自声明匹配条件，response 节点只消费裁决结果。

### 2.3 fallback 收敛未知意图是必要设计

handoff 明确要求 deep:fallback 必须低优先级但永远可匹配，防止未知意图无策略。这一点非常重要，因为 intention 节点和显式 intent 入口都可能产生未来新增的意图类型。如果没有 fallback，response 节点会在未知意图场景中出现空策略或异常路径。

### 2.4 装饰器管道预留了后续演进接口

spec 中设计了两个装饰器：

```text
activeExperts outputSections 合并
evidence_digest 运行时降级
```

这个方向是合理的。它让基础策略先由 intent/thinkingLevel 决定，再允许运行时上下文做非破坏性修饰，为第3轮专家注册表和第4轮领域管线消费预留扩展点。

### 2.5 response.ts 职责收敛方向正确

第2轮目标是让 `response.ts` 只负责：

```text
构造 StrategyContext
  ↓
调用 resolveResponseStrategy(ctx)
  ↓
把 strategy.promptHint 注入 prompt
  ↓
按 strategy.sections 生成 DisplayContent
```

这能把“如何回复”的决策从节点执行逻辑中剥离出来，使 response 节点从策略拥有者变成策略消费者，降低后续扩展成本。

---

## 3. 需要修正的问题

### 3.1 类型文件路径与当前仓库真实结构不一致

handoff/spec/tasks 当前写的是：

```text
src/agents/types.ts
```

但当前仓库真实结构是：

```text
src/agents/types/index.ts
src/agents/types/structured-output.ts
```

`DisplayContent` 实际定义在：

```text
src/agents/types/structured-output.ts
```

建议将 spec、tasks、checklist 和 handoff 中的目标文件从：

```text
src/agents/types.ts
```

修正为：

```text
src/agents/types/structured-output.ts
```

否则执行者可能新建一个错误的 `types.ts` 文件，造成类型源头分裂。

### 3.2 registry 策略数量表述存在冲突

handoff/spec/tasks 主要列出：

```text
fast:chat
deep:analysis
deep:planning
deep:decision
deep:question
deep:creation
deep:modification
deep:fallback
```

这实际是 8 个 descriptor。

但 checklist 当前写：

```text
注册表含 8 个 descriptor + 1 个 catch-all 兜底（共 9 个策略）
```

这会导致执行者不确定是否需要在 `deep:fallback` 之外再新增一个 `catch-all`。

建议统一为：

```text
注册表含 8 个 descriptor，其中 deep:fallback 即 catch-all 兜底策略。
```

并明确：

```typescript
id: "deep:fallback"
priority: 1
matches: (ctx) => ctx.thinkingLevel === "deep"
```

这样可以避免两个兜底策略并存导致优先级和审计语义混乱。

### 3.3 section type 中 `risks` 与真实协议 `risk` 不一致

spec 中多处写到：

```text
risks
```

但当前 `DisplayContent.sections[].type` 的真实类型是：

```typescript
"risk"
```

当前 `response.ts` 也使用：

```typescript
type: "risk"
```

建议 spec 中区分“策略语义”和“前端协议”：

```text
策略语义可以称为 risks，但 DisplayContent.sections[].type 必须使用现有协议 "risk"。
```

并将策略 sections 示例统一改为：

```typescript
["conclusion", "evidence", "reasoning", "confidence", "risk", "interaction"]
```

否则实现时可能新增 `"risks"`，导致前端渲染器无法识别。

### 3.4 showEvidenceDigest 与 sections 的关系需要明确

spec 当前要求 `ResponseStrategy` 包含：

```text
sections
showEvidenceDigest
```

同时 analysis 策略写了 `showEvidenceDigest=true`，但 sections 示例中没有 `evidence_digest`。这会造成歧义：

```text
showEvidenceDigest=true 是否自动追加 evidence_digest？
sections 没写 evidence_digest 是否仍生成摘要？
装饰器降级时是改 showEvidenceDigest，还是删除 section？
```

建议明确：

```text
最终 DisplayContent 以 strategy.sections 为准。
showEvidenceDigest 是 evidence_digest section 的策略开关。
如果 showEvidenceDigest=false，装饰器必须从 sections 中移除 "evidence_digest"。
如果某策略希望展示证据摘要，必须显式把 "evidence_digest" 放入 sections。
```

示例：

```typescript
question.sections = ["conclusion", "evidence_digest", "evidence"]
question.showEvidenceDigest = true

analysis.sections = ["conclusion", "evidence", "reasoning", "confidence", "risk", "interaction"]
analysis.showEvidenceDigest = false
```

### 3.5 hasNonPriorEvidence 判定规则缺失

spec 当前只写：

```text
当 hasNonPriorEvidence=false 时，关闭 showEvidenceDigest
```

但没有定义如何判断“非先验证据”。当前 `EvidenceSource` 已包含多种来源：

```typescript
"document"
"knowledge"
"knowledge_empty"
"project_context"
"keywords"
"multimodal"
"task"
"economic"
"history"
"team_input"
"sensor"
```

建议补充判定规则：

```text
hasNonPriorEvidence = evidenceChain 中存在以下条件之一：
1. source 为 "knowledge" 或 "document"，且存在 chunkId。
2. source 为 "knowledge" 或 "document"，且 metadata.documentName / metadata.documentId 存在。
3. source 为 "task" / "economic" / "sensor" / "team_input" 等运行时业务数据源。

以下不算非先验证据：
- knowledge_empty
- project_context
- keywords
```

这能避免执行者把空知识库、关键词扩展或项目上下文误当作真实 evidence_digest 来源。

### 3.6 activeExperts 在第2轮只能作为预留字段

spec 中装饰器 1 写：

```text
当 activeExperts 非空时，收集各专家的 outputSections 并集，合并到 strategy.sections
```

但第3轮才会引入专家注册表和 AnalysisContext。如果第2轮不加边界说明，执行者可能提前创建专家注册表或从 ChatThread.metadata 中读取 AnalysisContext，造成轮次越界。

建议明确：

```text
本轮不得引入专家注册表、AnalysisContext 或专家持久化。
activeExperts 仅作为 StrategyContext 的可选预留输入。
response.ts 本轮默认传空数组，或仅从 conversationContext 做类型安全读取，但不得依赖第3轮结构。
```

建议轻量类型：

```typescript
interface StrategyActiveExpert {
  id: string
  outputSections: ResponseSectionType[]
}
```

### 3.7 maxTokens 是否接入 LLM 调用需要边界说明

spec 要求 `ResponseStrategy` 包含：

```text
maxTokens
```

但当前 response 节点使用：

```typescript
getLLM().stream(prompt)
```

文档没有说明当前 LLM wrapper 是否支持 per-call maxTokens。若强行实现，可能越界修改 LLM 封装或模型配置系统。

建议补充：

```text
maxTokens 本轮必须作为 ResponseStrategy 元数据产出。
如果当前 LLM wrapper 已支持 per-call options，则允许传入 maxTokens。
如果不支持，本轮不得为接入 maxTokens 大范围重构 LLM 层；只在 promptHint 中体现长度约束，并保留 maxTokens 供后续轮次消费。
```

### 3.8 新增 section 的数据来源和空数据行为需要细化

spec 当前只说：

```text
buildDisplayFromState SHALL 按 strategy.sections 过滤生成 section
```

但没有定义每种 section 的数据来源。建议补充映射表：

| section | 数据来源 | 空数据行为 |
|---|---|---|
| `conclusion` | streamedText 或 verdict.conclusion.content | 必须保留，使用 streamedText |
| `evidence` | structuredEvidenceChain.evidences | 无证据则不生成 |
| `evidence_digest` | EvidenceSummary 风格摘要：source/type/relevance/content slice | 无非先验证据则不生成 |
| `reasoning` | structuredReasoningPath.steps 或 verdict.reasoning_path | 无 reasoning steps 则不生成 |
| `confidence` | structuredVerdict.confidence | 无 verdict/confidence 则不生成 |
| `risk` | verdict.conclusion.risks | 无 risks 则不生成 |
| `interaction` | pendingInteraction | 无 interaction 则不生成 |
| `action_steps` | verdict.conclusion.actions | 无 actions 则不生成 |
| `timeline` | actions 或 metadata 中可推导时间信息 | 无可用时间信息则不生成，不伪造 |

尤其 `timeline` 必须明确：

```text
没有结构化时间信息时不得编造时间线。
```

### 3.9 fast/chat greeting 场景应明确也走策略裁决

当前 `response.ts` greeting 分支返回：

```typescript
sections: []
```

但第2轮验收标准要求：

```text
“你好” → sections 仅 conclusion，promptHint 含 “1-2句话”
```

建议明确：

```text
即使是纯 greeting，也必须构造 StrategyContext 并调用 resolveResponseStrategy。
fast/chat 场景必须生成 conclusion section，不允许返回空 sections。
```

否则 checklist 中 fast 验收无法通过。

### 3.10 单元测试要求缺少文件位置和最小场景集合

tasks.md 当前写：

```text
验证：单元测试调用 resolveResponseStrategy 确认各意图匹配正确
```

但没有指定测试文件和最小覆盖场景。

建议明确新增测试：

```text
src/agents/response-strategy.test.ts
```

最小覆盖：

```text
fast chat → fast:chat
深度 analysis → deep:analysis
深度 planning → deep:planning
深度 question → deep:question
深度未知 intent → deep:fallback
priority desc 生效
evidence_digest 无非先验证据时降级
activeExperts outputSections 合并且去重
```

如果本轮不希望新增测试文件，则 tasks 应明确改为：

```text
通过 TypeScript 类型检查 + 临时验证脚本或人工调用 resolveResponseStrategy 验证，不新增测试文件。
```

但不建议保持当前模糊表述。

---

## 4. 越界检查

本次第2轮文档整体没有明显越界，核心内容仍属于响应策略闭包：

```text
StrategyDescriptor
StrategyContext
ResponseStrategy
resolveResponseStrategy
strategy.sections
strategy.promptHint
strategy.maxTokens 元数据
showEvidenceDigest 降级
response.ts 消费策略裁决
DisplayContent section type 扩展
```

但以下位置存在潜在越界风险，需要通过 spec 修正约束：

```text
activeExperts 装饰器可能提前引入第3轮 ExpertRegistry / AnalysisContext
maxTokens 可能诱导修改 LLM 封装层
新增 timeline 可能诱导编造计划时间线
DisplayContent section type 可能误新增 risks 破坏前端协议
错误文件路径可能诱导新建 src/agents/types.ts 造成类型源头分裂
```

只要补充上述边界说明，第2轮仍可保持原子事务完整性。

---

## 5. 建议修正优先级

### 高优先级

1. 将 `src/agents/types.ts` 修正为 `src/agents/types/structured-output.ts`。
2. 统一 registry 数量：8 个 descriptor，`deep:fallback` 即 catch-all。
3. 将策略 sections 中的 `risks` 统一为前端协议 `risk`。
4. 明确 `activeExperts` 本轮只是预留字段，不引入 ExpertRegistry / AnalysisContext。
5. 明确 fast/chat greeting 也必须经过策略裁决并产出 conclusion section。

### 中优先级

6. 明确 `showEvidenceDigest` 与 `sections` 的关系。
7. 明确 `hasNonPriorEvidence` 判定规则。
8. 明确新增 section 的数据来源和空数据行为，尤其 timeline 不得伪造。
9. 明确 `maxTokens` 是元数据还是真实接入 LLM 调用。
10. 明确单元测试文件位置和最小覆盖场景。

---

## 6. 最终建议

第2轮 spec/tasks/checklist/handoff 可以作为执行基础，但建议先完成上述修正，再让代码执行 AI 开始修改源代码。

推荐执行顺序：

```text
先修正文档契约一致性
  ↓
复查 handoff / spec / tasks / checklist 的文件路径、策略数量、section type、越界禁止项
  ↓
再进入第2轮代码修改
  ↓
新建 response-strategy.ts
  ↓
改造 response.ts 消费 resolveResponseStrategy
  ↓
修改 structured-output.ts 扩展 DisplayContent.sections 类型
  ↓
逐文件 record_dev_operation
  ↓
用 query_audit_logs 回查第2轮关键 action
```

第2轮完成的判定不应只看 `npx tsc --noEmit`，还必须确认：

```text
ResponseStrategy 是唯一裁决入口
registry 使用 descriptor 自声明 matches
response.ts 不再保留策略硬编码三段分支
fast/chat sections 仅 conclusion
analysis/planning/question/fallback sections 符合策略契约
DisplayContent section type 未破坏现有前端协议
ADD-7 审计 action 完整落库
```
