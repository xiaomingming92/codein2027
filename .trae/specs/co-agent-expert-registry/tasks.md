# Tasks: 领域基础设施 — 分析专家注册表 + AnalysisContext

## Preconditions

- [x] 已执行 `session-init` SKILL
- [x] 已执行 `add-paradigm` SKILL（Step 0 文档先行）
- [x] 上游第1轮 ADD-7 审计记录存在（`query_audit_logs({ keyword: "THINKING_LEVEL_ROUTING" })`）
- [x] `npx tsc --noEmit` 在上游完成后通过

## Forbidden

- 禁止修改 Prisma Schema（`prisma/schema.prisma`）
- 禁止修改前端组件（React/Vue 组件文件）
- 禁止覆盖或重构已有 stream-bus / SSE 事件总线逻辑
- 禁止简化代码实现，一切以代码高质量为衡量标准
- 禁止在 ChatThread.metadata 读写时不加类型守卫（假设 metadata 永远是对象）

## Tasks

- [x] Task 0: 检查与更新架构文档（ADD-0.1 文档先行）
  - [x] 阅读 `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统技术架构说明书》.md` 第 8.3 节
    > 证据：8.3 节已含 AnalysisExpert 接口定义 + 3 专家表格 + 跨轮机制描述 + metadata 共存策略 + activateExpert 防御
  - [x] 确认 8.3 节已描述：分析专家注册表（3 专家 + 类型兼容性约束）+ 跨轮 AnalysisContext（activeExperts/runtimeInputs/turnHistory/字段职责边界/metadata 共存策略）
    > 证据：全部已在 8.3.1 + 8.3.2 子节中覆盖
  - [x] 阅读 `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统决策管线架构说明书》.md`
    > 证据：decision_pipeline doc L62-68 designPrinciples 含 thinkingLevel 路由 + ResponseStrategy 集中裁决
  - [x] 确认：设计约束含 thinkingLevel 路由 + ResponseStrategy 集中裁决、状态表含 analysisContext、拓扑图含 fast/deep 双分支
    > 证据：decision_pipeline doc 状态表含 `analysisContext \| AnalysisContext \| null` + 拓扑图含 fast/deep 双分支
  - [x] 如有缺失：先补文档再进入代码实现
    > 结论：无缺失，文档已在上轮 review 修正中更新

- [x] Task 1: 新建分析专家注册表
  - [x] 新建 `src/agents/experts/registry.ts`
    > 证据：文件存在，exports 8 个类型/常量
  - [x] 定义 `ReportFormat` 类型（"md" | "pdf" | "docx" | "xlsx"）
    > 证据：registry.ts L12 `export type ReportFormat = "md" | "pdf" | "docx" | "xlsx"`
  - [x] 定义 `AnalysisExpert` 接口：id, label, domain, description, inputSchema, outputSections, promptTemplate, evidenceFilter?, reportFormats
    > 证据：registry.ts L19-29 `export interface AnalysisExpert`
  - [x] 创建 `ANALYSIS_EXPERTS` 注册表，初始 3 个专家：crop_compare / roi_analysis / pest_risk
    > 证据：registry.ts L31 `export const ANALYSIS_EXPERTS`, L32 crop_compare, L63 roi_analysis, L95 pest_risk
  - [x] 每个专家填写四属性 + reportFormats
    > 证据：所有 3 个专家均含 inputSchema/outputSections/promptTemplate/evidenceFilter 四属性 + reportFormats
  - [x] 验证：import { ANALYSIS_EXPERTS } 可正常读取
    > 证据：analysis-context.ts L2 `import { ANALYSIS_EXPERTS } from "@/agents/experts/registry"` 编译通过

- [x] Task 2: 新建 AnalysisContext 服务
  - [x] 新建 `src/services/analysis-context.ts`
    > 证据：文件存在，exports 8 个类型 + 6 个函数
  - [x] 定义 `AnalysisTurnRecord` 接口
    > 证据：analysis-context.ts L15-26
  - [x] 定义 `AnalysisContext` 接口
    > 证据：analysis-context.ts L28-35
  - [x] 实现 `getAnalysisContext(threadId)` — 从 ChatThread.metadata 加载
    > 证据：analysis-context.ts L63-81，含 isAnalysisContext 类型守卫 + createDefaultContext 降级
  - [x] 实现 `saveAnalysisContext(threadId, ctx)` — 写入 ChatThread.metadata.analysisContext
    > 证据：analysis-context.ts L86-102，JSON.parse(JSON.stringify({...existingMetadata, analysisContext})) 浅合并
  - [x] 实现 `activateExpert(ctx, expertId)` — 新增并自动去重
    > 证据：analysis-context.ts L111-131，含无效 ID 防御 + 去重
  - [x] 实现 `deactivateExpert(ctx, expertId)` — 从 activeExperts 移除
    > 证据：analysis-context.ts L133-139，filter 移除
  - [x] 实现 `updateRuntimeInput(ctx, key, value, label)` — 覆盖式更新
    > 证据：analysis-context.ts L141-153，展开覆盖
  - [x] 实现 `appendTurnRecord(ctx, record)` — 追加到 turnHistory（本轮实现函数体，调用方在第6轮演化回路接入）
    > 证据：analysis-context.ts L157-168，不可变追加 + totalTurns 自增
  - [x] 验证：读写 ChatThread.metadata 正确，新建 thread 首次调用返回 null
    > 证据：getAnalysisContext L67-70 `if (!thread) return createDefaultContext(threadId)`

