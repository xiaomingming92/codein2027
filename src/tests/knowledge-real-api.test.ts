import { describe, it, expect, beforeAll } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as dotenv from "dotenv"
import { parseDocumentFromBuffer } from "@/services/document-parser"
import { getEmbeddings, getEmbeddingConfig, getEmbeddingProviderType } from "@/lib/embeddings"

// Load real environment variables FIRST (before any imports)
const envPath = path.resolve(process.cwd(), ".env.development")
console.log("📂 Loading environment from:", envPath)
const envResult = dotenv.config({ path: envPath })

if (envResult.error) {
  console.error("❌ Failed to load .env.development:", envResult.error)
} else {
  console.log("✅ Environment loaded successfully")
}

// Mark as integration test to avoid fetch mocking
process.env.INTEGRATION_TEST = "true"

// Force use real embedding config from .env.development
// Using text-embedding-v3 which is supported in OpenAI compatibility mode
const realConfig = {
  EMBEDDING_MODEL: "text-embedding-v4",
  OPENAI_API_KEY: "sk-e984f5242a8144fd90e2bbcef3cef5c2",
  EMBEDDING_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
}

// Override test defaults with real values
Object.assign(process.env, realConfig)

console.log("\n🔧 Environment configuration:")
console.log(`   Model: ${process.env.EMBEDDING_MODEL}`)
console.log(`   API Key: ${process.env.OPENAI_API_KEY ? `✅ (${process.env.OPENAI_API_KEY.substring(0, 10)}...)` : "❌ NOT SET"}`)
console.log(`   Base URL: ${process.env.EMBEDDING_BASE_URL}`)
console.log("")

const KNOWLEDGE_DIR = "/home/xmm/ai/农业智能体/codein2027/docs/农业智能体(把地种智能体)/knowledge"

