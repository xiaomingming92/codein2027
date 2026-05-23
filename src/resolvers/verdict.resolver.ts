import type { Verdict, VerdictType, VerdictConclusion } from "@/types/verdict"
import type { EvidenceChain, ConfidenceBreakdown } from "@/types/evidence"
import { calculateFinalConfidence } from "@/types/evidence"

export interface VerdictResolverContext {
  projectId?: string
  userId: string
  timestamp: string
}

export abstract class VerdictResolver {
  protected context: VerdictResolverContext

  constructor(context: VerdictResolverContext) {
    this.context = context
  }

  abstract get type(): VerdictType

  abstract resolve(
    query: string,
    evidenceChain: EvidenceChain
  ): Promise<Verdict>

  protected createBaseVerdict(
    query: string,
    evidenceChain: EvidenceChain,
    conclusion: VerdictConclusion
  ): Verdict {
    const confidence = this.calculateConfidence(evidenceChain)

    return {
      id: crypto.randomUUID(),
      projectId: this.context.projectId,
      type: this.type,
      query,
      conclusion,
      evidence_chain: evidenceChain,
      reasoning_path: evidenceChain.reasoning_steps.map((step, i) => ({
        step: i + 1,
        action: step.action,
        input_evidence: step.input_evidence,
        intermediate_result: step.intermediate_result,
        description: step.description,
      })),
      confidence,
      traces: evidenceChain.traces,
      createdBy: this.context.userId,
      createdAt: this.context.timestamp,
    }
  }

  protected calculateConfidence(evidenceChain: EvidenceChain): ConfidenceBreakdown {
    const reliabilities = evidenceChain.evidences.map((e) => e.reliability)
    return calculateFinalConfidence(80, reliabilities)
  }
}

export function createVerdictResolver(
  type: VerdictType,
  context: VerdictResolverContext
): VerdictResolver {
  switch (type) {
    case "PRIORITY_DECISION":
      return new PriorityResolver(context)
    case "RISK_ASSESSMENT":
      return new RiskResolver(context)
    case "RESOURCE_ALLOCATION":
      return new ResourceResolver(context)
    case "COST_BENEFIT":
      return new CostBenefitResolver(context)
    case "TIMELINE_ESTIMATION":
      return new TimelineResolver(context)
    case "PATH_SELECTION":
      return new PathSelectionResolver(context)
    default:
      return new GenericResolver(context, type)
  }
}

class GenericResolver extends VerdictResolver {
  constructor(
    context: VerdictResolverContext,
    public types: VerdictType = "PATH_SELECTION"
  ) {
    super(context)
  }

  get type(): VerdictType {
    return this.types
  }

  async resolve(query: string, evidenceChain: EvidenceChain): Promise<Verdict> {
    return this.createBaseVerdict(query, evidenceChain, {
      content: evidenceChain.conclusion.content || "基于证据链的结论",
      actions: evidenceChain.conclusion.actions,
      risks: evidenceChain.conclusion.risks,
    })
  }
}

class PriorityResolver extends VerdictResolver {
  get type(): VerdictType {
    return "PRIORITY_DECISION"
  }

  async resolve(query: string, evidenceChain: EvidenceChain): Promise<Verdict> {
    const items = evidenceChain.evidences
      .filter((e) => e.relevance > 0.5)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 5)
      .map((e, i) => ({
        item: e.content.slice(0, 50),
        score: Math.round(e.relevance * 100),
        reasons: [`相关性: ${Math.round(e.relevance * 100)}%`, `来源: ${e.source}`],
      }))

    const conclusion: VerdictConclusion = {
      content: `基于证据分析，推荐优先级顺序已确定`,
      actions: items.map((item, i) => `${i + 1}. ${item.item} (优先级: ${item.score})`),
      risks: evidenceChain.conclusion.risks,
    }

    return this.createBaseVerdict(query, evidenceChain, conclusion)
  }
}

class RiskResolver extends VerdictResolver {
  get type(): VerdictType {
    return "RISK_ASSESSMENT"
  }

