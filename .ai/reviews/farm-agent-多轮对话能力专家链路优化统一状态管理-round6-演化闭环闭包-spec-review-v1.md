# 第6轮 Spec Review — 演化闭环闭包

> **评审对象**: `.trae/specs/co-agent-evolution-loop/spec.md` (v1)
> **评审日期**: 2026-06-03
> **评审范围**: spec.md vs handoff.md vs 架构文档 vs 现有代码

---

## 1. Spec ↔ Handoff 一致性

| 检查项 | Handoff (第6轮章节) | Spec | 一致? |
|--------|---------------------|------|:-----:|
| 文件清单 | 2新建+3修改：path-metrics.ts / cache-ttl-stats.ts / response-strategy.ts / analysis-context.ts / stream/route.ts | 同 | ✅ |
| 回路一：TTL 自主学习 | 缓存过期→LLM重跑→对比→±5%→TTL↑20% | 同（Scenario 含上调/不上调/上限/下限） | ✅ |
| 回路二：下载格式偏好 | 同场景下载≥5次 + >60% → inferDefaultFormat | 同（Scenario 含偏好覆盖默认规则） | ✅ |
| 回路三：4维度复合裁决 | 置信度轨迹/证据覆盖率/追问率/置信度波动率 | 同（含具体阈值） | ✅ |
| 演化可回滚 | 数据走 ChatThread.metadata / 文件日志，不修改 Prisma Schema | 同 | ✅ |
| ADD-7 审计 | PATH_METRICS_CREATED / CACHE_TTL_STATS_CREATED / EVOLUTION_LOOP_INTEGRATED | Spec 未明确列出 ADD-7 actions | ⚠️ 轻微差异 |

**结论**: Handoff 与 Spec 在文件边界、回路设计、回滚策略上一致。Spec 未列出 ADD-7 action 列表，需在实施时补齐。

---

## 2. Spec ↔ 架构文档一致性

| 检查项 | 技术架构说明书 | 决策管线架构说明书 | Spec | 状态 |
|--------|:------------:|:----------------:|------|:----:|
| 8.6 节存在 | ❌ 不存在 | - | 引用 | 需补充 |
| turnHistory 字段 | AnalysisContext 含 turnHistory（8.3.2） | - | 同 | ✅ |
| CACHE_TTL 常量位置 | semantic-cache.ts（8.5） | - | Spec 新建 cache-ttl-stats.ts 管理 | ✅ |
| TTL 学习与第5轮关系 | 8.5.8 明确"第6轮从统计数据自主学习 TTL" | - | 同 | ✅ |

**关键结论**:
- 技术架构说明书 **缺少 8.6 节**（演化闭环），需在 Step 0 文档先行中补充。
- 决策管线架构说明书未涉及演化回路，可在第6轮完成后回看是否需要更新。

---

## 3. Spec ↔ 现有代码一致性（⚠️ 有关键不一致）

### 3.1 缓存键：四元组 vs 三元组

| 来源 | 描述 | 实际 |
|------|------|------|
| Spec L33 | 缓存键为 **四元组**：`normalizedQuery + intent + sorted(activeExperts) + kbGeneration` | ❌ |
| semantic-cache.ts L9 | 缓存键为 **三元组**（不含 kbGeneration），kbGeneration 作为 `CacheEntry` 出生版本号在 get() 中惰性淘汰 | ✅ 代码实际 |

**判定**: Spec L33 与代码不一致。应修正为三元组描述，或明确说明"kbGeneration 不进 key，而是 CacheEntry 字段，get() 中惰性比对淘汰"。第5轮 review 已修正为三元组，spec 此处是过时描述。

### 3.2 cache-ttl-stats.ts 与 semantic-cache.ts 的关系

| 关注点 | semantic-cache.ts (现有) | cache-ttl-stats.ts (待建) |
|--------|--------------------------|--------------------------|
| CACHE_TTL | 静态常量 `{ chat: 3600, question: 1800, ... }` | 需能动态读写，取代或包装静态常量 |
| getTTL() | 私有函数，从 CACHE_TTL 读取 | 需改为可被 `adaptCacheTtl()` 修改 |
| stats | `CacheStats` 含 hitCount/missCount/evicted* | TtlStats 需额外采集 expiredCount + reconfirmedCount + divergedCount |

**建议**: `cache-ttl-stats.ts` 模块应直接修改 `semantic-cache.ts` 中的 `CACHE_TTL` 对象（通过 export setter），或 `cache-ttl-stats.ts` 维护自己的动态 TTL 表并通过 `getTTL()` 覆盖。

### 3.3 appendTurnRecord 已存在

`src/services/analysis-context.ts` L157-168 已实现 `appendTurnRecord`（第3轮预测实现）。本轮需要：
1. 确认该函数签名满足本轮需求（turn/intent/thinkingLevel/strategyDescriptorId/activeExpertIds/verdictConfidence/evidenceCount/followUpCount/timestamp）
2. 在 `stream/route.ts` 中实际调用它

