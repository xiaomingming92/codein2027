import * as dotenv from "dotenv"

dotenv.config({ path: ".env.development" })

import { CHROMA_URL, CHROMA_COLLECTION, getChromaHeaders } from "../src/config/chroma-config"

async function cleanupChroma() {
  console.log("🧹 清理 ChromaDB 测试数据...\n")

  console.log("配置:")
  console.log(`   Host: ${CHROMA_URL}`)
  console.log(`   Collection: ${CHROMA_COLLECTION}`)
  console.log("")

  const headers = getChromaHeaders()

  try {
    console.log("1️⃣ 获取集合信息...")
    const collectionsRes = await fetch(`${CHROMA_URL}/api/v1/collections`, { headers })
    const collections = await collectionsRes.json()
    
    const collection = collections.find((c: { name: string }) => c.name === CHROMA_COLLECTION)
    
    if (!collection) {
      console.log("   ⚠️  集合不存在，无需清理")
      return
    }

    console.log(`   ✅ 找到集合: ${collection.name} (ID: ${collection.id})`)

    console.log("\n2️⃣ 获取集合中的文档数量...")
    const countRes = await fetch(
      `${CHROMA_URL}/api/v1/collections/${collection.id}/count`,
      { headers }
    )
    const count = parseInt(await countRes.text())
    console.log(`   当前文档数量: ${count}`)

    if (count === 0) {
      console.log("\n   ✅ 集合已为空，无需清理")
      return
    }

    console.log("\n3️⃣ 获取所有文档ID...")
    const getRes = await fetch(
      `${CHROMA_URL}/api/v1/collections/${collection.id}/get`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ limit: 100 }),
      }
    )
    const data = await getRes.json()
    
    console.log(`   找到 ${data.ids.length} 个文档ID:`)
    for (const id of data.ids) {
      console.log(`   - ${id}`)
    }

    console.log("\n4️⃣ 清理测试数据...")
    const testIds = data.ids.filter((id: string) => 
      id.startsWith("test-") || 
      id.startsWith("init-")
    )

    if (testIds.length === 0) {
      console.log("   ✅ 没有测试数据需要清理")
    } else {
      console.log(`   正在删除 ${testIds.length} 个测试文档...`)
      
      const deleteRes = await fetch(
        `${CHROMA_URL}/api/v1/collections/${collection.id}/delete`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ids: testIds }),
        }
      )

      if (deleteRes.ok) {
        console.log("   ✅ 测试数据已清理")
      } else {
        const error = await deleteRes.text()
        console.error(`   ❌ 删除失败: ${error}`)
      }
    }

    console.log("\n5️⃣ 验证清理结果...")
    const newCountRes = await fetch(
      `${CHROMA_URL}/api/v1/collections/${collection.id}/count`,
      { headers }
    )
    const newCount = parseInt(await newCountRes.text())
    console.log(`   清理后文档数量: ${newCount}`)

    if (newCount === 0) {
      console.log("\n✅ ChromaDB 已清理完成！")
    } else {
      console.log(`\n⚠️  还有 ${newCount} 个文档，可能是正式数据。`)
      console.log("   如需完全重置，请删除整个集合。")
    }

  } catch (error) {
    console.error("\n❌ 清理失败!")
    console.error(error)
    if (error instanceof Error) {
      console.error(`   名称: ${error.name}`)
      console.error(`   消息: ${error.message}`)
    }
  }
}

cleanupChroma()
