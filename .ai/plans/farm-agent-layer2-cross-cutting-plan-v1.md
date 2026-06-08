# farm-agent-layer2-cross-cutting-plan-v1

## PLAN 元信息

- **Plan 名称**: farm-agent-layer2-cross-cutting-v1
- **启动时间**: 2026-06-03T09:00:00.000Z
- **主导 AI**: Claude (via Trae IDE)
- **来源**: LangChain `BaseCallbackHandler` 标准扩展机制 — LangGraph 的生命周期钩子自动覆盖所有 pipeline 事件（chain/node start/end/error、LLM call、tool call），无需在节点文件中手动编写任何审计代码
- **方案方向修正**: 原方案（2026-05-29）使用 HTTP 层 `withRuntimeAudit()` 高阶函数包装器，本质是 milktea Express 中间件的克隆，仅适用于知识库 API Route，不覆盖 Agent 域。**本次修正**将方案从 HTTP 包装器改为 LangChain 回调系统，直接服务于 Agent 域（LangGraph pipeline）。
- **关联文档**:
  - Handoff: `.trae/plans/farm-agent-layer2-cross-cutting-handoff.md`
  - Review: `.trae/reviews/farm-agent-layer2-cross-cutting-review-v1.md`
  - Spec: `.trae/specs/farm-agent-layer2-cross-cutting/spec.md`
  - Tasks: `.trae/specs/farm-agent-layer2-cross-cutting/tasks.md`
  - Checklist: `.trae/specs/farm-agent-layer2-cross-cutting/checklist.md`
- **ADD-7 审计策略**:

| 文件 | targetType | action | beforeState | afterState | 状态 |
|-----|-----------|--------|------------|-----------|------|
| `src/lib/layer2-callback.ts` | COMPONENT | COMPONENT_CREATED | 无 LangChain 回调审计 | `AuditCallback extends BaseCallbackHandler` 类 | 待实施 |
| `src/agents/index.ts` | COMPONENT | COMPONENT_MODIFIED | `invoke/stream` 无 callbacks 注入 | `invoke/stream` 自动注入 `AuditCallback` | 待实施 |
| `src/lib/agent-audit-logger.ts` | COMPONENT | COMPONENT_MODIFIED | 无 callback 专用写入方法 | 新增 `writeAuditLogFromCallback()` 辅助函数 | 待实施 |

---

## 一、背景与目标

### 1.1 问题现状

farm-agent 的 Agent 域（LangGraph pipeline）当前通过 `wrapNodeWithAudit()` 手动在每个节点中写入审计：

```
intentionNode  →  wrapNodeWithAudit("intention", ...)  →  手动调用 agentAuditNodeStart/End/Error
retrievalNode  →  wrapNodeWithAudit("retrieval", ...)  →  同上
reasoningNode  →  wrapNodeWithAudit("reasoning", ...)  →  同上
verdictNode    →  wrapNodeWithAudit("verdict", ...)    →  同上
responseNode   →  wrapNodeWithAudit("response", ...)   →  同上
```

**问题**：
1. `wrapNodeWithAudit` 仅覆盖 LangGraph 节点层级，不覆盖 LLM 调用和 Tool 调用（这些发生在节点内部，不在 wrapper 中）
2. 每个节点需要单独包装，违反"自动记录"原则
3. 新增节点时必须手动添加审计包装，容易遗漏
4. LLM 调用（token 用量）、Tool 调用（输入/输出）完全没有 Layer 2 AuditLog 记录

### 1.2 正确方案：LangChain `BaseCallbackHandler`

LangChain 提供了 `BaseCallbackHandler` 抽象类（`@langchain/core/callbacks/base`），这是 LangGraph 生态系统中**官方的、推荐的生命周期钩子机制**。通过扩展 `BaseCallbackHandler` 并注入到 `agent.invoke()` / `agent.stream()` 的 `config.callbacks` 数组中，可以自动捕获：

| 钩子 | 覆盖范围 |
|------|---------|
| `handleChainStart/End/Error` | LangGraph 节点（chain.name = 节点名） + 根 pipeline |
| `handleLLMEnd/Error` | 所有 LLM 调用（含 token usage） |
| `handleToolStart/End/Error` | 所有 Tool 调用（含输入/输出） |

