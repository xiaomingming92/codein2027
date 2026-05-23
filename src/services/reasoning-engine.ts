import type { Evidence, EvidenceChain, ConfidenceBreakdown, Conclusion, RiskItem } from "@/types/evidence"
import { calculateFinalConfidence, createEmptyEvidenceChain } from "@/types/evidence"
import type { VerdictType } from "@/types/verdict"

interface ReasoningEngineOptions {
  baseConfidence?: number
  maxEvidence?: number
  includeAlternatives?: boolean
}

export class EvidenceChainReasoningEngine {
  private options: Required<ReasoningEngineOptions>

  constructor(options: ReasoningEngineOptions = {}) {
    this.options = {
      baseConfidence: options.baseConfidence ?? 80,
      maxEvidence: options.maxEvidence ?? 10,
      includeAlternatives: options.includeAlternatives ?? true,
    }
  }

  async collectEvidences(
    query: string,
    context: {
      documents?: Array<{ id: string; content: string; source: string }>
      tasks?: Array<{ id: string; name: string; priority: number }>
      economic?: Array<{ type: string; data: Record<string, unknown> }>
      history?: Array<{ content: string; timestamp: string }>
    }
  ): Promise<Evidence[]> {
    const evidences: Evidence[] = []
    let evidenceId = 1

    if (context.documents) {
      for (const doc of context.documents.slice(0, this.options.maxEvidence)) {
        evidences.push({
          id: `E${evidenceId++}`,
          source: "document",
          type: "retrieval",
          content: doc.content.slice(0, 500),
          reliability: 0.8,
          relevance: this.calculateRelevance(query, doc.content),
          timestamp: new Date().toISOString(),
          metadata: { docId: doc.id, source: doc.source },
        })
      }
    }

    if (context.tasks) {
      for (const task of context.tasks.slice(0, 5)) {
        evidences.push({
          id: `E${evidenceId++}`,
          source: "task",
          type: "task_status",
          content: `任务: ${task.name}, 优先级: ${task.priority}`,
          reliability: 0.9,
          relevance: this.calculateRelevance(query, task.name),
          timestamp: new Date().toISOString(),
          metadata: { taskId: task.id },
        })
      }
    }

    if (context.economic) {
      for (const eco of context.economic.slice(0, 3)) {
        evidences.push({
          id: `E${evidenceId++}`,
          source: "economic",
          type: eco.type,
          content: JSON.stringify(eco.data),
          reliability: 0.7,
          relevance: 0.6,
          timestamp: new Date().toISOString(),
          metadata: { type: eco.type },
        })
      }
    }

    return evidences
  }

  async evaluateEvidences(evidences: Evidence[]): Promise<Evidence[]> {
    return evidences.map((e) => ({
      ...e,
      relevance: this.adjustRelevance(e.relevance, e.content),
      reliability: this.adjustReliability(e.reliability, e.source as Evidence["source"]),
    }))
  }

  async multiStepReasoning(
    evidences: Evidence[],
    query: string
  ): Promise<Array<{
    step: number
    action: "retrieval" | "analysis" | "synthesis" | "evaluation" | "decision"
    input_evidence: string[]
    intermediate_result: unknown
    description: string
    timestamp: string
  }>> {
    type ReasoningStepType = {
      step: number
      action: "retrieval" | "analysis" | "synthesis" | "evaluation" | "decision"
      input_evidence: string[]
      intermediate_result: unknown
      description: string
      timestamp: string
    }
    const steps: ReasoningStepType[] = []
    const sortedEvidence = [...evidences].sort((a, b) => b.relevance - a.relevance)
    const now = new Date().toISOString()

    steps.push({
      step: 1,
      action: "retrieval",
      input_evidence: sortedEvidence.map((e) => e.id),
      intermediate_result: { count: evidences.length },
      description: `收集到 ${evidences.length} 条相关证据`,
      timestamp: now,
    })

    const highRelevanceEvidence = sortedEvidence.filter((e) => e.relevance > 0.7)
    if (highRelevanceEvidence.length > 0) {
      steps.push({
        step: 2,
        action: "analysis",
        input_evidence: highRelevanceEvidence.map((e) => e.id),
        intermediate_result: { count: highRelevanceEvidence.length },
        description: `分析高相关度证据 (${highRelevanceEvidence.length}条)`,
        timestamp: now,
      })
    }

    const avgReliability =
      evidences.length > 0
        ? evidences.reduce((sum, e) => sum + e.reliability, 0) / evidences.length
        : 0

    steps.push({
      step: 3,
      action: "synthesis",
      input_evidence: evidences.map((e) => e.id),
      intermediate_result: { avgReliability },
      description: `综合证据，平均可靠性: ${(avgReliability * 100).toFixed(1)}%`,
      timestamp: now,
    })

    steps.push({
      step: 4,
      action: "evaluation",
      input_evidence: evidences.map((e) => e.id),
      intermediate_result: { query },
      description: `针对问题「${query.slice(0, 30)}...」进行评估`,
      timestamp: now,
    })

    return steps
  }

