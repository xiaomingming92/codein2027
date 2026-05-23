import { NextRequest, NextResponse } from "next/server"
import { syncKnowledgeBase, getSyncStats } from "@/services/knowledge-sync"

// GET /api/knowledge/sync - 获取同步统计
export async function GET() {
  try {
    const stats = await getSyncStats()
    return NextResponse.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error("Failed to get sync stats:", error)
    return NextResponse.json(
      { success: false, error: "获取同步状态失败" },
      { status: 500 }
    )
  }
}

// POST /api/knowledge/sync - 触发同步
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          const message = `data: ${JSON.stringify(data)}\n\n`
          controller.enqueue(encoder.encode(message))
        } catch {
          // Stream might already be closed
        }
      }

      try {
        send({ type: "start", message: "开始同步知识库..." })

        const result = await syncKnowledgeBase((message, progress) => {
          send({ type: "progress", message, progress })
        })

        send({
          type: "complete",
          success: result.success,
          projectDocAdded: result.projectDocAdded,
          projectDocUpdated: result.projectDocUpdated,
          projectDocDeleted: result.projectDocDeleted,
          projectDocUnchanged: result.projectDocUnchanged,
          knowledgeUpdateIndexed: result.knowledgeUpdateIndexed,
          knowledgeUpdateErrors: result.knowledgeUpdateErrors,
          errorCount: result.errors.length,
          errors: result.errors.slice(0, 10),
        })
      } catch (error) {
        console.error("Sync error:", error)
        send({
          type: "error",
          message: error instanceof Error ? error.message : "同步失败",
        })
      }

      try {
        controller.close()
      } catch {
        // Already closed
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