这是 **LangGraph 的标准扩展机制**，不是 hack。LangChain 文档明确推荐通过 callbacks 实现日志、监控、审计等横切关注点。

### 1.3 目标

通过 `AuditCallback extends BaseCallbackHandler` 实现 Agent 域 Layer 2 运行时审计的**完全自动化**：
- 节点文件中**零行**手动审计代码（`wrapNodeWithAudit` 保留不动，作为 L1 dev-logger）
- LLM 调用自动记录 token 用量到 AuditLog 表
- Tool 调用自动记录输入/输出到 AuditLog 表
- 新增节点无需任何额外工作即可自动获得审计覆盖
- 与现有 `wrapNodeWithAudit`（L1 dev-logger）互不干扰

---

## 二、方案选型

### 2.1 为什么 HTTP 包装器方案适用方向错误

| 维度 | HTTP `withRuntimeAudit()` | Agent 域实际需求 |
|------|--------------------------|-----------------|
| 拦截位置 | HTTP 请求入口 | LangGraph 节点/LLM/Tool 执行点 |
| 覆盖范围 | 知识库 API Route（upload/delete/sync） | 所有 6 个 Agent 节点 + LLM + Tool |
| 适用场景 | 请求级审计 | Pipeline 级审计（节点 + LLM + Tool） |
| 与现有代码关系 | 需要改造 Route 导出方式 | 注入 config.callbacks，不改节点代码 |
| 零新增依赖 | 是（纯 TS） | 是（`@langchain/core` 已有） |

HTTP 包装器方案对 Agent 域是**错误的抽象层次**。Agent 域的执行在 LangGraph pipeline 内部，不经过 HTTP 请求入口（`stream/route.ts` 只负责 HTTP ↔ Agent 的桥接）。Agent 域的正确横切点在 `agent.invoke()` 和 `agent.stream()` 的 `config.callbacks`。

### 2.2 候选方案对比

| 方案 | 可行性 | 类型安全 | 调试友好 | 零新增依赖 | 覆盖 LLM/Tool | 结论 |
|------|--------|---------|---------|-----------|--------------|------|
| **A: BaseCallbackHandler** | ✅ | ✅ | ✅ | ✅（`@langchain/core` 已有） | ✅ | **选用** |
| B: HTTP `withRuntimeAudit()` | ❌ 不覆盖 Agent 域 | ✅ | ✅ | ✅ | ❌ | 排除（方向错误） |
| C: Proxy 全自动 | ⚠️ | ❌ | ❌ | ✅ | ⚠️ | 排除 |
| D: 装饰器 `@RuntimeAudit` | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | 延期 |

### 2.3 选型理由

方案 A（`BaseCallbackHandler`）是唯一满足"覆盖 Agent 域所有事件 + 零新增依赖 + 不改节点代码 + LangGraph 标准扩展"的方案。它是 LangChain 设计的官方扩展点，不绑定任何特定框架，与 `@langchain/core` 版本无关（`BaseCallbackHandler` 自 `@langchain/core` v0.1.x 起就存在）。

---

## 三、架构设计

### 3.1 数据流

```
agent.invoke(input, { configurable: {...}, callbacks: [auditCallback] })
  │
  ├─ handleChainStart("intention", runId)
  │   └─ [AuditLog] NODE_START_intention
  │   ├─ handleLLMEnd(...)  ← LLM 调用在 intention 内部
  │   │   └─ [AuditLog] AGENT_LLM_CALL { tokens, model }
  │   └─ handleChainEnd(output, runId)
  │       └─ [AuditLog] NODE_END_intention { durationMs, outputKeys }
  │
  ├─ handleChainStart("retrieval", runId)
  │   └─ [AuditLog] NODE_START_retrieval
  │   ├─ handleToolStart("knowledge_search", input, runId)
  │   │   └─ [AuditLog] AGENT_TOOL_START_knowledge_search
  │   ├─ handleToolEnd(output, runId)
  │   │   └─ [AuditLog] AGENT_TOOL_END_knowledge_search { outputLength }
  │   └─ handleChainEnd(output, runId)
  │       └─ [AuditLog] NODE_END_retrieval { durationMs }
  │
  ├─ ... reasoning, verdict, response 同理 ...
  │
  └─ handleChainEnd(finalOutput, rootRunId)
      └─ [AuditLog] AGENT_PIPELINE_END { totalDurationMs, nodeCount }
```

