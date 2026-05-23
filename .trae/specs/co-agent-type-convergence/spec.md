# 基础层 — 类型收敛 + thinkingLevel 路由 Spec

## Why

当前代码存在两套 Evidence 定义（`src/types/evidence.ts` 与 `src/agents/state.ts` 内联定义）字段不一致，且所有意图无差别走完整 6 节点管线，chat 意图浪费 token 和延迟。需要在所有后续步骤之前统一类型基础，并建立 fast/deep 双通道路由。

## What Changes

- 统一 Evidence 接口，合并两套定义的所有字段，新增 EvidenceRef（引用句柄）和 EvidenceSummary（展示摘要）
- 删除 `state.ts` 和 `prompts/types.ts` 中的内联 Evidence 定义，改为 import 统一类型
- `CurrentTask` 新增 `thinkingLevel` 字段，intention 节点输出时设置（chat → fast，其余 → deep）
- `routeByIntent` 按 thinkingLevel 分流：fast → response，deep → retrieval

## Impact

- Affected specs: 无（本项目首个 co-agent 子计划）
- Affected code: `src/types/evidence.ts`, `src/agents/state.ts`, `src/agents/prompts/types.ts`, `src/agents/nodes/intention.ts`, `src/agents/edges/conditional.ts`, `src/agents/nodes/retrieval.ts`, `src/agents/nodes/interaction-point-detection.ts`, `src/agents/prompts/interaction-point-detection.ts`
- 父 Plan: [co-agent-simplified-v1.md](../../documents/co-agent-simplified-v1.md)
- 后续依赖: 第2轮(裁决层)、第3轮(领域基础设施)

## ADDED Requirements

### Requirement: 统一 Evidence 类型

系统 SHALL 在 `src/types/evidence.ts` 中唯一定义 Evidence 接口，合并 `expandable`/`detailUrl`/`score`/`chunkId` 字段，并新增 `EvidenceRef`（prompt 中引用证据时使用，不含完整 content）和 `EvidenceSummary`（前端 evidence_digest section 使用）接口。

#### Scenario: Evidence 字段合并
- **WHEN** 开发者在任意文件中 import { Evidence } from "@/types/evidence"
- **THEN** Evidence 接口包含：id, chunkId?, source, type, content, reliability, relevance, timestamp, expires_at?, metadata, expandable?, detailUrl?, score?

#### Scenario: EvidenceRef 引用能力
- **WHEN** prompt types 中需要引用证据但不传完整 content
- **THEN** 使用 EvidenceRef 类型：id, chunkId?, source, reliability, relevance, docName, contentExcerpt?

### Requirement: thinkingLevel 路由

系统 SHALL 在 intention 节点解析意图后设置 `currentTask.thinkingLevel`：
- chat 意图 → `"fast"`
- 其余所有意图 → `"deep"`

`routeByIntent` 函数 SHALL 按 thinkingLevel 分流：
- fast → `"response"`（跳过 retrieval/reasoning/verdict）
- deep → `"retrieval"`（走完整 6 节点管线）

#### Scenario: fast 通道
- **WHEN** 用户发送"你好"
- **THEN** SSE 事件序列为 intention → response，不出现 retrieval/reasoning/verdict 事件

#### Scenario: deep 通道
- **WHEN** 用户发送"水稻育秧步骤"
- **THEN** SSE 事件序列为 intention → retrieval → reasoning → verdict → response

#### Scenario: thinkingLevel fallback
- **WHEN** currentTask.thinkingLevel 未定义
- **THEN** 默认按 `"deep"` 处理，走完整管线

## MODIFIED Requirements

无（本项目首个子计划，纯增量修改）

## REMOVED Requirements

### Requirement: state.ts 内联 Evidence 定义
**Reason**: 与 `src/types/evidence.ts` 重复定义，字段不一致
**Migration**: 改为 `import { Evidence } from "@/types/evidence"`
