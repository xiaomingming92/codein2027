# Checklist: 策略演化闭环

- [ ] `src/services/path-metrics.ts` 新建完成
- [ ] MetricDescriptor 注册表含 4 个检测器（置信度轨迹/证据覆盖率/追问率/置信度波动率）
- [ ] assessExecutionQuality() 逐维度检测 → 加权评分 → 单一 StrategyAdjustment
- [ ] buildMetricBaselines() 可从所有 ChatThread 聚合全局基准
- [ ] `src/services/cache-ttl-stats.ts` 新建完成
- [ ] recordCacheExpiry() 正确采集缓存过期事件
- [ ] adaptCacheTtl() 按规则调整 TTL（上调/不变/下调）
- [ ] `src/agents/response-strategy.ts` 集成 assessExecutionQuality()
- [ ] `src/services/analysis-context.ts` appendTurnRecord() 采集逻辑完整
- [ ] `stream/route.ts` 每轮结束采集 turnHistory
- [ ] turnHistory 验证：多轮后长度 = 总轮数
- [ ] TTL 学习验证：同场景 3 次过期结论相同 → TTL 上调 20%
- [ ] TTL 不误调验证：同场景结论不同 → TTL 不变或下调
- [ ] 格式偏好验证：PDF 占 8/10 → inferDefaultFormat 返回 PDF
- [ ] 置信度轨迹验证：连续下降 5 轮 → promptHint 追加"信息缺口"
- [ ] 证据覆盖验证：连续 3 轮递减低于均值 → relax_evidence_filter
- [ ] 追问率验证：40% 追问 → 建议 activate_expert
- [ ] 演化可回滚验证：删除 metadata → 系统回退初始常量
