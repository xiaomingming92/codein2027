---
name: "add-paradigm"
description: "Audit-Driven Development paradigm workflow. Invoke when starting any new feature development, bug fix, or system modification. Guides through 8 steps from documentation-first to convergence verification."
---

# 可审计开发范式（ADD）工作流

本 Skill 引导你按照 ADD 范式完成功能开发。每次开始新功能、修复 Bug、或修改系统行为时，必须按此工作流执行。

**范式边界**（定义在 `.trae/rules/project_rules.md` ADD-0）：
- ADD 是开发阶段编程范式，不是运行时范式
- 反馈闭环消费者：IDE 中的 AI 助手 + 编程人员
- 运行时范式（裁决层/能力模型）是独立的下一步演化

**核心原则**（始终生效，定义在 `.trae/rules/project_rules.md`）：
- ADD-0：范式边界与消费者定义
- ADD-0.1：文档先行（Documentation First）
- ADD-1：可观测性优先于功能实现
- ADD-2：阶段标记对称
- ADD-3：最小可观测单元
- ADD-4：三通道输出
- ADD-5：审计数据即业务数据
- ADD-6：失败路径等价审计

---

## Step 0：项目文档先行（Documentation First）

**在编写任何代码之前，必须先完成本步骤。项目文档是代码变更的源头和依据，文档必须先于代码更新。**

### 0.1 分析变更影响范围

确定本次变更涉及的业务域和功能范围，列出受影响的文档类别：

| 文档类别 | 目录位置 | 典型文件 |
|---------|---------|---------|
| 需求文档 | `docs/*/knowledge/00-需求/` | PRD、规划说明书 |
| 架构文档 | `docs/*/knowledge/01-架构/` 或 `02-架构/` | 架构说明书、系统设计 |
| 规范文档 | `docs/*/knowledge/02-规范/` 或 `03-规范/` | 开发规范、状态机规范、核心规范 |
| AI 核心文档 | `docs/*/knowledge/03-规范/` | AI 智能体核心规范 |

### 0.2 搜索相关项目文档

调用 MCP 工具 `find_related_docs` 查找与当前变更相关的项目文档：

```
find_related_docs({ query: "功能关键词" })
```

预期产出：
- 匹配的项目文档列表（路径 + 标题 + 摘要）
- 按相关性排序的文档列表

### 0.3 阅读并理解相关文档

逐篇阅读命中的文档，重点关注：
- 与本次变更直接相关的章节
- 文档中定义的接口、合约、数据流
- 依赖关系和约束条件

### 0.4 更新项目文档（文档先行）

**在修改代码之前，先更新项目文档，使文档反映即将实现的变更。** 包含但不限于：

- **新增功能**：补充需求文档中的功能描述 → 更新架构文档中的模块设计 → 更新规范文档中的约束规则
- **修改功能**：修改需求文档中的功能描述 → 修改架构文档中的模块设计 → 修改规范文档中的接口定义
- **删除功能**：标记需求文档中的废弃项 → 删除架构文档中的模块 → 更新规范文档中的兼容性说明

### 0.5 文档变更检查

每次文档更新必须遵循以下原则：

- [ ] 文档更新在代码变更之前完成
- [ ] 需求文档、架构文档、规范文档中与变更相关的部分已同步更新
- [ ] 文档中的接口/合约定义与即将实现的代码一致
- [ ] 如果本次变更不需要修改项目文档，在注释中说明理由（例如：纯 bug 修复不影响外部合约）
- [ ] 文档更新后，调用 `record_dev_operation` 记录文档变更（`targetType: "DOC"`）

### Step 0 产出检查

- [ ] 已调用 `find_related_docs` 搜索相关文档
- [ ] 已阅读并理解所有相关项目文档
- [ ] 项目文档已更新（或已说明无需更新）
- [ ] 文档合约一致性已确认

---

## Step 1：功能分析与审计阶段定义

**在编写任何业务代码之前，必须先完成本步骤。**

### 1.1 分析功能的业务阶段

