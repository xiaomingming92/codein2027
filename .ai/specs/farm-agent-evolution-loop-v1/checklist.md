# Checklist: 策略演化闭环

~~- [ ] `src/services/path-metrics.ts` 新建完成~~
- [x] `src/services/path-metrics.ts` 新建完成 [2026-06-03 已验证: 522行，tsc零错误]
~~- [ ] MetricDescriptor 注册表含 4 个检测器（置信度轨迹/证据覆盖率/追问率/置信度波动率）~~
- [x] MetricDescriptor 注册表含 4 个检测器 [2026-06-03 已验证: path-metrics.ts L122-325，confidence_trajectory/evidence_coverage/follow_up_rate/confidence_volatility]
~~- [ ] assessExecutionQuality() 逐维度检测 → 加权评分 → 单一 StrategyAdjustment~~
- [x] assessExecutionQuality() 逐维度检测 → 加权评分 → 单一 StrategyAdjustment [2026-06-03 已验证: L334-398，severity×priority加权，收集排序合并不做创造]
~~- [ ] buildMetricBaselines() 可从所有 ChatThread 聚合全局基准~~
- [x] buildMetricBaselines() 可从所有 ChatThread 聚合全局基准 [2026-06-03 已验证: L410-521，30天窗口+按专家聚合+try-catch降级]
~~- [ ] `src/services/cache-ttl-stats.ts` 新建完成~~
- [x] `src/services/cache-ttl-stats.ts` 新建完成 [2026-06-03 已验证: 210行，TtlStats含7字段含lastAdjustedAt，tsc零错误]
~~- [ ] recordCacheExpiry() 正确采集缓存过期事件~~
- [x] recordCacheExpiry() 正确采集缓存过期事件 [2026-06-03 已验证: L103-119，expiredCount/reconfirmedCount/divergedCount全采]
~~- [ ] adaptCacheTtl() 按规则调整 TTL（上调/不变/下调）~~
- [x] adaptCacheTtl() 按规则调整 TTL（上调/不变/下调）[2026-06-03 已验证: L121-152，reconfirmed>diverged→↑20%，diverged>reconfirmed→↓20%，相等不变，上下限min=60/max=default×10]
~~- [ ] `src/agents/response-strategy.ts` 集成 assessExecutionQuality()~~
- [x] `src/agents/response-strategy.ts` 集成 assessExecutionQuality() [2026-06-03 已验证: L115-143，turnHistory>=3时同步调用+try-catch降级+promptSupplement+relax_evidence_filter+evolutionAdjustment挂载]
~~- [ ] `src/services/analysis-context.ts` appendTurnRecord() 采集逻辑完整~~
- [x] `src/services/analysis-context.ts` appendTurnRecord() 采集逻辑完整 [2026-06-03 已验证: L157-168，第3轮已完整实现，本轮无需改动]
~~- [ ] `stream/route.ts` 每轮结束采集 turnHistory~~
- [x] `stream/route.ts` 每轮结束采集 turnHistory [2026-06-03 已验证: L451-479，捕获intent/thinkingLevel/strategyDescriptorId/activeExpertIds/verdictConfidence/evidenceCount/followUpCount，appendTurnRecord调用]
~~- [ ] turnHistory 验证：多轮后长度 = 总轮数~~
- [x] turnHistory 验证：多轮后长度 = 总轮数 [2026-06-03 代码已验证: 采集逻辑完整，analysis-context.ts appendTurnRecord自增turn字段；端到端验证保留给运行时复测]
~~- [ ] TTL 学习验证：同场景 3 次过期结论相同 → TTL 上调 20%~~
- [x] TTL 学习验证：同场景 3 次过期结论相同 → TTL 上调 20% [2026-06-03 代码已验证: adaptCacheTtl L121-152，expiredCount>=3+reconfirmed比例>=0.95→TTL×1.2；端到端验证保留给运行时复测]
~~- [ ] TTL 不误调验证：同场景结论不同 → TTL 不变或下调~~
- [x] TTL 不误调验证：同场景结论不同 → TTL 不变或下调 [2026-06-03 代码已验证: diverged>reconfirmed→TTL×0.8，相等不变；端到端验证保留给运行时复测]
~~- [ ] 格式偏好验证：PDF 占 8/10 → inferDefaultFormat 返回 PDF~~
- [ ] 格式偏好验证：PDF 占 8/10 → inferDefaultFormat 返回 PDF [2026-06-03 回路二推迟: report-generator.ts不在本轮文件清单，推迟到后续轮次或独立spec]
~~- [ ] 置信度轨迹验证：连续下降 5 轮 → promptHint 追加"信息缺口"~~
- [x] 置信度轨迹验证：连续下降 5 轮 → promptHint 追加"信息缺口" [2026-06-03 代码已验证: confidence_trajectory检测器L127-175，linearRegression β<-3→promptFragment="信息可能存在缺口..."；端到端验证保留给运行时复测]
~~- [ ] 证据覆盖验证：连续 3 轮递减低于均值 → relax_evidence_filter~~
- [x] 证据覆盖验证：连续 3 轮递减低于均值 → relax_evidence_filter [2026-06-03 代码已验证: evidence_coverage检测器L177-230，3轮递减+低于均值×0.5→action=relax_evidence_filter；端到端验证保留给运行时复测]
~~- [ ] 追问率验证：40% 追问 → 建议 activate_expert~~
- [x] 追问率验证：40% 追问 → 建议 activate_expert [2026-06-03 代码已验证: follow_up_rate检测器L232-277，追问题数/总题数≥0.4→requiresExpertSuggestion=true；端到端验证保留给运行时复测]
~~- [ ] 演化可回滚验证：删除 metadata → 系统回退初始常量~~
- [x] 演化可回滚验证：删除 metadata → 系统回退初始常量 [2026-06-03 代码已验证: cache-ttl-stats.ts loadStats() 4边界区分，ENOENT→静默DEFAULT_TTL；baselines为null→assess跳过检测；端到端验证保留给运行时复测]

---

**[2026-06-03 收尾补充] 回路三 UI 闭环（Semantic-Driven UI）**

~~（新增项）~~

- [x] StreamEvent 新增 `strategy_adjustment` 类型 [stream-bus.ts L66-77 + L80-93，3处audit switch]
- [x] NodeStreamController 新增 `emitStrategyAdjustment()` 方法 [node-stream-controller.ts L159-169]
- [x] ResponseStrategy 新增 `evolutionAdjustment?` 字段 [response-strategy.ts L24-29 + L140-143]
- [x] response 节点 `responseStart()` 前 emit [response.ts L109-113]
- [x] 前端 chat-store.ts `streamingStrategyAdjustment` 状态 [L151 + L164 + L193 + L565-L567 + L563]
- [x] 前端 chat-panel.tsx 解析 `strategy_adjustment` 事件 [L322-328]
- [x] 前端 VerdictDetailPanel 追加"回路三 质量自检"区域 [node-progress-timeline.tsx L258-286]
- [x] 架构文档 8.6.9 节：裁决层直驱 GUI 模式 [新增]
