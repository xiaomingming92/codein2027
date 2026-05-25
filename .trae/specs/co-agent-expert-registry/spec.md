# 领域基础设施 — 分析专家注册表 + AnalysisContext Spec

## Why

当前 Agent 推理维度固定，用户无法选择分析角度（作物对比/ROI/病虫害等），且每轮对话独立、无法跨轮保持激活状态。需要建立分析专家注册表（同一个 LLM + 不同 prompt 模板）和跨轮记忆机制（AnalysisContext），所有数据走 ChatThread.metadata JSON 字段，不改 Prisma Schema。

## What Changes

- 新建 `src/agents/experts/registry.ts`：AnalysisExpert 接口 + ANALYSIS_EXPERTS 注册表（初始 3 个专家：crop_compare / roi_analysis / pest_risk）
- 新建 `src/services/analysis-context.ts`：AnalysisContext（含 activeExperts + runtimeInputs + turnHistory）+ CRUD 函数
- AgentState 新增 analysisContext 字段
- stream/route.ts 请求前后加载/保存 AnalysisContext

## Impact

- Affected specs: 无
- Affected code: `src/agents/experts/registry.ts`（新建）, `src/services/analysis-context.ts`（新建）, `src/agents/state.ts`（修改）, `src/app/api/agent/chat/stream/route.ts`（修改）
- 父 Plan: [co-agent-simplified-v1.md](../../documents/co-agent-simplified-v1.md)
- 依赖: 第1轮(基础层) — 需要 state.ts 类型
- 后续依赖: 第4轮(领域集成)

## 文档先行（ADD-0.1）：第3轮执行顺序

> 架构文档是代码变更的源头和依据。本轮涉及的跨轮机制、专家注册表、thinkingLevel 路由等概念必须在架构文档中写明后再写代码。

### 第3轮三步执行闭环

```
Step 1: 更新架构文档
  │  检查 docs/大田精准耕播智能决策系统/knowledge/01-架构/ 下两份架构说明书
  │  确认第1轮（类型收敛）、第2轮（ResponseStrategy）、第3轮（跨轮AnalysisContext + 专家注册表）已完整描述
  │  如有缺失先补文档，再进入代码实现
  │
  ▼
Step 2: 实施代码
  │  按 tasks.md 顺序实现：registry.ts → analysis-context.ts → state.ts → stream/route.ts
  │  每完成一个文件修改：record_dev_operation 写入 ADD-7 审计
  │  checklist 逐项验证通过
  │
  ▼
Step 3: 验收后回看架构文档
  │  代码实现完成 + 验收通过后，重新阅读架构文档
  │  确认：文档中的接口/合约/数据流与最终实现一致
  │  如有偏差：修正架构文档（而非放任文档与代码不一致）
```

> **关键原则**：架构文档不是一次性的——Step 1 写初版，Step 3 做最终校准。禁止出现"代码改了但文档没跟上"的情况。

### 本轮涉及的架构文档

| 架构文档 | 本轮相关章节 | 需要写入的内容 |
|---------|------------|--------------|
| `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统技术架构说明书》.md` | 8.3 节 | 分析专家注册表 + 跨轮 AnalysisContext（activeExperts/runtimeInputs/turnHistory/字段职责边界/metadata共存策略） |
| `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统决策管线架构说明书》.md` | 设计约束 + 状态字段 + 拓扑图 | thinkingLevel 路由、ResponseStrategy 集中裁决、analysisContext 状态字段 |

## ADDED Requirements

### Requirement: 分析专家注册表

系统 SHALL 提供 `ANALYSIS_EXPERTS: Record<string, AnalysisExpert>` 注册表。

每个 `AnalysisExpert` 定义：
- `id`：唯一标识（如 "crop_compare"）
- `label`：显示名（如 "作物对比分析"）
- `domain`：所属领域（"种植" | "经济" | "管收"）
- `description`：一句话说明
- `inputSchema`：需要的输入参数（key/label/required）
- `outputSections`：产出的 section 类型列表（必须使用 DisplayContent 协议中的单数形式，如 `"risk"` 而非 `"risks"`；对照 ResponseStrategy.sections 联合类型，实现时使用共享类型以避免不一致）
- `promptTemplate`：推理维度指令片段
- `evidenceFilter`：RAG 检索过滤条件（可选）
- `reportFormats`：支持的导出格式列表（第一个为默认格式）

