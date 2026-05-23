# Tasks: 领域基础设施 — 分析专家注册表 + AnalysisContext

- [ ] Task 1: 新建分析专家注册表
  - [ ] 新建 `src/agents/experts/registry.ts`
  - [ ] 定义 `ReportFormat` 类型（"md" | "pdf" | "docx" | "xlsx"）
  - [ ] 定义 `AnalysisExpert` 接口：id, label, domain, description, inputSchema, outputSections, promptTemplate, evidenceFilter?, reportFormats
  - [ ] 创建 `ANALYSIS_EXPERTS` 注册表，初始 3 个专家：crop_compare / roi_analysis / pest_risk
  - [ ] 每个专家填写四属性 + reportFormats
  - [ ] 验证：import { ANALYSIS_EXPERTS } 可正常读取

- [ ] Task 2: 新建 AnalysisContext 服务
  - [ ] 新建 `src/services/analysis-context.ts`
  - [ ] 定义 `AnalysisTurnRecord` 接口
  - [ ] 定义 `AnalysisContext` 接口
  - [ ] 实现 `getAnalysisContext(threadId)` — 从 ChatThread.metadata 加载
  - [ ] 实现 `saveAnalysisContext(threadId, ctx)` — 写入 ChatThread.metadata.analysisContext
  - [ ] 实现 `activateExpert(ctx, expertId)` — 新增并自动去重
  - [ ] 实现 `deactivateExpert(ctx, expertId)` — 从 activeExperts 移除
  - [ ] 实现 `updateRuntimeInput(ctx, key, value, label)` — 覆盖式更新
  - [ ] 实现 `appendTurnRecord(ctx, record)` — 追加到 turnHistory
  - [ ] 验证：读写 ChatThread.metadata 正确，新建 thread 首次调用返回 null

- [ ] Task 3: 集成到 AgentState
  - [ ] 修改 `src/agents/state.ts`：AgentState 新增 `analysisContext: Annotation<AnalysisContext | null>()`
  - [ ] 验证：`npx tsc --noEmit` 零类型错误

- [ ] Task 4: 集成到 stream/route.ts
  - [ ] 修改 `src/app/api/agent/chat/stream/route.ts`
  - [ ] 请求开始时调用 `getAnalysisContext(threadId)` → 注入 AgentState
  - [ ] 请求结束后调用 `saveAnalysisContext(threadId, ctx)`
  - [ ] 验证：发送消息后 ChatThread.metadata 含 analysisContext 数据

# Task Dependencies

- Task 2 依赖 Task 1（需要 ANALYSIS_EXPERTS 注册表）
- Task 3 依赖 Task 2（需要 AnalysisContext 类型）
- Task 4 依赖 Task 3（需要 AgentState 含 analysisContext）
