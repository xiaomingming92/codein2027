import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Prisma, DocStatus, SourceType } from "@prisma/client"
import { writeFile } from "fs/promises"
import { join } from "path"
import { mkdir } from "fs/promises"
import { createHash } from "crypto"
import { deleteKnowledgeVectors } from "@/services/knowledge-indexer"
import { audit, auditPhaseStart, auditPhaseEnd, auditDoc } from "@/lib/audit-logger"

// POST /api/knowledge/upload - 上传知识库文档（两阶段提交：第一阶段只保存，不向量化）
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let fileName = "unknown"

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      auditDoc("UPLOAD_FAIL", "unknown", "unknown", "未提供文件", { duration_ms: Date.now() - startTime })
      return NextResponse.json(
        { success: false, error: "未提供文件" },
        { status: 400 }
      )
    }

    fileName = file.name
    auditPhaseStart("UPLOAD_START", `上传: ${fileName}, 大小: ${(file.size / 1024).toFixed(2)}KB`)

    // 创建上传目录
    const uploadDir = join(process.cwd(), "uploads", "knowledge")
    await mkdir(uploadDir, { recursive: true })

    // 读取文件内容
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // 计算内容哈希
    const contentHash = createHash("sha256").update(buffer).digest("hex")

    // 内容去重：检查是否有相同内容哈希的文档（包括 PENDING_INDEX 状态的）
    auditPhaseStart("UPLOAD_DEDUP", `内容去重检查: ${fileName}`)
    const existingByHash = await prisma.document.findFirst({
      where: {
        contentHash,
        sourceType: SourceType.KNOWLEDGE_UPDATE,
        status: { in: [DocStatus.PENDING_INDEX, DocStatus.INDEXED, DocStatus.INDEXING] },
      },
    })

    if (existingByHash) {
      auditPhaseEnd("UPLOAD_DEDUP", `重复内容阻止: ${fileName}, 已存在 ID=${existingByHash.id}`)
      auditPhaseEnd("UPLOAD_START", `上传被拒(重复): ${fileName}, 耗时${Date.now() - startTime}ms`)
      return NextResponse.json(
        {
          success: false,
          error: "相同内容的文件已存在",
          existing: {
            id: existingByHash.id,
            name: existingByHash.name,
            uploadedAt: existingByHash.createdAt,
          },
        },
        { status: 409 }
      )
    }
    auditPhaseEnd("UPLOAD_DEDUP", `去重通过: ${fileName}`)

    // 版本递增：检查同名文件
    auditPhaseStart("UPLOAD_VERSION", `版本检查: ${fileName}`)
    const existingByName = await prisma.document.findFirst({
      where: {
        name: file.name,
        sourceType: SourceType.KNOWLEDGE_UPDATE,
      },
      orderBy: { version: "desc" },
    })

    const newVersion = existingByName ? existingByName.version + 1 : 1

    // 如果存在同名旧版本，标记为 OUTDATED 并删除旧向量
    if (existingByName && existingByName.version < newVersion) {
      if (existingByName.vectorIds && existingByName.vectorIds.length > 0) {
        await deleteKnowledgeVectors(existingByName.vectorIds)
      }

      await prisma.document.update({
        where: { id: existingByName.id },
        data: { status: DocStatus.OUTDATED },
      })
    }
    auditPhaseEnd("UPLOAD_VERSION", `版本: v${newVersion}${existingByName ? ` (旧v${existingByName.version}→OUTDATED)` : " (新文件)"}`)

    // 生成唯一文件名
    const timestamp = Date.now()
    const filename = `${timestamp}-v${newVersion}-${file.name}`
    const filepath = join(uploadDir, filename)

    // 保存文件
    auditPhaseStart("UPLOAD_FILE_SAVE", `写入文件: ${filepath}`)
    await writeFile(filepath, buffer)
    auditPhaseEnd("UPLOAD_FILE_SAVE", `文件已保存: ${(buffer.length / 1024).toFixed(2)}KB → ${filepath}`)

    // 保存到 Document 表
    // status = PENDING_INDEX 表示待索引，用户点击"同步知识库"后才真正向量化
    const defaultTags = ["用户上传"]

    auditPhaseStart("UPLOAD_DB_CREATE", `创建数据库记录: ${fileName}`)
    const doc = await prisma.document.create({
      data: {
        sourceType: SourceType.KNOWLEDGE_UPDATE,
        name: file.name,
        type: file.type || "application/octet-stream",
        filePath: filepath,
        contentHash,
        status: DocStatus.PENDING_INDEX,
        version: newVersion,
        tags: defaultTags,
        metadata: {
          originalSize: file.size,
          uploadedFilename: filename,
          previousVersion: existingByName?.version,
          lockedTags: defaultTags,
        } as Prisma.InputJsonValue,
        createdBy: "system",
      },
    })
    auditPhaseEnd("UPLOAD_DB_CREATE", `记录已创建: ID=${doc.id}`)

    audit("DOC_TAG_SYNC", `上传文档标签: ["用户上传"]`, { docId: doc.id, name: doc.name })

    const totalTime = Date.now() - startTime
    auditPhaseEnd("UPLOAD_START", `上传完成: ${fileName}, 总耗时${totalTime}ms`)

    return NextResponse.json({
      success: true,
      data: {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        size: file.size,
        version: doc.version,
        tags: defaultTags,
        status: "pending_index",
        pendingSync: true,
        message: "文件已上传，请点击'同步知识库'按钮进行向量化",
        previousVersion: existingByName ? existingByName.version : undefined,
      },
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const totalTime = Date.now() - startTime

    auditDoc("UPLOAD_FAIL", fileName, "unknown", `上传失败: ${errorMsg}`, {
      duration_ms: totalTime,
      error: errorMsg,
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 3).join(" | ") : undefined,
    })

    console.error(`[UPLOAD-AUDIT] 上传失败: ${fileName}, 耗时${totalTime}ms, error: ${errorMsg}`)

    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === "development" ? `上传失败: ${errorMsg}` : "上传失败",
      },
      { status: 500 }
    )
  }
}
