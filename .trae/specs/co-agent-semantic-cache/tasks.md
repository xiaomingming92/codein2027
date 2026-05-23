# Tasks: 语义缓存

- [ ] Task 1: 新建 SimpleSemanticCache 类
  - [ ] 新建 `src/services/semantic-cache.ts`
  - [ ] 实现 `CacheKey` 和 `CacheEntry` 接口
  - [ ] 实现 `buildCacheKey(query, intent, projectId?, threadId?)` — 三元组 hash 组合
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
