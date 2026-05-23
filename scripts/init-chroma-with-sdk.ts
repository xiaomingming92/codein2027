import { ChromaClient, Collection, IncludeEnum } from "chromadb"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.development" })

const CHROMA_HOST = process.env.CHROMA_HOST || "localhost"
const CHROMA_PORT = process.env.CHROMA_PORT || "8000"
const CHROMA_URL = `http://${CHROMA_HOST}:${CHROMA_PORT}`
const COLLECTION_NAME = process.env.CHROMA_COLLECTION || "team_coordinator"
const CHROMA_AUTH_TOKEN = process.env.CHROMA_AUTH_TOKEN || ""

async function initializeChromaWithSDK() {
  console.log("🚀 使用 Chroma SDK 初始化集合...\n")
  
  console.log("配置信息:")
  console.log(`   URL: ${CHROMA_URL}`)
  console.log(`   Collection: ${COLLECTION_NAME}`)
  console.log(`   Auth Token: ${CHROMA_AUTH_TOKEN ? "已配置" : "未配置"}`)
  console.log("")

  try {
    console.log("\n🔄 正在连接 ChromaDB...")
    
    const client = new ChromaClient({
      path: CHROMA_URL,
      headers: CHROMA_AUTH_TOKEN ? {
        Authorization: `Bearer ${CHROMA_AUTH_TOKEN}`,
      } : undefined,
    })

    console.log("✅ ChromaDB 连接成功!")

    console.log("\n📋 检查现有集合...")
    const collections = await client.listCollections()
    console.log(`   现有集合数量: ${collections.length}`)
    for (const col of collections) {
      console.log(`   - ${col.name}`)
    }

    console.log("\n🔄 创建/获取集合...")
    const collection = await client.getOrCreateCollection({
      name: COLLECTION_NAME,
    })
    console.log(`✅ 集合 "${COLLECTION_NAME}" 已创建/获取`)

    console.log("\n📊 添加测试文档...")
    const testId = `test-${Date.now()}`
    await collection.add({
      ids: [testId],
      metadatas: [{ source: "initialization-test", timestamp: Date.now() }],
      documents: ["这是一个初始化测试文档，用于验证向量数据库连接是否正常。"],
    })
    console.log("✅ 测试文档添加成功!")

    console.log("\n🔍 验证文档已添加...")
    const count = await collection.count()
    console.log(`   集合中文档数量: ${count}`)

    const results = await collection.query({
      queryTexts: ["测试"],
      nResults: 1,
      include: [IncludeEnum.Documents],
    })
    
    if (results.documents && results.documents[0] && results.documents[0].length > 0) {
      console.log(`✅ 查询成功，找到 ${results.documents[0].length} 个结果`)
      console.log(`   最相关结果: ${results.documents[0][0].substring(0, 50)}...`)
    }

    console.log("\n🗑️ 清理测试数据...")
    await collection.delete({
      ids: [testId],
    })
    console.log("✅ 测试数据已清理")

    console.log("\n🎉 ChromaDB 集合初始化完成！")
    console.log(`   集合名称: ${COLLECTION_NAME}`)
    console.log(`   文档数量: ${await collection.count()}`)
    console.log("\n💡 提示:")
    console.log("   现在可以重新运行同步操作了")
    
  } catch (error) {
    console.error("\n❌ ChromaDB 集合初始化失败!")
    console.error("错误信息:", error)
    
    if (error instanceof Error) {
      console.error("\n详细错误:")
      console.error(`   名称: ${error.name}`)
      console.error(`   消息: ${error.message}`)
      console.error(`   堆栈: ${error.stack?.split("\n").slice(0, 10).join("\n")}`)
    }
  }
}

initializeChromaWithSDK()
