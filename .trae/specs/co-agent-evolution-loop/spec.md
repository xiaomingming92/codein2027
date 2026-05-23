# 策略演化闭环 Spec

## Why

前面各轮建立了规则嵌入（策略注册、分析专家、缓存、stream 汇聚），但如果所有参数都是常量，系统上线后就死在那里不动了。需要系统在运行中从自己的审计数据里学习参数——TTL 从常量自主学习、下载格式偏好从用户行为学习、执行质量下降时自动调整策略。

## What Changes

- 新建 `src/services/path-metrics.ts`：4 维度服务质检测器 + 复合裁决 + 全局基准构建
- 新建 `src/services/cache-ttl-stats.ts`：TTL 自主学习（缓存过期后对比新旧结论）
- response-strategy.ts 集成执行度评估
- analysis-context.ts 完善 turnHistory 采集逻辑
- stream/route.ts 每轮管线结束后采集 turnHistory

## Impact

- Affected specs: 无
- Affected code: `src/services/path-metrics.ts`（新建）, `src/services/cache-ttl-stats.ts`（新建）, `src/agents/response-strategy.ts`, `src/services/analysis-context.ts`, `src/app/api/agent/chat/stream/route.ts`
- 父 Plan: [co-agent-simplified-v1.md](../../documents/co-agent-simplified-v1.md)
- 依赖: 第4轮(领域集成) + 第5轮(语义缓存)
- 后续依赖: 第7轮(审计管线)

## ADDED Requirements

### Requirement: 回路一 — 语义缓存 TTL 自主学习

系统 SHALL 在语义缓存过期后重新运行 LLM，对比新旧置信度：
- 相同（±5%）→ TTL 上调 20%（浪费了一次调用，说明 TTL 太短）
- 不同 → TTL 不变或下调 20%

学习数据 SHALL 持久化到 `logs/cache-ttl-stats.json`。

#### Scenario: TTL 上调
- **WHEN** 同一场景（相同意图+相同 expert 组合）缓存过期 3 次
- **AND** 重新运行 LLM 后结论与新缓存写入时相比置信度差异 ≤ 5%
- **THEN** 该场景的 CACHE_TTL 上调 20%

#### Scenario: TTL 不误调
- **WHEN** 缓存过期后重新运行 LLM 结论显著不同
- **THEN** TTL 不变或下调（数据确实变了，缓存过期合理）

### Requirement: 回路二 — 下载格式偏好学习

系统 SHALL 在 `report-generator.ts` 中的 `learnFormatPreference()` 学习用户下载行为：
- 同一场景（同一组专家 + 同一地块）下载记录 ≥ 5 条
- 最高频格式占比 > 60% → 学习为该场景的偏好
- 偏好 > `inferDefaultFormat` 规则

下载记录 SHALL 持久化到 `ChatThread.metadata.downloadHistory`。

#### Scenario: 格式偏好覆盖默认规则
- **WHEN** 同一场景 PDF 占 8/10 次下载
- **THEN** inferDefaultFormat 返回 PDF（即使 expert.reportFormats[0] 为 md）

### Requirement: 回路三 — 多维度执行度裁决层自检

系统 SHALL 提供 4 个独立的 MetricDescriptor 检测器：

| 维度 | 算法 | 样本门槛 | 修正方向 |
|------|------|---------|---------|
| 置信度轨迹 | 线性回归 β 斜率 | ≥5 轮 | β < -3 → augment_prompt |
| 证据覆盖率 | 连续 3 轮递减 + 低于全局均值×0.5 | ≥3 轮 | relax_evidence_filter |
| 追问率 | followUpCount>0 占比 | ≥5 轮 | ≥40% → activate_expert（建议 pest_risk） |
| 置信度波动率 | 标准差 σ | ≥5 轮 | σ > 15% → augment_prompt（细化维度） |

`assessExecutionQuality(history, activeExperts, baselines, region)` SHALL 逐维度检测 → 按 severity × priority 加权评分 → 合并多信号为单一 `StrategyAdjustment`。

`buildMetricBaselines()` SHALL 从所有 ChatThread 的 turnHistory 聚合每个 `expertId:region` 组合的全局基准（均值、标准差、证据量、追问率）。

#### Scenario: 置信度轨迹下降触发告警
- **WHEN** 连续 5 轮置信度从 78% 降至 42%（β < -3）
- **THEN** 产出的 StrategyAdjustment 含 `augment_prompt`，promptHint 追加"信息可能存在缺口"

#### Scenario: 追问率高触发专家建议
- **WHEN** 5 轮中 2 轮有追问（40%）
- **THEN** StrategyAdjustment 含 `activate_expert`，建议激活 pest_risk 专家

### Requirement: 演化可回滚

所有演化数据 SHALL 走 `ChatThread.metadata` JSON 字段或文件日志（不改 Prisma Schema）。删除 metadata 字段或统计文件可使系统回退到初始常量。

## MODIFIED Requirements

### Requirement: resolveResponseStrategy 集成执行度评估

`resolveResponseStrategy` SHALL 在修饰器管道之后调用 `assessExecutionQuality()`，根据 adjustent 调整最终 strategy。

### Requirement: AnalysisContext 含 turnHistory

`AnalysisContext` SHALL 包含 `turnHistory: AnalysisTurnRecord[]`，每轮管线结束后由 stream/route.ts 调用 `appendTurnRecord()` 追加。

## REMOVED Requirements

无