### 3.4 resolveResponseStrategy 集成点

`src/agents/response-strategy.ts` L97-109 `resolveResponseStrategy` 返回 `ResponseStrategy`。需要在修饰器管道之后、return 之前插入 `assessExecutionQuality` 调用。关键约束：**不阻塞 response 返回**（fire-and-forget 或异步，见 tasks.md L90）。

---

## 4. 轮次边界检查

| 检查项 | 状态 | 说明 |
|--------|:----:|------|
| 不提前实现第7轮三层审计 | ✅ | 第6轮不涉及 AuditLog / debug-tracer / Debug API |
| 不提前实现第8轮 Global State Model | ✅ | 第6轮不建立全局状态模型 |
| 不修改 Prisma Schema | ✅ | 所有数据走 metadata JSON / 文件日志 |
| 不破坏第5轮语义缓存 | ✅ | cache-ttl-stats 只读取缓存数据，不改 get/set 逻辑 |
| 不破坏第2轮 ResponseStrategy | ✅ | 只在 `resolveResponseStrategy` 末尾追加调整，不改 descriptor 架构 |
| 不破坏第3轮 AnalysisContext | ✅ | `appendTurnRecord` 已存在，只追加调用点 |
| 报告相关改动归属 | ⚠️ | 回路二"下载格式偏好"涉及 `report-generator.ts` 的 `learnFormatPreference`，但 tasks.md 未列入文件清单 |

**回路二归属问题**: Spec 的回路二（下载格式偏好学习）涉及 `report-generator.ts` 的 `learnFormatPreference()` 和 `ChatThread.metadata.downloadHistory`，但 tasks.md 的文件清单（L87）未包含 `report-generator.ts`。Handoff 第6轮的文件清单也只列了 5 个文件（2新建+3修改），不含 report-generator.ts。

**建议**: 回路二的实现有两种选择：
- A) 在第6轮扩展文件清单，增加 `report-generator.ts` 修改
- B) 回路二推到第7轮或独立 spec 处理

需要与开发者确认。

---

## 5. 风险点

| 风险 | 严重度 | 说明 | 缓解 |
|------|:------:|------|------|
| 缓存键描述不一致 | 中 | Spec 说四元组，代码是三元组。实施时若按 spec 构建四元组 key 会与 semantic-cache.ts 不兼容 | 修正 spec L33，以代码为准 |
| assessExecutionQuality 阻塞响应 | 高 | 如果同步调用且 baselines 查询耗时，会拖慢全链路 | tasks.md 已要求 fire-and-forget，实施时严格遵守 |
| TTL 自适应与静态 CACHE_TTL 竞争 | 中 | semantic-cache.ts 中 CACHE_TTL 是模块级 const，cache-ttl-stats.ts 需要改写它 | 方案设计：CACHE_TTL 改为 let + export setter，或 cache-ttl-stats 维护独立 Map |
| 回路二文件边界不清 | 中 | Spec 有回路二但 tasks.md 未包含 report-generator.ts | 与开发者确认归属 |
| baselines 聚合性能 | 低 | `buildMetricBaselines()` 遍历所有 ChatThread，线程多时可能耗时 | 首次调用缓存 baselines，后续增量更新 |
| clearAuditContext 遗漏 | 高 | tasks.md L91 强调 finally 块调用，但代码目前可能未实现 | 实施时在 stream/route.ts finally 中确保调用 |

---

## 6. 建议修正项

### 必须修正（阻塞实施）

1. **Spec L33**: "缓存键 SHALL 为四元组" → 修正为三元组描述，与 semantic-cache.ts 一致
2. **回路二归属**: 明确回路二是否在本轮实现。若实现，文件清单需增加 `report-generator.ts`；若不实现，Spec 回路二标记为"第6轮只定义接口，实现在后续轮次"
3. **架构文档**: 补充技术架构说明书 8.6 节（Step 0 文档先行）

### 建议修正（不阻塞但推荐）

4. **Spec 补充 ADD-7 action 列表**: `PATH_METRICS_CREATED` / `CACHE_TTL_STATS_CREATED` / `EVOLUTION_LOOP_INTEGRATED`（handoff 已有）
5. **tasks.md L9**: 前置条件 "buildCacheKey 产出四元组" → 改为三元组
6. **spec.md L33 L35**: "确保跨专家不误命中、知识库变更后自动淘汰" 的机制描述改为基于 CacheEntry.kbGeneration 惰性淘汰（与代码一致）

---

## 7. 评审结论

| 维度 | 结果 |
|------|:----:|
| Spec ↔ Handoff 一致性 | ✅ 通过 |
| Spec ↔ 架构文档 | ⚠️ 需补充 8.6 节 |
| Spec ↔ 现有代码 | ⚠️ 缓存键描述不一致，需修正 |
| 轮次边界 | ⚠️ 回路二归属待确认 |
| 风险可控性 | ✅ 可控（高风险项已有缓解方案） |

**综合判定**: **条件通过**。修正上述 3 项"必须修正"后即可进入实施阶段。

---

