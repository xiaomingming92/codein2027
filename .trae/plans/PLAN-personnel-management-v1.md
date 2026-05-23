# 人员管理与智能派发体系 v1

## PLAN 元信息

- **Plan 名称**: personnel-management-v1
- **启动时间**: 2026-05-14
- **主导 AI**: Cursor AI
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| `prisma/schema.prisma` | SCHEMA | SCHEMA_MODEL_EXTENDED | User 仅含 auth 字段 | User 扩展 status + PersonnelProfile 模型 | 待记录 |
| `src/lib/request-context.ts` | LIB | LIB_CREATED | 不存在 | 新建请求级上下文模块 | 待记录 |
| `src/types/personnel.ts` | TYPE | TYPE_CREATED | 不存在 | 新建 Personnel 类型定义 | 待记录 |
| `src/lib/personnel-dev-logger.ts` | LIB | LIB_CREATED | 不存在 | Layer 1 开发审计日志器（可插拔） | 待记录 |
| `src/lib/personnel-audit.ts` | LIB | LIB_CREATED | 不存在 | Layer 2 运行时业务审计工具 | 待记录 |
| `src/services/personnel-service.ts` | SERVICE | SERVICE_CREATED | 不存在 | 新建人员管理服务层 | 待记录 |
| `src/app/api/personnel/route.ts` | API_ROUTE | API_ENDPOINT_CREATED | 不存在 | 新建人员 CRUD API | 待记录 |
| `src/app/api/personnel/[id]/route.ts` | API_ROUTE | API_ENDPOINT_CREATED | 不存在 | 新建人员详情 API | 待记录 |
| `src/app/api/personnel/dispatch/route.ts` | API_ROUTE | API_ENDPOINT_CREATED | 不存在 | 新建智能派发 API | 待记录 |
| `src/stores/personnel-store.ts` | STORE | STORE_CREATED | 不存在 | 新建人员状态管理 | 待记录 |
| `src/components/personnel/personnel-panel.tsx` | COMPONENT | COMPONENT_CREATED | 不存在 | 新建人员管理面板 | 待记录 |
| `src/components/personnel/personnel-card.tsx` | COMPONENT | COMPONENT_CREATED | 不存在 | 新建人员能力卡片 | 待记录 |
| `src/components/personnel/personnel-form.tsx` | COMPONENT | COMPONENT_CREATED | 不存在 | 新建人员编辑表单 | 待记录 |
| `src/components/personnel/dispatch-dialog.tsx` | COMPONENT | COMPONENT_CREATED | 不存在 | 新建智能派发对话框 | 待记录 |
| `src/agents/tools/schemas/personnel-tools.ts` | TOOL | TOOL_CREATED | 不存在 | 新建人员 Agent 工具 Schema | 待记录 |
| `src/agents/tools/impl/personnel-tools.ts` | TOOL | TOOL_CREATED | 不存在 | 新建人员 Agent 工具实现 | 待记录 |
| `src/components/task/task-form.tsx` | COMPONENT | COMPONENT_MODIFIED | 无负责人选择器 | 增加能力匹配推荐负责人 | 待记录 |
| `src/app/api/task/route.ts` | API_ROUTE | API_ENDPOINT_MODIFIED | stub 实现 | 对接 Prisma 数据库 | 待记录 |
| `src/app/api/task/[id]/route.ts` | API_ROUTE | API_ENDPOINT_MODIFIED | stub 实现 | 对接 Prisma 数据库 | 待记录 |
| 以下为 getCurrentUserTool 同步修复 —————— | | | | |
| `src/agents/tools/impl/user-tools.ts` | TOOL | TOOL_MODIFIED | getCurrentUserTool 硬编码取第一个用户 | 从请求上下文读取真实用户 | 待记录 |
| `src/app/api/agent/chat/stream/route.ts` | API_ROUTE | API_ROUTE_MODIFIED | 无用户上下文设置 | 设置请求上下文后调用 Agent | 待记录 |
| 以下为 traceId 运行时排查体系 —————— | | | | |
| `prisma/schema.prisma` | SCHEMA | SCHEMA_FIELD_ADDED | AuditLog 无 traceId | AuditLog 新增 traceId + @@index | ✅ 已完成 |
| `src/app/api/agent/chat/stream/route.ts` | API_ROUTE | API_ROUTE_MODIFIED | 过滤点无审计日志 | 4 个过滤点 + STREAM_START/DONE 写入 AuditLog(traceId) | ✅ 已完成 |
| `src/agents/index.ts` | AGENT | AGENT_MODIFIED | wrapNodeWithAudit 不写 DB | NODE_START/END/ERROR 写入 AuditLog(traceId) | ✅ 已完成 |
| `.trae/scripts/mcp-server.ts` | MCP_TOOL | MCP_TOOL_MODIFIED | query_audit_logs 无 traceId 参数 | 新增 traceId 参数 + 调用链分析输出 | ✅ 已完成 |

