import { Document } from "@langchain/core/documents"
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters"
import { prisma } from "@/lib/prisma"
import { parseDocumentFromBuffer } from "./document-parser"
import { getEmbeddings } from "@/lib/embeddings"
import { DOC_STATUS, SOURCE_TYPE } from "@/constants/doc-status"

const CHROMA_HOST = process.env.CHROMA_HOST || "localhost"
const CHROMA_PORT = process.env.CHROMA_PORT || "8000"
const CHROMA_URL = `http://${CHROMA_HOST}:${CHROMA_PORT}`
const COLLECTION_NAME = process.env.CHROMA_COLLECTION || "team_coordinator"
const CHROMA_AUTH_TOKEN = process.env.CHROMA_AUTH_TOKEN || ""

interface ChromaAddRequest {
  ids: string[]
  embeddings: number[][]
  metadatas?: Record<string, unknown>[]
  documents: string[]
}

interface ChromaQueryRequest {
  query_embeddings: number[][]
  n_results: number
  where?: Record<string, unknown>
  include?: string[]
}

interface ChromaDeleteRequest {
  ids?: string[]
  where?: Record<string, unknown>
}

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

  async getCollection(name: string) {
    return this.request<{ name: string; id: string }>(`/api/v1/collections/${name}`)
  }

  async add(collectionId: string, data: ChromaAddRequest) {
    return this.request(`/api/v1/collections/${collectionId}/add`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  }

  async query(collectionId: string, data: ChromaQueryRequest) {
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

  async delete(collectionId: string, data: ChromaDeleteRequest) {
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
    console.log(`[DirectChroma] 开始向量化文档: ${fileName} (ID: ${documentId})`)
    await onProgress?.({ status: "PARSING", message: "正在解析文档内容...", progress: 10 })

    const parsed = await parseDocumentFromBuffer(buffer, fileName)
    console.log(`[DirectChroma] 文档解析完成, 类型: ${parsed.metadata.type}, 内容长度: ${parsed.content?.length || 0}`)

    if (!parsed.content || parsed.content.trim().length === 0) {
      throw new Error("文档内容为空，无法向量化")
    }

    await onProgress?.({ status: "PARSING", message: "文档解析完成，正在分块...", progress: 30 })

    const chunks = parsed.content.length > 1000
      ? await textSplitter.splitText(parsed.content)
      : [parsed.content]

    console.log(`[DirectChroma] 文档分块完成, 共 ${chunks.length} 块`)

    await onProgress?.({ status: DOC_STATUS.INDEXING, message: `正在向量化 (${chunks.length} 块)...`, progress: 50 })

    const { client, collectionId: collId } = await getChromaCollection()
    const vectorIds: string[] = []
    const embeddings = getEmbeddings()

    for (let i = 0; i < chunks.length; i++) {
      const chunkStartTime = Date.now()
      const chunkId = `${documentId}-chunk-${i}`

      console.log(`[DirectChroma] 正在处理块 ${i + 1}/${chunks.length}, 长度: ${chunks[i].length} 字符`)

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

      console.log(`[DirectChroma] 块 ${i + 1}/${chunks.length} 完成, 耗时: ${chunkDuration}ms, 估算token数: ${estimatedTokens}`)

      const progress = 50 + Math.floor(((i + 1) / chunks.length) * 45)
      await onProgress?.({ status: DOC_STATUS.INDEXING, message: `正在向量化 (${i + 1}/${chunks.length})...`, progress })
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: DOC_STATUS.INDEXED,
        vectorIds,
      },
    })

    const totalDuration = Date.now() - startTime
    console.log(`[DirectChroma] 向量化完成! 总耗时: ${totalDuration}ms, 总token数(估算): ${totalTokens}, 向量数量: ${vectorIds.length}`)

    await onProgress?.({ status: DOC_STATUS.INDEXED, message: "向量化完成", progress: 100 })

    return { success: true, vectorIds }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "向量化失败"
    const totalDuration = Date.now() - startTime
    console.error(`[DirectChroma] 向量化失败! 耗时: ${totalDuration}ms, 已处理token(估算): ${totalTokens}, error: ${errorMessage}`)

    await prisma.document.update({
      where: { id: documentId },
      data: { status: DOC_STATUS.ERROR },
    }).catch(() => {})

    await onProgress?.({ status: DOC_STATUS.ERROR, message: errorMessage })

    return { success: false, error: errorMessage }
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
  k: number = 5
): Promise<Array<{ content: string; metadata: Record<string, unknown>; score: number }>> {
  try {
    const { client, collectionId: collId } = await getChromaCollection()

    const embeddings = getEmbeddings()
    const queryEmbedding = await embeddings.embedQuery(query)

    const results = await client.query(collId, {
      query_embeddings: [queryEmbedding],
      n_results: k,
      where: { sourceType: SOURCE_TYPE.KNOWLEDGE_UPDATE },
      include: ["documents", "metadatas", "distances"],
    })

    return results.documents[0].map((content, i) => ({
      content,
      metadata: results.metadatas[0][i] as Record<string, unknown>,
      score: results.distances[0][i],
    }))
  } catch (error) {
    console.error("Error searching knowledge documents:", error)
    return []
  }
}

export function resetChromaClient(): void {
  chromaClient = null
  collectionId = null
}
