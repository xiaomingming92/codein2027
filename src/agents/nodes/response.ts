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
import {
  resolveResponseStrategy,
  type ResponseSectionType,
  type ResponseStrategy,
  type StrategyContext,
} from "@/agents/response-strategy"
import { NodeStreamController } from "@/agents/node-stream-controller"
import { randomUUID } from "crypto"
import type { Evidence, ThinkingLevel } from "@/types/evidence"

export async function responseNode(state: typeof AgentState.State) {
  const { currentTask, verdictResult, messages, evidenceChain, pendingInteraction, explicitIntent } = state

  const userMessage = messages[messages.length - 1]?.content || ""
  const stream = NodeStreamController.fromState(state, "response")
  stream.nodeStarted()
  const traceId = stream.traceId || randomUUID()
  const intent = currentTask?.intent || explicitIntent || "chat"
  const thinkingLevel: ThinkingLevel = currentTask?.thinkingLevel ?? "deep"
  const hasNonPriorEvidence = calculateHasNonPriorEvidence(evidenceChain || [])
  const strategyContext: StrategyContext = {
    thinkingLevel,
    intent,
    activeExperts: [],
    hasNonPriorEvidence,
  }
  const strategy = resolveResponseStrategy(strategyContext)

  const structuredEvidenceChain: StructuredEvidenceChain = {
    evidences: (evidenceChain || []).map((e) => ({
      id: e.id,
      chunkId: e.chunkId,
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

  stream.responseStart()

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
      .filter((e) => e.source === "knowledge")
      .map((e) => ({
        source: (e.metadata?.documentName as string) || e.source,
        content: e.content,
        relevance: e.relevance,
        isFullDocumentRequest: (e.metadata?.isFullDocumentRequest as boolean) || false,
      })),
  }

  const streamingPrompt = buildStreamingTextPrompt(input, strategy)
  const llmStream = await getLLM().stream(streamingPrompt)
  let responseContent = ""

  for await (const chunk of llmStream) {
    const token = typeof chunk.content === "string" ? chunk.content : ""
    if (!token) continue
    responseContent += token
    stream.token(token)
  }

  const displayContent = buildDisplayFromState({
    strategy,
    structuredVerdict,
    structuredReasoningPath,
    pendingInteraction,
    streamedText: responseContent,
    evidenceChain: structuredEvidenceChain,
    hasNonPriorEvidence,
  })

  responseContent = responseContent.trim()
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
    strategyId: strategy.id,
    thinkingLevel,
    hasNonPriorEvidence,
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

function buildStreamingTextPrompt(input: ResponseInput, strategy: ResponseStrategy): string {
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
7. ${strategy.promptHint}
`
}

interface BuildDisplayFromStateParams {
  strategy: ResponseStrategy
  structuredVerdict: StructuredVerdict | null
  structuredReasoningPath: StructuredReasoningPath
  pendingInteraction: typeof AgentState.State extends { pendingInteraction: infer T } ? T : never
  streamedText: string
  evidenceChain: StructuredEvidenceChain
  hasNonPriorEvidence: boolean
}

function buildDisplayFromState(params: BuildDisplayFromStateParams): DisplayContent {
  const {
    strategy,
    structuredVerdict,
    structuredReasoningPath,
    pendingInteraction,
    streamedText,
    evidenceChain,
    hasNonPriorEvidence,
  } = params
  const builders: Record<ResponseSectionType, () => DisplayContent["sections"][number] | null> = {
    conclusion: () => ({
      type: "conclusion",
      title: "回复",
      content: streamedText.trim() || structuredVerdict?.conclusion.content || "已完成响应生成。",
      expandable: false,
      dataRef: "summary",
    }),
    evidence: () => {
      if (evidenceChain.evidences.length === 0) return null
      return {
        type: "evidence",
        title: "证据链",
        content: evidenceChain.evidences.map((e) => `[${e.source}] ${e.content.slice(0, 100)}`).join("\n"),
        expandable: true,
        dataRef: "evidenceChain",
      }
    },
    evidence_digest: () => {
      const digestEvidences = evidenceChain.evidences.filter(isStructuredNonPriorEvidence)
      if (!hasNonPriorEvidence || digestEvidences.length === 0) return null
      return {
        type: "evidence_digest",
        title: "证据摘要",
        content: digestEvidences
          .map((e) => `[${e.source}/${e.type}] 相关度 ${(e.relevance * 100).toFixed(1)}%：${e.content.slice(0, 120)}`)
          .join("\n"),
        expandable: true,
        dataRef: "evidenceDigest",
      }
    },
    reasoning: () => {
      if (structuredReasoningPath.steps.length === 0) return null
      return {
        type: "reasoning",
        title: "推理路径",
        content: structuredReasoningPath.steps.map((step) => `${step.step}. ${step.description}`).join("\n"),
        expandable: true,
        dataRef: "reasoningPath",
      }
    },
    confidence: () => {
      if (!structuredVerdict) return null
      return {
        type: "confidence",
        title: "置信度",
        content: `${structuredVerdict.confidence.finalConfidence}%`,
        expandable: true,
        dataRef: "confidence",
      }
    },
    risk: () => {
      if (!structuredVerdict || structuredVerdict.conclusion.risks.length === 0) return null
      return {
        type: "risk",
        title: "风险提示",
        content: structuredVerdict.conclusion.risks.map((r) => `[${r.level}] ${r.description}`).join("\n"),
        expandable: true,
        dataRef: "risks",
      }
    },
    interaction: () => {
      if (!pendingInteraction) return null
      return {
        type: "interaction",
        title: "需要您的决策",
        content: pendingInteraction.description,
        expandable: false,
        dataRef: "interactionPoint",
      }
    },
    action_steps: () => {
      if (!structuredVerdict || structuredVerdict.conclusion.actions.length === 0) return null
      return {
        type: "action_steps",
        title: "行动步骤",
        content: structuredVerdict.conclusion.actions.map((action, index) => `${index + 1}. ${action}`).join("\n"),
        expandable: true,
        dataRef: "actions",
      }
    },
    timeline: () => null,
  }

  const sections = strategy.sections
    .map((section) => builders[section]())
    .filter((section): section is DisplayContent["sections"][number] => section !== null)

  return { summary: streamedText.trim(), sections }
}

function calculateHasNonPriorEvidence(evidences: Evidence[]): boolean {
  return evidences.some(isNonPriorEvidence)
}

function isNonPriorEvidence(evidence: Evidence): boolean {
  if (evidence.source === "knowledge_empty" || evidence.source === "project_context" || evidence.source === "keywords") {
    return false
  }

  if (evidence.source === "knowledge" || evidence.source === "document") {
    return Boolean(
      evidence.chunkId ||
      typeof evidence.metadata.documentName === "string" ||
      typeof evidence.metadata.documentId === "string"
    )
  }

  return evidence.source === "task" ||
    evidence.source === "economic" ||
    evidence.source === "sensor" ||
    evidence.source === "team_input"
}

function isStructuredNonPriorEvidence(evidence: StructuredEvidenceChain["evidences"][number]): boolean {
  if (evidence.source === "knowledge_empty" || evidence.source === "project_context" || evidence.source === "keywords") {
    return false
  }

  if (evidence.source === "knowledge" || evidence.source === "document") {
    return Boolean(
      evidence.chunkId ||
      typeof evidence.metadata.documentName === "string" ||
      typeof evidence.metadata.documentId === "string"
    )
  }

  return evidence.source === "task" ||
    evidence.source === "economic" ||
    evidence.source === "sensor" ||
    evidence.source === "team_input"
}
