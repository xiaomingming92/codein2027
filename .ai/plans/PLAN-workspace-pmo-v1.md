# Workspace PMO 工具集 v1

## PLAN 元信息

- **Plan 名称**: workspace-pmo-v1
- **启动时间**: 2026-05-14
- **主导 AI**: Cursor AI
- **定位**: 在团队协同智能体练手，验证架构后应用于农机智能体平台
- **前置依赖**: personnel-management-v1（人员管理体系建立后，"管"才有管理对象）
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| `prisma/schema.prisma` | SCHEMA | SCHEMA_MODEL_CREATED | 无 PMO 模型 | 新增 Budget/Risk/LearnedLesson 模型 | 待记录 |
| `src/types/workspace.ts` | TYPE | TYPE_CREATED | 不存在 | 新建 Workspace PMO 类型定义 | 待记录 |
| `src/lib/workspace-logger.ts` | LIB | LIB_CREATED | 不存在 | 新建 PMO 审计日志器 | 待记录 |
| `src/services/workspace-service.ts` | SERVICE | SERVICE_CREATED | 不存在 | 新建 PMO 服务层 | 待记录 |
| `src/lib/xlsx-utils.ts` | LIB | LIB_CREATED | 不存在 | 新建 Excel 读写工具 | 待记录 |
| `src/app/api/workspace/progress/route.ts` | API_ROUTE | API_ENDPOINT_CREATED | 不存在 | 新建进度仪表盘 API | 待记录 |
| `src/app/api/workspace/cost/route.ts` | API_ROUTE | API_ENDPOINT_CREATED | 不存在 | 新建成本管理 API | 待记录 |
| `src/app/api/workspace/risk/route.ts` | API_ROUTE | API_ENDPOINT_CREATED | 不存在 | 新建风险管理 API | 待记录 |
| `src/app/api/workspace/wbs/route.ts` | API_ROUTE | API_ENDPOINT_CREATED | 不存在 | 新建 WBS 任务分解 API | 待记录 |
| `src/app/api/workspace/report/route.ts` | API_ROUTE | API_ENDPOINT_CREATED | 不存在 | 新建报告生成 API | 待记录 |
| `src/app/api/workspace/export/route.ts` | API_ROUTE | API_ENDPOINT_CREATED | 不存在 | 新建 xlsx 导出 API | 待记录 |
| `src/stores/workspace-store.ts` | STORE | STORE_CREATED | 不存在 | 新建 PMO 状态管理 | 待记录 |
| `src/components/workspace/progress-dashboard.tsx` | COMPONENT | COMPONENT_CREATED | 不存在 | 新建进度仪表盘 | 待记录 |
| `src/components/workspace/cost-panel.tsx` | COMPONENT | COMPONENT_CREATED | 不存在 | 新建成本管理面板 | 待记录 |
| `src/components/workspace/risk-register.tsx` | COMPONENT | COMPONENT_CREATED | 不存在 | 新建风险登记册 | 待记录 |
| `src/components/workspace/wbs-editor.tsx` | COMPONENT | COMPONENT_CREATED | 不存在 | 新建 WBS 任务分解编辑器 | 待记录 |
| `src/components/workspace/workspace-tab.tsx` | COMPONENT | COMPONENT_CREATED | 不存在 | 新建 Workspace 主 Tab | 待记录 |
| `src/agents/tools/schemas/workspace-tools.ts` | TOOL | TOOL_CREATED | 不存在 | 新建 PMO Agent 工具 Schema | 待记录 |
| `src/agents/tools/impl/workspace-tools.ts` | TOOL | TOOL_CREATED | 不存在 | 新建 PMO Agent 工具实现 | 待记录 |
| `package.json` | DEPENDENCY | DEPENDENCY_ADDED | 无 xlsx | 添加 `xlsx` npm 包 | 待记录 |
| `src/app/page.tsx` | COMPONENT | COMPONENT_MODIFIED | 无 Workspace 入口 | 侧边栏增加"工作台" Tab | 待记录 |

---

## 一、核心设计思想：团队协同为农机验证架构

### 思维对偶

