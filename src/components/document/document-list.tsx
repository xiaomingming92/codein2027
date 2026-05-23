"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Upload, FileText, File, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { DOC_STATUS } from "@/constants/doc-status"

interface Document {
  id: string
  name: string
  type: string
  status: typeof DOC_STATUS[keyof typeof DOC_STATUS]
  tags: string[]
  createdAt: string
}

interface DocumentUploaderProps {
  onUpload: (files: FileList) => void
  isLoading?: boolean
  className?: string
}

export function DocumentUploader({
  onUpload,
  isLoading,
  className,
}: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = React.useState(false)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files)
    }
  }

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id="file-upload"
        className="hidden"
        multiple
        onChange={handleFileChange}
        accept=".md,.doc,.docx,.pdf,.txt,.xlsx,.xls"
      />
      <label
        htmlFor="file-upload"
        className="flex flex-col items-center gap-2 cursor-pointer"
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          拖拽文件到这里，或点击上传
        </span>
        <span className="text-xs text-muted-foreground">
          支持 .md, .doc, .docx, .pdf, .txt, .xlsx, .xls
        </span>
      </label>
      {isLoading && (
        <div className="mt-4 text-sm text-muted-foreground">上传中...</div>
      )}
    </div>
  )
}

interface DocumentListProps {
  documents: Document[]
  onDocumentClick?: (doc: Document) => void
  onDocumentDelete?: (doc: Document) => void
  className?: string
}

export function DocumentList({
  documents,
  onDocumentClick,
  onDocumentDelete,
  className,
}: DocumentListProps) {
  const getFileIcon = (type: string) => {
    if (type.includes("markdown") || type.includes("md")) {
      return <FileText className="h-4 w-4" />
    }
    return <File className="h-4 w-4" />
  }

  const getStatusColor = (status: Document["status"]) => {
    switch (status) {
      case DOC_STATUS.INDEXED:
        return "bg-green-500"
      case DOC_STATUS.OUTDATED:
        return "bg-yellow-500"
      default:
        return "bg-gray-400"
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {documents.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          暂无文档
        </div>
      ) : (
        documents.map((doc) => (
          <Card
            key={doc.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onDocumentClick?.(doc)}
          >
            <CardContent className="py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getFileIcon(doc.type)}
                  <div>
                    <div className="font-medium text-sm">{doc.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      getStatusColor(doc.status)
                    )}
                    title={doc.status}
                  />
                  {doc.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDocumentDelete?.(doc)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
