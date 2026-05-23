"use client"

import * as React from "react"
import { ChevronRight, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { EvidenceChainPanel } from "@/components/chat/evidence-chain-panel"
import { ReasoningPathPanel } from "@/components/chat/reasoning-path-panel"
import { ConfidenceBreakdown } from "@/components/chat/confidence-breakdown"
import { RiskDetailPanel } from "@/components/chat/risk-detail-panel"
import type { StructuredAgentResponse, DisplayContent } from "@/agents/types"

interface StructuredResponseRendererProps {
  data: StructuredAgentResponse
  className?: string
}

export function StructuredResponseRenderer({ data, className }: StructuredResponseRendererProps) {
  const { displayContent, evidenceChain, reasoningPath, verdict, interactionPoint } = data

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-sm font-medium">{displayContent.summary}</p>

      {displayContent.sections.map((section, index) => (
        <SectionRenderer
          key={`${section.type}-${index}`}
          section={section}
          evidenceChain={evidenceChain}
          reasoningPath={reasoningPath}
          verdict={verdict}
          interactionPoint={interactionPoint}
        />
      ))}
    </div>
  )
}

interface SectionRendererProps {
  section: DisplayContent["sections"][number]
  evidenceChain: StructuredAgentResponse["evidenceChain"]
  reasoningPath: StructuredAgentResponse["reasoningPath"]
  verdict: StructuredAgentResponse["verdict"]
  interactionPoint: StructuredAgentResponse["interactionPoint"]
}

function SectionRenderer({
  section,
  evidenceChain,
  reasoningPath,
  verdict,
  interactionPoint,
}: SectionRendererProps) {
  const [expanded, setExpanded] = React.useState(false)

  if (section.type === "evidence" && evidenceChain) {
    return (
      <EvidenceChainPanel evidenceChain={evidenceChain} />
    )
  }

  if (section.type === "reasoning" && reasoningPath) {
    return (
      <ReasoningPathPanel reasoningPath={reasoningPath} />
    )
  }

  if (section.type === "confidence" && verdict) {
    return (
      <ConfidenceBreakdown confidence={verdict.confidence} />
    )
  }

  if (section.type === "risk" && verdict) {
    return (
      <RiskDetailPanel risks={verdict.conclusion.risks} />
    )
  }

  if (section.type === "interaction" && interactionPoint) {
    return (
      <InteractionPointSection interactionPoint={interactionPoint} />
    )
  }

  return (
    <div className="space-y-1">
      {section.expandable ? (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          <span className="font-medium">{section.title}</span>
        </button>
      ) : (
        <p className="text-xs font-medium text-muted-foreground">{section.title}</p>
      )}
      {(expanded || !section.expandable) && (
        <p className="text-sm whitespace-pre-wrap pl-4">{section.content}</p>
      )}
    </div>
  )
}

function InteractionPointSection({
  interactionPoint,
}: {
  interactionPoint: NonNullable<StructuredAgentResponse["interactionPoint"]>
}) {
  const [selectedOption, setSelectedOption] = React.useState<string | null>(null)

  return (
    <div className="space-y-2 p-3 bg-primary/5 rounded-md border border-primary/20">
      <p className="text-sm font-medium">{interactionPoint.description}</p>
      {interactionPoint.dimension && (
        <p className="text-xs text-muted-foreground">维度：{interactionPoint.dimension}</p>
      )}
      <div className="space-y-2">
        {interactionPoint.options.map((option, index) => (
          <button
            key={index}
            onClick={() => setSelectedOption(option.label)}
            className={cn(
              "w-full text-left p-2 rounded-md border text-sm cursor-pointer transition-colors",
              selectedOption === option.label
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50"
            )}
          >
            <p className="font-medium">{option.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{option.reason}</p>
            <p className="text-xs text-muted-foreground">影响：{option.impact}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
