import * as fs from "fs/promises"
import * as path from "path"
import { createHash } from "crypto"
import { prisma } from "@/lib/prisma"
import { Prisma, DocStatus, SourceType } from "@prisma/client"
import { parseDocument } from "./document-parser"
import { indexKnowledgeDocument, deleteKnowledgeVectors } from "./knowledge-indexer"
import { audit, auditDoc, auditPhaseStart, auditPhaseEnd } from "@/lib/audit-logger"

export interface FileInfo {
  relativePath: string
  absolutePath: string
  contentHash: string
  mtime: Date
  size: number
  projectId: string
}

export interface ChangeDetectionResult {
  added: FileInfo[]
  modified: FileInfo[]
  deleted: FileInfo[]
  unchanged: FileInfo[]
}

export interface SyncResult {
  success: boolean
  projectDocAdded: number
  projectDocUpdated: number
  projectDocDeleted: number
  projectDocUnchanged: number
  knowledgeUpdateIndexed: number
  knowledgeUpdateErrors: number
  errors: string[]
}

const _KNOWLEDGE_DIRS_GLOB = "docs/*/knowledge"
const SUPPORTED_EXTENSIONS = [
  ".md", ".txt", ".pdf", ".docx", ".csv", ".xlsx", ".xls", ".wps",
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp",
]

function extractTagsFromPath(relativePath: string): string[] {
  const sep = path.sep
  const segments = relativePath.split(sep)
  const docsIdx = segments.findIndex((s) => s === "docs")
  if (docsIdx === -1 || docsIdx + 1 >= segments.length) return []
  const projectName = segments[docsIdx + 1]
  const categoryDir = segments.length > docsIdx + 3 ? segments[docsIdx + 3] : ""
  return [...new Set([projectName, categoryDir].filter(Boolean))]
}

async function getFileInfo(filePath: string, projectId: string): Promise<FileInfo | null> {
  try {
    const stat = await fs.stat(filePath)
    if (!stat.isFile()) return null

    const buffer = await fs.readFile(filePath)
    const contentHash = createHash("sha256").update(buffer).digest("hex")

    return {
      relativePath: path.relative(process.cwd(), filePath),
      absolutePath: filePath,
      contentHash,
      mtime: stat.mtime,
      size: stat.size,
      projectId,
    }
  } catch {
    return null
  }
}

async function scanKnowledgeDirectories(): Promise<FileInfo[]> {
  const docsDir = path.join(process.cwd(), "docs")
  const files: FileInfo[] = []

  try {
    const entries = await fs.readdir(docsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const projectId = entry.name
      const knowledgeDir = path.join(docsDir, entry.name, "knowledge")

      try {
        await fs.access(knowledgeDir)
      } catch {
        continue
      }

      await scanDirectoryRecursive(knowledgeDir, files, projectId)
    }
  } catch (error) {
    console.error("Failed to scan knowledge directories:", error)
  }

  return files
}

async function scanDirectoryRecursive(dir: string, files: FileInfo[], projectId: string): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        await scanDirectoryRecursive(fullPath, files, projectId)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          const fileInfo = await getFileInfo(fullPath, projectId)
          if (fileInfo) {
            files.push(fileInfo)
          }
        }
      }
    }
  } catch (error) {
    console.error(`Failed to scan directory ${dir}:`, error)
  }
}

async function detectChanges(currentFiles: FileInfo[]): Promise<ChangeDetectionResult> {
  const result: ChangeDetectionResult = {
    added: [],
    modified: [],
    deleted: [],
    unchanged: [],
  }

  const existingDocs = await prisma.document.findMany({
    where: {
      sourceType: SourceType.PROJECT_DOC,
    },
  })

  const syncedDocs = existingDocs.filter((doc) => {
    const meta = doc.metadata as Record<string, unknown> | null
    return meta?.path && typeof meta.path === "string"
  })

  const existingMap = new Map<string, typeof existingDocs[0]>()

  for (const doc of existingDocs) {
    const meta = doc.metadata as Record<string, unknown> | null
    if (meta?.path && typeof meta.path === "string") {
      existingMap.set(meta.path as string, doc)
    }
  }

  const currentFileMap = new Map<string, FileInfo>()
  for (const file of currentFiles) {
    currentFileMap.set(file.relativePath, file)
  }

  for (const file of currentFiles) {
    const existing = existingMap.get(file.relativePath)

    if (!existing) {
      result.added.push(file)
    } else {
      const existingHash = existing.contentHash
      if (existingHash && existingHash !== file.contentHash) {
        result.modified.push(file)
      } else {
        result.unchanged.push(file)
      }
      existingMap.delete(file.relativePath)
    }
  }

  for (const [, doc] of existingMap) {
    const meta = doc.metadata as Record<string, unknown> | null
    if (meta?.path) {
      result.deleted.push({
        relativePath: meta.path as string,
        absolutePath: path.join(process.cwd(), meta.path as string),
        contentHash: doc.contentHash || "",
        mtime: doc.updatedAt,
        size: 0,
        projectId: doc.projectId || "",
      })
    }
  }

  return result
}