  async generateConclusion(
    evidences: Evidence[],
    reasoningSteps: Array<{ description: string }>,
    query: string
  ): Promise<{
    conclusion: Conclusion
    confidence: ConfidenceBreakdown
    traces: string[]
  }> {
    const traces = reasoningSteps.map((s) => s.description)

    const reliabilityScores = evidences.map((e) => e.reliability)
    const confidence = calculateFinalConfidence(this.options.baseConfidence, reliabilityScores)

    const conclusion: Conclusion = {
      content: this.generateConclusionContent(evidences, query),
      actions: this.generateActions(evidences),
      risks: this.generateRisks(evidences),
      metrics: {
        evidence_count: evidences.length,
        avg_reliability: confidence.factors[0]?.factor === "证据可靠性"
          ? (100 - confidence.reliability_discount)
          : 0,
      },
    }

    if (this.options.includeAlternatives) {
      conclusion.alternatives = this.generateAlternatives(evidences)
    }

    return { conclusion, confidence, traces }
  }

  async reason(
    query: string,
    context: {
      documents?: Array<{ id: string; content: string; source: string }>
      tasks?: Array<{ id: string; name: string; priority: number }>
      economic?: Array<{ type: string; data: Record<string, unknown> }>
    },
    weights?: Record<string, number>
  ): Promise<EvidenceChain> {
    const chain = createEmptyEvidenceChain(query)

    chain.evidences = await this.collectEvidences(query, context || {})
    chain.evidences = await this.evaluateEvidences(chain.evidences)

    if (weights) {
      chain.evidences = this.applyWeights(chain.evidences, weights)
    }

    chain.reasoning_steps = await this.multiStepReasoning(chain.evidences, query)

    const { conclusion, confidence, traces } = await this.generateConclusion(
      chain.evidences,
      chain.reasoning_steps,
      query
    )

    chain.conclusion = conclusion
    chain.confidence = confidence
    chain.traces = traces

    return chain
  }

  async reasonWithWeights(
    query: string,
    context: {
      documents?: Array<{ id: string; content: string; source: string }>
      tasks?: Array<{ id: string; name: string; priority: number }>
    },
    weights: Record<string, number>
  ): Promise<EvidenceChain> {
    return this.reason(query, context, weights)
  }

  private calculateRelevance(query: string, content: string): number {
    const queryWords = query.toLowerCase().split(/\s+/)
    const contentLower = content.toLowerCase()
    const matches = queryWords.filter((word) => contentLower.includes(word))
    return Math.min(1, matches.length / Math.max(queryWords.length, 1))
  }

  private adjustRelevance(relevance: number, content: string): number {
    if (content.length < 50) return relevance * 0.9
    if (content.length > 1000) return relevance * 0.95
    return relevance
  }

  private adjustReliability(reliability: number, source: Evidence["source"]): number {
    const sourceReliability: Record<Evidence["source"], number> = {
      document: 0.8,
      task: 0.9,
      economic: 0.7,
      history: 0.85,
      team_input: 0.75,
      sensor: 0.95,
    }
    const multiplier = sourceReliability[source] || 0.8
    return Math.min(1, reliability * multiplier)
  }

  private applyWeights(
    evidences: Evidence[],
    weights: Record<string, number>
  ): Evidence[] {
    return evidences.map((e) => {
      const weightKey = `E_${e.type}` as keyof typeof weights
      const weight = weights[weightKey] ?? weights[e.id] ?? 1
      return {
        ...e,
        relevance: e.relevance * weight,
      }
    })
  }

  private generateConclusionContent(evidences: Evidence[], query: string): string {
    const topEvidence = [...evidences].sort((a, b) => b.relevance - a.relevance)[0]

    if (!topEvidence) {
      return `根据现有信息，无法对「${query}」给出明确结论。建议补充更多相关证据。`
    }

    return `基于${evidences.length}条证据分析，针对「${query}」的主要结论将围绕${topEvidence.type}类型的信息展开。建议优先处理相关性最高的证据。`
  }

  private generateActions(evidences: Evidence[]): string[] {
    const actions: string[] = []
    const hasDocument = evidences.some((e) => e.source === "document")
    const hasTask = evidences.some((e) => e.source === "task")
    const hasEconomic = evidences.some((e) => e.source === "economic")

    if (hasDocument) {
      actions.push("审阅相关文档，确认信息准确性")
    }
    if (hasTask) {
      actions.push("评估任务优先级，调整资源分配")
    }
    if (hasEconomic) {
      actions.push("分析经济数据，制定成本控制策略")
    }

    if (actions.length === 0) {
      actions.push("收集更多证据以支持决策")
    }

    return actions
  }

  private generateRisks(evidences: Evidence[]): RiskItem[] {
    const risks: RiskItem[] = []

    const lowReliability = evidences.filter((e) => e.reliability < 0.7)
    if (lowReliability.length > 0) {
      risks.push({
        level: "medium",
        description: `${lowReliability.length}条证据可靠性较低，可能影响结论准确性`,
        probability: 0.3,
        impact: "中等",
        mitigation: "核实低可靠性证据的来源",
      })
    }

    if (evidences.length < 3) {
      risks.push({
        level: "high",
        description: "证据数量不足，难以形成可靠结论",
        probability: 0.5,
        impact: "高",
        mitigation: "收集更多相关证据",
      })
    }

    return risks
  }

  private generateAlternatives(evidences: Evidence[]): string[] {
    const alternatives: string[] = []

    const bySource = new Map<string, number>()
    for (const e of evidences) {
      bySource.set(e.source, (bySource.get(e.source) || 0) + 1)
    }

    if (bySource.get("document")) {
      alternatives.push("通过更多文档研究获取信息")
    }
    if (bySource.get("task")) {
      alternatives.push("调整任务分解策略")
    }
    if (bySource.get("economic")) {
      alternatives.push("进行更深入的经济分析")
    }

    alternatives.push("寻求团队意见和共识")

    return alternatives
  }
}

export const reasoningEngine = new EvidenceChainReasoningEngine()