describe("Knowledge Base Integration Tests (Real API)", () => {
  let testFiles: Array<{ name: string; filePath: string; buffer: Buffer }> = []

  beforeAll(async () => {
    console.log("\n" + "=".repeat(80))
    console.log("🔍 扫描知识库目录:", KNOWLEDGE_DIR)
    console.log("=".repeat(80) + "\n")

    async function scanDirectory(dir: string, relativePath = ""): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name

        if (entry.isDirectory()) {
          await scanDirectory(fullPath, relPath)
        } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
          try {
            const buffer = await fs.readFile(fullPath)
            testFiles.push({
              name: entry.name,
              filePath: relPath,
              buffer,
            })
            console.log(`📄 ${relPath} (${(buffer.length / 1024).toFixed(1)} KB)`)
          } catch (error) {
            console.error(`❌ 无法读取: ${relPath}`, error)
          }
        }
      }
    }

    await scanDirectory(KNOWLEDGE_DIR)

    console.log(`\n📊 总计: ${testFiles.length} 个文件\n`)
    console.log("=".repeat(80) + "\n")
  })

  describe("Environment Configuration", () => {
    it("should verify embedding provider is configured", () => {
      console.log("\n🔧 Embedding Provider 配置:\n")

      const providerType = getEmbeddingProviderType()
      const config = getEmbeddingConfig()

      console.log(`   Provider Type: ${providerType}`)
      console.log(`   Model: ${config.model}`)

      if (config.provider === "cloud") {
        console.log(`   Base URL: ${config.baseURL}`)
        console.log(`   API Key: ${config.apiKey ? `✅ (${config.apiKey.substring(0, 10)}...)` : "❌ 未配置"}`)
      } else if (config.provider === "ollama") {
        console.log(`   Ollama URL: ${config.baseURL}`)
      }

      expect(config.model).toBeDefined()
      expect(config.model.length).toBeGreaterThan(0)
    })

    it("should verify Chroma configuration", () => {
      console.log("\n🔧 Chroma 配置:\n")

      const chromaHost = process.env.CHROMA_HOST || "localhost"
      const chromaPort = process.env.CHROMA_PORT || "8000"
      const collection = process.env.CHROMA_COLLECTION || "farm_agent"

      console.log(`   Host: ${chromaHost}`)
      console.log(`   Port: ${chromaPort}`)
      console.log(`   URL: http://${chromaHost}:${chromaPort}`)
      console.log(`   Collection: ${collection}`)

      expect(chromaHost).toBeDefined()
      expect(chromaPort).toBeDefined()
    })
  })

  describe("Document Parsing", () => {
    it("should parse all test files successfully", async () => {
      console.log("\n📝 文档解析测试:\n")

      let successCount = 0
      let totalContentLength = 0

      for (const file of testFiles) {
        const startTime = Date.now()

        try {
          const result = await parseDocumentFromBuffer(file.buffer, file.name)
          const duration = Date.now() - startTime
          totalContentLength += result.content?.length || 0
          successCount++

          console.log(`✅ ${file.filePath}`)
          console.log(`   类型: ${result.metadata.type} | 长度: ${result.content?.length || 0} 字符 | 耗时: ${duration}ms`)
        } catch (error) {
          console.error(`❌ ${file.filePath}:`, error instanceof Error ? error.message : error)
        }
      }

      console.log(`\n📊 解析结果: ${successCount}/${testFiles.length} 成功 | 总内容: ${(totalContentLength / 1024).toFixed(1)} KB\n`)

      expect(successCount).toBe(testFiles.length)
    }, 30000)
  })

  describe("Real Embedding API Calls", () => {
    it("should call embedding API with real text and track tokens", async () => {
      console.log("\n🚀 Embedding API 测试 (真实API调用):\n")

      const embeddings = getEmbeddings()

      // Test 1: Short text
      const shortText = "这是一个短文本测试"
      console.log(`📝 测试1: 短文本`)
      console.log(`   内容: "${shortText}"`)
      console.log(`   长度: ${shortText.length} 字符`)

      const start1 = Date.now()
      try {
        const embedding1 = await embeddings.embedQuery(shortText)
        const duration1 = Date.now() - start1
        const estimatedTokens1 = Math.ceil(shortText.length / 4)

        console.log(`   ✅ 成功!`)
        console.log(`   耗时: ${duration1}ms`)
        console.log(`   向量维度: ${embedding1.length}`)
        console.log(`   估算Token数: ~${estimatedTokens1}`)
        console.log(`   前5个值: [${embedding1.slice(0, 5).map((v) => v.toFixed(6)).join(", ")}]`)

        expect(embedding1).toBeDefined()
        expect(embedding1.length).toBeGreaterThan(0)
      } catch (error) {
        console.error(`   ❌ 失败:`, error)
        throw error
      }

      console.log("")

      // Test 2: Long text (simulating a document chunk)
      const longText = testFiles[0]?.buffer.toString("utf-8").substring(0, 500) || "默认长文本用于测试embedding API的性能和token消耗情况。这个文本包含了更多的字符，应该会产生更多的token消耗，同时也能更好地验证embedding API的稳定性和响应速度。"

      console.log(`📝 测试2: 长文本 (模拟文档块)`)
      console.log(`   长度: ${longText.length} 字符`)

      const start2 = Date.now()
      try {
        const embedding2 = await embeddings.embedQuery(longText)
        const duration2 = Date.now() - start2
        const estimatedTokens2 = Math.ceil(longText.length / 4)

        console.log(`   ✅ 成功!`)
        console.log(`   耗时: ${duration2}ms`)
        console.log(`   向量维度: ${embedding2.length}`)
        console.log(`   估算Token数: ~${estimatedTokens2}`)
        console.log(`   前5个值: [${embedding2.slice(0, 5).map((v) => v.toFixed(6)).join(", ")}]`)

        expect(embedding2).toBeDefined()
        expect(embedding2.length).toBeGreaterThan(0)
      } catch (error) {
        console.error(`   ❌ 失败:`, error)
        throw error
      }

      console.log("")
    }, 30000)

    it("should batch embed multiple document chunks and show cumulative stats", async () => {
      console.log("\n📚 批量Embedding测试 (多文档块):\n")

      // Create chunks from first file
      const testFile = testFiles[0]
      if (!testFile) {
        console.log("⚠️  跳过：没有测试文件")
        return
      }

      const content = testFile.buffer.toString("utf-8")
      const chunkSize = 1000
      const chunks: string[] = []

      for (let i = 0; i < content.length; i += chunkSize) {
        chunks.push(content.substring(i, i + chunkSize))
      }

      console.log(`📄 源文件: ${testFile.filePath}`)
      console.log(`   原始大小: ${(content.length / 1024).toFixed(1)} KB`)
      console.log(`   分块数量: ${chunks.length}`)
      console.log("")

      const embeddings = getEmbeddings()

      let totalTime = 0
      let totalEstimatedTokens = 0
      let successCount = 0

      for (let i = 0; i < Math.min(chunks.length, 3); i++) { // Max 3 chunks to save time
        const chunk = chunks[i]
        const startTime = Date.now()
        const estimatedTokens = Math.ceil(chunk.length / 4)

        console.log(`📦 块 ${i + 1}/${Math.min(chunks.length, 3)}:`)
        console.log(`   大小: ${chunk.length} 字符 (~${estimatedTokens} tokens)`)

        try {
          const embedding = await embeddings.embedQuery(chunk)
          const duration = Date.now() - startTime

          totalTime += duration
          totalEstimatedTokens += estimatedTokens
          successCount++

          console.log(`   ✅ 成功 | 耗时: ${duration}ms | 维度: ${embedding.length}`)
        } catch (error) {
          console.error(`   ❌ 失败:`, error instanceof Error ? error.message : error)
        }
        console.log("")
      }

      console.log("📊 批量处理统计:")
      console.log(`   成功率: ${successCount}/${Math.min(chunks.length, 3)} (${Math.round((successCount / Math.min(chunks.length, 3)) * 100)}%)`)
      console.log(`   总耗时: ${totalTime}ms`)
      console.log(`   平均耗时: ${successCount > 0 ? Math.round(totalTime / successCount) : 0}ms`)
      console.log(`   总Token(估算): ~${totalEstimatedTokens}`)
      console.log(`   Token/秒: ${totalTime > 0 ? Math.round(totalEstimatedTokens / (totalTime / 1000)) : 0}`)

      expect(successCount).toBeGreaterThan(0)
    }, 60000)
  })
})