export async function syncKnowledgeBase(
  onProgress?: (message: string, progress: number) => void
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    projectDocAdded: 0,
    projectDocUpdated: 0,
    projectDocDeleted: 0,
    projectDocUnchanged: 0,
    knowledgeUpdateIndexed: 0,
    knowledgeUpdateErrors: 0,
    errors: [],
  }

  try {
    auditPhaseStart("SYNC_START", "同步知识库")
    await onProgress?.("扫描知识库目录...", 10)

    const currentFiles = await scanKnowledgeDirectories()
    audit("SCAN", `发现 ${currentFiles.length} 个文件`)
    await onProgress?.(`发现 ${currentFiles.length} 个文件`, 15)

    const changes = await detectChanges(currentFiles)
    audit("DETECT_CHANGES", `新增:${changes.added.length} 修改:${changes.modified.length} 删除:${changes.deleted.length} 未变:${changes.unchanged.length}`)
    await onProgress?.(
      `变更检测: 新增 ${changes.added.length}, 修改 ${changes.modified.length}, 删除 ${changes.deleted.length}`,
      20
    )

    const allKnowledgeDocs = await prisma.document.findMany({
      where: { sourceType: SourceType.PROJECT_DOC },
    })
    const knowledgeDocByPath = new Map<string, typeof allKnowledgeDocs[0]>()
    for (const doc of allKnowledgeDocs) {
      const meta = doc.metadata as Record<string, unknown> | null
      if (meta?.path && typeof meta.path === "string") {
        knowledgeDocByPath.set(meta.path as string, doc)
      }
    }

    const totalChanges =
      changes.added.length + changes.modified.length + changes.deleted.length
    let processed = 0

    if (changes.deleted.length > 0) {
      auditPhaseStart("PHASE_DELETED", "处理删除", changes.deleted.length)
    }
    for (const file of changes.deleted) {
      try {
        const doc = knowledgeDocByPath.get(file.relativePath)

        if (doc) {
          if (doc.vectorIds && doc.vectorIds.length > 0) {
            await deleteKnowledgeVectors(doc.vectorIds)
          }
          await prisma.document.delete({ where: { id: doc.id } })
          auditDoc("PHASE_DELETED", file.relativePath, doc.id, "已删除")
          result.projectDocDeleted++
        }
      } catch (error) {
        const msg = `删除失败: ${file.relativePath}`
        result.errors.push(msg)
        auditDoc("PHASE_DELETED", file.relativePath, "N/A", `删除失败: ${error instanceof Error ? error.message : String(error)}`, { error: true })
        console.error(msg, error)
      }

      processed++
      const progress = 20 + Math.floor((processed / totalChanges) * 30)
      await onProgress?.(`正在处理: 删除 ${file.relativePath}`, progress)
    }
    if (changes.deleted.length > 0) {
      auditPhaseEnd("PHASE_DELETED", `删除完成: ${result.projectDocDeleted} 个`)
    }

    if (changes.modified.length > 0) {
      auditPhaseStart("PHASE_MODIFIED", "处理修改的文件", changes.modified.length)
    }
    for (const file of changes.modified) {
      try {
        const doc = knowledgeDocByPath.get(file.relativePath)

        if (doc) {
          if (doc.vectorIds && doc.vectorIds.length > 0) {
            await deleteKnowledgeVectors(doc.vectorIds)
          }

          const parsed = await parseDocument(file.absolutePath)

          const lockedTags = extractTagsFromPath(file.relativePath)

          const updatedDoc = await prisma.document.update({
            where: { id: doc.id },
            data: {
              type: parsed.metadata.type as string,
              content: parsed.content,
              filePath: file.absolutePath,
              contentHash: file.contentHash,
              status: DocStatus.INDEXING,
              version: doc.version + 1,
              tags: lockedTags,
              metadata: {
                path: file.relativePath,
                projectId: file.projectId,
                size: file.size,
                mtime: file.mtime.toISOString(),
                modified: true,
                previousVersion: doc.version,
                lockedTags,
              } as Prisma.InputJsonValue,
            },
          })

          auditDoc("PHASE_MODIFIED", file.relativePath, updatedDoc.id, "开始更新并重新向量化")
          auditDoc("DOC_TAG_SYNC", file.relativePath, updatedDoc.id, `标签: ${lockedTags.join(", ")}`, { lockedTags })

          const buffer = await fs.readFile(file.absolutePath)
          const indexResult = await indexKnowledgeDocument(updatedDoc.id, buffer, updatedDoc.name, async (progress) => {
            console.log(`[Vectorization] 文件: ${file.relativePath}, 状态: ${progress.status}, 进度: ${progress.progress}%, 消息: ${progress.message}`)
            await onProgress?.(`更新 ${file.relativePath}: ${progress.message}`, Math.round((20 + Math.floor((processed / totalChanges) * 30) + (progress.progress || 0) * 0.3) * 100) / 100)
          })

          if (!indexResult.success) {
            throw new Error(`向量化失败: ${indexResult.error}`)
          }

          auditDoc("PHASE_MODIFIED", file.relativePath, updatedDoc.id, `更新完成, 向量数: ${indexResult.vectorIds?.length || 0}`)
          result.projectDocUpdated++
        }
      } catch (error) {
        const msg = `更新失败: ${file.relativePath}`
        result.errors.push(msg)
        auditDoc("PHASE_MODIFIED", file.relativePath, "N/A", `更新失败: ${error instanceof Error ? error.message : String(error)}`, { error: true })
        console.error(msg, error)
      }

      processed++
      const progress = 20 + Math.floor((processed / totalChanges) * 30)
      await onProgress?.(`正在处理: 更新 ${file.relativePath}`, progress)
    }
    if (changes.modified.length > 0) {
      auditPhaseEnd("PHASE_MODIFIED", `修改完成: ${result.projectDocUpdated} 个`)
    }

    if (changes.added.length > 0) {
      auditPhaseStart("PHASE_ADDED", "处理新增的文件", changes.added.length)
    }
    for (const file of changes.added) {
      try {
        const parsed = await parseDocument(file.absolutePath)

        const lockedTags = extractTagsFromPath(file.relativePath)

        const doc = await prisma.document.create({
          data: {
            sourceType: SourceType.PROJECT_DOC,
            projectId: file.projectId || null,
            name: path.basename(file.relativePath),
            type: parsed.metadata.type as string,
            content: parsed.content,
            filePath: file.absolutePath,
            contentHash: file.contentHash,
            status: DocStatus.INDEXING,
            version: 1,
            tags: lockedTags,
            metadata: {
              path: file.relativePath,
              projectId: file.projectId,
              size: file.size,
              mtime: file.mtime.toISOString(),
              isSynced: true,
              lockedTags,
            } as Prisma.InputJsonValue,
            createdBy: "system",
          },
        })

        auditDoc("PHASE_ADDED", file.relativePath, doc.id, "开始向量化")
        auditDoc("DOC_TAG_SYNC", file.relativePath, doc.id, `标签: ${lockedTags.join(", ")}`, { lockedTags })

        const buffer = await fs.readFile(file.absolutePath)
        const indexResult = await indexKnowledgeDocument(doc.id, buffer, doc.name, async (progress) => {
          console.log(`[Vectorization] 文件: ${file.relativePath}, 状态: ${progress.status}, 进度: ${progress.progress}%, 消息: ${progress.message}`)
          await onProgress?.(`新增 ${file.relativePath}: ${progress.message}`, Math.round((20 + Math.floor((processed / totalChanges) * 30) + (progress.progress || 0) * 0.3) * 100) / 100)
        })

        if (!indexResult.success) {
          throw new Error(`向量化失败: ${indexResult.error}`)
        }

        auditDoc("PHASE_ADDED", file.relativePath, doc.id, `向量化完成, 向量数: ${indexResult.vectorIds?.length || 0}`)
        result.projectDocAdded++
      } catch (error) {
        const msg = `新增失败: ${file.relativePath}`
        result.errors.push(msg)
        auditDoc("PHASE_ADDED", file.relativePath, "N/A", `新增失败: ${error instanceof Error ? error.message : String(error)}`, { error: true })
        console.error(msg, error)
      }

      processed++
      const progress = 20 + Math.floor((processed / totalChanges) * 30)
      await onProgress?.(`正在处理: 新增 ${file.relativePath}`, progress)
    }
    if (changes.added.length > 0) {
      auditPhaseEnd("PHASE_ADDED", `新增完成: ${result.projectDocAdded} 个`)
    }

    result.projectDocUnchanged = changes.unchanged.length

    await onProgress?.(
      `文件系统同步完成: 新增 ${result.projectDocAdded}, 更新 ${result.projectDocUpdated}, 删除 ${result.projectDocDeleted}`,
      50
    )

    await onProgress?.("开始处理待索引的上传文档...", 55)

    const pendingKnowledgeUpdates = await prisma.document.findMany({
      where: {
        sourceType: SourceType.KNOWLEDGE_UPDATE,
        status: { in: [DocStatus.PENDING_INDEX, DocStatus.PENDING] },
      },
    })

    await onProgress?.(
      `发现 ${pendingKnowledgeUpdates.length} 个待索引的上传文档`,
      60
    )

    if (pendingKnowledgeUpdates.length > 0) {
      auditPhaseStart("PHASE_KNOWLEDGE_UPDATE", "处理上传文档", pendingKnowledgeUpdates.length)
    }

    for (let i = 0; i < pendingKnowledgeUpdates.length; i++) {
      const doc = pendingKnowledgeUpdates[i]
      try {
        await prisma.document.update({
          where: { id: doc.id },
          data: { status: DocStatus.INDEXING },
        })

        auditDoc("PHASE_KNOWLEDGE_UPDATE", doc.name, doc.id, "开始向量化")

        if (doc.filePath) {
          const buffer = await fs.readFile(doc.filePath)
          const indexResult = await indexKnowledgeDocument(doc.id, buffer, doc.name, async (progress) => {
            console.log(`[Vectorization] 上传文档: ${doc.name}, 状态: ${progress.status}, 进度: ${progress.progress}%, 消息: ${progress.message}`)
            await onProgress?.(`上传文档 ${doc.name}: ${progress.message}`, Math.round((60 + Math.floor(((i + 1) / pendingKnowledgeUpdates.length) * 40) + ((progress.progress || 0) - 50) * 0.4) * 100) / 100)
          })

          await prisma.document.update({
            where: { id: doc.id },
            data: { status: DocStatus.INDEXED },
          })

          auditDoc("PHASE_KNOWLEDGE_UPDATE", doc.name, doc.id, `向量化完成, 向量数: ${indexResult.vectorIds?.length || 0}`)
          result.knowledgeUpdateIndexed++
        }
      } catch (error) {
        const msg = `上传文档索引失败: ${doc.name}`
        result.errors.push(msg)
        auditDoc("PHASE_KNOWLEDGE_UPDATE", doc.name, doc.id, `失败: ${error instanceof Error ? error.message : String(error)}`, { error: true })
        console.error(msg, error)

        await prisma.document.update({
          where: { id: doc.id },
          data: { status: DocStatus.ERROR },
        }).catch(() => {})

        result.knowledgeUpdateErrors++
      }

      const progress = 60 + Math.floor(((i + 1) / pendingKnowledgeUpdates.length) * 40)
      await onProgress?.(`正在处理上传文档: ${doc.name}`, progress)
    }

    if (pendingKnowledgeUpdates.length > 0) {
      auditPhaseEnd("PHASE_KNOWLEDGE_UPDATE", `上传文档完成: ${result.knowledgeUpdateIndexed} 个`)
    }

    const totalIndexed = result.projectDocAdded + result.projectDocUpdated + result.knowledgeUpdateIndexed
    const totalErrors = result.errors.length

    await onProgress?.("检查未完成索引的静态文档...", 95)

    const failedProjectDocs = await prisma.document.findMany({
      where: {
        sourceType: SourceType.PROJECT_DOC,
        status: { in: [DocStatus.PENDING, DocStatus.INDEXING] },
        OR: [
          { vectorIds: { equals: null } },
          { vectorIds: { isEmpty: true } },
        ],
      },
    })

    if (failedProjectDocs.length > 0) {
      auditPhaseStart("PHASE_RETRY", "重试未完成索引的静态文档", failedProjectDocs.length)

      for (let i = 0; i < failedProjectDocs.length; i++) {
        const doc = failedProjectDocs[i]
        try {
          if (!doc.filePath) {
            throw new Error("文件路径缺失")
          }

          await prisma.document.update({
            where: { id: doc.id },
            data: { status: DocStatus.INDEXING },
          })

          const buffer = await fs.readFile(doc.filePath)
          const indexResult = await indexKnowledgeDocument(doc.id, buffer, doc.name, async (progress) => {
            console.log(`[Vectorization] 重试文档: ${doc.name}, 状态: ${progress.status}, 进度: ${progress.progress}%, 消息: ${progress.message}`)
            await onProgress?.(`重试 ${doc.name}: ${progress.message}`, Math.round((96 + Math.floor(((i + 1) / failedProjectDocs.length) * 4) + ((progress.progress || 0) - 50) * 0.04) * 100) / 100)
          })

          if (!indexResult.success) {
            throw new Error(`向量化失败: ${indexResult.error}`)
          }

          result.projectDocAdded++
        } catch (error) {
          const msg = `重试索引失败: ${doc.name}`
          result.errors.push(msg)
          console.error(msg, error)

          await prisma.document.update({
            where: { id: doc.id },
            data: { status: DocStatus.ERROR },
          }).catch(() => {})
        }
      }

      auditPhaseEnd("PHASE_RETRY", `完成重试 ${failedProjectDocs.length} 个文档`)
    }

    const untaggedDocs = await prisma.document.findMany({
      where: {
        sourceType: SourceType.PROJECT_DOC,
        OR: [
          { tags: { equals: [] } },
          { tags: { isEmpty: true } },
          { tags: { equals: null } },
        ],
      },
    })

    if (untaggedDocs.length > 0) {
      auditPhaseStart("PHASE_TAG_BACKFILL", `回填标签`, untaggedDocs.length)

      const scannedFiles = await scanKnowledgeDirectories()

      for (const doc of untaggedDocs) {
        const meta = doc.metadata as Record<string, unknown> | null
        let docPath = meta?.path as string

        if (!docPath) {
          const matchedFile = scannedFiles.find(
            (f) => path.basename(f.relativePath) === doc.name
          )
          if (matchedFile) {
            docPath = matchedFile.relativePath
          }
        }

        if (docPath) {
          const lockedTags = extractTagsFromPath(docPath)
          if (lockedTags.length > 0) {
            await prisma.document.update({
              where: { id: doc.id },
              data: {
                tags: lockedTags,
                metadata: { ...meta, path: docPath, lockedTags } as Prisma.InputJsonValue,
              },
            })
            auditDoc("DOC_TAG_SYNC", docPath, doc.id, `回填标签: ${lockedTags.join(", ")}`, { lockedTags })
          }
        }
      }
      auditPhaseEnd("PHASE_TAG_BACKFILL", `回填完成: ${untaggedDocs.length} 个文档`)
    }

    auditPhaseEnd("SYNC_START", `同步完成: 新增 ${result.projectDocAdded}, 更新 ${result.projectDocUpdated}, 删除 ${result.projectDocDeleted} | 上传文档 ${result.knowledgeUpdateIndexed} | 错误 ${totalErrors}`)

    await onProgress?.(
      `同步完成: 文件系统新增 ${result.projectDocAdded}, 更新 ${result.projectDocUpdated}, 删除 ${result.projectDocDeleted} | 上传文档已索引 ${result.knowledgeUpdateIndexed} | 错误 ${totalErrors}`,
      100
    )

    if (result.errors.length > 0) {
      result.success = false
    }
  } catch (error) {
    result.success = false
    const msg = error instanceof Error ? error.message : "同步失败"
    result.errors.push(msg)
    audit("SYNC_DONE", `同步异常终止: ${msg}`, { error: true })
  }

  return result
}