```
团队协同智能体（练手）                   农机智能体平台（落地）
━━━━━━━━━━━━━━━━                     ━━━━━━━━━━━━━━━━━━
项目 Project                         农场 Farm
  WBS 任务分解                          农事作业计划分解
  进度仪表盘（Task 自动派生）               农事进度（地块/作业类型）
  成本管理（预算 vs 人天）                 成本管理（种子/农药/农机油耗）
  风险登记册                              气象风险/病虫害风险/设备故障风险
   风险评估矩阵                            灾害预警矩阵
  复盘/经验库                            农事经验库（年度总结）
  xlsx 导出/导入                          xlsx 报表（向上汇报）
```

**核心套路**是一样的——都是"计划→执行→监控→复盘"的 PDCA 闭环。先在团队协同验证数据结构和工作流是否合理，再以最小成本移植到农机平台。

---

## 二、数据模型设计

### 2.1 进度管理（Progress）

基于现有的 `Task` 模型自动派生，不新建独立进度模型。进度数据来源：

```
Task.progress (0-100)            → 整体进度 = avg(所有 Task.progress)
Task.status (PENDING/IN_PROGRESS/COMPLETED) → 燃尽图数据
Task.endDate                    → 延迟分析
Task.assigneeId                 → 人员负载热力图
Task.parentId (WBS 层级)        → 里程碑/阶段进度
```

**唯一需要新增**: `Project.metadata.lastProgressSnapshot` 用于存储快照对比。

### 2.2 成本管理（Cost）

```prisma
enum CostCategory {
  LABOR        // 人力成本
  MATERIAL     // 物料成本
  EQUIPMENT    // 设备成本
  TRAVEL       // 差旅
  OTHER        // 其他
}

model Budget {
  id              String       @id @default(cuid())
  projectId       String
  project         Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // 预算头
  totalBudget     Float        // 总预算
  currency        String       @default("CNY")

  // 预算明细（JSON 方便灵活扩展）
  lineItems       Json         // [{ category: "LABOR", planned: 100000, spent: 85000, note: "开发人力" }]

  // 审计
  metadata        Json?        // 审计回写

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}
```

### 2.3 风险管理（Risk）

```prisma
enum RiskLevel {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

enum RiskStatus {
  IDENTIFIED      // 已识别
  ASSESSED        // 已评估
  MITIGATING      // 缓解中
  CLOSED          // 已关闭
  ACCEPTED        // 已接受
}

model Risk {
  id              String       @id @default(cuid())
  projectId       String
  project         Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // 风险描述
  title           String
  description     String?
  category        String       // 技术/管理/外部/人员

  // 评估
  probability     Float        // 0-1 发生概率
  impact          RiskLevel    // 影响级别
  riskScore       Float?       // 自动计算: probability * impact 量化值

  // 状态
  status          RiskStatus   @default(IDENTIFIED)

  // 缓解措施
  mitigationPlan  String?
  contingencyPlan String?
  ownerId         String?      // 责任人
  owner           User?        @relation(fields: [ownerId], references: [id])

  // 审计
  metadata        Json?

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}
```

### 2.4 复盘/经验库（Lessons Learned）

```prisma
model LearnedLesson {
  id              String       @id @default(cuid())
  projectId       String
  project         Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)

  // 复盘内容
  title           String
  category        String       // 技术/流程/沟通/管理
  whatWentWell    String?      // 做得好
  whatWentWrong   String?      // 做得差
  improvement     String       // 改进建议

  // 影响
  impact          String?
  actionItems     Json?        // [{ action: "...", owner: "...", deadline: "..." }]

  // 审计
  metadata        Json?

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}
```

### 2.5 项目扩展字段

```prisma
model Project {
  // ... 现有字段不变 ...
  config          Json?        // 已有，扩展 workspace 配置
  // workspaceConfig: {
  //   progressEnabled: boolean,
  //   costEnabled: boolean,
  //   riskEnabled: boolean,
  //   weeklyReportDay: "MONDAY",
  //   defaultCurrency: "CNY"
  // }
}
```

---

## 三、实施阶段

### 阶段一：数据模型 + xlsx 工具（P0）

1. `prisma/schema.prisma` — 新增 Budget / Risk / LearnedLesson 模型
2. `npx prisma db push`
3. 安装 `npm install xlsx`
4. 新建 `src/lib/xlsx-utils.ts` — Excel 读写工具（统一封装，后续农机可直接复用）

