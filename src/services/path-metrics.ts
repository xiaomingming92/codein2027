/**
 * PathMetrics — 多维度执行质量评估服务
 *
 * 提供 4 个独立 MetricDescriptor 检测器，消费 turnHistory 多轮轨迹，
 * 产出 StrategyAdjustment 信号供 ResponseStrategy 消费。
 *
 * 约束：assessExecutionQuality 不阻塞 response 返回（fire-and-forget 异步调用），
 * 质量检测失败时降级并保留诊断信息，不中断主聊天流程。
 */
import type { AnalysisTurnRecord } from "@/services/analysis-context"
import { prisma } from "@/lib/prisma"

// ===== 类型定义 =====

export type AdjustmentAction =
  | "augment_prompt"
  | "relax_evidence_filter"
  | "activate_expert"

export interface StrategyAdjustment {
  compositeScore: number
  signals: Array<{
    metric: string
    severity: "low" | "medium" | "high"
    action: AdjustmentAction
    detail: { current: number; threshold: number; description: string }
  }>
  dominantAction: AdjustmentAction | null
  promptSupplement: string
  suggestedExpertId: string | null
}

/**
 * MetricContribution — 单个描述符触发的完整可审计贡献
 *
 * 编程时和运行时耦合：provider（MetricDescriptor.detect）产出本结构体，
 * consumer（assessExecutionQuality）只做收集/排序/合并，不做创造。
 * 每个字段都能追踪回"哪个描述符、什么算法、什么阈值、产生了什么结果"。
 */
export interface MetricContribution {
  triggered: boolean
  metric: string
  severity: "low" | "medium" | "high"
  action: AdjustmentAction
  current: number
  threshold: number
  detail: string
  /** ADD-7 可审计描述 */
  description: string
  /** 贡献的提示词片段 */
  promptFragment: string
  /** activate_expert 时是否需运行时补专家 ID */
  requiresExpertSuggestion: boolean
}

export interface MetricDescriptor {
  metric: string
  algorithm: string
  minSamples: number
  threshold: number | { slope: number }
  severity: "low" | "medium" | "high"
  actionType: AdjustmentAction
  description: string
  promptFragment: string
  requiresExpertSuggestion: boolean
  /**
   * detect — 编程时定义的检测逻辑，运行时被调用。
   * 返回完整的 MetricContribution（含所有审计字段），
   * 不依赖运行时拼凑任何内容。
   */
  detect(
    history: AnalysisTurnRecord[],
    baselines: MetricBaselines,
  ): MetricContribution
}

export interface MetricBaselines {
  globalMeanConfidence: number
  globalStdConfidence: number
  globalMeanEvidenceCount: number
  globalMeanFollowUpRate: number
  perExpert: Record<
    string,
    {
      meanConfidence: number
      stdConfidence: number
      meanEvidenceCount: number
      meanFollowUpRate: number
    }
  >
}

// ===== 权重常量 =====

const SEVERITY_WEIGHT: Record<string, number> = { low: 1, medium: 3, high: 5 }

// ===== 基础检测函数 =====

function linearRegressionSlope(values: number[]): number {
  if (values.length < 2) return 0
  const n = values.length
  const xs = values.map((_, i) => i)
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = values.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((a, x, i) => a + x * values[i], 0)
  const sumX2 = xs.reduce((a, x) => a + x * x, 0)
  const denominator = n * sumX2 - sumX * sumX
  if (denominator === 0) return 0
  return (n * sumXY - sumX * sumY) / denominator
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance =
    values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / (values.length - 1)
  return Math.sqrt(variance)
}

// ===== 4 个 MetricDescriptor =====

