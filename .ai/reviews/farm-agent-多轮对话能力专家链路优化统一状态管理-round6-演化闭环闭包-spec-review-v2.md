# 第6轮 实现验收 Review — 演化闭环闭包

> **评审对象**: 第6轮实际代码实现（5 个文件）
> **参考基线**: spec v1 + tasks v1 + checklist v1 + handoff 第6轮章节 + review v1
> **评审日期**: 2026-06-03
> **评审类型**: 实现后验收（ADD-0.1 Step 6：验收后回看架构文档）

---

## 1. 文件交付对照

| 文件 | 计划操作 | 实际 | 行数 | 状态 |
|------|---------|------|------|:--:|
| `src/services/path-metrics.ts` | 新建 | 已完成 | 522 | ✅ |
| `src/services/cache-ttl-stats.ts` | 新建 | 已完成 | 210 | ✅ |
| `src/agents/response-strategy.ts` | 修改 | 已完成 | L3-4 新增 import, L35 +turnHistory/+baselines, L115-139 集成 assessExecutionQuality | ✅ |
| `src/services/analysis-context.ts` | 修改 | 无改动（appendTurnRecord 第3轮已完整实现） | - | ✅ |
| `src/app/api/agent/chat/stream/route.ts` | 修改 | 已完成 | L245-248 捕获变量, L263-265 intention 节点捕获, L289/297 retrieval/verdict 节点捕获, L451-479 turnHistory 采集 + TTL 自适应, L536 clearAuditContext | ✅ |

### 与 review v1 建议的插入点对照

Review v1 §9.2 建议插入点在 L420（if responseOutput 结束）之后、L422（chainTrace 保存）之前。**实际插入点一致**（L451），仅因中间插入了 cache set 块（第5轮）导致行号偏移。符合预期。

### 与 review v1 数据来源映射对照

| turnHistory 字段 | v1 预期来源 | 实际来源 | 一致? |
|------|------|------|:--:|
| `intent` | intention 节点 | L264 `capturedIntent = intent` | ✅ |
| `thinkingLevel` | intention 节点 | L265 `capturedThinkingLevel = thinkingLevel` | ✅ |
| `strategyDescriptorId` | response 节点 `structuredResponse.strategyId` | L398 捕获 `capturedStrategyDescriptorId`，L465 写入 | ✅ |
| `activeExpertIds` | analysisCtx | L464 `analysisCtx.activeExperts.map(e => e.expertId)` | ✅ |
| `verdictConfidence` | verdict/reasoning 节点 | L297 `capturedVerdictConfidence = result.confidence` | ✅ |
| `evidenceCount` | retrieval 节点 | L289 `capturedEvidenceCount = chain.length` | ✅ |
| `followUpCount` | turnHistory 历轮统计 | L456-457 `existingFollowUp` | ✅ |

---

## 2. 回路完成度

| 回路 | 描述 | 实现 | 证据 |
|------|------|:--:|------|
| 回路一 | TTL 自主学习（同意图≥3次过期，结论一致→TTL↑20%） | ✅ | cache-ttl-stats.ts L121-152 adaptCacheTtl()，含上下限边界（min=60, max=default×10） |
| 回路二 | 下载格式偏好学习 | ❌ 推迟 | review v1 §4 回路二归属问题，决策推迟到后续轮次或独立 spec |
| 回路三 | 4 维度复合裁决 | ✅ | path-metrics.ts 4 个 MetricDescriptor + assessExecutionQuality() L334-398 收集/排序/合并 |

回路二推迟与本轮 handoff "回路二归属说明"一致，不视为缺陷。

---

## 3. 关键约束合规检查

### 3.1 review v1 阻塞项修正追踪

| 编号 | 问题 | v1 状态 | v2 状态 |
|------|------|:--:|:--:|
| C1 | Spec L33 四元组→三元组 | 待修正 | ✅ tasks.md L9 已增量修正为三元组 |
| C2 | 回路二归属确认 | 待确认 | ✅ 决策推迟（handoff L992-994） |
| C3 | 架构文档 8.6 节补充 | 待补充 | ✅ DOC_UPDATED 2026-06-03T07:20:02 确认已补充 |

### 3.2 review v1 风险点复检

