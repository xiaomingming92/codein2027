import { AgentState } from "../state"
import { getLLM } from "@/lib/llm/index"
import { agentAudit, agentAuditNodeError } from "@/lib/agent-audit-logger"
import { verdictPrompt } from "@/agents/prompts"
import type { VerdictInput } from "@/agents/prompts"
import { NodeStreamController } from "@/agents/node-stream-controller"

export async function verdictNode(state: typeof AgentState.State) {
  const { evidenceChain, currentTask, verdictResult } = state
  const stream = NodeStreamController.fromState(state, "verdict")
  stream.nodeStarted()

  if (!currentTask?.query) {
    return { verdictResult: null }
  }

  const weights = calculateDefaultWeights(evidenceChain || [])

  const input: VerdictInput = {
    query: currentTask.query,
    evidenceList: (evidenceChain || []).map((e) => ({
      id: e.id,
      source: e.source,
      content: e.content,
    })),
    weights,
  }

  const prompt = verdictPrompt.build(input)
  const response = await getLLM().invoke(prompt)

  let parsed: ReturnType<typeof verdictPrompt.parse>

  try {
    parsed = verdictPrompt.parse(response.content as string)
    if (!verdictPrompt.validate(parsed)) {
      throw new Error("Validation failed")
    }

    agentAudit("NODE_END", `verdict: 裁决完成`, {
      verdictType: parsed.type,
      confidence: parsed.confidence.final_confidence,
      riskCount: parsed.conclusion.risks.length,
    })

    stream.structuredOutput({
      verdict: {
        type: parsed.type,
        conclusion: parsed.conclusion,
        confidence: parsed.confidence,
      },
    })
  } catch {
    agentAuditNodeError("verdict", new Error("JSON解析失败"), { evidenceCount: evidenceChain?.length || 0 })
    stream.structuredOutput({
      verdict: {
        type: "PATH_SELECTION",
        conclusion: { content: "裁决结果解析失败", actions: [], risks: [] },
        confidence: { final_confidence: 0 },
      },
    })
    return {
      verdictResult: {
        type: "PATH_SELECTION",
        query: currentTask.query,
        conclusion: {
          content: "裁决结果解析失败",
          actions: [],
          risks: [],
        },
        reasoning_path: verdictResult?.reasoning_path || [],
        confidence: {
          base_confidence: 0,
          reliability_discount: 0,
          conflict_discount: 0,
          final_confidence: 0,
        },
        traces: verdictResult?.traces || [],
      },
    }
  }

  return {
    verdictResult: {
      type: parsed.type,
      query: currentTask.query,
      conclusion: parsed.conclusion,
      reasoning_path: verdictResult?.reasoning_path || [],
      confidence: parsed.confidence,
      traces: verdictResult?.traces || [],
    },
  }
}

function calculateDefaultWeights(evidence: Array<{ id: string }>) {
  const weight = 1 / (evidence.length || 1)
  return evidence.reduce((acc, e) => {
    acc[e.id] = weight
    return acc
  }, {} as Record<string, number>)
}