### 阶段二：服务层 + API（P0）

1. `src/types/workspace.ts` — 类型定义
2. `src/lib/workspace-logger.ts` — PMO 审计日志器
3. `src/services/workspace-service.ts` — PMO 服务层

   - `getProgressDashboard(projectId)` — 从 Task 自动派生进度数据
   - `getBurndownData(projectId, since)` — 燃尽图数据
   - `getCostOverview(projectId)` — 成本概览
   - `getRiskMatrix(projectId)` — 风险矩阵
   - `generateWeeklyReport(projectId)` — 周报自动生成
   - `exportToXlsx(projectId, type)` — 导出 xlsx
   - `importFromXlsx(projectId, file)` — 从 xlsx 导入（风险/成本数据）

4. API Routes:

   | 端点 | 方法 | 功能 |
   |------|------|------|
   | `/api/workspace/progress` | GET | 进度仪表盘数据 |
   | `/api/workspace/cost` | GET/POST | 成本查看/创建预算 |
   | `/api/workspace/cost` | PUT | 更新预算明细 |
   | `/api/workspace/risk` | GET/POST | 风险列表/新建风险 |
   | `/api/workspace/risk/[id]` | PUT/DELETE | 更新/关闭风险 |
   | `/api/workspace/wbs` | GET/POST | WBS 视图/从 Task 树生成 |
   | `/api/workspace/report` | POST | 生成周报（返回结构化数据） |
   | `/api/workspace/export` | POST | 导出 xlsx 文件 |
   | `/api/workspace/import` | POST | 导入 xlsx 文件 |

### 阶段三：前端 UI

1. `src/stores/workspace-store.ts` — Zustand 状态管理
2. `src/components/workspace/progress-dashboard.tsx` — 进度仪表盘

   - 整体进度环（大数字百分比）
   - 按状态分组柱状图（PENDING/IN_PROGRESS/COMPLETED）
   - 燃尽图（剩余工作量 vs 时间）
   - 里程碑进度列表
   - 延迟任务警告列表

3. `src/components/workspace/cost-panel.tsx` — 成本管理面板

   - 预算 vs 实际（饼图/柱状图对比）
   - 按类别展开明细
   - 超支预警（红色高亮）

4. `src/components/workspace/risk-register.tsx` — 风险登记册

   - 风险矩阵热力图（概率×影响）
   - 风险卡片列表（按 severity 排序）
   - 状态标签：已识别/评估中/缓解中/已关闭
   - 缓解措施查看

5. `src/components/workspace/wbs-editor.tsx` — WBS 任务分解编辑器

   - 基于现有 Task.parentId 的树状视图
   - 拖拽排序/调整层级
   - 一键"从 WBS 生成 Task 到项目"
   - 展开/折叠

6. `src/components/workspace/workspace-tab.tsx` — Workspace 主 Tab

   - 子 Tab 切换：进度 / 成本 / 风险 / 复盘
   - 导出按钮（xlsx）
   - 导入按钮

7. 集成到主导航 — 侧边栏增加"工作台" Tab

### 阶段四：Agent 工具 + 报告自动生成

1. `src/agents/tools/schemas/workspace-tools.ts`

   | 工具 Schema | 参数 |
   |------------|------|
   | `GetProgressDashboardSchema` | projectId |
   | `GetBurndownSchema` | projectId, since? |
   | `GetRiskMatrixSchema` | projectId, levelFilter? |
   | `AddRiskSchema` | projectId, title, probability, impact, description? |
   | `GenerateWeeklyReportSchema` | projectId |
   | `ExportWorkspaceSchema` | projectId, format ("xlsx"\|"json") |

2. `src/agents/tools/impl/workspace-tools.ts`

   - `getProgressDashboardTool` — 进度查询
   - `getBurndownTool` — 燃尽图数据
   - `addRiskTool` — 通过聊天直接添加风险
   - `generateWeeklyReportTool` — Agent 自动生成周报（调用 LLM 总结进度+风险）
   - `exportWorkspaceTool` — 导出完整 workspace 为 xlsx

