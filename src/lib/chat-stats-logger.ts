const PREFIX = "[CHAT-STATS-AUDIT]"

const LOG_DIR = "logs/chat-stats"
const LOG_FILE = "chat-stats.log"
const ENABLE_FILE_LOG = typeof process !== "undefined" && (process.env.CHAT_STATS_ENABLE_FILE_LOG === "true" || process.env.NODE_ENV === "development")

const isServer = typeof window === "undefined"

type ChatStatsAuditPhase =
  | "CHAT_STATS_START"
  | "CHAT_STATS_TOKEN_ESTIMATE"
  | "CHAT_STATS_COUNT_UPDATE"
  | "CHAT_STATS_THREAD_UPDATE"
  | "CHAT_STATS_DONE"
  | "CHAT_STATS_FAIL"

async function ensureLogDir(): Promise<void> {
  if (!ENABLE_FILE_LOG || !isServer) return
  try {
    const fs = await import("fs/promises")
    const path = await import("path")
    const dir = path.join(process.cwd(), LOG_DIR)
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // Ignore
  }
}

async function writeToFile(message: string): Promise<void> {
  if (!ENABLE_FILE_LOG || !isServer) return
  try {
    await ensureLogDir()
    const fs = await import("fs/promises")
    const path = await import("path")
    const logPath = path.join(process.cwd(), LOG_DIR, LOG_FILE)
    await fs.appendFile(logPath, message + "\n", "utf-8")
  } catch (error) {
    console.error("[CHAT-STATS-AUDIT] Failed to write to log file:", error)
  }
}

function formatMessage(phase: ChatStatsAuditPhase, detail: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const extraStr = extra ? ` | ${JSON.stringify(extra)}` : ""
  return `${PREFIX} [${ts}] [${phase}] ${detail}${extraStr}`
}

export function chatStatsAudit(phase: ChatStatsAuditPhase, detail: string, extra?: Record<string, unknown>) {
  const message = formatMessage(phase, detail, extra)
  console.log(message)
  writeToFile(message)
}

export function chatStatsAuditPhaseStart(phase: ChatStatsAuditPhase, description: string, count?: number) {
  const countStr = count !== undefined ? ` (${count}个)` : ""
  const message = `${PREFIX} ═══ [${phase}] 开始${countStr}: ${description} ═══`
  console.log(message)
  writeToFile(message)
}

export function chatStatsAuditPhaseEnd(phase: ChatStatsAuditPhase, detail: string) {
  const message = `${PREFIX} ═══ [${phase}] 结束: ${detail} ═══`
  console.log(message)
  writeToFile(message)
}

export async function readChatStatsLogs(lines: number = 100): Promise<string[]> {
  if (!isServer) return []
  try {
    const fs = await import("fs/promises")
    const path = await import("path")
    await ensureLogDir()
    const logPath = path.join(process.cwd(), LOG_DIR, LOG_FILE)
    const content = await fs.readFile(logPath, "utf-8")
    const allLines = content.split("\n").filter(Boolean)
    return allLines.slice(-lines)
  } catch {
    return []
  }
}

export async function clearChatStatsLogs(): Promise<void> {
  if (!isServer) return
  try {
    const fs = await import("fs/promises")
    const path = await import("path")
    await ensureLogDir()
    const logPath = path.join(process.cwd(), LOG_DIR, LOG_FILE)
    await fs.writeFile(logPath, "", "utf-8")
  } catch {
    // Ignore
  }
}