---

## 一、核心设计思想：与农机派发"思维相似"

### 农机派发的思维模式

```
农机能力画像                   任务需求                    派发决策
━━━━━━━━━━━━━                ━━━━━━━━━                  ━━━━━━━━━
move + spray + harvest      喷药任务需要                能力匹配
  位置/电量/在线状态          move + spray               → 门控检查
  物理参数(幅宽/容量)          位置约束                     → 调度执行
```

### 人员派发的思维模式（与此对偶）

```
人员能力画像                   任务需求                    派发决策
━━━━━━━━━━━━━                ━━━━━━━━━                  ━━━━━━━━━
develop + design + test     开发任务需要                能力匹配
  判断力/可靠性/经验水平      develop + test              → 门控检查
  擅长领域/历史表现           复杂度/优先级约束              → 指派执行
```

**相同的是"能力匹配 → 门控 → 派发"的思维链路，不同的是人员的属性维度完全围绕人的特征设计。**

---

## 二、人员能力模型设计

### 2.1 能力维度（Ability）

不是照搬农机的 `move/spray/harvest`，而是围绕**团队协作场景**设计人类特有的能力维度：

| 能力类型 | 说明 | 示例值 |
|---------|------|--------|
| `skill` | 专业技能标签（可多项） | `["前端开发","后端开发","UI设计","测试","项目管理"]` |
| `experience_level` | 经验等级 | `JUNIOR \| MIDDLE \| SENIOR \| EXPERT` |
| `specializations` | 专长领域 | `["React","Node.js","数据库设计","农业知识"]` |
| `certifications` | 认证/资质 | `["PMP","高级工程师","安全资质"]` |

### 2.2 判断力维度（Judgment）

与农机的"决策质量"对偶，但设计为人的判断力特征：

| 判断力维度 | 说明 | 范围 |
|-----------|------|------|
| `reliability` | 任务完成可靠性（基于历史表现） | 0-1 |
| `risk_tolerance` | 风险容忍度（低=保守，高=激进） | 0-1 |
| `decision_quality` | 历史决策准确率 | 0-1 |
| `autonomy_level` | 自主决策能力等级 | `L1(需指导) \| L2(可独立) \| L3(可决策) \| L4(可授权)` |

### 2.3 可用状态

与农机的"在线/忙碌/故障"对偶：

| 状态 | 说明 |
|------|------|
| `AVAILABLE` | 空闲可派发 |
| `BUSY` | 正在执行任务 |
| `ON_LEAVE` | 休假/不在岗 |
| `UNAVAILABLE` | 不可用（其他原因） |

---

## 三、实施范围与阶段划分

### 阶段一：数据模型 + 审计基础设施（P0）

在 Prisma User 模型上扩展，或新建 Personnel 视图（复用 User 作为认证基座，Personnel 作为能力基座）。

**Prisma Schema 变更方案**（选择方案：扩展 User + 新增 PersonnelProfile）：

