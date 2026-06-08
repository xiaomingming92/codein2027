# 知识库向量化审计日志 + 卡死文档修复方案

## 🔍 现状调查

### ChromaDB 实际数据
- 集合 `team_coordinator` 共 **51 条向量**
- 8 个文档（8×~7块 = 51）全部来自**最新一次同步**
- **`cmp0zf6co0000lz4x180qjpi5`（《智能体总体架构说明书》）在 ChromaDB 中 0 条向量**
- 数据库中该文档 `status=PENDING`, `vectorIds=null`

### 根因链
1. 首次同步时 Chroma 认证失败 → 文档入库但向量化未执行 → `status=PENDING`, `vectorIds=null`
2. 二次同步时 `detectChanges()` 判定 contentHash 匹配 → 归入 `unchanged` → 跳过
3. Phase 4 重试逻辑 `NOT: { vectorIds: { isEmpty: false } }` → Prisma 对 `null` 数组的行为不确定 → 可能查不到
4. 全程无可审计日志，无法判断同步按钮是否触发了向量化

---

## 📋 修复计划

### Task 1: 修复卡死文档 — 直接修数据库状态后重试
- 用 Prisma 直接把 `cmp0zf6co0000lz4x180qjpi5` 的 `status` 改回 `PENDING_INDEX`
- 确保 Phase 4 重试查询能命中（改用更可靠的 OR 查询）
- 验证同步后 ChromaDB 中出现对应向量

### Task 2: 重写 Phase 4 重试查询 — 兼容 null/空数组
- 当前: `NOT: { vectorIds: { isEmpty: false } }` — Prisma 对 null 行为不确定
- 改为: `OR: [{ vectorIds: { isEmpty: true } }, { vectorIds: null }]` — 显式覆盖两种情况

### Task 3: 植入结构化审计日志
- 已创建 `src/lib/audit-logger.ts`（audit/auditDoc/auditPhaseStart/auditPhaseEnd/auditToken/auditSummary）
- 在 `knowledge-sync.ts` 各阶段植入审计标记
- 在 `knowledge-indexer.ts` 每个块向量化时植入 token/duration 日志
- 格式: `[KB-AUDIT] [timestamp] [PHASE] detail | {json_extra}`

### Task 4: 同步完成后写入审计摘要到数据库
- 在 Document.metadata 中记录 `lastSyncAudit` 字段
- 包含: vectorizedAt, vectorCount, totalTokens, totalDuration, chunkCount

### Task 5: 前端展示向量化审计信息
- 文档卡片显示: 向量数、向量化耗时、token消耗
- 处理中状态显示: 当前阶段（解析/分块/向量化）

---

## 🔧 执行顺序

1. 修 Phase 4 查询 → 确保能捞到卡死文档
2. 植入审计日志到 sync + indexer
3. 写入审计摘要到 metadata
4. 前端展示审计信息
5. 重启 dev server → 点同步 → 验证日志 + ChromaDB 数据