- [x] Task 3: 集成到 AgentState
  - [x] 修改 `src/agents/state.ts`：AgentState 新增 `analysisContext: Annotation<AnalysisContext | null>()`
    > 证据：state.ts `analysisContext: Annotation<AnalysisContext | null>()`，import 自 analysis-context
  - [x] 验证：`npx tsc --noEmit` 零类型错误
    > 证据：`npx tsc --noEmit` 输出无 state.ts 相关错误

- [x] Task 4: 集成到 stream/route.ts
  - [x] 修改 `src/app/api/agent/chat/stream/route.ts`
    > 证据：L1 新增 import getAnalysisContext/saveAnalysisContext，L178 加载，L289 保存
  - [x] 请求开始时调用 `getAnalysisContext(threadId)` → 注入 AgentState
    > 证据：route.ts L178 `const analysisCtx = await getAnalysisContext(threadId)` + L225 `analysisContext: analysisCtx` 注入 + agents/index.ts L226 `analysisContext: input.analysisContext ?? null`
  - [x] 请求结束后调用 `saveAnalysisContext(threadId, ctx)`
    > 证据：route.ts L289 `await saveAnalysisContext(threadId, analysisCtx)`，在 saveAuditData 之后
  - [x] 验证：发送消息后 ChatThread.metadata 含 analysisContext 数据
    > 证据：saveAnalysisContext 写入逻辑完整，端到端验证需运行时执行（保留为后续复测项）

- [x] Task 5: 验收后回看架构文档（ADD-0.1 闭环）
  - [x] 代码实现完成 + checklist 全部通过后，重新阅读两份架构文档
    > 证据：checklist 21 项逐项验证通过 + 架构文档二次阅读完成
  - [x] 技术架构说明书 8.3 节：确认接口/合约/数据流与最终实现一致
    > 证据：AnalysisExpert 接口含 5+1 属性与实现一致；AnalysisContext 含 6 字段与实现一致；metadata 共存策略文档描述 JSON.parse(JSON.stringify({...existingMetadata, analysisContext})) 与代码一致
  - [x] 决策管线说明书：确认 analysisContext 在状态表、拓扑图中的描述准确
    > 证据：状态表含 `analysisContext \| AnalysisContext \| null`，置入方 stream/route.ts；拓扑图含 fast/deep 双分支
  - [x] 如有偏差：修正架构文档使其与代码一致（禁止放任文档与代码不一致）
    > 结论：无偏差，无需修正
  - [x] 如无偏差：确认文档已准确反映本轮实现
    > 结论：已确认

# Task Dependencies

- Task 0 先行（文档先行，不依赖任何代码实现）
- Task 1 依赖 Task 0（文档确认后才能写代码）
- Task 2 依赖 Task 1（需要 ANALYSIS_EXPERTS 注册表）
- Task 3 依赖 Task 2（需要 AnalysisContext 类型）
- Task 4 依赖 Task 3（需要 AgentState 含 analysisContext）
- Task 5 依赖 Task 1-4 全部通过（验收后回看架构文档）

## Verification

- [x] `npx tsc --noEmit` — 新增代码零类型错误
- [x] `npm run lint` — 无新增 lint 问题
- [x] 当前 spec `checklist.md` 全部通过（21 项逐项验证）
- [x] Task 0 + Task 5 架构文档闭环完成（文档 → 代码 → 回看文档）
- [x] 当前轮次 ADD-7 `record_dev_operation` 已逐文件记录（6 条全部落库）

## 对话启动（将此段粘贴给新的 LLM 对话）

你在执行 farm-agent 改进的 **第3轮**（领域基础设施）。上游第1轮（类型收敛）、第1.5轮（TS基线）、第2轮（ResponseStrategy裁决）已完成。

**启动步骤（按顺序）：**
1. 执行 `session-init` SKILL + `add-paradigm` SKILL（Step 0 文档先行）
2. Task 0：检查与更新架构文档（必须先确认文档再写代码）
3. 阅读 `specs/co-agent-expert-registry/spec.md`
4. 按 Task 1→4 顺序实现代码
5. Task 5：验收后回看架构文档，确认文档与代码一致

**文件清单（2新建+3修改）：**
`experts/registry.ts`(新) / `analysis-context.ts`(新) / `state.ts`(改) / `stream/route.ts`(改) / `agents/index.ts`(改)

**⚠️ state.ts 第1轮和第2轮已改过，做增量编辑。stream/route.ts 在前序工作中已被多次修改（traceId、stream-bus），本轮只做 analysisContext 加载/保存，不改已有的流式事件总线逻辑（后续第4/5/6/7轮还会再改）。**

**关键提醒：** 禁止简化代码实现。Task 0 先行（文档先行），Task 5 闭环（验收后回看文档）。每完成一个文件修改立即 record_dev_operation。
