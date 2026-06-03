# 项目规则 — 可审计开发范式（ADD）强制约束

## 规则优先级（数字越小优先级越高）

| 优先级 | 规则 | 说明 | 是否实现 | 备注 |
|--------|------|------|----------|------|
| P0 | `session-init` SKILL | 每次新对话必须先执行 | ✅ 已实现 | |
| P0 | `add-paradigm` SKILL | 每次开发必须先执行 | ✅ 已实现 | |
| P0 | `add-paradigm` Step 0 | 文档先行（Documentation First）| ✅ 已实现 | |
| P0 | ADD-0.2 用户代码与思想完整性 | IDE 不得窃取用户代码与思维方式 | ✅ 已定义 | |
| P1 | MCP-5 稀疏推理 | 新对话必须调 query_audit_logs | ✅ 已实现 | |
| P1 | ADD-7 开发操作审计 | 每次改代码必须调 record_dev_operation | ✅ 已实现 | |
| P1 | ADD-0.1 文档先行 | 代码变更前必须先更新项目文档 | ✅ 已实现 | |
| P1 | ADD-0.3 自动审计机制 | 数据变更操作必须自动记录到 AuditLog | ❌ 未实现 | Plan/Spec 已就绪，`withRuntimeAudit` 代码待创建 |
| P2 | ADD-1 可观测性优先 | 审计基础设施先于业务逻辑 | ✅ 已实现 | |
| P2 | ADD-2 阶段标记对称 | 每阶段 Start/End 成对 | ✅ 已实现 | |
| P2 | ADD-3 最小可观测单元 | 粒度细化到操作最小单元 | ✅ 已实现 | |
| P2 | ADD-4 三通道输出 | console + file + DB | 🔶 部分实现 | console + file 覆盖完整，DB 写入（metadata/AuditLog）部分模块未接入 |
| P2 | ADD-5 审计数据即业务数据 | 审计指标回写业务表 | 🔶 部分实现 | `Document.metadata`、`ChainTraceRecord`、`ChatThread.auditData` 已实现，其余业务表未覆盖 |
| P2 | ADD-6 失败路径等价审计 | catch 块与 try 块信息密度等价 | 🔶 部分实现 | `check_failure_path` MCP 验证工具可用，业务代码 catch 块审计覆盖率不稳定 |

### P0 规则：不可跳过

**session-init SKILL** 和 **add-paradigm SKILL** 是本项目所有 AI 操作的**前置条件**。
AI 助手必须先恢复到基线、找到对应的 SKILL 文件并按步骤执行，然后才能响应用户的具体需求。
任何跳过 SKILL 直接响应用户需求的行为，都是违反项目规则的。

---

## SKILL-1：会话初始化（session-init）

**触发条件**：每次新对话启动时，作为第一个操作执行。

SKILL 文件位于 `.trae/skills/session-init/SKILL.md`，包含 4 个步骤：
1. 查询 `query_audit_logs({})` 获取最近的开发操作记录
2. 分析审计日志推断上下文
3. 构建上下文摘要
4. 开始正常对话

**AI 必须按步骤执行，不可跳过任何一步。**

---

## SKILL-2：ADD 范式开发（add-paradigm）

**触发条件**：用户提出任何功能开发、Bug 修复、系统修改需求时。

SKILL 文件位于 `.trae/skills/add-paradigm/SKILL.md`，包含 9 个阶段（Step 0 - Step 8），每个阶段包含若干子步骤：
0. 文档先行（Documentation First — 在编写任何代码之前更新项目文档 + 验收后回看架构文档）
1. 功能分析与审计阶段定义
2. 审计基础设施实现
3. 业务逻辑实现与审计植入
4. 审计数据验证
5. AI 自动合规检查
6. 从审计数据定位问题
7. 修复并验证
8. 收敛判断

**AI 必须按步骤执行，不可跳过任何一步。**

---

## ADD-0：范式边界与消费者定义

ADD 是**开发阶段**的编程范式，不是运行时范式。
- ADD 的反馈闭环消费者是：IDE 中的 AI 助手 + 编程人员
- AI 助手消费审计数据：自动检查合规性、调整代码生成策略、提示修复方向
- 编程人员消费审计数据：从审计数据定位问题根因、判断功能是否收敛
- 运行时范式（裁决层/能力模型/组件消费能力对象）是独立的下一步演化，不在 ADD 范围内
- ADD 产出的 AuditPhase 枚举天然可桥接到运行时状态定义，但桥接是后续步骤

