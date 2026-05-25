import { AgentState } from "../state"
import { agentAuditRoute } from "@/lib/agent-audit-logger"
import { getActiveTracer } from "@/agents"

export function routeByIntent(state: typeof AgentState.State) {
  const intent = state.currentTask?.intent || state.explicitIntent
  const thinkingLevel = state.currentTask?.thinkingLevel ?? "deep"
  const target = thinkingLevel === "fast" ? "response" : "retrieval"
  const reason = `thinkingLevel=${thinkingLevel}, intent=${intent || "unknown"}`

  const traceId = state.conversationContext?.traceId as string
  if (traceId) {
    const tracer = getActiveTracer(traceId)
    tracer?.recordRouteDecision("intention", target, reason, intent)
  }

  agentAuditRoute("intention", target, reason)
  return target
}

export function routeByInteractionPoint(state: typeof AgentState.State) {
  const { pendingInteraction } = state

  if (pendingInteraction) {
    const target = "response"
    const reason = `有交互点: type=${pendingInteraction.type}`

    const traceId = state.conversationContext?.traceId as string
    if (traceId) {
      const tracer = getActiveTracer(traceId)
      tracer?.recordRouteDecision("interactionPointDetection", target, reason, pendingInteraction.type)
    }

    agentAuditRoute("interactionPointDetection", target, reason)
    return target
  }

  const target = "verdict"
  const reason = "无交互点, 走裁决"

  const traceId = state.conversationContext?.traceId as string
  if (traceId) {
    const tracer = getActiveTracer(traceId)
    tracer?.recordRouteDecision("interactionPointDetection", target, reason, null)
  }

  agentAuditRoute("interactionPointDetection", target, reason)
  return target
}

export function routeByVerdictType(state: typeof AgentState.State) {
  const verdictResult = state.verdictResult
  const target = "response"
  const reason = verdictResult ? `verdictType=${verdictResult.type}` : "无裁决结果"

  const traceId = state.conversationContext?.traceId as string
  if (traceId) {
    const tracer = getActiveTracer(traceId)
    tracer?.recordRouteDecision("verdict", target, reason, verdictResult?.type || null)
  }

  agentAuditRoute("verdict", target, reason)
  return target
}
