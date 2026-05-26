# Tasks: 策略演化闭环

## Preconditions

- [ ] 已执行 `session-init` SKILL
- [ ] 已执行 `add-paradigm` SKILL（Step 0 文档先行）
- [ ] 上游第1-5轮 ADD-7 审计记录存在，且语义缓存闭包已完成
- [ ] `npx tsc --noEmit` 在上游完成后通过
- [ ] SimpleSemanticCache 实例可用、buildCacheKey 产出四元组

## Forbidden

- 禁止修改 Prisma Schema（`prisma/schema.prisma`）
- 禁止修改前端组件（React/Vue 组件文件）
- 禁止覆盖或重构已有 stream-bus / SSE 事件总线逻辑
- 禁止简化代码实现，一切以代码高质量为衡量标准
- 禁止 TTL 自适应无上下限边界（minTtl=60s, maxTtl=defaultTtl×10）

- [ ] Task 1: 新建 path-metrics.ts 服务质量评估服务
  - [ ] 新建 `src/services/path-metrics.ts`
  - [ ] 定义 `MetricDescriptor` 接口（metric/algorithm/minSamples/threshold/seventy/action）
  - [ ] 注册 4 个检测器：置信度轨迹（线性回归 β）、证据覆盖率（3轮递减+低均值）、追问率（followUp>0 占比）、置信度波动率（标准差 σ）
  - [ ] 实现 `assessExecutionQuality(history, activeExperts, baselines, region)` — 复合裁决
  - [ ] 逐维度检测 → severity × priority 加权评分 → 单一 StrategyAdjustment
  - [ ] 实现 `buildMetricBaselines()` — 从所有 ChatThread 聚合全局基准
  - [ ] 验证：单元测试模拟连续 5 轮置信度下降 → 产出 augment_prompt 修正

- [ ] Task 2: 新建 cache-ttl-stats.ts TTL 自主学习服务
  - [ ] 新建 `src/services/cache-ttl-stats.ts`
  - [ ] 定义 `TtlStats` 类型（按 intent 聚合：hitCount/missCount/expiredCount/reconfirmedCount/divergedCount）
  - [ ] 实现 `recordCacheExpiry(intent, oldConfidence, newConfidence)` — 缓存过期后采集
  - [ ] 实现 `adaptCacheTtl()` — 同场景 ≥3 次过期且 reconfirmed>diverged → TTL 上调 20%（不超过 maxTtl=defaultTtl×10，不低于 minTtl=60s）
  - [ ] 持久化到 `logs/cache-ttl-stats.json`
  - [ ] 验证：同场景 3 次过期后结论相同 → TTL 上调

- [ ] Task 3: 改造 response-strategy.ts 集成执行度评估
  - [ ] 修改 `src/agents/response-strategy.ts`
  - [ ] `resolveResponseStrategy` 中，在修饰器管道之后调用 `assessExecutionQuality()`
  - [ ] 根据 adjustent 内容修改 strategy（如 augment_prompt → 追加 promptHint）
  - [ ] 验证：模拟不良指标 → strategy 被调整

- [ ] Task 4: 改造 analysis-context.ts 实现 turnHistory 采集
  - [ ] 修改 `src/services/analysis-context.ts`
  - [ ] 完善 `appendTurnRecord(ctx, record)` 实现
  - [ ] record 包含：intent/thinkingLevel/strategyDescriptorId/activeExpertIds/verdictConfidence/evidenceCount/followUpCount/timestamp
  - [ ] 验证：每轮管线结束后调用 → turnHistory 长度递增

- [ ] Task 5: 改造 stream/route.ts 集成演化采集
  - [ ] 修改 `src/app/api/agent/chat/stream/route.ts`
  - [ ] 每轮管线结束后采集 turnHistory（调用 appendTurnRecord）
  - [ ] 管线完成后调用 adaptCacheTtl() 检查 TTL 学习
  - [ ] 验证：多轮对话后 analysisContext.turnHistory 长度 = 总轮数

- [ ] Task 6: 端到端验证
  - [ ] turnHistory 累积正确
  - [ ] TTL 自主学习：同场景 3 次过期结论相同 → TTL 上调 20%
  - [ ] TTL 不误调：同场景 3 次过期结论不同 → TTL 不变/下调
  - [ ] 下载格式偏好学习：同场景 PDF 占 8/10 → inferDefaultFormat 返回 PDF
  - [ ] 置信度轨迹检测：连续 5 轮下降 → β < -3 → promptHint 追加"信息缺口"
  - [ ] 演化可回滚：删除 ChatThread.metadata.turnHistory → 回退到初始常量

# Task Dependencies

- Task 1-2 可并行（均新建）
- Task 3 依赖 Task 1（需要 assessExecutionQuality）
- Task 4-5 依赖第4轮（需要 AnalysisContext 类型 + stream/route.ts 架构）
- Task 5 依赖 Task 2（需要 adaptCacheTtl）
- Task 6 依赖 Task 1-5 全部完成

## Verification

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`（如项目已配置）
- 当前 spec `checklist.md` 全部通过
- 当前对话 ADD-7 `record_dev_operation` 已逐文件记录（缓存 + 演化各一份）

## 对话启动（将此段粘贴给新的 LLM 对话）

你在执行 farm-agent 改进的 **第6轮**（策略演化闭环）。语义缓存（SimpleSemanticCache + stream 集成）已完成。

**启动步骤（按顺序）：**
1. 确认 SimpleSemanticCache 可用，buildCacheKey 产出四元组
2. 阅读 `specs/co-agent-evolution-loop/spec.md`
3. 按本文档 tasks.md 顺序执行

**文件清单（2新建+3修改）：**
`path-metrics.ts`(新) / `cache-ttl-stats.ts`(新) / `response-strategy.ts`(改) / `analysis-context.ts`(改) / `stream/route.ts`(改)

**⚠️ response-strategy.ts 第2轮新建，analysis-context.ts 第3轮新建，stream/route.ts 第3/4/5轮已改过——做增量编辑。**
**⚠️ assessExecutionQuality 不阻塞 response 返回（fire-and-forget 或异步调用）。**
**⚠️ clearAuditContext 必须在 stream/route.ts 的 finally 块中调用，防止跨请求状态泄漏。**

**关键提醒：** 对话已开 4/5，完成后立即 record_dev_operation。
