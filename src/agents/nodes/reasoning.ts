import { AgentState } from "../state"
import { getLLM } from "@/lib/llm/index"
import { agentAudit, agentAuditNodeError } from "@/lib/agent-audit-logger"
import { reasoningPrompt } from "@/agents/prompts"
import type { ReasoningInput } from "@/agents/prompts"
import { NodeStreamController } from "@/agents/node-stream-controller"

export async function reasoningNode(state: typeof AgentState.State) {
  const { currentTask, evidenceChain } = state
  const stream = NodeStreamController.fromState(state, "reasoning")
  stream.nodeStarted()

  if (!currentTask?.query || !evidenceChain || evidenceChain.length === 0) {
    agentAudit("NODE_END", "reasoning: 无证据, 跳过推理", { evidenceCount: 0, confidence: 0 })
    stream.structuredOutput({
      reasoningPath: { steps: [], traces: [] },
    })
    return {
      verdictResult: {
        type: "question",
        query: currentTask?.query || "",
        conclusion: {
          content: "无法进行推理，缺乏足够的证据。",
          actions: [],
          risks: [],
        },
        reasoning_path: [],
        confidence: {
          base_confidence: 0,
          reliability_discount: 0,
          conflict_discount: 0,
          final_confidence: 0,
        },
        traces: [],
      },
    }
  }

  agentAudit("NODE_START", `reasoning: 基于 ${evidenceChain.length} 条证据推理`)

  const input: ReasoningInput = {
    query: currentTask.query,
    evidenceList: evidenceChain.map((e) => ({
      id: e.id,
      source: e.source,
      content: e.content,
      reliability: e.reliability,
    })),
  }

  const prompt = reasoningPrompt.build(input)
  const response = await getLLM().invoke(prompt)

  let parsed: ReturnType<typeof reasoningPrompt.parse>

  try {
    parsed = reasoningPrompt.parse(response.content as string)
    if (!reasoningPrompt.validate(parsed)) {
      throw new Error("Validation failed")
    }
    agentAudit("NODE_END", `reasoning: 推理完成`, {
      evidenceCount: evidenceChain.length,
      stepsCount: parsed.reasoning_path.length,
      confidence: parsed.confidence.final_confidence,
    })

    stream.structuredOutput({
      reasoningPath: {
        steps: parsed.reasoning_path.map((step) => ({
          step: step.step,
          action: step.action,
          description: step.description,
        })),
        traces: parsed.traces || [],
      },
    })
  } catch {
    agentAuditNodeError("reasoning", new Error("JSON解析失败"), { evidenceCount: evidenceChain.length })
    stream.structuredOutput({
      reasoningPath: { steps: [], traces: [] },
    })
    return {
      verdictResult: {
        type: currentTask.intent || "question",
        query: currentTask.query,
        conclusion: {
          content: "推理结果解析失败",
          actions: [],
          risks: [],
        },
        reasoning_path: [],
        confidence: {
          base_confidence: 0,
          reliability_discount: 0,
          conflict_discount: 0,
          final_confidence: 0,
        },
        traces: [],
      },
    }
  }

  return {
    verdictResult: {
      type: currentTask.intent || "question",
      query: currentTask.query,
      conclusion: {
        content: parsed.conclusion.content,
        actions: parsed.conclusion.actions,
        risks: [],
      },
      reasoning_path: parsed.reasoning_path,
      confidence: parsed.confidence,
      traces: parsed.traces,
    },
  }
}
