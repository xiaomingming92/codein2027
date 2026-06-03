# farm-agent-co-agent-audit-pipeline-round7-spec-review-v1

## Review 元信息

- **Review 对象**: `.trae/specs/co-agent-audit-pipeline/`（spec.md + tasks.md + checklist.md）
- **对比方案**: Spec vs Handoff（第7轮章节） vs 架构文档 vs 第5/6轮实际代码交付
- **Review 时间**: 2026-06-03
- **Review 类型**: spec-review（执行前合规检查）
- **前置阅读**:
  - `.trae/plans/farm-agent-多轮对话能力专家链路优化统一状态管理-7轮原子事务交接-handoff-v1.md` §第7轮
  - `.trae/specs/co-agent-audit-pipeline/spec.md`
  - `.trae/specs/co-agent-audit-pipeline/tasks.md`
  - `.trae/specs/co-agent-audit-pipeline/checklist.md`
  - `docs/大田精准耕播智能决策系统/knowledge/01-架构/《大田精准耕播智能决策系统决策管线架构说明书》.md`
  - 第5轮交付：`src/services/semantic-cache.ts`
  - 第6轮交付：`src/services/cache-ttl-stats.ts`, `src/services/path-metrics.ts`

---

## 1. 总体结论

**结论级别：需修正后执行**

方向正确，三层分离（L1 dev trace / L2 AuditLog / L3 console）的设计与 ADD-4 分层架构一致。spec ↔ handoff ↔ tasks ↔ checklist 四件套基本一致。

**发现 4 个需修正的问题：**

| # | 严重程度 | 问题 |
|---|:---:|------|
| C1 | **高** | 回路一（TTL 自主学习）`recordCacheHit/Miss/Expiry` 未纳入本轮文件清单。`adaptCacheTtl()` 当前为永久 no-op |
| C2 | 中 | 架构文档 8.7 节（三层审计管线）不存在，handoff L1210 引用了一个空章节 |
| C3 | 低 | `semantic-cache.ts` 内部 `CACHE_TTL` 常量已过时但未被清理 |
| C4 | 中 | 本轮手动 L2 审计与 ADD-0.3 自动审计原则存在张力 |

---

## 2. 正向评价

1. **三层边界清晰**：L1 仅 dev（debug-tracer → 文件 + API），L2 始终开（AuditLog DB），L3 受 LOG_LEVEL 控制，职责边界无歧义
2. **节点级日志不入 L2**：spec 明确要求 `agentAuditNodeStart/End/Error/LLMCall` 不写 AuditLog 表，避免生产噪声爆炸 — 正确决策
3. **文件清单完整**：7 个文件（2 新 + 5 改）覆盖了 L1+L2 全部接入点
4. **task 依赖图合理**：Task 4 双依赖 Task 1+2（需要 setAuditContext 和 createTrace），Task 6 多子任务可并行
5. **checklist 可追溯**：34 项分 Layer 2 / Layer 1 / 编译 三组，每项可映射到 tasks.md 的对应 Task
6. **微调导出筛选规则具体**：followUpCount>0 / confidence<50 / chat 意图三条件排除，quality 标签三级（excellent/good/acceptable）

---

## 3. 问题清单

### C1 [高] 回路一（TTL 自主学习）未纳入本轮

**问题描述**：

`cache-ttl-stats.ts`（第6轮新建）定义了 `recordCacheHit/Miss/Expiry` 三个函数，但整个 `src/` 目录下零调用。`adaptCacheTtl()` 虽在 `stream/route.ts` L482 被调用，但内部 `stats.expiredCount < 3` 永远为 true（因为无人写入过期事件），导致 TTL 自主学习永久不触发。

从职责归属看：
- 第5轮（语义缓存）创建了 `semantic-cache.ts`，这是 `recordCacheHit/Miss` 应该接入的地方
- 第6轮（演化闭环）创建了 `cache-ttl-stats.ts`，`adaptCacheTtl` 已接入 `stream/route.ts`，但 `recordCacheExpiry` 的回调点未接入
- 第7轮（三层审计）要修改 `semantic-cache.ts` 加 `agentAuditCacheOperation()`，正好是顺路接入 `recordCacheHit/Miss` 的最佳时机

**当前 spec 的 `agentAuditCacheOperation()` 会写 AuditLog 表（CACHE_HIT/MISS/SET/EVICT），但不能替代回路一的 `recordCacheHit/Miss/Expiry`**。两个函数是独立的：
- `recordCacheHit/Miss` → 写入 `cache-ttl-stats.ts` 的内存统计 + 持久化文件 → 驱动 `adaptCacheTtl()`
- `agentAuditCacheOperation` → 写入 AuditLog 表 → 前端查询"谁用了缓存"

**修正建议**：

1. spec.md 新增 Requirement：`semantic-cache.ts SHALL 在 get() 命中时调用 recordCacheHit(intent)，未命中时调用 recordCacheMiss(intent)`
2. spec.md 新增 Requirement：`stream/route.ts 缓存过期重跑管线后 SHALL 调用 recordCacheExpiry(intent, oldConfidence, newConfidence)`
3. tasks.md Task 6 新增子任务：`semantic-cache.ts 集成 recordCacheHit/Miss`
4. tasks.md Task 5 或 Task 6 新增子任务：`stream/route.ts 集成 recordCacheExpiry`
5. checklist.md 新增验证项：TTL 自主学习回路闭合验证
6. 文件清单中 `semantic-cache.ts` 的"改什么"补充"+ recordCacheHit/Miss 接入"

### C2 [中] 架构文档 8.7 节缺失

**问题描述**：

Handoff L1210 引用 `《大田精准耕播智能决策系统技术架构说明书》.md` — 8.7 节：三层审计管线（L1 debug trace + L2 AuditLog + L3 console），但该文件中不存在此章节。决策管线架构说明书 §9.3 有提及三层审计概念，但内容不完整。