```prisma
// 在现有 User 模型上扩展（新增字段）
model User {
  // ... 现有字段不变 ...
  role       Role     @default(STAFF)
  department String?
  
  // 新增：人员扩展
  status     PersonnelStatus @default(AVAILABLE)
  
  profile    PersonnelProfile?  // 1:1 关联能力画像
  
  // ... 现有关联不变 ...
}

model PersonnelProfile {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // 能力维度
  skills          Json     // ["前端开发","后端开发","测试"]
  experienceLevel ExperienceLevel @default(MIDDLE)
  specializations Json?    // ["React","Node.js"]
  certifications  Json?    // ["PMP"]

  // 判断力维度
  reliability     Float    @default(0.5)  // 0-1
  riskTolerance   Float    @default(0.5)  // 0-1
  decisionQuality Float    @default(0.5)  // 0-1
  autonomyLevel   AutonomyLevel @default(L2)

  // 画像元数据
  metadata        Json?    // 审计回写字段

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum PersonnelStatus {
  AVAILABLE
  BUSY
  ON_LEAVE
  UNAVAILABLE
}

enum ExperienceLevel {
  JUNIOR
  MIDDLE
  SENIOR
  EXPERT
}

enum AutonomyLevel {
  L1  // 需指导
  L2  // 可独立
  L3  // 可决策
  L4  // 可授权
}
```

### 阶段二：请求上下文 + getCurrentUserTool 修复（P0）

**核心问题**：`getCurrentUserTool` 的 `GetCurrentUserSchema = z.object({})`（无参数），LangChain 工具无法直接访问 AgentState，导致工具无法感知当前登录用户。

**修复方案**：使用与 `llm/index.ts` 中 `runtimeConfigOverride` 相同的**模块级请求上下文**模式：

1. **新建 `src/lib/request-context.ts`** — 模块级变量存储当前请求的用户上下文（`setCurrentUser` / `getCurrentUser` / `clearCurrentUser`）
2. **修改 `stream/route.ts`** — 在调用 `streamAgent` 前设置上下文，完成后清除
3. **修改 `getCurrentUserTool`** — 从请求上下文读取真实用户，回退到 DB 查询（兼容无上下文场景）
4. **修复 `createTaskTool` 中 `createdById: "system"` 硬编码** — 改为从上下文读取当前用户 ID

```
请求链路：
  stream/route.ts
    → setCurrentUser(user)   ← 新增：写入请求上下文
    → streamAgent({ user })  ← 已有：user 传入 AgentState
    → LLM 调用 get_current_user tool
    → getCurrentUserTool 内部
        → getCurrentUser()   ← 新增：从上下文读取
        → 真实用户信息返回
    → clearCurrentUser()      ← 新增：清理上下文
```

### 阶段三：日志架构设计 —— 三层可插拔审计体系

**核心问题**：当前 ADD 范式把三个不同层次、不同消费者、不同生命周期的日志混为一谈（ADD-4 的"三通道输出"是平面约束）。经过本次人员管理功能的实践，需要建立清晰的分层架构：

```
                          消费者                         可插拔开关
                          ──────                        ─────────
Layer 1: 开发审计日志       AI助手 + 开发者                  NODE_ENV
  阶段标记对称性验证           写入 DB (metadata)             + ENABLE_FILE_LOG
  最小可观测单元               AI readRecentLogs() 读取      
  输出: console + file + DB   check_phase_symmetry 检查      
                             开发环境专用，生产环境可关        

Layer 2: 运行时业务审计       UI 组件 + 最终用户             始终开启
  操作记录: 谁在什么时候       AuditLog 历史查询              
   做了什么                   前端展示"上次修改时间"          
  输出: console + file + DB   
  (Prisma metadata / AuditLog 表)                          

Layer 3: 运行时调试日志       开发者                          LOG_LEVEL
  错误栈/耗时/参数             production 排错               
  输出: console               
```

#### 三个层次的区别

