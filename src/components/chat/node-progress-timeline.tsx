"use client"

import * as React from "react"
import {
  Crosshair,
  Search,
  Brain,
  Scale,
  MessageSquare,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  FileText,
  Database,
  Lightbulb,
  TrendingUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  useChatStore,
  type StreamingNodeStep,
  type StreamingEvidence,
  type StreamingReasoningStep,
} from "@/stores/chat-store"

interface NodeProgressTimelineProps {
  steps: StreamingNodeStep[]
  className?: string
}

const nodeConfigMap: Record<string, {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  borderColor: string
}> = {
  intention: {
    icon: Crosshair,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  retrieval: {
    icon: Search,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
  },
  reasoning: {
    icon: Brain,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
  },
  verdict: {
    icon: Scale,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  "interaction-point-detection": {
    icon: MessageSquare,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/30",
  },
  response: {
    icon: MessageSquare,
    color: "text-rose-500",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
  },
}

const defaultConfig = {
  icon: Loader2,
  color: "text-muted-foreground",
  bgColor: "bg-muted/50",
  borderColor: "border-border/50",
}

const sourceIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  knowledge: Database,
  project_context: FileText,
  keywords: Lightbulb,
}

const actionIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  analyze: TrendingUp,
  evaluate: AlertCircle,
  infer: Lightbulb,
  compare: Brain,
  conclude: Brain,
}

const actionLabelMap: Record<string, string> = {
  analyze: "分析",
  evaluate: "评估",
  infer: "推理",
  compare: "对比",
  conclude: "结论",
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function IntentionDetailPanel({ intent }: { intent: Record<string, unknown> }) {
  return (
    <div className="space-y-1.5 pl-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium text-blue-500/80 uppercase tracking-wide">意图类型</span>
        <span className="text-[11px] text-foreground/80">{String(intent.type || "—")}</span>
      </div>
      {typeof intent.source === "string" && intent.source && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-blue-500/80 uppercase tracking-wide">来源</span>
          <span className="text-[11px] text-foreground/80">{intent.source}</span>
        </div>
      )}
      {typeof intent.original === "string" && intent.original && (
        <div className="space-y-0.5">
          <span className="text-[10px] font-medium text-blue-500/80 uppercase tracking-wide">原始输入</span>
          <p className="text-[11px] text-foreground/70 line-clamp-3">{String(intent.original)}</p>
        </div>
      )}
    </div>
  )
}

