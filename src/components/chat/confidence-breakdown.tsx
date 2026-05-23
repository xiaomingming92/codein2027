"use client"

import * as React from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StructuredVerdict } from "@/agents/types"

interface ConfidenceBreakdownProps {
  confidence: StructuredVerdict["confidence"]
  className?: string
}

export function ConfidenceBreakdown({ confidence, className }: ConfidenceBreakdownProps) {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div className={className}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="font-medium">📊 置信度：{confidence.finalConfidence}%</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 pl-4">
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                confidence.finalConfidence >= 70
                  ? "bg-green-500"
                  : confidence.finalConfidence >= 40
                  ? "bg-yellow-500"
                  : "bg-red-500"
              )}
              style={{ width: `${confidence.finalConfidence}%` }}
            />
          </div>

          <div className="space-y-1">
            {confidence.breakdown.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{item.factor}</span>
                <div className="flex items-center gap-2">
                  <span className={item.value >= 0 ? "text-green-600" : "text-red-600"}>
                    {item.value >= 0 ? "+" : ""}{item.value}%
                  </span>
                  <span className="text-muted-foreground">— {item.reason}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-muted-foreground pt-1 border-t">
            基础置信度 {confidence.baseConfidence}% → 可靠性折扣 -{confidence.reliabilityDiscount}% → 冲突折扣 -{confidence.conflictDiscount}% → 最终 {confidence.finalConfidence}%
          </div>
        </div>
      )}
    </div>
  )
}