列出功能的所有业务阶段和技术阶段，形成审计阶段枚举。

### 1.2 定义 AuditPhase 枚举

```typescript
// src/lib/{feature}-logger.ts
type {Feature}AuditPhase =
  | "{FEATURE}_START"              // 功能流程开始
  | "{PHASE_ONE}"                  // 业务阶段一
  | "{PHASE_ONE}_CHUNK"            // 最小可观测单元（循环内）
  | "{PHASE_TWO}"                  // 业务阶段二
  | "{FEATURE}_DONE"               // 功能完成
  | "{FEATURE}_FAIL"               // 功能失败
```

### 1.3 定义可观测数据结构

```typescript
export type {Feature}AuditData = {
  startedAt: Date
  // 每个阶段产出的关键指标
  phaseOneItems: number
  phaseTwoDurationMs: number
  completedAt?: Date
  error?: string
}
```

### 1.4 定义数据库审计字段

确定审计数据回写到哪个业务表的哪个字段：

```prisma
model {BusinessEntity} {
  // ... 业务字段 ...
  metadata  Json?    // { last{Feature}Audit: {Feature}AuditData }
}
```

### Step 1 产出检查

- [ ] AuditPhase 枚举已定义，包含所有业务阶段
- [ ] 每个阶段都有进入/退出标记的定义
- [ ] 可观测数据结构已定义
- [ ] 数据库审计字段位置已确定

---

## Step 2：审计基础设施实现

**在编写业务代码之前，先建立审计能力。**

### 2.1 创建审计日志器

遵循项目现有的 `audit-logger.ts` 模式，创建 `src/lib/{feature}-logger.ts`：

```typescript
import * as fs from "fs/promises"
import * as path from "path"

const PREFIX = "[{FEATURE}-AUDIT]"

const LOG_DIR = process.env.{FEATURE}_LOG_DIR || path.join(process.cwd(), "logs", "{feature-dir}")
const LOG_FILE = process.env.{FEATURE}_LOG_FILE || "{feature}.log"
const ENABLE_FILE_LOG = process.env.{FEATURE}_ENABLE_FILE_LOG === "true" || process.env.NODE_ENV === "development"

type {Feature}AuditPhase =
  | "{FEATURE}_START"
  | "{PHASE_ONE}"
  | "{PHASE_ONE}_CHUNK"
  | "{PHASE_TWO}"
  | "{FEATURE}_DONE"
  | "{FEATURE}_FAIL"

async function ensureLogDir(): Promise<void> {
  if (!ENABLE_FILE_LOG) return
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
  } catch {
    // Directory already exists
  }
}

async function writeToFile(message: string): Promise<void> {
  if (!ENABLE_FILE_LOG) return
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.appendFile(logPath, message + "\n", "utf-8")
  } catch (error) {
    console.error(`${PREFIX} Failed to write to log file:`, error)
  }
}

function formatMessage(phase: {Feature}AuditPhase, detail: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const extraStr = extra ? ` | ${JSON.stringify(extra)}` : ""
  return `${PREFIX} [${ts}] [${phase}] ${detail}${extraStr}`
}

export function {feature}Audit(phase: {Feature}AuditPhase, detail: string, extra?: Record<string, unknown>) {
  const message = formatMessage(phase, detail, extra)
  console.log(message)
  writeToFile(message)
}

export function {feature}AuditPhaseStart(phase: {Feature}AuditPhase, description: string, count?: number) {
  const countStr = count !== undefined ? ` (${count}个)` : ""
  const message = `${PREFIX} ═══ [${phase}] 开始${countStr}: ${description} ═══`
  console.log(message)
  writeToFile(message)
}

export function {feature}AuditPhaseEnd(phase: {Feature}AuditPhase, detail: string) {
  const message = `${PREFIX} ═══ [${phase}] 结束: ${detail} ═══`
  console.log(message)
  writeToFile(message)
}

export async function read{Feature}Logs(lines: number = 100): Promise<string[]> {
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    const content = await fs.readFile(logPath, "utf-8")
    const allLines = content.split("\n").filter(Boolean)
    return allLines.slice(-lines)
  } catch {
    return []
  }
}

export async function clear{Feature}Logs(): Promise<void> {
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.writeFile(logPath, "", "utf-8")
  } catch {
    // Ignore
  }
}
```

