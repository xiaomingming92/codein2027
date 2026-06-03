import type { ThinkingLevel } from "@/types/evidence"
import type { AnalysisTurnRecord } from "@/services/analysis-context"
import { assessExecutionQuality } from "@/services/path-metrics"
import type { MetricBaselines, StrategyAdjustment } from "@/services/path-metrics"

export type ResponseSectionType =
  | "conclusion"
  | "evidence"
  | "evidence_digest"
  | "reasoning"
  | "confidence"
  | "risk"
  | "interaction"
  | "action_steps"
  | "timeline"

export interface ResponseStrategy {
  id: string
  sections: ResponseSectionType[]
  promptHint: string
  maxTokens: number
  showEvidenceDigest: boolean
  /** 回路三执行度评估结果（有信号时非空，供 response 节点推送至前端 verdict 面板） */
  evolutionAdjustment?: StrategyAdjustment
}

export interface StrategyActiveExpert {
  id: string
  outputSections: ResponseSectionType[]
}

export interface StrategyContext {
  thinkingLevel: ThinkingLevel
  intent: string
  activeExperts?: StrategyActiveExpert[]
  hasNonPriorEvidence: boolean
  turnHistory?: AnalysisTurnRecord[]
  baselines?: MetricBaselines
}

export interface StrategyDescriptor {
  id: string
  matches: (ctx: StrategyContext) => boolean
  priority: number
  apply: ResponseStrategy
}

const registry: StrategyDescriptor[] = []

export function register(descriptor: StrategyDescriptor): void {
  const existingIndex = registry.findIndex((item) => item.id === descriptor.id)
  if (existingIndex >= 0) {
    registry.splice(existingIndex, 1, descriptor)
    return
  }
  registry.push(descriptor)
}

export function getResponseStrategyRegistry(): readonly StrategyDescriptor[] {
  return registry
}

function uniqueSections(sections: ResponseSectionType[]): ResponseSectionType[] {
  return Array.from(new Set(sections))
}

function cloneStrategy(strategy: ResponseStrategy): ResponseStrategy {
  return {
    ...strategy,
    sections: [...strategy.sections],
  }
}

function withActiveExpertSections(strategy: ResponseStrategy, ctx: StrategyContext): ResponseStrategy {
  const activeExperts = ctx.activeExperts ?? []
  if (activeExperts.length === 0) return strategy

  return {
    ...strategy,
    sections: uniqueSections([
      ...strategy.sections,
      ...activeExperts.flatMap((expert) => expert.outputSections),
    ]),
  }
}

function withEvidenceDigestRuntimeDowngrade(strategy: ResponseStrategy, ctx: StrategyContext): ResponseStrategy {
  if (ctx.hasNonPriorEvidence) return strategy

  return {
    ...strategy,
    showEvidenceDigest: false,
    sections: strategy.sections.filter((section) => section !== "evidence_digest"),
  }
}

function decorateStrategy(strategy: ResponseStrategy, ctx: StrategyContext): ResponseStrategy {
  return withEvidenceDigestRuntimeDowngrade(
    withActiveExpertSections(cloneStrategy(strategy), ctx),
    ctx
  )
}

export function resolveResponseStrategy(ctx: StrategyContext): ResponseStrategy {
  const matched = registry
    .filter((descriptor) => descriptor.matches(ctx))
    .sort((a, b) => b.priority - a.priority)

  const descriptor = matched[0]

  if (!descriptor) {
    throw new Error(`No response strategy matched: thinkingLevel=${ctx.thinkingLevel}, intent=${ctx.intent}`)
  }

  const baseStrategy = decorateStrategy(descriptor.apply, ctx)

  // 回路三：执行度评估（同步计算，不阻塞返回）
  // 评估失败时降级保留诊断信息，不中断主聊天流程
  if (ctx.turnHistory && ctx.baselines && ctx.turnHistory.length >= 3) {
    try {
      const activeExpertIds = (ctx.activeExperts ?? []).map((e) => e.id)
      const adjustment = assessExecutionQuality(
        ctx.turnHistory,
        activeExpertIds,
        ctx.baselines,
      )

      if (adjustment.promptSupplement) {
        baseStrategy.promptHint = baseStrategy.promptHint
          ? `${baseStrategy.promptHint} ${adjustment.promptSupplement}`
          : adjustment.promptSupplement
      }

      if (adjustment.dominantAction === "relax_evidence_filter") {
        baseStrategy.promptHint = (baseStrategy.promptHint ?? "")
          + " 注意：近期证据量持续下降，可适当放宽证据筛选条件。"
      }

      // 有调整信号时挂载到 strategy 上，供 response 节点推送至前端 verdict 面板
      if (adjustment.signals.length > 0) {
        baseStrategy.evolutionAdjustment = adjustment
      }
    } catch {
      // 降级：执行度评估失败不影响响应
    }
  }

  return baseStrategy
}

