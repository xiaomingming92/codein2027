# 裁决层 — ResponseStrategy 集中管理 Spec

## Why

当前 response 节点的回复策略（system prompt 约束、输出格式、section 组合）分散在 `buildStreamingTextPrompt` 和 `buildDisplayFromState` 两处，通过三段硬编码分支选择。修改策略需改动多处，且不同类型的意图（analysis/planning/question 等）需要不同的 sections 组合和 prompt 约束。需要将策略集中到裁决层，组件只消费已决策结果。

## What Changes

- 新建 `src/agents/response-strategy.ts`：基于自声明策略描述符（StrategyDescriptor）的注册表模式，每个描述符携带 matches(ctx) 自声明匹配规则 + priority 优先级 + apply 产出配置
- 裁决函数 `resolveResponseStrategy(ctx)` 遍历注册表 → filter(matches) → sort(priority) → 叠加修饰器管道 → 产出最终 ResponseStrategy
- response.ts 改为消费裁决结果，替代硬编码三段分支
- `DisplayContent.sections` 联合类型扩展为支持 evidence_digest / action_steps / timeline

## Impact

- Affected specs: 无
- Affected code: `src/agents/response-strategy.ts`（新建）, `src/agents/nodes/response.ts`（修改）, `src/agents/types.ts`（修改）
- 父 Plan: [co-agent-simplified-v1.md](../../documents/co-agent-simplified-v1.md)
- 依赖: 第1轮(基础层) — 需要 thinkingLevel 类型 + EvidenceRef
- 后续依赖: 第4轮(领域集成)

## ADDED Requirements

### Requirement: 策略描述符注册表

系统 SHALL 提供策略描述符注册表，每个描述符携带：
- `id`：唯一标识（如 "fast:chat" / "deep:analysis"）
- `matches(ctx: StrategyContext): boolean`：自声明匹配规则
- `priority: number`：10=通用兜底, 20=意图精确匹配
- `apply: ResponseStrategy`：匹配成功后产出的策略配置

裁决上下文 `StrategyContext` SHALL 包含：thinkingLevel, intent, activeExperts, hasNonPriorEvidence

#### Scenario: 策略自声明匹配
- **WHEN** ctx.thinkingLevel="fast"
- **THEN** id="fast:chat" 的 descriptor 返回 matches=true
- **THEN** 其他 descriptor 的 matches 按各自规则判断

#### Scenario: 优先级打破平局
- **WHEN** 同一上下文有多个 descriptor 匹配
- **THEN** 取 priority 最高者（20 > 10 > 1）

### Requirement: 策略配置产出

`ResponseStrategy` 类型 SHALL 包含：
- `sections`：输出的 section 类型列表（conclusion/evidence/evidence_digest/reasoning/confidence/risks/interaction/action_steps/timeline）
- `promptHint`：注入 system prompt 末尾的约束文本
- `maxTokens`：回复最大 token 数
- `showEvidenceDigest`：是否展示证据摘要

#### Scenario: fast 策略
- **WHEN** thinkingLevel="fast"
- **THEN** sections=["conclusion"], promptHint="回复控制在1-2句话以内，不要展开", maxTokens=256, showEvidenceDigest=false

#### Scenario: analysis 策略
- **WHEN** thinkingLevel="deep" AND intent="analysis"
- **THEN** sections=["conclusion","evidence","reasoning","confidence","risks","interaction"], promptHint 含"先给出分析结论，再从依据→推理→置信度→风险逐一展开", maxTokens=2048, showEvidenceDigest=true

#### Scenario: planning 策略
- **WHEN** thinkingLevel="deep" AND intent="planning"
- **THEN** sections=["conclusion","action_steps","timeline","risks","interaction"], showEvidenceDigest=false

#### Scenario: question 策略
- **WHEN** thinkingLevel="deep" AND intent="question"
- **THEN** sections=["conclusion","evidence_digest","evidence"], maxTokens=512

#### Scenario: catch-all 回退
- **WHEN** thinkingLevel="deep" AND intent 无精确匹配
- **THEN** 回退到 id="deep:fallback"（priority=1），sections=["conclusion","evidence","reasoning","confidence","risks","interaction"]

### Requirement: 修饰器管道

`resolveResponseStrategy` SHALL 在匹配到的 descriptor.apply 基础上依次运行修饰器：

**修饰器1 — 分析专家 section 合并**：当 activeExperts 非空时，收集各专家的 outputSections 并集，合并到 strategy.sections

**修饰器2 — evidence_digest 运行时降级**：当 hasNonPriorEvidence=false 时，关闭 showEvidenceDigest

#### Scenario: 无先验证据降级
- **WHEN** all evidence 都是先验知识（无实际 ChromaDB 来源）
- **THEN** showEvidenceDigest 自动降级为 false（即使策略配置为 true）

## MODIFIED Requirements

### Requirement: DisplayContent.sections 联合类型扩展

`DisplayContent["sections"]` 的 section.type 联合类型 SHALL 新增 `"evidence_digest"`、`"action_steps"`、`"timeline"` 三种类型。

### Requirement: response 节点使用策略裁决

response 节点 SHALL 构建 `StrategyContext` 并调用 `resolveResponseStrategy(ctx)` 替代硬编码三段分支逻辑。`buildStreamingTextPrompt` SHALL 在 system prompt 末尾追加 strategy.promptHint。`buildDisplayFromState` SHALL 按 strategy.sections 过滤生成 section。

## REMOVED Requirements

### Requirement: response.ts 硬编码三段分支
**Reason**: 策略分散，难以扩展新的意图类型
**Migration**: 改为消费 `resolveResponseStrategy(ctx)` 的裁决结果
