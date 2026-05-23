import { NextRequest, NextResponse } from "next/server"
import { chatPersistence } from "@/services/chat-persistence"
import { chatPersistAudit, chatPersistAuditPhaseStart, chatPersistAuditPhaseEnd } from "@/lib/chat-persistence-logger"
import { getUserFromRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  const authUser = getUserFromRequest(request)
  const userId = authUser?.userId || request.nextUrl.searchParams.get("userId") || "anonymous"

  chatPersistAuditPhaseStart("REHYDRATE_START", `加载用户线程: userId=${userId}`)
  try {
    const threads = await chatPersistence.getThreadsByUser(userId)
    chatPersistAuditPhaseEnd("REHYDRATE_START", `恢复完成, ${threads.length}个线程`)

    return NextResponse.json({
      success: true,
      data: threads.map((t) => ({
        id: t.id,
        title: t.title,
        intent: t.intent,
        projectId: t.projectId,
        messageCount: t._count.messages,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    })
  } catch (error) {
    chatPersistAudit("REHYDRATE_FAIL", "线程列表加载失败", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const threadId = request.nextUrl.searchParams.get("threadId")
  if (!threadId) {
    return NextResponse.json({ success: false, error: "threadId is required" }, { status: 400 })
  }

  try {
    await chatPersistence.deleteThread(threadId)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { threadId, title } = body as { threadId: string; title: string }
    if (!threadId || !title) {
      return NextResponse.json({ success: false, error: "threadId and title are required" }, { status: 400 })
    }

    const thread = await chatPersistence.updateThreadTitle(threadId, title)
    return NextResponse.json({ success: true, data: thread })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