const METRICS: MetricDescriptor[] = [
  // 维度 1：置信度轨迹 — 线性回归 β 斜率
  {
    metric: "confidence_trajectory",
    algorithm: "linear_regression_beta",
    minSamples: 5,
    threshold: { slope: -3 },
    severity: "medium",
    actionType: "augment_prompt",
    description: "连续5轮置信度轨迹下降，建议补充信息依据",
    promptFragment: "信息可能存在缺口，请注意补充依据。",
    requiresExpertSuggestion: false,
    detect(history, _baselines): MetricContribution {
      const confidences = history
        .filter((t) => t.verdictConfidence != null)
        .map((t) => t.verdictConfidence as number)

      const metric = this.metric
      const severity = this.severity
      const action = this.actionType
      const desc = this.description
      const prompt = this.promptFragment
      const threshold = (this.threshold as { slope: number }).slope

      if (confidences.length < 5) {
        return {
          triggered: false, metric, severity, action, current: 0,
          threshold, detail: `样本不足 (${confidences.length}/5)`,
          description: desc, promptFragment: prompt, requiresExpertSuggestion: false,
        }
      }

      const recent = confidences.slice(-5)
      const beta = linearRegressionSlope(recent)

      if (beta >= threshold) {
        return {
          triggered: false, metric, severity, action, current: Math.round(beta * 100) / 100,
          threshold, detail: `β=${beta.toFixed(2)} ≥ ${threshold}`,
          description: desc, promptFragment: prompt, requiresExpertSuggestion: false,
        }
      }

      return {
        triggered: true, metric, severity, action, current: Math.round(beta * 100) / 100,
        threshold, detail: `连续5轮置信度轨迹下降，β=${beta.toFixed(2)} < ${threshold}`,
        description: desc, promptFragment: prompt, requiresExpertSuggestion: false,
      }
    },
  },

  // 维度 2：证据覆盖率 — 连续 3 轮递减 + 低于全局均值 × 0.5
  {
    metric: "evidence_coverage",
    algorithm: "consecutive_decline_below_mean",
    minSamples: 3,
    threshold: 0.5,
    severity: "medium",
    actionType: "relax_evidence_filter",
    description: "连续3轮证据量递减且低于全局均值，建议放宽证据筛选条件",
    promptFragment: "注意：近期证据量持续下降，可适当放宽证据筛选条件。",
    requiresExpertSuggestion: false,
    detect(history, baselines): MetricContribution {
      const counts = history.map((t) => t.evidenceCount)
      const metric = this.metric
      const severity = this.severity
      const action = this.actionType
      const desc = this.description
      const prompt = this.promptFragment

      if (counts.length < 3) {
        return {
          triggered: false, metric, severity, action, current: 0,
          threshold: 0.5, detail: `样本不足 (${counts.length}/3)`,
          description: desc, promptFragment: prompt, requiresExpertSuggestion: false,
        }
      }

      const recent = counts.slice(-3)
      const decreasing = recent[0] > recent[1] && recent[1] > recent[2]
      if (!decreasing) {
        return {
          triggered: false, metric, severity, action, current: recent[2],
          threshold: 0.5, detail: "证据量未连续递减",
          description: desc, promptFragment: prompt, requiresExpertSuggestion: false,
        }
      }

      const globalMean = baselines.globalMeanEvidenceCount
      const threshold = globalMean * (this.threshold as number)
      if (recent[2] >= threshold) {
        return {
          triggered: false, metric, severity, action, current: recent[2],
          threshold, detail: `最新证据量 ${recent[2]} ≥ 阈值 ${threshold.toFixed(1)}`,
          description: desc, promptFragment: prompt, requiresExpertSuggestion: false,
        }
      }

      return {
        triggered: true, metric, severity, action, current: recent[2],
        threshold, detail: `连续3轮递减(→${recent[2]})且低于全局均值×0.5(${threshold.toFixed(1)})`,
        description: desc, promptFragment: prompt, requiresExpertSuggestion: false,
      }
    },
  },

  // 维度 3：追问率 — followUpCount > 0 占比 ≥ 40%
  {
    metric: "follow_up_rate",
    algorithm: "ratio_above_threshold",
    minSamples: 5,
    threshold: 0.4,
    severity: "high",
    actionType: "activate_expert",
    description: "追问率≥40%，建议激活互补专家辅助分析",
    promptFragment: "追问率较高，建议激活辅助专家分析。",
    requiresExpertSuggestion: true,
    detect(history, _baselines): MetricContribution {
      const metric = this.metric
      const severity = this.severity
      const action = this.actionType
      const desc = this.description
      const prompt = this.promptFragment

      if (history.length < 5) {
        return {
          triggered: false, metric, severity, action, current: 0,
          threshold: 0.4, detail: `样本不足 (${history.length}/5)`,
          description: desc, promptFragment: prompt, requiresExpertSuggestion: true,
        }
      }

      const recent = history.slice(-5)
      const followUpCount = recent.filter((t) => t.followUpCount > 0).length
      const rate = followUpCount / recent.length

      if (rate < 0.4) {
        return {
          triggered: false, metric, severity, action, current: Math.round(rate * 100),
          threshold: 40, detail: `追问率 ${Math.round(rate * 100)}% < 40%`,
          description: desc, promptFragment: prompt, requiresExpertSuggestion: true,
        }
      }

      return {
        triggered: true, metric, severity, action, current: Math.round(rate * 100),
        threshold: 40,
        detail: `追问率 ${Math.round(rate * 100)}% ≥ 40%，建议激活专家`,
        description: desc, promptFragment: prompt, requiresExpertSuggestion: true,
      }
    },
  },

  // 维度 4：置信度波动率 — 标准差 σ > 15%
  {
    metric: "confidence_volatility",
    algorithm: "standard_deviation",
    minSamples: 5,
    threshold: 15,
    severity: "medium",
    actionType: "augment_prompt",
    description: "置信度波动率σ>15%，建议细化分析维度",
    promptFragment: "置信度波动较大，请细化分析维度。",
    requiresExpertSuggestion: false,
    detect(history, _baselines): MetricContribution {
      const confidences = history
        .filter((t) => t.verdictConfidence != null)
        .map((t) => t.verdictConfidence as number)

      const metric = this.metric
      const severity = this.severity
      const action = this.actionType
      const desc = this.description
      const prompt = this.promptFragment

      if (confidences.length < 5) {
        return {
          triggered: false, metric, severity, action, current: 0,
          threshold: 15, detail: `样本不足 (${confidences.length}/5)`,
          description: desc, promptFragment: prompt, requiresExpertSuggestion: false,
        }
      }

      const recent = confidences.slice(-5)
      const sigma = standardDeviation(recent)

      if (sigma <= 15) {
        return {
          triggered: false, metric, severity, action,
          current: Math.round(sigma * 100) / 100,
          threshold: 15, detail: `σ=${sigma.toFixed(2)}% ≤ 15%`,
          description: desc, promptFragment: prompt, requiresExpertSuggestion: false,
        }
      }

      return {
        triggered: true, metric, severity, action,
        current: Math.round(sigma * 100) / 100,
        threshold: 15, detail: `置信度波动率 σ=${sigma.toFixed(2)}% > 15%，建议细化维度`,
        description: desc, promptFragment: prompt, requiresExpertSuggestion: false,
      }
    },
  },
]

