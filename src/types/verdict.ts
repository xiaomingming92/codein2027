import type { EvidenceChain, ConfidenceBreakdown, RiskItem } from "./evidence"

export type VerdictType =
  | "PRIORITY_DECISION"
  | "RISK_ASSESSMENT"
  | "RESOURCE_ALLOCATION"
  | "COST_BENEFIT"
  | "TIMELINE_ESTIMATION"
  | "PATH_SELECTION"
  | "TASK_ASSIGNMENT"
  | "Milestone_ASSESSMENT"

export interface VerdictConclusion {
  content: string
  actions: string[]
  risks: RiskItem[]
  alternatives?: string[]
  metrics?: Record<string, number>
}

export interface Verdict {
  id: string
  projectId?: string
  type: VerdictType
  query: string
  conclusion: VerdictConclusion
  evidence_chain: EvidenceChain
  reasoning_path: ReasoningStep[]
  confidence: ConfidenceBreakdown
  traces: string[]
  createdBy: string
  createdAt: string
}

export interface ReasoningStep {
  step: number
  action: string
  input_evidence: string[]
  intermediate_result: unknown
  description: string
}

export interface PriorityVerdict extends Verdict {
  type: "PRIORITY_DECISION"
  priority_scores: Array<{
    item: string
    score: number
    reasons: string[]
  }>
  recommended_priority: string
}

export interface RiskVerdict extends Verdict {
  type: "RISK_ASSESSMENT"
  risk_level: "low" | "medium" | "high" | "critical"
  mitigation_strategies: Array<{
    risk: string
    strategy: string
    cost: number
    effectiveness: number
  }>
}

export interface ResourceVerdict extends Verdict {
  type: "RESOURCE_ALLOCATION"
  allocations: Array<{
    resource: string
    amount: number
    unit: string
    priority: number
  }>
  constraints: string[]
}

export interface CostBenefitVerdict extends Verdict {
  type: "COST_BENEFIT"
  estimated_cost: number
  estimated_benefit: number
  roi: number
  payback_period: number
  net_present_value?: number
}

export interface TimelineVerdict extends Verdict {
  type: "TIMELINE_ESTIMATION"
  estimated_duration: number
  unit: "days" | "weeks" | "months"
  milestones: Array<{
    name: string
    date: string
    dependencies: string[]
  }>
  critical_path: string[]
}

export interface PathSelectionVerdict extends Verdict {
  type: "PATH_SELECTION"
  options: Array<{
    path: string
    score: number
    pros: string[]
    cons: string[]
  }>
  recommended_path: string
  alternative_paths: string[]
}

export function getVerdictTypeLabel(type: VerdictType): string {
  const labels: Record<VerdictType, string> = {
    PRIORITY_DECISION: "优先级决策",
    RISK_ASSESSMENT: "风险评估",
    RESOURCE_ALLOCATION: "资源分配",
    COST_BENEFIT: "成本收益分析",
    TIMELINE_ESTIMATION: "时间线估算",
    PATH_SELECTION: "路径选择",
    TASK_ASSIGNMENT: "任务分配",
    Milestone_ASSESSMENT: "里程碑评估",
  }
  return labels[type] || type
}

export function getVerdictTypeColor(type: VerdictType): string {
  const colors: Record<VerdictType, string> = {
    PRIORITY_DECISION: "bg-blue-100 text-blue-800",
    RISK_ASSESSMENT: "bg-red-100 text-red-800",
    RESOURCE_ALLOCATION: "bg-purple-100 text-purple-800",
    COST_BENEFIT: "bg-green-100 text-green-800",
    TIMELINE_ESTIMATION: "bg-yellow-100 text-yellow-800",
    PATH_SELECTION: "bg-indigo-100 text-indigo-800",
    TASK_ASSIGNMENT: "bg-orange-100 text-orange-800",
    Milestone_ASSESSMENT: "bg-pink-100 text-pink-800",
  }
  return colors[type] || "bg-gray-100 text-gray-800"
}
