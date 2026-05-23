import { tool } from "@langchain/core/tools"
import { z } from "zod"
import { indexDocument, reindexAll } from "@/services/document-indexer"
import { DocumentUploadSchema } from "../schemas/document-tools"

export const indexDocumentsTool = tool(
  async ({ projectId, taskId, fileName, fileType, content, tags }) => {
    try {
      const buffer = Buffer.from(content, "base64")

      const result = await indexDocument(buffer, fileName, {
        projectId,
        taskId,
        fileName,
        fileType,
        uploadedAt: new Date().toISOString(),
      })

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        }
      }

      return {
        success: true,
        documentId: result.documentId,
        message: `文档 ${fileName} 已成功索引`,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "索引失败",
      }
    }
  },
  {
    name: "index_documents",
    description: "将上传的文档内容索引到向量知识库。接收文件内容（Base64编码），解析后存储到Chroma向量数据库。索引后文档可通过search_online_documents检索。",
    schema: DocumentUploadSchema,
  }
)

const ReindexSchema = z.object({})

export const reindexAllDocumentsTool = tool(
  async () => {
    const result = await reindexAll()

    return {
      success: result.success,
      count: result.count,
      message: result.success
        ? `成功重新索引 ${result.count} 个文档`
        : `重新索引失败: ${result.error}`,
    }
  },
  {
    name: "reindex_all_documents",
    description: "重新索引知识库中的所有文档。删除现有向量并从数据库重新导入，适用于索引损坏或新增文档未正确索引的情况。",
    schema: ReindexSchema,
  }
)
