"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface ConfidenceFactor {
  factor: string
  impact: number
  description: string
}

interface ConfidenceBreakdownProps {
  baseConfidence: number
  reliabilityDiscount: number
  conflictDiscount: number
  uncertaintyDiscount: number
  finalConfidence: number
  factors: ConfidenceFactor[]
  className?: string
}

export function ConfidenceBreakdown({
  baseConfidence,
  reliabilityDiscount,
  conflictDiscount,
  uncertaintyDiscount,
  finalConfidence,
  factors,
  className,
}: ConfidenceBreakdownProps) {
  const confidenceLevel =
    finalConfidence >= 70 ? "success" : finalConfidence >= 40 ? "warning" : "destructive"

  const confidenceColor =
    finalConfidence >= 70
      ? "bg-green-500"
      : finalConfidence >= 40
      ? "bg-yellow-500"
      : "bg-red-500"

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">置信度分析</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-sm text-muted-foreground">最终置信度</div>
            <div className="text-3xl font-bold">{finalConfidence}%</div>
          </div>
          <Badge variant={confidenceLevel} className="text-lg px-3 py-1">
            {finalConfidence >= 70 ? "高" : finalConfidence >= 40 ? "中" : "低"}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>基础置信度</span>
            <span>{baseConfidence}%</span>
          </div>
          <Progress value={finalConfidence} className="h-3" indicatorClassName={confidenceColor} />
        </div>

        <div className="border-t pt-4 space-y-3">
          <div className="text-sm font-semibold">扣分因素</div>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">可靠性折扣</span>
              <span className="text-red-500">-{reliabilityDiscount.toFixed(1)}</span>
            </div>
            <Progress
              value={Math.max(0, 100 - reliabilityDiscount * 5)}
              className="h-1.5"
            />

            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">冲突折扣</span>
              <span className="text-red-500">-{conflictDiscount.toFixed(1)}</span>
            </div>
            <Progress
              value={Math.max(0, 100 - conflictDiscount * 5)}
              className="h-1.5"
            />

            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">不确定性折扣</span>
              <span className="text-red-500">-{uncertaintyDiscount.toFixed(1)}</span>
            </div>
            <Progress
              value={Math.max(0, 100 - uncertaintyDiscount * 5)}
              className="h-1.5"
            />
          </div>
        </div>

        {factors.length > 0 && (
          <div className="border-t pt-4 space-y-2">
            <div className="text-sm font-semibold">详细因素</div>
            {factors.map((factor, index) => (
              <div key={index} className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{factor.factor}</span>
                <span
                  className={cn(
                    "font-medium",
                    factor.impact > 0 ? "text-green-500" : "text-red-500"
                  )}
                >
                  {factor.impact > 0 ? "+" : ""}{factor.impact.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
