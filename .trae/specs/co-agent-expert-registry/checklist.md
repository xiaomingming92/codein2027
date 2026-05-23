# Checklist: 领域基础设施 — 分析专家注册表 + AnalysisContext

- [ ] `src/agents/experts/registry.ts` 新建完成，含 AnalysisExpert 接口和 ANALYSIS_EXPERTS 注册表
- [ ] 注册表含 3 个专家：crop_compare / roi_analysis / pest_risk
- [ ] 每个专家有四属性（inputSchema/outputSections/promptTemplate/evidenceFilter）
- [ ] AnalysisExpert 含 reportFormats 字段
- [ ] `src/services/analysis-context.ts` 新建完成
- [ ] AnalysisContext 类型含 threadId/activeExperts/runtimeInputs/turnHistory/totalTurns/updatedAt
- [ ] AnalysisTurnRecord 类型含 turn/intent/thinkingLevel/strategyDescriptorId/activeExpertIds/verdictConfidence/evidenceCount/followUpCount/followedUpFromTurn/timestamp
- [ ] getAnalysisContext(threadId) 可从 ChatThread.metadata 加载
- [ ] saveAnalysisContext(threadId, ctx) 可持久化到 ChatThread.metadata.analysisContext
- [ ] activateExpert(ctx, expertId) 正确添加并去重
- [ ] deactivateExpert(ctx, expertId) 正确移除
- [ ] updateRuntimeInput(ctx, key, value, label) 覆盖式更新
- [ ] appendTurnRecord(ctx, record) 追加到 turnHistory
- [ ] `src/agents/state.ts` AgentState 新增 analysisContext 字段
- [ ] `stream/route.ts` 请求开始时加载 analysisContext，结束后保存
- [ ] 跨轮记忆：第1轮激活2个专家 → 第2轮加载后 activeExperts 仍为2个