### 3.2 `AuditCallback` 类设计

```typescript
// src/lib/layer2-callback.ts

import { BaseCallbackHandler } from "@langchain/core/callbacks/base"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

// chain.name → targetId 映射
const AGENT_NODE_NAMES = new Set([
  "intention", "retrieval", "reasoning",
  "interactionPointDetection", "verdict", "response",
])

// node → runId 映射表（用于在 handleChainEnd/Error 中计算 durationMs）
type RunRecord = { nodeName: string; startTime: number }

export class AuditCallback extends BaseCallbackHandler {
  name = "farm-agent-layer2-audit"

  private traceId: string
  private userId: string
  private nodeStartTimes: Map<string, RunRecord>

  constructor(traceId: string, userId = "system") {
    super()
    this.traceId = traceId
    this.userId = userId
    this.nodeStartTimes = new Map()
  }

  // ─── Chain（LangGraph 节点）───

  async handleChainStart(chain: { name: string }, runId: string, parentRunId?: string) {
    // 过滤非 Agent 节点的 chain（如 RunnableSequence、RunnableLambda 等内部 chain）
    if (!AGENT_NODE_NAMES.has(chain.name)) return

    this.nodeStartTimes.set(runId, { nodeName: chain.name, startTime: Date.now() })

    this.writeAuditLog(`NODE_START_${chain.name}`, "AGENT_NODE", chain.name, {
      parentRunId: parentRunId ?? null,
    })
  }

  async handleChainEnd(output: Record<string, unknown>, runId: string, parentRunId?: string) {
    const record = this.nodeStartTimes.get(runId)
    if (!record) return

    const durationMs = Date.now() - record.startTime
    const outputKeys = this.safeKeys(output)

    this.writeAuditLog(`NODE_END_${record.nodeName}`, "AGENT_NODE", record.nodeName, {
      durationMs,
      outputKeys,
      parentRunId: parentRunId ?? null,
    })

    this.nodeStartTimes.delete(runId)
  }

  async handleChainError(err: Error, runId: string, parentRunId?: string) {
    const record = this.nodeStartTimes.get(runId)
    const nodeName = record?.nodeName ?? "unknown"
    const durationMs = record ? Date.now() - record.startTime : 0

    this.writeAuditLog(`NODE_ERROR_${nodeName}`, "AGENT_NODE", nodeName, {
      durationMs,
      error: err.message,
      parentRunId: parentRunId ?? null,
    })

    if (record) this.nodeStartTimes.delete(runId)
  }

  // ─── LLM 调用 ───

  async handleLLMEnd(
    output: { llmOutput?: { tokenUsage?: Record<string, number> } },
    runId: string,
  ) {
    const tokenUsage = output.llmOutput?.tokenUsage ?? {}
    this.writeAuditLog("AGENT_LLM_CALL", "AGENT_LLM", runId, {
      tokenUsage,
    })
  }

  // ─── Tool 调用 ───

  async handleToolStart(tool: { name: string }, input: string, runId: string) {
    this.writeAuditLog(`AGENT_TOOL_START_${tool.name}`, "AGENT_TOOL", tool.name, {
      runId,
      inputPreview: input.slice(0, 200),
    })
  }

  async handleToolEnd(output: string, runId: string) {
    this.writeAuditLog("AGENT_TOOL_END", "AGENT_TOOL", runId, {
      outputLength: output.length,
      outputPreview: output.slice(0, 200),
    })
  }

  async handleToolError(err: Error, runId: string) {
    this.writeAuditLog("AGENT_TOOL_ERROR", "AGENT_TOOL", runId, {
      error: err.message,
    })
  }

  // ─── 辅助方法 ───

  private writeAuditLog(
    action: string,
    targetType: string,
    targetId: string,
    detail: Record<string, unknown>,
  ) {
    prisma.auditLog.create({
      data: {
        userId: this.userId,
        action,
        targetType,
        targetId: targetId.slice(0, 255),
        traceId: this.traceId,
        afterState: detail as Prisma.InputJsonValue,
        reason: `${action} traceId=${this.traceId}`,
      },
    }).catch(err => {
      // fire-and-forget：审计写入失败不应阻塞主流程
      console.error("[L2-CALLBACK] AuditLog 写入失败:", err.message)
    })
  }

  private safeKeys(obj: Record<string, unknown>): string[] {
    try {
      return Object.keys(obj)
    } catch {
      return []
    }
  }
}
```