// ===== 复合裁决 =====

function getComplementaryExpert(expertId: string): string {
  const map: Record<string, string> = { pest_risk: "crop_compare", crop_compare: "pest_risk" }
  return map[expertId] || "pest_risk"
}

export function assessExecutionQuality(
  history: AnalysisTurnRecord[],
  activeExpertIds: string[],
  baselines: MetricBaselines,
  _region?: string,
): StrategyAdjustment {
  // 收集所有描述符的完整贡献
  const triggered: MetricContribution[] = []
  for (const metric of METRICS) {
    const c = metric.detect(history, baselines)
    if (c.triggered) {
      triggered.push(c)
    }
  }

  if (triggered.length === 0) {
    return {
      compositeScore: 0,
      signals: [],
      dominantAction: null,
      promptSupplement: "",
      suggestedExpertId: null,
    }
  }

  // 按 severity 排序：high > medium > low
  triggered.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity])

  const compositeScore = triggered.reduce((sum, c) => sum + SEVERITY_WEIGHT[c.severity], 0)
  const dominantAction = triggered[0].action

  // 构建 signals（直接从 contribution 字段映射）
  const signals: StrategyAdjustment["signals"] = triggered.map((c) => ({
    metric: c.metric,
    severity: c.severity,
    action: c.action,
    detail: {
      current: c.current,
      threshold: c.threshold,
      description: c.detail,
    },
  }))

  // 合并 promptFragment，补全 activate_expert 的专家 ID
  const promptSupplements: string[] = []
  let suggestedExpertId: string | null = null

  for (const c of triggered) {
    let fragment = c.promptFragment
    if (c.requiresExpertSuggestion) {
      const candidate = activeExpertIds.length > 0 ? activeExpertIds[0] : null
      suggestedExpertId = candidate ? getComplementaryExpert(candidate) : "pest_risk"
      fragment = `${fragment} 建议激活 ${suggestedExpertId} 专家。`
    }
    promptSupplements.push(fragment)
  }

  return {
    compositeScore,
    signals,
    dominantAction,
    promptSupplement: promptSupplements.join(" "),
    suggestedExpertId,
  }
}