export async function getSyncStats(): Promise<{
  total: number
  indexed: number
  pending: number
  indexing: number
  errors: number
  bySource: {
    projectDoc: number
    knowledgeUpdate: number
  }
}> {
  const allDocs = await prisma.document.findMany({
    where: {
      sourceType: { in: [SourceType.PROJECT_DOC, SourceType.KNOWLEDGE_UPDATE] }
    },
  })

  const stats = {
    total: allDocs.length,
    
    // 已完成向量化的文档
    indexed: allDocs.filter((d) => d.status === DocStatus.INDEXED).length,
    
    // 等待处理的文档 (包括 PENDING 和 PENDING_INDEX)
    pending: allDocs.filter((d) =>
      d.status === DocStatus.PENDING || d.status === DocStatus.PENDING_INDEX
    ).length,
    
    // 正在处理中的文档
    indexing: allDocs.filter((d) => d.status === DocStatus.INDEXING).length,
    
    // 处理出错的文档
    errors: allDocs.filter((d) => d.status === DocStatus.ERROR).length,

    // 按来源类型分组统计
    bySource: {
      projectDoc: allDocs.filter((d) => d.sourceType === SourceType.PROJECT_DOC).length,
      knowledgeUpdate: allDocs.filter((d) => d.sourceType === SourceType.KNOWLEDGE_UPDATE).length,
    },
  }

  console.log("[getSyncStats] 统计结果:", JSON.stringify(stats, null, 2))

  return stats
}
