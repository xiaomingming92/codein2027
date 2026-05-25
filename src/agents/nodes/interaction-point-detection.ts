import { AgentState } from "../state"
import { getLLM } from "@/lib/llm/index"
import { agentAudit, agentAuditNodeError } from "@/lib/agent-audit-logger"
import { interactionPointDetectionPrompt } from "@/agents/prompts"
import type { InteractionPointInput, InteractionPointOutput } from "@/agents/prompts"
import type { InteractionPoint } from "@/agents/types"
import { NodeStreamController } from "@/agents/node-stream-controller"

export async function interactionPointDetectionNode(state: typeof AgentState.State) {
  const { currentTask, evidenceChain, verdictResult, explicitIntent } = state
  const stream = NodeStreamController.fromState(state, "interactionPointDetection")
  stream.nodeStarted()

  const intent = currentTask?.intent || explicitIntent

  if (intent !== "analysis" && intent !== "planning") {
    agentAudit("NODE_END", "interactionPointDetection: 非分析/规划意图, 跳过检测", { intent })
    stream.structuredOutput({ interactionPoint: null })
    return { pendingInteraction: null }
  }

  if (!verdictResult?.conclusion) {
    agentAudit("NODE_END", "interactionPointDetection: 无推理结论, 跳过检测", {})
    stream.structuredOutput({ interactionPoint: null })
    return { pendingInteraction: null }
  }

  const input: InteractionPointInput = {
    intent: intent as "analysis" | "planning",
    query: currentTask?.query || "",
    evidenceChain: (evidenceChain || []).map((e) => ({
      id: e.id,
      chunkId: e.chunkId,
      source: e.source,
      reliability: e.reliability,
      relevance: e.relevance,
      docName: typeof e.metadata.documentName === "string" ? e.metadata.documentName : undefined,
      contentExcerpt: e.content.slice(0, 200),
    })),
    reasoningResult: {
      conclusion: verdictResult.conclusion.content,
      actions: verdictResult.conclusion.actions,
    },
  }

  const prompt = interactionPointDetectionPrompt.build(input)

  let parsed: InteractionPointOutput

  try {
    const response = await getLLM().invoke(prompt)
    parsed = interactionPointDetectionPrompt.parse(response.content as string)

    if (!interactionPointDetectionPrompt.validate(parsed)) {
      throw new Error("Validation failed")
    }
  } catch (error) {
    agentAuditNodeError("interactionPointDetection", error, { intent })
    stream.structuredOutput({ interactionPoint: null })
    return { pendingInteraction: null }
  }

  if (!parsed.hasInteractionPoint || !parsed.interactionPoint) {
    agentAudit("NODE_END", "interactionPointDetection: 未检测到交互点", { intent })
    stream.structuredOutput({ interactionPoint: null })
    return { pendingInteraction: null }
  }

  const interactionPoint: InteractionPoint = {
    type: parsed.interactionPoint.type,
    dimension: parsed.interactionPoint.dimension,
    description: parsed.interactionPoint.description,
    options: parsed.interactionPoint.options,
  }

  agentAudit("NODE_END", `interactionPointDetection: 检测到交互点 type=${interactionPoint.type}`, {
    type: interactionPoint.type,
    dimension: interactionPoint.dimension,
    optionsCount: interactionPoint.options.length,
  })

  stream.structuredOutput({ interactionPoint })

  return { pendingInteraction: interactionPoint }
}
