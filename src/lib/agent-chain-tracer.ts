import { randomUUID } from "crypto"

export interface ChainTrace {
  traceId: string
  threadId: string
  startTime: number
  endTime?: number
  totalDurationMs?: number

  trigger: {
    type: "button_click" | "manual_send" | "file_upload"
    buttonId?: string
    explicitIntent?: string
    userInput: string
  }

  nodes: Array<{
    nodeName: string
    startTime: number
    endTime: number
    durationMs: number
    inputSnapshot: Record<string, unknown>
    outputSnapshot: Record<string, unknown>
    routeDecision?: {
      from: string
      to: string
      reason: string
      conditionValue: unknown
    }
  }>

  evidenceChainSnapshot: {
    before: Array<{ id: string; source: string }>
    after: Array<{ id: string; source: string }>
    diff: Array<{
      action: "added" | "removed" | "modified"
      evidenceId: string
      details: string
    }>
  }
}

export class ChainTracer {
  private trace: ChainTrace
  private evidenceBefore: Array<{ id: string; source: string }> = []

  constructor(threadId: string, trigger: ChainTrace["trigger"]) {
    this.trace = {
      traceId: randomUUID(),
      threadId,
      startTime: Date.now(),
      trigger,
      nodes: [],
      evidenceChainSnapshot: {
        before: [],
        after: [],
        diff: [],
      },
    }
  }

  getTraceId(): string {
    return this.trace.traceId
  }

  setEvidenceBefore(evidences: Array<{ id: string; source: string }>): void {
    this.evidenceBefore = [...evidences]
    this.trace.evidenceChainSnapshot.before = [...evidences]
  }

  recordNode(
    nodeName: string,
    inputSnapshot: Record<string, unknown>,
    outputSnapshot: Record<string, unknown>,
    startTime: number,
    endTime: number
  ): void {
    this.trace.nodes.push({
      nodeName,
      startTime,
      endTime,
      durationMs: endTime - startTime,
      inputSnapshot: this.sanitizeSnapshot(inputSnapshot),
      outputSnapshot: this.sanitizeSnapshot(outputSnapshot),
    })
  }

  recordRouteDecision(
    from: string,
    to: string,
    reason: string,
    conditionValue: unknown
  ): void {
    const lastNode = this.trace.nodes[this.trace.nodes.length - 1]
    if (lastNode) {
      lastNode.routeDecision = { from, to, reason, conditionValue }
    }
  }

  recordEvidenceDiff(evidencesAfter: Array<{ id: string; source: string }>): void {
    this.trace.evidenceChainSnapshot.after = [...evidencesAfter]

    const beforeIds = new Set(this.evidenceBefore.map((e) => e.id))
    const afterIds = new Set(evidencesAfter.map((e) => e.id))

    for (const e of evidencesAfter) {
      if (!beforeIds.has(e.id)) {
        this.trace.evidenceChainSnapshot.diff.push({
          action: "added",
          evidenceId: e.id,
          details: `来源: ${e.source}`,
        })
      }
    }

    for (const e of this.evidenceBefore) {
      if (!afterIds.has(e.id)) {
        this.trace.evidenceChainSnapshot.diff.push({
          action: "removed",
          evidenceId: e.id,
          details: `来源: ${e.source}`,
        })
      }
    }
  }

  endTrace(): ChainTrace {
    this.trace.endTime = Date.now()
    this.trace.totalDurationMs = this.trace.endTime - this.trace.startTime
    return { ...this.trace }
  }

  getTrace(): ChainTrace {
    return { ...this.trace }
  }

  private sanitizeSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(snapshot)) {
      if (typeof value === "string" && value.length > 500) {
        sanitized[key] = value.substring(0, 500) + "...[truncated]"
      } else if (Array.isArray(value) && value.length > 10) {
        sanitized[key] = value.slice(0, 10)
      } else {
        sanitized[key] = value
      }
    }
    return sanitized
  }
}