| 风险 | v1 严重度 | 实际处理 | 状态 |
|------|:--:|------|:--:|
| assessExecutionQuality 阻塞响应 | 高 | response-strategy.ts L117-139 **同步调用 + try-catch 降级**，非异步但 try-catch 确保不抛异常；baselines 在 resolve 调用前已预计算 | ✅ 不阻塞 |
| TTL 自适应与静态 CACHE_TTL 竞争 | 中 | cache-ttl-stats.ts 维护独立 `_adaptedTtl` Map（L59），通过 `getAdaptedTtl()` 替代硬编码常量；semantic-cache.ts 未改动 | ✅ 无竞争 |
| 回路二文件边界不清 | 中 | 决策推迟 | ✅ |
| baselines 聚合性能 | 低 | buildMetricBaselines L410-521 由调用方决定调用频率（非每次 request 调用） | ✅ |
| clearAuditContext 遗漏 | 高 | stream/route.ts L536 finally 块中 | ✅ |

### 3.3 handoff 契约细化遵守

| 契约 | 文件 | 实现 | 状态 |
|------|------|------|:--:|
| path-metrics 用 MetricDescriptor 注册表，检测器可组合可扩展 | path-metrics.ts | L122-325 METRICS 数组，每个 desc 自声明 detect() → MetricContribution | ✅ |
| cache-ttl-stats 真实记录命中/过期/结论稳定性 | cache-ttl-stats.ts | recordCacheHit(L93)/recordCacheMiss(L98)/recordCacheExpiry(L103) 全实现 | ✅ |
| appendTurnRecord 采集每轮关键上下文 | analysis-context.ts | L157-168 第3轮已完整实现 | ✅ |
| ResponseStrategy 只能消费质量信号调整 promptHint，不破坏 descriptor 架构 | response-strategy.ts | L126-135 仅在 resolve 末尾追加调整，不改 descriptor 注册表 | ✅ |

---

## 4. ADD-7 审计完整性

handoff 预期 8 条记录，实际落库情况：

| action | targetType | targetId | handoff 期望 | 实际 |
|--------|-----------|----------|:--:|:--:|
| `PATH_METRICS_CREATED` | COMPONENT | `src/services/path-metrics.ts` | ✅ | ✅ 2026-06-03T07:36:06 |
| `CACHE_TTL_STATS_CREATED` | COMPONENT | `src/services/cache-ttl-stats.ts` | ✅ | ✅ 2026-06-03T07:36:10 |
| `EVOLUTION_LOOP_INTEGRATED` | AGENT | `src/agents/response-strategy.ts` | ✅ | ❌ **缺失** |
| `EVOLUTION_LOOP_INTEGRATED` | API_ROUTE | `src/app/api/agent/chat/stream/route.ts` | ✅ | ✅ 2026-06-03T07:40:51 |
| `DOC_UPDATED` | DOC | 架构文档#8.6（8.6 节新增） | ✅ | ✅ 2026-06-03T07:20:02 |
| `DOC_UPDATED` | DOC | 架构文档#8.6.5（偏差1：同步+try-catch） | ✅ | ❌ **缺失** |
| `DOC_UPDATED` | DOC | 架构文档#8.6.4（偏差2：编程时/运行时耦合） | ✅ | 🔶 **已由 08:12:46 记录部分覆盖**（METRICS数组+透明传递），但未明确标注为偏差2修正 |
| `DOC_POST_IMPLEMENTATION_REVIEW` | DOC | 架构文档#8.6.5（偏差3：relax_evidence_filter） | ✅ | ✅ 2026-06-03T08:06:35 |

**审计缺口**：2 条完全缺失（response-strategy.ts + 偏差1），1 条未标注为偏差修正（偏差2）。不影响代码正确性，但影响跨会话恢复完整性。

---

## 5. 代码质量评估

### 5.1 强项

**path-metrics.ts** — 生产级设计：
- MetricContribution 自包含（L40-54）：每个字段可独立追溯到"哪个描述符、什么算法、什么阈值、什么结果"，不依赖运行时拼凑
- 4 个检测器全部有 minSamples 防护（L127/177/232/279），防止低样本误判
- assessExecutionQuality（L334-398）只做收集/排序/合并，不做创造——符合单一职责
- buildMetricBaselines（L410-521）30 天窗口 + 按专家聚合 + try-catch 降级到默认基准

