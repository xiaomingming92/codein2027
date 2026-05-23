"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, AlertCircle, Info, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface RiskItem {
  level: "low" | "medium" | "high" | "critical"
  description: string
  probability: number
  impact: string
  mitigation?: string
}

interface RiskAlertProps {
  risks: RiskItem[]
  className?: string
}

export function RiskAlert({ risks, className }: RiskAlertProps) {
  const getRiskIcon = (level: RiskItem["level"]) => {
    switch (level) {
      case "critical":
        return <XCircle className="h-5 w-5" />
      case "high":
        return <AlertTriangle className="h-5 w-5" />
      case "medium":
        return <AlertCircle className="h-5 w-5" />
      default:
        return <Info className="h-5 w-5" />
    }
  }

  const getRiskColor = (level: RiskItem["level"]) => {
    switch (level) {
      case "critical":
        return "bg-red-100 border-red-500 text-red-800"
      case "high":
        return "bg-orange-100 border-orange-500 text-orange-800"
      case "medium":
        return "bg-yellow-100 border-yellow-500 text-yellow-800"
      default:
        return "bg-blue-100 border-blue-500 text-blue-800"
    }
  }

  if (risks.length === 0) {
    return null
  }

  return (
    <div className={cn("space-y-2", className)}>
      {risks.map((risk, index) => (
        <Card
          key={index}
          className={cn(
            "border-l-4",
            getRiskColor(risk.level)
          )}
        >
          <CardHeader className="py-3 pb-0">
            <div className="flex items-center gap-2">
              {getRiskIcon(risk.level)}
              <CardTitle className="text-base flex-1">
                {risk.description}
              </CardTitle>
              <Badge
                variant={
                  risk.level === "critical" || risk.level === "high"
                    ? "destructive"
                    : risk.level === "medium"
                    ? "warning"
                    : "secondary"
                }
              >
                {risk.level.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="py-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">概率: </span>
                <span className="font-medium">{(risk.probability * 100).toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">影响: </span>
                <span className="font-medium">{risk.impact}</span>
              </div>
            </div>
            {risk.mitigation && (
              <div className="mt-2 text-sm">
                <span className="text-muted-foreground">缓解措施: </span>
                <span>{risk.mitigation}</span>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
