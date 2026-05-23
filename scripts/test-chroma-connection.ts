import { Chroma } from "@langchain/community/vectorstores/chroma"
import { OpenAIEmbeddings } from "@langchain/openai"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.development" })

const CHROMA_HOST = process.env.CHROMA_HOST || "localhost"
const CHROMA_PORT = process.env.CHROMA_PORT || "8000"
const CHROMA_URL = `http://${CHROMA_HOST}:${CHROMA_PORT}`
const COLLECTION_NAME = process.env.CHROMA_COLLECTION || "team_coordinator"
const CHROMA_AUTH_TOKEN = process.env.CHROMA_AUTH_TOKEN || ""

async function testChromaConnection() {
  console.log("🧪 测试 ChromaDB 连接...\n")
  
  console.log("配置信息:")
  console.log(`   URL: ${CHROMA_URL}`)
  console.log(`   Collection: ${COLLECTION_NAME}`)
  console.log(`   Auth Token: ${CHROMA_AUTH_TOKEN ? "已配置" : "未配置"}`)
  console.log("")

  try {
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY || "",
      configuration: {
        baseURL: process.env.EMBEDDING_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
      model: process.env.EMBEDDING_MODEL || "text-embedding-v4",
    })

    const chromaConfig: Record<string, unknown> = {
      url: CHROMA_URL,
      collectionName: COLLECTION_NAME,
    }

    if (CHROMA_AUTH_TOKEN) {
      chromaConfig.headers = {
        Authorization: `Bearer ${CHROMA_AUTH_TOKEN}`,
      }
      console.log("✅ 使用 Bearer Token 认证")
    }

    console.log("\n🔄 正在连接 ChromaDB...")
    const chroma = new Chroma(embeddings, chromaConfig)

    console.log("✅ ChromaDB 连接成功!")

    console.log("\n📊 测试添加文档...")
    const testDoc = {
      pageContent: "这是一个测试文档内容，用于验证向量数据库连接是否正常。",
      metadata: { source: "test", timestamp: Date.now() },
    }

    const docId = `test-${Date.now()}`
    await chroma.addDocuments([testDoc], { ids: [docId] })
    console.log("✅ 文档添加成功!")

    console.log("\n🔍 测试相似性搜索...")
    const results = await chroma.similaritySearch("测试", 1)
    console.log(`✅ 搜索成功，找到 ${results.length} 个结果`)

    if (results.length > 0) {
      console.log(`   最相关结果: ${results[0].pageContent.substring(0, 50)}...`)
    }

    console.log("\n🗑️ 清理测试数据...")
    await chroma.delete({ ids: [docId] })
    console.log("✅ 测试数据已清理")

    console.log("\n🎉 所有测试通过！ChromaDB 配置正确。")
  } catch (error) {
    console.error("\n❌ ChromaDB 连接失败!")
    console.error("错误信息:", error)
    
    if (error instanceof Error) {
      console.error("\n详细错误:")
      console.error(`   名称: ${error.name}`)
      console.error(`   消息: ${error.message}`)
      console.error(`   堆栈: ${error.stack?.split("\n").slice(0, 5).join("\n")}`)
    }

    console.error("\n💡 可能的问题:")
    console.error("   1. ChromaDB 服务未运行")
    console.error("   2. 认证 Token 配置不正确")
    console.error("   3. 集合名称不存在")
    console.error("   4. 网络连接问题")
  }
}

testChromaConnection()
