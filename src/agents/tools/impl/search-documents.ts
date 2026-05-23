import { tool } from "@langchain/core/tools"
import { similaritySearch } from "@/services/document-indexer"
import { DocumentSearchSchema } from "../schemas/document-tools"

export const searchOnlineDocumentsTool = tool(
  async ({ query, topK = 5, projectId, taskId }) => {
    const results = await similaritySearch(query, topK, { projectId, taskId })

    if (results.length === 0) {
      return {
        query,
        count: 0,
        results: [],
        message: "未找到相关文档",
      }
    }

    return {
      query,
      count: results.length,
      results: results.map((r, i) => ({
        rank: i + 1,
        content: r.content.slice(0, 500) + (r.content.length > 500 ? "..." : ""),
        metadata: r.metadata,
        relevanceScore: Math.round((1 - r.score) * 100) / 100,
      })),
    }
  },
  {
    name: "search_online_documents",
    description: "在线检索已索引的文档知识库。根据查询内容在文档库中搜索相关内容，返回最相关的文档片段和相关性分数。适用于回答需要参考项目文档的问题。",
    schema: DocumentSearchSchema,
  }
)