### 阶段五：文档 workspace 接入（数据迁移）

将现有的 `docs/农业智能体(把地种智能体)/workspace/` 中的静态文件数据导入到数据库：

1. 解析 `进度同步.md` → 写入进度快照 → 验证
2. 解析 `风险管理评估表.xlsx` → 写入 Risk 表 → 验证
3. 解析 `项目策划物料清单.xlsx` / `项目费用预算表.xlsx` → 写入 Budget 表 → 验证
4. 解析 `项目工作复盘.xlsx` → 写入 LearnedLesson 表 → 验证
5. 确认数据完整后，在 UI 中可以看到与静态文件一致的视图

---

## 四、按 ADD 范式的实施步骤

### Step 0：审计阶段定义

```typescript
type WorkspacePhase =
  | "WORKSPACE_START"           // PMO 工作流开始
  | "PROGRESS_QUERY"            // 查询进度
  | "COST_QUERY"                // 查询成本
  | "COST_UPDATE"               // 更新预算
  | "RISK_CREATE"               // 创建风险
  | "RISK_UPDATE"               // 更新风险
  | "WBS_GENERATE"              // 生成 WBS 视图
  | "REPORT_GENERATE"           // 生成周报
  | "EXPORT_XLSX"               // 导出 xlsx
  | "IMPORT_XLSX"               // 导入 xlsx
  | "DATA_MIGRATION"            // 从静态文档迁移数据
  | "WORKSPACE_DONE"            // 完成
  | "WORKSPACE_FAIL"            // 失败
```

### Step 1：审计基础设施

使用 MCP 工具 `generate_audit_logger` 生成 `src/lib/workspace-logger.ts`。

### Step 2-6：逐步实现、验证、收敛

每个阶段的实现完成后，运行审计日志验证，确保 ADD-1~6 合规。

---

## 五、文件变更清单

### 新建文件

| # | 文件 | 说明 |
|---|------|------|
| 1 | `src/types/workspace.ts` | Workspace PMO 类型定义 |
| 2 | `src/lib/workspace-logger.ts` | PMO 审计日志器 |
| 3 | `src/lib/xlsx-utils.ts` | Excel 读写工具（可复用到农机） |
| 4 | `src/services/workspace-service.ts` | PMO 服务层 |
| 5 | `src/app/api/workspace/progress/route.ts` | 进度仪表盘 API |
| 6 | `src/app/api/workspace/cost/route.ts` | 成本管理 API |
| 7 | `src/app/api/workspace/risk/route.ts` | 风险管理 API |
| 8 | `src/app/api/workspace/risk/[id]/route.ts` | 风险详情 API |
| 9 | `src/app/api/workspace/wbs/route.ts` | WBS 任务分解 API |
| 10 | `src/app/api/workspace/report/route.ts` | 周报生成 API |
| 11 | `src/app/api/workspace/export/route.ts` | xlsx 导出 API |
| 12 | `src/app/api/workspace/import/route.ts` | xlsx 导入 API |
| 13 | `src/stores/workspace-store.ts` | PMO 状态管理 |
| 14 | `src/components/workspace/progress-dashboard.tsx` | 进度仪表盘 |
| 15 | `src/components/workspace/cost-panel.tsx` | 成本管理面板 |
| 16 | `src/components/workspace/risk-register.tsx` | 风险登记册 |
| 17 | `src/components/workspace/wbs-editor.tsx` | WBS 编辑器 |
| 18 | `src/components/workspace/workspace-tab.tsx` | Workspace 主 Tab |
| 19 | `src/agents/tools/schemas/workspace-tools.ts` | PMO Agent 工具 Schema |
| 20 | `src/agents/tools/impl/workspace-tools.ts` | PMO Agent 工具实现 |

### 修改文件

| # | 文件 | 改动内容 |
|---|------|---------|
| 21 | `prisma/schema.prisma` | 新增 Budget / Risk / LearnedLesson 模型 |
| 22 | `src/agents/tools/index.ts` | 注册 workspace-tools |
| 23 | `src/stores/index.ts` | 导出 workspace-store |
| 24 | `src/app/page.tsx` | 侧边栏增加"工作台" Tab |
| 25 | `package.json` | 添加 `xlsx` 依赖 |

