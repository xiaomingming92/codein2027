# RAG 知识库 V2 分阶段实施计划

## 背景

当前 `fix-chat-ui-and-add-rag-tab` spec 已完成基础 UI，但知识库存在核心问题：
- 向量化是模拟的（setTimeout + 随机数），没有真实 RAG
- 没有文件去重、版本管理
- 没有文件系统知识库同步能力
- 缺少 Chroma 向量库导出/迁移机制

## 分阶段目标

### 阶段 1：统一文档模型（数据层对齐）
**目标**：废弃 `KnowledgeDocument`，统一使用 `Document` 模型，支持知识库场景

**改动范围**：
- Prisma schema：给 `Document` 加 `sourceType` 字段（PROJECT_DOC / KNOWLEDGE_UPDATE）
- 迁移数据：把现有 `KnowledgeDocument` 数据迁移到 `Document`
- 删除 `KnowledgeDocument` 模型
- API 层：`/api/knowledge/*` 改为操作 `Document` 表

**验收标准**：
- 知识库上传的文件真实存入 `Document` 表
- 原有项目文档功能不受影响

---

### 阶段 2：真实向量化（核心能力）
**目标**：上传/同步后真实调用 Chroma 进行向量化

**改动范围**：
- 上传 API：调用 `document-parser.ts` + `chroma.addDocuments()`
- 删除 API：从 Chroma 中删除对应向量
- 前端：移除前端模拟向量化（setTimeout），改为轮询真实状态
- 状态流转：`PENDING` → `INDEXED` / `ERROR`

**验收标准**：
- 上传 PDF/MD/TXT 后，Chroma 中真实有向量数据
- Agent 的 `retrievalNode` 能检索到知识库文档
- 删除文档后，Chroma 中对应向量被清理

---

### 阶段 3：文件系统知识库同步（一级知识库）
**目标**：支持扫描 `docs/*/knowledge/` 目录，增量同步到向量库

**改动范围**：
- 新增 `syncKnowledgeBase()` 服务函数
- 变更检测：added / modified / renamed / deleted / unchanged
- 增量索引：只处理变更的文件
- 前端："同步知识库"按钮 + 同步结果展示
- package.json：加 `kb:sync` 命令行脚本

**验收标准**：
- 点击"同步"后，扫描 `docs/` 下所有 knowledge 目录
- 新文件自动解析+向量化
- 修改过的文件重新向量化（先删旧向量）
- 已删除的文件从向量库清理
- 显示同步统计（新增/更新/删除/未变）

---

### 阶段 4：上传文档版本管理（二级知识库）
**目标**：支持多人上传同名文件，内容去重，版本控制

**改动范围**：
- `Document` 表加字段：`contentHash`, `version`, `status`, `uploadedBy`
- 上传 API：内容哈希去重、版本号递增、乐观锁
- 检索时：只返回 `status = ACTIVE` 的最新版本
- 前端：显示版本历史（可选）

**验收标准**：
- 相同内容文件上传第二次，提示已存在
- 同名不同内容文件上传，自动创建新版本
- 检索结果不包含旧版本

---

### 阶段 5：Chroma 向量库持久化与迁移
**目标**：支持导出/导入向量库数据，新环境快速恢复

**改动范围**：
- package.json 加脚本：`kb:export`, `kb:import`, `kb:reset`
- 导出：从 Chroma 读取所有向量 + 元数据，序列化为 JSON
- 导入：从 JSON 恢复向量（或重新索引）
- 启动时自动检测：向量库为空但数据库有文档 → 提示重新索引

**验收标准**：
- `npm run kb:export` 生成可移植的备份文件
- `npm run kb:import` 从备份恢复
- 新环境启动时，能从源文档重建索引

---

## 依赖关系

```
阶段 1（统一模型）
    ↓
阶段 2（真实向量化）
    ↓
阶段 3（文件系统同步） ← 可并行 → 阶段 4（版本管理）
    ↓
阶段 5（持久化迁移）
```

## 风险控制

| 风险 | 缓解措施 |
|------|----------|
| 阶段 1 改 schema 影响现有数据 | 先备份，写迁移脚本，可回滚 |
| 阶段 2 真实向量化可能慢 | 异步处理，前端显示进度 |
| 阶段 3 扫描大量文件耗时 | 增量检测，只处理变更 |
| 阶段 4 并发上传冲突 | 数据库唯一约束 + 乐观锁 |
| 阶段 5 Chroma 数据格式变更 | 导出时加版本号，兼容旧格式 |

## 当前决策点

请确认：
1. 阶段 1 的 `Document` 模型设计是否满足需求？
2. 是否先只做阶段 1+2（核心功能），3+4+5 后续再说？
3. 还是 5 个阶段全部确认后一起实施？