### 3.3 注入点设计（`src/agents/index.ts`）

在 `runAgent()` 和 `streamAgent()` 中注入 `AuditCallback`：

```typescript
// src/agents/index.ts

import { AuditCallback } from "@/lib/layer2-callback"

export async function runAgent(input, config) {
  const agentInput = buildAgentInput(input)
  const traceId = (input.conversationContext?.traceId as string) || crypto.randomUUID()
  const auditCallback = new AuditCallback(traceId)

  return agent.invoke(agentInput as any, {
    ...config,
    callbacks: [...((config as any)?.callbacks ?? []), auditCallback],
  } as any)
}

export async function streamAgent(input, config) {
  const agentInput = buildAgentInput(input)
  const traceId = (input.conversationContext?.traceId as string) || crypto.randomUUID()
  const auditCallback = new AuditCallback(traceId)

  return agent.stream(agentInput as any, {
    ...config,
    callbacks: [...((config as any)?.callbacks ?? []), auditCallback],
  } as any)
}
```

**关键设计决策**：
1. `traceId` 从 `conversationContext.traceId` 获取（由 `stream/route.ts` 中 `tracer.getTraceId()` 生成），保证与 L1 dev-logger 使用相同的 traceId
2. `callbacks` 数组追加而非覆盖，用户通过 config 传入的其他 callbacks 不受影响
3. `AuditCallback` 在每次 `invoke/stream` 时创建新实例，避免跨请求状态污染

### 3.4 与现有 `wrapNodeWithAudit` 的关系

| 维度 | `wrapNodeWithAudit`（L1 dev-logger） | `AuditCallback`（L2 运行时审计） |
|------|--------------------------------------|----------------------------------|
| 触发方式 | 手动包装每个节点 | 自动通过 `config.callbacks` 注入 |
| 输出通道 | console + file | console + file + **AuditLog DB 表** |
| 覆盖范围 | 仅节点（LLM/Tool 在节点内部，不在 wrapper 中） | 节点 + LLM + Tool 全覆盖 |
| 生命周期 | `NODE_ENV=development` 时触发 | 始终触发 |
| 是否移除 | **不移除** — 继续服务 L1 | **新增** — 服务 L2 |

**两者共存，互不干扰**：
- L1 `wrapNodeWithAudit` 继续记录 console + file（开发调试用）
- L2 `AuditCallback` 新增 AuditLog DB 写入（运行时审计，前端可查询）
- L2 的 DB 写入与 L1 的 `auditNodeEvent()` 写入**不重复**：L1 写 `NODE_START_{name}` / `NODE_END_{name}`（手动），L2 写同名 action（callback 自动）。实际合并后只需保留一个来源，建议**保留 L2 的 callback 版本，移除 L1 的 `auditNodeEvent()` DB 写入**（L1 保留 console + file）。

---

## 四、实施步骤 + 依赖图

```
Task 1 (阅读现有代码) ──┐
                         │
                         ▼
Task 2 (创建 layer2-callback.ts)  ← 核心文件
                         │
                         ▼
Task 3 (修改 agents/index.ts 注入 callbacks)
                         │
                         ▼
Task 4 (修改 agent-audit-logger.ts 添加辅助方法)
                         │
                         ▼
Task 5 (编译检查)
```

### Step 0: 文档先行（已在本文档中执行）

~~无需额外更新 `project_rules.md`——ADD-0.3 占位章节已在原始 plan 中创建，本次方向修正不涉及规则变更。~~

### Step 1: 阅读现有代码

- 阅读 `src/agents/index.ts` 中的 `wrapNodeWithAudit` 和 `auditNodeEvent` 实现
- 阅读 `src/lib/agent-audit-logger.ts` 中的 `writeAuditLog` 函数签名
- 阅读 `@langchain/core` 中 `BaseCallbackHandler` 的 TS 类型定义（`node_modules/@langchain/core/dist/callbacks/base.d.ts`）
- 理解 `agent.invoke()` 和 `agent.stream()` 的 `config.callbacks` 参数结构