| 维度 | Layer 1 开发审计 | Layer 2 运行时业务审计 | Layer 3 调试日志 |
|------|-----------------|---------------------|----------------|
| **消费者** | AI 助手、开发者 | UI 组件、最终用户 | 开发者 |
| **输出通道** | console + file + **DB** | console + file + **DB** | console |
| **存储** | 文件系统 + DB metadata（临时） | 文件系统 + DB AuditLog（永久） | 无（stdout） |
| **生命周期** | 开发阶段，可清理 | 永久保留 | 运行时，依赖日志轮转 |
| **格式** | `═══ [PHASE] 开始 ═══`（AI 可解析）+ 结构化 extra | 结构化 JSON 业务指标（前端可渲染） | 自由文本 |
| **开关** | `NODE_ENV=development` + `ENABLE_FILE_LOG` | 始终开启 | `LOG_LEVEL` |
| **是否可插拔** | ✅ 生产环境可完全关闭 | ❌ 不能关（业务数据） | ✅ 按级别过滤 |
| **示例** | `auditPhaseStart("PERSONNEL_CREATE")` | `recordPersonnelAudit("CREATED", {userId, timestamp})` | `console.warn(...)` |

#### ADD-4 的语义澄清（非修正）

原 ADD-4 的"三通道输出"约束**保持不变**——每个审计点都必须同时输出 console + file + DB。新增的是**分层控制**：

```
ADD-4 约束不变: 每个审计点输出 console + file + DB（三通道）
新增分层控制:    Layer 1 整体可插拔（开发环境开、生产环境关）
                Layer 2 始终开启（不可插拔）
                Layer 3 标准调试日志（按 LOG_LEVEL）

关键差异: Layer 1 和 Layer 2 都走三通道，差异在：
          1. 写什么内容（开发阶段标记 vs 运行时业务指标）
          2. 给谁看（AI助手 vs 最终用户）
          3. DB 写到哪里（metadata 临时字段 vs AuditLog 持久表）
```

#### 对 personnel 日志器的设计

```
src/lib/personnel-dev-logger.ts    Layer 1: 开发审计
  ── 仅在 NODE_ENV=development 时生效
  ── auditPhaseStart / auditPhaseEnd / audit
  ── 输出: console + file + DB (写入 PersonnelProfile.metadata)
  ── 内容: ═══ [PERSONNEL_CREATE] 开始 ═══ + 结构化 extra

src/lib/personnel-audit.ts          Layer 2: 运行时业务审计
  ── 始终开启
  ── recordPersonnelAudit(action, detail)
  ── 输出: console + file + DB (写入 AuditLog 表)
  ── 内容: { action: "CREATED", userId, timestamp, profileId }

(调试日志直接用 console)            Layer 3: 调试日志
```

Layer 1 和 Layer 2 **都走三通道**，差异：
- **Layer 1 的 DB 写入**是在 `PersonnelProfile.metadata.lastDevAudit`（临时字段，可覆盖）
- **Layer 2 的 DB 写入**是在 `AuditLog` 表（永久记录，不可覆盖）
- **Layer 1 可整体关闭**（`NODE_ENV=production` 时不执行任何代码）
- **Layer 2 不可关闭**（业务数据必须记录）

### 阶段四：核心业务实现

1. **Layer 1 开发审计日志器** (`src/lib/personnel-dev-logger.ts`)
2. **Layer 2 运行时审计工具** (`src/lib/personnel-audit.ts`)
3. **人员管理服务层** (`src/services/personnel-service.ts`)——调用 Layer 2 写 DB
4. **人员 CRUD API** (`/api/personnel`)——调用 Layer 1 写阶段标记
5. **人员能力画像赋值**（创建/编辑能力画像）

### 阶段五：前端 UI

1. **人员管理面板** (`PersonnelPanel`)
2. **人员能力卡片** (`PersonnelCard`)——展示能力画像+判断力指标
3. **人员编辑表单** (`PersonnelForm`)——含能力/判断力字段
4. **集成到主导航**——在侧边栏增加"人员" Tab

