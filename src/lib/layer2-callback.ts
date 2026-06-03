// Layer 2 运行时审计：AuditCallback extends BaseCallbackHandler
// 自动捕获 LangGraph 所有节点/LLM/Tool 生命周期事件 → AuditLog 表
//
// 注入方式（src/agents/index.ts）：
//   const callback = new AuditCallback(traceId, userId)
//   agent.invoke(input, { callbacks: [callback] })
//
// 与 wrapNodeWithAudit（L1 dev-logger）共存，互补不冲突。
// L1: console + file（仅 dev）
// L2: AuditCallback → AuditLog 表（始终）
//
import { BaseCallbackHandler } from "@langchain/core/callbacks/base"
import type { Serialized } from "@langchain/core/load/serializable"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

// Agent 节点名称集合——仅这些节点的生命周期事件写入 AuditLog
// 内部 chain（RunnableSequence/RunnableLambda 等）不会命中此集合，自动过滤
const AGENT_NODE_NAMES = new Set([
  "intention",
  "retrieval",
  "reasoning",
  "interactionPointDetection",
  "verdict",
  "response",
])

// ─── 类型定义 ───

/** handleChainStart 传入的 Serialized 结构（LangChain 标准） */
interface ChainSerialized {
  lc: number
  type: string
  id: string[]
  kwargs: Record<string, unknown>
}

/** handleLLMEnd 传入的 tokenUsage 结构 */
interface TokenUsageRecord {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  [key: string]: unknown
}

// ─── AuditCallback ───

export class AuditCallback extends BaseCallbackHandler {
  name = "AuditCallback"

  private traceId: string
  private userId: string
  /** runId → { nodeName, startTime } — 用于 handleChainEnd/handleChainError 计算耗时 */
  private nodeContext = new Map<string, { nodeName: string; startTime: number }>()

  constructor(traceId: string, userId: string) {
    super()
    this.traceId = traceId
    this.userId = userId
  }

  // ═══════════════════════════════════════════════════
  //  Chain 事件（节点生命周期）
  // ═══════════════════════════════════════════════════

  async handleChainStart(
    chain: Serialized,
    _inputs: Record<string, unknown>,
    runId: string,
    _runType?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string,
    _parentRunId?: string,
    _extra?: Record<string, unknown>,
  ): Promise<void> {
    const nodeName = this.extractNodeName(chain as unknown as ChainSerialized, runName)
    if (!nodeName) return

    this.nodeContext.set(runId, { nodeName, startTime: Date.now() })
    await this.writeAudit(`NODE_START_${nodeName}`, "AGENT_NODE", nodeName)
  }

  async handleChainEnd(
    outputs: Record<string, unknown>,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _kwargs?: { inputs: Record<string, unknown> },
  ): Promise<void> {
    const ctx = this.nodeContext.get(runId)
    if (!ctx) return // 非 Agent 节点（内部 chain），跳过

    this.nodeContext.delete(runId)
    const durationMs = Date.now() - ctx.startTime

    const outputKeys = Object.keys(outputs)
    const outputSummary: Record<string, unknown> = {}
    // 仅采样轻量字段，避免大对象写入 DB
    for (const key of outputKeys.slice(0, 3)) {
      const val = outputs[key]
      if (typeof val === "string") {
        outputSummary[key] = val.length > 200 ? val.slice(0, 200) + "..." : val
      } else if (typeof val === "number" || typeof val === "boolean") {
        outputSummary[key] = val
      }
    }

    await this.writeAudit(`NODE_END_${ctx.nodeName}`, "AGENT_NODE", ctx.nodeName, {
      durationMs,
      outputKeys,
      outputSampling: outputSummary,
    })
  }

  async handleChainError(
    err: Error,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _kwargs?: { inputs: Record<string, unknown> },
  ): Promise<void> {
    const ctx = this.nodeContext.get(runId)
    const durationMs = ctx ? Date.now() - ctx.startTime : undefined
    const nodeName = ctx?.nodeName || "unknown_node"
    this.nodeContext.delete(runId)

    await this.writeAudit(`NODE_ERROR_${nodeName}`, "AGENT_NODE", nodeName, {
      error: err.message,
      durationMs,
    })
  }

