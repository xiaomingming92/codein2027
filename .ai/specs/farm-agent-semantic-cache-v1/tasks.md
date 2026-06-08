# Tasks: 语义缓存

## Preconditions

- [ ] 已执行 `session-init` SKILL
- [ ] 已执行 `add-paradigm` SKILL（Step 0 文档先行）
- [ ] 上游第1-4轮 ADD-7 审计记录存在（`query_audit_logs({ sinceMinutes: 4320, keyword: "REPORT_GENERATOR_CREATED" })`）
- [ ] `npx tsc --noEmit` 在上游完成后通过

## Forbidden

- 禁止修改 Prisma Schema（`prisma/schema.prisma`）
- 禁止修改前端组件（React/Vue 组件文件）
- 禁止覆盖或重构已有 stream-bus / SSE 事件总线逻辑
- 禁止简化代码实现，一切以代码高质量为衡量标准
- 禁止缓存在 set 失败时阻塞响应返回（fire-and-forget + try-catch）

- [ ] Task 1: 新建 SimpleSemanticCache 类
  - [ ] 新建 `src/services/semantic-cache.ts`
  - [ ] 实现 `CacheKey` 和 `CacheEntry` 接口
  - [ ] 实现 `buildCacheKey(normalizedQuery, intent, activeExperts, kbGeneration)` — 四元组 hash 组合（normalizedQuery:16 + intent:8 + activeExperts:8 + kbGen）
  - [ ] 实现 `SimpleSemanticCache` 类
    - `get(key)`：kbGeneration 判定 → TTL 判定 → 返回 entry 或 null
    - `set(key, entry)`：LRU 淘汰 + 写入
    - `invalidate(pattern)`：正则批量淘汰
    - `getStats()`：size / maxSize / hitRate
  - [ ] 实现 `bumpKbGeneration()` 和 `getKbGeneration()` 全局函数
  - [ ] 定义按意图的 `CACHE_TTL` 常量（7 种意图 + default）
  - [ ] 验证：单元测试覆盖 get/set/evict/expire 场景

- [ ] Task 2: 集成缓存到 stream/route.ts
  - [ ] 修改 `src/app/api/agent/chat/stream/route.ts`
  - [ ] 管线启动前：构建 cacheKey → semanticCache.get() → HIT 时模拟流式输出
  - [ ] 模拟流式输出：
    - `cache_hit` 事件（含 sourceTraceId + cachedAt）
    - chunkSize=3 分片，自适应延迟（目标 1.5s）
    - `structured_output` 事件
  - [ ] 管线完成后：semanticCache.set(cacheKey, entry)（fire-and-forget，try-catch 包裹）
  - [ ] 验证：同一问题发送两次 → 第2次 cache_hit + 模拟流式

- [ ] Task 3: KnowledgeIndexer 集成 kbGeneration 递增
  - [ ] 修改 `src/services/knowledge-indexer.ts`
  - [ ] 索引完成后调用 `bumpKbGeneration()`
  - [ ] 验证：上传新文档后发送相同问题 → 走完整管线（缓存被 Generation 淘汰）

- [ ] Task 4: 端到端验证
  - [ ] 缓存命中：同一问题两次 → 第2次 cache_hit
  - [ ] TTL 过期：等待超时后重发 → 走完整管线
  - [ ] Generation 过期：上传文档后重发 → 走完整管线
  - [ ] 模拟流式：token 分片推送，总耗时 0.5-1.5s
  - [ ] LRU 淘汰：填充超 200 条 → 最旧被逐出
  - [ ] 缓存不阻塞：set 失败不影响响应

# Task Dependencies

- Task 2 依赖 Task 1（需要 SimpleSemanticCache 实例）
- Task 3 依赖 Task 1（需要 bumpKbGeneration 函数）
- Task 4 依赖 Task 1-3 全部完成

## Verification

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`（如项目已配置）
- 当前 spec `checklist.md` 全部通过
- 当前对话 ADD-7 `record_dev_operation` 已逐文件记录

## 对话启动（将此段粘贴给新的 LLM 对话）

你在执行 farm-agent 改进的 **第5轮**（语义缓存）。上游第1-4轮已完成管线消费、报告服务。

**启动步骤（按顺序）：**
1. 执行 `session-init` SKILL → `query_audit_logs({ sinceMinutes: 4320 })` 确认第1-4轮完成
2. 执行 `add-paradigm` SKILL
3. 阅读 `specs/co-agent-semantic-cache/spec.md`
4. 按本文档 tasks.md 顺序执行

**文件清单（1新建+2修改）：**
`semantic-cache.ts`(新) / `stream/route.ts`(改) / `knowledge-indexer.ts`(改)

**⚠️ stream/route.ts 第3/4轮已改过（analysisContext 加载/保存 + 管线消费），做增量编辑，只加缓存查询/存储逻辑，不改流式事件总线。**
**⚠️ 缓存 key 必须是四元组（normalizedQuery + intent + sorted(activeExperts) + kbGeneration），不是旧版三元组。**

**关键提醒：** 对话已开 4/5，缓存做完再做演化闭环（同一对话内）。完成后立即 record_dev_operation。
