"use client"

import * as React from "react"
import { Virtuoso } from "react-virtuoso"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Upload, FileText, Image, Trash2, Database, Loader2, RefreshCw, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { DOC_STATUS, SOURCE_TYPE, STATUS_DISPLAY } from "@/constants/doc-status"
import type { UIStatus } from "@/constants/doc-status"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"

interface KnowledgeDocument {
  id: string
  name: string
  type: string
  size: number
  sourceType: string
  status: UIStatus
  uploadedAt: string
  updatedAt?: string
  vectorCount?: number
  version?: number
  tags: string[]
  lockedTags: string[]
}

interface SSEProgress {
  status: typeof DOC_STATUS[keyof typeof DOC_STATUS] | "PARSING"
  message: string
  progress?: number
}

interface SyncStats {
  total: number
  indexed: number
  pending: number
  indexing: number
  errors: number
  bySource?: {
    projectDoc: number
    knowledgeUpdate: number
  }
}

interface SyncResult {
  type: "start" | "progress" | "complete" | "error"
  message?: string
  progress?: number
  success?: boolean
  projectDocAdded?: number
  projectDocUpdated?: number
  projectDocDeleted?: number
  projectDocUnchanged?: number
  knowledgeUpdateIndexed?: number
  errorCount?: number
  errors?: string[]
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

function DocumentSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-3 rounded-lg border animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded">
              <div className="h-4 w-4 bg-muted-foreground/20 rounded" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-40 bg-muted-foreground/20 rounded" />
              <div className="h-3 w-24 bg-muted-foreground/20 rounded" />
            </div>
          </div>
          <div className="h-5 w-16 bg-muted-foreground/20 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function KnowledgeBasePanel() {
  const [documents, setDocuments] = React.useState<KnowledgeDocument[]>([])
  const [isLoadingDocuments, setIsLoadingDocuments] = React.useState(true)
  const [documentLoadError, setDocumentLoadError] = React.useState<string | null>(null)
  const [isUploading, _setIsUploading] = React.useState(false)
  const [isSyncing, setIsSyncing] = React.useState(false)
  const [syncProgress, setSyncProgress] = React.useState(0)
  const [syncMessage, setSyncMessage] = React.useState("")
  const [syncStats, setSyncStats] = React.useState<SyncStats | null>(null)
  const [dragActive, setDragActive] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [totalPages, setTotalPages] = React.useState(1)
  const [totalCount, setTotalCount] = React.useState(0)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [editingTagDocId, setEditingTagDocId] = React.useState<string | null>(null)
  const [tagInputValue, setTagInputValue] = React.useState("")