describe("Token Usage Analysis", () => {
  it("should analyze token usage patterns across different file sizes", () => {
    console.log("\n\n📈 Token 使用分析:\n")
    console.log("-".repeat(80))

    const sortedFiles = [...testFiles].sort((a, b) => a.buffer.length - b.buffer.length)

    console.log("\n文件大小分布:")
    for (const file of sortedFiles) {
      const sizeKB = file.buffer.length / 1024
      const estimatedTokens = Math.ceil(file.buffer.length / 4)
      const estimatedChunks = Math.ceil(file.buffer.length / 1000) // chunkSize=1000

      console.log(`${file.filePath.substring(0, 40).padEnd(40)} | ${(sizeKB).toFixed(1).padStart(6)} KB | ~${String(estimatedTokens).padStart(6)} tokens | ~${String(estimatedChunks).padStart(2)} chunks`)
    }

    const totalSize = sortedFiles.reduce((sum, f) => sum + f.buffer.length, 0)
    const totalTokens = Math.ceil(totalSize / 4)

    console.log("\n" + "-".repeat(80))
    console.log(`总计: ${sortedFiles.length} 个文件 | ${(totalSize / 1024).toFixed(1)} KB | ~${totalTokens} tokens`)
    console.log("-".repeat(80) + "\n")

    expect(sortedFiles.length).toBeGreaterThan(0)
  })
})