### Step 2: 创建 `src/lib/layer2-callback.ts`

- 实现 `AuditCallback extends BaseCallbackHandler` 类
- 覆盖 6 个钩子：`handleChainStart/End/Error`、`handleLLMEnd`、`handleToolStart/End/Error`
- 内部 `writeAuditLog()` 方法 fire-and-forget（`.catch()` 不抛异常）
- `AGENT_NODE_NAMES` Set 过滤 LangGraph 节点（排除 RunnableSequence 等内部 chain）
- `nodeStartTimes` Map 计算每个节点的 `durationMs`

### Step 3: 修改 `src/agents/index.ts`

- 在 `runAgent()` 中注入 `AuditCallback` 到 `config.callbacks`
- 在 `streamAgent()` 中注入 `AuditCallback` 到 `config.callbacks`
- 从 `input.conversationContext.traceId` 获取 traceId（与 L1 共享）
- callbacks 数组追加而非覆盖

### Step 4: 修改 `src/lib/agent-audit-logger.ts`

- 新增 `writeAuditLogFromCallback()` 辅助函数（如果 `AuditCallback` 的 `writeAuditLog` 方法需要复用外部逻辑）
- 实际上 `AuditCallback` 内部直接调用 `prisma.auditLog.create()` 已经足够，agent-audit-logger.ts 只需确认 `writeAuditLog` 函数的签名与 callback 的调用方式兼容
- 如果 callback 类在 `layer2-callback.ts` 中自包含（不依赖 agent-audit-logger.ts），则此步骤可精简为验证兼容性

### Step 5: 编译验证

- `npx tsc --noEmit` 通过
- 无 `any` 类型逃逸

---

## 五、验收标准

- [ ] `src/lib/layer2-callback.ts` 已创建，`AuditCallback extends BaseCallbackHandler` 编译通过
- [ ] `src/agents/index.ts` 中 `runAgent()` 和 `streamAgent()` 已注入 `AuditCallback`
- [ ] 发送聊天消息后 `query_audit_logs({ targetType: "AGENT_NODE" })` 返回 `NODE_START_*` / `NODE_END_*` 记录
- [ ] LLM 调用后 `query_audit_logs({ targetType: "AGENT_LLM" })` 返回 `AGENT_LLM_CALL` 记录（含 tokenUsage）
- [ ] Tool 调用后 `query_audit_logs({ targetType: "AGENT_TOOL" })` 返回 `AGENT_TOOL_START_*` / `AGENT_TOOL_END` 记录
- [ ] 失败路径：模拟节点异常后 AuditLog 有 `NODE_ERROR_*` 记录（ADD-6）
- [ ] `npx tsc --noEmit` 编译通过
- [ ] 现有 L1 dev-logger（`wrapNodeWithAudit` console + file）不受影响

---

## 六、与知识库域的关系

知识库 API Route（upload/delete/sync）的 Layer 2 审计使用 **HTTP 层方案**（如 `withRuntimeAudit()` 或 milktea 风格的 Express 中间件），属于**独立于本 Plan 的后续工作**。Agent 域和知识库域是两个不同的横切面：

| 域 | 横切位置 | 技术方案 | 本轮覆盖 |
|----|---------|---------|---------|
| Agent 域 | `agent.invoke/stream` 的 config.callbacks | `BaseCallbackHandler` | ✅ |
| 知识库域 | HTTP API Route 的请求/响应 | `withRuntimeAudit()` 或 Next.js middleware | ❌（后续独立 Plan） |

---

## 七、关联文档

| 文档 | 路径 |
|------|------|
| Handoff | `.trae/plans/farm-agent-layer2-cross-cutting-handoff.md` |
| Review | `.trae/reviews/farm-agent-layer2-cross-cutting-review-v1.md` |
| Spec | `.trae/specs/farm-agent-layer2-cross-cutting/spec.md` |
| Tasks | `.trae/specs/farm-agent-layer2-cross-cutting/tasks.md` |
| Checklist | `.trae/specs/farm-agent-layer2-cross-cutting/checklist.md` |
| Round 7 Plan (消费方) | `.trae/plans/...`（待创建） |
