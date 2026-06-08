import { Chroma } from "@langchain/community/vectorstores/chroma"
import { OpenAIEmbeddings } from "@langchain/openai"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { parseDocumentFromBuffer } from "./document-parser"
import type { Document } from "@langchain/core/documents"

const CHROMA_HOST = process.env.CHROMA_HOST || "localhost"
const CHROMA_PORT = process.env.CHROMA_PORT || "8000"
const CHROMA_URL = `http://${CHROMA_HOST}:${CHROMA_PORT}`
interface DocumentRecord {
  content: string | null
  name: string
  type: string
  projectId: string | null
  taskId: string | null
  userId: string | null
  createdAt: Date
}

const COLLECTION_NAME = "farm-agent-docs"

interface DocumentMetadata {
  projectId?: string
  taskId?: string
  userId?: string
  fileName: string
  fileType: string
  uploadedAt: string
}

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.LLM_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
  },
})

let chromaInstance: Chroma | null = null

async function getChroma(): Promise<Chroma> {
  if (!chromaInstance) {
    chromaInstance = new Chroma(embeddings, {
      url: CHROMA_URL,
      collectionName: COLLECTION_NAME,
    })
  }
  return chromaInstance
}

export async function indexDocument(
  buffer: Buffer,
  fileName: string,
  metadata: DocumentMetadata
): Promise<{ success: boolean; documentId?: string; error?: string }> {
  try {
    if (!metadata.projectId) {
      return {
        success: false,
        error: "projectId is required",
      }
    }

    const parsed = await parseDocumentFromBuffer(buffer, fileName)

    const metadataJson = {
      ...metadata,
      parsedType: parsed.metadata.type,
      parsedSize: parsed.content.length,
    }

    await prisma.document.create({
      data: {
        name: fileName,
        type: parsed.metadata.type as string,
        content: parsed.content,
        projectId: metadata.projectId,
        taskId: metadata.taskId,
        userId: metadata.userId,
        metadata: metadataJson as Prisma.InputJsonValue,
        createdBy: metadata.userId || "system",
      },
    })

    const doc: Document = {
      pageContent: parsed.content,
      metadata: {
        fileName,
        fileType: parsed.metadata.type as string,
        projectId: metadata.projectId,
        taskId: metadata.taskId,
        userId: metadata.userId,
        uploadedAt: metadata.uploadedAt,
      },
    }

    const chroma = await getChroma()
    await chroma.addDocuments([doc])

    return { success: true, documentId: fileName }
  } catch (error) {
    console.error("Error indexing document:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function similaritySearch(
  query: string,
  topK: number = 5,
  filter?: { projectId?: string; taskId?: string }
): Promise<Array<{ content: string; metadata: Record<string, unknown>; score: number }>> {
  try {
    const chroma = await getChroma()
    const results = await chroma.similaritySearchWithScore(query, topK, filter)

    return results.map(([doc, score]) => ({
      content: doc.pageContent,
      metadata: doc.metadata as Record<string, unknown>,
      score,
    }))
  } catch (error) {
    console.error("Error searching documents:", error)
    return []
  }
}

export async function reindexAll(): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const documents = await prisma.document.findMany()

    if (documents.length === 0) {
      return { success: true, count: 0 }
    }

    const docs: Document[] = documents.map((doc: DocumentRecord) => ({
      pageContent: doc.content || "",
      metadata: {
        fileName: doc.name,
        fileType: doc.type,
        projectId: doc.projectId,
        taskId: doc.taskId,
        userId: doc.userId,
        uploadedAt: doc.createdAt.toISOString(),
      },
    }))

    const chroma = await getChroma()
    await chroma.delete({ filter: {} })
    await chroma.addDocuments(docs)

    return { success: true, count: documents.length }
  } catch (error) {
    console.error("Error reindexing documents:", error)
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function deleteDocument(documentId: string): Promise<boolean> {
  try {
    await prisma.document.delete({ where: { id: documentId } })
    return true
  } catch (error) {
    console.error("Error deleting document:", error)
    return false
  }
}