**cache-ttl-stats.ts** — 边界处理完整：
- loadStats（L170-200）4 边界区分：ENOENT 静默 / EACCES console.warn / JSON 腐败降级 / 正常恢复
- adaptCacheTtl（L121-152）上下限边界（min=60, max=default×10）
- reconfirmed > diverged → 上调，diverged > reconfirmed → 下调，相等 → 不变

**集成点** — 不破坏上游：
- response-strategy.ts：L117 仅在 turnHistory 非空且 ≥3 时才评估，try-catch 降级不抛异常
- stream/route.ts：L451-479 turnHistory 采集 + TTL 自适应在 responseOutput 之后、done 之前，不改变流式行为
- finally 块 L536 clearAuditContext() 防止跨请求泄漏

### 5.2 已知局限

1. ~~**`strategyDescriptorId` 未捕获**~~ → 已修复：L398 从 `structuredResponse.strategyId` 捕获，L465 写入 turnHistory。

2. **relax_evidence_filter 的 promptHint 与 MetricDescriptor 重复**（response-strategy.ts L132-135 vs path-metrics.ts L182）：前者硬编码，后者已定义 promptFragment。两个值相同，不是 bug 但缺少单一来源。如需修改提示文案需要改两处。

3. **assessExecutionQuality 同步而非异步**：review v1 §5 风险点标记为"高"并要求 fire-and-forget。实际实现是同步 + try-catch 降级，比纯异步更安全（不依赖微任务调度）。baselines 由调用方预计算，不在此函数内查询 DB，因此同步调用不会阻塞响应。设计合理。

---

## 6. 架构文档偏差追踪（ADD-0.1 Step 6）

handoff 记录了 3 处偏差（L998-1004），当前修正状态：

| 编号 | 偏差 | 文档描述 | 实际实现 | 修正状态 |
|:--:|------|------|------|:--:|
| 偏差1 | 8.6.5 L1576 | 描述为异步 `.then()` 模式 | `resolveResponseStrategy` 中同步调用 + try-catch | ❌ **DOC_UPDATED 缺失，需补充** |
| 偏差2 | 8.6.4 MetricDescriptor | 旧版 action 类型，detect 只返回布尔值 | `detect()` 返回完整 `MetricContribution` | 🔶 已由 2026-06-03T08:12:46 记录覆盖（METRICS 数组 + 透明传递），但未标注为偏差2 |
| 偏差3 | 8.6.5 示例代码 | 仅有 `promptSupplement` 处理 | response-strategy.ts L132-135 有 `dominantAction` 分支 | ✅ DOC_POST_IMPLEMENTATION_REVIEW 2026-06-03T08:06:35 |

**偏差1 需补充**：架构文档 8.6.5 节描述 `assessExecutionQuality()` 为异步 `.then()` 模式，但代码实际是同步 + try-catch。应更新文档描述与代码一致。同理偏差2 的 DOC_UPDATED 记录也需明确标注为偏差修正。

---

## 7. checklist / tasks 验证

### checklist.md

全部 18 项，当前状态（从 handoff 和代码证据判断）：
- L1-2（path-metrics.ts 新建 + 4 检测器）：✅
- L3（assessExecutionQuality 加权评分）：✅
- L4（buildMetricBaselines 全局基准）：✅
- L5（cache-ttl-stats.ts 新建）：✅
- L6（recordCacheExpiry 采集）：✅
- L7（adaptCacheTtl 按规则调整）：✅
- L8（response-strategy.ts 集成）：✅
- L9（analysis-context.ts appendTurnRecord 完整）：✅（第3轮已实现）
- L10（stream/route.ts turnHistory 采集）：✅
- L11（turnHistory 长度 = 总轮数）：🔶 已实现但保留为运行时端到端验证
- L12（TTL 学习 3次过期结论相同→上调20%）：🔶 已实现但保留为运行时端到端验证
- L13（TTL 不误调 结论不同→不变/下调）：🔶 已实现但保留为运行时端到端验证
- L14（格式偏好 PDF 8/10→默认 PDF）：❌ 回路二推迟
- L15（置信度轨迹 连续下降→promptHint 追加"信息缺口"）：🔶 已实现但保留为运行时端到端验证
- L16（证据覆盖 连续3轮递减→relax_evidence_filter）：🔶 已实现但保留为运行时端到端验证
- L17（追问率 40%→activate_expert）：🔶 已实现但保留为运行时端到端验证
- L18（演化可回滚 删除 metadata→回退初始常量）：🔶 已实现但保留为运行时端到端验证

