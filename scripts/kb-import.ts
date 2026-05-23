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
  console.log("开始导入向量库...\n")

  const args: ChromaLibArgs = {
    url: CHROMA_URL,
    collectionName: CHROMA_COLLECTION,
  }

  console.log(`连接到 Chroma: ${CHROMA_URL}`)
  console.log(`集合名称: ${CHROMA_COLLECTION}\n`)

  const files = await fs.readdir(EXPORT_DIR)
  const exportFiles = files
    .filter((f) => f.startsWith("chroma-export-") && f.endsWith(".json"))
    .sort()
    .reverse()

  if (exportFiles.length === 0) {
    console.log("未找到导出文件")
    console.log(`请将导出文件放入: ${EXPORT_DIR}`)
    return
  }

  console.log("可用的导出文件:")
  exportFiles.forEach((file, i) => {
    console.log(`  ${i + 1}. ${file}`)
  })

  const filename = exportFiles[0]
  const filepath = path.join(EXPORT_DIR, filename)

  console.log(`\n使用最新文件: ${filename}`)

  const fileContent = await fs.readFile(filepath, "utf-8")
  const exportData: ExportData = JSON.parse(fileContent)

  console.log(`导出时间: ${exportData.exportedAt}`)
  console.log(`向量数量: ${exportData.vectors.length}`)

  const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-small",
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.EMBEDDING_BASE_URL,
    },
  })

  const vectorStore = new Chroma(embeddings, args)

  console.log("\n开始导入向量...")

  const batchSize = 50
  let imported = 0

  for (let i = 0; i < exportData.vectors.length; i += batchSize) {
    const batch = exportData.vectors.slice(i, i + batchSize)

    const docs = batch.map((v) => {
      return new Document({
        pageContent: v.content,
        metadata: v.metadata,
      })
    })

    const ids = batch.map((v) => v.id)

    await vectorStore.addDocuments(docs, { ids })

    imported += batch.length
    console.log(`已导入: ${imported} / ${exportData.vectors.length}`)
  }

  console.log(`\n导入完成！`)
  console.log(`成功导入: ${imported} 个向量`)
}

main().catch((error) => {
  console.error("导入失败:", error)
  process.exit(1)
})
