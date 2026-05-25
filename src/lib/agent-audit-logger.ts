import * as fs from "fs/promises"
import * as path from "path"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"

const PREFIX = "[AGENT-AUDIT]"

const LOG_DIR = process.env.AGENT_LOG_DIR || path.join(process.cwd(), "logs", "agent")
const LOG_FILE = process.env.AGENT_LOG_FILE || "agent-audit.log"
const ENABLE_FILE_LOG = process.env.AGENT_ENABLE_FILE_LOG === "true" || process.env.NODE_ENV === "development"

type AgentAuditPhase =
  | "CHAT_REQUEST"
  | "CHAT_RESPONSE"
  | "CHAT_ERROR"
  | "LLM_CALL"
  | "LLM_ERROR"
  | "NODE_START"
  | "NODE_END"
  | "NODE_ERROR"
  | "ROUTE"
  | "RETRIEVAL_RESULT"
  | "RAG_SEARCH"
  | "RAG_SEARCH_FAIL"
  | "RAG_ZERO_RESULTS"
  | "RAG_EMPTY"

// ──── Layer 2 运行时审计（始终开启，写入 AuditLog 表）────

let currentUserId: string | undefined
let currentTraceId: string | undefined

export function setAuditContext(userId: string, traceId: string) {
  currentUserId = userId
  currentTraceId = traceId
}

export function clearAuditContext() {
  currentUserId = undefined
  currentTraceId = undefined
}

async function writeAuditLog(
  action: string,
  targetType: string,
  targetId: string,
  extra?: Record<string, unknown>,
  reason?: string
): Promise<void> {
  if (!currentUserId) return
  try {
    await prisma.auditLog.create({
      data: {
        userId: currentUserId,
        action,
        targetType,
        targetId: targetId.slice(0, 255),
        traceId: currentTraceId,
        afterState: extra ? (JSON.parse(JSON.stringify(extra)) as Prisma.InputJsonValue) : undefined,
        reason,
      },
    })
  } catch (error) {
    console.error("[AGENT-AUDIT] Failed to write AuditLog to DB:", error)
  }
}

async function ensureLogDir(): Promise<void> {
  if (!ENABLE_FILE_LOG) return
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
  } catch {
    // Ignore
  }
}

async function writeToFile(message: string): Promise<void> {
  if (!ENABLE_FILE_LOG) return
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.appendFile(logPath, message + "\n", "utf-8")
  } catch (error) {
    console.error("[AGENT-AUDIT] Failed to write to log file:", error)
  }
}

function formatMessage(phase: AgentAuditPhase, detail: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const extraStr = extra ? ` | ${JSON.stringify(extra)}` : ""
  return `${PREFIX} [${ts}] [${phase}] ${detail}${extraStr}`
}

export function agentAudit(phase: AgentAuditPhase, detail: string, extra?: Record<string, unknown>) {
  const message = formatMessage(phase, detail, extra)
  console.log(message)
  writeToFile(message)
}

export function agentAuditRequest(threadId: string | undefined, messageCount: number, userMessagePreview: string) {
  agentAudit("CHAT_REQUEST", `请求进入 thread=${threadId || "new"}`, {
    threadId: threadId || "new",
    messageCount,
    preview: userMessagePreview.slice(0, 100),
  })
  writeAuditLog(
    "CHAT_REQUEST",
    "AGENT_SESSION",
    threadId || "new",
    { messageCount, preview: userMessagePreview.slice(0, 100) },
    "用户发起新对话请求"
  )
}

export function agentAuditResponse(threadId: string | undefined, durationMs: number, verdictType?: string, messageCount?: number) {
  agentAudit("CHAT_RESPONSE", `响应完成 thread=${threadId || "new"}`, {
    threadId: threadId || "new",
    durationMs,
    verdictType: verdictType || "none",
    messageCount: messageCount || 0,
  })
  writeAuditLog(
    "CHAT_RESPONSE",
    "AGENT_SESSION",
    threadId || "new",
    { durationMs, verdictType: verdictType || "none", messageCount: messageCount || 0 },
    `响应完成，耗时 ${durationMs}ms`
  )
}

export function agentAuditError(threadId: string | undefined, error: unknown, context?: string) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack?.split("\n").slice(0, 3).join(" | ") : undefined
  agentAudit("CHAT_ERROR", `请求失败: ${errorMessage}`, {
    threadId: threadId || "new",
    context: context || "unknown",
    error: errorMessage,
    stack: errorStack,
  })
  writeAuditLog(
    "CHAT_ERROR",
    "AGENT_SESSION",
    threadId || "new",
    { context: context || "unknown", error: errorMessage, stack: errorStack },
    `请求失败: ${errorMessage}`
  )
}

