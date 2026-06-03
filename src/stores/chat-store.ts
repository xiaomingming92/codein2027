import { create } from "zustand"
import { useAuthStore } from "./auth-store"
import type { StructuredAgentResponse } from "@/agents/types"
import { chatStatsAudit } from "@/lib/chat-stats-logger"
import type { ThreadStatus } from "@/constants/thread-status"
export type { ThreadStatus }

export interface Message {
  role: "user" | "assistant" | "system"
  content: string
  name?: string
  timestamp?: string
  structuredData?: StructuredAgentResponse
}

export interface StreamingEvidence {
  id: string
  source: string
  type: string
  relevance: number
  summary: string
}

export interface StreamingReasoningStep {
  step: number
  action: string
  description: string
}

export interface StreamingNodeStep {
  node: string
  label: string
  detail: string
  status: "running" | "done" | "error"
  startedAt: number
  completedAt?: number
}

interface UploadedFile {
  id: string
  name: string
  type: string
  size: number
  url?: string
}

export interface ThreadStats {
  messageCount: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  contextWindowTokens: number
}

export interface Thread {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
  isStreaming: boolean
  status: ThreadStatus
  stats: ThreadStats
}

function createDefaultStats(): ThreadStats {
  return {
    messageCount: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    contextWindowTokens: 0,
  }
}