---

## 六、验收标准

### 功能验收

1. **进度仪表盘**：打开"工作台"→"进度"，看到项目整体进度环、任务状态分布、燃尽图、延迟警告
2. **成本管理**：可创建预算、添加费用明细、查看预算 vs 实际对比饼图、超支自动预警
3. **风险登记册**：可添加风险（标题/概率/影响/缓解措施）、热力图矩阵展示、状态流转
4. **WBS 编辑器**：从现有 Task 生成树状 WBS 视图，展开/折叠正常
5. **周报生成**：调用 Agent 工具或 API，自动生成周报（包含进度摘要+风险清单+下一步计划）
6. **xlsx 导出**：进度/成本/风险数据可导出为 xlsx，用 Excel 打开正常
7. **xlsx 导入**：通过 xlsx 模板导入风险/成本数据，数据正确写入数据库

### 数据迁移验收

8. `风险管理评估表.xlsx` 中的数据完整迁移到 Risk 表，UI 视图与原始文件对应
9. `进度同步.md` 中的进度数据导入后，在进度仪表盘中可查看到历史快照
10. `项目策划物料清单.xlsx` 中的预算数据导入 Budget 表，成本面板可查看

### 范式验收（ADD）

11. `logs/workspace/workspace.log` 中阶段标记对称
12. 每次 xlsx 导入导出都有最小单元审计（逐条记录处理结果）
13. 失败路径有等价审计（WORKSPACE_FAIL 包含结构化 extra）
14. TypeScript 编译通过
15. 审计数据回写各个模型的 metadata 字段

---

## 七、与 personnel-management-v1 的依赖关系

```
personnel-management-v1（先做）
  ├── 人员能力画像 ✓
  ├── 请求上下文 ✓
  ├── 智能派发 ✓
  └── Task API 修复 ✓
        ↓
workspace-pmo-v1（后做，依赖 Task 数据）
  ├── 进度仪表盘（依赖 Task.progress/status）
  ├── 成本管理（依赖 Budget 模型）
  ├── 风险登记册（依赖 Risk 模型）
  ├── WBS 编辑器（依赖 Task.parentId）
  ├── 周报生成（依赖进度+成本+风险）
  ├── xlsx 导出导入
  └── 数据迁移（从静态文件到数据库）
```

---

## 八、向农机平台移植策略

练手阶段需要做的关键决策，为移植铺路：

| 设计决策 | 团队协同中的验证方法 | 农机中的对应 |
|---------|-------------------|-------------|
| Budget 模型用 Json lineItems 而非独立表 | 验证 JSON 字段的查询和聚合性能 | 农资预算（种子/农药/油耗） |
| Risk 用概率×影响评分 | 验证评分公式是否合理 | 气象风险×作物损失 |
| WBS 用 Task.parentId 实现 | 验证树状查询性能 | 农事作业分解（地块→工序→动作） |
| xlsx 工具用 `xlsx` 包 | 验证中文字段/多 sheet/格式 | 农事报表（产量/成本/进度） |
| 周报用 LLM 生成 | 验证总结质量 | 农事周报（长势/病虫害/作业进度） |

**关键规范**：xlsx-utils.ts 中所有与业务无关的工具函数，必须抽取到纯工具层，农机项目只需复制这一个文件即可复用整套 Excel 能力。

---

## 九、风险与注意事项

1. **xlsx 包大小**：`xlsx` 包约 2MB，对前后端分离部署有影响。考虑在 server-side 使用，不引入前端 bundle
2. **WBS 编辑器的复杂度**：树状拖拽排序是 UI 难点，建议先用简单的缩进+按钮调整，不追求拖拽体验
3. **周报质量**：LLM 生成的周报质量依赖 prompt 设计，初期可能需要人工修正。建议设计为"AI 生成草案+人工编辑"模式
4. **数据迁移的幂等性**：从静态文件迁移数据时，同一个文件可能被多次导入。需要设计去重机制（基于文件 hash 或行号）
5. **不破坏现有 Task 模型**：进度仪表盘只读 Task，不修改 Task 的任何字段
6. **成本数据安全**：成本数据可能敏感，仅 ROOT 角色可查看和编辑
