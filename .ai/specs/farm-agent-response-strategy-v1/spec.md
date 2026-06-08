# 裁决层 — ResponseStrategy 集中管理 Spec

## Why

当前 response 节点的回复策略（system prompt 约束、输出格式、section 组合）分散在 `buildStreamingTextPrompt` 和 `buildDisplayFromState` 两处，通过三段硬编码分支选择。修改策略需改动多处，且不同类型的意图（analysis/planning/question 等）需要不同的 sections 组合和 prompt 约束。需要将策略集中到裁决层，response 节点只消费已决策结果。

第2轮的目标是建立 ResponseStrategy 闭包，保护本轮不要从“策略裁决层”滑向“半个领域专家系统 + 半个报告系统 + 半个 LLM 配置系统”。

## What Changes

- 新建 `src/agents/response-strategy.ts`：基于自声明策略描述符（StrategyDescriptor）的注册表模式，每个描述符携带 matches(ctx) 自声明匹配规则 + priority 优先级 + apply 产出配置
- 新建 `src/agents/response-strategy.test.ts`：只测试纯策略裁决，不依赖 LLM、Prisma、stream-bus、ChatThread、AnalysisContext 或前端
- 裁决函数 `resolveResponseStrategy(ctx)` 遍历注册表 → filter(matches) → sort(priority desc) → pick first → 叠加装饰器管道 → 产出最终 ResponseStrategy
- response.ts 改为消费裁决结果，替代硬编码三段分支
- `DisplayContent.sections` 联合类型扩展为支持 evidence_digest / action_steps / timeline

## Impact

- Affected specs: 无
- Affected code: `src/agents/response-strategy.ts`（新建）, `src/agents/response-strategy.test.ts`（新建）, `src/agents/nodes/response.ts`（修改）, `src/agents/types/structured-output.ts`（修改）
- 父 Plan: [co-agent-simplified-v1.md](../../documents/co-agent-simplified-v1.md)
- 依赖: 第1轮(基础层) — 需要 thinkingLevel 类型 + EvidenceRef
- 后续依赖: 第3轮(领域上下文闭包) 和第4轮(领域管线消费)

## Boundaries

第2轮只允许实现：

```text
ResponseStrategy registry
response.ts 消费 resolveResponseStrategy
DisplayContent section type 扩展
response-strategy 纯策略单元测试
```

第2轮禁止实现：

```text
ExpertRegistry
AnalysisContext
activeExperts 持久化
ChatThread.metadata 读写
LLM wrapper 重构
report generator
timeline 编造
前端协议新分叉
```

## ADDED Requirements

### Requirement: 策略描述符注册表

系统 SHALL 提供策略描述符注册表，每个描述符携带：
- `id`：唯一标识（如 "fast:chat" / "deep:analysis"）
- `matches(ctx: StrategyContext): boolean`：自声明匹配规则
- `priority: number`：20=deep 精确匹配，10=fast 策略，1=deep fallback
- `apply: ResponseStrategy`：匹配成功后产出的策略配置

注册表 SHALL 只包含 8 个 descriptor：

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

`deep:fallback` 即 catch-all 兜底策略，不再额外创建第 9 个 catch-all descriptor。

裁决上下文 `StrategyContext` SHALL 包含：thinkingLevel, intent, activeExperts, hasNonPriorEvidence。

`activeExperts` 仅作为可选预留输入存在。本轮 response.ts SHALL 默认传空数组，不得从 conversationContext、ChatThread.metadata 或 AnalysisContext 推断 activeExperts。

#### Scenario: 策略自声明匹配
- **WHEN** ctx.thinkingLevel="fast"
- **THEN** id="fast:chat" 的 descriptor 返回 matches=true
- **THEN** 其他 descriptor 的 matches 按各自规则判断

#### Scenario: 优先级打破平局
- **WHEN** 同一上下文有多个 descriptor 匹配
- **THEN** 取 priority 最高者（20 > 10 > 1）