  async resolve(query: string, evidenceChain: EvidenceChain): Promise<Verdict> {
    const risks = evidenceChain.conclusion.risks.length > 0
      ? evidenceChain.conclusion.risks
      : [
          { level: "medium" as const, description: "证据不足可能影响风险评估准确性", probability: 0.3, impact: "中等" },
        ]

    const riskLevel = this.calculateRiskLevel(risks)

    const conclusion: VerdictConclusion = {
      content: `风险等级评估为: ${riskLevel.toUpperCase()}`,
      actions: [
        "持续监控风险指标",
        "建立风险预警机制",
        "制定应急预案",
      ],
      risks,
    }

    return this.createBaseVerdict(query, evidenceChain, conclusion)
  }

  private calculateRiskLevel(risks: Array<{ level: string; probability: number }>): string {
    const highRisks = risks.filter((r) => r.level === "high" || r.level === "critical")
    const avgProbability = risks.reduce((sum, r) => sum + r.probability, 0) / risks.length

    if (highRisks.length > 0 || avgProbability > 0.6) return "critical"
    if (highRisks.length > 0 || avgProbability > 0.4) return "high"
    if (avgProbability > 0.2) return "medium"
    return "low"
  }
}

class ResourceResolver extends VerdictResolver {
  get type(): VerdictType {
    return "RESOURCE_ALLOCATION"
  }

  async resolve(query: string, evidenceChain: EvidenceChain): Promise<Verdict> {
    const conclusion: VerdictConclusion = {
      content: "基于资源可用性和需求分析，建议以下资源配置方案",
      actions: [
        "优先分配关键路径资源",
        "建立资源池共享机制",
        "实施资源动态调配",
      ],
      risks: [
        { level: "medium", description: "资源竞争可能导致优先级冲突", probability: 0.3, impact: "中等" },
      ],
    }

    return this.createBaseVerdict(query, evidenceChain, conclusion)
  }
}

class CostBenefitResolver extends VerdictResolver {
  get type(): VerdictType {
    return "COST_BENEFIT"
  }

  async resolve(query: string, evidenceChain: EvidenceChain): Promise<Verdict> {
    const avgReliability =
      evidenceChain.evidences.length > 0
        ? evidenceChain.evidences.reduce((sum, e) => sum + e.reliability, 0) / evidenceChain.evidences.length
        : 0.5

    const conclusion: VerdictConclusion = {
      content: `成本效益分析完成，预计 ROI 为 ${Math.round(avgReliability * 100)}%`,
      actions: [
        "执行成本监控",
        "定期评估收益实现",
      ],
      risks: [
        { level: "medium", description: "实际成本可能超出预算", probability: 0.3, impact: "中等" },
      ],
      metrics: {
        estimated_roi: Math.round(avgReliability * 100),
        confidence: Math.round(avgReliability * 100),
      },
    }

    return this.createBaseVerdict(query, evidenceChain, conclusion)
  }
}

class TimelineResolver extends VerdictResolver {
  get type(): VerdictType {
    return "TIMELINE_ESTIMATION"
  }

  async resolve(query: string, evidenceChain: EvidenceChain): Promise<Verdict> {
    const evidenceCount = evidenceChain.evidences.length
    const estimatedDays = Math.max(1, evidenceCount * 2)

    const conclusion: VerdictConclusion = {
      content: `预计完成时间: ${estimatedDays} 天`,
      actions: [
        "制定详细里程碑计划",
        "设置进度检查点",
        "建立延期预警机制",
      ],
      risks: [
        { level: "medium", description: "关键路径延误可能影响整体进度", probability: 0.25, impact: "中等" },
      ],
    }

    return this.createBaseVerdict(query, evidenceChain, conclusion)
  }
}

class PathSelectionResolver extends VerdictResolver {
  get type(): VerdictType {
    return "PATH_SELECTION"
  }

  async resolve(query: string, evidenceChain: EvidenceChain): Promise<Verdict> {
    const conclusion: VerdictConclusion = {
      content: "基于多维度分析，推荐最优路径",
      actions: [
        "采用推荐路径执行",
        "保持备选路径备选状态",
      ],
      risks: evidenceChain.conclusion.risks,
    }

    return this.createBaseVerdict(query, evidenceChain, conclusion)
  }
}
