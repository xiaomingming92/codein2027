# Checklist: 领域基础设施 — 分析专家注册表 + AnalysisContext

- [x] `src/agents/experts/registry.ts` 新建完成，含 AnalysisExpert 接口和 ANALYSIS_EXPERTS 注册表
  > 证据：registry.ts L19 `export interface AnalysisExpert`, L31 `export const ANALYSIS_EXPERTS`
- [x] 注册表含 3 个专家：crop_compare / roi_analysis / pest_risk
  > 证据：registry.ts L32 crop_compare, L63 roi_analysis, L95 pest_risk
- [x] 每个专家有四属性（inputSchema/outputSections/promptTemplate/evidenceFilter）
  > 证据：crop_compare: L37 inputSchema, L42 outputSections, L43 promptTemplate, L56 evidenceFilter；roi_analysis/pest_risk 同
- [x] AnalysisExpert 含 reportFormats 字段
  > 证据：registry.ts L60 reportFormats: ["md","xlsx"], L92, L124
- [x] `src/services/analysis-context.ts` 新建完成
  > 证据：文件存在，含 AnalysisContext 类型 + 6 个导出函数
- [x] AnalysisContext 类型含 threadId/activeExperts/runtimeInputs/turnHistory/totalTurns/updatedAt
  > 证据：analysis-context.ts L28-35 `export interface AnalysisContext { threadId; activeExperts; runtimeInputs; turnHistory; totalTurns; updatedAt }`
- [x] AnalysisTurnRecord 类型含 turn/intent/thinkingLevel/strategyDescriptorId/activeExpertIds/verdictConfidence/evidenceCount/followUpCount/followedUpFromTurn/timestamp
  > 证据：analysis-context.ts L15-26 `export interface AnalysisTurnRecord { turn; intent; thinkingLevel; strategyDescriptorId; activeExpertIds; verdictConfidence; evidenceCount; followUpCount; followedUpFromTurn; timestamp }`
- [x] getAnalysisContext(threadId) 可从 ChatThread.metadata 加载
  > 证据：analysis-context.ts L63 `prisma.chatThread.findUnique({ where: { id: threadId }, select: { metadata: true } })`
- [x] saveAnalysisContext(threadId, ctx) 可持久化到 ChatThread.metadata.analysisContext
  > 证据：analysis-context.ts L94 `prisma.chatThread.update({ data: { metadata: JSON.parse(JSON.stringify({...existingMetadata, analysisContext: context})) } })`
- [x] activateExpert(ctx, expertId) 正确添加并去重
  > 证据：analysis-context.ts L118 `const alreadyActive = ctx.activeExperts.some(...)` — 去重；L123-130 不可变添加
- [x] deactivateExpert(ctx, expertId) 正确移除
  > 证据：analysis-context.ts L133-139 `activeExperts: ctx.activeExperts.filter((item) => item.expertId !== expertId)`
- [x] updateRuntimeInput(ctx, key, value, label) 覆盖式更新
  > 证据：analysis-context.ts L141-153 `runtimeInputs: { ...ctx.runtimeInputs, [key]: { value, label } }` — 同 key 覆盖
- [x] appendTurnRecord(ctx, record) 追加到 turnHistory
  > 证据：analysis-context.ts L157-168 `turnHistory: [...ctx.turnHistory, { ...record, turn: nextTurn }]`
- [x] `src/agents/state.ts` AgentState 新增 analysisContext 字段
  > 证据：state.ts `analysisContext: Annotation<AnalysisContext | null>()` + import 自 analysis-context
- [x] saveAnalysisContext 不覆盖已有 auditData：浅合并到现有 ChatThread.metadata，保留已有字段
  > 证据：analysis-context.ts L92-99 `const existingMetadata = ...; metadata: JSON.parse(JSON.stringify({...existingMetadata, analysisContext: context}))` — 展开保留所有已有字段
- [x] activateExpert 无效 expertId 时静默忽略（返回原 ctx + console.warn），不抛异常
  > 证据：analysis-context.ts L112-115 `if (!expert) { console.warn(...); return ctx }`
- [x] `stream/route.ts` 修改后，已有逻辑未被破坏：SSE token 流式输出、stream-bus 事件推送、auditData 写入均正常
  > 证据：route.ts 增量仅在 L1 import 新增 1 行、L178 `const analysisCtx = await getAnalysisContext(threadId)`、L225 `analysisContext: analysisCtx` 注入、L289 `await saveAnalysisContext(threadId, analysisCtx)` — 无任何已有逻辑删除或修改
- [x] 跨轮记忆：第1轮激活2个专家 → 第2轮加载后 activeExperts 仍为2个
  > 证据：activateExpert 不可变添加（L123-130），getAnalysisContext 从 metadata 加载（L63-81），两次调用间 DB 持久化保持
- [x] **架构文档闭环（ADD-0.1）**：代码实现后回看两份架构说明书，确认文档与代码一致（接口/合约/数据流准确），如有偏差已修正
  > 证据：技术架构说明书 8.3 节 AnalysisContext 接口含 activeExperts/runtimeInputs/turnHistory/metadata 共存策略，与实现一致；决策管线说明书 designPrinciples + 状态表 + 拓扑图均已更新
