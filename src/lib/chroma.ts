import { Chroma, type ChromaLibArgs } from "@langchain/community/vectorstores/chroma"
import { OpenAIEmbeddings } from "@langchain/openai"
import { Document } from "@langchain/core/documents"

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
})

const CHROMA_COLLECTION = process.env.CHROMA_COLLECTION || "team_coordinator"

const globalForChroma = globalThis as unknown as {
  vectorStore: Chroma | undefined
}

function createVectorStore(): Chroma {
  const args: ChromaLibArgs = {
    collectionName: CHROMA_COLLECTION,
  }
  return new Chroma(embeddings, args)
}

export const vectorStore =
  globalForChroma.vectorStore ?? createVectorStore()

if (process.env.NODE_ENV !== "production") {
  globalForChroma.vectorStore = vectorStore
}

export async function addDocumentsToCollection(
  texts: string[],
  ids: string[],
  metadata?: Array<Record<string, unknown>>
) {
  const docs = texts.map((text, i) => {
    return new Document({
      pageContent: text,
      metadata: metadata?.[i] || {},
    })
  })
  await vectorStore.addDocuments(docs, { ids })
}

export async function similaritySearch(
  query: string,
  k: number = 5
): Promise<Array<{ content: string; metadata: Record<string, unknown> }>> {
  const results = await vectorStore.similaritySearch(query, k)
  return results.map((doc) => ({
    content: doc.pageContent,
    metadata: doc.metadata as Record<string, unknown>,
  }))
}
