import { NextRequest, NextResponse } from "next/server"
import type { ChatRequest } from "@/dto/agent.dto"
import { agentAuditRequest, agentAuditResponse, agentAuditError } from "@/lib/agent-audit-logger"
import {
  chatPersistAudit,
  chatPersistAuditPhaseStart,
  chatPersistAuditPhaseEnd,
} from "@/lib/chat-persistence-logger"
import { chatPersistence } from "@/services/chat-persistence"
import type { ChatPersistAuditData } from "@/services/chat-persistence"
import { getUserFromRequest } from "@/lib/auth"
import { randomUUID } from "crypto"
import { setLLMConfig, clearLLMConfigOverride } from "@/lib/llm/index"
import { resolveApiKeyForModel } from "@/config/model-config"

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body: ChatRequest & { intent?: string; userId?: string } = await request.json()
    const { messages, user, project, threadId: tid, intent, modelConfig } = body
    const requestThreadId = tid || randomUUID()

    if (modelConfig) {
      const resolvedApiKey = resolveApiKeyForModel({
        provider: modelConfig.provider,
        baseURL: modelConfig.baseURL,
        model: modelConfig.model,
        apiKey: modelConfig.apiKey,
        temperature: modelConfig.temperature ?? 0.3,
        maxTokens: modelConfig.maxTokens ?? 4000,
        id: "",
        name: "",
        providerLabel: "",
      })
      setLLMConfig({
        provider: modelConfig.provider,
        model: modelConfig.model,
        baseURL: modelConfig.baseURL,
        apiKey: resolvedApiKey,
        temperature: modelConfig.temperature ?? 0.3,
        maxTokens: modelConfig.maxTokens ?? 4000,
      })
    }

    const lastMsg = messages[messages.length - 1]
    const preview = typeof lastMsg?.content === "string" ? lastMsg.content : JSON.stringify(lastMsg?.content)
    agentAuditRequest(requestThreadId, messages.length, preview)

    chatPersistAuditPhaseStart("PERSIST_START", `threadId=${requestThreadId}`)

    let thread = await chatPersistence.getThread(requestThreadId)
    if (!thread) {
      const authUser = getUserFromRequest(request)
      const userId = authUser?.userId || (user as Record<string, unknown>)?.id as string || "anonymous"
      const projectId = (project as Record<string, unknown>)?.id as string | undefined
      const created = await chatPersistence.createThread(userId, projectId, intent || undefined)
      thread = await chatPersistence.getThread(created.id)
    }

    if (!thread) {
      throw new Error("Failed to create or load thread")
    }

    const threadId = thread.id

    chatPersistAuditPhaseStart("MESSAGE_SAVE", `threadId=${threadId}`)
    await chatPersistence.addMessage(threadId, "USER", lastMsg?.content || "", undefined, undefined)
    chatPersistAuditPhaseEnd("MESSAGE_SAVE", "用户消息已保存")

    const { runAgent, startChainTrace, endChainTrace } = await import("@/agents")

    const tracer = startChainTrace(threadId, {
      type: intent ? "button_click" : "manual_send",
      buttonId: intent,
      explicitIntent: intent || undefined,
      userInput: preview,
    })
    const traceId = tracer.getTraceId()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await runAgent(
      {
        messages,
        user,
        project,
        explicitIntent: intent || null,
        conversationContext: { traceId, modelConfig },
      } as any,
      { configurable: { thread_id: threadId } }
    )

    const chainTrace = endChainTrace(traceId)

    const assistantMsg = result?.messages?.[result.messages.length - 1]
    if (assistantMsg) {
      await chatPersistence.addMessage(
        threadId,
        "ASSISTANT",
        assistantMsg.content || "",
        result.structuredResponse || null,
        traceId
      )
    }

    if (chainTrace) {
      chatPersistAuditPhaseStart("CHAIN_TRACE_SAVE", `traceId=${traceId}`)
      await chatPersistence.saveChainTrace(threadId, chainTrace)
      chatPersistAuditPhaseEnd("CHAIN_TRACE_SAVE", "链路追踪已保存")
    }

    const firstUserMsg = messages[0]
    if (firstUserMsg && thread.title === "新对话") {
      const title = typeof firstUserMsg.content === "string"
        ? firstUserMsg.content.replace(/\n/g, " ").trim().slice(0, 20) || "新对话"
        : "新对话"
      await chatPersistence.updateThreadTitle(threadId, title)
    }

    const durationMs = Date.now() - startTime
    const verdictType = result?.verdictResult?.type
    const responseMsgCount = result?.messages?.length || 0
    agentAuditResponse(threadId, durationMs, verdictType, responseMsgCount)

    const auditData: ChatPersistAuditData = {
      startedAt: new Date(startTime).toISOString(),
      threadCreated: !tid,
      messageCount: assistantMsg ? 2 : 1,
      chainTraceSaved: !!chainTrace,
      totalDurationMs: durationMs,
      completedAt: new Date().toISOString(),
    }
    await chatPersistence.saveAuditData(threadId, auditData)

    chatPersistAuditPhaseEnd("PERSIST_START", `完成, 耗时${durationMs}ms`)

    return NextResponse.json({
      success: true,
      data: {
        messages: result?.messages || [],
        verdict: result?.verdictResult || null,
        currentTask: result?.currentTask || null,
        structuredResponse: result?.structuredResponse || null,
        threadId,
        traceId,
        chainTrace,
      },
    })
  } catch (error) {
    agentAuditError("unknown", error, "chat/route.ts")

    chatPersistAudit("PERSIST_FAIL", "聊天持久化失败", {
      error: error instanceof Error ? error.message : String(error),
      duration_ms: Date.now() - startTime,
    })

    console.error("Agent chat error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
