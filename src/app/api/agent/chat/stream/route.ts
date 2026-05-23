import { NextRequest } from "next/server"
import type { ChatRequest } from "@/dto/agent.dto"
import { agentAuditError } from "@/lib/agent-audit-logger"
import {
  chatPersistAudit,
  chatPersistAuditPhaseStart,
  chatPersistAuditPhaseEnd,
} from "@/lib/chat-persistence-logger"
import { chatPersistence } from "@/services/chat-persistence"
import type { ChatPersistAuditData } from "@/services/chat-persistence"
import { getUserFromRequest } from "@/lib/auth"
import { setLLMConfig } from "@/lib/llm/index"
import { resolveApiKeyForModel } from "@/config/model-config"
import { streamChatAudit } from "@/lib/stream-chat-logger"
import { prisma } from "@/lib/prisma"
import { registerStreamBus, unregisterStreamBus } from "@/agents/stream-bus"
import type { StreamEvent } from "@/agents/stream-bus"

export const runtime = "nodejs"

let _systemUserId: string | null = null

async function getSystemUserId(): Promise<string> {
  if (_systemUserId) return _systemUserId

  let user = await prisma.user.findUnique({
    where: { username: "ai-assistant" },
    select: { id: true },
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        id: "ai-assistant",
        username: "ai-assistant",
        email: "ai-assistant@internal",
        password: "internal",
      },
      select: { id: true },
    })
  }

  _systemUserId = user.id
  return _systemUserId
}

async function auditTraceEvent(
  traceId: string,
  action: string,
  detail: Record<string, unknown>
): Promise<void> {
  try {
    const systemUserId = await getSystemUserId()
    await prisma.auditLog.create({
      data: {
        userId: systemUserId,
        action,
        targetType: "STREAM_TRACE",
        targetId: traceId,
        traceId,
        afterState: detail,
        reason: `${action} traceId=${traceId}`,
      },
    })
  } catch {
    // 审计写入失败不应阻塞主流程
  }
}

