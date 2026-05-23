import { AgentState } from "../state"
import { getLLM } from "@/lib/llm/index"
import { agentAudit } from "@/lib/agent-audit-logger"
import type { ResponseInput } from "@/agents/prompts"
import type {
  StructuredAgentResponse,
  StructuredEvidenceChain,
  StructuredReasoningPath,
  StructuredVerdict,
  DisplayContent,
} from "@/agents/types"
import { NodeStreamController } from "@/agents/node-stream-controller"
import { randomUUID } from "crypto"

export async function responseNode(state: typeof AgentState.State) {
  const { currentTask, verdictResult, messages, evidenceChain, pendingInteraction, explicitIntent } = state

  const userMessage = messages[messages.length - 1]?.content || ""
  const stream = NodeStreamController.fromState(state, "response")
  stream.nodeStarted()
  const traceId = stream.traceId || randomUUID()
  const intent = currentTask?.intent || explicitIntent || "chat"

  const structuredEvidenceChain: StructuredEvidenceChain = {
    evidences: (evidenceChain || []).map((e) => ({
      id: e.id,
      source: e.source,
      type: e.type,
      content: e.content,
      reliability: e.reliability,
      relevance: e.relevance,
      timestamp: e.timestamp,
      metadata: e.metadata,
      expandable: e.expandable ?? true,
      detailUrl: e.detailUrl,
    })),
    totalScore: (evidenceChain || []).reduce((sum, e) => sum + e.reliability * e.relevance, 0),
    sourceBreakdown: (evidenceChain || []).reduce<Record<string, number>>((acc, e) => {
      acc[e.source] = (acc[e.source] || 0) + 1
      return acc
    }, {}),
  }

  const structuredReasoningPath: StructuredReasoningPath = {
    steps: (verdictResult?.reasoning_path || []).map((step) => ({
      step: step.step,
      action: step.action,
      inputEvidenceIds: step.input_evidence,
      intermediateResult: step.intermediate_result,
      description: step.description,
      expandable: true,
    })),
    traces: verdictResult?.traces || [],
  }

  const structuredVerdict: StructuredVerdict | null = verdictResult
    ? {
        type: verdictResult.type,
        conclusion: {
          content: verdictResult.conclusion.content,
          actions: verdictResult.conclusion.actions,
          risks: (verdictResult.conclusion.risks || []).map((r) => ({
            level: (["low", "medium", "high"].includes(r.level) ? r.level : "low") as "low" | "medium" | "high",
            description: r.description,
            probability: r.probability,
            impact: r.impact,
            expandable: true,
          })),
        },
        confidence: {
          baseConfidence: verdictResult.confidence.base_confidence,
          reliabilityDiscount: verdictResult.confidence.reliability_discount,
          conflictDiscount: verdictResult.confidence.conflict_discount,
          finalConfidence: verdictResult.confidence.final_confidence,
          breakdown: [
            { factor: "基础置信度", value: verdictResult.confidence.base_confidence, reason: "LLM 初始评估" },
            { factor: "可靠性折扣", value: -verdictResult.confidence.reliability_discount, reason: "证据可靠性不足" },
            { factor: "冲突折扣", value: -verdictResult.confidence.conflict_discount, reason: "证据间存在冲突" },
          ],
        },
      }
    : null

  let responseContent: string
  let displayContent: DisplayContent

  stream.responseStart()

  if (verdictResult || pendingInteraction) {
    const input: ResponseInput = {
      query: typeof userMessage === "string" ? userMessage : JSON.stringify(userMessage),
      intent,
      verdictResult: verdictResult
        ? {
            type: (verdictResult.type || "PATH_SELECTION") as NonNullable<ResponseInput["verdictResult"]>["type"],
            conclusion: {
              content: verdictResult.conclusion.content,
              actions: verdictResult.conclusion.actions,
              risks: verdictResult.conclusion.risks.map((r) => ({
                level: (["low", "medium", "high"].includes(r.level) ? r.level : "low") as "low" | "medium" | "high",
                description: r.description,
                probability: r.probability,
                impact: r.impact,
              })),
            },
            confidence: verdictResult.confidence,
          }
        : undefined,
      interactionPoint: pendingInteraction || undefined,
      retrievedDocuments: (evidenceChain || [])
        .filter(e => e.source === "knowledge")
        .map(e => ({
          source: (e.metadata?.documentName as string) || e.source,
          content: e.content,
          relevance: e.relevance,
          isFullDocumentRequest: (e.metadata?.isFullDocumentRequest as boolean) || false,
        })),
    }

    const streamingPrompt = buildStreamingTextPrompt(input)

    const llmStream = await getLLM().stream(streamingPrompt)
    let rawContent = ""

    for await (const chunk of llmStream) {
      const token = typeof chunk.content === "string" ? chunk.content : ""
      if (!token) continue
      rawContent += token
      stream.token(token)
    }

    displayContent = buildDisplayFromState(verdictResult, pendingInteraction, rawContent, structuredEvidenceChain)
    responseContent = rawContent.trim()
  } else if (currentTask?.query) {
    const knowledgeDocs = (evidenceChain || [])
      .filter(e => e.source === "knowledge")
      .map(e => `---\n文档来源：${(e.metadata?.documentName as string) || e.source}\n${e.content}\n---`)
      .join("\n\n")

    const docInstruction = knowledgeDocs
      ? `\n\n以下是检索到的相关文档内容：\n${knowledgeDocs}\n\n要求：回复必须基于上述文档内容，引用时标注来源，不要编造文档中没有的信息。`
      : ""

    const prompt = `
用户问题：${userMessage}
任务意图：${intent}
${docInstruction}
请生成一个友好的回复，不需要包含推理过程。
`
    const llmStream = await getLLM().stream(prompt)
    responseContent = ""

    for await (const chunk of llmStream) {
      const token = typeof chunk.content === "string" ? chunk.content : ""
      if (!token) continue
      responseContent += token
      stream.token(token)
    }

    displayContent = {
      summary: responseContent,
      sections: [
        { type: "conclusion", title: "回复", content: responseContent, expandable: false, dataRef: "direct" },
      ],
    }
  } else {
    responseContent = "您好！我是团队协同智能体，有什么可以帮助您的？"
    stream.token(responseContent)
    displayContent = {
      summary: responseContent,
      sections: [],
    }
  }

  stream.responseEnd(responseContent)

  const structuredResponse: StructuredAgentResponse = {
    traceId,
    intent: {
      type: intent,
      source: explicitIntent ? "explicit" : "llm_parsed",
      original: typeof userMessage === "string" ? userMessage : JSON.stringify(userMessage),
    },
    evidenceChain: structuredEvidenceChain,
    reasoningPath: structuredReasoningPath,
    verdict: structuredVerdict,
    interactionPoint: pendingInteraction,
    displayContent,
  }

  stream.structuredOutput({
    evidenceChain: structuredResponse.evidenceChain,
    reasoningPath: structuredResponse.reasoningPath,
    verdict: structuredResponse.verdict,
    interactionPoint: structuredResponse.interactionPoint,
    displayContent: structuredResponse.displayContent,
  })

  agentAudit("NODE_END", `response: 回复生成完成`, {
    contentLength: responseContent.length,
    hasVerdict: !!verdictResult,
    hasInteractionPoint: !!pendingInteraction,
    hasStructuredResponse: true,
  })

  return {
    messages: [
      {
        role: "assistant",
        content: responseContent,
        name: "agent",
      },
    ],
    structuredResponse,
  }
}

