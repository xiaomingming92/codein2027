"use client"

import * as React from "react"
import { Brain, Lightbulb, TrendingUp, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StreamingReasoningStep } from "@/stores/chat-store"

interface StreamingReasoningStepsProps {
  steps: StreamingReasoningStep[]
  className?: string
}

const actionIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  analyze: TrendingUp,
  evaluate: AlertTriangle,
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

function StepCard({ step, index }: { step: StreamingReasoningStep; index: number }) {
  const Icon = actionIconMap[step.action] || Brain
  const label = actionLabelMap[step.action] || step.action

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md bg-background/60 px-2.5 py-2 border border-border/60"
      )}
    >
      <div className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-[10px] font-bold text-primary tabular-nums">
        {step.step}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 text-primary/70" />
          <span className="text-[10px] font-medium text-primary/70 uppercase tracking-wide">
            {label}
          </span>
        </div>
        <p className="text-[11px] leading-tight text-foreground/80 line-clamp-2">
          {step.description}
        </p>
      </div>
    </div>
  )
}

export function StreamingReasoningSteps({ steps, className }: StreamingReasoningStepsProps) {
  if (steps.length === 0) return null

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <Brain className="h-3 w-3 text-primary animate-pulse" />
        <span className="text-[10px] font-medium text-primary/80 uppercase tracking-wider">
          推理中 · {steps.length}步
        </span>
      </div>
      {steps.map((step, i) => (
        <StepCard key={step.step} step={step} index={i} />
      ))}
    </div>
  )
}