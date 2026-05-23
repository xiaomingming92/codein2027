const PREFIX = "[MODEL-CONFIG-AUDIT]"

const LOG_DIR = "logs/model-config"
const LOG_FILE = "model-config.log"
const ENABLE_FILE_LOG = typeof process !== "undefined" && (process.env.MODEL_CONFIG_ENABLE_FILE_LOG === "true" || process.env.NODE_ENV === "development")

const isServer = typeof window === "undefined"

type ModelConfigAuditPhase =
  | "MODEL_CONFIG_START"
  | "MODEL_CONFIG_FETCH"
  | "MODEL_CONFIG_APPLY"
  | "MODEL_CONFIG_LLM_RESET"
  | "MODEL_CONFIG_AGENT_INVOKE"
  | "MODEL_CONFIG_TEST_CONNECT"
  | "MODEL_CONFIG_TEST_INVOKE"
  | "MODEL_CONFIG_DONE"
  | "MODEL_CONFIG_FAIL"

export type ModelConfigAuditData = {
  startedAt: string
  previousModel: string
  newModel: string
  provider: string
  baseURL: string
  llmResetDurationMs: number
  totalDurationMs: number
  completedAt?: string
  error?: string
}

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
    console.error("[MODEL-CONFIG-AUDIT] Failed to write to log file:", error)
  }
}

function formatMessage(phase: ModelConfigAuditPhase, detail: string, extra?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const extraStr = extra ? ` | ${JSON.stringify(extra)}` : ""
  return `${PREFIX} [${ts}] [${phase}] ${detail}${extraStr}`
}

export function modelConfigAudit(phase: ModelConfigAuditPhase, detail: string, extra?: Record<string, unknown>) {
  const message = formatMessage(phase, detail, extra)
  console.log(message)
  writeToFile(message)
}

export function modelConfigAuditPhaseStart(phase: ModelConfigAuditPhase, description: string) {
  const message = `${PREFIX} ═══ [${phase}] 开始: ${description} ═══`
  console.log(message)
  writeToFile(message)
}

export function modelConfigAuditPhaseEnd(phase: ModelConfigAuditPhase, detail: string) {
  const message = `${PREFIX} ═══ [${phase}] 结束: ${detail} ═══`
  console.log(message)
  writeToFile(message)
}

export async function readModelConfigLogs(lines: number = 100): Promise<string[]> {
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

export async function clearModelConfigLogs(): Promise<void> {
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