function buildStreamingTextPrompt(input: ResponseInput): string {
  const parts: string[] = []
  parts.push(`用户问题：${input.query}`)
  parts.push(`意图类型：${input.intent}`)

  if (input.verdictResult) {
    parts.push(`\n裁决结论：${input.verdictResult.conclusion.content}`)
    if (input.verdictResult.conclusion.actions.length > 0) {
      parts.push(`建议行动：${input.verdictResult.conclusion.actions.join("、")}`)
    }
    const actionWarning = input.verdictResult.conclusion.actions.length > 0
      ? "提到的建议行动应在回复中体现"
      : ""
    parts.push(`${actionWarning}`)
  }

  if (input.interactionPoint) {
    parts.push(`\n需要用户决策：${input.interactionPoint.description}`)
    parts.push(`选项：${input.interactionPoint.options.map((o) => o.label).join("、")}`)
  }

  if (input.retrievedDocuments && input.retrievedDocuments.length > 0) {
    parts.push(`\n以下为检索到的参考文档：`)
    for (const doc of input.retrievedDocuments) {
      parts.push(`[来源：${doc.source}] ${doc.content.slice(0, 500)}`)
    }
    parts.push(`要求：回复须基于以上文档，标注来源，不编造。`)
  }

  return `
你是一个专业的团队协同智能体，负责协调推进团队项目（当前聚焦农业智能体领域，后续可拓展）。请基于以下信息生成结构化的计划导向回复。

${parts.join("\n")}

要求：
1. 用自然语言回复，保持结构化表达.但不能用代码块或者JSON
2. 先给出总体结论或计划摘要，再按优先级/依赖关系展开详细内容
3. 如果涉及多项行动，按计划项的方式清晰列出（含时间/资源建议）
4. 如果有风险或关键决策点，用结构化方式明确提示
5. 如果有需要用户决策的交互点，在回复末尾列出选项并引导用户选择
6. 语气专业、协同导向，体现对农业智能体开发项目的统筹推进
`
}

function buildDisplayFromState(
  verdictResult: typeof AgentState.State extends { verdictResult: infer T } ? T : never,
  pendingInteraction: typeof AgentState.State extends { pendingInteraction: infer T } ? T : never,
  streamedText: string,
  evidenceChain: StructuredEvidenceChain
): DisplayContent {
  const sections: DisplayContent["sections"] = []

  if (evidenceChain.evidences.length > 0) {
    const summary = evidenceChain.evidences.map((e) => `[${e.source}] ${e.content.slice(0, 100)}`).join("\n")
    sections.push({
      type: "evidence",
      title: "证据链",
      content: summary,
      expandable: true,
      dataRef: "evidenceChain",
    })
  }

  if (verdictResult) {
    if (verdictResult.conclusion.actions.length > 0) {
      sections.push({
        type: "conclusion",
        title: "建议行动",
        content: verdictResult.conclusion.actions.join("\n"),
        expandable: false,
        dataRef: "actions",
      })
    }

    if (verdictResult.conclusion.risks.length > 0) {
      sections.push({
        type: "risk",
        title: "风险提示",
        content: verdictResult.conclusion.risks.map((r) => `[${r.level}] ${r.description}`).join("\n"),
        expandable: true,
        dataRef: "risks",
      })
    }

    sections.push({
      type: "confidence",
      title: "置信度",
      content: `${verdictResult.confidence.final_confidence}%`,
      expandable: true,
      dataRef: "confidence",
    })
  }

  if (pendingInteraction) {
    sections.push({
      type: "interaction",
      title: "需要您的决策",
      content: pendingInteraction.description,
      expandable: false,
      dataRef: "interactionPoint",
    })
  }

  return { summary: streamedText.trim(), sections }
}
