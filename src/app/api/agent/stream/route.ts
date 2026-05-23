import { NextRequest } from "next/server"
import type { ChatRequest } from "@/dto/agent.dto"
import { agentAuditRequest, agentAuditResponse, agentAuditError } from "@/lib/agent-audit-logger"
import { randomUUID } from "crypto"

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let threadId: string

  try {
    const body: ChatRequest = await request.json()
    const { messages, user, project, threadId: tid } = body
    threadId = tid || randomUUID()

    const lastMsg = messages[messages.length - 1]
    const preview = typeof lastMsg?.content === "string" ? lastMsg.content : JSON.stringify(lastMsg?.content)
    agentAuditRequest(threadId, messages.length, preview)

    const { streamAgent } = await import("@/agents")

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await streamAgent({ messages, user, project } as any, { configurable: { thread_id: threadId } })

    const encoder = new TextEncoder()
    const streamResp = new ReadableStream({
      async start(controller) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for await (const chunk of stream as any) {
          if (chunk.messages && chunk.messages.length > 0) {
            const lastMsg = chunk.messages[chunk.messages.length - 1]
            controller.enqueue(encoder.encode(JSON.stringify(lastMsg) + "\n"))
          }
        }
        const durationMs = Date.now() - startTime
        agentAuditResponse(threadId, durationMs, "stream", undefined)
        controller.close()
      },
    })

    return new Response(streamResp, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    agentAuditError(threadId!, error, "stream/route.ts")
    console.error("Agent stream error:", error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
