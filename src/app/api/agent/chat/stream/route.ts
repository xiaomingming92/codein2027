import { NextRequest } from "next/server"
import type { ChatRequest } from "@/dto/agent.dto"
import { agentAuditError, clearAuditContext } from "@/lib/agent-audit-logger"
import {
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
import type { Prisma } from "@prisma/client"
import { registerStreamBus, unregisterStreamBus } from "@/agents/stream-bus"
import type { StreamEvent } from "@/agents/stream-bus"
import { getAnalysisContext, saveAnalysisContext, appendTurnRecord } from "@/services/analysis-context"
import type { AnalysisTurnRecord } from "@/services/analysis-context"
import {
  semanticCache,
  buildCacheKey,
  type CacheEntry,
} from "@/services/semantic-cache"
import { loadStats, getAdaptedTtl, adaptCacheTtl, recordCacheExpiry } from "@/services/cache-ttl-stats"
import { buildMetricBaselines } from "@/services/path-metrics"

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
        afterState: detail as Prisma.InputJsonValue,
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
        // 加载自适应 TTL（从持久化文件恢复，失败不阻塞请求）
        loadStats().catch(() => {})

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

        let analysisCtx = await getAnalysisContext(threadId)

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

        // 预计算演化闭环基准（失败不阻塞请求）
        const metricBaselines = await buildMetricBaselines().catch((e) => {
          console.warn("[stream] buildMetricBaselines failed:", e)
          return null
        })

        const agentStream = await streamAgent(
          {
            messages,
            user,
            project,
            explicitIntent: intent || null,
            conversationContext: { traceId, modelConfig, metricBaselines },
            analysisContext: analysisCtx,
          },
          { configurable: { thread_id: requestThreadId } }
        )

        let responseOutput: Record<string, unknown> | null = null
        let cacheHitEntry: CacheEntry | null = null
        let cacheKeyForMiss: { query: string; intent: string; experts: string[]; expiredConfidence?: number } | null = null
        let capturedIntent: string | null = null
        let capturedThinkingLevel: string | null = null
        let capturedVerdictConfidence: number | null = null
        let capturedEvidenceCount: number = 0
        let capturedStrategyDescriptorId = ""

        for await (const chunk of agentStream) {
          const chunkRecord = chunk as Record<string, unknown>
          const nodeName = Object.keys(chunkRecord)[0]
          const nodeOutput = chunkRecord[nodeName] as Record<string, unknown> | undefined
          if (!nodeOutput) continue

          // 缓存查询：intention 节点完成后，deep 通道在 retrieval 前查缓存
          if (nodeName === "intention") {
            const task = nodeOutput.currentTask as Record<string, unknown> | undefined
            const intent = task?.intent as string | undefined
            const thinkingLevel = task?.thinkingLevel as string | undefined
            const query = (task?.query as string) || preview

            // 捕获本轮意图和思考层级（供 turnHistory 采集用）
            capturedIntent = intent ?? null
            capturedThinkingLevel = thinkingLevel ?? null

            const ctx = nodeOutput.analysisContext as Record<string, unknown> | undefined
            const activeExperts = (
              ctx?.activeExperts as Array<{ expertId: string }> | undefined
            )?.map((e) => e.expertId) || []

            if (thinkingLevel === "deep" && intent && query) {
              const cacheKey = buildCacheKey(query, intent, activeExperts)
              const cached = semanticCache.get(cacheKey)
              if (cached) {
                cacheHitEntry = cached
                unregisterStreamBus(traceId)
                break
              }
              // MISS: 记录 key 信息，管线完成后写入缓存；检查是否为 TTL 过期（回路一接入点）
              const expired = semanticCache.popExpiredEntry()
              cacheKeyForMiss = {
                query,
                intent,
                experts: activeExperts,
                expiredConfidence: expired?.confidence,
              }
            }
          }

          // 捕获检索节点证据量
          if (nodeName === "retrieval") {
            const chain = nodeOutput.evidenceChain as unknown[] | undefined
            if (chain && Array.isArray(chain)) {
              capturedEvidenceCount = chain.length
            }
          }

          // 捕获裁决置信度
          if (nodeName === "verdict" || nodeName === "reasoning") {
            const result = nodeOutput.verdictResult as Record<string, unknown> | undefined
            if (result?.confidence != null) {
              capturedVerdictConfidence = result.confidence as number
            }
          }

          if (nodeName === "response") {
            responseOutput = nodeOutput
          }

          const thinkingText = extractThinkingText(nodeName, nodeOutput)
          if (thinkingText) {
            const thinkingPayload = JSON.stringify({ thinking: { node: nodeName, content: thinkingText } })
            controller.enqueue(encoder.encode(`data: ${thinkingPayload}\n\n`))
          }
        }

        if (cacheHitEntry) {
          // 缓存命中：模拟流式输出
          const content = cacheHitEntry.responseContent
          const chunkSize = 3
          const totalChunks = Math.ceil(content.length / chunkSize)
          const targetDurationMs = 1500
          const minDelayMs = 5

          for (let i = 0; i < totalChunks; i++) {
            const token = content.slice(i * chunkSize, (i + 1) * chunkSize)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`))
            if (i < totalChunks - 1) {
              const delay = Math.max(minDelayMs, targetDurationMs / totalChunks)
              await new Promise((resolve) => setTimeout(resolve, delay))
            }
          }

          // 缓存命中：持久化助手消息
          chatPersistAuditPhaseStart("MESSAGE_SAVE", `threadId=${threadId} assistant (cached)`)
          await chatPersistence.addMessage(
            threadId,
            "ASSISTANT",
            content,
            cacheHitEntry.displayContent || null,
            traceId
          )
          chatPersistAuditPhaseEnd("MESSAGE_SAVE", "助手消息已保存 (cached)")

          // 更新标题
          const firstUserMsg = messages[0]
          if (firstUserMsg && thread.title === "新对话") {
            const title = typeof firstUserMsg.content === "string"
              ? firstUserMsg.content.replace(/\n/g, " ").trim().slice(0, 20) || "新对话"
              : "新对话"
            await chatPersistence.updateThreadTitle(threadId, title)
          }

          const durationMs = Date.now() - startTime

          const chainTrace = endChainTrace(traceId)

          if (chainTrace) {
            chatPersistAuditPhaseStart("CHAIN_TRACE_SAVE", `traceId=${traceId}`)
            await chatPersistence.saveChainTrace(threadId, chainTrace)
            chatPersistAuditPhaseEnd("CHAIN_TRACE_SAVE", "链路追踪已保存 (cached)")
          }

          const auditData: ChatPersistAuditData = {
            startedAt: new Date(startTime).toISOString(),
            threadCreated: !tid,
            messageCount: 2,
            chainTraceSaved: !!chainTrace,
            totalDurationMs: durationMs,
            completedAt: new Date().toISOString(),
          }
          await chatPersistence.saveAuditData(threadId, auditData)

          await saveAnalysisContext(threadId, analysisCtx)

          streamChatAudit("STREAM_DONE", `流式完成 (cache_hit)`, { durationMs })

          auditTraceEvent(traceId, "STREAM_DONE_CACHE_HIT", {
            durationMs,
            sourceTraceId: cacheHitEntry.sourceTraceId,
          })

          const donePayload = JSON.stringify({
            done: true,
            threadId: requestThreadId,
            traceId,
            cacheHit: true,
            sourceTraceId: cacheHitEntry.sourceTraceId,
          })
          controller.enqueue(encoder.encode(`data: ${donePayload}\n\n`))
          controller.close()
          return
        }

        const durationMs = Date.now() - startTime

        const chainTrace = endChainTrace(traceId)

        if (responseOutput) {
          const assistantMessages = responseOutput.messages as Array<{ role: string; content: string }> | undefined
          const structuredResponse = responseOutput.structuredResponse
          capturedStrategyDescriptorId = (structuredResponse as Record<string, unknown>)?.strategyId as string || ""

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

          // 缓存写入：deep 通道 MISS 管线完成后 fire-and-forget
          if (cacheKeyForMiss) {
            const respContent = assistantMessages?.[assistantMessages.length - 1]?.content || ""
            const displayData = (structuredResponse as Record<string, unknown>)?.displayContent || {}

            const ttl = (() => {
              return getAdaptedTtl(cacheKeyForMiss.intent)
            })()

            const cacheKey = buildCacheKey(
              cacheKeyForMiss.query,
              cacheKeyForMiss.intent,
              cacheKeyForMiss.experts,
            )

            Promise.resolve().then(() => {
              try {
                semanticCache.set(cacheKey, {
                  responseContent: respContent,
                  displayContent: displayData as Record<string, unknown>,
                  createdAt: Date.now(),
                  ttl,
                  sourceTraceId: traceId,
                  intent: cacheKeyForMiss!.intent,
                  confidence: capturedVerdictConfidence ?? undefined,
                })
              } catch {
                // 缓存写入失败不影响响应
              }
            })
          }
        }

        // ═══════════ 第6轮：evolution loop 数据采集 ═══════════
        // turnHistory 采集 + TTL 自适应（cache hit 路径不执行）
        {
          // turnHistory 采集
          if (analysisCtx && capturedIntent) {
            const existingFollowUp = analysisCtx.turnHistory
              .filter((t) => t.followUpCount > 0).length

            const turnRecord: AnalysisTurnRecord = {
              turn: analysisCtx.totalTurns + 1,
              intent: capturedIntent,
              thinkingLevel: capturedThinkingLevel ?? "",
              strategyDescriptorId: capturedStrategyDescriptorId,
              activeExpertIds: analysisCtx.activeExperts?.map((e) => e.expertId) ?? [],
              verdictConfidence: capturedVerdictConfidence,
              evidenceCount: capturedEvidenceCount,
              followUpCount: existingFollowUp,
              followedUpFromTurn: null,
              timestamp: new Date().toISOString(),
            }

            analysisCtx = appendTurnRecord(analysisCtx, turnRecord)
          }

          // TTL 自适应（fire-and-forget）
          if (cacheKeyForMiss) {
            // 回路一闭合：记录缓存过期（旧置信度 vs 新置信度）
            if (cacheKeyForMiss.expiredConfidence != null && capturedVerdictConfidence != null) {
              recordCacheExpiry(
                cacheKeyForMiss.intent,
                cacheKeyForMiss.expiredConfidence,
                capturedVerdictConfidence,
              )
            }
            adaptCacheTtl(cacheKeyForMiss.intent)
          }
        }
        // ═══════════ 第6轮插入点结束 ═══════════

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

        await saveAnalysisContext(threadId, analysisCtx)

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
        // 第6轮：防跨请求状态泄漏
        clearAuditContext()
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