### 2.2 修改 Prisma Schema

添加审计数据字段到业务表：

```prisma
model {BusinessEntity} {
  id        String   @id @default(cuid())
  // ... 现有业务字段 ...
  metadata  Json?    // 审计数据回写位置
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

运行 `npx prisma db push` 应用 Schema 变更。

### Step 2 产出检查

- [ ] 审计日志器文件已创建，遵循 `audit-logger.ts` 模式
- [ ] 三通道输出已实现（console + file + 数据库字段）
- [ ] Prisma Schema 已修改并推送
- [ ] 日志目录路径正确

---

## Step 3：业务逻辑实现与审计植入

**功能实现与审计点同步进行，不分离。**

### 3.1 服务层审计植入模板

模板包含 **Layer 1 开发审计**（可插拔，AI 合规检查）和 **Layer 2 运行时审计**（始终开启，业务记录）。

```typescript
import { prisma } from "@/lib/prisma"
import { {feature}AuditPhaseStart, {feature}AuditPhaseEnd, {feature}Audit } from "@/lib/{feature}-dev-logger"
import { record{Feature}Audit } from "@/lib/{feature}-audit"

export class {Feature}Service {
  async execute{Feature}(params: {Feature}Params): Promise<{Feature}Result> {
    const startTime = Date.now()
    // Layer 1: 开发审计 — 阶段标记（仅开发环境生效）
    {feature}AuditPhaseStart("{FEATURE}_START", `{feature}开始: ${JSON.stringify(params).slice(0, 100)}`)

    try {
      // 阶段一
      {feature}AuditPhaseStart("{PHASE_ONE}", "阶段一描述")
      const phaseOneResult = await this.phaseOne(params)
      // 最小可观测单元：循环内审计
      for (let i = 0; i < phaseOneResult.items.length; i++) {
        const item = phaseOneResult.items[i]
        const itemStart = Date.now()
        await this.processItem(item)
        {feature}Audit("{PHASE_ONE}_CHUNK", `项目#${i}: ${item.id}`, {
          itemId: item.id,
          duration_ms: Date.now() - itemStart,
        })
      }
      {feature}AuditPhaseEnd("{PHASE_ONE}", `完成 ${phaseOneResult.items.length} 个项目`)

      // 阶段二
      {feature}AuditPhaseStart("{PHASE_TWO}", "阶段二描述")
      const phaseTwoResult = await this.phaseTwo(phaseOneResult)
      {feature}AuditPhaseEnd("{PHASE_TWO}", `阶段二完成, 耗时${Date.now() - startTime}ms`)

      const totalTime = Date.now() - startTime

      // Layer 2: 运行时审计 — 业务记录写入 DB（始终开启）
      await record{Feature}Audit({
        action: "{FEATURE}_EXECUTED",
        entityId: params.id,
        detail: {
          durationMs: totalTime,
          itemsProcessed: phaseOneResult.items.length,
          phaseTwoResult: phaseTwoResult.summary,
        },
      })

      {feature}AuditPhaseEnd("{FEATURE}_START", `{feature}完成, 总耗时${totalTime}ms`)
      return phaseTwoResult

    } catch (error) {
      const totalTime = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : String(error)

      // Layer 1: 失败路径开发审计
      {feature}Audit("{FEATURE}_FAIL", `{feature}失败: ${errorMsg}`, {
        params: JSON.stringify(params).slice(0, 200),
        duration_ms: totalTime,
        error: errorMsg,
      })

      // Layer 2: 失败路径运行时审计
      await record{Feature}Audit({
        action: "{FEATURE}_FAILED",
        entityId: params.id,
        detail: { durationMs: totalTime, error: errorMsg },
      })

      throw error
    }
  }
}
```

### 3.2 API Route 审计植入模板

```typescript
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let requestId: string | undefined

  try {
    const body = await request.json()
    requestId = body.id || crypto.randomUUID()

    {feature}AuditPhaseStart("{FEATURE}_START", `请求: ${requestId}`)

    // 业务逻辑调用
    const result = await {feature}Service.execute(body)

    {feature}AuditPhaseEnd("{FEATURE}_START", `请求完成: ${requestId}, 耗时${Date.now() - startTime}ms`)
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    {feature}Audit("{FEATURE}_FAIL", `请求失败: ${requestId}`, {
      requestId,
      duration_ms: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
```

### Step 3 产出检查

- [ ] 每个方法入口有 `auditPhaseStart()`
- [ ] 每个方法出口有 `auditPhaseEnd()`
- [ ] 循环体内每个迭代有最小单元审计
- [ ] catch 块有等价信息密度的审计
- [ ] 审计数据回写数据库
- [ ] API Route 有完整的审计包裹

---

## Step 4：审计数据验证

**运行功能，收集审计数据，验证完整性。**

### 4.1 运行功能

触发功能执行，产生审计日志。

### 4.2 检查阶段标记对称性

验证每个 `auditPhaseStart` 都有对应的 `auditPhaseEnd`：

```bash
# 检查对称性
grep -c "开始" logs/{feature-dir}/{feature}.log
grep -c "结束" logs/{feature-dir}/{feature}.log
# 两个数字必须相等
```

### 4.3 检查最小可观测单元

验证循环内的审计记录是否完整：
- 每个项目/块/消息都有独立审计记录
- 每条记录包含结构化 extra 数据

### 4.4 检查三通道输出

1. 控制台：运行时有 `[PREFIX]` 开头的输出
2. 文件日志：`logs/{feature-dir}/{feature}.log` 有内容
3. 数据库：业务表的 metadata/审计字段有结构化数据

### 4.5 检查失败路径

模拟错误场景，验证 catch 块的审计信息密度与 try 块等价。

### Step 4 产出检查

- [ ] 阶段标记对称（Start/End 数量匹配）
- [ ] 最小可观测单元数据完整
- [ ] 三通道输出正常
- [ ] 失败路径审计等价
- [ ] 数据库审计字段有数据

---

## Step 4.5：AI 自动合规检查

**AI 助手作为审计数据的第一消费者，自动检查 ADD 原则的合规性。**

### 4.5.1 读取审计日志

调用审计日志器的 `readRecentLogs()` 函数获取最近的审计记录：

```typescript
import { read{Feature}Logs } from "@/lib/{feature}-logger"

const logs = await read{Feature}Logs(200)
```

### 4.5.2 执行合规检查

AI 助手必须逐项检查以下合规条件，并向程序员报告结果：

**检查 1：阶段标记对称性（ADD-2）**

- 统计所有 `═══ [PHASE] 开始` 的出现次数
- 统计所有 `═══ [PHASE] 结束` 的出现次数
- 两个数字必须相等
- 不对称 = 有阶段异常中断，需要定位具体阶段

**检查 2：最小可观测单元完整性（ADD-3）**

- 统计 `_CHUNK` 阶段的审计记录数
- 与预期的循环次数对比
- 记录数 < 预期 = 循环中有迭代未完成

**检查 3：失败路径信息密度（ADD-6）**

- 检查 `_FAIL` 阶段的 extra 字段
- 对比成功路径的 extra 字段
- 失败路径 extra 字段数 ≥ 成功路径 = 合规
- 失败路径 extra 字段数 < 成功路径 = 不合规，需要补充

**检查 4：三通道输出一致性（ADD-4）**

- 控制台输出：有 `[PREFIX]` 开头的日志
- 文件日志：`logs/{feature-dir}/{feature}.log` 有内容
- 数据库：业务表 metadata/审计字段有结构化 JSON 数据

**检查 5：审计数据回写（ADD-5）**

- 查询数据库确认审计字段有数据
- 审计数据结构符合 Step 1 定义的 AuditData 类型

### 4.5.3 生成合规报告

AI 助手必须生成以下格式的合规报告：

```
ADD 合规检查报告
═════════════════
功能：{feature name}
检查时间：{ISO timestamp}
日志条数：{N}

合规项：
  ✅ 阶段标记对称（Start=5, End=5）
  ✅ 最小可观测单元完整（CHUNK=9, 预期=9）
  ✅ 审计数据回写数据库

不合规项：
  ❌ 失败路径信息密度不足
     - VECTORIZE_FAIL extra 字段数=2, 成功路径=3
     - 缺少字段: tokens_processed
     - 修复建议: 在 catch 块中添加 tokens_processed 变量记录

  ⚠️ 阶段标记不对称
     - CHAIN_TRACE_SAVE 有 Start 无 End
     - 可能原因: 链路追踪保存异常中断
     - 修复建议: 检查 saveChainTrace 方法是否抛出未捕获异常
```

### 4.5.4 AI 根据合规报告调整行为

- 如果有不合规项，AI 自动生成修复代码并提示程序员
- 如果合规报告显示功能收敛，AI 确认开发完成
- 如果发现审计数据中的异常模式（如某阶段从未触发），AI 主动提示

### Step 4.5 产出检查

- [ ] AI 已读取审计日志（调用 readRecentLogs）
- [ ] 阶段标记对称性已检查
- [ ] 最小可观测单元完整性已检查
- [ ] 失败路径信息密度已检查
- [ ] 合规报告已生成并展示给程序员
- [ ] 不合规项已有修复建议或修复代码

---

## Step 5：从审计数据定位问题

**如果 Step 4 发现异常，从审计数据中定位根因。**

### 5.1 分析日志文件

```bash
# 查看最近的审计日志
cat logs/{feature-dir}/{feature}.log | tail -50

# 过滤特定阶段
grep "{PHASE_ONE}_CHUNK" logs/{feature-dir}/{feature}.log

# 查找失败记录
grep "FAIL\|ERROR" logs/{feature-dir}/{feature}.log
```

### 5.2 分析数据库审计字段

```sql
SELECT id, metadata->>'last{Feature}Audit'
FROM "{BusinessEntity}"
ORDER BY "updatedAt" DESC
LIMIT 10;
```

### 5.3 从数据推断根因

审计数据的优势：
- 只有 Start 没有 End = 该阶段异常中断
- CHUNK 审计中某条缺失 = 该迭代失败
- 耗时异常长 = 性能瓶颈
- 数据库审计字段为空 = 写入失败

---

## Step 6：修复并验证

### 6.1 修复问题

根据 Step 5 定位的根因进行修复。

### 6.2 重新运行验证

修复后重新执行 Step 4 的验证流程。

### 6.3 审计数据验证修复效果

对比修复前后的审计数据，确认：
- 异常消失
- 阶段标记恢复对称
- 数据库审计字段正常

---

## Step 7：收敛判断

### 收敛条件

所有以下条件满足时，功能开发收敛：

- [ ] 审计日志无 FAIL/ERROR 记录
- [ ] 阶段标记完全对称
- [ ] 最小可观测单元数据完整且合理
- [ ] 数据库审计字段有正确的结构化数据
- [ ] TypeScript 编译通过
- [ ] 三通道输出格式统一

### 未收敛

如果仍有异常，回到 Step 5 继续定位和修复。

---

## 现有审计日志器参考

项目已有以下审计日志器，新日志器必须遵循相同模式：

| 日志器 | 文件 | 前缀 | 日志目录 |
|--------|------|------|----------|
| 知识库审计 | `src/lib/audit-logger.ts` | `[KB-AUDIT]` | `logs/knowledge-base/` |
| Agent审计 | `src/lib/agent-audit-logger.ts` | `[AGENT-AUDIT]` | `logs/agent/` |

新日志器命名规范：
- 文件：`src/lib/{feature}-logger.ts`
- 前缀：`[{FEATURE}-AUDIT]`
- 日志目录：`logs/{feature-dir}/`
- 日志文件：`{feature}.log`