#### Scenario: deep fallback 兜底
- **WHEN** ctx.thinkingLevel="deep" AND intent 无精确匹配
- **THEN** id="deep:fallback" 的 descriptor SHALL 匹配
- **THEN** priority SHALL 为 1

### Requirement: 策略配置产出

`ResponseStrategy` 类型 SHALL 包含：
- `id`：最终策略 id
- `sections`：输出的 section 类型列表（conclusion/evidence/evidence_digest/reasoning/confidence/risk/interaction/action_steps/timeline）
- `promptHint`：注入 system prompt 末尾的约束文本
- `maxTokens`：回复最大 token 数策略元数据
- `showEvidenceDigest`：是否允许展示证据摘要

策略语义可以称为 risks，但 `DisplayContent.sections[].type` 必须使用现有前端协议 `"risk"`，不得新增 `"risks"` section type。

`maxTokens` 本轮必须作为 ResponseStrategy 元数据产出。如果当前 LLM wrapper 已支持 per-call options，则允许传入 maxTokens；如果不支持，本轮不得为接入 maxTokens 重构 LLM 层，只在 promptHint 中体现长度约束，并保留 maxTokens 供后续轮次消费。

`showEvidenceDigest` 与 `sections` 的关系如下：
- 最终 DisplayContent 以 `strategy.sections` 为准
- `showEvidenceDigest` 是 evidence_digest section 的策略开关
- 如果 `showEvidenceDigest=false`，装饰器必须从 sections 中移除 `"evidence_digest"`
- 如果某策略希望展示证据摘要，必须显式把 `"evidence_digest"` 放入 sections

#### Scenario: fast 策略
- **WHEN** thinkingLevel="fast"
- **THEN** sections=["conclusion"], promptHint="回复控制在1-2句话以内，不要展开", maxTokens=256, showEvidenceDigest=false

#### Scenario: analysis 策略
- **WHEN** thinkingLevel="deep" AND intent="analysis"
- **THEN** sections=["conclusion","evidence","reasoning","confidence","risk","interaction"], promptHint 含"先给出分析结论，再从依据→推理→置信度→风险逐一展开", maxTokens=2048, showEvidenceDigest=false

#### Scenario: planning 策略
- **WHEN** thinkingLevel="deep" AND intent="planning"
- **THEN** sections=["conclusion","action_steps","timeline","risk","interaction"], showEvidenceDigest=false

#### Scenario: question 策略
- **WHEN** thinkingLevel="deep" AND intent="question"
- **THEN** sections=["conclusion","evidence_digest","evidence"], maxTokens=512, showEvidenceDigest=true

#### Scenario: catch-all 回退
- **WHEN** thinkingLevel="deep" AND intent 无精确匹配
- **THEN** 回退到 id="deep:fallback"（priority=1），sections=["conclusion","evidence","reasoning","confidence","risk","interaction"]

### Requirement: 装饰器管道

`resolveResponseStrategy` SHALL 在匹配到的 descriptor.apply 基础上依次运行装饰器：

**装饰器1 — 分析专家 section 合并**：当 activeExperts 非空时，收集各专家的 outputSections 并集，合并到 strategy.sections，并去重。

本轮不得实现 ExpertRegistry、AnalysisContext 或 activeExperts 持久化。activeExperts 装饰器仅通过 `src/agents/response-strategy.test.ts` 验证，不接入运行时专家来源。

**装饰器2 — evidence_digest 运行时降级**：当 hasNonPriorEvidence=false 时，关闭 showEvidenceDigest，并从 strategy.sections 中移除 `"evidence_digest"`。

#### Scenario: 无非先验证据降级
- **WHEN** all evidence 都是先验知识或空检索占位
- **THEN** showEvidenceDigest 自动降级为 false（即使策略配置为 true）
- **THEN** sections 中不包含 `"evidence_digest"`

