export interface StructuredAgentResponse {
  traceId: string
  intent: {
    type: string
    source: "explicit" | "llm_parsed"
    original: string
  }
  evidenceChain: StructuredEvidenceChain
  reasoningPath: StructuredReasoningPath
  verdict: StructuredVerdict | null
  interactionPoint: InteractionPoint | null
  displayContent: DisplayContent
}

export interface StructuredEvidenceChain {
  evidences: Array<{
    id: string
    source: string
    type: string
    content: string
    reliability: number
    relevance: number
    timestamp: string
    metadata: Record<string, unknown>
    expandable: boolean
    detailUrl?: string
  }>
  totalScore: number
  sourceBreakdown: Record<string, number>
}

export interface StructuredReasoningPath {
  steps: Array<{
    step: number
    action: string
    inputEvidenceIds: string[]
    intermediateResult: unknown
    description: string
    expandable: boolean
  }>
  traces: string[]
}

export interface StructuredVerdict {
  type: string
  conclusion: {
    content: string
    actions: string[]
    risks: Array<{
      level: "low" | "medium" | "high"
      description: string
      probability: number
      impact: string
      expandable: boolean
    }>
  }
  confidence: {
    baseConfidence: number
    reliabilityDiscount: number
    conflictDiscount: number
    finalConfidence: number
    breakdown: Array<{
      factor: string
      value: number
      reason: string
    }>
  }
}

export interface InteractionPoint {
  type: "decision" | "tradeoff" | "clarification" | "confirmation"
  dimension?: string
  description: string
  options: Array<{
    label: string
    reason: string
    impact: string
  }>
}

export interface DisplayContent {
  summary: string
  sections: Array<{
    type: "conclusion" | "evidence" | "reasoning" | "confidence" | "risk" | "interaction"
    title: string
    content: string
    expandable: boolean
    dataRef: string
  }>
}