function RetrievalDetailPanel({ evidence }: { evidence: StreamingEvidence[] }) {
  if (evidence.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60 italic">暂无证据</p>
  }
  return (
    <div className="space-y-1">
      {evidence.map((item, i) => {
        const SrcIcon = sourceIconMap[item.source] || FileText
        return (
          <div
            key={item.id}
            className={cn(
              "flex items-start gap-1.5 rounded px-1.5 py-1 bg-background/40"
            )}
          >
            <SrcIcon className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground/60">{item.source}</span>
                <div className="flex-1 h-0.5 rounded-full bg-muted-foreground/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500/50"
                    style={{ width: `${Math.round(item.relevance * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] tabular-nums text-muted-foreground/50">{Math.round(item.relevance * 100)}%</span>
              </div>
              <p className="text-[10px] text-foreground/70 line-clamp-2 leading-tight">{item.summary}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ReasoningDetailPanel({ steps }: { steps: StreamingReasoningStep[] }) {
  if (steps.length === 0) {
    return <p className="text-[11px] text-muted-foreground/60 italic">暂无推理步骤</p>
  }
  return (
    <div className="space-y-1">
      {steps.map((step, i) => {
        const StepIcon = actionIconMap[step.action] || Brain
        const label = actionLabelMap[step.action] || step.action
        return (
          <div
            key={step.step}
            className={cn(
              "flex items-start gap-1.5 rounded px-1.5 py-1 bg-background/40"
            )}
          >
            <div className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/10 text-[8px] font-bold text-primary tabular-nums shrink-0 mt-0.5">
              {step.step}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <StepIcon className="h-2.5 w-2.5 text-primary/60" />
                <span className="text-[9px] font-medium text-primary/60 uppercase tracking-wide">{label}</span>
              </div>
              <p className="text-[10px] text-foreground/70 line-clamp-2 leading-tight">{step.description}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function VerdictDetailPanel({ verdict }: { verdict: Record<string, unknown> }) {
  const verdictType = verdict.type as string | undefined
  const confidence = verdict.confidence as Record<string, unknown> | undefined
  const conclusion = verdict.conclusion as Record<string, unknown> | undefined

  return (
    <div className="space-y-1.5 pl-1">
      {verdictType && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-amber-500/80 uppercase tracking-wide">类型</span>
          <span className="text-[11px] text-foreground/80">{verdictType}</span>
        </div>
      )}
      {confidence && (
        <div className="space-y-0.5">
          <span className="text-[10px] font-medium text-amber-500/80 uppercase tracking-wide">置信度</span>
          <div className="flex items-center gap-2">
            {typeof confidence.final_confidence === "number" && (
              <>
                <div className="flex-1 h-1.5 rounded-full bg-muted-foreground/10 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      confidence.final_confidence >= 70 ? "bg-emerald-500/60" : confidence.final_confidence >= 40 ? "bg-amber-500/60" : "bg-red-500/60"
                    )}
                    style={{ width: `${confidence.final_confidence}%` }}
                  />
                </div>
                <span className="text-[10px] tabular-nums text-foreground/70">{confidence.final_confidence}%</span>
              </>
            )}
          </div>
          {typeof confidence.base_confidence === "number" && (
            <div className="flex gap-3 text-[9px] text-muted-foreground/50">
              <span>基础 {confidence.base_confidence}%</span>
              {typeof confidence.reliability_discount === "number" && <span>可靠性 -{confidence.reliability_discount}%</span>}
              {typeof confidence.conflict_discount === "number" && <span>冲突 -{confidence.conflict_discount}%</span>}
            </div>
          )}
        </div>
      )}
      {typeof conclusion?.content === "string" && conclusion.content && (
        <div className="space-y-0.5">
          <span className="text-[10px] font-medium text-amber-500/80 uppercase tracking-wide">结论</span>
          <p className="text-[10px] text-foreground/70 line-clamp-3 leading-tight">{String(conclusion.content)}</p>
        </div>
      )}
      {Array.isArray(conclusion?.actions) && conclusion.actions.length > 0 && (
        <div className="space-y-0.5">
          <span className="text-[10px] font-medium text-amber-500/80 uppercase tracking-wide">建议行动</span>
          {(conclusion.actions as Array<Record<string, unknown>>).slice(0, 3).map((action, i) => (
            <p key={i} className="text-[10px] text-foreground/60 pl-2 line-clamp-1">• {String(action.description || action.content || JSON.stringify(action))}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function NodeStepCard({
  step,
  isLast,
  index,
  expanded,
  onToggleExpand,
  children,
}: {
  step: StreamingNodeStep
  isLast: boolean
  index: number
  expanded: boolean
  onToggleExpand: () => void
  children?: React.ReactNode
}) {
  const config = nodeConfigMap[step.node] || defaultConfig
  const Icon = config.icon
  const isRunning = step.status === "running"
  const isDone = step.status === "done"
  const isError = step.status === "error"
  const hasDetails = !!children

  const elapsed =
    isDone && step.completedAt
      ? step.completedAt - step.startedAt
      : isRunning
        ? Date.now() - step.startedAt
        : 0

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex items-center justify-center w-7 h-7 rounded-full shrink-0 transition-all duration-300",
            config.bgColor,
            isRunning && config.borderColor,
            isDone && "border-emerald-500/50 bg-emerald-500/10",
            isError && "border-red-500/50 bg-red-500/10"
          )}
        >
          {isDone ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : isError ? (
            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
          ) : isRunning ? (
            <Icon
              className={cn(
                "h-3.5 w-3.5",
                config.color,
                step.node === "retrieval" && "animate-pulse",
                step.node !== "retrieval" && "animate-spin"
              )}
            />
          ) : (
            <Icon className={cn("h-3.5 w-3.5", config.color)} />
          )}
        </div>
        {!isLast && (
          <div
            className={cn(
              "w-0.5 flex-1 min-h-[16px] transition-colors duration-500",
              isDone ? "bg-emerald-500/30" : "bg-border/50"
            )}
          />
        )}
      </div>

      <div
        className={cn(
          "flex-1 pb-2 min-w-0"
        )}
      >
        <button
          type="button"
          onClick={hasDetails ? onToggleExpand : undefined}
          className={cn(
            "flex items-center gap-2 w-full text-left",
            hasDetails && "cursor-pointer hover:opacity-80 transition-opacity",
            !hasDetails && "cursor-default"
          )}
        >
          {hasDetails && (
            <ChevronRight
              className={cn(
                "h-3 w-3 text-muted-foreground/50 shrink-0 transition-transform duration-200",
                expanded && "rotate-90"
              )}
            />
          )}
          <span
            className={cn(
              "text-xs font-medium tracking-wide",
              isDone && "text-emerald-600 dark:text-emerald-400",
              isRunning && config.color,
              isError && "text-red-500"
            )}
          >
            {step.label}
          </span>
          {(isRunning || isDone) && elapsed > 0 && (
            <span className="text-[10px] tabular-nums text-muted-foreground/60">
              {formatDuration(elapsed)}
            </span>
          )}
        </button>
        {step.detail && (
          <p
            className={cn(
              "text-[11px] leading-tight mt-0.5 line-clamp-2",
              isDone ? "text-muted-foreground/70" : "text-foreground/70",
              hasDetails && "pl-5"
            )}
          >
            {step.detail}
          </p>
        )}
        {expanded && hasDetails && (
          <div
            className={cn(
              "mt-1.5 pl-5 space-y-1"
            )}
          >
            {children}
          </div>
        )}
      </div>
    </div>
  )
}

export function NodeProgressTimeline({ steps, className }: NodeProgressTimelineProps) {
  const [, setTick] = React.useState(0)
  const [expandedNodes, setExpandedNodes] = React.useState<Set<string>>(new Set())

  const streamingEvidence = useChatStore((s) => s.streamingEvidence)
  const streamingReasoningSteps = useChatStore((s) => s.streamingReasoningSteps)
  const streamingIntent = useChatStore((s) => s.streamingIntent)
  const streamingVerdictData = useChatStore((s) => s.streamingVerdictData)

  React.useEffect(() => {
    const hasRunning = steps.some((s) => s.status === "running")
    if (!hasRunning) return

    const interval = setInterval(() => {
      setTick((t) => t + 1)
    }, 500)

    return () => clearInterval(interval)
  }, [steps])

  React.useEffect(() => {
    const doneNodes = steps.filter((s) => s.status === "done")
    if (doneNodes.length <= 0) return
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      let changed = false
      for (const step of doneNodes) {
        if (!prev.has(step.node)) {
          next.add(step.node)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [steps])

  const toggleExpand = (node: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(node)) {
        next.delete(node)
      } else {
        next.add(node)
      }
      return next
    })
  }

  if (steps.length === 0) return null

  const anyRunning = steps.some((s) => s.status === "running")

  function renderNodeDetail(node: string): React.ReactNode | undefined {
    switch (node) {
      case "intention":
        return streamingIntent ? <IntentionDetailPanel intent={streamingIntent} /> : undefined
      case "retrieval":
        return streamingEvidence.length > 0 ? <RetrievalDetailPanel evidence={streamingEvidence} /> : undefined
      case "reasoning":
        return streamingReasoningSteps.length > 0 ? <ReasoningDetailPanel steps={streamingReasoningSteps} /> : undefined
      case "verdict":
        return streamingVerdictData ? <VerdictDetailPanel verdict={streamingVerdictData} /> : undefined
      default:
        return undefined
    }
  }

  return (
    <div className={cn("space-y-0", className)}>
      <div className="flex items-center gap-1.5 mb-2">
        {anyRunning ? (
          <Loader2 className="h-3 w-3 text-primary animate-spin" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        )}
        <span className="text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider">
          {anyRunning ? "链路运行中" : "链路已完成"} · {steps.filter((s) => s.status === "done").length}/{steps.length}
        </span>
      </div>
      {steps.map((step, i) => {
        const detail = renderNodeDetail(step.node)
        return (
          <NodeStepCard
            key={step.node}
            step={step}
            isLast={i === steps.length - 1}
            index={i}
            expanded={expandedNodes.has(step.node)}
            onToggleExpand={() => toggleExpand(step.node)}
          >
            {detail}
          </NodeStepCard>
        )
      })}
    </div>
  )
}
