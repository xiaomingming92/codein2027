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
import { agentAudit, agentAuditNodeStart, agentAuditNodeEnd, agentAuditNodeError } from "@/lib/agent-audit-logger"
import { ChainTracer } from "@/lib/agent-chain-tracer"
import type { ChainTrace } from "@/lib/agent-chain-tracer"
import { prisma } from "@/lib/prisma"

setAgentTools(agentTools as Parameters<typeof setAgentTools>[0])

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

async function auditNodeEvent(
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
        targetType: "AGENT_NODE",
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
  if (traceId) {
    auditNodeEvent(traceId, `NODE_START_${nodeName}`, { nodeName })
  }

  try {
    const result = await nodeFn(state)
    const durationMs = Date.now() - startTime
    agentAuditNodeEnd(nodeName, durationMs)

    if (traceId) {
      auditNodeEvent(traceId, `NODE_END_${nodeName}`, {
        nodeName,
        durationMs,
        hasResult: !!result,
        resultKeys: Object.keys(result),
      })
    }

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

    if (traceId) {
      auditNodeEvent(traceId, `NODE_ERROR_${nodeName}`, {
        nodeName,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      })
    }

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
  const agentInput: Record<string, unknown> = {
    messages: input.messages,
    user: input.user || null,
    project: input.project || null,
    explicitIntent: input.explicitIntent || null,
    conversationContext: input.conversationContext || {},
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return agent.invoke(agentInput as any, config as any)
}

export async function streamAgent(
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
  const agentInput: Record<string, unknown> = {
    messages: input.messages,
    user: input.user || null,
    project: input.project || null,
    explicitIntent: input.explicitIntent || null,
    conversationContext: input.conversationContext || {},
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return agent.stream(agentInput as any, config as any)
}

export { agentTools }
