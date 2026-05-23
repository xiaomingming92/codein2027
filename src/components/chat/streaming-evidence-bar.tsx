"use client"

import * as React from "react"
import { Search, Database, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import type { StreamingEvidence } from "@/stores/chat-store"

interface StreamingEvidenceBarProps {
  evidence: StreamingEvidence[]
  className?: string
}

const sourceIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  knowledge: Database,
  project_context: FileText,
  keywords: Search,
}

const sourceLabelMap: Record<string, string> = {
  knowledge: "知识库",
  project_context: "项目",
  keywords: "关键词",
}

function EvidenceCard({ item, index }: { item: StreamingEvidence; index: number }) {
  const Icon = sourceIconMap[item.source] || FileText
  const label = sourceLabelMap[item.source] || item.source

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md bg-background/60 px-2.5 py-2 border border-border/60"
      )}
    >
      <div className="flex-shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {label}
          </span>
          <div className="flex-1 h-1 rounded-full bg-muted-foreground/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500/60 transition-all duration-500"
              style={{ width: `${Math.round(item.relevance * 100)}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-muted-foreground/70">
            {Math.round(item.relevance * 100)}%
          </span>
        </div>
        <p className="text-[11px] leading-tight text-foreground/80 line-clamp-2">
          {item.summary}
        </p>
      </div>
    </div>
  )
}

export function StreamingEvidenceBar({ evidence, className }: StreamingEvidenceBarProps) {
  if (evidence.length === 0) return null

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5">
        <Search className="h-3 w-3 text-emerald-500 animate-pulse" />
        <span className="text-[10px] font-medium text-emerald-500/80 uppercase tracking-wider">
          证据收集中 · {evidence.length}条
        </span>
      </div>
      {evidence.map((item, i) => (
        <EvidenceCard key={item.id} item={item} index={i} />
      ))}
    </div>
  )
}