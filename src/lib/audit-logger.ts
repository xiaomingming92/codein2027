import * as fs from "fs/promises"
import * as path from "path"

const PREFIX = "[KB-AUDIT]"

const LOG_DIR = process.env.KB_LOG_DIR || path.join(process.cwd(), "logs", "knowledge-base")
const LOG_FILE = process.env.KB_LOG_FILE || "kb-audit.log"
const ENABLE_FILE_LOG = process.env.KB_ENABLE_FILE_LOG === "true" || process.env.NODE_ENV === "development"

type AuditPhase =
  | "SYNC_START"
  | "SCAN"
  | "DETECT_CHANGES"
  | "PHASE_ADDED"
  | "PHASE_MODIFIED"
  | "PHASE_DELETED"
  | "PHASE_KNOWLEDGE_UPDATE"
  | "PHASE_RETRY"
  | "PHASE_TAG_BACKFILL"
  | "SYNC_DONE"
  | "VECTORIZE_START"
  | "VECTORIZE_CHUNK"
  | "VECTORIZE_DONE"
  | "VECTORIZE_FAIL"
  | "DOC_TAG_SYNC"
  | "DOC_TAG_PATCH"
  | "DOC_PARSE_START"
  | "DOC_PARSE_DONE"
  | "DOC_PARSE_ERROR"
  | "DOC_PROGRESS_START"
  | "DOC_PROGRESS_FILE_READ"
  | "DOC_PROGRESS_VECTORIZE"
  | "DOC_PROGRESS_DONE"
  | "DOC_PROGRESS_FAIL"
  | "UPLOAD_START"
  | "UPLOAD_DEDUP"
  | "UPLOAD_VERSION"
  | "UPLOAD_FILE_SAVE"
  | "UPLOAD_DB_CREATE"
  | "UPLOAD_DONE"
  | "UPLOAD_FAIL"

async function ensureLogDir(): Promise<void> {
  if (!ENABLE_FILE_LOG) return
  try {
    await fs.mkdir(LOG_DIR, { recursive: true })
  } catch {
    // Ignore error if directory already exists
  }
}

async function writeToFile(message: string): Promise<void> {
  if (!ENABLE_FILE_LOG) return
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.appendFile(logPath, message + "\n", "utf-8")
  } catch (error) {
    console.error("[KB-AUDIT] Failed to write to log file:", error)
  }
}

function formatMessage(phase: AuditPhase, detail: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const extraStr = extra ? ` | ${JSON.stringify(extra)}` : ""
  return `${PREFIX} [${ts}] [${phase}] ${detail}${extraStr}`
}

export function audit(phase: AuditPhase, detail: string, extra?: Record<string, unknown>) {
  const message = formatMessage(phase, detail, extra)
  console.log(message)
  writeToFile(message)
}

export function auditDoc(
  phase: AuditPhase,
  fileName: string,
  docId: string,
  detail: string,
  extra?: Record<string, unknown>
) {
  audit(phase, `📄 ${fileName} (${docId}) → ${detail}`, extra)
}

export function auditPhaseStart(phase: AuditPhase, description: string, count?: number) {
  const countStr = count !== undefined ? ` (${count}个)` : ""
  const message = `${PREFIX} ═══ [${phase}] 开始${countStr}: ${description} ═══`
  console.log(message)
  writeToFile(message)
}

export function auditPhaseEnd(phase: AuditPhase, detail: string) {
  const message = `${PREFIX} ═══ [${phase}] 结束: ${detail} ═══`
  console.log(message)
  writeToFile(message)
}

export function auditToken(docName: string, chunkIndex: number, estimatedTokens: number, chunkMs: number) {
  audit("VECTORIZE_CHUNK",
    `块#${chunkIndex} ${docName}`,
    { tokens_estimated: estimatedTokens, duration_ms: chunkMs }
  )
}

export function auditSummary(docName: string, totalTokens: number, totalMs: number, vectorCount: number) {
  audit("VECTORIZE_DONE",
    `${docName} 完成`,
    { total_tokens_estimated: totalTokens, total_duration_ms: totalMs, vectors: vectorCount }
  )
}

export function auditDocParseStart(fileName: string, fileType: string, fileSize?: number) {
  audit("DOC_PARSE_START", `📄 ${fileName}`, {
    type: fileType,
    size: fileSize,
  })
}

export function auditDocParseDone(
  fileName: string,
  fileType: string,
  durationMs: number,
  extra?: Record<string, unknown>
) {
  audit("DOC_PARSE_DONE", `📄 ${fileName} (${durationMs}ms)`, {
    type: fileType,
    duration_ms: durationMs,
    ...extra,
  })
}

export function auditDocParseError(
  fileName: string,
  fileType: string,
  error: unknown,
  durationMs: number,
  extra?: Record<string, unknown>
) {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorStack = error instanceof Error ? error.stack?.split("\n").slice(0, 3).join(" | ") : undefined
  audit("DOC_PARSE_ERROR", `📄 ${fileName} 解析失败: ${errorMessage}`, {
    type: fileType,
    error: errorMessage,
    stack: errorStack,
    duration_ms: durationMs,
    ...extra,
  })
}

export async function getLogPath(): Promise<string> {
  await ensureLogDir()
  return path.join(LOG_DIR, LOG_FILE)
}

export async function readRecentLogs(lines: number = 100): Promise<string[]> {
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

export async function clearLogs(): Promise<void> {
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.writeFile(logPath, "", "utf-8")
  } catch {
    // Ignore
  }
}
