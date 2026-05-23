import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { parseDocumentFromBuffer } from "./document-parser"
import { DOC_STATUS, SOURCE_TYPE } from "@/constants/doc-status"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { auditDoc, auditToken, auditSummary } from "@/lib/audit-logger"
import { agentAudit } from "@/lib/agent-audit-logger"
import { getEmbeddings, getEmbeddingConfig } from "@/lib/embeddings"

const CHROMA_HOST = process.env.CHROMA_HOST || "localhost"
const CHROMA_PORT = process.env.CHROMA_PORT || "8000"
const CHROMA_URL = `http://${CHROMA_HOST}:${CHROMA_PORT}`
const COLLECTION_NAME = process.env.CHROMA_COLLECTION || "team_coordinator"
const CHROMA_AUTH_TOKEN = process.env.CHROMA_AUTH_TOKEN || ""

class DirectChromaClient {
  private baseUrl: string
  private headers: Record<string, string>

  constructor(baseUrl: string, authToken?: string) {
    this.baseUrl = baseUrl
    this.headers = {
      "Content-Type": "application/json",
    }
    if (authToken) {
      this.headers["Authorization"] = `Bearer ${authToken}`
    }
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...this.headers,
        ...options?.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Chroma API error: ${response.status} - ${error}`)
    }

    return response.json()
  }

  async listCollections() {
    return this.request<Array<{ name: string; id: string }>>("/api/v1/collections")
  }

  async getOrCreateCollection(name: string) {
    const collection = await this.request<{ name: string; id: string }>("/api/v1/collections", {
      method: "POST",
      body: JSON.stringify({ name, get_or_create: true }),
    })
    return collection
  }

  async add(collectionId: string, data: { ids: string[]; embeddings: number[][]; metadatas?: Record<string, unknown>[]; documents: string[] }) {
    return this.request(`/api/v1/collections/${collectionId}/add`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async query(collectionId: string, data: { query_embeddings: number[][]; n_results: number; where?: Record<string, unknown>; include?: string[] }) {
    return this.request<{
      ids: string[][]
      documents: string[][]
      metadatas: Record<string, unknown>[][]
      distances: number[][]
    }>(`/api/v1/collections/${collectionId}/query`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async delete(collectionId: string, data: { ids?: string[]; where?: Record<string, unknown> }) {
    return this.request(`/api/v1/collections/${collectionId}/delete`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async count(collectionId: string): Promise<number> {
    const response = await fetch(`${this.baseUrl}/api/v1/collections/${collectionId}/count`, {
      headers: this.headers,
    })
    return parseInt(await response.text())
  }
}

let chromaClient: DirectChromaClient | null = null
let collectionId: string | null = null

async function getChromaCollection(): Promise<{ client: DirectChromaClient; collectionId: string }> {
  if (!chromaClient || !collectionId) {
    chromaClient = new DirectChromaClient(CHROMA_URL, CHROMA_AUTH_TOKEN)
    const collection = await chromaClient.getOrCreateCollection(COLLECTION_NAME)
    collectionId = collection.id
    console.log(`[DirectChroma] 集合已连接: ${COLLECTION_NAME} (${collectionId})`)
  }
  return { client: chromaClient, collectionId }
}

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 100,
  separators: ["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""],
})

export interface IndexProgress {
  status: typeof DOC_STATUS[keyof typeof DOC_STATUS] | "PARSING"
  message: string
  progress?: number
}

type ProgressCallback = (progress: IndexProgress) => void | Promise<void>

export async function indexKnowledgeDocument(
    documentId: string,
    buffer: Buffer,
    fileName: string,
    onProgress?: ProgressCallback
): Promise<{ success: boolean; vectorIds?: string[]; error?: string }> {
  const startTime = Date.now()
  let totalTokens = 0

  try {
    auditDoc("VECTORIZE_START", fileName, documentId, "开始向量化")
    console.log(`[KnowledgeIndexer] 开始向量化文档: ${fileName} (ID: ${documentId})`)
    await onProgress?.({ status: "PARSING", message: "正在解析文档内容...", progress: 10 })

    const parsed = await parseDocumentFromBuffer(buffer, fileName)
    console.log(`[KnowledgeIndexer] 文档解析完成, 类型: ${parsed.metadata.type}, 内容长度: ${parsed.content?.length || 0}`)

    if (!parsed.content || parsed.content.trim().length === 0) {
      throw new Error("文档内容为空，无法向量化")
    }

    await onProgress?.({ status: "PARSING", message: "文档解析完成，正在分块...", progress: 30 })

    const chunks = parsed.content.length > 1000
        ? await textSplitter.splitText(parsed.content)
        : [parsed.content]

    console.log(`[KnowledgeIndexer] 文档分块完成, 共 ${chunks.length} 块`)

    await onProgress?.({ status: DOC_STATUS.INDEXING, message: `正在向量化 (${chunks.length} 块)...`, progress: 50 })

    const { client, collectionId: collId } = await getChromaCollection()
    const vectorIds: string[] = []
    const embeddings = getEmbeddings()

    for (let i = 0; i < chunks.length; i++) {
      const chunkStartTime = Date.now()
      const chunkId = `${documentId}-chunk-${i}`

      console.log(`[KnowledgeIndexer] 正在处理块 ${i + 1}/${chunks.length}, 长度: ${chunks[i].length} 字符`)

      const chunkEmbeddings = await embeddings.embedDocuments([chunks[i]])

      await client.add(collId, {
        ids: [chunkId],
        embeddings: chunkEmbeddings,
        metadatas: [{
          documentId,
          sourceType: SOURCE_TYPE.KNOWLEDGE_UPDATE,
          fileName,
          chunkIndex: i,
          totalChunks: chunks.length,
          parsedType: parsed.metadata.type,
        }],
        documents: [chunks[i]],
      })

      vectorIds.push(chunkId)

      const chunkDuration = Date.now() - chunkStartTime
      const estimatedTokens = Math.ceil(chunks[i].length / 4)
      totalTokens += estimatedTokens

      auditToken(fileName, i, estimatedTokens, chunkDuration)
      console.log(`[KnowledgeIndexer] 块 ${i + 1}/${chunks.length} 完成, 耗时: ${chunkDuration}ms, 估算token数: ${estimatedTokens}`)

      const progress = 50 + Math.floor(((i + 1) / chunks.length) * 45)
      await onProgress?.({ status: DOC_STATUS.INDEXING, message: `正在向量化 (${i + 1}/${chunks.length})...`, progress })
    }

    const totalDuration = Date.now() - startTime

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DOC_STATUS.INDEXED,
        vectorIds,
        metadata: {
          ...(await getExistingMetadata(documentId)),
          lastSyncAudit: {
            vectorizedAt: new Date().toISOString(),
            vectorCount: vectorIds.length,
            totalTokens,
            totalDurationMs: totalDuration,
            chunkCount: chunks.length,
          } as Prisma.InputJsonValue,
        },
      },
    })

    auditSummary(fileName, totalTokens, totalDuration, vectorIds.length)
    console.log(`[KnowledgeIndexer] 向量化完成! 总耗时: ${totalDuration}ms, 总token数(估算): ${totalTokens}, 向量数量: ${vectorIds.length}`)

    await onProgress?.({ status: DOC_STATUS.INDEXED, message: "向量化完成", progress: 100 })

    return { success: true, vectorIds }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "向量化失败"
    const totalDuration = Date.now() - startTime
    console.error(`[KnowledgeIndexer] 向量化失败! 耗时: ${totalDuration}ms, 已处理token(估算): ${totalTokens}, error: ${errorMessage}`)
    auditDoc("VECTORIZE_FAIL", fileName, documentId, `失败: ${errorMessage}`, { duration_ms: totalDuration, tokens_processed: totalTokens })

    const metadata = await getExistingMetadata(documentId)
    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DOC_STATUS.ERROR,
        metadata: {
          ...metadata,
          lastSyncAudit: {
            vectorizedAt: new Date().toISOString(),
            status: "failed",
            error: errorMessage,
            tokensProcessed: totalTokens,
            totalDurationMs: totalDuration,
          } as Prisma.InputJsonValue,
        },
      },
    }).catch(() => {})

    if (onProgress) {
      try {
        await onProgress({ status: DOC_STATUS.ERROR, message: errorMessage })
      } catch {}
    }

    return { success: false, error: errorMessage }
  }
}

async function getExistingMetadata(documentId: string): Promise<Record<string, unknown>> {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { metadata: true },
    })
    return (doc?.metadata as Record<string, unknown>) || {}
  } catch {
    return {}
  }
}

export async function deleteKnowledgeVectors(vectorIds: string[]): Promise<boolean> {
  try {
    if (vectorIds.length === 0) return true

    const { client, collectionId: collId } = await getChromaCollection()
    await client.delete(collId, { ids: vectorIds })
    return true
  } catch (error) {
    console.error("Failed to delete vectors from Chroma:", error)
    return false
  }
}

export async function searchKnowledgeDocuments(
    query: string,
    k: number = 5,
    sourceType?: string
): Promise<Array<{ content: string; metadata: Record<string, unknown>; distance: number; relevance: number }>> {
  try {
    const { client, collectionId: collId } = await getChromaCollection()

    const collectionCount = await client.count(collId).catch(() => -1)
    console.log(`[RAG-DEBUG] 开始搜索: query="${query.slice(0, 60)}", k=${k}, sourceType=${sourceType || "none"}, 集合文档数=${collectionCount}`)

    const where = sourceType ? { sourceType } : undefined

    const embeddings = getEmbeddings()
    const config = getEmbeddingConfig()
    console.log(`[RAG-DEBUG] 嵌入配置: provider=${config.provider}, model=${"model" in config ? config.model : "unknown"}`)

    const queryEmbedding = await embeddings.embedQuery(query)
    console.log(`[RAG-DEBUG] 查询嵌入完成: 维度=${queryEmbedding.length}, 前5值=[${queryEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(", ")}]`)

    const results = await client.query(collId, {
      query_embeddings: [queryEmbedding],
      n_results: k,
      where,
      include: ["documents", "metadatas", "distances"],
    })

    const rawDocCount = results.documents?.[0]?.length ?? 0
    const rawDistances = results.distances?.[0] ?? []
    console.log(`[RAG-DEBUG] ChromaDB 原始返回: 文档数=${rawDocCount}, distances=${rawDistances.length > 0 ? `[${rawDistances.slice(0, 3).map(d => d.toFixed(4)).join(", ")}...]` : "空"}`)

    agentAudit("RAG_SEARCH", `查询: ${query}`, {
      resultCount: rawDocCount,
      collectionCount,
      queryEmbeddingDim: queryEmbedding.length,
      embeddingProvider: config.provider,
      embeddingModel: "model" in config ? config.model : "unknown",
      distanceRange: rawDistances.length > 0
          ? `${Math.min(...rawDistances).toFixed(4)} ~ ${Math.max(...rawDistances).toFixed(4)}`
          : "N/A",
      relevanceRange: rawDistances.length > 0
          ? `${(1 - Math.max(...rawDistances)).toFixed(4)} ~ ${(1 - Math.min(...rawDistances)).toFixed(4)}`
          : "N/A",
      sourceTypeFilter: sourceType || "none",
      rawDistancesPreview: rawDistances.slice(0, 3),
    })

    if (rawDocCount === 0 && collectionCount > 0) {
      agentAudit("RAG_ZERO_RESULTS", `查询返回0但集合有${collectionCount}条数据`, {
        query: query.slice(0, 80),
        collectionCount,
        queryEmbeddingDim: queryEmbedding.length,
        embeddingProvider: config.provider,
        embeddingModel: "model" in config ? config.model : "unknown",
        sourceTypeFilter: sourceType || "none",
        suggestion: "检查索引和查询是否使用相同嵌入模型，或移除sourceType过滤",
      })
    }

    return results.documents[0].map((content, i) => {
      const distance = results.distances[0][i]
      return {
        content,
        metadata: results.metadatas[0][i] as Record<string, unknown>,
        distance,
        relevance: distance !== undefined ? Math.max(0, 1 - distance) : 0.5,
      }
    })
  } catch (error) {
    console.error("Error searching knowledge documents:", error)
    agentAudit("RAG_SEARCH_FAIL", `查询失败: ${query}`, {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

export function resetChromaClient(): void {
  chromaClient = null
  collectionId = null
}
