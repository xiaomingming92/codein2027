"use client"

import * as React from "react"
import { ChevronRight, ChevronDown, ExternalLink, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DocumentViewer } from "@/components/document/document-viewer"
import type { StructuredEvidenceChain } from "@/agents/types"

interface EvidenceChainPanelProps {
  evidenceChain: StructuredEvidenceChain
  className?: string
}

export function EvidenceChainPanel({ evidenceChain, className }: EvidenceChainPanelProps) {
  const [expandedAll, setExpandedAll] = React.useState(false)

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          🔗 证据链（{evidenceChain.evidences.length}条）
        </p>
        <button
          onClick={() => setExpandedAll(!expandedAll)}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {expandedAll ? "收起全部" : "展开全部"}
        </button>
      </div>
      <div className="space-y-1">
        {evidenceChain.evidences.map((evidence) => (
          <EvidenceItem
            key={evidence.id}
            evidence={evidence}
            defaultExpanded={expandedAll}
          />
        ))}
      </div>
    </div>
  )
}

interface EvidenceItemProps {
  evidence: StructuredEvidenceChain["evidences"][number]
  defaultExpanded?: boolean
}

function EvidenceItem({ evidence, defaultExpanded }: EvidenceItemProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded || false)
  const [viewerOpen, setViewerOpen] = React.useState(false)

  React.useEffect(() => {
    setExpanded(defaultExpanded || false)
  }, [defaultExpanded])

  const isKnowledge = evidence.source === "knowledge"
  const documentName = (evidence.metadata?.documentName as string) || "未知文档"
  const isFullDocumentRequest = (evidence.metadata?.isFullDocumentRequest as boolean) || false

  const viewerDocument = isKnowledge ? {
    id: evidence.id,
    name: documentName,
    type: evidence.type,
    content: evidence.content,
    status: "INDEXED" as const,
    tags: [],
    version: 1,
  } : null

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

        {/* <span className="text-xs font-mono text-muted-foreground shrink-0">[{evidence.id}]</span> */}

        <span className="text-xs text-muted-foreground shrink-0">{evidence.source}</span>

        <span className="text-xs shrink-0 text-primary/70">{evidence.type}</span>

        {isKnowledge && (
          <span className="text-xs truncate text-primary/70 max-w-[120px]">{documentName}</span>
        )}

        <div className="flex items-center gap-3 ml-auto shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">可靠</span>
            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full"
                style={{ width: `${evidence.reliability * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{(evidence.reliability * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">关联</span>
            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${evidence.relevance * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{(evidence.relevance * 100).toFixed(0)}%</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t">
          <div className="pt-2">
            <p className="text-xs text-muted-foreground">
              来源：{evidence.source} | 类型：{evidence.type} | 向量：{evidence.id}
            </p>
            <p className="text-sm mt-1 whitespace-pre-wrap">{evidence.content}</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">可靠性：</span>
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${evidence.reliability * 100}%` }}
                />
              </div>
              <span className="text-xs">{(evidence.reliability * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">关联性：</span>
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${evidence.relevance * 100}%` }}
                />
              </div>
              <span className="text-xs">{(evidence.relevance * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {evidence.detailUrl && (
              <a
                href={evidence.detailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                查看原始文档
              </a>
            )}
            {isKnowledge && viewerDocument && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => setViewerOpen(true)}
              >
                <FileText className="h-3 w-3" />
                {isFullDocumentRequest ? "查看完整文档" : "查看原文"}
              </Button>
            )}
          </div>
        </div>
      )}

      {isKnowledge && viewerDocument && (
        <DocumentViewer
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          document={viewerDocument}
        />
      )}
    </div>
  )
}