  // ═══════════════════════════════════════════════════
  //  LLM 事件
  // ═══════════════════════════════════════════════════

  async handleLLMEnd(
    output: { generations?: unknown[]; llmOutput?: Record<string, unknown> },
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _extraParams?: Record<string, unknown>,
  ): Promise<void> {
    const tokenUsage: TokenUsageRecord | undefined =
      (output.llmOutput?.tokenUsage as TokenUsageRecord) ||
      (output.llmOutput?.usage as TokenUsageRecord)
    const generationCount = output.generations?.length ?? 0
    const totalTokens = tokenUsage?.totalTokens ?? 0

    await this.writeAudit("AGENT_LLM_CALL", "AGENT_LLM", this.traceId, {
      generationCount,
      totalTokens,
      promptTokens: tokenUsage?.promptTokens,
      completionTokens: tokenUsage?.completionTokens,
    })
  }

  // ═══════════════════════════════════════════════════
  //  Tool 事件
  // ═══════════════════════════════════════════════════

  async handleToolStart(
    _tool: Serialized,
    input: string,
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string,
    _toolCallId?: string,
  ): Promise<void> {
    const toolName = runName || "unknown_tool"
    await this.writeAudit(`AGENT_TOOL_START_${toolName}`, "AGENT_TOOL", toolName, {
      inputPreview: input.slice(0, 300),
      inputLength: input.length,
    })
  }

  async handleToolEnd(
    output: unknown,
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
  ): Promise<void> {
    const outputStr = typeof output === "string" ? output : JSON.stringify(output)
    await this.writeAudit("AGENT_TOOL_END", "AGENT_TOOL", this.traceId, {
      outputLength: outputStr.length,
      outputPreview: outputStr.slice(0, 300),
    })
  }

  async handleToolError(
    err: Error,
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
  ): Promise<void> {
    await this.writeAudit("AGENT_TOOL_ERROR", "AGENT_TOOL", this.traceId, {
      error: err.message,
    })
  }

  // ═══════════════════════════════════════════════════
  //  私有方法
  // ═══════════════════════════════════════════════════

  /**
   * 从 chain 序列化信息中提取 Agent 节点名。
   * LangGraph 运行时将节点包装为子 chain，其 runName 格式为 "graph:step:{nodeName}"。
   * 只有命中了 AGENT_NODE_NAMES 集合的才返回节点名，其余返回 null（过滤）。
   */
  private extractNodeName(chain: ChainSerialized, runName?: string): string | null {
    // 优先使用 runName（LangGraph algo.js: manager.getChild(`graph:step:${step}`) 设置）
    if (runName) {
      const match = runName.match(/graph:step:(.+)/)
      if (match) {
        const candidate = match[1]
        return AGENT_NODE_NAMES.has(candidate) ? candidate : null
      }
      // 直接命中（非 LangGraph 嵌套 chain）
      if (AGENT_NODE_NAMES.has(runName)) return runName
    }

    // 后备：从 chain.id 数组提取（LangChain 内部标识）
    if (chain.id && Array.isArray(chain.id)) {
      for (const id of chain.id) {
        if (typeof id === "string" && AGENT_NODE_NAMES.has(id)) {
          return id
        }
      }
    }

    return null
  }

  /**
   * 写入 AuditLog 表（fire-and-forget）。
   * 不抛异常、不阻塞管线——审计失败不应影响业务。
   */
  private async writeAudit(
    action: string,
    targetType: string,
    targetId: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const data: {
        userId: string
        action: string
        targetType: string
        targetId: string
        traceId: string
        afterState?: Prisma.InputJsonValue
        reason?: string
      } = {
        userId: this.userId,
        action,
        targetType,
        targetId: targetId.slice(0, 255),
        traceId: this.traceId,
        reason: `${action} traceId=${this.traceId}`,
      }

      if (extra) {
        data.afterState = JSON.parse(JSON.stringify(extra)) as Prisma.InputJsonValue
      }

      await prisma.auditLog.create({ data })
    } catch (error) {
      // 审计失败不阻塞管线，仅 console 记录
      console.error("[LAYER2-CALLBACK] AuditLog write failed:", error instanceof Error ? error.message : String(error))
    }
  }
}
