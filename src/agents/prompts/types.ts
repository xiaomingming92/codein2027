export interface PromptTemplate<TInput, TOutput> {
  id: string
  name: string
  description: string
  build: (input: TInput) => string
  parse: (raw: string) => TOutput
  validate: (output: TOutput) => boolean
}

export interface IntentionInput {
  userMessage: string
  hasImage: boolean
  hasAudio: boolean
  textContent: string
}

export interface IntentionOutput {
  intent: "analysis" | "planning" | "question" | "decision" | "creation" | "modification" | "chat"
  entities: {
    projectId?: string
    taskId?: string
    keywords: string[]
  }
  multimodal?: {
    hasImage: boolean
    hasAudio: boolean
  }
}

export interface ReasoningInput {
  query: string
  evidenceList: Array<{
    id: string
    source: string
    content: string
    reliability: number
  }>
}

export interface ReasoningOutput {
  reasoning_path: Array<{
    step: number
    action: string
    input_evidence: string[]
    intermediate_result: unknown
    description: string
  }>
  traces: string[]
  conclusion: {
    content: string
    actions: string[]
  }
  confidence: {
    base_confidence: number
    reliability_discount: number
    conflict_discount: number
    final_confidence: number
  }
}

export interface VerdictInput {
  query: string
  evidenceList: Array<{
    id: string
    source: string
    content: string
  }>
  weights: Record<string, number>
}

export interface VerdictOutput {
  type: "PRIORITY_DECISION" | "RISK_ASSESSMENT" | "RESOURCE_ALLOCATION" | "COST_BENEFIT" | "TIMELINE_ESTIMATION" | "PATH_SELECTION"
  conclusion: {
    content: string
    actions: string[]
    risks: Array<{
      level: "low" | "medium" | "high"
      description: string
      probability: number
      impact: string
    }>
  }
  confidence: {
    base_confidence: number
    reliability_discount: number
    conflict_discount: number
    final_confidence: number
  }
}

export interface InteractionPointInput {
  intent: "analysis" | "planning"
  query: string
  evidenceChain: Array<{
    id: string
    source: string
    content: string
  }>
  reasoningResult: {
    conclusion: string
    actions: string[]
  }
}

export interface InteractionPointOutput {
  hasInteractionPoint: boolean
  interactionPoint?: {
    type: "decision" | "tradeoff" | "clarification" | "confirmation"
    dimension?: string
    description: string
    options: Array<{
      label: string
      reason: string
      impact: string
    }>
  }
}

export interface ResponseInput {
  query: string
  intent: string
  verdictResult?: VerdictOutput
  interactionPoint?: InteractionPointOutput["interactionPoint"]
  retrievedDocuments?: Array<{
    source: string
    content: string
    relevance: number
    isFullDocumentRequest: boolean
  }>
}

export interface ResponseOutput {
  summary: string
  sections: Array<{
    type: "conclusion" | "evidence" | "reasoning" | "confidence" | "risk" | "interaction"
    title: string
    content: string
    expandable: boolean
    dataRef: string
  }>
}
