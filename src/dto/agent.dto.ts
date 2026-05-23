export interface ChatRequest {
  messages: Array<{
    role: string
    content: string
    name?: string
  }>
  user?: {
    id: string
    username: string
    role: string
  }
  project?: {
    id: string
    name: string
    status: string
  }
  threadId?: string
  modelConfig?: {
    provider: "cloud" | "ollama"
    model: string
    baseURL: string
    apiKey?: string
    temperature?: number
    maxTokens?: number
  }
}

export interface ChatResponse {
  success: boolean
  data?: {
    messages: Array<{
      role: string
      content: string
      name?: string
    }>
    verdict?: {
      type: string
      query: string
      conclusion: {
        content: string
        actions: string[]
        risks: Array<{
          level: string
          description: string
          probability: number
          impact: string
        }>
      }
      reasoning_path: Array<{
        step: number
        action: string
        input_evidence: string[]
        intermediate_result: unknown
        description: string
      }>
      confidence: {
        base_confidence: number
        reliability_discount: number
        conflict_discount: number
        final_confidence: number
      }
      traces: string[]
    }
    currentTask?: {
      intent?: string
      entities?: Record<string, unknown>
      query?: string
    }
    threadId?: string
  }
  error?: string
}

export interface StreamResponse {
  role: string
  content: string
  name?: string
}
