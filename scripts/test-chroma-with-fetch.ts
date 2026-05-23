import * as dotenv from "dotenv"

dotenv.config({ path: ".env.development" })

const CHROMA_HOST = process.env.CHROMA_HOST || "localhost"
const CHROMA_PORT = process.env.CHROMA_PORT || "8000"
const CHROMA_URL = `http://${CHROMA_HOST}:${CHROMA_PORT}`
const COLLECTION_NAME = process.env.CHROMA_COLLECTION || "team_coordinator"
const CHROMA_AUTH_TOKEN = process.env.CHROMA_AUTH_TOKEN || ""

async function testWithFetch() {
  console.log("🧪 使用 fetch 直接测试 ChromaDB API...\n")
  
  console.log("配置:")
  console.log(`   URL: ${CHROMA_URL}`)
  console.log(`   Collection: ${COLLECTION_NAME}`)
  console.log(`   Auth: ${CHROMA_AUTH_TOKEN ? "已配置" : "未配置"}`)
  console.log("")

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (CHROMA_AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${CHROMA_AUTH_TOKEN}`
  }

  try {
    console.log("1️⃣ 列出所有集合...")
    const listRes = await fetch(`${CHROMA_URL}/api/v1/collections`, { headers })
    const collections = await listRes.json()
    console.log(`   ✅ 成功! 找到 ${collections.length} 个集合`)
    for (const col of collections) {
      console.log(`   - ${col.name}`)
    }

    console.log("\n2️⃣ 创建目标集合...")
    const createRes = await fetch(`${CHROMA_URL}/api/v1/collections`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: COLLECTION_NAME,
        get_or_create: true,
      }),
    })
    const collection = await createRes.json()
    console.log(`   ✅ 集合 "${collection.name}" 已创建/获取`)
    console.log(`   ID: ${collection.id}`)

    console.log("\n3️⃣ 添加测试文档...")
    const addRes = await fetch(`${CHROMA_URL}/api/v1/collections/${collection.id}/add`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ids: [`test-${Date.now()}`],
        metadatas: [{ source: "initialization-test" }],
        documents: ["这是一个初始化测试文档，用于验证向量数据库是否正常工作。"],
      }),
    })
    const addResult = await addRes.json()
    console.log(`   ✅ 文档添加成功!`)

    console.log("\n4️⃣ 查询文档...")
    const queryRes = await fetch(`${CHROMA_URL}/api/v1/collections/${collection.id}/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query_texts: ["测试"],
        n_results: 1,
        include: ["documents", "metadatas"],
      }),
    })
    const queryResult = await queryRes.json()
    console.log(`   ✅ 查询成功!`)
    if (queryResult.documents && queryResult.documents[0]) {
      console.log(`   找到 ${queryResult.documents[0].length} 个结果`)
      if (queryResult.documents[0][0]) {
        console.log(`   内容: ${queryResult.documents[0][0].substring(0, 50)}...`)
      }
    }

    console.log("\n5️⃣ 获取集合中的文档数量...")
    const countRes = await fetch(`${CHROMA_URL}/api/v1/collections/${collection.id}/count`, {
      headers,
    })
    const count = await countRes.text()
    console.log(`   ✅ 文档数量: ${count}`)

    console.log("\n🎉 ChromaDB API 测试成功!")
    console.log("\n💡 现在需要更新代码使用 fetch 而非 LangChain Chroma SDK")
    console.log(`   集合 "${COLLECTION_NAME}" 已准备好使用`)
    
  } catch (error) {
    console.error("\n❌ 测试失败!")
    console.error(error)
    
    if (error instanceof Error) {
      console.error("\n错误详情:")
      console.error(`   名称: ${error.name}`)
      console.error(`   消息: ${error.message}`)
    }
  }
}

testWithFetch()
