"use client"

import * as React from "react"
import { useChatStore, useActiveMessages, useActiveThreadId, useActiveThreadStreaming, useActiveThreadStatus, useActiveThreadStats } from "@/stores/chat-store"
import { useAuthStore } from "@/stores"
import { ChatContainer } from "@/components/chat/chat-container"
import { ChatThreadTab } from "@/components/chat/chat-thread-tab"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { StructuredAgentResponse } from "@/agents/types"
import { ModelSelector } from "@/components/chat/model-selector"
import { StatusIndicator, MatrixRainBackground } from "@/components/chat/status-indicator"
import { ChatStats } from "@/components/chat/chat-stats"
import { useActiveModel } from "@/stores/model-config-store"

function getAnonymousSessionId(): string {
  if (typeof window === "undefined") return "anonymous"
  const key = "chat-anon-session-id"
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    sessionStorage.setItem(key, id)
  }
  return id
}

interface ChatPanelProps {
  className?: string
}

const abortControllers = new Map<string, AbortController>()

export function ChatPanel({ className }: ChatPanelProps) {
  const messages = useActiveMessages()
  const activeThreadId = useActiveThreadId()
  const isStreaming = useActiveThreadStreaming()
  const threadStatus = useActiveThreadStatus()
  const threadStats = useActiveThreadStats()
  const activeModel = useActiveModel()
  const addMessageToThread = useChatStore((s) => s.addMessageToThread)
  const setStreamingForThread = useChatStore((s) => s.setStreamingForThread)
  const createThread = useChatStore((s) => s.createThread)
  const setThreadStatus = useChatStore((s) => s.setThreadStatus)
  const isRehydrated = useChatStore((s) => s.isRehydrated)
  const rehydratedUserId = useChatStore((s) => s.rehydratedUserId)
  const rehydrateFromServer = useChatStore((s) => s.rehydrateFromServer)
  const replaceThreadId = useChatStore((s) => s.replaceThreadId)
  const authUser = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const authToken = useAuthStore((s) => s.token)
  const authIsLoading = useAuthStore((s) => s.isLoading)
  const streamCharPool = useChatStore((s) => s.streamCharPool)
  const appendStreamChar = useChatStore((s) => s.appendStreamChar)
  const clearStreamCharPool = useChatStore((s) => s.clearStreamCharPool)
  const updateLastAssistantMessage = useChatStore((s) => s.updateLastAssistantMessage)
  const updateLastAssistantStructuredData = useChatStore((s) => s.updateLastAssistantStructuredData)
  const setCurrentStreamContent = useChatStore((s) => s.setCurrentStreamContent)
  const addStreamingEvidence = useChatStore((s) => s.addStreamingEvidence)
  const setStreamingReasoningSteps = useChatStore((s) => s.setStreamingReasoningSteps)
  const setStreamingStatus = useChatStore((s) => s.setStreamingStatus)
  const setStreamingEvidenceFromStructured = useChatStore((s) => s.setStreamingEvidenceFromStructured)
  const setStreamingVerdict = useChatStore((s) => s.setStreamingVerdict)
  const setStreamingIntent = useChatStore((s) => s.setStreamingIntent)
  const setStreamingVerdictData = useChatStore((s) => s.setStreamingVerdictData)
  const setStreamingStrategyAdjustment = useChatStore((s) => s.setStreamingStrategyAdjustment)
  const setStreamingNodeStep = useChatStore((s) => s.setStreamingNodeStep)
  const completeStreamingNodeStep = useChatStore((s) => s.completeStreamingNodeStep)
  const completeStreamingNodeStepWithDetail = useChatStore((s) => s.completeStreamingNodeStepWithDetail)
  const clearStreamingContext = useChatStore((s) => s.clearStreamingContext)
  const streamingEvidence = useChatStore((s) => s.streamingEvidence)
  const streamingReasoningSteps = useChatStore((s) => s.streamingReasoningSteps)
  const streamingStatus = useChatStore((s) => s.streamingStatus)
  const streamingNodeSteps = useChatStore((s) => s.streamingNodeSteps)

  const [activeIntent, setActiveIntent] = React.useState<string | null>(null)

  const messagesEndRef = React.useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  React.useEffect(() => {
    scrollToBottom()
  }, [messages])

  React.useEffect(() => {
    if (authIsLoading) return

    if (isAuthenticated && authUser) {
      if (!isRehydrated || rehydratedUserId !== authUser.id) {
        rehydrateFromServer(authUser.id, authToken || undefined)
      }
    } else if (!isRehydrated) {
      rehydrateFromServer(getAnonymousSessionId())
    }
  }, [isRehydrated, rehydratedUserId, rehydrateFromServer, isAuthenticated, authUser, authToken, authIsLoading])

  React.useEffect(() => {
    if (!activeThreadId && isRehydrated) {
      createThread()
    }
  }, [activeThreadId, createThread, isRehydrated])

  const handleSend = async (input: string, files?: Array<{ id: string; name: string; type: string; size: number; url?: string }>, explicitIntent?: string) => {
    if (!input.trim() && (!files || files.length === 0)) return
    if (!activeThreadId) return

    let targetThreadId = activeThreadId

    const userMessage = {
      role: "user" as const,
      content: input,
      timestamp: new Date().toISOString(),
    }

    addMessageToThread(targetThreadId, userMessage)
    setStreamingForThread(targetThreadId, true)

    clearStreamCharPool()
    clearStreamingContext()

    const existingController = abortControllers.get(targetThreadId)
    if (existingController) {
      existingController.abort()
    }
    const controller = new AbortController()
    abortControllers.set(targetThreadId, controller)

    try {
      const thread = useChatStore.getState().threads.find((t) => t.id === targetThreadId)
      const currentMessages = thread?.messages || []

      const requestBody: Record<string, unknown> = {
        messages: currentMessages,
        threadId: targetThreadId,
      }

      if (activeModel) {
        requestBody.modelConfig = {
          provider: activeModel.provider,
          model: activeModel.model,
          baseURL: activeModel.baseURL,
          apiKey: activeModel.apiKey || undefined,
          temperature: activeModel.temperature,
          maxTokens: activeModel.maxTokens,
          multimodal: activeModel.multimodal,
        }
      }

      if (isAuthenticated && authUser) {
        requestBody.user = { id: authUser.id }
      }

      if (explicitIntent) {
        requestBody.intent = explicitIntent
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`
      }

      const response = await fetch("/api/agent/chat/stream", {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(errorBody.error || `请求失败 (${response.status})`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error("Response body is not readable")

      const decoder = new TextDecoder()
      let buffer = ""
      let fullContent = ""
      let doneThreadId = targetThreadId
      let doneTraceId: string | undefined
      let hasFirstToken = false
      let rafToken: number | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split("\n\n")
        buffer = events.pop() || ""

        for (const event of events) {
          if (!event.startsWith("data: ")) continue
          const dataStr = event.slice(6)

          if (dataStr === "[DONE]") {
            break
          }

          const parsed = JSON.parse(dataStr)

          if (parsed.error) {
            throw new Error(parsed.error)
          }

          if (parsed.type === "token") {
            if (!hasFirstToken) {
              hasFirstToken = true
              addMessageToThread(targetThreadId, {
                role: "assistant",
                content: "",
                timestamp: new Date().toISOString(),
              })
              completeStreamingNodeStep("intention")
              completeStreamingNodeStep("retrieval")
              completeStreamingNodeStep("reasoning")
              completeStreamingNodeStep("verdict")
              completeStreamingNodeStep("interaction-point-detection")
              setStreamingNodeStep("response", "生成回复中...")
            }
            fullContent += parsed.content
            setCurrentStreamContent(fullContent)
            for (const char of parsed.content) {
              appendStreamChar(char)
            }
            if (!rafToken) {
              rafToken = requestAnimationFrame(() => {
                updateLastAssistantMessage(targetThreadId, fullContent)
                rafToken = undefined
              })
            }
          }

          if (parsed.type === "streaming_node") {
            const nodeLabelMap: Record<string, string> = {
              intention: "意图识别",
              retrieval: "证据收集",
              reasoning: "逻辑推理",
              verdict: "综合裁决",
              "interactionPointDetection": "交互检测",
              response: "响应生成",
            }
            const label = nodeLabelMap[parsed.nodeName] || parsed.nodeName
            if (parsed.status === "started") {
              setStreamingNodeStep(parsed.nodeName, `${label}中...`)
            } else if (parsed.status === "done") {
              if (parsed.detail) {
                completeStreamingNodeStepWithDetail(parsed.nodeName, parsed.detail)
              } else {
                completeStreamingNodeStep(parsed.nodeName)
              }
            }
            continue
          }

          if (parsed.type === "structured_update") {
            if (hasFirstToken) {
              updateLastAssistantStructuredData(targetThreadId, parsed.data as Record<string, unknown>)
            }
            if (parsed.data.intent) {
              const intentObj = parsed.data.intent as Record<string, unknown>
              setStreamingIntent(intentObj)
              const intentType = intentObj.type as string || "unknown"
              const intentSource = intentObj.source as string | undefined
              let intentDetail = `意图: ${intentType}`
              if (intentSource) intentDetail += ` (${intentSource})`
              setStreamingNodeStep("intention", intentDetail)
            }
            if (parsed.data.evidenceChain && !hasFirstToken) {
              setStreamingEvidenceFromStructured(parsed.data.evidenceChain as Record<string, unknown>)
              const evidences = (parsed.data.evidenceChain as Record<string, unknown>).evidences as Array<unknown> | undefined
              if (evidences) {
                setStreamingNodeStep("retrieval", `证据链: ${evidences.length}条`)
              }
            }
            if (parsed.data.reasoningPath?.steps) {
              setStreamingReasoningSteps(parsed.data.reasoningPath.steps)
              const stepsCount = parsed.data.reasoningPath.steps.length
              setStreamingNodeStep("reasoning", `推理中: ${stepsCount}步`)
            }
            if (parsed.data.verdict && !hasFirstToken) {
              const verdictObj = parsed.data.verdict as Record<string, unknown>
              setStreamingVerdict(verdictObj)
              setStreamingVerdictData(verdictObj)
              const verdictType = verdictObj.type as string | undefined
              const confidence = (verdictObj.confidence as Record<string, unknown> | undefined)?.final_confidence
              let verdictDetail = "裁决中"
              if (verdictType) verdictDetail = `裁决: ${verdictType}`
              if (typeof confidence === "number") verdictDetail += ` ${confidence}%`
              setStreamingNodeStep("verdict", verdictDetail)
            }
            if (parsed.data.interactionPoint) {
              setStreamingNodeStep("interaction-point-detection", "检测交互点")
            }
          }

          if (parsed.type === "evidence_found") {
            addStreamingEvidence(parsed.evidence)
          }

          if (parsed.type === "rag_search") {
            const query = (parsed.query as string) || ""
            setStreamingStatus(`正在搜索知识库${query ? `: ${query.slice(0, 30)}${query.length > 30 ? "..." : ""}` : "..."}`)
            setStreamingNodeStep("retrieval", `搜索知识库${query ? `: ${query.slice(0, 30)}...` : ""}`)
            appendStreamChar("⌕")
          }

          if (parsed.type === "rag_result") {
            const count = (parsed.count as number) ?? 0
            const sources = parsed.sources as Record<string, number> | undefined
            let statusText = `检索完成: ${count}条`
            if (sources && Object.keys(sources).length > 0) {
              const sourceParts = Object.entries(sources).map(([name, c]) => `${name}×${c}`)
              statusText += ` (${sourceParts.join(", ")})`
            }
            setStreamingStatus(statusText)
            setStreamingNodeStep("retrieval", statusText)
          }

          if (parsed.type === "strategy_adjustment") {
            setStreamingStrategyAdjustment({
              signals: parsed.signals,
              dominantAction: parsed.dominantAction,
              promptSupplement: parsed.promptSupplement,
            })
          }

          if (parsed.token) {
            if (!hasFirstToken) {
              hasFirstToken = true
              addMessageToThread(targetThreadId, {
                role: "assistant",
                content: "",
                timestamp: new Date().toISOString(),
              })
              completeStreamingNodeStep("verdict")
              completeStreamingNodeStep("interaction-point-detection")
              setStreamingNodeStep("response", "生成回复中...")
            }
            fullContent += parsed.token
            setCurrentStreamContent(fullContent)
            for (const char of parsed.token) {
              appendStreamChar(char)
            }
            if (!rafToken) {
              rafToken = requestAnimationFrame(() => {
                updateLastAssistantMessage(targetThreadId, fullContent)
                rafToken = undefined
              })
            }
          }

          if (parsed.thinking?.content) {
            setStreamingStatus(parsed.thinking.content)
            for (const char of parsed.thinking.content) {
              appendStreamChar(char)
            }
            const thinkingNode = parsed.thinking.node as string | undefined
            if (thinkingNode) {
              const nodeKeyMap: Record<string, string> = {
                intention: "intention",
                retrieval: "retrieval",
                reasoning: "reasoning",
                verdict: "verdict",
                interactionPointDetection: "interaction-point-detection",
                response: "response",
              }
              const normalizedNode = nodeKeyMap[thinkingNode] || thinkingNode
              completeStreamingNodeStepWithDetail(normalizedNode, parsed.thinking.content)
            }
          }

          if (parsed.done) {
            doneThreadId = parsed.threadId || targetThreadId
            doneTraceId = parsed.traceId
            completeStreamingNodeStep("response")
          }
        }
      }

      if (rafToken !== undefined) {
        cancelAnimationFrame(rafToken)
        rafToken = undefined
      }
      if (hasFirstToken && fullContent) {
        updateLastAssistantMessage(targetThreadId, fullContent)
      }

      if (doneThreadId !== targetThreadId) {
        replaceThreadId(targetThreadId, doneThreadId)
        targetThreadId = doneThreadId
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return
      }
      const message = error instanceof Error ? error.message : "未知错误"
      console.error("Chat error:", message)
      setThreadStatus(targetThreadId, "error")
      addMessageToThread(targetThreadId, {
        role: "assistant",
        content: message,
        timestamp: new Date().toISOString(),
      })
    } finally {
      clearStreamCharPool()
      setStreamingForThread(targetThreadId, false)
      setActiveIntent(null)
      abortControllers.delete(targetThreadId)

      requestAnimationFrame(() => {
        clearStreamingContext()
      })
    }
  }

  return (
    <div className={cn("flex flex-col h-full p-4 overflow-hidden", className)}>
      <ChatThreadTab />
      <div className=" rounded-b-md flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border relative overflow-hidden">
          <MatrixRainBackground status={threadStatus} charPool={streamCharPool} />
          <div className="flex items-center gap-3 relative z-10">
            <h2 className="text-lg font-semibold whitespace-nowrap">AI助手</h2>
            <ModelSelector />
            <StatusIndicator status={threadStatus} />
          </div>
          <div className="relative z-10">
            <ChatStats stats={threadStats} />
          </div>
        </div>

      <ChatContainer
        messages={messages}
        onSend={handleSend}
        isLoading={isStreaming}
        activeIntent={activeIntent}
        onToggleIntent={setActiveIntent}
        streamingEvidence={streamingEvidence}
        streamingReasoningSteps={streamingReasoningSteps}
        streamingStatus={streamingStatus}
        streamingNodeSteps={streamingNodeSteps}
        className="flex-1"
      />

      <div ref={messagesEndRef} />
      </div>
    </div>
  )
}

function checkForReasoning(content: string) {
  const reasoningKeywords = [
    "分析", "决策", "选择", "方案", "对比", "评估",
    "优先级", "建议", "推荐", "最优"
  ]
  return reasoningKeywords.some(keyword => content.includes(keyword))
}
