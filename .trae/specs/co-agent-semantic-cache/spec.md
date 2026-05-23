# 语义缓存 Spec

## Why

相同问题重复发送给 Agent 时每次都走完整 6 节点管线，浪费 LLM token 和响应延迟。需要一层语义级缓存：相同意图 + 相似问题 → 直接返回缓存结果。知识库文档变更后，旧缓存应自动失效（Generation-based 淘汰）。

## What Changes

- 新建 `src/services/semantic-cache.ts`：SimpleSemanticCache 类（LRU + 按意图 TTL + kbGeneration 版本淘汰）+ buildCacheKey() + bumpKbGeneration()
- stream/route.ts 集成缓存查询/存储 + 命中时模拟流式输出
- knowledge-indexer.ts 索引完成后调用 bumpKbGeneration()

## Impact

- Affected specs: 无
- Affected code: `src/services/semantic-cache.ts`（新建）, `src/app/api/agent/chat/stream/route.ts`（修改）, `src/services/knowledge-indexer.ts`（修改）
- 父 Plan: [co-agent-simplified-v1.md](../../documents/co-agent-simplified-v1.md)
- 依赖: 第4轮(领域集成) — 需要 stream/route.ts 中已有的管线架构
- 后续依赖: 第6轮(演化闭环)

## ADDED Requirements

### Requirement: 缓存键构建

缓存键 SHALL 由三元组组成：
- `queryHash`：用户消息内容的 SHA256 前 16 位
- `intentHash`：意图类型的 hash 前 8 位
- `contextHash`：projectId + threadId 的 hash 前 8 位
- `compositeKey`：`${queryHash}:${intentHash}:${contextHash}`

### Requirement: 三层淘汰策略

缓存 SHALL 使用三层淘汰：

**Layer 1 — Generation-based**：每个 CacheEntry 写入时记录 `kbGeneration`（出生版本）。全局 `kbGeneration` 在知识库索引完成后递增。`get()` 时若 `entry.kbGeneration < kbGeneration`，惰性淘汰，O(1) 操作。

#### Scenario: 知识库变更后缓存失效
- **WHEN** 上传新文档后 kbGeneration 从 3 变为 4
- **AND** 用户发送与之前相同的问题
- **THEN** 旧缓存条目 kbGeneration=3 < current=4 → 淘汰 → 走完整管线

**Layer 2 — TTL-based**：每个 CacheEntry 记录 `createdAt` 和 `ttl`（秒）。`get()` 时若 `Date.now() - createdAt > ttl * 1000`，过期淘汰。

TTL 按意图类型区分：
| intent | TTL（秒） |
|--------|----------|
| chat | 3600 |
| question | 1800 |
| analysis | 300 |
| planning | 600 |
| decision | 600 |
| creation | 300 |
| modification | 300 |
| default | 300 |

**Layer 3 — LRU**：缓存容量上限 MAX_CACHE_SIZE=200。超出时删除 `createdAt` 最旧的条目。

#### Scenario: TTL 过期
- **WHEN** analysis 意图缓存已超过 300 秒
- **THEN** 下次 get() 返回 null → 重新走完整管线

#### Scenario: LRU 淘汰
- **WHEN** 缓存条目数超过 200
- **THEN** 最旧的条目被逐出

### Requirement: 缓存命中模拟流式输出

缓存命中时 SHALL 不直接返回完整结果，而是模拟正常的 SSE token 流式输出：
- 首先推送 `cache_hit` 事件（含 sourceTraceId + cachedAt，前端可展示 ⚡ 缓存响应）
- 按 chunkSize=3 分片推送 token 事件
- 目标总耗时约 1.5s（自适应延迟）
- 每个分片间隔 ≥ 5ms
- 最后推送 `structured_output` 事件（与正常流程一致）

#### Scenario: 缓存命中用户体验
- **WHEN** 发送与第1次相同的问题
- **THEN** SSE 首事件为 `cache_hit`
- **AND** token 事件以 ~3 字符/片的速度推送
- **AND** 总耗时在 0.5-1.5s 之间
- **AND** 最终推送 structured_output（DisplayContent 与正常流程一致）

### Requirement: 缓存不阻塞管线

缓存写入 `semanticCache.set()` SHALL 不阻塞 Agent 响应返回。写入失败 SHALL 不影响响应正常发送。

### Requirement: 全局 kbGeneration 管理

`bumpKbGeneration()` 在 knowledge-indexer 索引完成后调用，全局版本号 +1。`getKbGeneration()` 返回当前全局版本号。

## MODIFIED Requirements

### Requirement: stream/route.ts 集成缓存

stream/route.ts SHALL 在管线启动前查询语义缓存：
1. 构建 cacheKey = buildCacheKey(userMessage, intent, projectId, threadId)
2. cacheEntry = semanticCache.get(cacheKey)
3. HIT → 模拟流式输出 → return（跳过 Agent 管线）
4. MISS → 继续执行 Agent 管线
5. 管线完成后 → semanticCache.set(cacheKey, entry)（fire-and-forget）

## REMOVED Requirements

无
