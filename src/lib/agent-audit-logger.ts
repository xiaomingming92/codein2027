import * as fs from "fs/promises"
import * as path from "path"

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
}

export function agentAuditResponse(threadId: string | undefined, durationMs: number, verdictType?: string, messageCount?: number) {
  agentAudit("CHAT_RESPONSE", `响应完成 thread=${threadId || "new"}`, {
    threadId: threadId || "new",
    durationMs,
    verdictType: verdictType || "none",
    messageCount: messageCount || 0,
  })
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
