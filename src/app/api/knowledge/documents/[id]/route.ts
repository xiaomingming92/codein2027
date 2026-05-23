import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { SourceType } from "@prisma/client"
import { unlink } from "fs/promises"
import { deleteKnowledgeVectors } from "@/services/knowledge-indexer"

// DELETE /api/knowledge/documents/:id - 删除知识库文档
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const doc = await prisma.document.findUnique({
      where: { id },
    })

    if (!doc) {
      return NextResponse.json(
        { success: false, error: "文档不存在" },
        { status: 404 }
      )
    }

    // 安全校验：只允许删除 KNOWLEDGE_UPDATE 类型的文档
    if (doc.sourceType !== SourceType.KNOWLEDGE_UPDATE) {
      return NextResponse.json(
        { success: false, error: "该文档不属于知识库，无法通过此接口删除" },
        { status: 403 }
      )
    }

    // 先删除 Chroma 向量
    if (doc.vectorIds && doc.vectorIds.length > 0) {
      await deleteKnowledgeVectors(doc.vectorIds)
    }

    // 删除文件
    if (doc.filePath) {
      try {
        await unlink(doc.filePath)
      } catch (error) {
        console.error("Failed to delete file:", error)
      }
    }

    // 删除数据库记录
    await prisma.document.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: "文档已删除",
    })
  } catch (error) {
    console.error("Delete failed:", error)
    return NextResponse.json(
      { success: false, error: "删除失败" },
      { status: 500 }
    )
  }
}
