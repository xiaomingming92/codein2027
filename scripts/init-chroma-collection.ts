import { Chroma } from "@langchain/community/vectorstores/chroma"
import { OpenAIEmbeddings } from "@langchain/openai"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.development" })

import { CHROMA_URL, CHROMA_COLLECTION, CHROMA_AUTH_TOKEN } from "../src/config/chroma-config"

async function initializeChroma() {
  console.log("🚀 初始化 ChromaDB 集合...\n")
  
  console.log("配置信息:")
  console.log(`   URL: ${CHROMA_URL}`)
  console.log(`   Collection: ${CHROMA_COLLECTION}`)
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
      collectionName: CHROMA_COLLECTION,
    }

    if (CHROMA_AUTH_TOKEN) {
      chromaConfig.headers = {
        Authorization: `Bearer ${CHROMA_AUTH_TOKEN}`,
      }
      console.log("✅ 使用 Bearer Token 认证")
    }

    console.log("\n🔄 正在创建 ChromaDB 集合...")
    
    const chroma = new Chroma(embeddings, chromaConfig)
    
    console.log("✅ 集合创建成功!")

    console.log("\n📊 添加测试文档以初始化集合...")
    const testDoc = {
      pageContent: "这是一个初始化测试文档。",
      metadata: { source: "initialization-test", timestamp: Date.now() },
    }

    const docId = `init-${Date.now()}`
    await chroma.addDocuments([testDoc], { ids: [docId] })
    console.log("✅ 测试文档添加成功!")

    console.log("\n🔍 验证集合已创建...")
    const results = await chroma.similaritySearch("初始化", 1)
    console.log(`✅ 验证成功，集合中已有 ${results.length} 个文档`)

    console.log("\n🗑️ 清理测试数据...")
    await chroma.delete({ ids: [docId] })
    console.log("✅ 测试数据已清理")

    console.log("\n🎉 ChromaDB 集合初始化完成！")
    console.log(`   集合名称: ${CHROMA_COLLECTION}`)
    console.log("\n💡 提示:")
    console.log("   现在可以重新运行同步操作了")
    
  } catch (error) {
    console.error("\n❌ ChromaDB 集合初始化失败!")
    console.error("错误信息:", error)
    
    if (error instanceof Error) {
      console.error("\n详细错误:")
      console.error(`   名称: ${error.name}`)
      console.error(`   消息: ${error.message}`)
      
      if (error.message.includes("already exists")) {
        console.error("\n💡 集合已存在，无需再次初始化")
      }
    }
  }
}

initializeChroma()
