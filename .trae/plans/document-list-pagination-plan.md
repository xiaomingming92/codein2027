# PLAN-document-list-pagination-v1：文档列表优化 — ADD 实施计划

## PLAN 元信息

- **Plan 名称**: `document-list-pagination-v1`
- **启动时间**: 2026-05-14TXX:XX:XX.000Z
- **主导 AI**: Trae IDE AI Assistant
- **ADD-7 审计策略**:

| # | 文件 | targetType | action | beforeState | afterState | 状态 |
|---|------|-----------|--------|------------|-----------|------|
| 1 | route.ts (API) | API_ROUTE | API_PAGINATION_ENABLED | 无分页，返回全部数据 | 支持 page/pageSize，向后兼容 | 待记录 |
| 2 | knowledge-base-panel.tsx | COMPONENT | COMPONENT_LOADING_STATE_ADDED | 无 loading 状态 | 添加 Skeleton + 错误重试 | 待记录 |
| 3 | knowledge-base-panel.tsx | COMPONENT | COMPONENT_PAGINATION_ADDED | 无分页 | 添加分页 UI + 页码导航 | 待记录 |
| 4 | knowledge-base-panel.tsx | COMPONENT | COMPONENT_VIRTUAL_LIST_ADDED | ScrollArea + map 渲染 | react-virtuoso 虚拟列表 | 待记录 |
| 5 | package.json | DEPENDENCY | DEPENDENCY_ADDED | 无 react-virtuoso | 添加 react-virtuoso | 待记录 |

## 用户选择确认

| 选项 | 选择 |
|------|------|
| 虚拟列表库 | `react-virtuoso` |
| 每页数量 | 50 条/页 |
| API 向后兼容 | 不传分页参数时返回全部数据 |

---

## Phase 0：依赖安装

```bash
npm install react-virtuoso
```

---

## Phase 1：审计基础设施

根据 ADD-1，先定义审计阶段枚举，确保开发过程的可观测性。

**领域**: `document-list`  
**阶段枚举**: `DOC_LIST_LOAD, DOC_LIST_PAGINATE, DOC_LIST_RENDER`  
**审计前缀**: `[DOC-LIST-AUDIT]`

> 由于本次改动集中在**前端组件**和**后端 API Route**，不涉及新的业务服务，审计日志器的实现模式将采用轻量内联方式（console + 日志信息打印），遵循 ADD-4 的三通道原则中的前两通道。

---

## Phase 2：后端分页 API

### 文件

[route.ts](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/app/api/knowledge/documents/route.ts)

### 改动内容

```typescript
// 新增查询参数
const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50")))
const enabledPagination = searchParams.has("page") || searchParams.has("pageSize")

// 分页查询使用 Prisma $transaction 保证原子性
if (enabledPagination) {
  const [documents, total] = await prisma.$transaction([
    prisma.document.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.document.count({ where: whereClause }),
  ])
  // ... 返回 { data, pagination: { page, pageSize, total, totalPages } }
} else {
  // 向后兼容：返回全部数据
  const documents = await prisma.document.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
  })
  // ... 返回 { data, total }
}
```

### 返回格式

```typescript
// 分页模式
{
  success: true,
  data: [...],
  pagination: {
    page: number,
    pageSize: number,
    total: number,
    totalPages: number
  }
}

// 向后兼容模式
{
  success: true,
  data: [...],
  total: number
}
```

---

## Phase 3：前端加载态

### 文件

[knowledge-base-panel.tsx](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/components/knowledge/knowledge-base-panel.tsx)

### 改动内容

1. **新增状态**:
   ```typescript
   const [isLoadingDocuments, setIsLoadingDocuments] = React.useState(true)
   const [documentLoadError, setDocumentLoadError] = React.useState<string | null>(null)
   ```

