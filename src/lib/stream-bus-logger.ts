import * as fs from "fs/promises"
import * as path from "path"
import { prisma } from "@/lib/prisma"

const PREFIX = "[STREAM-BUS-AUDIT]"

const LOG_DIR = process.env.STREAM_BUS_LOG_DIR || path.join(process.cwd(), "logs", "stream-bus")
const LOG_FILE = process.env.STREAM_BUS_LOG_FILE || "stream-bus.log"
const ENABLE_FILE_LOG = process.env.STREAM_BUS_ENABLE_FILE_LOG === "true" || process.env.NODE_ENV === "development"

export type StreamBusAuditPhase =
  | "STREAM_BUS_REGISTER"
  | "STREAM_BUS_UNREGISTER"
  | "STREAM_BUS_EMIT"
  | "STREAM_BUS_EMIT_RAG_SEARCH"
  | "STREAM_BUS_EMIT_EVIDENCE"
  | "STREAM_BUS_EMIT_RAG_RESULT"
  | "STREAM_BUS_EMIT_TOKEN"
  | "STREAM_BUS_EMIT_STRUCTURED"
  | "STREAM_BUS_EMIT_DONE"
  | "STREAM_BUS_EMIT_ERROR"

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

function formatMessage(phase: StreamBusAuditPhase, detail: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const extraStr = extra ? ` | ${JSON.stringify(extra)}` : ""
  return `${PREFIX} [${ts}] [${phase}] ${detail}${extraStr}`
}

export function streamBusAudit(phase: StreamBusAuditPhase, detail: string, extra?: Record<string, unknown>) {
  const message = formatMessage(phase, detail, extra)
  console.log(message)
  writeToFile(message)
  prisma.auditLog
    .create({
      data: {
        userId: "ai-assistant",
        action: phase,
        targetType: "STREAM_TRACE",
        targetId: phase,
        reason: detail,
        afterState: extra ? JSON.stringify(extra) : undefined,
      },
    })
    .catch(() => {})
}

export function streamBusAuditPhaseStart(phase: StreamBusAuditPhase, description: string, count?: number) {
  const countStr = count !== undefined ? ` (${count}个)` : ""
  const message = `${PREFIX} ═══ [${phase}] 开始${countStr}: ${description} ═══`
  console.log(message)
  writeToFile(message)
  prisma.auditLog
    .create({
      data: {
        userId: "ai-assistant",
        action: phase,
        targetType: "STREAM_TRACE",
        targetId: phase,
        reason: `开始${countStr}: ${description}`,
      },
    })
    .catch(() => {})
}

export function streamBusAuditPhaseEnd(phase: StreamBusAuditPhase, detail: string) {
  const message = `${PREFIX} ═══ [${phase}] 结束: ${detail} ═══`
  console.log(message)
  writeToFile(message)
  prisma.auditLog
    .create({
      data: {
        userId: "ai-assistant",
        action: phase,
        targetType: "STREAM_TRACE",
        targetId: phase,
        reason: `结束: ${detail}`,
      },
    })
    .catch(() => {})
}

export async function readStreamBusLogs(lines: number = 100): Promise<string[]> {
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

export async function clearStreamBusLogs(): Promise<void> {
  try {
    await ensureLogDir()
    const logPath = path.join(LOG_DIR, LOG_FILE)
    await fs.writeFile(logPath, "", "utf-8")
  } catch {
    // Ignore
  }
}