### 阶段五：智能派发

1. **派发服务** (`dispatch-service.ts`)——能力匹配 + 门控检查 + 推荐排序
2. **智能派发 API** (`POST /api/personnel/dispatch`)
3. **派发对话框** (`DispatchDialog`)——展示匹配结果+推荐人选
4. **Agent 派发 Tool** (`dispatch_personnel_tool`)
5. **改造 task-form**——增加"智能推荐负责人"按钮

### 阶段六：任务 API 修复（接真数据库）

当前 task API 路由是 stub 实现，需要对接 Prisma 数据库。

---

## 四、按 ADD 范式的实施步骤

### Step 0：审计阶段定义

```typescript
type PersonnelPhase =
  | "PERSONNEL_START"           // 人员管理流程开始
  | "PERSONNEL_CREATE"          // 创建人员
  | "PERSONNEL_PROFILE_UPDATE"  // 更新能力画像
  | "PERSONNEL_STATUS_CHANGE"   // 变更状态
  | "PERSONNEL_DISPATCH"        // 智能派发
  | "DISPATCH_ABILITY_MATCH"    // 能力匹配阶段
  | "DISPATCH_GATE_CHECK"       // 门控检查阶段
  | "DISPATCH_RECOMMEND"        // 推荐排序阶段
  | "PERSONNEL_QUERY"           // 查询人员
  | "PERSONNEL_DONE"            // 完成
  | "PERSONNEL_FAIL"            // 失败
```

### Step 1：审计基础设施

使用 MCP 工具 `generate_audit_logger` 生成 `src/lib/personnel-logger.ts`。

### Step 2-6：逐步实现、验证、收敛

每完成一个阶段就运行审计日志验证，确保 ADD-1~6 合规。

---

## 五、文件变更清单（详细）

### 新建文件

| # | 文件 | 说明 |
|---|------|------|
| 1 | `src/types/personnel.ts` | Personnel 类型定义（Ability/Judgment/PersonnelStatus 等接口） |
| 2 | `src/lib/request-context.ts` | 请求级上下文模块（setCurrentUser/getCurrentUser/clearCurrentUser） |
| 3 | `src/lib/personnel-dev-logger.ts` | Layer 1 开发审计日志器（NODE_ENV=development 可插拔） |
| 4 | `src/lib/personnel-audit.ts` | Layer 2 运行时业务审计工具（始终开启，写 DB） |
| 5 | `src/services/personnel-service.ts` | 人员管理服务（CRUD + 能力画像 + 派发） |
| 6 | `src/app/api/personnel/route.ts` | `GET /api/personnel`（列表+筛选）+ `POST /api/personnel`（创建） |
| 7 | `src/app/api/personnel/[id]/route.ts` | `GET/PUT/DELETE /api/personnel/[id]` |
| 8 | `src/app/api/personnel/dispatch/route.ts` | `POST /api/personnel/dispatch`（智能派发） |
| 9 | `src/stores/personnel-store.ts` | Zustand 状态管理（人员列表+选中+筛选） |
| 10 | `src/components/personnel/personnel-panel.tsx` | 人员管理主面板 |
| 11 | `src/components/personnel/personnel-card.tsx` | 人员能力卡片组件 |
| 12 | `src/components/personnel/personnel-form.tsx` | 人员创建/编辑表单 |
| 13 | `src/components/personnel/dispatch-dialog.tsx` | 智能派发推荐对话框 |
| 14 | `src/agents/tools/schemas/personnel-tools.ts` | 人员管理 Agent 工具的 Zod Schema |
| 15 | `src/agents/tools/impl/personnel-tools.ts` | 人员管理 Agent 工具实现 |

### 修改文件

