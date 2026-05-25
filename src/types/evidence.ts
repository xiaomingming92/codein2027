export type EvidenceSource =
  | "document"
  | "knowledge"
  | "knowledge_empty"
  | "project_context"
  | "keywords"
  | "multimodal"
  | "task"
  | "economic"
  | "history"
  | "team_input"
  | "sensor"

export type ThinkingLevel = "fast" | "deep"

export interface Evidence {
  id: string
  chunkId?: string
  source: EvidenceSource
  type: string
  content: string
  reliability: number
  relevance: number
  timestamp: string
  expires_at?: string
  metadata: Record<string, unknown>
  expandable?: boolean
  detailUrl?: string
  score?: number
}

export interface EvidenceRef {
  id: string
  chunkId?: string
  source: EvidenceSource
  reliability: number
  relevance: number
  docName?: string
  contentExcerpt?: string
}

export interface EvidenceSummary {
  id: string
  chunkId?: string
  source: EvidenceSource
  type: string
  relevance: number
  summary: string
}

export interface EvidenceChain {
  id: string
  query: string
  created_at: string
  evidences: Evidence[]
  reasoning_steps: ReasoningStep[]
  conclusion: Conclusion
  confidence: ConfidenceBreakdown
  traces: string[]
}

export interface ReasoningStep {
  step: number
  action: "retrieval" | "analysis" | "synthesis" | "evaluation" | "decision"
  input_evidence: string[]
  intermediate_result: unknown
  description: string
  timestamp: string
}

export interface Conclusion {
  content: string
  actions: string[]
  risks: RiskItem[]
  alternatives?: string[]
  metrics?: Record<string, number>
}

export interface ConfidenceBreakdown {
  base_confidence: number
  reliability_discount: number
  conflict_discount: number
  uncertainty_discount: number
  final_confidence: number
  factors: Array<{
    factor: string
    impact: number
    description: string
  }>
}

export interface RiskItem {
  level: "low" | "medium" | "high" | "critical"
  description: string
  probability: number
  impact: string
  mitigation?: string
}

export function calculateFinalConfidence(
  baseConfidence: number,
  evidenceReliabilities: number[]
): ConfidenceBreakdown {
  const avgReliability =
    evidenceReliabilities.length > 0
      ? evidenceReliabilities.reduce((a, b) => a + b, 0) / evidenceReliabilities.length
      : 1

  const reliabilityDiscount = (1 - avgReliability) * 20

  const conflictDiscount = Math.max(0, (evidenceReliabilities.length - 1) * 2)

  const uncertaintyDiscount = Math.max(0, 10 - evidenceReliabilities.length * 2)

  const finalConfidence = Math.max(
    0,
    Math.min(
      100,
      baseConfidence - reliabilityDiscount - conflictDiscount - uncertaintyDiscount
    )
  )

  return {
    base_confidence: baseConfidence,
    reliability_discount: Math.round(reliabilityDiscount * 10) / 10,
    conflict_discount: Math.round(conflictDiscount * 10) / 10,
    uncertainty_discount: Math.round(uncertaintyDiscount * 10) / 10,
    final_confidence: Math.round(finalConfidence * 10) / 10,
    factors: [
      {
        factor: "证据可靠性",
        impact: -reliabilityDiscount,
        description: `平均可靠性: ${(avgReliability * 100).toFixed(1)}%`,
      },
      {
        factor: "证据冲突",
        impact: -conflictDiscount,
        description: `冲突扣分 (${evidenceReliabilities.length}条证据)`,
      },
      {
        factor: "不确定性",
        impact: -uncertaintyDiscount,
        description: `证据数量: ${evidenceReliabilities.length}`,
      },
    ],
  }
}

export function createEmptyEvidenceChain(query: string): EvidenceChain {
  return {
    id: crypto.randomUUID(),
    query,
    created_at: new Date().toISOString(),
    evidences: [],
    reasoning_steps: [],
    conclusion: {
      content: "",
      actions: [],
      risks: [],
    },
    confidence: {
      base_confidence: 0,
      reliability_discount: 0,
      conflict_discount: 0,
      uncertainty_discount: 0,
      final_confidence: 0,
      factors: [],
    },
    traces: [],
  }
}
