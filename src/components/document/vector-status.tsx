"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

interface VectorStatusProps {
  totalDocuments: number
  indexedDocuments: number
  pendingDocuments: number
  failedDocuments: number
  className?: string
}

export function VectorStatus({
  totalDocuments,
  indexedDocuments,
  pendingDocuments,
  failedDocuments,
  className,
}: VectorStatusProps) {
  const indexedPercent =
    totalDocuments > 0 ? (indexedDocuments / totalDocuments) * 100 : 0

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">向量化状态</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>完成度</span>
            <span>{Math.round(indexedPercent)}%</span>
          </div>
          <Progress value={indexedPercent} className="h-2" />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="space-y-1">
            <div className="text-2xl font-bold">{indexedDocuments}</div>
            <Badge variant="success" className="bg-green-500">
              已完成
            </Badge>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold">{pendingDocuments}</div>
            <Badge variant="secondary">待处理</Badge>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-bold">{failedDocuments}</div>
            <Badge variant="destructive">失败</Badge>
          </div>
        </div>

        <div className="text-xs text-muted-foreground text-center">
          共 {totalDocuments} 个文档
        </div>
      </CardContent>
    </Card>
  )
}

interface VectorIndexProgressProps {
  current: number
  total: number
  currentDocument?: string
  className?: string
}

export function VectorIndexProgress({
  current,
  total,
  currentDocument,
  className,
}: VectorIndexProgressProps) {
  const percent = total > 0 ? (current / total) * 100 : 0

  return (
    <Card className={cn("", className)}>
      <CardContent className="py-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>正在向量化...</span>
            <span>
              {current} / {total}
            </span>
          </div>
          <Progress value={percent} className="h-2" />
          {currentDocument && (
            <div className="text-xs text-muted-foreground truncate">
              {currentDocument}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
