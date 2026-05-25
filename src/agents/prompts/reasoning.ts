import { PromptTemplate, ReasoningInput, ReasoningOutput } from "./types"

export const reasoningPrompt: PromptTemplate<ReasoningInput, ReasoningOutput> = {
  id: "reasoning",
  name: "深度推理",
  description: "基于证据链进行深度推理，输出推理路径、结论和置信度",

  build(input: ReasoningInput): string {
    const evidenceList = input.evidenceList
      .map((e) => `[${e.id}] 来源: ${e.source}, 内容摘要: ${e.contentExcerpt || "无摘要"}, 可靠性: ${e.reliability}`)
      .join("\n")

    return `
你是一个专业的推理助手，需要基于以下证据进行深度推理。

用户问题：${input.query}

证据列表：
${evidenceList}

请严格按照以下格式输出推理过程和结论 JSON：
{
  "reasoning_path": [
    {
      "step": 1,
      "action": "evidence_integration",
      "input_evidence": ["E1"],
      "intermediate_result": "综合得分计算",
      "description": "整合证据计算综合得分"
    }
  ],
  "traces": ["根据[E1]确认...", "根据[E2]计算..."],
  "conclusion": {
    "content": "最终结论内容",
    "actions": ["建议行动1", "建议行动2"]
  },
  "confidence": {
    "base_confidence": 85,
    "reliability_discount": 5,
    "conflict_discount": 2,
    "final_confidence": 78
  }
}

只返回 JSON。
`
  },

  parse(raw: string): ReasoningOutput {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    const parsed = JSON.parse(cleaned)

    return {
      reasoning_path: Array.isArray(parsed.reasoning_path)
        ? parsed.reasoning_path.map((step: Record<string, unknown>, index: number) => ({
            step: typeof step.step === "number" ? step.step : index + 1,
            action: String(step.action || "unknown"),
            input_evidence: Array.isArray(step.input_evidence) ? step.input_evidence : [],
            intermediate_result: step.intermediate_result,
            description: String(step.description || ""),
          }))
        : [],
      traces: Array.isArray(parsed.traces) ? parsed.traces.map(String) : [],
      conclusion: {
        content: String(parsed.conclusion?.content || "推理完成"),
        actions: Array.isArray(parsed.conclusion?.actions) ? parsed.conclusion.actions.map(String) : [],
      },
      confidence: {
        base_confidence: Number(parsed.confidence?.base_confidence || 0),
        reliability_discount: Number(parsed.confidence?.reliability_discount || 0),
        conflict_discount: Number(parsed.confidence?.conflict_discount || 0),
        final_confidence: Number(parsed.confidence?.final_confidence || 0),
      },
    }
  },

  validate(output: ReasoningOutput): boolean {
    if (!Array.isArray(output.reasoning_path)) return false
    if (!Array.isArray(output.traces)) return false
    if (!output.conclusion || typeof output.conclusion.content !== "string") return false
    if (!output.confidence || typeof output.confidence.final_confidence !== "number") return false
    return true
  },
}
