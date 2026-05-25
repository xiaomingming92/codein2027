import { PromptTemplate, VerdictInput, VerdictOutput } from "./types"

export const verdictPrompt: PromptTemplate<VerdictInput, VerdictOutput> = {
  id: "verdict",
  name: "业务裁决",
  description: "基于证据链和权重进行深度裁决，输出裁决类型、结论、风险和置信度",

  build(input: VerdictInput): string {
    const evidenceList = input.evidenceList
      .map((e) => `[${e.id}] 来源: ${e.source}, 内容摘要: ${e.contentExcerpt || "无摘要"}, 权重: ${input.weights[e.id] || 0}`)
      .join("\n")

    return `
你是一个专业的业务裁决助手，需要基于证据链进行深度裁决。

裁决问题：${input.query}

证据链及权重：
${evidenceList}

请根据证据链和权重进行裁决，返回以下格式的 JSON：
{
  "type": "PRIORITY_DECISION | RISK_ASSESSMENT | RESOURCE_ALLOCATION | COST_BENEFIT | TIMELINE_ESTIMATION | PATH_SELECTION",
  "conclusion": {
    "content": "裁决结论",
    "actions": ["建议行动1", "建议行动2"],
    "risks": [
      {"level": "low | medium | high", "description": "风险描述", "probability": 0.1, "impact": "影响描述"}
    ]
  },
  "confidence": {
    "base_confidence": 80,
    "reliability_discount": 5,
    "conflict_discount": 3,
    "final_confidence": 72
  }
}

只返回 JSON。
`
  },

  parse(raw: string): VerdictOutput {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    const parsed = JSON.parse(cleaned)

    const validTypes: VerdictOutput["type"][] = [
      "PRIORITY_DECISION", "RISK_ASSESSMENT", "RESOURCE_ALLOCATION",
      "COST_BENEFIT", "TIMELINE_ESTIMATION", "PATH_SELECTION",
    ]
    const type = validTypes.includes(parsed.type) ? parsed.type : "PATH_SELECTION"

    return {
      type,
      conclusion: {
        content: String(parsed.conclusion?.content || "裁决完成"),
        actions: Array.isArray(parsed.conclusion?.actions) ? parsed.conclusion.actions.map(String) : [],
        risks: Array.isArray(parsed.conclusion?.risks)
          ? parsed.conclusion.risks.map((r: Record<string, unknown>) => ({
              level: (["low", "medium", "high"].includes(r.level as string) ? r.level : "low") as "low" | "medium" | "high",
              description: String(r.description || ""),
              probability: Number(r.probability || 0),
              impact: String(r.impact || ""),
            }))
          : [],
      },
      confidence: {
        base_confidence: Number(parsed.confidence?.base_confidence || 0),
        reliability_discount: Number(parsed.confidence?.reliability_discount || 0),
        conflict_discount: Number(parsed.confidence?.conflict_discount || 0),
        final_confidence: Number(parsed.confidence?.final_confidence || 0),
      },
    }
  },

  validate(output: VerdictOutput): boolean {
    const validTypes: VerdictOutput["type"][] = [
      "PRIORITY_DECISION", "RISK_ASSESSMENT", "RESOURCE_ALLOCATION",
      "COST_BENEFIT", "TIMELINE_ESTIMATION", "PATH_SELECTION",
    ]
    if (!validTypes.includes(output.type)) return false
    if (!output.conclusion || typeof output.conclusion.content !== "string") return false
    if (!output.confidence || typeof output.confidence.final_confidence !== "number") return false
    return true
  },
}
