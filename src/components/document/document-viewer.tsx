"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { DOC_STATUS } from "@/constants/doc-status"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileText, Download, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

interface DocumentViewerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: {
    id: string
    name: string
    type: string
    content?: string
    filePath?: string
    tags: string[]
    status: string
    version: number
  } | null
}

export function DocumentViewer({
  open,
  onOpenChange,
  document,
}: DocumentViewerProps) {
  if (!document) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {document.name}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">v{document.version}</Badge>
              <Badge
                variant={
                  document.status === DOC_STATUS.INDEXED
                    ? "success"
                    : document.status === DOC_STATUS.OUTDATED
                    ? "warning"
                    : "secondary"
                }
              >
                {document.status === DOC_STATUS.INDEXED
                  ? "已向量化"
                  : document.status === DOC_STATUS.OUTDATED
                  ? "已过期"
                  : "待处理"}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          {document.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>

        <ScrollArea className="flex-1">
          {document.content ? (
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm font-mono p-4 bg-muted rounded-lg overflow-y-auto max-h-[50vh]">
                {document.content}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4" />
              <p>文档内容无法预览</p>
              {document.filePath && (
                <Button variant="outline" className="mt-4" asChild>
                  <a
                    href={document.filePath}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    下载文档
                  </a>
                </Button>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
