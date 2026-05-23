import { ChromaClient, IncludeEnum } from "chromadb"
import * as dotenv from "dotenv"

dotenv.config({ path: ".env.development" })

import { CHROMA_URL, CHROMA_COLLECTION, CHROMA_AUTH_TOKEN } from "../src/config/chroma-config"

async function testChromaAuth() {
  console.log("🧪 测试 ChromaDB 认证配置...\n")
  
  const authMethods = [
    { name: "Bearer Token (Authorization)", headers: { Authorization: `Bearer ${CHROMA_AUTH_TOKEN}` } },
    { name: "X-Chroma-Token", headers: { "X-Chroma-Token": CHROMA_AUTH_TOKEN } },
    { name: "无认证", headers: {} },
  ]

  for (const method of authMethods) {
    console.log(`\n🔍 测试: ${method.name}`)
    console.log(`   Headers: ${JSON.stringify(method.headers)}`)
    
    try {
      const client = new ChromaClient({
        path: CHROMA_URL,
        headers: method.headers as Record<string, string>,
      })

      const collections = await client.listCollections()
      console.log(`✅ 成功! 找到 ${collections.length} 个集合`)
      
      for (const col of collections) {
        console.log(`   - ${col.name}`)
      }

      console.log("\n🎉 有效的认证方式:", method.name)
      
      if (collections.length === 0) {
        console.log("\n📝 需要创建集合...")
        
        console.log("\n🔄 创建集合...")
        const collection = await client.getOrCreateCollection({
          name: CHROMA_COLLECTION,
        })
        console.log(`✅ 集合 "${CHROMA_COLLECTION}" 创建成功!`)

        console.log("\n📊 添加测试文档...")
        const testId = `test-${Date.now()}`
        await collection.add({
          ids: [testId],
          metadatas: [{ source: "initialization-test" }],
          documents: ["这是一个初始化测试文档。"],
        })
        console.log("✅ 测试文档添加成功!")

        console.log("\n🔍 验证...")
        const results = await collection.query({
          queryTexts: ["测试"],
          nResults: 1,
          include: [IncludeEnum.documents],
        })
        
        if (results.documents && results.documents[0]) {
          console.log(`✅ 查询成功! 找到 ${results.documents[0].length} 个结果`)
        }

        console.log("\n🗑️ 清理...")
        await collection.delete({ ids: [testId] })
        console.log("✅ 清理完成")

        console.log("\n🎉 ChromaDB 初始化成功!")
      }

      return
    } catch (error) {
      console.log(`❌ 失败: ${error instanceof Error ? error.message : "未知错误"}`)
      if (error instanceof Error && error.message.includes("401")) {
        console.log("   (认证失败)")
      }
    }
  }

  console.log("\n❌ 所有认证方式都失败了!")
  console.log("\n💡 可能的问题:")
  console.log("   1. ChromaDB 的认证配置不正确")
  console.log("   2. 使用的环境变量名称不正确")
  console.log("   3. 需要重启 ChromaDB 服务")
}

testChromaAuth()
