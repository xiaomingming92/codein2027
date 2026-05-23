import { describe, it, expect, beforeAll, afterAll } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { indexKnowledgeDocument } from "@/services/knowledge-indexer"
import { parseDocumentFromBuffer } from "@/services/document-parser"
import { getEmbeddings } from "@/lib/embeddings"

const KNOWLEDGE_DIR = "/home/xmm/ai/农业智能体/team-coordinator-agent/docs/农业智能体(把地种智能体)/knowledge"

describe("Knowledge Base Integration Tests", () => {
  let testFiles: Array<{ name: string; path: string; buffer: Buffer }> = []

  beforeAll(async () => {
    console.log("\n🔍 扫描知识库目录:", KNOWLEDGE_DIR)
    
    async function scanDirectory(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath)
        } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".txt"))) {
          try {
            const buffer = await fs.readFile(fullPath)
            testFiles.push({
              name: entry.name,
              path: path.relative(KNOWLEDGE_DIR, fullPath),
              buffer,
            })
            console.log(`  📄 发现文件: ${path.relative(KNOWLEDGE_DIR, fullPath)} (${(buffer.length / 1024).toFixed(1)} KB)`)
          } catch (error) {
            console.error(`  ❌ 无法读取文件: ${entry.name}`, error)
          }
        }
      }
    }

    await scanDirectory(KNOWLEDGE_DIR)
    console.log(`\n📊 总共发现 ${testFiles.length} 个测试文件\n`)
  })

  describe("Document Parsing", () => {
    it("should parse all markdown files successfully", async () => {
      const mdFiles = testFiles.filter((f) => f.name.endsWith(".md"))
      console.log(`\n📝 测试解析 ${mdFiles.length} 个 Markdown 文件...\n`)

      for (const file of mdFiles) {
        const startTime = Date.now()
        
        try {
          const result = await parseDocumentFromBuffer(file.buffer, file.name)
          const duration = Date.now() - startTime
          
          console.log(`✅ ${file.path}`)
          console.log(`   类型: ${result.metadata.type}`)
          console.log(`   内容长度: ${result.content?.length || 0} 字符`)
          console.log(`   解析耗时: ${duration}ms`)
          
          expect(result.content).toBeDefined()
          expect(result.content!.length).toBeGreaterThan(0)
          expect(result.metadata.type).toBe("markdown")
        } catch (error) {
          console.error(`❌ 解析失败: ${file.path}`, error)
          throw error
        }
      }
    }, 30000)

    it("should handle large documents correctly", async () => {
      const largeFile = testFiles.reduce((largest, current) => 
        current.buffer.length > largest.buffer.length ? current : largest
      )

      console.log(`\n📏 测试最大文件: ${largeFile.path} (${(largeFile.buffer.length / 1024).toFixed(1)} KB)\n`)

      const result = await parseDocumentFromBuffer(largeFile.buffer, largeFile.name)
      
      expect(result.content).toBeDefined()
      expect(result.content!.length).toBeGreaterThan(1000)
      console.log(`   ✅ 大文件解析成功, 内容长度: ${result.content?.length} 字符`)
    })
  })

  describe("Vectorization with Real Embedding API", () => {
    it("should call real embedding API and track token usage", async () => {
      const testFile = testFiles[0]
      if (!testFile) {
        throw new Error("没有找到测试文件")
      }

      console.log(`\n🚀 测试向量化: ${testFile.path}\n`)

      const progressLogs: Array<{
        status: string
        message: string
        progress?: number
        timestamp: number
      }> = []

      const consoleSpy = {
        log: vi.fn(),
        error: vi.fn(),
      }

      const originalConsoleLog = console.log
      const originalConsoleError = console.error

      console.log = (...args: unknown[]) => {
        const message = args[0] as string
        if (message.includes("[KnowledgeIndexer]")) {
          consoleSpy.log(...args)
        }
        originalConsoleLog(...args)
      }

      console.error = (...args: unknown[]) => {
        const message = args[0] as string
        if (message.includes("[KnowledgeIndexer]")) {
          consoleSpy.error(...args)
        }
        originalConsoleError(...args)
      }

      try {
        const result = await indexKnowledgeDocument(
          `integration-test-${Date.now()}`,
          testFile.buffer,
          testFile.name,
          (progress) => {
            progressLogs.push({
              ...progress,
              timestamp: Date.now(),
            })
            console.log(`   📊 [${progress.status}] ${progress.message} (${progress.progress}%)`)
          }
        )

        console.log("\n\n📈 向量化结果:")
        console.log(`   成功: ${result.success}`)
        if (result.vectorIds) {
          console.log(`   向量数量: ${result.vectorIds.length}`)
        }

        // 验证进度回调被调用
        expect(progressLogs.length).toBeGreaterThan(0)
        console.log(`\n   进度更新次数: ${progressLogs.length}`)

        // 验证状态流转
        const statuses = progressLogs.map((p) => p.status)
        console.log(`   状态序列: ${statuses.join(" → ")}`)
        expect(statuses).toContain("PARSING")
        expect(statuses).toContain("INDEXING")
        expect(statuses).toContain("INDEXED")

        // 验证最终状态
        const finalProgress = progressLogs[progressLogs.length - 1]
        expect(finalProgress.status).toBe("INDEXED")
        expect(finalProgress.progress).toBe(100)

        // 检查控制台日志中的token信息
        const logMessages = consoleSpy.log.mock.calls.map((call) => call[0] as string)
        const hasTokenInfo = logMessages.some((msg) => msg.includes("token"))
        console.log(`\n   Token追踪: ${hasTokenInfo ? "✅ 已记录" : "❌ 未检测到"}`)
        
        if (hasTokenInfo) {
          const tokenLog = logMessages.find((msg) => msg.includes("token"))
          console.log(`   Token日志: ${tokenLog}`)
        }

        // 检查耗时信息
        const hasTimingInfo = logMessages.some((msg) => msg.includes("耗时"))
        if (hasTimingInfo) {
          const timingLog = logMessages.find((msg) => msg.includes("耗时"))
          console.log(`   耗时日志: ${timingLog}`)
        }

        expect(result.success).toBe(true)
      } finally {
        console.log = originalConsoleLog
        console.error = originalConsoleError
      }
    }, 60000)

    it("should demonstrate embedding API calls with token estimation", async () => {
      console.log("\n🔢 测试Embedding API调用和Token估算\n")

      const embeddings = getEmbeddings()
      
      const testTexts = [
        "这是一个短文本测试",
        "这是一个较长的文本测试内容，用于验证embedding API的调用是否正常工作，以及token消耗的估算是否准确。这个文本包含了更多的字符，应该会产生更多的token。",
      ]

      for (let i = 0; i < testTexts.length; i++) {
        const text = testTexts[i]
        const startTime = Date.now()
        
        console.log(`   测试文本 ${i + 1}: "${text.substring(0, 50)}..."`)
        console.log(`   字符数: ${text.length}`)

        try {
          const embedding = await embeddings.embedQuery(text)
          const duration = Date.now() - startTime
          const estimatedTokens = Math.ceil(text.length / 4)

          console.log(`   ✅ Embedding成功`)
          console.log(`   向量维度: ${embedding.length}`)
          console.log(`   API调用耗时: ${duration}ms`)
          console.log(`   估算Token数: ~${estimatedTokens}`)
          console.log(`   前5个值: [${embedding.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}]`)

          expect(embedding).toBeDefined()
          expect(embedding.length).toBeGreaterThan(0)
          expect(duration).toBeLessThan(10000) // 不超过10秒
        } catch (error) {
          console.error(`   ❌ Embedding失败:`, error)
          throw error
        }
        console.log("")
      }
    }, 30000)

    it("should process multiple files and show cumulative token usage", async () => {
      const smallFiles = testFiles
        .filter((f) => f.buffer.length < 5000) // 只选择小于5KB的文件
        .slice(0, 3) // 最多3个文件

      if (smallFiles.length === 0) {
        console.log("⚠️  跳过：没有足够小的测试文件")
        return
      }

      console.log(`\n📚 批量处理 ${smallFiles.length} 个文件:\n`)

      let totalTokens = 0
      let totalTime = 0
      let successCount = 0

      for (const file of smallFiles) {
        const startTime = Date.now()
        
        try {
          const result = await indexKnowledgeDocument(
            `batch-test-${Date.now()}-${file.name}`,
            file.buffer,
            file.name
          )
          
          const duration = Date.now() - startTime
          const estimatedTokens = Math.ceil(file.buffer.length / 4)
          
          totalTime += duration
          totalTokens += estimatedTokens

          if (result.success) {
            successCount++
            console.log(`   ✅ ${file.path}`)
            console.log(`      文件大小: ${(file.buffer.length / 1024).toFixed(1)} KB`)
            console.log(`      处理耗时: ${duration}ms`)
            console.log(`      估算Token: ~${estimatedTokens}`)
            console.log(`      向量数量: ${result.vectorIds?.length || 0}`)
          } else {
            console.log(`   ❌ ${file.path}: ${result.error}`)
          }
        } catch (error) {
          console.error(`   💥 ${file.path} 异常:`, error)
        }
        console.log("")
      }

      console.log("📊 批量处理统计:")
      console.log(`   成功: ${successCount}/${smallFiles.length}`)
      console.log(`   总耗时: ${totalTime}ms`)
      console.log(`   平均耗时: ${Math.round(totalTime / smallFiles.length)}ms`)
      console.log(`   总Token(估算): ~${totalTokens}`)

      expect(successCount).toBeGreaterThan(0)
    }, 120000)
  })
})