### Requirement: 非先验证据判定

`hasNonPriorEvidence` SHALL 由 response.ts 基于 evidenceChain 计算。

以下情况算非先验证据：

```text
1. source 为 "knowledge" 或 "document"，且存在 chunkId。
2. source 为 "knowledge" 或 "document"，且 metadata.documentName / metadata.documentId 存在。
3. source 为 "task" / "economic" / "sensor" / "team_input" 等运行时业务数据源。
```

以下情况不算非先验证据：

```text
knowledge_empty
project_context
keywords
```

### Requirement: section 数据来源和空数据行为

`buildDisplayFromState` SHALL 按 strategy.sections 过滤生成 section，并遵循以下数据来源：

| section | 数据来源 | 空数据行为 |
|---|---|---|
| `conclusion` | streamedText 或 verdict.conclusion.content | 必须保留，优先使用 streamedText |
| `evidence` | structuredEvidenceChain.evidences | 无证据则不生成 |
| `evidence_digest` | EvidenceSummary 风格摘要：source/type/relevance/content slice | 无非先验证据则不生成 |
| `reasoning` | structuredReasoningPath.steps 或 verdict.reasoning_path | 无 reasoning steps 则不生成 |
| `confidence` | structuredVerdict.confidence | 无 verdict/confidence 则不生成 |
| `risk` | verdict.conclusion.risks | 无 risks 则不生成 |
| `interaction` | pendingInteraction | 无 interaction 则不生成 |
| `action_steps` | verdict.conclusion.actions | 无 actions 则不生成 |
| `timeline` | actions 或 metadata 中可推导时间信息 | 无可用时间信息则不生成，不伪造 |

`timeline` section 只有在已有结构化时间数据时生成，不得让 LLM 或 response.ts 编造时间线。

## MODIFIED Requirements

### Requirement: DisplayContent.sections 联合类型扩展

`DisplayContent["sections"]` 的 section.type 联合类型 SHALL 在 `src/agents/types/structured-output.ts` 中新增 `"evidence_digest"`、`"action_steps"`、`"timeline"` 三种类型。

不得新建 `src/agents/types.ts`，不得新增 `"risks"` section type，风险 section 必须继续使用现有 `"risk"` 协议。

### Requirement: response 节点使用策略裁决

response 节点 SHALL 构建 `StrategyContext` 并调用 `resolveResponseStrategy(ctx)` 替代硬编码三段分支逻辑。`buildStreamingTextPrompt` SHALL 在 system prompt 末尾追加 strategy.promptHint。`buildDisplayFromState` SHALL 按 strategy.sections 过滤生成 section。

即使是纯 greeting 或 fast/chat 场景，也必须构造 StrategyContext 并调用 resolveResponseStrategy。fast/chat 场景必须生成 conclusion section，不允许返回空 sections。

本轮 response.ts 构造 StrategyContext 时 SHALL 使用 `activeExperts: []`，不得从 conversationContext、ChatThread.metadata 或 AnalysisContext 推断 activeExperts。

## ADDED Tests

### Requirement: ResponseStrategy 纯策略单元测试

系统 SHALL 新增 `src/agents/response-strategy.test.ts`，最小覆盖：

```text
fast chat → fast:chat
deep analysis → deep:analysis
deep planning → deep:planning
deep question → deep:question
deep unknown → deep:fallback
priority desc 生效
evidence_digest 无非先验证据时降级
activeExperts outputSections 合并且去重
```

当前全局 test suite 可能仍有历史基线问题；本轮新增测试必须自身类型干净，可单独运行/通过，不以全量 test suite 立刻通过作为唯一前置条件。

## REMOVED Requirements

### Requirement: response.ts 硬编码三段分支
**Reason**: 策略分散，难以扩展新的意图类型
**Migration**: 改为消费 `resolveResponseStrategy(ctx)` 的裁决结果
