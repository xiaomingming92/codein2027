"use client"

import * as React from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StructuredVerdict } from "@/agents/types"

interface RiskDetailPanelProps {
  risks: StructuredVerdict["conclusion"]["risks"]
  className?: string
}

export function RiskDetailPanel({ risks, className }: RiskDetailPanelProps) {
  if (risks.length === 0) return null

  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-xs font-medium text-muted-foreground">
        ⚠️ 风险提示（{risks.length}项）
      </p>
      <div className="space-y-1">
        {risks.map((risk, index) => (
          <RiskItem key={index} risk={risk} />
        ))}
      </div>
    </div>
  )
}

interface RiskItemProps {
  risk: StructuredVerdict["conclusion"]["risks"][number]
}

function RiskItem({ risk }: RiskItemProps) {
  const [expanded, setExpanded] = React.useState(false)

  const levelConfig = {
    low: { label: "LOW", color: "text-green-600 bg-green-50 border-green-200" },
    medium: { label: "MEDIUM", color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
    high: { label: "HIGH", color: "text-red-600 bg-red-50 border-red-200" },
  }

  const config = levelConfig[risk.level]

  return (
    <div className={cn("border rounded-md", config.color.split(" ").find(c => c.startsWith("border-")) ? "" : "border-border")}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2 text-left cursor-pointer hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded", config.color)}>
          {config.label}
        </span>
        <span className="text-xs truncate flex-1">{risk.description}</span>
        <span className="text-xs text-muted-foreground">{(risk.probability * 100).toFixed(0)}%</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1 border-t pt-2">
          <p className="text-xs text-muted-foreground">概率：{(risk.probability * 100).toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground">影响：{risk.impact}</p>
          <p className="text-sm">{risk.description}</p>
        </div>
      )}
    </div>
  )
}
