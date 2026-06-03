// Layer 1 Debug API Route
// GET /api/agent/chat/threads/[threadId]/debug?traceId=xxx&format=json|fine-tuning
//
// 仅在 NODE_ENV=development 时启用。
// 提供节点级 trace 数据和微调数据导出。
//
import { NextRequest, NextResponse } from "next/server"
import { exportFineTuningData, isDebugEnabled } from "@/services/debug-tracer"
import * as fs from "fs/promises"
import * as path from "path"

const LOG_DIR = path.join(process.cwd(), "logs", "debug")

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
): Promise<NextResponse> {
  if (!isDebugEnabled()) {
    return NextResponse.json(
      { error: "Debug API only available in development mode" },
      { status: 404 },
    )
  }

  const { threadId } = await params
  const searchParams = request.nextUrl.searchParams
  const traceId = searchParams.get("traceId") || undefined
  const format = searchParams.get("format") || "json"

  try {
    if (format === "fine-tuning") {
      const records = await exportFineTuningData(threadId, traceId)
      return NextResponse.json({ records, count: records.length })
    }

    // format=json: 返回原始 trace 文件内容
    const dir = path.join(LOG_DIR, threadId)
    const files = await fs.readdir(dir).catch(() => [] as string[])
    const traces: unknown[] = []

    for (const file of files) {
      if (traceId && !file.startsWith(traceId)) continue
      if (!file.endsWith("_summary.json") && !file.endsWith(".json")) continue

      const content = await fs.readFile(path.join(dir, file), "utf-8")
      if (file.endsWith("_summary.json")) {
        traces.push(JSON.parse(content))
      } else {
        // 逐行 JSON（节点 trace 流）
        traces.push(...content.split("\n").filter(Boolean).map((l) => JSON.parse(l)))
      }
    }

    return NextResponse.json({ traces, count: traces.length })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to read debug traces", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