2. **初始加载逻辑增强** (原 `useEffect`):
   - 开始时 `setIsLoadingDocuments(true)`, `setDocumentLoadError(null)`
   - 成功时 `setIsLoadingDocuments(false)`
   - 失败时 `setIsLoadingDocuments(false)`, `setDocumentLoadError("加载失败")`

3. **Skeleton 组件** (内联在文件中):
   - 5 个骨架屏卡片，每个卡片高约 72px
   - 用 `animate-pulse` 脉冲动画模拟加载
   - 包含文件图标、文件名、大小和日期的占位

4. **错误重试**:
   - 加载失败时显示错误信息和「重试」按钮
   - 点击重试重新执行数据请求

---

## Phase 4：前端分页

### 文件

[knowledge-base-panel.tsx](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/components/knowledge/knowledge-base-panel.tsx)

### 改动内容

1. **新增状态**:
   ```typescript
   const [page, setPage] = React.useState(1)
   const [totalPages, setTotalPages] = React.useState(1)
   const pageSize = 50
   ```

2. **请求时携带分页参数**:
   ```typescript
   const response = await fetch(`/api/knowledge/documents?page=${page}&pageSize=${pageSize}`)
   // 响应中包含 pagination: { page, pageSize, total, totalPages }
   ```

3. **分页 UI** (文档列表底部):
   - 左侧：「共 N 条，第 X/Y 页」
   - 右侧：「上一页」「下一页」按钮
   - 当前为第一页时禁用「上一页」，最后一页时禁用「下一页」
   - 页码变化时重新请求数据并展示 loading（保留旧数据+半透明覆盖，避免页面闪烁）

4. **分页切换时**:
   - `setIsLoadingDocuments(true)` → 请求 → `setIsLoadingDocuments(false)`
   - 分页 loading 时展示列表上方小型 loading 指示器

5. **同步/上传后自动回到第一页**:
   - 上传文档成功后，同步完成后，调用 `setPage(1)` 并重新获取

---

## Phase 5：虚拟列表

### 文件

[knowledge-base-panel.tsx](file:///home/xmm/ai/农业智能体/team-coordinator-agent/src/components/knowledge/knowledge-base-panel.tsx)

### 改动内容

1. **引入 react-virtuoso**:
   ```typescript
   import { Virtuoso } from "react-virtuoso"
   ```

2. **替换 ScrollArea 中的 map 渲染**:
   - 移除 `ScrollArea` 内的 `documents.map(...)` 循环
   - 使用 `Virtuoso` 组件包裹文档卡片列表
   - 固定行高 `overscan={5}` (预渲染前后各 5 项)
   - `totalCount={documents.length}`

3. **Virtuoso 与分页协同**:
   - 当前页数据通过 `documents.slice()` 传入 Virtuoso
   - 翻页时重新设置 Virtuoso 的数据源

4. **Virtuoso 自定义组件**:
   - `components.Header`: 空状态展示
   - `components.EmptyPlaceholder`: 空状态（无文档时）
   - 保留现有的 `getFileIcon`, `getStatusBadge`, `getSourceTypeBadge` 等渲染逻辑

---

## Phase 6：ADD 合规验证

### 实施后检查

| 检查项 | 工具 | 预期结果 |
|--------|------|---------|
| 阶段标记对称性 | `check_phase_symmetry` | 所有 Start/End 配对 |
| 失败路径审计密度 | `check_failure_path` | catch 块与 try 块信息密度一致 |
| TypeScript 编译 | `npx tsc --noEmit` | 零错误 |
| Lint | `npm run lint` | 零错误 |

---

## 实施顺序

```
Phase 0 (安装依赖)
  → Phase 1 (审计定义)
    → Phase 2 (后端API)
      → Phase 3 (加载态)
        → Phase 4 (分页)
          → Phase 5 (虚拟列表)
            → Phase 6 (验证)
```

每个 Phase 完成后自动进入下一个，无需额外确认。请回复 **「确认实施」** 开始执行。
