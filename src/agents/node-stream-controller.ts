import { emitStreamEvent } from "./stream-bus"
import type { StreamEvent } from "./stream-bus"
import type { AgentStateType } from "./state"
import { randomUUID } from "crypto"

export class NodeStreamController {
  readonly traceId: string
  readonly nodeName: string

  constructor(traceId: string, nodeName: string) {
    this.traceId = traceId
    this.nodeName = nodeName
  }

  static extractTraceId(state: AgentStateType): string {
    return (state.conversationContext?.traceId as string) || randomUUID()
  }

  static fromState(state: AgentStateType, nodeName: string): NodeStreamController {
    return new NodeStreamController(NodeStreamController.extractTraceId(state), nodeName)
  }

  private emit(event: StreamEvent): void {
    emitStreamEvent(this.traceId, event)
  }

  structuredOutput(data: Record<string, unknown>): void {
    this.emit({ type: "structured_update", data })
  }

  token(content: string): void {
    this.emit({ type: "token", content })
  }

  ragSearch(query: string): void {
    this.emit({ type: "rag_search", query, status: "searching" })
  }

  evidenceFound(evidence: {
    id: string
    chunkId?: string
    source: string
    type: string
    relevance: number
    summary: string
  }): void {
    this.emit({ type: "evidence_found", evidence })
  }

  ragResult(count: number, sources: Record<string, number>): void {
    this.emit({ type: "rag_result", count, sources })
  }

  responseStart(): void {
    this.emit({ type: "response_start" })
  }

  responseEnd(fullContent: string): void {
    this.emit({ type: "response_end", fullContent })
  }

  nodeStarted(): void {
    this.emit({ type: "streaming_node", nodeName: this.nodeName, status: "started" })
  }

  nodeCompleted(detail?: string): void {
    this.emit({ type: "streaming_node", nodeName: this.nodeName, status: "done", detail })
  }

  emitStrategyAdjustment(signals: Array<{
    metric: string
    severity: "low" | "medium" | "high"
    action: string
    detail: { current: number; threshold: number; description: string }
  }>, dominantAction: string | null, promptSupplement: string): void {
    this.emit({ type: "strategy_adjustment", signals, dominantAction, promptSupplement })
  }
}