## 8. 修正追踪

| 编号 | 问题 | 状态 | 修正人/时间 |
|------|------|:----:|------------|
| C1 | Spec L33 四元组→三元组 | 待修正 | |
| C2 | 回路二归属确认 | 待确认 | |
| C3 | 架构文档 8.6 节补充 | 待补充 | |

---

## 9. stream/route.ts 精确插入点（实施指南）

基于第5轮交付物事实（handoff L883-893）和当前 `src/app/api/agent/chat/stream/route.ts` 实际结构：

### 9.1 当前代码结构（第5轮后）

```
L220-231   streamAgent() 调用（含 analysisContext 入参）
L233-235   局部变量：responseOutput / cacheHitEntry / cacheKeyForMiss

L237-277   for-await (agentStream)
  L244-266   intention 节点 → 缓存查询 ← [第5轮插入点1]
  L268-270   response 节点 → 捕获 responseOutput

L279-355   if cacheHitEntry → 缓存命中路径（模拟流式+持久化+done+return） ← [第5轮插入点1续]

L361-420   if (responseOutput) {
  L365-376   持久化助手消息
  L378-384   更新标题
  L387-419   fire-and-forget cache.set() ← [第5轮插入点2]
  L420       }

L422-426   chainTrace 保存
L428-436   saveAuditData
L438       saveAnalysisContext                ← [第3轮插入点]
L440-446   STREAM_DONE 审计
L448-454   done payload + controller.close()

L456-470   catch → 错误处理
L471-475   finally → unregisterStreamBus
```

### 9.2 第6轮插入点

按 handoff L890-893 建议：**responseOutput 处理后 → turnHistory 采集 + TTL 自适应，在 cache.set() 之后、done 事件之前**。

**精确插入位置**：在 L420（`if (responseOutput)` 结束 `}`）之后、L422（chainTrace 保存）之前。

理由：
1. `responseOutput` 块内（L361-420）已拿到 `assistantMessages` / `structuredResponse`，turnHistory 需要的数据可直接取用
2. `cache.set()` 是 fire-and-forget（`Promise.resolve().then()`），其触发点已在 L405-418，后续插入不依赖它完成
3. L420 之后、L422 之前不破坏已有控制流
4. 同样在 `if (responseOutput)` 块之后可以安全访问 `analysisCtx`（已在 L228 注入、L438 保存）

**插入代码骨架**：

```typescript
// L420 }  ← if (responseOutput) 结束
// ═══════════ 第6轮插入点 ═══════════

// 1. turnHistory 采集
const turnIntent = (() => {
  // 从 analysisCtx 或局部闭包解析当前轮 intent
  // ...
})()
const evidenceChainLen = (() => {
  // 从 agentStream 产出的 evidenceChain 获取
  // ...
})()

// 2. appendTurnRecord（已在 analysis-context.ts 实现）
// analysisCtx = appendTurnRecord(analysisCtx, { ... })

// 3. TTL 自适应（fire-and-forget，不阻塞 done 事件）
// Promise.resolve().then(() => adaptCacheTtl())

// ═══════════ 第6轮插入点结束 ═══════════
// L422   if (chainTrace) { ... }  ← 原有代码继续
```

### 9.3 数据来源映射

| turnHistory 字段 | 数据来源 | 获取方式 |
|------|------|------|
| `intent` | intention 节点产物 | `analysisCtx` 闭包或局部变量捕获 |
| `thinkingLevel` | intention 节点产物 | 同 `intent` |
| `strategyDescriptorId` | response 节点 | `responseOutput.structuredResponse.strategyId` |
| `activeExpertIds` | analysisCtx | `analysisCtx.activeExperts.map(e => e.expertId)` |
| `verdictConfidence` | verdict/reasoning 节点 | 需从 agentStream 中捕获或从 state 中读取 |
| `evidenceCount` | retrieval 节点 | 需从 agentStream 中捕获或从 state 中读取 |
| `followUpCount` | 跨轮累计 | 从 `analysisCtx.turnHistory` 历轮统计 |
| `timestamp` | 当前时间 | `new Date().toISOString()` |

> ⚠️ `verdictConfidence` 和 `evidenceCount` 目前在 for-await 循环中未捕获，需在第6轮实施时在循环内增加局部变量捕获（不改变流式行为）。

### 9.4 finally 块补充

```typescript
// L471-475 当前 finally 块
} finally {
  if (traceId) {
    unregisterStreamBus(traceId)
  }
  // ═══════════ 第6轮补充 ═══════════
  // clearAuditContext(traceId)  ← 防止跨请求状态泄漏（tasks.md L91）
}
```

### 9.5 缓存命中路径不插入

缓存命中路径（L279-355）已经有 `saveAnalysisContext`（L336）、`STREAM_DONE` 审计（L338）和 `return`（L354），**不在此路径插入 turnHistory 或 TTL 自适应**——缓存命中不需要演化采集。这一点与 handoff L889 "缓存命中时会提前 return，后续代码不会执行"一致。非缓存路径才需要采集。