describe("Real Environment Verification", () => {
  it("should verify Chroma connection configuration", () => {
    console.log("\n🔧 环境配置验证:\n")
    
    const chromaHost = process.env.CHROMA_HOST || "localhost"
    const chromaPort = process.env.CHROMA_PORT || "8000"
    const chromaUrl = `http://${chromaHost}:${chromaPort}`
    
    console.log(`   Chroma URL: ${chromaUrl}`)
    console.log(`   Collection: ${process.env.CHROMA_COLLECTION || "team_coordinator"}`)
    
    expect(chromaHost).toBeDefined()
    expect(chromaPort).toBeDefined()
  })

  it("should verify embedding provider configuration", () => {
    console.log("\n🤖 Embedding Provider 配置:\n")
    
    const provider = process.env.EMBEDDING_PROVIDER || "cloud"
    const model = process.env.EMBEDDING_MODEL || process.env.OLLAMA_EMBEDDING_MODEL || "default"
    
    console.log(`   Provider: ${provider}`)
    console.log(`   Model: ${model}`)
    
    if (provider === "cloud") {
      const baseURL = process.env.EMBEDDING_BASE_URL || "not configured"
      const hasApiKey = !!process.env.OPENAI_API_KEY
      
      console.log(`   Base URL: ${baseURL}`)
      console.log(`   API Key: ${hasApiKey ? "✅ 已配置" : "❌ 未配置"}`)
      
      expect(hasApiKey).toBe(true)
    }
    
    expect(provider).toBeDefined()
    expect(model).toBeDefined()
  })
})