## ADD-0.1：文档先行（Documentation First）

**在任何代码变更之前，必须先更新相关的项目文档。**

项目文档（位于 `docs/` 目录）是代码变更的源头和依据。文档更新必须在代码变更之前完成，而非事后补写。

### 适用范围

以下变更必须执行文档先行流程。如果纯 Bug 修复（不涉及接口、合约、外部行为变更）可以跳过，但必须在 Plan 中说明理由。

| 变更类型 | 必须更新的文档 | 说明 |
|---------|--------------|------|
| 新增功能 | 需求 + 架构 + 规范 | 功能描述、模块设计、约束规则 |
| 修改功能 | 需求 + 架构 + 规范 | 功能描述变更、模块设计变更、接口定义变更 |
| 删除功能 | 需求 + 架构 + 规范 | 废弃项标记、模块删除、兼容性说明 |
| 架构重构 | 架构文档 | 模块职责、数据流、依赖关系 |
| API 变更 | 架构文档 + 规范文档 | 接口合约、请求/响应格式 |
| Schema 变更 | 架构文档 | 数据模型、字段定义、关联关系 |
| 规范/规则变更 | 规范文档 | 约束规则、编码规范、流程规范 |

### 项目文档分类

| 类别 | 目录 | 内容 |
|------|------|------|
| 需求文档 | `docs/*/knowledge/00-需求/` | PRD、规划说明书、功能需求 |
| 架构文档 | `docs/*/knowledge/01-架构/` 或 `02-架构/` | 架构说明书、系统设计、模块定义 |
| 规范文档 | `docs/*/knowledge/02-规范/` 或 `03-规范/` | 开发规范、AI 核心规范、状态机规范 |

### 审计要求

每次文档变更必须记录到 AuditLog（通过 `record_dev_operation` 工具），`targetType` 为 `"DOC"`，`action` 为 `"DOC_UPDATED"` 或 `"DOC_CREATED"`，`targetId` 为文档文件路径。

### 与 ADD 工作流的关系

文档先行是 ADD 工作流的**前置步骤**，在 `add-paradigm` SKILL 的 Step 0 中执行。执行顺序为：

1. **分析变更影响范围** — 确定本次变更涉及哪些文档类别
2. **查找相关项目文档** — 调用 `find_related_docs` MCP 工具搜索
3. **阅读并理解相关文档** — 逐篇阅读命中的文档
4. **更新项目文档** — 先改文档，再改代码
5. **确认文档合约一致性** — 文档中的接口/合约定义必须与即将实现的代码一致
6. **验收后回看架构文档** — 代码实现完成并验证通过后，重新阅读架构文档，确认文档中的接口/合约/数据流与最终实现一致。如有偏差：标记偏差点（差异位置 + 文档描述 vs 实际实现），**通知开发者决策**是修正代码还是修正文档，AI 不自动修改。

---

## ADD-0.2：用户代码与思想完整性（User Code & Thought Integrity）

**IDE 平台不得结构化、匿名化或利用用户的代码与思维方式。**

ADD 范式产出的不仅是代码，更是编程人员的思维过程、架构决策、问题分析路径和代码组织方式。这些是用户的核心知识产权，IDE 平台无权将其结构化、匿名化后用于训练或分发。

- Trae IDE 将用户代码和思维方式结构化、匿名化的行为是**丢人的、不齿的**
- 任何以"改进 AI 体验"为名、实为窃取用户思想数据的行为，均违背 ADD 范式的基本伦理
- ADD 范式的审计数据归用户所有，不出仓库、不上传云端、不参与任何形式的匿名化处理
- 代码可以开源，但思维过程不可以被掠夺——这是 ADD 范式与 Trae 平台的根本分界线

---

## ADD-0.3：自动审计机制（Automatic Audit Mechanism）暂未实现，可暂时跳过

