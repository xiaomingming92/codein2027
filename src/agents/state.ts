import { Annotation } from "@langchain/langgraph"
import type { StructuredAgentResponse, InteractionPoint } from "./types"

interface Message {
  role: string
  content: string
  name?: string
}

interface User {
  id: string
  username: string
  email: string
  role: string
  department?: string
}

interface Project {
  id: string
  name: string
  description?: string
  status: string
  config?: Record<string, unknown>
}

interface CurrentTask {
  id?: string
  intent?: string
  entities?: Record<string, unknown>
  query?: string
}

interface Evidence {
  id: string
  source: string
  type: string
  content: string
  reliability: number
  relevance: number
  timestamp: string
  metadata: Record<string, unknown>
  expandable?: boolean
  detailUrl?: string
  score?: number
}

interface VerdictConclusion {
  content: string
  actions: string[]
  risks: Array<{
    level: string
    description: string
    probability: number
    impact: string
  }>
}

interface ReasoningStep {
  step: number
  action: string
  input_evidence: string[]
  intermediate_result: unknown
  description: string
}

interface Confidence {
  base_confidence: number
  reliability_discount: number
  conflict_discount: number
  final_confidence: number
}

interface Verdict {
  type: string
  query: string
  conclusion: VerdictConclusion
  reasoning_path: ReasoningStep[]
  confidence: Confidence
  traces: string[]
}

interface RetrievalContext {
  documents: Array<{
    id: string
    content: string
    score: number
  }>
  tasks: Array<{
    id: string
    name: string
    status: string
    priority: number
  }>
  economic: Array<{
    id: string
    type: string
    data: Record<string, unknown>
  }>
}

const MessagesAnnotation = Annotation<Message[]>({
  value: (x, y) => x.concat(y),
  default: () => [],
})

export const AgentState = Annotation.Root({
  messages: MessagesAnnotation,
  user: Annotation<User | null>(),
  project: Annotation<Project | null>(),
  currentTask: Annotation<CurrentTask | null>(),
  evidenceChain: Annotation<Evidence[] | null>(),
  verdictResult: Annotation<Verdict | null>(),
  economicFactors: Annotation<Array<{
    id: string
    type: string
    data: Record<string, unknown>
  }> | null>(),
  retrievalContext: Annotation<RetrievalContext | null>(),
  explicitIntent: Annotation<string | null>(),
  structuredResponse: Annotation<StructuredAgentResponse | null>(),
  conversationContext: Annotation<Record<string, unknown>>(),
  pendingInteraction: Annotation<InteractionPoint | null>(),
})

export type AgentStateType = typeof AgentState.State
