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

## ADDED Requirements

### Requirement: 分析专家注册表

系统 SHALL 提供 `ANALYSIS_EXPERTS: Record<string, AnalysisExpert>` 注册表。

每个 `AnalysisExpert` 定义：
- `id`：唯一标识（如 "crop_compare"）
- `label`：显示名（如 "作物对比分析"）
- `domain`：所属领域（"种植" | "经济" | "管收"）
- `description`：一句话说明
- `inputSchema`：需要的输入参数（key/label/required）
- `outputSections`：产出的 section 类型列表
- `promptTemplate`：推理维度指令片段
- `evidenceFilter`：RAG 检索过滤条件（可选）
- `reportFormats`：支持的导出格式列表（第一个为默认格式）

#### Scenario: 专家注册表可用
- **WHEN** 运行时读取 `ANALYSIS_EXPERTS`
- **THEN** 含 crop_compare / roi_analysis / pest_risk 三个专家
- **THEN** 每个专家有四属性（inputSchema/outputSections/promptTemplate/evidenceFilter）和 reportFormats

### Requirement: 跨轮分析记忆

系统 SHALL 通过 `AnalysisContext` 类型提供跨轮记忆能力，持久化到 `ChatThread.metadata.analysisContext`（JSON 字段）：

- `activeExperts`：用户已激活的分析专家列表（含 expertId + 激活时间戳）
- `runtimeInputs`：实时参数变量（覆盖式更新，如地块、作物、季节）
- `turnHistory`：每轮管线的诊断记录（供演化回路使用）
- `totalTurns`：总对话轮数

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
- `saveAnalysisContext(threadId: string, context: AnalysisContext): Promise<void>` — 持久化
- `activateExpert(ctx, expertId: string): AnalysisContext` — 激活（去重）
- `deactivateExpert(ctx, expertId: string): AnalysisContext` — 停用
- `updateRuntimeInput(ctx, key: string, value: string, label: string): AnalysisContext` — 更新参数
- `appendTurnRecord(ctx, record): AnalysisContext` — 追加诊断记录

## MODIFIED Requirements

无（纯新增基础设施）

## REMOVED Requirements

无