function extractThinkingText(nodeName: string, output: Record<string, unknown>): string | null {
  switch (nodeName) {
    case "intention": {
      const task = output.currentTask as Record<string, unknown> | undefined
      if (task?.intent) {
        if (task.source === "explicit") return `意图分析: 用户指定意图 "${task.intent}"`
        return `意图分析: 识别为意图 "${task.intent}"`
      }
      return null
    }
    case "retrieval": {
      const chain = output.evidenceChain as Array<unknown> | undefined
      if (chain && chain.length > 0) {
        const bySource = (chain as Array<Record<string, unknown>>).reduce<Record<string, number>>((acc, e) => {
          const s = (e.source as string) || "unknown"
          acc[s] = (acc[s] || 0) + 1
          return acc
        }, {})
        const bySourceStr = Object.entries(bySource).map(([k, v]) => `${k}:${v}`).join(", ")
        return `知识检索: 获得 ${chain.length} 条证据 (${bySourceStr})`
      }
      return "知识检索: 未找到相关文档"
    }
    case "reasoning": {
      const vr = output.verdictResult as Record<string, unknown> | undefined
      if (vr) {
        const conf = ((vr.confidence as Record<string, unknown> | undefined)?.final_confidence ?? "?") as string | number
        const steps = (vr.reasoning_path as Array<unknown>)?.length ?? 0
        if (steps > 0) return `推理分析: 完成 ${steps} 步推理, 置信度 ${conf}%`
        return "推理分析: 无证据跳过推理"
      }
      return null
    }
    case "interactionPointDetection": {
      const pi = output.pendingInteraction
      if (pi) return "交互检测: 发现交互点"
      return "交互检测: 无交互点"
    }
    case "verdict": {
      const vr = output.verdictResult as Record<string, unknown> | undefined
      if (vr) {
        const vType = (vr.type as string) || "PATH_SELECTION"
        const conf = ((vr.confidence as Record<string, unknown> | undefined)?.final_confidence ?? "?") as string | number
        return `裁决评估: ${vType}, 置信度 ${conf}%`
      }
      return null
    }
    default:
      return null
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let traceId = ""
      try {
        const body: ChatRequest & { intent?: string; userId?: string } = await request.json()
        const { messages, user, project, threadId: tid, intent, modelConfig } = body
        let requestThreadId = tid || `stream-${Date.now()}`

        if (modelConfig) {
          const mc = modelConfig as Record<string, unknown>
          const resolvedApiKey = resolveApiKeyForModel({
            provider: mc.provider as "cloud" | "ollama",
            baseURL: mc.baseURL as string,
            model: mc.model as string,
            apiKey: mc.apiKey as string | undefined,
            temperature: (mc.temperature as number) ?? 0.3,
            maxTokens: (mc.maxTokens as number) ?? 4000,
            id: "",
            name: "",
            providerLabel: "",
            multimodal: (mc.multimodal as boolean) ?? false,
          })
          setLLMConfig({
            provider: mc.provider as "cloud" | "ollama",
            model: mc.model as string,
            baseURL: mc.baseURL as string,
            apiKey: resolvedApiKey,
            temperature: (mc.temperature as number) ?? 0.3,
            maxTokens: (mc.maxTokens as number) ?? 4000,
          })
        }

        const lastMsg = messages[messages.length - 1]
        const preview = typeof lastMsg?.content === "string" ? lastMsg.content : JSON.stringify(lastMsg?.content)

        streamChatAudit("STREAM_START", `流式请求开始 thread=${requestThreadId}`, {
          threadId: requestThreadId,
          messageCount: messages.length,
          preview: preview.slice(0, 100),
        })

        chatPersistAuditPhaseStart("PERSIST_START", `stream threadId=${requestThreadId}`)

        const authUser = getUserFromRequest(request)
        const persistUserId = authUser?.userId || (user as Record<string, unknown>)?.id as string || "anonymous"
        const persistProjectId = (project as Record<string, unknown>)?.id as string | undefined

        let thread = await chatPersistence.getThread(requestThreadId)
        if (!thread) {
          const created = await chatPersistence.createThread(persistUserId, persistProjectId, intent || undefined)
          thread = await chatPersistence.getThread(created.id)
          if (created.id !== requestThreadId) {
            requestThreadId = created.id
          }
        }

        if (!thread) {
          throw new Error("Failed to create or load thread")
        }

        const threadId = thread.id

        chatPersistAuditPhaseStart("MESSAGE_SAVE", `threadId=${threadId}`)
        await chatPersistence.addMessage(threadId, "USER", lastMsg?.content || "", undefined, undefined)
        chatPersistAuditPhaseEnd("MESSAGE_SAVE", "用户消息已保存")

        const { streamAgent, startChainTrace, endChainTrace } = await import("@/agents")

        const tracer = startChainTrace(requestThreadId, {
          type: intent ? "button_click" : "manual_send",
          buttonId: intent,
          explicitIntent: intent || undefined,
          userInput: preview,
        })
        traceId = tracer.getTraceId()

        auditTraceEvent(traceId, "STREAM_START", {
          threadId: requestThreadId,
          messageCount: messages.length,
          preview: preview.slice(0, 100),
        })

        registerStreamBus(traceId, (event: StreamEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        })

        const agentStream = await streamAgent(
          {
            messages,
            user,
            project,
            explicitIntent: intent || null,
            conversationContext: { traceId, modelConfig },
          } as any,
          { configurable: { thread_id: requestThreadId } }
        )

        let responseOutput: Record<string, unknown> | null = null

        for await (const chunk of agentStream) {
          const chunkRecord = chunk as Record<string, unknown>
          const nodeName = Object.keys(chunkRecord)[0]
          const nodeOutput = chunkRecord[nodeName] as Record<string, unknown> | undefined
          if (!nodeOutput) continue

          if (nodeName === "response") {
            responseOutput = nodeOutput
          }

          const thinkingText = extractThinkingText(nodeName, nodeOutput)
          if (thinkingText) {
            const thinkingPayload = JSON.stringify({ thinking: { node: nodeName, content: thinkingText } })
            controller.enqueue(encoder.encode(`data: ${thinkingPayload}\n\n`))
          }
        }

        const durationMs = Date.now() - startTime

        const chainTrace = endChainTrace(traceId)

        if (responseOutput) {
          const assistantMessages = responseOutput.messages as Array<{ role: string; content: string }> | undefined
          const structuredResponse = responseOutput.structuredResponse

          if (assistantMessages && assistantMessages.length > 0) {
            const assistantMsg = assistantMessages[assistantMessages.length - 1]
            chatPersistAuditPhaseStart("MESSAGE_SAVE", `threadId=${threadId} assistant`)
            await chatPersistence.addMessage(
              threadId,
              "ASSISTANT",
              assistantMsg.content || "",
              structuredResponse || null,
              traceId
            )
            chatPersistAuditPhaseEnd("MESSAGE_SAVE", "助手消息已保存")
          }

          const firstUserMsg = messages[0]
          if (firstUserMsg && thread.title === "新对话") {
            const title = typeof firstUserMsg.content === "string"
              ? firstUserMsg.content.replace(/\n/g, " ").trim().slice(0, 20) || "新对话"
              : "新对话"
            await chatPersistence.updateThreadTitle(threadId, title)
          }
        }

        if (chainTrace) {
          chatPersistAuditPhaseStart("CHAIN_TRACE_SAVE", `traceId=${traceId}`)
          await chatPersistence.saveChainTrace(threadId, chainTrace)
          chatPersistAuditPhaseEnd("CHAIN_TRACE_SAVE", "链路追踪已保存")
        }

        const auditData: ChatPersistAuditData = {
          startedAt: new Date(startTime).toISOString(),
          threadCreated: !tid,
          messageCount: responseOutput ? 2 : 1,
          chainTraceSaved: !!chainTrace,
          totalDurationMs: durationMs,
          completedAt: new Date().toISOString(),
        }
        await chatPersistence.saveAuditData(threadId, auditData)

        streamChatAudit("STREAM_DONE", `流式完成`, {
          durationMs,
        })

        auditTraceEvent(traceId, "STREAM_DONE", {
          durationMs,
        })

        const donePayload = JSON.stringify({
          done: true,
          threadId: requestThreadId,
          traceId,
          chainTrace,
        })
        controller.enqueue(encoder.encode(`data: ${donePayload}\n\n`))
        controller.close()
      } catch (error) {
        const durationMs = Date.now() - startTime
        const errorMessage = error instanceof Error ? error.message : String(error)

        streamChatAudit("STREAM_FAIL", `流式失败`, {
          error: errorMessage,
          durationMs,
        })

        agentAuditError("stream", error, "chat/stream/route.ts")

        const errorPayload = JSON.stringify({ error: errorMessage })
        controller.enqueue(encoder.encode(`data: ${errorPayload}\n\n`))
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      } finally {
        if (traceId) {
          unregisterStreamBus(traceId)
        }
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