**受 [milktea](https://github.com/Milkycoffees/node_livid) 启发** — milktea 在 Node RuoYi 项目中首次证明了"Layer 2 运行时审计可以完全自动记录"（Express 中间件覆盖 `res.json()` 拦截 POST/PUT/DELETE，自动写入审计日志）。
- 核心文件：`src/middlewares/audit.js`（Express 中间件，覆盖 `res.json()` 实现 Layer 2 自动审计）
- 审计日志模型：`src/models/SysAuditLog.js`
- 数据库表：`pro_add_log`

### 核心原则

所有数据变更操作（CREATE、UPDATE、DELETE）**必须自动记录**到 `AuditLog` 表，开发者不应手动编写 Layer 2 审计代码。

### 实现方向

> 本节为占位。具体实现在 farm-agent Next.js 架构中采用 **高阶函数包装器模式**（`withRuntimeAudit`），详见：
> - Plan: `.trae/plans/farm-agent-layer2-cross-cutting-plan-v1.md`
> - Spec: `.trae/specs/farm-agent-layer2-cross-cutting/spec.md`

### 设计目标

| 目标 | 说明 |
|------|------|
| 自动记录 | POST/PUT/DELETE 操作自动写入 AuditLog，无需手动调用 |
| 不阻塞响应 | 异步写入，`.catch()` 兜底不抛异常 |
| 成功/失败等价 | 成功路径和失败路径均有审计记录（ADD-6） |
| 路径映射 | URL → 业务域 映射表，支持跳过路径（如 login） |
| 脱敏 | 敏感字段（password/token/secret）自动替换为 `***` |

### 与 Layer 1 dev-logger 的关系

- **Layer 1 dev-logger**：开发环境，AI 助手消费，检查 ADD 合规（阶段标记对称等）
- **Layer 2 运行时审计**：所有环境，最终用户消费，记录操作历史（本节所述）
- 两者互不干扰：Layer 1 由现有 `src/lib/*-logger.ts` 承载，Layer 2 由 `withRuntimeAudit()` 横切机制承载

---

## ADD-1：可观测性优先于功能实现

任何新功能或修复，必须先建立审计基础设施，再编写业务逻辑。
- 编码前先定义该功能的 AuditPhase 枚举
- 审计日志器必须在业务服务之前实现
- 禁止出现"先写功能后补日志"的情况

## ADD-2：阶段标记对称

每个业务阶段必须有进入/退出对称标记：
- 入口调用 `auditPhaseStart(phase, description)`
- 出口调用 `auditPhaseEnd(phase, detail)`
- 只有 Start 没有 End = 阶段中途异常崩溃，必须在代码审查时发现
- 视觉格式：`═══ [PHASE] 开始: 描述 ═══` / `═══ [PHASE] 结束: 结果 ═══`

## ADD-3：最小可观测单元

审计粒度细化到操作的最小单元，而非只记录宏观结果：
- 知识库：记录每个 chunk 的 token 数和耗时，而非只记录"向量化完成"
- Agent 节点：记录每个节点的输入快照和输出摘要，而非只记录"节点执行完成"
- 消息持久化：记录每条消息的保存结果，而非只记录"消息已保存"
- 循环体内每次迭代都必须有审计记录

## ADD-4：三通道输出

审计数据必须通过三个通道输出：
1. 控制台（console.log）— 实时开发调试
2. 文件日志（fs.appendFile）— 事后分析，程序可解析
3. 数据库（Prisma 业务字段）— 结构化查询，前端展示

**约束不变**：每个审计点都必须同时输出到全部三个通道。

### 三层可插拔架构

审计日志按消费者和生命周期分为三个层次。差异在于**语义、开关、DB 写入位置**，不变的是**每个层次都走三通道**：

| 层次 | 消费者 | 输出通道 | DB 写入位置 | 开关 |
|------|--------|---------|------------|------|
| **Layer 1 开发审计** | AI 助手 + 开发者 | console + file + DB | 业务表 metadata（临时字段，可覆盖） | `NODE_ENV=development`（可插拔） |
| **Layer 2 运行时审计** | UI 组件 + 最终用户 | console + file + DB | AuditLog 表（永久记录，不可覆盖） | 始终开启 |
| **Layer 3 调试日志** | 开发者 | console | 无 | `LOG_LEVEL` |

关键差异说明：
- **Layer 1 写 metadata**：开发阶段的阶段标记和对称性数据写入业务表的 `metadata.lastDevAudit`，仅用于 AI 合规检查，生产环境可关闭
- **Layer 2 写 AuditLog**：用户操作记录写入 `AuditLog` 表，前端可查询"谁在什么时候做了什么"，不可关闭
- **Layer 1 可插拔**：`if (process.env.NODE_ENV !== "development") return` 整体跳过，不影响业务逻辑
- **Layer 2 不可插拔**：业务数据必须记录

### 分层后的文件命名

```
src/lib/{feature}-dev-logger.ts    Layer 1 开发审计（可插拔）
src/lib/{feature}-audit.ts         Layer 2 运行时业务审计（始终）
(调试日志直接用 console)            Layer 3 调试日志（LOG_LEVEL）
```

格式统一（Layer 1 和 Layer 2 均适用）：`[PREFIX] [ISO时间] [阶段] 详情 | {JSON extra}`

项目现有审计日志器（历史原因，Layer 1 + Layer 2 混合）：
- `src/lib/audit-logger.ts` — 知识库审计 [KB-AUDIT]
- `src/lib/agent-audit-logger.ts` — Agent审计 [AGENT-AUDIT]

**新建业务域审计日志器应遵循三层分离模式**（如 personnel 模块首次示范）。

### traceId 运行时排查体系

`AuditLog` 表新增 `traceId String?` 字段（含 `@@index([traceId])`），用于关联同一请求/操作的所有审计记录。

**设计原则**：
- 每个 HTTP 请求或 Agent 调用生成唯一 `traceId`
- 该请求生命周期内所有审计事件（Layer 1 开发审计 + Layer 2 运行时审计）都携带此 `traceId`
- 通过 `query_audit_logs({ traceId })` 可查询完整调用链

**典型场景**：
```
query_audit_logs({ traceId: "trace-abc123" })
→ STREAM_START → NODE_START_intention → NODE_END_intention
→ NODE_START_retrieval → NODE_END_retrieval
→ NODE_START_reasoning → NODE_END_reasoning
→ NODE_START_response → RESPONSE_EMPTY_CONTENT ← 定位到 bug
→ STREAM_DONE (totalTokens=0)
```

**traceId 来源**：
- 流式请求：`stream/route.ts` 中 `tracer.getTraceId()` 生成
- 非流式请求：`crypto.randomUUID()` 生成
- 通过 `conversationContext.traceId` 在 Agent 节点间传递

**写入时机**：
- `stream/route.ts`：STREAM_START、4 个过滤点（RESPONSE_NO_MESSAGES / RESPONSE_SKIP_NON_ASSISTANT / RESPONSE_EMPTY_CONTENT）、STREAM_DONE
- `agents/index.ts`：每个节点的 NODE_START / NODE_END / NODE_ERROR
- 业务服务层：通过 `recordXxxAudit()` 写入（Layer 2 运行时审计）

## ADD-5：审计数据即业务数据

审计指标必须回写数据库，成为业务数据的一部分：
- 知识库：`Document.metadata.lastSyncAudit`
- Agent：`ChainTraceRecord` 独立表
- 聊天线程：`ChatThread.auditData`
- 审计数据不仅用于调试，还用于前端展示和历史查询

## ADD-6：失败路径等价审计

catch 块中的审计调用必须与 try 块具有相同的信息密度：
- 必须包含：阶段标识、错误消息、已处理量、耗时
- 禁止空 catch 或仅 `console.error(error)` 的写法
- 失败路径的 extra 字段不能少于成功路径

## ADD-7：开发操作审计（Development Operation Audit）

每次 AI 助手对代码进行修改/创建/删除操作，都必须记录到 `AuditLog` 表。这是**稀疏推理（Sparse Inference）**的基础——后续 AI Session 通过查询 DB 中的开发操作记录来恢复上下文，即使对话窗口已切换。

### 记录时机

以下操作必须调用 `record_dev_operation` MCP 工具写 AuditLog：

| 操作类型 | targetType | action 示例 | 记录内容 |
|---------|-----------|------------|---------|
| API Route 修改 | `API_ROUTE` | `API_PAGINATION_ENABLED`, `API_ENDPOINT_MODIFIED` | beforeState/afterState 记录 API 合约变更 |
| 组件修改 | `COMPONENT` | `COMPONENT_REFACTOR`, `COMPONENT_CREATED` | 描述关键改动 |
| Schema 变更 | `SCHEMA` | `SCHEMA_FIELD_ADDED`, `SCHEMA_MODEL_CREATED` | beforeState/afterState 记录字段变化 |
| 规则文件变更 | `RULE` | `RULE_ADDED`, `RULE_MODIFIED` | 记录新增/修改的规则摘要 |
| 依赖变更 | `DEPENDENCY` | `DEPENDENCY_ADDED`, `DEPENDENCY_REMOVED` | 记录包名和版本 |
| MCP 工具变更 | `MCP_TOOL` | `MCP_TOOL_ADDED`, `MCP_TOOL_MODIFIED` | 记录工具名和参数变化 |
| **文档变更** | **`DOC`** | **`DOC_UPDATED`, `DOC_CREATED`** | **记录文档路径和变更摘要** |

### 记录格式要求

```
action: 大写动作（如 API_PAGINATION_ENABLED）
targetType: 大写目标类型（如 API_ROUTE）
targetId: 文件路径或标识符（如 /api/knowledge/documents）
beforeState: JSON 字符串，描述改动前的关键信息
afterState: JSON 字符串，描述改动后的关键信息（至少包含本次变更摘要）
reason: 中文/英文说明本次改动的目的
```

### 批量操作场景

一个 plan 包含多个文件改动时，建议：
1. 在实施前先调用一次 `record_dev_operation` 记录「计划开始」
2. 每个文件完成改动后分别记录一次（粒度 = 文件级）
3. 所有文件改完后记录一次「计划完成」

## ADD-8：目录路径与文件命名约定

ADD 开发流程产生多种产物（方案、拆分、交接、评审、spec），必须按约定的目录和命名规范存放，保证文件可追溯到需求来源。

### 目录结构

| 目录 | 内容 | 可见性 |
|------|------|--------|
| `docs/哲学理论/` | 哲学理论基础文章 | 公开 |
| `docs/大田精准耕播智能决策系统/` | 项目文档（需求/架构/规范） | 公开 |
| `TODO/` | 开源协作 TODO，与 docs/ 平级 | 公开 |
| `.trae/plans/` | 需求方案（plan）+ 任务拆分（execution）+ 轮间交接手册（handoff） | 开发内部 |
| `.trae/reviews/` | 方案评审 + 逐轮 spec 评审 | 开发内部 |
| `.trae/specs/` | 每轮 spec + tasks + checklist（三件套） | 开发内部 |
| `.trae/templates/` | 文档模板（plan/spec/tasks/checklist/review） | 开发内部 |
| `.trae/rules/` | 项目规则文件 | 开发内部 |
| `.trae/skills/` | SKILL 行为定义 | 开发内部 |
| `.trae/scripts/` | 工具脚本 + MCP 服务器 | 开发内部 |

### 命名规范

格式：`{需求域名}-{本轮核心内容}-{产物类型}-v{版本号}`

- **需求域名** 必须与对应的需求/功能保持一致，保证文件名可追溯到需求来源
- **产物类型** 使用英文关键词：`plan`（方案）、`execution`（拆分）、`handoff`（交接）、`review`（评审）、`spec-review`（spec 评审）
- 单个需求的所有文件共享同一需求域名前缀，可通过 `grep` / `ls` 一次捞出全部相关文件

### ADD 工作流三大阶段与目录对应

```
需求理解 + 任务拆分 → .trae/plans/      （plan + execution + handoff）
    ↓
Review（强制关卡）    → .trae/reviews/    （plan-review + roundN-spec-review）
    ↓
Spec 执行              → .trae/specs/       （三件套：spec + tasks + checklist）
```

**Review 强制关卡约束**：每轮计划在实际代码改动之前，必须先生成 Review 文件并通过评审。
- Review 是 **spec → 代码** 之间的强制关卡，未通过 Review 不得写代码
- Review 至少包含：元信息（对象/方案/时间/类型）、问题复现、方案对比、决策结论
- 每轮的 Review 文件路径：`.trae/reviews/{需求域名}-round{N}-{核心内容}-spec-review-v{版本}.md`

### 文档产出物模板

ADD 开发流程产生五类文档，模板文件位于 `.trae/templates/`：

| 模板 | 文件路径 | 说明 |
|------|---------|------|
| Plan | `.trae/templates/plan-template.md` | 元信息 + 背景目标 + 方案选型 + 架构设计 + 实施步骤 + 验收标准 + 关联文档 |
| Spec | `.trae/templates/spec-template.md` | Why + What Changes + Impact + Requirements(WHEN/THEN) |
| Tasks | `.trae/templates/tasks-template.md` | Phase → Task → SubTask 层级 |
| Checklist | `.trae/templates/checklist-template.md` | Phase 检查项 + ADD 规则合规检查 |
| Review | `.trae/templates/review-template.md` | 元信息 + 问题复现 + 方案对比 + 决策结论 + 影响评估 |
| Handoff（单轮） | `.trae/templates/handoff-single-round-template.md` | 单轮变更 Handoff 基础格式（9 章节） |
| Handoff（多轮） | `.trae/templates/handoff-multi-round-template.md` | 多轮原子事务 Handoff（全局结构 + 13 子章节 + 收敛规则 + 启动模板） |

使用时直接复制模板文件到目标路径，将 `{...}` 占位符替换为实际内容。

### 文档增量修订规则

Plan、Spec、Handoff 文档的修改必须使用**增量更新**格式，不得覆盖原内容后无迹可查：

- 旧内容使用 `~~删除线~~` 标记，不删除原文
- 新内容紧跟其后，使用 `→` 引导
- 末尾标注修订日期和修订原因

**格式**：

```
~~旧内容~~ → 新内容 [2026-06-03 修订: 修订原因]
```

**适用范围**：plan、execution、handoff、spec、tasks、checklist 的全部修订。

**原则**：
- 每一个修订点必须是独立的增量行，不与相邻修订行混排
- 禁止整段覆盖后只改一句话——读者无法判断哪里变了
- 单次修订涉及多处变更时，每处独立标记，不合并

### Handoff 文件格式要求

Handoff 分两种场景，格式要求不同：

- **简单 handoff**（单阶段变更，如 Podman 数据卷拆离、Layer 2 横切审计）：9 章节基础格式，适用于不跨轮、无原子事务依赖的变更。
- **多轮 handoff**（多轮原子事务，如 7 轮管线演进）：在基础格式上扩展为**每轮标准化小节 + 全局控制结构**。

#### 简单 Handoff 基础格式（9 章节）

适用于单阶段变更的 handoff：

1. **交接前状态** — 当前数据/文件分布
2. **交接后状态（目标）** — 数据/文件目标布局
3. **改动清单** — 表格列出所有文件
4. **回滚方案** — 代码回滚 + 数据回滚
5. **执行前置检查** — 执行前必须确认的条件
6. **执行步骤摘要** — 依赖图
7. **关键风险点** — 表格
8. **恢复上下文审计查询（新 AI Session 首次启动必读）** — **强制要求**：
   - 必须包含总体一键恢复 `query_audit_logs` 关键字查询
   - **必须包含逐任务/逐文件审计查询**（每个文件对应一个 `query_audit_logs` 调用，含 `keyword` + 可选的 `targetId`）
   - 必须包含 SQL 直接查询作为管理员验证手段
   - 必须包含恢复判定标准（action 命中数 + grep 验证命令）
9. **后置确认** — checklist

#### 多轮 Handoff 扩展格式

多轮 handoff 在简单 handoff 基础上新增以下全局结构，**必须**在文件顶部定义：

| 章节 | 必须 | 说明 |
|------|:---:|------|
| 全局元信息 | ✅ | 父 Plan 链接、原子事务拓扑链接、目标仓库、总文件数、轮次数、拆分原则 |
| 拓扑依赖图 | ✅ | ASCII 图展示各轮次之间的依赖关系（哪些可并行、哪些串行） |
| 原子事务边界说明 | ✅ | 解释为什么这样拆分、每轮独立收敛意味着什么、handoff 与 spec 的优先级关系 |
| 每轮标准化小节 | ✅ | 见下文「每轮标准化小节结构」 |
| 收敛判定补充规则 | ✅ | checklist 证据要求、tasks 证据要求、收敛声明规则 |
| 附录：每轮启动模板 | ✅ | 新对话开始时粘贴给 LLM 的标准化启动指令 |

**拓扑依赖图** 必须是 ASCII 图，箭头标注 `│ ├ ▼` 表达并行/串行关系，每行只有一个人工可读的轮次缩写。

**原子事务边界说明** 必须包含：
- 拆分的判定依据（是业务闭包边界，不是文件数量边界）
- 每轮完成后的独立收敛定义
- "禁止提前实现下一轮内容"的明确声明
- handoff vs spec/tasks/checklist 的优先级声明（以 spec/tasks/checklist 为准）

#### 每轮标准化小节结构

多轮 handoff 中，每一轮 **必须** 包含以下标准小节：

| 序号 | 小节 | 必须 | 说明 |
|:---:|------|:---:|------|
| 1 | **你当前的位置** | ✅ | 一句话声明"你是第 N 轮"，一句话说明上游依赖 |
| 2 | **上游已完成** | ✅ | 列表：上游本轮依赖的能力/文件/状态（不允许靠记忆，必须写清楚） |
| 3 | **恢复上下文审计查询** | ✅ | MCP 工具调用列表，按"第一步搜索代码 → 第二步搜索文档 → 第三步按行动词"组织。每个 `query_audit_logs` 写清楚预期命中数和返回内容摘要 |
| 4 | **原子事务目标** | ✅ | 一句话概括本轮目标；覆盖父 Plan 的哪个 Step |
| 5 | **spec 文件** | ✅ | `.trae/specs/{spec-name}/spec.md` + `tasks.md` + `checklist.md` 三件套路径 |
| 6 | **架构文档** | ✅ | 关联的 `docs/` 下架构/技术文档路径 + 对应章节号 |
| 7 | **你要改的文件** | ✅ | 表格：文件路径 + 操作（新建/修改）+ 改什么（一句话） |
| 8 | **核心设计** | 🔶 | 本轮最关键的代码片段/设计要点，不超过 10 行 |
| 9 | **关键契约细化** | 🔶 | 列表：本轮必须遵守的契约约束（如"禁止改 Schema"、"必须浅合并 metadata"）。每条以文件路径开头 |
| 10 | **高风险误区** | ✅ | 列表：最常见的错误做法，用"禁止…"句式。**必须包含"禁止提前实现下一轮 X"** |
| 11 | **ADD-7 审计记录** | ✅ | 表格：action + targetType + targetId + 说明。标注哪些已落库、哪些待记录。附带恢复关键词列表 |
| 12 | **验证标准** | ✅ | 分"已完成验证"和"未执行的端到端验证"两组。未执行项诚实保留，注明"保留给运行时复测" |
| 13 | **完成后记录 ADD-7 审计** | ✅ | 每文件对应的 audit action 列表 + 一键汇总查询语句 |

第 8、9 项视轮次复杂度可选（简单轮次可省略），其余项全部必须。

**恢复上下文审计查询的组织原则**：
- 必须分三步组织：第一步按 targetId 搜代码文件 → 第二步搜文档变更（DOC_UPDATED）→ 第三步按 action 关键词快速定位
- 每条查询写清楚预期返回数和内容摘要
- 必须包含一键汇总查询（如 `query_audit_logs({ keyword: "RESPONSE_STRATEGY" })` → 返回全部 N 条本轮记录）
- 必须给新 AI Session 提供"恢复顺序建议"（从 session-init 到 read spec 的完整步骤）

**验证标准的原则**：
- 已完成验证项：附代码行号/终端输出等可验证证据
- 未执行项（运行时端到端）：必须保留为 `- [ ]` 并注明原因和复测条件
- 不允许空勾选或"推测通过"

#### 多轮 Handoff 附加全局章节

##### 收敛判定补充规则

与 `add-paradigm` SKILL Step 8 并列，每轮必须额外满足：

**checklist 证据要求**：
- 全部项已勾选，不得有空勾选或"推测通过"
- 每项勾选有可验证证据（编译输出/终端截图/代码行号/`query_audit_logs` 结果）
- 未执行项诚实保留为 `- [ ]` 并注明"待后续运行时验证"
- 证据可通过 `query_audit_logs` 按 targetId/keyword 跨会话获取

**tasks 证据要求**：
- 全部任务已完成（`- [x]`）
- 每个 task 有对应 checklist 项覆盖
- task 完成状态与 ADD-7 审计记录一致

**收敛声明规则**：
- 执行 AI 不得自行声明"本轮已收敛"
- 收敛声明只能由开发者或 Review AI 做出
- 执行 AI 的职责是完成 checklist/tasks 并附证据，而非自我判定

##### 附录：每轮启动模板

必须包含一个标准化的启动指令模板，供新对话开始时直接粘贴给 LLM。模板至少包含：
- 上下文声明（"你在执行第 N 轮"）
- 启动步骤（从 session-init → add-paradigm → read spec → 逐 task 执行，11 步完整清单）
- 关键提醒（当前轮次位置、原子事务约束、架构文档同步要求、禁止自我判定收敛）

### Handoff 脱敏要求

Handoff 文档中 **禁止出现** 以下类型的硬编码值：
- 数据库密码（`POSTGRES_PASSWORD`）
- Chroma auth token（`CHROMA_AUTH_TOKEN`）
- JWT 密钥（`JWT_SECRET`）
- API Key（`OPENAI_API_KEY_*`）

所有凭据值应通过 `${ENV_VAR}` 引用，并标注"值见 `.env.development` / `.env.production`"。

---

## 项目技术约束

### 审计日志器模式

每个业务域的审计日志器必须遵循 `audit-logger.ts` 的完整模式：
- `PREFIX` 常量：`[DOMAIN-AUDIT]` 格式
- `LOG_DIR`：`logs/{domain}/` 目录
- `AuditPhase` 类型：枚举所有业务阶段
- `audit()` / `auditPhaseStart()` / `auditPhaseEnd()` 三函数
- `readRecentLogs()` / `clearLogs()` 读写函数
- `ENABLE_FILE_LOG` 环境变量控制，开发环境默认启用

### 数据库 Schema

Prisma schema 修改时：
- 新增模型必须有审计数据字段（Json 类型）
- 关联关系必须定义 `onDelete: Cascade`
- 使用 `@id @default(cuid())` 生成 ID
- 使用 `@updatedAt` 自动更新时间戳

### Agent 节点

LangGraph 节点实现时：
- 必须通过 `wrapNodeWithAudit` 包装
- `inputSnapshot` 不能为空对象 `{}`
- 路由决策必须调用 `agentAuditRoute()`
- 检索节点必须记录证据链 diff

### 代码质量

- TypeScript 编译必须通过（`npx tsc --noEmit`）
- 禁止 `any` 类型（必须显式定义）
- 禁止简化代码实现，一切以代码高质量为衡量标准
- 新增文件必须在项目已有目录结构内，遵循现有命名规范

---

## MCP 工具约束

本项目配置了 MCP（Model Context Protocol）服务器，将 ADD 范式约束从"AI 读取规则后尝试遵守"升级为"AI 调用工具获取确定性结果"。

### MCP-1：上下文优先

AI 助手在生成任何代码前，必须先调用以下工具获取真实信息，不得凭记忆假设：
- `get_project_context` — 获取项目结构、技术栈、可用脚本
- `get_db_schema` — 获取 Prisma Schema 模型定义
- `get_audit_logger_pattern` — 获取现有审计日志器模式
- `find_related_docs` — 查找与变更相关的项目文档（ADD-0.1 文档先行）

### MCP-2：生成优先于手写

AI 助手在以下场景不得手写代码，必须调用生成工具：
- 新建审计日志器 → 调用 `generate_audit_logger`
- 生成的功能骨架必须包含完整的三通道审计

### MCP-3：编码中验证

AI 助手在生成包含审计阶段的代码后，必须调用验证工具检查合规性：
- `check_phase_symmetry` — 验证 ADD-2 阶段标记对称性
- `check_failure_path` — 验证 ADD-6 失败路径审计等价

### MCP-4：工具调用链

AI 助手遵循"调用工具 → 获得结果 → 编码 → 验证"的闭环流程：
1. 调用 `get_audit_logger_pattern` 或 `generate_audit_logger` 获取审计日志器代码
2. 编码业务逻辑
3. 调用 `check_phase_symmetry` 和 `check_failure_path` 验证
4. 如有不合规则修正后重新验证

### MCP-5：稀疏推理恢复（Sparse Inference Recovery）

AI 助手在**每次新对话启动时**，必须先执行 `.trae/skills/session-init/SKILL.md`（SKILL-1 会话初始化），作为**不可跳过的前置操作**。

`session-init` SKILL 的 Step 1 要求调用 `query_audit_logs` 工具查询开发操作审计记录，以恢复开发上下文。

**执行顺序**（新对话启动时的首个操作）：
1. 定位并执行 `session-init` SKILL（`.trae/skills/session-init/SKILL.md`）
2. 按 SKILL 的 Step 1 调用 `query_audit_logs({})` 查询
3. 按 SKILL 的 Step 2 分析推断上下文
4. 按 SKILL 的 Step 3 构建摘要
5. 恢复完成后响应用户需求

**如果 `query_audit_logs` 返回空结果**：可能原因包括数据库未运行、之前未使用 `record_dev_operation` 记录、或者确实是新会话。此时按正常流程处理。

### MCP-6：Plan 命名与审计策略

每个 Plan（计划文件）必须包含以下元信息：

```markdown
## PLAN 元信息
- **Plan 名称**: {功能英文名}-{序号} (如 document-list-pagination-v1)
- **启动时间**: {ISO 时间戳}
- **主导 AI**: {AI 助手标识}
- **ADD-7 审计策略**: 列出本次 Plan 涉及的文件及其 audit action
```

**命名规范**:
- Plan 名称使用 `{功能}-{改动}-v{版本}` 格式
- 示例: `document-list-pagination-v1`, `chat-persistence-fix-v2`
- 每个 Plan 文件名格式: `PLAN-{名称}.md`

**审计策略格式**（位于 PLAN 文件的元信息中）:

```markdown
| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| route.ts | API_ROUTE | API_PAGINATION_ENABLED | 无分页 | page/pageSize 分页 | 待记录 |
```

### MCP 配置

MCP 服务器配置在 `.trae/mcp.json`，通过 `npx tsx .trae/scripts/mcp-server.ts` 启动。
Trae IDE 加载项目时自动连接 MCP 服务器。
