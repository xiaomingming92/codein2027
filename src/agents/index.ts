import { StateGraph, MemorySaver } from "@langchain/langgraph"
import { AgentState } from "./state"
import {
  intentionNode,
  retrievalNode,
  reasoningNode,
  verdictNode,
  responseNode,
  interactionPointDetectionNode,
} from "./nodes"
import { routeByIntent, routeByInteractionPoint, routeByVerdictType } from "./edges"
import { agentTools } from "./tools"
import { setAgentTools } from "@/lib/llm/index"
import { agentAuditNodeStart, agentAuditNodeEnd, agentAuditNodeError } from "@/lib/agent-audit-logger"
import { ChainTracer } from "@/lib/agent-chain-tracer"
import type { ChainTrace } from "@/lib/agent-chain-tracer"
import type { AnalysisContext } from "@/services/analysis-context"
import { AuditCallback } from "@/lib/layer2-callback"

setAgentTools(agentTools as Parameters<typeof setAgentTools>[0])

const workflow = new StateGraph(AgentState)
  .addNode("intention", async (state: typeof AgentState.State) => {
    return wrapNodeWithAudit("intention", state, intentionNode)
  })
  .addNode("retrieval", async (state: typeof AgentState.State) => {
    return wrapNodeWithAudit("retrieval", state, retrievalNode)
  })
  .addNode("reasoning", async (state: typeof AgentState.State) => {
    return wrapNodeWithAudit("reasoning", state, reasoningNode)
  })
  .addNode("interactionPointDetection", async (state: typeof AgentState.State) => {
    return wrapNodeWithAudit("interactionPointDetection", state, interactionPointDetectionNode)
  })
  .addNode("verdict", async (state: typeof AgentState.State) => {
    return wrapNodeWithAudit("verdict", state, verdictNode)
  })
  .addNode("response", async (state: typeof AgentState.State) => {
    return wrapNodeWithAudit("response", state, responseNode)
  })
  .addEdge("__start__", "intention")
  .addConditionalEdges("intention", routeByIntent, [
    "retrieval",
    "response",
  ])
  .addEdge("retrieval", "reasoning")
  .addEdge("reasoning", "interactionPointDetection")
  .addConditionalEdges("interactionPointDetection", routeByInteractionPoint, [
    "verdict",
    "response",
  ])
  .addConditionalEdges("verdict", routeByVerdictType, ["response"])
  .addEdge("response", "__end__")

const checkpointer = new MemorySaver()

export const agent = workflow.compile({
  checkpointer,
})

const activeTracers = new Map<string, ChainTracer>()

async function wrapNodeWithAudit(
  nodeName: string,
  state: typeof AgentState.State,
  nodeFn: (state: typeof AgentState.State) => Promise<Record<string, unknown>>
): Promise<Record<string, unknown>> {
  const startTime = Date.now()
  const traceId = (state.conversationContext?.traceId as string) || ""

  agentAuditNodeStart(nodeName)

  try {
    const result = await nodeFn(state)
    const durationMs = Date.now() - startTime
    agentAuditNodeEnd(nodeName, durationMs)

    if (traceId && activeTracers.has(traceId)) {
      const tracer = activeTracers.get(traceId)!
      const inputSnapshot = {
        intent: state.currentTask?.intent || state.explicitIntent,
        evidenceCount: state.evidenceChain?.length || 0,
        hasVerdict: !!state.verdictResult,
        hasInteractionPoint: !!state.pendingInteraction,
        query: state.currentTask?.query?.substring(0, 100) || null,
      }
      tracer.recordNode(nodeName, inputSnapshot, result, startTime, Date.now())
    }

    return result
  } catch (error) {
    const durationMs = Date.now() - startTime
    agentAuditNodeError(nodeName, error, { durationMs })

    throw error
  }
}

export function getActiveTracer(traceId: string): ChainTracer | undefined {
  return activeTracers.get(traceId)
}

export function startChainTrace(
  threadId: string,
  trigger: ChainTrace["trigger"]
): ChainTracer {
  const tracer = new ChainTracer(threadId, trigger)
  activeTracers.set(tracer.getTraceId(), tracer)
  return tracer
}

export function endChainTrace(traceId: string): ChainTrace | null {
  const tracer = activeTracers.get(traceId)
  if (!tracer) return null
  const trace = tracer.endTrace()
  activeTracers.delete(traceId)
  return trace
}

export async function runAgent(
  input: {
    messages: Array<{ role: string; content: string }>
    user?: unknown
    project?: unknown
    explicitIntent?: string | null
    conversationContext?: Record<string, unknown>
  },
  config?: {
    configurable?: {
      thread_id?: string
    }
  }
) {
  const conversationContext = input.conversationContext || {}
  const traceId = (conversationContext.traceId as string) || "unknown"
  const userId = (conversationContext.userId as string) || "ai-assistant"

  const agentInput: Record<string, unknown> = {
    messages: input.messages,
    user: input.user || null,
    project: input.project || null,
    explicitIntent: input.explicitIntent || null,
    conversationContext,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return agent.invoke(agentInput as any, {
    ...(config as any),
    callbacks: [new AuditCallback(traceId, userId)],
  })
}

export async function streamAgent(
  input: {
    messages: Array<{ role: string; content: string }>
    user?: unknown
    project?: unknown
    explicitIntent?: string | null
    conversationContext?: Record<string, unknown>
    analysisContext?: AnalysisContext | null
  },
  config?: {
    configurable?: {
      thread_id?: string
    }
  }
) {
  const conversationContext = input.conversationContext || {}
  const traceId = (conversationContext.traceId as string) || "unknown"
  const userId = (conversationContext.userId as string) || "ai-assistant"

  const agentInput: Record<string, unknown> = {
    messages: input.messages,
    user: input.user || null,
    project: input.project || null,
    explicitIntent: input.explicitIntent || null,
    conversationContext,
    analysisContext: input.analysisContext ?? null,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return agent.stream(agentInput as any, {
    ...(config as any),
    callbacks: [new AuditCallback(traceId, userId)],
  })
}

export { agentTools }