| # | 文件 | 改动内容 |
|---|------|---------|
| 16 | `prisma/schema.prisma` | User 扩展 `status`；新增 `PersonnelProfile` 模型及其枚举 |
| 17 | `src/agents/tools/impl/user-tools.ts` | getCurrentUserTool 从硬编码取第一个用户改为从请求上下文读取 |
| 18 | `src/app/api/agent/chat/stream/route.ts` | 调用 streamAgent 前设置请求上下文，完成后清除 |
| 19 | `src/agents/tools/index.ts` | 注册 personnel-tools |
| 20 | `src/stores/index.ts` | 导出 personnel-store |
| 21 | `src/app/page.tsx` | 侧边栏增加"人员" Tab |
| 22 | `src/components/task/task-form.tsx` | 增加"智能推荐负责人"按钮 + 负责人选择器 |
| 23 | `src/app/api/task/route.ts` | 从 stub 改为对接 Prisma 数据库 |
| 24 | `src/app/api/task/[id]/route.ts` | 从 stub 改为对接 Prisma 数据库 |

---

## 六、验收标准

### 功能验收

1. 人员列表：可查看所有人员及其能力画像
2. 人员创建：可设置姓名/部门/技能/经验等级/判断力指标
3. 人员能力画像：skills/specializations/reliability/autonomyLevel 完整可编辑
4. 人员状态管理：AVAILABLE/BUSY/ON_LEAVE 可切换
5. 智能派发：输入任务需求，系统推荐匹配人员（按能力匹配度 + 判断力评分排序）
6. 派发结果：直接创建任务并指派给推荐人员
7. 任务表单：从原来的无负责人选择器，升级为"智能推荐 + 手动选择"双模式
8. 任务 API：从 stub 改接真实数据库，数据持久化
9. **getCurrentUserTool：Agent 调用 `get_current_user` 工具时，返回当前登录用户而非数据库第一个用户**
10. **createTaskTool：Agent 调用 `create_task` 工具时，`createdById` 使用当前登录用户 ID 而非 `"system"`**

### 范式验收（ADD）

9. `logs/personnel/personnel.log` 中阶段标记对称（每个 Start 有对应 End）
10. 每条 CRUD 操作都有审计记录（最小可观测单元）
11. 派发过程中 DIPATCH_ABILITY_MATCH/GATE_CHECK/RECOMMEND 三阶段都有审计
12. 失败路径有等价审计（PERSONNEL_FAIL 包含结构化 extra）
13. TypeScript 编译通过（`npx tsc --noEmit`）
14. 审计数据回写 PersonnelProfile.metadata 字段

---

## 七、风险与注意事项

1. **不要破坏现有 User 模型**：User 已经被 auth、task、audit 等多个模块引用，必须确保向后兼容。PersonnelProfile 用 1:1 关联而非直接扩展 User 字段，避免破坏现有代码
2. **请求上下文的安全性**：`request-context.ts` 使用模块级变量，在 Node.js 单线程模型下每个请求顺序执行是安全的。但如果将来切换为多 worker 或 edge runtime，需考虑 `AsyncLocalStorage` 方案
3. **getCurrentUserTool 回退策略**：当请求上下文无用户时（如在测试环境或非 HTTP 调用路径），工具应回退到 DB 查询第一个用户，保持向后兼容
4. **createTaskTool 的 `createdById: "system"` 修复**：与 getCurrentUserTool 联动，改为从上下文读取当前用户 ID。同样需要回退策略
5. **现有 task API 的路由路径是 `/api/task` 而非 `/api/tasks`**：注意与现有系统一致，不要引入不一致的命名风格
6. **Prisma 迁移**：Schema 变更后需运行 `npx prisma db push`（开发环境），不需要生成新的 migration 文件
7. **权限问题**：人员管理（创建/编辑人员的能力画像）应该仅 ROOT 角色可操作，STAFF 角色只读
8. **stream/route.ts 的请求上下文生命周期**：`setCurrentUser` 必须在 `streamAgent` 调用前设置，`clearCurrentUser` 必须在 Agent 返回后清理（含异常路径），防止内存泄漏