**修正建议**：

在技术架构说明书中新增 8.7 节，或在决策管线架构说明书 §9.3 中补充表格式的三层职责边界（参考 spec.md Requirement: 三层职责边界的表格格式）。

### C3 [低] `semantic-cache.ts` 内部 `CACHE_TTL` 常量应标记为 deprecated

**问题描述**：

`semantic-cache.ts` L48-62 定义了 `CACHE_TTL` 常量和 `getTTL()` 函数，但第6轮后实际生效的 TTL 值由 `stream/route.ts` L429-431 通过 `getAdaptedTtl()` 在 `semanticCache.set()` 时注入到 entry.ttl。内部 `CACHE_TTL` 不再被读取路径消费（`get()` 方法用 `entry.ttl` 而非 `getTTL()`）。

**修正建议**：

在第7轮修改 `semantic-cache.ts` 时，将 `CACHE_TTL` 保留为 L3 fallback 默认值（仅在没有 `getAdaptedTtl` 的调用方直接使用时生效），并在注释中明确标注当前 TTL 由 `cache-ttl-stats.ts` 提供自适应值。

### C4 [中] 手动 L2 审计与 ADD-0.3 自动审计原则存在张力

**问题描述**：

`project_rules.md` ADD-0.3 明确规定：**"所有数据变更操作必须自动记录到 AuditLog 表，开发者不应手动编写 Layer 2 审计代码"**。自动审计采用 `withRuntimeAudit()` 高阶函数包装器模式：

> Plan: `.trae/plans/farm-agent-layer2-cross-cutting-plan-v1.md`
> Spec: `.trae/specs/farm-agent-layer2-cross-cutting/spec.md`

本轮方案在 `response.ts`、`path-metrics.ts`、`semantic-cache.ts` 中手动插入 `agentAuditStrategy/ExecutionQuality/CacheOperation` 调用，是**手动埋点**而非自动横切。这与 ADD-0.3 的方向形成张力。

**但** ADD-0.3 同时标注了"暂未实现，可暂时跳过"。`withRuntimeAudit` 是一个独立的跨横切 plan，不在本轮 7 轮管线范围之内。

**判定**：

本轮的手动 L2 调用是一个**过渡方案**。当前阶段 Agent 管线没有统一的 HTTP 中间件入口（LangGraph 节点间通过 `conversationContext` 传递），`withRuntimeAudit` 的自动拦截点设计需要更深的架构介入（第8轮或独立 spec）。

**修正建议**：

1. 在本轮 spec.md 的 Removed / Deferred Requirements 中新增一条：`ADD-0.3 withRuntimeAudit 自动化审计不在本轮范围，当前手动 L2 调用为过渡方案`
2. 代码中每个手动审计调用点加注释 `// TODO: 迁移至 withRuntimeAudit() ADD-0.3 自动审计`

---

## 4. 影响评估

### 4.1 受影响文件

| 文件 | 原计划变更 | 修订后变更 |
|------|-----------|-----------|
| spec.md | 7 个 Requirement | +2 个 Requirement（回路一接入） |
| tasks.md | 7 个 Task | Task 6 新增 2 子任务 |
| checklist.md | 34 项 | +3 项（回路一验证） |
| `semantic-cache.ts` | + agentAuditCacheOperation | + recordCacheHit/Miss |
| `stream/route.ts` | + setAuditContext/clearAuditContext/captureNode | + recordCacheExpiry |
| 架构文档 | 无变更计划 | 补充 8.7 节（三层审计管线） |

### 4.2 数据流影响

回路一接入后数据流：
```
cache GET 命中 → recordCacheHit(intent)
cache GET 未命中 → 管线重新运行 → stream/route.ts 拿到新 confidence
  → recordCacheExpiry(intent, oldConfidence, newConfidence)
  → adaptCacheTtl() 检查 expiredCount >= 3 → TTL 上调/下调/不变
  → 下次 getAdaptedTtl() 返回调整后的值
```

### 4.3 回滚风险

低。`recordCacheHit/Miss/Expiry` 只写内存 + JSON 文件，不写 DB Schema，删除 `logs/cache-ttl-stats.json` 即可回退。不影响 AuditLog 表结构。

---

## 5. 建议修正优先级

| 优先级 | 修正项 | 何时做 |
|:---:|------|------|
| **高** | C1 回路一接入（spec + tasks + checklist + 代码） | **必须在本轮执行前修正** |
| 中 | C2 架构文档 8.7 节补充 | 本轮的 ADD Step 0.4 文档先行中完成 |
| 中 | C4 ADD-0.3 手动/自动审计张力 — spec 注明过渡方案 + 代码加 TODO | 本轮 spec 修正和编码时完成 |
| 低 | C3 清理过时常量注释 | 修改 semantic-cache.ts 时顺手改 |

---

## 6. 最终建议

**修正后可以执行。** 核心变更是把回路一（`recordCacheHit/Miss/Expiry` 接入）纳入本轮文件清单。这不会增加新文件，只是在现有 `semantic-cache.ts` 和 `stream/route.ts` 的修改中多插入几行调用。

注意本轮的手动 L2 调用（agentAuditStrategy/ExecutionQuality/CacheOperation）是 ADD-0.3 `withRuntimeAudit` 自动化审计就绪前的**过渡方案**，每个调用点需标注 TODO。

推荐执行顺序：
1. 修正 spec.md / tasks.md / checklist.md（按 C1 + C4 建议）
2. 补充架构文档 8.7 节（按 C2 建议）
3. record_dev_operation 记录 doc 变更
4. 按修正后的 spec 执行代码实现（C3 编码时顺手改）
