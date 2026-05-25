import { streamBusAudit } from "@/lib/stream-bus-logger"
import type { StreamBusAuditPhase } from "@/lib/stream-bus-logger"

export interface RagSearchEvent {
  type: "rag_search"
  query: string
  status: "searching"
}

export interface EvidenceFoundEvent {
  type: "evidence_found"
  evidence: {
    id: string
    chunkId?: string
    source: string
    type: string
    relevance: number
    summary: string
  }
}

export interface RagResultEvent {
  type: "rag_result"
  count: number
  sources: Record<string, number>
}

export interface ResponseStartEvent {
  type: "response_start"
}

export interface TokenEvent {
  type: "token"
  content: string
}

export interface ResponseEndEvent {
  type: "response_end"
  fullContent: string
}

export interface StructuredUpdateEvent {
  type: "structured_update"
  data: Record<string, unknown>
}

export interface DoneEvent {
  type: "done"
  threadId: string
  traceId: string
  chainTrace?: unknown
}

export interface ErrorEvent {
  type: "error"
  message: string
}

export interface StreamingNodeEvent {
  type: "streaming_node"
  nodeName: string
  status: "started" | "done"
  detail?: string
}

export type StreamEvent =
  | RagSearchEvent
  | EvidenceFoundEvent
  | RagResultEvent
  | ResponseStartEvent
  | TokenEvent
  | ResponseEndEvent
  | StructuredUpdateEvent
  | DoneEvent
  | ErrorEvent
  | StreamingNodeEvent

const streamCallbacks = new Map<string, (event: StreamEvent) => void>()

export function registerStreamBus(traceId: string, push: (event: StreamEvent) => void): void {
  streamCallbacks.set(traceId, push)
  streamBusAudit("STREAM_BUS_REGISTER", `traceId=${traceId}`)
}

export function unregisterStreamBus(traceId: string): void {
  streamCallbacks.delete(traceId)
  streamBusAudit("STREAM_BUS_UNREGISTER", `traceId=${traceId}`)
}

export function emitStreamEvent(traceId: string, event: StreamEvent): void {
  const push = streamCallbacks.get(traceId)
  if (!push) {
    streamBusAudit("STREAM_BUS_EMIT_ERROR", `traceId=${traceId} 未注册`, {
      eventType: event.type,
    })
    return
  }

  const phase: StreamBusAuditPhase = resolveAuditPhase(event)
  const detail = buildAuditDetail(event)

  streamBusAudit(phase, detail, buildAuditExtra(event))

  try {
    push(event)
  } catch (error) {
    streamBusAudit("STREAM_BUS_EMIT_ERROR", `推送失败: ${error instanceof Error ? error.message : String(error)}`, {
      eventType: event.type,
      traceId,
    })
  }
}

function resolveAuditPhase(event: StreamEvent): StreamBusAuditPhase {
  switch (event.type) {
    case "rag_search":
      return "STREAM_BUS_EMIT_RAG_SEARCH"
    case "evidence_found":
      return "STREAM_BUS_EMIT_EVIDENCE"
    case "rag_result":
      return "STREAM_BUS_EMIT_RAG_RESULT"
    case "token":
      return "STREAM_BUS_EMIT_TOKEN"
    case "structured_update":
      return "STREAM_BUS_EMIT_STRUCTURED"
    case "done":
      return "STREAM_BUS_EMIT_DONE"
    case "streaming_node":
      return "STREAM_BUS_EMIT"
    default:
      return "STREAM_BUS_EMIT"
  }
}

function buildAuditDetail(event: StreamEvent): string {
  switch (event.type) {
    case "rag_search":
      return `RAG搜索: ${event.query.slice(0, 50)}`
    case "evidence_found":
      return `证据: ${event.evidence.source}/${event.evidence.id}`
    case "rag_result":
      return `RAG结果: ${event.count}条`
    case "response_start":
      return "回复流式开始"
    case "token":
      return `token: ${event.content.slice(0, 10)}`
    case "response_end":
      return `回复流式结束: ${event.fullContent.length}字符`
    case "structured_update":
      return `结构化更新: ${Object.keys(event.data).join(", ")}`
    case "done":
      return `完成: threadId=${event.threadId}`
    case "error":
      return `错误: ${event.message}`
    case "streaming_node":
      return `节点${event.status}: ${event.nodeName}`
  }
}

function buildAuditExtra(event: StreamEvent): Record<string, unknown> | undefined {
  switch (event.type) {
    case "rag_search":
      return { query: event.query.slice(0, 100) }
    case "evidence_found":
      return {
        evidenceId: event.evidence.id,
        source: event.evidence.source,
        relevance: event.evidence.relevance,
      }
    case "rag_result":
      return { count: event.count, sources: event.sources }
    case "token":
      return undefined
    case "response_end":
      return { contentLength: event.fullContent.length }
    case "structured_update":
      return { keys: Object.keys(event.data) }
    case "done":
      return { threadId: event.threadId, traceId: event.traceId }
    default:
      return undefined
  }
}