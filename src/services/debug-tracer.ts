// Layer 1 开发审计：Debug Tracer
// 在 NODE_ENV=development 时收集节点级详细 trace → 文件 + 微调数据导出 API
//
// 用途：
//   - 开发者查看每个节点的 input/output/裁决细节
//   - AI 微调数据导出（prompt/response 对 + quality 标签）
//
import * as fs from "fs/promises"
import * as path from "path"

const LOG_DIR = path.join(process.cwd(), "logs", "debug")

// ─── 类型定义 ───

export interface DebugTraceNode {
  nodeName: string
  startTime: number
  endTime: number
  durationMs: number
  inputSummary: Record<string, unknown>
  outputSummary: Record<string, unknown>
}

export interface DebugTrace {
  traceId: string
  threadId: string
  startTime: number
  endTime: number
  totalDurationMs: number
  userInput: string
  nodes: DebugTraceNode[]
}

export interface FineTuningRecord {
  messages: Array<{ role: string; content: string }>
  labels: {
    quality_score?: number
    strategy?: string
    intent?: string
  }
}

// ─── 模块状态 ───

const enabled = process.env.NODE_ENV === "development"

// ─── 文件操作 ───

async function ensureLogDir(threadId: string): Promise<string> {
  if (!enabled) return ""
  const dir = path.join(LOG_DIR, threadId)
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // Ignore
  }
  return dir
}

// ─── 公开 API ───

export function captureNode(
  traceId: string,
  threadId: string,
  node: DebugTraceNode,
): void {
  if (!enabled) return
  const dir = path.join(LOG_DIR, threadId)
  const filePath = path.join(dir, `${traceId}.json`)
  // 追加模式：每个节点一行 JSON（便于流式读取）
  fs.mkdir(dir, { recursive: true })
    .then(() => fs.appendFile(filePath, JSON.stringify(node) + "\n", "utf-8"))
    .catch(() => {})
}

export async function finalizeTrace(
  trace: DebugTrace,
): Promise<void> {
  if (!enabled) return
  try {
    const dir = await ensureLogDir(trace.threadId)
    const filePath = path.join(dir, `${trace.traceId}_summary.json`)
    await fs.writeFile(filePath, JSON.stringify(trace, null, 2), "utf-8")
  } catch {
    // 写入失败不阻塞请求
  }
}

export async function exportFineTuningData(
  threadId: string,
  traceId?: string,
): Promise<FineTuningRecord[]> {
  if (!enabled) return []
  try {
    const dir = path.join(LOG_DIR, threadId)
    const files = await fs.readdir(dir).catch(() => [] as string[])

    const records: FineTuningRecord[] = []
    for (const file of files) {
      if (traceId && !file.startsWith(traceId)) continue
      if (!file.endsWith("_summary.json")) continue

      const content = await fs.readFile(path.join(dir, file), "utf-8")
      const trace: DebugTrace = JSON.parse(content)

      // 提取对话消息和标签
      records.push({
        messages: [
          { role: "user", content: trace.userInput },
          // response 节点 output 可能包含 LLM 输出
        ],
        labels: {
          quality_score: undefined,
          strategy: undefined,
          intent: undefined,
        },
      })
    }
    return records
  } catch {
    return []
  }
}

export function isDebugEnabled(): boolean {
  return enabled
}