register({
  id: "fast:chat",
  priority: 10,
  matches: (ctx) => ctx.thinkingLevel === "fast",
  apply: {
    id: "fast:chat",
    sections: ["conclusion"],
    promptHint: "回复控制在1-2句话以内，不要展开。",
    maxTokens: 256,
    showEvidenceDigest: false,
  },
})

register({
  id: "deep:analysis",
  priority: 20,
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "analysis",
  apply: {
    id: "deep:analysis",
    sections: ["conclusion", "evidence", "reasoning", "confidence", "risk", "interaction"],
    promptHint: "先给出分析结论，再从依据→推理→置信度→风险逐一展开。",
    maxTokens: 2048,
    showEvidenceDigest: false,
  },
})

register({
  id: "deep:planning",
  priority: 20,
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "planning",
  apply: {
    id: "deep:planning",
    sections: ["conclusion", "action_steps", "timeline", "risk", "interaction"],
    promptHint: "先给出计划目标，再列出行动步骤、依赖条件、可验证节点和风险提醒；没有明确时间数据时不要编造时间线。",
    maxTokens: 2048,
    showEvidenceDigest: false,
  },
})

register({
  id: "deep:decision",
  priority: 20,
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "decision",
  apply: {
    id: "deep:decision",
    sections: ["conclusion", "evidence", "reasoning", "confidence", "risk", "interaction"],
    promptHint: "围绕可执行决策给出推荐方案、关键依据、取舍理由、风险和需要用户确认的点。",
    maxTokens: 1536,
    showEvidenceDigest: false,
  },
})

register({
  id: "deep:question",
  priority: 20,
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "question",
  apply: {
    id: "deep:question",
    sections: ["conclusion", "evidence_digest", "evidence"],
    promptHint: "直接回答问题，优先给出可操作结论；如使用证据，只做摘要引用，不展开完整推理链。",
    maxTokens: 512,
    showEvidenceDigest: true,
  },
})

register({
  id: "deep:creation",
  priority: 20,
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "creation",
  apply: {
    id: "deep:creation",
    sections: ["conclusion", "action_steps", "risk", "interaction"],
    promptHint: "面向产出物创建给出结构化方案、关键步骤、质量标准和需要补充的信息。",
    maxTokens: 1536,
    showEvidenceDigest: false,
  },
})

register({
  id: "deep:modification",
  priority: 20,
  matches: (ctx) => ctx.thinkingLevel === "deep" && ctx.intent === "modification",
  apply: {
    id: "deep:modification",
    sections: ["conclusion", "action_steps", "risk", "interaction"],
    promptHint: "面向修改任务给出变更摘要、实施步骤、影响范围和风险提醒。",
    maxTokens: 1536,
    showEvidenceDigest: false,
  },
})

register({
  id: "deep:fallback",
  priority: 1,
  matches: (ctx) => ctx.thinkingLevel === "deep",
  apply: {
    id: "deep:fallback",
    sections: ["conclusion", "evidence", "reasoning", "confidence", "risk", "interaction"],
    promptHint: "按通用深度分析方式回答：先结论，再依据、推理、置信度和风险；不要输出 JSON 或代码块。",
    maxTokens: 1536,
    showEvidenceDigest: false,
  },
})
