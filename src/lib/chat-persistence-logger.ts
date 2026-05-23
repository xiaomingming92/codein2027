import * as fs from "fs/promises"
import * as path from "path"

const PREFIX = "[CHAT-PERSIST]"

const LOG_DIR = process.env.CHAT_PERSIST_LOG_DIR || path.join(process.cwd(), "logs", "chat-persistence")
const LOG_FILE = process.env.CHAT_PERSIST_LOG_FILE || "chat-persist.log"
const ENABLE_FILE_LOG = process.env.CHAT_PERSIST_ENABLE_FILE_LOG === "true" || process.env.NODE_ENV === "development"

type ChatPersistencePhase =
  | "PERSIST_START"
  | "THREAD_CREATE"
  | "THREAD_LOAD"
  | "THREAD_UPDATE"
  | "THREAD_DELETE"
  | "MESSAGE_SAVE"
  | "MESSAGE_SAVE_CHUNK"
  | "CHAIN_TRACE_SAVE"
  | "PERSIST_DONE"
  | "PERSIST_FAIL"
  | "REHYDRATE_START"
  | "REHYDRATE_LOAD_THREADS"
  | "REHYDRATE_LOAD_MESSAGES"
  | "REHYDRATE_DONE"
  | "REHYDRATE_FAIL"

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

function formatMessage(phase: ChatPersistencePhase, detail: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const extraStr = extra ? ` | ${JSON.stringify(extra)}` : ""
  return `${PREFIX} [${ts}] [${phase}] ${detail}${extraStr}`
}

export function chatPersistAudit(phase: ChatPersistencePhase, detail: string, extra?: Record<string, unknown>) {
  const message = formatMessage(phase, detail, extra)
  console.log(message)
  writeToFile(message)
}

export function chatPersistAuditPhaseStart(phase: ChatPersistencePhase, description: string, count?: number) {
  const countStr = count !== undefined ? ` (${count}个)` : ""
  const message = `${PREFIX} ═══ [${phase}] 开始${countStr}: ${description} ═══`
  console.log(message)
  writeToFile(message)
}

export function chatPersistAuditPhaseEnd(phase: ChatPersistencePhase, detail: string) {
  const message = `${PREFIX} ═══ [${phase}] 结束: ${detail} ═══`
  console.log(message)
  writeToFile(message)
}

export async function getChatPersistLogPath(): Promise<string> {
  await ensureLogDir()
  return path.join(LOG_DIR, LOG_FILE)
}

export async function readChatPersistLogs(lines: number = 100): Promise<string[]> {
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

export async function clearChatPersistLogs(): Promise<void> {
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.writeFile(logPath, "", "utf-8")
  } catch {
    // Ignore
  }
}

export type { ChatPersistencePhase }
