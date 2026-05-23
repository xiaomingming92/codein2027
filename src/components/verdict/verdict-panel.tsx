"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from "@/lib/utils"
import { getVerdictTypeLabel, getVerdictTypeColor } from "@/types/verdict"
import type { Verdict, VerdictType } from "@/types/verdict"

interface VerdictPanelProps {
  verdict: Verdict | null
  className?: string
}

export function VerdictPanel({ verdict, className }: VerdictPanelProps) {
  if (!verdict) {
    return (
      <Card className={cn("", className)}>
        <CardContent className="py-8 text-center text-muted-foreground">
          暂无裁决结果
        </CardContent>
      </Card>
    )
  }

  const confidence = verdict.confidence?.final_confidence || 0
  const confidenceLevel =
    confidence >= 70 ? "success" : confidence >= 40 ? "warning" : "destructive"

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {getVerdictTypeLabel(verdict.type as VerdictType)}
          </CardTitle>
          <Badge variant={confidenceLevel}>{confidence}%</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="mb-2 text-sm font-semibold">结论</h4>
          <p className="text-sm">{verdict.conclusion?.content}</p>
        </div>

        {verdict.conclusion?.actions && verdict.conclusion.actions.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold">建议行动</h4>
            <ul className="list-inside list-disc space-y-1 text-sm">
              {verdict.conclusion.actions.map((action, i) => (
                <li key={i}>{action}</li>
              ))}
            </ul>
          </div>
        )}

        {verdict.conclusion?.risks && verdict.conclusion.risks.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold">风险提示</h4>
            <div className="space-y-2">
              {verdict.conclusion.risks.map((risk, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge
                    variant={
                      risk.level === "high" || risk.level === "critical"
                        ? "destructive"
                        : risk.level === "medium"
                        ? "warning"
                        : "secondary"
                    }
                  >
                    {risk.level}
                  </Badge>
                  <span>{risk.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="reasoning">
            <AccordionTrigger>推理路径</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 text-sm">
                {verdict.reasoning_path?.map((step, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-muted-foreground">#{step.step}</span>
                    <span>{step.description}</span>
                  </div>
                ))}
                {(!verdict.reasoning_path || verdict.reasoning_path.length === 0) && (
                  <span className="text-muted-foreground">暂无推理路径</span>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="confidence">
            <AccordionTrigger>置信度分析</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2 text-sm">
                {verdict.confidence?.factors?.map((factor, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{factor.factor}</span>
                    <span className={factor.impact < 0 ? "text-red-500" : "text-green-500"}>
                      {factor.impact > 0 ? "+" : ""}{factor.impact}
                    </span>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}

interface ReasoningPathAccordionProps {
  steps: Array<{
    step: number
    action: string
    description: string
    input_evidence: string[]
  }>
  className?: string
}

export function ReasoningPathAccordion({ steps, className }: ReasoningPathAccordionProps) {
  return (
    <Accordion type="single" collapsible className={cn("w-full", className)}>
      {steps.map((step) => (
        <AccordionItem key={step.step} value={`step-${step.step}`}>
          <AccordionTrigger>
            <span className="text-sm">
              #{step.step} {step.action} - {step.description.slice(0, 50)}...
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 text-sm">
              <p>{step.description}</p>
              {step.input_evidence.length > 0 && (
                <div className="text-muted-foreground">
                  证据: {step.input_evidence.join(", ")}
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
