import * as fs from "fs/promises"
import * as path from "path"

const PREFIX = "[STREAM-AUDIT]"

const LOG_DIR = process.env.STREAM_AUDIT_LOG_DIR || path.join(process.cwd(), "logs/stream-chat/")
const LOG_FILE = process.env.STREAM_AUDIT_LOG_FILE || "stream-chat.log"
const ENABLE_FILE_LOG = process.env.STREAM_AUDIT_ENABLE_FILE_LOG === "true" || process.env.NODE_ENV === "development"

type StreamChatAuditPhase =
  | "STREAM_START"
  | "TOKEN_CHUNK"
  | "STREAM_DONE"
  | "STREAM_FAIL"

async function ensureLogDir(): Promise<void> {
  if (!ENABLE_FILE_LOG) return
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
  } catch {
    // Ignore if directory already exists
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

function formatMessage(phase: StreamChatAuditPhase, detail: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const extraStr = extra ? ` | ${JSON.stringify(extra)}` : ""
  return `${PREFIX} [${ts}] [${phase}] ${detail}${extraStr}`
}

export function streamChatAudit(phase: StreamChatAuditPhase, detail: string, extra?: Record<string, unknown>) {
  const message = formatMessage(phase, detail, extra)
  console.log(message)
  writeToFile(message)
}

export function streamChatAuditPhaseStart(phase: StreamChatAuditPhase, description: string, count?: number) {
  const countStr = count !== undefined ? ` (${count}个)` : ""
  const message = `${PREFIX} ═══ [${phase}] 开始${countStr}: ${description} ═══`
  console.log(message)
  writeToFile(message)
}

export function streamChatAuditPhaseEnd(phase: StreamChatAuditPhase, detail: string) {
  const message = `${PREFIX} ═══ [${phase}] 结束: ${detail} ═══`
  console.log(message)
  writeToFile(message)
}

export async function readStreamChatLogs(lines: number = 100): Promise<string[]> {
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

export async function clearStreamChatLogs(): Promise<void> {
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.writeFile(logPath, "", "utf-8")
  } catch {
    // Ignore
  }
}