export function agentAuditNodeStart(nodeName: string, detail?: string) {
  agentAudit("NODE_START", `▶ ${nodeName}${detail ? `: ${detail}` : ""}`)
}

export function agentAuditNodeEnd(nodeName: string, durationMs: number, detail?: string, extra?: Record<string, unknown>) {
  agentAudit("NODE_END", `✔ ${nodeName} (${durationMs}ms)${detail ? `: ${detail}` : ""}`, {
    durationMs,
    ...extra,
  })
}

export function agentAuditNodeError(nodeName: string, error: unknown, extra?: Record<string, unknown>) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  agentAudit("NODE_ERROR", `✘ ${nodeName} 失败: ${errorMessage}`, {
    error: errorMessage,
    ...extra,
  })
}

export function agentAuditLLMCall(model: string, durationMs: number, inputLength: number, outputLength: number) {
  agentAudit("LLM_CALL", `LLM调用 model=${model}`, {
    model,
    durationMs,
    inputLength,
    outputLength,
  })
}

export function agentAuditLLMError(model: string, error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  agentAudit("LLM_ERROR", `LLM调用失败 model=${model}: ${errorMessage}`, {
    model,
    error: errorMessage,
  })
}

export function agentAuditRoute(fromNode: string, toNode: string, reason: string) {
  agentAudit("ROUTE", `${fromNode} → ${toNode}`, { reason })
}

export function agentAuditRetrieval(query: string, resultCount: number, evidenceCount: number) {
  agentAudit("RETRIEVAL_RESULT", `检索完成`, {
    query: query.slice(0, 100),
    resultCount,
    evidenceCount,
  })
}

// ──── Layer 2 运行时审计专用函数（始终写 AuditLog 表）────

export function agentAuditStrategy(
  strategyId: string,
  thinkingLevel: string,
  intent: string,
  candidateCount: number,
  extra?: Record<string, unknown>
) {
  agentAudit("ROUTE", `策略匹配: ${strategyId} (thinkingLevel=${thinkingLevel}, intent=${intent}, 候选数=${candidateCount})`, {
    strategyId,
    thinkingLevel,
    intent,
    candidateCount,
    ...extra,
  })
  writeAuditLog(
    "STRATEGY_MATCHED",
    "AGENT_STRATEGY",
    strategyId,
    { thinkingLevel, intent, candidateCount, ...extra },
    `策略裁决: thinkingLevel=${thinkingLevel} intent=${intent} → ${strategyId}`
  )
}

export function agentAuditExecutionQuality(
  signals: Array<{ metric: string; severity: number; detail: string }>,
  compositeScore: number,
  adjustment?: Record<string, unknown>
) {
  const signalSummary = signals.map(s => `${s.metric}:${s.severity}`).join(",")
  agentAudit("ROUTE", `执行度评估: score=${compositeScore} signals=[${signalSummary}]`, {
    signals,
    compositeScore,
    adjustment,
  })
  writeAuditLog(
    "EXECUTION_QUALITY",
    "AGENT_SESSION",
    `quality-score:${compositeScore}`,
    { signals, compositeScore, adjustment },
    `执行度: ${compositeScore} (${signalSummary})`
  )
}

export function agentAuditCacheOperation(
  operation: "hit" | "miss" | "set" | "evict",
  cacheKey: string,
  extra?: Record<string, unknown>
) {
  agentAudit("RETRIEVAL_RESULT", `缓存${operation}: ${cacheKey.slice(0, 50)}`, {
    operation,
    cacheKey: cacheKey.slice(0, 50),
    ...extra,
  })
  writeAuditLog(
    `CACHE_${operation.toUpperCase()}`,
    "SEMANTIC_CACHE",
    cacheKey.slice(0, 100),
    { operation, ...extra },
    `语义缓存: ${operation}`
  )
}

export async function getAgentLogPath(): Promise<string> {
  await ensureLogDir()
  return path.join(LOG_DIR, LOG_FILE)
}

export async function readAgentLogs(lines: number = 100): Promise<string[]> {
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

export async function clearAgentLogs(): Promise<void> {
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.writeFile(logPath, "", "utf-8")
  } catch {
    // Ignore
  }
}