  const fetchDocuments = React.useCallback(async (pageNum: number) => {
    setIsLoadingDocuments(true)
    setDocumentLoadError(null)
    try {
      const response = await fetch(`/api/knowledge/documents?page=${pageNum}&pageSize=${pageSize}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setDocuments(data.data || [])
          if (data.pagination) {
            setTotalPages(data.pagination.totalPages)
            setTotalCount(data.pagination.total)
          } else {
            setTotalPages(1)
            setTotalCount(data.data?.length || 0)
          }
        }
      } else {
        setDocumentLoadError(`请求失败 (${response.status})`)
      }
    } catch {
      setDocumentLoadError("网络错误，无法加载文档列表")
    } finally {
      setIsLoadingDocuments(false)
    }
  }, [pageSize])

  const fetchSyncStatsData = React.useCallback(async () => {
    try {
      const response = await fetch("/api/knowledge/sync")
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setSyncStats(data.data)
        }
      }
    } catch (error) {
      console.error("Failed to fetch sync stats:", error)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    const load = async () => {
      await fetchDocuments(page)
      if (!cancelled) {
        await fetchSyncStatsData()
      }
    }
    load()

    return () => {
      cancelled = true
    }
  }, [page, fetchDocuments, fetchSyncStatsData])

  const goToPage = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return
    setPage(newPage)
  }

  const connectSSE = (docId: string) => {
    const eventSource = new EventSource(`/api/knowledge/documents/${docId}/progress`)

    eventSource.onmessage = (event) => {
      try {
        const progress: SSEProgress = JSON.parse(event.data)

        setDocuments((prev) =>
          prev.map((doc) => {
            if (doc.id !== docId) return doc
            return {
              ...doc,
              status: (STATUS_DISPLAY[progress.status] as UIStatus) || "processing",
              vectorCount: progress.status === DOC_STATUS.INDEXED ? (doc.vectorCount || 0) : doc.vectorCount,
            }
          })
        )

        if (progress.status === DOC_STATUS.INDEXED || progress.status === DOC_STATUS.ERROR) {
          eventSource.close()
          fetch(`/api/knowledge/documents?page=${page}&pageSize=${pageSize}`)
            .then((res) => res.json())
            .then((data) => {
              if (data.success) {
                setDocuments(data.data || [])
              }
            })
            .catch(console.error)
        }
      } catch (error) {
        console.error("Failed to parse SSE progress:", error)
      }
    }

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error)
      eventSource.close()
    }

    return eventSource
  }

  const handleUpload = async (files: FileList) => {
    _setIsUploading(true)

    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append("file", file)

      try {
        const response = await fetch("/api/knowledge/upload", {
          method: "POST",
          body: formData,
        })

        const data = await response.json()

        if (response.status === 409) {
          alert(`上传失败: ${data.error}\n已存在的文件: ${data.existing?.name}`)
          continue
        }

        if (response.ok && data.success) {
          setPage(1)
          fetchDocuments(1)
          connectSSE(data.data.id)
        } else {
          console.error("Upload failed:", data.error)
          alert(`上传失败: ${data.error || "未知错误"}`)
        }
      } catch (error) {
        console.error("Upload failed:", error)
      }
    }

    _setIsUploading(false)
  }

  const handleDelete = async (docId: string) => {
    try {
      const response = await fetch(`/api/knowledge/documents/${docId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        if (documents.length <= 1 && page > 1) {
          setPage(page - 1)
        } else {
          fetchDocuments(page)
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error("Delete failed:", errorData.error || response.statusText)
      }
    } catch (error) {
      console.error("Delete failed:", error)
    }
  }

  const handleAddTag = async (docId: string, tag: string) => {
    const res = await fetch(`/api/knowledge/documents/${docId}/tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", tag }),
    })
    if (res.ok) {
      const data = await res.json()
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, tags: data.data.tags } : d))
      )
      console.log("[DOC_TAG_UI] add tag:", { docId, tag })
    }
  }

  const handleRemoveTag = async (docId: string, tag: string) => {
    const res = await fetch(`/api/knowledge/documents/${docId}/tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", tag }),
    })
    if (res.ok) {
      const data = await res.json()
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, tags: data.data.tags } : d))
      )
      console.log("[DOC_TAG_UI] remove tag:", { docId, tag })
    }
  }

  const handleSync = async () => {
    setIsSyncing(true)
    setSyncProgress(0)
    setSyncMessage("准备同步...")

    let refreshNeeded = true

    try {
      const response = await fetch("/api/knowledge/sync", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("No response body")
      }

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const result: SyncResult = JSON.parse(line.slice(6))

              if (result.type === "start") {
                setSyncMessage(result.message || "开始同步...")
                setSyncProgress(10)
              } else if (result.type === "progress") {
                setSyncMessage(result.message || "")
                setSyncProgress(result.progress || 0)
              } else if (result.type === "complete") {
                setSyncProgress(100)
                setSyncMessage(
                  `同步完成: 新增 ${result.projectDocAdded || 0}, 更新 ${result.projectDocUpdated || 0}, 删除 ${result.projectDocDeleted || 0}`
                )
                setIsSyncing(false)

                if (result.success) {
                  refreshNeeded = false
                  setPage(1)
                  fetchDocuments(1)
                  fetchSyncStatsData()
                }
              } else if (result.type === "error") {
                setSyncMessage(result.message || "同步失败")
                setIsSyncing(false)
              }
            } catch (error) {
              console.error("Failed to parse sync result:", error)
            }
          }
        }
      }
    } catch (error) {
      console.error("Sync request failed:", error)
      setSyncMessage("同步请求失败")
      setIsSyncing(false)
    } finally {
      if (refreshNeeded) {
        setPage(1)
        fetchDocuments(1)
        fetchSyncStatsData()
      }
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  const getStatusBadge = (status: UIStatus) => {
    switch (status) {
      case "ready":
        return <Badge variant="default" className="bg-green-500">已就绪</Badge>
      case "pending":
        return <Badge variant="secondary">待处理</Badge>
      case "processing":
        return (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            处理中
          </Badge>
        )
      case "outdated":
        return <Badge variant="outline" className="text-orange-500">已过期</Badge>
      case "error":
        return <Badge variant="destructive">错误</Badge>
      default:
        return <Badge variant="secondary">未知</Badge>
    }
  }

  const getSourceTypeBadge = (sourceType: string) => {
    switch (sourceType) {
      case SOURCE_TYPE.PROJECT_DOC:
        return <Badge variant="outline" className="text-blue-500 text-xs">静态文档</Badge>
      case SOURCE_TYPE.KNOWLEDGE_UPDATE:
        return <Badge variant="outline" className="text-purple-500 text-xs">用户上传</Badge>
      default:
        return null
    }
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith("image/")) {
      return <Image className="h-4 w-4" aria-hidden="true" />
    }
    return <FileText className="h-4 w-4" />
  }

  const renderDocumentItem = (_index: number, doc: KnowledgeDocument) => (
    <div className="flex items-start justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors mx-0 my-1">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="p-2 bg-muted rounded flex-shrink-0 mt-0.5">
          {getFileIcon(doc.type)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-sm font-medium truncate max-w-[200px]">
                  {doc.name}
                </p>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[300px] break-words">{doc.name}</p>
              </TooltipContent>
            </Tooltip>
            {getSourceTypeBadge(doc.sourceType)}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatFileSize(doc.size)}</span>
            <span>&bull;</span>
            <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
            {doc.vectorCount && (
              <>
                <span>&bull;</span>
                <span>{doc.vectorCount} 向量</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap mt-1.5">
            {(doc.tags || []).map((tag) => {
              const isLocked = (doc.lockedTags || []).includes(tag)
              return (
                <Badge
                  key={tag}
                  variant={isLocked ? "secondary" : "outline"}
                  className={cn(
                    "text-xs",
                    isLocked && "bg-blue-50 text-blue-700 border-blue-200"
                  )}
                >
                  {tag}
                  {!isLocked && (
                    <button
                      className="ml-1 leading-none hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveTag(doc.id, tag)
                      }}
                    >
                      ×
                    </button>
                  )}
                </Badge>
              )
            })}
            <button
              className="text-xs text-muted-foreground hover:text-primary ml-0.5"
              onClick={(e) => {
                e.stopPropagation()
                setEditingTagDocId(
                  editingTagDocId === doc.id ? null : doc.id
                )
                setTagInputValue("")
              }}
            >
              + 标签
            </button>
            {editingTagDocId === doc.id && (
              <div
                className="flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  className="h-6 w-24 text-xs border rounded px-1"
                  placeholder="输入标签"
                  value={tagInputValue}
                  onChange={(e) => setTagInputValue(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && tagInputValue.trim()) {
                      await handleAddTag(doc.id, tagInputValue.trim())
                      setTagInputValue("")
                      setEditingTagDocId(null)
                    }
                    if (e.key === "Escape") {
                      setEditingTagDocId(null)
                      setTagInputValue("")
                    }
                  }}
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {getStatusBadge(doc.status)}
        {doc.sourceType === SOURCE_TYPE.KNOWLEDGE_UPDATE && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => handleDelete(doc.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  )

  return (
    <TooltipProvider>
    <div className="h-full flex flex-col gap-4 overflow-hidden">
      <Card className="h-[260px] flex-shrink-0">
        <CardHeader className="py-2 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" />
            知识库管理
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-3 text-center transition-colors",
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs text-muted-foreground mb-1">
              拖拽文件到此处，或
              <Button
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                点击上传
              </Button>
            </p>
            <p className="text-[10px] text-muted-foreground">
              支持 PDF、DOC、TXT、MD、图片等格式
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleUpload(e.target.files)}
              accept=".pdf,.doc,.docx,.txt,.md,image/*"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden flex flex-col flex-1 select-none">
        <CardHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle>文档列表 ({totalCount})</CardTitle>
            <div className="flex items-center gap-2 overflow-hidden">
              {syncStats && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground mr-2 flex-none h-[60px]">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    {syncStats.indexed} 已索引
                  </span>
                  {syncStats.indexing > 0 && (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                      {syncStats.indexing} 处理中
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {syncStats.pending} 待处理
                  </span>
                  {syncStats.errors > 0 && (
                    <span className="flex items-center gap-1">
                      <XCircle className="h-3 w-3 text-destructive" />
                      {syncStats.errors} 错误
                    </span>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={isSyncing}
                className="gap-1"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    同步中
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3" />
                    同步知识库
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col min-h-[200px] flex-1 overflow-hidden">
          {isSyncing && (
            <div className="mb-4 space-y-2 flex-shrink-0">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{syncMessage}</span>
                <span className="text-muted-foreground tabular-nums">{syncProgress.toFixed(2)}%</span>
              </div>
              <Progress value={syncProgress} />
            </div>
          )}
          {isLoadingDocuments ? (
            <DocumentSkeleton />
          ) : documentLoadError ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2" />
              <p className="mb-2">{documentLoadError}</p>
              <Button variant="outline" size="sm" onClick={() => fetchDocuments(page)}>
                <RefreshCw className="h-3 w-3 mr-1" />
                重试
              </Button>
            </div>
          ) : documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2" />
              <p>暂无文档</p>
              <p className="text-sm">上传文档以构建知识库</p>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-hidden">
                <Virtuoso
                  data={documents}
                  itemContent={renderDocumentItem}
                  className="h-full"
                  overscan={5}
                  components={{
                    EmptyPlaceholder: () => null,
                  }}
                />
              </div>
              <div className="flex items-center justify-between pt-3 border-t mt-2 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    共 {totalCount} 条，第 {page}/{totalPages} 页
                  </span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>每页</span>
                    <select
                      className="h-6 w-14 rounded border text-xs px-1 bg-background"
                      value={pageSize}
                      onChange={(e) => {
                        const newSize = Number(e.target.value)
                        setPageSize(newSize)
                        setPage(1)
                      }}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                    <span>条</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                  >
                    <ChevronLeft className="h-3 w-3" />
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={page >= totalPages}
                    onClick={() => goToPage(page + 1)}
                  >
                    下一页
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  )
}