**运行时验证项说明**：L11-18（除 L14 回路二推迟外）的检测逻辑已在代码中完整实现，但端到端触发需要多轮真实对话数据积累（如 5 轮置信度下降才能触发 confidence_trajectory，3 次缓存过期才能触发 TTL 调整）。这些项在开发环境无法通过单次请求验证，诚实保留为运行时复测。

### tasks.md

| Task | 描述 | 状态 |
|------|------|:--:|
| Task 1 | path-metrics.ts 新建 | ✅ |
| Task 2 | cache-ttl-stats.ts 新建 | ✅ |
| Task 3 | response-strategy.ts 集成 | ✅ |
| Task 4 | analysis-context.ts appendTurnRecord | ✅（第3轮已实现） |
| Task 5 | stream/route.ts 集成 | ✅ |
| Task 6 | 端到端验证 | 🔶 已实现逻辑，运行时复测待执行 |

---

## 8. TypeScript 编译

```
npx tsc --noEmit --pretty false 2>&1 | grep -E "path-metrics|cache-ttl-stats|response-strategy|analysis-context|stream/route"
```

输出：**空（零错误）**。第6轮所有 5 个目标文件 TypeScript 编译通过。

---

## 9. 跨轮影响评估

| 上游轮次 | 影响 | 状态 |
|------|------|:--:|
| 第1轮（类型基础） | 无影响 | ✅ |
| 第2轮（ResponseStrategy） | response-strategy.ts 新增 turnHistory/baselines 到 StrategyContext，在 resolve 末尾追加调整 | ✅ 不破坏架构 |
| 第3轮（AnalysisContext） | appendTurnRecord 第3轮已实现，本轮仅消费 | ✅ |
| 第4轮（管线消费） | 无影响 | ✅ |
| 第5轮（语义缓存） | cache-ttl-stats.ts 通过 getAdaptedTtl() 替代硬编码 CACHE_TTL 常量 | ✅ 独立 Map，无竞争 |
| 第7轮（三层审计） | 未提前实现 | ✅ |
| 第8轮（架构合流） | 未提前实现 | ✅ |

---

## 10. 评审结论

| 维度 | 结果 | 说明 |
|------|:----:|------|
| 文件交付 | ✅ 通过 | 5/5 文件，2 新建 + 3 修改（1 个无改动），全部完成 |
| TypeScript 编译 | ✅ 通过 | 零错误 |
| 回路完成度 | ✅ 通过 | 回路一 + 回路三 完整实现，回路二 决策推迟 |
| review v1 阻塞项 | ✅ 通过 | C1/C2/C3 全部修正 |
| review v1 风险点 | ✅ 通过 | 5 项风险全部缓解 |
| ADD-7 审计 | ⚠️ 缺口 | 8 条预期，6 条已落库，2 条缺失（response-strategy.ts + 偏差1） |
| 架构文档偏差 | ⚠️ 缺口 | 偏差1 DOC_UPDATED 缺失，偏差2 未标注 |
| 代码质量 | ✅ 高 | path-metrics 自包含设计、cache-ttl-stats 4 边界处理、集成点不破坏上游 |
| 跨轮影响 | ✅ 无损害 | 5 个上游轮次全部兼容 |

**综合判定**: **条件通过**。补充以下 2 项后收敛：

1. **补充 response-strategy.ts 的 EVOLUTION_LOOP_INTEGRATED ADD-7 审计**
2. **补充偏差1的 DOC_UPDATED 记录**（8.6.5 节异步→同步修正），并标注偏差2 的 DOC_UPDATED

---

## 11. 修正追踪

| 编号 | 问题 | 状态 |
|------|------|:--:|
| V2-1 | response-strategy.ts EVOLUTION_LOOP_INTEGRATED 缺失 | 待修正 |
| V2-2 | 偏差1 DOC_UPDATED 缺失（8.6.5 同步+try-catch） | 待修正 |
| V2-3 | 偏差2 DOC_UPDATED 需标注（8.6.4 编程时/运行时耦合） | 待标注 |
| V2-4 | ~~strategyDescriptorId 硬编码 `""`~~ | ✅ 已修复（L398 从 structuredResponse.strategyId 捕获） |
