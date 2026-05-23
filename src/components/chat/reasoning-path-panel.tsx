"use client"

import * as React from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StructuredReasoningPath } from "@/agents/types"

interface ReasoningPathPanelProps {
  reasoningPath: StructuredReasoningPath
  className?: string
}

export function ReasoningPathPanel({ reasoningPath, className }: ReasoningPathPanelProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium text-muted-foreground">
        🧠 推理路径（{reasoningPath.steps.length}步）
      </p>
      <div className="space-y-1">
        {reasoningPath.steps.map((step) => (
          <ReasoningStepItem key={step.step} step={step} />
        ))}
      </div>
      {reasoningPath.traces.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground">推理痕迹：</p>
          <ul className="text-xs text-muted-foreground list-disc list-inside">
            {reasoningPath.traces.map((trace, index) => (
              <li key={index}>{trace}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface ReasoningStepItemProps {
  step: StructuredReasoningPath["steps"][number]
}

function ReasoningStepItem({ step }: ReasoningStepItemProps) {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div className="border rounded-md">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2 text-left cursor-pointer hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-mono text-muted-foreground">Step{step.step}</span>
        <span className="text-xs">{step.action}</span>
        <span className="text-xs text-muted-foreground truncate flex-1">— {step.description}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t pt-2">
          <p className="text-xs text-muted-foreground">动作：{step.action}</p>
          <p className="text-sm">{step.description}</p>
          {step.inputEvidenceIds.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">引用证据：</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {step.inputEvidenceIds.map((id) => (
                  <span key={id} className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    {id}
                  </span>
                ))}
              </div>
            </div>
          )}
          {step.intermediateResult !== undefined && step.intermediateResult !== null && (
            <div>
              <p className="text-xs text-muted-foreground">中间结果：</p>
              <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                {typeof step.intermediateResult === "string"
                  ? step.intermediateResult
                  : JSON.stringify(step.intermediateResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
