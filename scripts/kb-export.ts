import { Chroma, type ChromaLibArgs } from "@langchain/community/vectorstores/chroma"
import { OpenAIEmbeddings } from "@langchain/openai"
import { Document } from "@langchain/core/documents"
import * as fs from "fs/promises"
import * as path from "path"
import { CHROMA_URL, CHROMA_COLLECTION } from "../src/config/chroma-config"
const EXPORT_DIR = path.join(process.cwd(), "data", "exports")

interface ExportData {
  exportedAt: string
  collectionName: string
  version: 1
  vectors: Array<{
    id: string
    content: string
    metadata: Record<string, unknown>
  }>
}

async function main() {
  console.log("开始导出 Chroma 向量库...\n")

  const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.EMBEDDING_BASE_URL,
    },
  })

  const args: ChromaLibArgs = {
    url: CHROMA_URL,
    collectionName: CHROMA_COLLECTION,
  }

  const vectorStore = new Chroma(embeddings, args)

  console.log(`连接到 Chroma: ${CHROMA_URL}`)
  console.log(`集合名称: ${CHROMA_COLLECTION}\n`)

  try {
    const collection = await vectorStore.collection
    const totalCount = collection ? await collection.count() : 0
    console.log(`向量总数: ${totalCount}`)

    if (totalCount === 0) {
      console.log("集合为空，无需导出")
      return
    }

    await fs.mkdir(EXPORT_DIR, { recursive: true })

    const allVectors: ExportData["vectors"] = []
    const batchSize = 100
    let processed = 0

    while (processed < totalCount) {
      const results = await vectorStore.similaritySearchVectorWithScore(
        new Array(1536).fill(0),
        batchSize
      )

      const batchVectors = results.map(([doc]) => ({
        id: (doc.metadata?.id as string) || "",
        content: doc.pageContent,
        metadata: doc.metadata as Record<string, unknown>,
      }))

      allVectors.push(...batchVectors)
      processed += batchSize

      console.log(`已读取: ${Math.min(processed, totalCount)} / ${totalCount}`)
    }

    const exportData: ExportData = {
      exportedAt: new Date().toISOString(),
      collectionName: CHROMA_COLLECTION,
      version: 1,
      vectors: allVectors,
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `chroma-export-${timestamp}.json`
    const filepath = path.join(EXPORT_DIR, filename)

    await fs.writeFile(filepath, JSON.stringify(exportData, null, 2), "utf-8")

    console.log(`\n导出成功！`)
    console.log(`文件路径: ${filepath}`)
    console.log(`向量数量: ${allVectors.length}`)
    console.log(`导出时间: ${exportData.exportedAt}`)
  } catch (error) {
    console.error("\n导出失败:", error)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("导出失败:", error)
  process.exit(1)
})
