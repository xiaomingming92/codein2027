import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { SourceType } from "@prisma/client"
import { stat } from "fs/promises"
import { STATUS_DISPLAY } from "@/constants/doc-status"

// GET /api/knowledge/documents - 获取知识库文档列表
// 支持分页: ?page=1&pageSize=50 (不传则返回全部，向后兼容)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sourceType = searchParams.get("sourceType") || "all"
    const pageParam = searchParams.get("page")
    const pageSizeParam = searchParams.get("pageSize")
    const enabledPagination = pageParam !== null || pageSizeParam !== null

    // 构建查询条件
    const whereClause: Record<string, unknown> = {}
    if (sourceType !== "all") {
      whereClause.sourceType = sourceType.toUpperCase()
    }

    let documents
    let total: number

    if (enabledPagination) {
      const page = Math.max(1, parseInt(pageParam || "1", 10))
      const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam || "50", 10)))

      ;[documents, total] = await prisma.$transaction([
        prisma.document.findMany({
          where: whereClause,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.document.count({ where: whereClause }),
      ])
    } else {
      documents = await prisma.document.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
      })
      total = documents.length
    }

    const documentsWithSize = await Promise.all(
      documents.map(async (doc) => {
        let size = 0
        if (doc.filePath) {
          try {
            const fileStat = await stat(doc.filePath)
            size = fileStat.size
          } catch {
            const meta = (doc.metadata as Record<string, unknown>) || {}
            size = (meta.originalSize as number) || 0
          }
        }

        const meta = (doc.metadata as Record<string, unknown>) || {}
        const vectorCount =
          (meta.vectorCount as number) ||
          (Array.isArray(doc.vectorIds) ? doc.vectorIds.length : 0)

        return {
          id: doc.id,
          name: doc.name,
          type: doc.type,
          size,
          sourceType: doc.sourceType,
          status: STATUS_DISPLAY[doc.status] || "unknown",
          uploadedAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          vectorCount: vectorCount > 0 ? vectorCount : undefined,
          version: doc.version,
          contentHash: doc.contentHash,
          tags: doc.tags || [],
          lockedTags: (meta.lockedTags as string[]) || [],
        }
      })
    )

    const response: Record<string, unknown> = {
      success: true,
      data: documentsWithSize,
    }

    if (enabledPagination) {
      const page = Math.max(1, parseInt(pageParam || "1", 10))
      const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam || "50", 10)))
      response.pagination = {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      }
    } else {
      response.total = total
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Failed to fetch knowledge documents:", error)
    return NextResponse.json(
      { success: false, error: "获取文档列表失败" },
      { status: 500 }
    )
  }
}
