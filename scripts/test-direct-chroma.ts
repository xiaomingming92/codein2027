import { indexKnowledgeDocument } from "../src/services/chroma-direct-client"
import * as fs from "fs"
import * as path from "path"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.development" })

async function testDirectChromaClient() {
  console.log("🧪 测试直接 Chroma 客户端...\n")

  try {
    console.log("📄 创建测试文档...")
    const testDir = "/tmp/chroma-test"
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true })
    }

    const testFilePath = path.join(testDir, "test.md")
    const testContent = `
# 测试文档

这是一个测试文档，用于验证 Chroma 向量数据库的连接和功能。

## 第一部分
这是文档的第一部分内容。

## 第二部分
这是文档的第二部分内容。

## 结论
这是文档的结论部分。
    `.trim()

    fs.writeFileSync(testFilePath, testContent, "utf-8")
    console.log(`✅ 测试文件已创建: ${testFilePath}`)

    const buffer = fs.readFileSync(testFilePath)
    const fileName = "test.md"
    const documentId = `test-doc-${Date.now()}`

    console.log("\n🔄 开始向量化...")
    const result = await indexKnowledgeDocument(
      documentId,
      buffer,
      fileName,
      (progress) => {
        console.log(`   [${progress.status}] ${progress.message} (${progress.progress || 0}%)`)
      }
    )

    if (result.success) {
      console.log(`\n✅ 向量化成功!`)
      console.log(`   向量ID数量: ${result.vectorIds?.length || 0}`)
      console.log(`   向量IDs: ${result.vectorIds?.join(", ")}`)
    } else {
      console.log(`\n❌ 向量化失败!`)
      console.log(`   错误: ${result.error}`)
    }

    console.log("\n🧹 清理测试文件...")
    fs.unlinkSync(testFilePath)
    console.log("✅ 清理完成")

  } catch (error) {
    console.error("\n❌ 测试失败!")
    console.error(error)
  }
}

testDirectChromaClient()
