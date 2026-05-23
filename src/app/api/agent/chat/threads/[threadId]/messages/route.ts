import { NextRequest, NextResponse } from "next/server"
import { chatPersistence } from "@/services/chat-persistence"
import { chatPersistAudit, chatPersistAuditPhaseStart, chatPersistAuditPhaseEnd } from "@/lib/chat-persistence-logger"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params

  chatPersistAuditPhaseStart("REHYDRATE_LOAD_MESSAGES", `加载线程消息: threadId=${threadId}`)
  try {
    const messages = await chatPersistence.getThreadMessages(threadId)
    chatPersistAuditPhaseEnd("REHYDRATE_LOAD_MESSAGES", `加载${messages.length}条消息`)

    return NextResponse.json({
      success: true,
      data: messages.map((m) => ({
        id: m.id,
        role: m.role.toLowerCase(),
        content: m.content,
        metadata: m.metadata,
        traceId: m.traceId,
        createdAt: m.createdAt,
      })),
    })
  } catch (error) {
    chatPersistAudit("REHYDRATE_FAIL", "消息加载失败", {
      threadId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
