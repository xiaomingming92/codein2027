import { PromptTemplate, ResponseInput, ResponseOutput } from "./types"

export const responsePrompt: PromptTemplate<ResponseInput, ResponseOutput> = {
  id: "response",
  name: "回复生成",
  description: "基于推理结果和交互点生成结构化的用户回复",

  build(input: ResponseInput): string {
    const parts: string[] = []

    parts.push(`用户问题：${input.query}`)
    parts.push(`意图类型：${input.intent}`)

    if (input.verdictResult) {
      parts.push(`\n裁决类型：${input.verdictResult.type}`)
      parts.push(`裁决结论：${input.verdictResult.conclusion.content}`)
      if (input.verdictResult.conclusion.actions.length > 0) {
        parts.push(`建议行动：${input.verdictResult.conclusion.actions.join("、")}`)
      }
      if (input.verdictResult.conclusion.risks.length > 0) {
        parts.push(`风险提示：${input.verdictResult.conclusion.risks.map((r) => `[${r.level}] ${r.description}`).join("；")}`)
      }
      parts.push(`置信度：${input.verdictResult.confidence.final_confidence}%`)
    }

    if (input.interactionPoint) {
      parts.push(`\n需要用户交互：${input.interactionPoint.description}`)
      parts.push(`选项：${input.interactionPoint.options.map((o) => o.label).join("、")}`)
    }

    if (input.retrievedDocuments && input.retrievedDocuments.length > 0) {
      parts.push(`\n以下是检索到的相关文档内容：`)
      for (const doc of input.retrievedDocuments) {
        parts.push(`---`)
        parts.push(`文档来源：${doc.source}（关联度：${(doc.relevance * 100).toFixed(1)}%）`)
        parts.push(doc.content)
        parts.push(`---`)
      }
      parts.push(`\n要求：`)
      parts.push(`1. 回复必须基于上述文档内容`)
      parts.push(`2. 引用文档内容时标注来源文档名称`)
      parts.push(`3. 如果用户要求查看完整文档，在回复中展示文档的主要内容`)
      parts.push(`4. 不要编造文档中没有的信息`)
    }

    return `
你是一个专业的回复生成助手，需要基于以下信息生成结构化的用户回复。

${parts.join("\n")}

请返回以下格式的 JSON：
{
  "summary": "一句话摘要",
  "sections": [
    {"type": "conclusion", "title": "结论", "content": "结论内容", "expandable": false, "dataRef": "verdict"},
    {"type": "evidence", "title": "证据链", "content": "证据摘要", "expandable": true, "dataRef": "evidenceChain"},
    {"type": "reasoning", "title": "推理路径", "content": "推理步骤摘要", "expandable": true, "dataRef": "reasoningPath"},
    {"type": "confidence", "title": "置信度", "content": "置信度信息", "expandable": true, "dataRef": "confidence"},
    {"type": "risk", "title": "风险提示", "content": "风险摘要", "expandable": true, "dataRef": "risks"},
    {"type": "interaction", "title": "需要您的决策", "content": "交互点描述", "expandable": false, "dataRef": "interactionPoint"}
  ]
}

注意：
1. 只包含有数据的 section，没有数据的不要包含
2. 如果有交互点，必须包含 type 为 "interaction" 的 section
3. summary 要简洁明了
4. 只返回 JSON。
`
  },

  parse(raw: string): ResponseOutput {
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    const parsed = JSON.parse(cleaned)

    const validTypes: ResponseOutput["sections"][number]["type"][] = [
      "conclusion", "evidence", "reasoning", "confidence", "risk", "interaction",
    ]

    return {
      summary: String(parsed.summary || ""),
      sections: Array.isArray(parsed.sections)
        ? parsed.sections
            .filter((s: Record<string, unknown>) => validTypes.includes(s.type as ResponseOutput["sections"][number]["type"]))
            .map((s: Record<string, unknown>) => ({
              type: s.type as ResponseOutput["sections"][number]["type"],
              title: String(s.title || ""),
              content: String(s.content || ""),
              expandable: Boolean(s.expandable),
              dataRef: String(s.dataRef || ""),
            }))
        : [],
    }
  },

  validate(output: ResponseOutput): boolean {
    if (typeof output.summary !== "string") return false
    if (!Array.isArray(output.sections)) return false
    const validTypes = ["conclusion", "evidence", "reasoning", "confidence", "risk", "interaction"]
    for (const section of output.sections) {
      if (!validTypes.includes(section.type)) return false
      if (typeof section.title !== "string") return false
      if (typeof section.dataRef !== "string") return false
    }
    return true
  },
}
