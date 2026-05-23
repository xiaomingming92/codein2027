import { PromptTemplate, InteractionPointInput, InteractionPointOutput } from "./types"

export const interactionPointDetectionPrompt: PromptTemplate<InteractionPointInput, InteractionPointOutput> = {
  id: "interaction-point-detection",
  name: "交互点检测",
  description: "检测分析/规划结果中的决策点、权衡点、澄清点和确认点",

  build(input: InteractionPointInput): string {
    const evidenceSummary = input.evidenceChain
      .map((e) => `[${e.id}] ${e.source}: ${e.content.substring(0, 100)}`)
      .join("\n")

    const intentLabel = input.intent === "analysis" ? "分析" : "规划"

    return `
你是一个交互点检测助手，需要判断${intentLabel}结果中是否包含需要用户介入的关键点。

用户原始问题：${input.query}

证据链摘要：
${evidenceSummary}

推理结论：${input.reasoningResult.conclusion}
建议行动：${input.reasoningResult.actions.join("、")}

请判断是否存在需要用户做决策、权衡、澄清或确认的关键点，返回以下格式的 JSON：
{
  "hasInteractionPoint": true/false,
  "interactionPoint": {
    "type": "decision | tradeoff | clarification | confirmation",
    "dimension": "决策维度（如：cost_vs_time, priority, resource_allocation）",
    "description": "向用户提出的具体问题，如：'根据分析，你需要决策：X还是Y？'",
    "options": [
      {"label": "选项A", "reason": "选择理由", "impact": "选择后的影响"},
      {"label": "选项B", "reason": "选择理由", "impact": "选择后的影响"}
    ]
  }
}

如果推理结论明确、无需用户介入，则 hasInteractionPoint 设为 false，不返回 interactionPoint。
只返回 JSON。
`
  },

  parse(raw: string): InteractionPointOutput {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    const parsed = JSON.parse(cleaned)

    if (!parsed.hasInteractionPoint || !parsed.interactionPoint) {
      return { hasInteractionPoint: false }
    }

    const validTypes: Array<"decision" | "tradeoff" | "clarification" | "confirmation"> = [
      "decision", "tradeoff", "clarification", "confirmation",
    ]
    const type: "decision" | "tradeoff" | "clarification" | "confirmation" = validTypes.includes(parsed.interactionPoint.type)
      ? parsed.interactionPoint.type
      : "clarification"

    return {
      hasInteractionPoint: true,
      interactionPoint: {
        type,
        dimension: parsed.interactionPoint.dimension || undefined,
        description: String(parsed.interactionPoint.description || ""),
        options: Array.isArray(parsed.interactionPoint.options)
          ? parsed.interactionPoint.options.map((o: Record<string, unknown>) => ({
              label: String(o.label || ""),
              reason: String(o.reason || ""),
              impact: String(o.impact || ""),
            }))
          : [],
      },
    }
  },

  validate(output: InteractionPointOutput): boolean {
    if (typeof output.hasInteractionPoint !== "boolean") return false
    if (output.hasInteractionPoint && !output.interactionPoint) return false
    if (output.interactionPoint) {
      const validTypes = ["decision", "tradeoff", "clarification", "confirmation"]
      if (!validTypes.includes(output.interactionPoint.type)) return false
      if (typeof output.interactionPoint.description !== "string") return false
      if (!Array.isArray(output.interactionPoint.options)) return false
    }
    return true
  },
}