function computeStatsFromMessages(messages: Message[]): ThreadStats {
  return messages.reduce<ThreadStats>((stats, msg) => updateStatsOnMessage(stats, msg), createDefaultStats())
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function updateStatsOnMessage(prev: ThreadStats, message: Message): ThreadStats {
  const tokens = estimateTokens(message.content)
  const isNewRound = message.role === "user"
  const inputDelta = message.role === "user" ? tokens : 0
  const outputDelta = message.role === "assistant" ? tokens : 0
  const roundDelta = isNewRound ? 1 : 0

  const newStats: ThreadStats = {
    messageCount: prev.messageCount + roundDelta,
    estimatedInputTokens: prev.estimatedInputTokens + inputDelta,
    estimatedOutputTokens: prev.estimatedOutputTokens + outputDelta,
    contextWindowTokens: prev.contextWindowTokens + tokens,
  }

  chatStatsAudit("CHAT_STATS_TOKEN_ESTIMATE", `消息Token估算: role=${message.role}`, {
    role: message.role,
    charLength: message.content.length,
    estimatedTokens: tokens,
    inputDelta,
    outputDelta,
    roundDelta,
    newTotal: newStats.contextWindowTokens,
  })

  return newStats
}

interface ChatState {
  threads: Thread[]
  activeThreadId: string | null
  isStreaming: boolean
  isLoading: boolean
  isRehydrated: boolean
  rehydratedUserId: string | null
  uploadedFiles: UploadedFile[]

  createThread: () => string
  switchThread: (threadId: string) => void
  deleteThread: (threadId: string) => void
  updateThreadTitle: (threadId: string, title: string) => void
  addMessage: (message: Message) => void
  addMessageToThread: (threadId: string, message: Message) => void
  setMessages: (messages: Message[]) => void
  clearMessages: () => void
  setStreaming: (streaming: boolean) => void
  setStreamingForThread: (threadId: string, streaming: boolean) => void
  updateLastAssistantMessage: (threadId: string, content: string) => void
  updateLastAssistantStructuredData: (threadId: string, data: Record<string, unknown>) => void
  setThreadStatus: (threadId: string, status: ThreadStatus) => void
  updateThreadStats: (threadId: string, stats: ThreadStats) => void
  setLoading: (loading: boolean) => void
  setThreadId: (threadId: string | null) => void
  addUploadedFile: (file: UploadedFile) => void
  removeUploadedFile: (fileId: string) => void
  clearUploadedFiles: () => void
  replaceThreadId: (oldId: string, newId: string) => void
  rehydrateFromServer: (userId: string, authToken?: string) => Promise<void>
  loadThreadMessages: (threadId: string, authToken?: string) => Promise<void>
  streamCharPool: string[]
  currentStreamContent: string
  appendStreamChar: (char: string) => void
  clearStreamCharPool: () => void
  setCurrentStreamContent: (content: string) => void

  streamingEvidence: StreamingEvidence[]
  streamingReasoningSteps: StreamingReasoningStep[]
  streamingStatus: string
  streamingNodeSteps: StreamingNodeStep[]
  streamingIntent: Record<string, unknown> | null
  streamingVerdictData: Record<string, unknown> | null
  streamingStrategyAdjustment: Record<string, unknown> | null
  addStreamingEvidence: (evidence: StreamingEvidence) => void
  setStreamingReasoningSteps: (steps: StreamingReasoningStep[]) => void
  setStreamingStatus: (status: string) => void
  setStreamingNodeStep: (node: string, detail: string) => void
  completeStreamingNodeStep: (node: string) => void
  completeStreamingNodeStepWithDetail: (node: string, detail: string) => void
  setStreamingEvidenceFromStructured: (evidenceChain: Record<string, unknown>) => void
  setStreamingVerdict: (verdict: Record<string, unknown>) => void
  setStreamingIntent: (intent: Record<string, unknown>) => void
  setStreamingVerdictData: (verdict: Record<string, unknown>) => void
  setStreamingStrategyAdjustment: (adjustment: Record<string, unknown> | null) => void
  clearStreamingContext: () => void
}

function generateId(): string {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function extractTitle(content: string): string {
  const text = typeof content === "string" ? content : String(content)
  const cleaned = text.replace(/\n/g, " ").trim()
  return cleaned.length > 20 ? cleaned.slice(0, 20) + "..." : cleaned || "新对话"
}

export const useChatStore = create<ChatState>((set, get) => ({
  threads: [],
  activeThreadId: null,
  isStreaming: false,
  isLoading: false,
  isRehydrated: false,
  rehydratedUserId: null,
  uploadedFiles: [],
  streamCharPool: [],
  currentStreamContent: "",
  streamingEvidence: [],
  streamingReasoningSteps: [],
  streamingStatus: "",
  streamingNodeSteps: [],
  streamingIntent: null,
  streamingVerdictData: null,
  streamingStrategyAdjustment: null,

  createThread: () => {
    const id = generateId()
    const now = new Date().toISOString()
    const newThread: Thread = {
      id,
      title: "新对话",
      messages: [],
      createdAt: now,
      updatedAt: now,
      isStreaming: false,
      status: "idle",
      stats: createDefaultStats(),
    }
    set((state) => ({
      threads: [newThread, ...state.threads],
      activeThreadId: id,
    }))
    return id
  },

  switchThread: (threadId: string) => {
    const state = get()
    const thread = state.threads.find((t) => t.id === threadId)
    if (thread && thread.messages.length === 0 && state.isRehydrated) {
      const token = useAuthStore.getState().token || undefined
      get().loadThreadMessages(threadId, token)
    }
    set({ activeThreadId: threadId })
  },

  deleteThread: (threadId: string) => {
    set((state) => {
      const remaining = state.threads.filter((t) => t.id !== threadId)
      let newActiveId = state.activeThreadId

      if (state.activeThreadId === threadId) {
        if (remaining.length > 0) {
          const deletedIndex = state.threads.findIndex((t) => t.id === threadId)
          const nextIndex = Math.min(deletedIndex, remaining.length - 1)
          newActiveId = remaining[nextIndex].id
        } else {
          const id = generateId()
          const now = new Date().toISOString()
          remaining.push({
            id,
            title: "新对话",
            messages: [],
            createdAt: now,
            updatedAt: now,
            isStreaming: false,
            status: "idle",
            stats: createDefaultStats(),
          })
          newActiveId = id
        }
      }

      return {
        threads: remaining,
        activeThreadId: newActiveId,
      }
    })

    const deleteToken = useAuthStore.getState().token
    fetch(`/api/agent/chat/threads?threadId=${threadId}`, {
      method: "DELETE",
      headers: deleteToken ? { Authorization: `Bearer ${deleteToken}` } : {},
    }).catch(() => {})
  },

  updateThreadTitle: (threadId: string, title: string) => {
    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId ? { ...t, title, updatedAt: new Date().toISOString() } : t
      ),
    }))
  },

  addMessage: (message: Message) => {
    const activeId = get().activeThreadId
    if (!activeId) return
    get().addMessageToThread(activeId, message)
  },

  addMessageToThread: (threadId: string, message: Message) =>
    set((state) => {
      const msgWithTimestamp = {
        ...message,
        timestamp: message.timestamp || new Date().toISOString(),
      }

      const threads = state.threads.map((t) => {
        if (t.id !== threadId) return t
        const updatedMessages = [...t.messages, msgWithTimestamp]
        const title = t.messages.length === 0 && message.role === "user"
          ? extractTitle(message.content)
          : t.title
        const updatedStats = updateStatsOnMessage(t.stats, message)
        return {
          ...t,
          messages: updatedMessages,
          title,
          stats: updatedStats,
          updatedAt: new Date().toISOString(),
        }
      })

      return { threads }
    }),

  setMessages: (messages: Message[]) =>
    set((state) => {
      const activeId = state.activeThreadId
      if (!activeId) return state
      const stats = computeStatsFromMessages(messages)
      return {
        threads: state.threads.map((t) =>
          t.id === activeId ? { ...t, messages, stats, updatedAt: new Date().toISOString() } : t
        ),
      }
    }),

  clearMessages: () =>
    set((state) => {
      const activeId = state.activeThreadId
      if (!activeId) return state
      return {
        threads: state.threads.map((t) =>
          t.id === activeId ? { ...t, messages: [], title: "新对话", updatedAt: new Date().toISOString() } : t
        ),
      }
    }),

  setStreaming: (isStreaming) => {
    const activeId = get().activeThreadId
    set((state) => ({
      isStreaming,
      threads: state.threads.map((t) =>
        t.id === activeId ? { ...t, isStreaming } : t
      ),
    }))
  },

  setStreamingForThread: (threadId: string, streaming: boolean) => {
    set((state) => ({
      isStreaming: streaming,
      threads: state.threads.map((t) =>
        t.id === threadId ? { ...t, isStreaming: streaming, status: streaming ? "streaming" as const : "idle" as const } : t
      ),
    }))
  },

  updateLastAssistantMessage: (threadId: string, content: string) => {
    set((state) => ({
      threads: state.threads.map((t) => {
        if (t.id !== threadId) return t
        const messages = [...t.messages]
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "assistant") {
            messages[i] = { ...messages[i], content }
            break
          }
        }
        return { ...t, messages, updatedAt: new Date().toISOString() }
      }),
    }))
  },

  updateLastAssistantStructuredData: (threadId: string, data: Record<string, unknown>) => {
    set((state) => ({
      threads: state.threads.map((t) => {
        if (t.id !== threadId) return t
        const messages = [...t.messages]
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "assistant") {
            const prev = messages[i].structuredData as Record<string, unknown> | undefined || {}
            messages[i] = {
              ...messages[i],
              structuredData: { ...prev, ...data } as unknown as Message["structuredData"],
            }
            break
          }
        }
        return { ...t, messages, updatedAt: new Date().toISOString() }
      }),
    }))
  },

  setThreadStatus: (threadId: string, status: ThreadStatus) => {
    set((state) => ({
      isStreaming: status === "streaming",
      threads: state.threads.map((t) =>
        t.id === threadId ? { ...t, status, isStreaming: status === "streaming" } : t
      ),
    }))
  },

  updateThreadStats: (threadId: string, stats: ThreadStats) => {
    set((state) => ({
      threads: state.threads.map((t) =>
        t.id === threadId ? { ...t, stats } : t
      ),
    }))
  },

  setLoading: (isLoading) => set({ isLoading }),
  setThreadId: (threadId) => set({ activeThreadId: threadId }),
  addUploadedFile: (file) =>
    set((state) => ({
      uploadedFiles: [...state.uploadedFiles, file],
    })),
  removeUploadedFile: (fileId) =>
    set((state) => ({
      uploadedFiles: state.uploadedFiles.filter((f) => f.id !== fileId),
    })),
  clearUploadedFiles: () => set({ uploadedFiles: [] }),

  appendStreamChar: (char: string) => {
    set((state) => {
      const pool = [...state.streamCharPool, char]
      const maxPool = Math.max(200, Math.min(state.currentStreamContent.length, 3000))
      if (pool.length > maxPool) {
        return { streamCharPool: pool.slice(-maxPool) }
      }
      return { streamCharPool: pool }
    })
  },

  clearStreamCharPool: () => set({ streamCharPool: [] }),

  setCurrentStreamContent: (content: string) => set({ currentStreamContent: content }),

  addStreamingEvidence: (evidence: StreamingEvidence) => {
    set((state) => ({
      streamingEvidence: [...state.streamingEvidence, evidence],
    }))
  },

  setStreamingReasoningSteps: (steps: StreamingReasoningStep[]) => {
    set({ streamingReasoningSteps: steps })
  },

  setStreamingStatus: (status: string) => set({ streamingStatus: status }),

  setStreamingNodeStep: (node: string, detail: string) => {
    set((state) => {
      const existingIndex = state.streamingNodeSteps.findIndex((s) => s.node === node)
      if (existingIndex >= 0) {
        const updated = [...state.streamingNodeSteps]
        updated[existingIndex] = {
          ...updated[existingIndex],
          detail,
          status: "running",
        }
        return { streamingNodeSteps: updated }
      }
      const nodeLabelMap: Record<string, string> = {
        intention: "意图识别",
        retrieval: "证据收集",
        reasoning: "逻辑推理",
        verdict: "综合裁决",
        "interaction-point-detection": "交互检测",
        response: "响应生成",
      }
      return {
        streamingNodeSteps: [
          ...state.streamingNodeSteps,
          {
            node,
            label: nodeLabelMap[node] || node,
            detail,
            status: "running",
            startedAt: Date.now(),
          },
        ],
      }
    })
  },

  completeStreamingNodeStep: (node: string) => {
    set((state) => {
      const existingIndex = state.streamingNodeSteps.findIndex((s) => s.node === node)
      if (existingIndex < 0) return state
      const updated = [...state.streamingNodeSteps]
      updated[existingIndex] = {
        ...updated[existingIndex],
        status: "done",
        completedAt: Date.now(),
      }
      return { streamingNodeSteps: updated }
    })
  },

  completeStreamingNodeStepWithDetail: (node: string, detail: string) => {
    set((state) => {
      const existingIndex = state.streamingNodeSteps.findIndex((s) => s.node === node)
      if (existingIndex >= 0) {
        const updated = [...state.streamingNodeSteps]
        updated[existingIndex] = {
          ...updated[existingIndex],
          detail,
          status: "done",
          completedAt: Date.now(),
        }
        return { streamingNodeSteps: updated }
      }
      const nodeLabelMap: Record<string, string> = {
        intention: "意图识别",
        retrieval: "证据收集",
        reasoning: "逻辑推理",
        verdict: "综合裁决",
        "interaction-point-detection": "交互检测",
        response: "响应生成",
      }
      const now = Date.now()
      return {
        streamingNodeSteps: [
          ...state.streamingNodeSteps,
          {
            node,
            label: nodeLabelMap[node] || node,
            detail,
            status: "done",
            startedAt: now,
            completedAt: now,
          },
        ],
      }
    })
  },

  setStreamingEvidenceFromStructured: (evidenceChain: Record<string, unknown>) => {
    const evidences = evidenceChain.evidences as Array<Record<string, unknown>> | undefined
    if (!evidences || !Array.isArray(evidences)) return
    const newItems: StreamingEvidence[] = evidences
      .filter((e) => typeof e.id === "string")
      .map((e) => ({
        id: e.id as string,
        source: (e.source as string) || "unknown",
        type: (e.type as string) || "unknown",
        relevance: typeof e.relevance === "number" ? e.relevance : 0,
        summary: typeof e.summary === "string" ? e.summary : String(e.content || "").slice(0, 120),
      }))
    set((state) => {
      const existingIds = new Set(state.streamingEvidence.map((e) => e.id))
      const deduped = newItems.filter((item) => !existingIds.has(item.id))
      return { streamingEvidence: [...state.streamingEvidence, ...deduped] }
    })
  },

  setStreamingVerdict: (verdict: Record<string, unknown>) => {
    const confidence = verdict.confidence as Record<string, unknown> | undefined
    const verdictType = verdict.type as string | undefined
    const finalConfidence = confidence?.finalConfidence ?? confidence?.final_confidence
    const parts: string[] = []
    if (verdictType) parts.push(`裁决: ${verdictType}`)
    if (typeof finalConfidence === "number") parts.push(`置信度 ${finalConfidence}%`)
    if (parts.length > 0) {
      set({ streamingStatus: parts.join(", ") })
    }
  },

  setStreamingIntent: (intent: Record<string, unknown>) => {
    set({ streamingIntent: intent })
  },

  setStreamingVerdictData: (verdict: Record<string, unknown>) => {
    set({ streamingVerdictData: verdict })
  },

  setStreamingStrategyAdjustment: (adjustment: Record<string, unknown> | null) => {
    set({ streamingStrategyAdjustment: adjustment })
  },

  clearStreamingContext: () =>
    set({ streamingEvidence: [], streamingReasoningSteps: [], streamingStatus: "", streamingNodeSteps: [], streamingIntent: null, streamingVerdictData: null, streamingStrategyAdjustment: null }),

  replaceThreadId: (oldId: string, newId: string) => {
    set((state) => {
      const thread = state.threads.find((t) => t.id === oldId)
      if (!thread) return state

      const updatedThread = { ...thread, id: newId }
      const threads = state.threads.map((t) => (t.id === oldId ? updatedThread : t))
      const activeThreadId = state.activeThreadId === oldId ? newId : state.activeThreadId

      return { threads, activeThreadId }
    })
  },

  rehydrateFromServer: async (userId: string, authToken?: string) => {
    set({ isLoading: true })
    try {
      const headers: Record<string, string> = {}
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`
      }

      const threadsResp = await fetch(`/api/agent/chat/threads?userId=${userId}`, { headers })
      if (!threadsResp.ok) throw new Error(`HTTP ${threadsResp.status}`)
      const threadsData = await threadsResp.json()

      if (!threadsData.success || !Array.isArray(threadsData.data)) {
        set({ isLoading: false, isRehydrated: true, rehydratedUserId: userId })
        return
      }

      const threads: Thread[] = threadsData.data.map(
        (t: { id: string; title: string; messageCount: number; createdAt: string; updatedAt: string }) => ({
          id: t.id,
          title: t.title,
          messages: [],
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          isStreaming: false,
          status: "idle" as const,
          stats: createDefaultStats(),
        })
      )

      const activeThreadId = threads.length > 0 ? threads[0].id : null

      set({
        threads,
        activeThreadId,
        isLoading: false,
        isRehydrated: true,
        rehydratedUserId: userId,
      })

      if (activeThreadId) {
        await get().loadThreadMessages(activeThreadId, authToken)
      }
    } catch (error) {
      console.error("[CHAT-STORE] Rehydrate failed:", error)
      set({ isLoading: false, isRehydrated: true, rehydratedUserId: userId })
    }
  },

  loadThreadMessages: async (threadId: string, authToken?: string) => {
    try {
      const headers: Record<string, string> = {}
      if (authToken) {
        headers["Authorization"] = `Bearer ${authToken}`
      }

      const msgsResp = await fetch(`/api/agent/chat/threads/${threadId}/messages`, { headers })
      if (!msgsResp.ok) return
      const msgsData = await msgsResp.json()

      if (!msgsData.success || !Array.isArray(msgsData.data)) return

      const messages: Message[] = msgsData.data.map(
        (m: { role: string; content: string; metadata?: unknown; createdAt: string }) => ({
          role: m.role as Message["role"],
          content: m.content,
          timestamp: m.createdAt,
          structuredData: m.metadata as StructuredAgentResponse | undefined,
        })
      )

      set((state) => ({
        threads: state.threads.map((t) =>
          t.id === threadId ? { ...t, messages, stats: computeStatsFromMessages(messages) } : t
        ),
      }))
    } catch (error) {
      console.error(`[CHAT-STORE] Load messages failed for thread ${threadId}:`, error)
    }
  },
}))

export function useActiveMessages(): Message[] {
  const threads = useChatStore((s) => s.threads)
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const activeThread = threads.find((t) => t.id === activeThreadId)
  return activeThread?.messages || []
}

export function useActiveThreadId(): string | null {
  return useChatStore((s) => s.activeThreadId)
}

export function useActiveThreadStreaming(): boolean {
  const threads = useChatStore((s) => s.threads)
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const activeThread = threads.find((t) => t.id === activeThreadId)
  return activeThread?.isStreaming || false
}

export function useActiveThreadStatus(): ThreadStatus {
  const threads = useChatStore((s) => s.threads)
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const activeThread = threads.find((t) => t.id === activeThreadId)
  return activeThread?.status || "idle"
}

export function useActiveThreadStats(): ThreadStats {
  const threads = useChatStore((s) => s.threads)
  const activeThreadId = useChatStore((s) => s.activeThreadId)
  const activeThread = threads.find((t) => t.id === activeThreadId)
  return activeThread?.stats || createDefaultStats()
}

export function useActiveStreamCharPool(): string[] {
  return useChatStore((s) => s.streamCharPool)
}

export function useActiveStreamContent(): string {
  return useChatStore((s) => s.currentStreamContent)
}
