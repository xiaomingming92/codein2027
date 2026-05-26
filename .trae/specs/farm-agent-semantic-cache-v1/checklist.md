# Checklist: 语义缓存

- [ ] `src/services/semantic-cache.ts` 新建完成
- [ ] SimpleSemanticCache 类实现：get / set / invalidate / getStats
- [ ] buildCacheKey() 三元组 hash 组合正确
- [ ] kbGeneration 全局函数可用（bump/det）
- [ ] CACHE_TTL 按意图分档（7 种 + default）
- [ ] get() 先判 kbGeneration → 再判 TTL → 命中加 hitCount
- [ ] set() 写入前 LRU 淘汰（超 MAX_CACHE_SIZE 时）
- [ ] stream/route.ts 集成缓存查询/存储
- [ ] 缓存命中时模拟流式输出（cache_hit 事件 + chunkSize=3 + 目标 1.5s）
- [ ] 缓存写入 fire-and-forget（失败不影响响应）
- [ ] knowledge-indexer.ts 索引完成后调用 bumpKbGeneration()
- [ ] 缓存命中验证：同一问题两次 → 第2次 cache_hit
- [ ] TTL 过期验证：超过 TTL 后重发 → 走完整管线
- [ ] Generation 过期验证：上传文档后重发 → 走完整管线
- [ ] 模拟流式验证：token 事件分片推送，总耗时 0.5-1.5s
- [ ] LRU 淘汰验证：填充超 200 条 → 最旧被逐出