> **类型兼容性约束**：`AnalysisExpert.outputSections` 的联合类型成员必须是 `ResponseStrategy.sections` 联合类型的子集。第4轮消费时通过修饰器管道合并到 `strategy.sections`，类型不兼容时编译器报错。

#### Scenario: 专家注册表可用
- **WHEN** 运行时读取 `ANALYSIS_EXPERTS`
- **THEN** 含 crop_compare / roi_analysis / pest_risk 三个专家
- **THEN** 每个专家有四属性（inputSchema/outputSections/promptTemplate/evidenceFilter）和 reportFormats

#### Scenario: 无效 expertId 防御
- **WHEN** `activateExpert(ctx, "non_existent")` 调用时 expertId 不在 ANALYSIS_EXPERTS 中
- **THEN** 静默忽略（返回原 ctx 不变），同时 `console.warn` 记录无效 expertId
- **AND** 不抛出异常、不中断 Agent 管线

### Requirement: 跨轮分析记忆

系统 SHALL 通过 `AnalysisContext` 类型提供跨轮记忆能力，持久化到 `ChatThread.metadata.analysisContext`（JSON 字段）：

- `activeExperts`：用户已激活的分析专家列表（含 expertId + 激活时间戳）
- `runtimeInputs`：实时参数变量（覆盖式更新，如地块、作物、季节）
- `turnHistory`：每轮管线的诊断记录（供演化回路使用）
- `totalTurns`：总对话轮数

> **AgentState 字段职责边界**：
> - `conversationContext: Record<string, unknown>` — 当前请求级别的元数据（traceId, modelConfig 等），生命周期为单次请求
> - `analysisContext: AnalysisContext | null` — 跨轮持久化的分析记忆（activeExperts, runtimeInputs, turnHistory），生命周期为整个 thread
>
> 两者职责不重叠。新增字段首先判断属于"单次请求元数据"还是"跨轮持久化记忆"，避免误放入 conversationContext。

> **ChatThread.metadata 共存策略**：`stream/route.ts` 已存在 `chatPersistence.saveAuditData(threadId, auditData)` 写入 `ChatThread.metadata` 的路径。`saveAnalysisContext` 必须读取现有 `ChatThread.metadata`，仅更新 `metadata.analysisContext` 字段，保留已有的 `auditData` 和其他 metadata 字段。实现方式为浅合并：`{ ...existingMetadata, analysisContext: newContext }`。

#### Scenario: 跨轮激活保持
- **WHEN** 第1轮用户激活 crop_compare 和 roi_analysis
- **AND** 第2轮用户发送追问
- **THEN** 加载 analysisContext 后 activeExperts 仍为 ["crop_compare", "roi_analysis"]

#### Scenario: expert 去重
- **WHEN** 重复激活同一 expertId
- **THEN** activeExperts 中仅出现一次

#### Scenario: runtimeInput 覆盖更新
- **WHEN** 第1轮 runtimeInputs.crops = "水稻,玉米"
- **AND** 第2轮 runtimeInputs.crops = "水稻,玉米,大豆"
- **THEN** crops 值为 "水稻,玉米,大豆"（后覆盖前）

### Requirement: AnalysisContext CRUD

系统 SHALL 提供以下函数：
- `getAnalysisContext(threadId: string): Promise<AnalysisContext | null>` — 从 ChatThread.metadata 加载
- `saveAnalysisContext(threadId: string, context: AnalysisContext): Promise<void>` — 持久化（浅合并到现有 metadata，保留已有字段）
- `activateExpert(ctx, expertId: string): AnalysisContext` — 激活（先验证 expertId 存在于 ANALYSIS_EXPERTS，再去重；无效 expertId 静默忽略）
- `deactivateExpert(ctx, expertId: string): AnalysisContext` — 停用
- `updateRuntimeInput(ctx, key: string, value: string, label: string): AnalysisContext` — 更新参数
- `appendTurnRecord(ctx, record): AnalysisContext` — 追加诊断记录（本轮实现函数体，调用方在第6轮演化回路接入）

## MODIFIED Requirements

无（纯新增基础设施）

## REMOVED Requirements

无