// ===== 全局基准构建 =====

const DEFAULT_BASELINES: MetricBaselines = {
  globalMeanConfidence: 70,
  globalStdConfidence: 10,
  globalMeanEvidenceCount: 3,
  globalMeanFollowUpRate: 0.2,
  perExpert: {},
}

export async function buildMetricBaselines(): Promise<MetricBaselines> {
  try {
    const now = new Date()
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 近 30 天

    const threads = await prisma.chatThread.findMany({
      where: { updatedAt: { gte: since } },
      select: { metadata: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    })

    const allTurns: AnalysisTurnRecord[] = []

    for (const thread of threads) {
      const metadata = thread.metadata as Record<string, unknown> | null
      const ctx = metadata?.analysisContext as
        | { turnHistory?: unknown[] }
        | undefined
      if (ctx?.turnHistory && Array.isArray(ctx.turnHistory)) {
        for (const turn of ctx.turnHistory) {
          const t = turn as AnalysisTurnRecord
          if (t.verdictConfidence != null && t.evidenceCount >= 0) {
            allTurns.push(t)
          }
        }
      }
    }

    if (allTurns.length === 0) {
      return DEFAULT_BASELINES
    }

    const confidences = allTurns
      .map((t) => t.verdictConfidence)
      .filter((c): c is number => c != null)
    const evidenceCounts = allTurns.map((t) => t.evidenceCount)
    const followUpCounts = allTurns.filter((t) => t.followUpCount > 0).length

    const globalMeanConfidence =
      confidences.length > 0
        ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
        : DEFAULT_BASELINES.globalMeanConfidence

    const globalStdConfidence =
      confidences.length > 1
        ? Math.round(standardDeviation(confidences) * 100) / 100
        : DEFAULT_BASELINES.globalStdConfidence

    const globalMeanEvidenceCount =
      evidenceCounts.length > 0
        ? Math.round(
            (evidenceCounts.reduce((a, b) => a + b, 0) / evidenceCounts.length) *
              10,
          ) / 10
        : DEFAULT_BASELINES.globalMeanEvidenceCount

    const globalMeanFollowUpRate =
      allTurns.length > 0
        ? Math.round((followUpCounts / allTurns.length) * 100) / 100
        : DEFAULT_BASELINES.globalMeanFollowUpRate

    // 按专家聚合
    const perExpert: MetricBaselines["perExpert"] = {}
    const byExpert: Record<string, AnalysisTurnRecord[]> = {}

    for (const turn of allTurns) {
      for (const expertId of turn.activeExpertIds) {
        if (!byExpert[expertId]) byExpert[expertId] = []
        byExpert[expertId].push(turn)
      }
    }

    for (const [expertId, turns] of Object.entries(byExpert)) {
      const eConfidences = turns
        .map((t) => t.verdictConfidence)
        .filter((c): c is number => c != null)
      perExpert[expertId] = {
        meanConfidence:
          eConfidences.length > 0
            ? Math.round(eConfidences.reduce((a, b) => a + b, 0) / eConfidences.length)
            : globalMeanConfidence,
        stdConfidence:
          eConfidences.length > 1
            ? Math.round(standardDeviation(eConfidences) * 100) / 100
            : globalStdConfidence,
        meanEvidenceCount:
          turns.length > 0
            ? Math.round(
                (turns.reduce((a, t) => a + t.evidenceCount, 0) / turns.length) * 10,
              ) / 10
            : globalMeanEvidenceCount,
        meanFollowUpRate:
          turns.length > 0
            ? Math.round(
                (turns.filter((t) => t.followUpCount > 0).length / turns.length) * 100,
              ) / 100
            : globalMeanFollowUpRate,
      }
    }

    return {
      globalMeanConfidence,
      globalStdConfidence,
      globalMeanEvidenceCount,
      globalMeanFollowUpRate,
      perExpert,
    }
  } catch {
    // 查询失败降级为默认基准
    return DEFAULT_BASELINES
  }
}
