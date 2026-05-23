const { PrismaClient } = require('@prisma/client')
const { ChromaClient } = require('chromadb')

const prisma = new PrismaClient()

async function checkChromaVectors() {
  console.log("\n🔍 检查 Chroma 向量存储情况\n")
  console.log("=".repeat(70))

  try {
    // 1. 连接 Chroma
    const chromaHost = process.env.CHROMA_HOST || 'localhost'
    const chromaPort = process.env.CHROMA_PORT || '8000'
    
    console.log(`\n📡 连接 Chroma: http://${chromaHost}:${chromaPort}`)
    const chroma = new ChromaClient({
      url: `http://${chromaHost}:${chromaPort}`
    })
    
    // 获取集合
    const collectionName = process.env.CHROMA_COLLECTION || 'team_coordinator'
    console.log(`📚 集合名称: ${collectionName}\n`)
    
    let collection
    try {
      collection = await chroma.getCollection({ name: collectionName })
      console.log("✅ 成功连接到集合")
    } catch (error) {
      console.log("❌ 无法连接到集合:", error.message)
      return
    }

    // 2. 统计 Chroma 中的向量数量
    const countResult = await collection.count()
    console.log(`\n📊 Chroma 向量总数: ${countResult}\n`)

    if (countResult === 0) {
      console.log("⚠️  Chroma 中没有向量数据！")
      console.log("   这意味着之前的向量化可能没有成功保存到 Chroma\n")
      
      // 检查数据库状态
      await checkDatabaseStatus()
      return
    }

    // 3. 获取一些样本向量查看元数据
    console.log("📋 查看 Chroma 中的向量样本（前5个）:")
    const sampleResult = await collection.get({
      limit: 5,
      include: ['metadatas', 'documents']
    })

    for (let i = 0; i < sampleResult.ids.length; i++) {
      const id = sampleResult.ids[i]
      const metadata = sampleResult.metadatas[i]
      const docContent = sampleResult.documents[i]?.substring(0, 50) + '...'
      
      console.log(`\n   向量 #${i + 1}:`)
      console.log(`      ID: ${id}`)
      console.log(`      文档ID: ${metadata?.documentId}`)
      console.log(`      来源类型: ${metadata?.sourceType}`)
      console.log(`      文件名: ${metadata?.fileName}`)
      console.log(`      内容预览: ${docContent}`)
    }

    // 4. 按 documentId 分组统计
    console.log("\n\n" + "=".repeat(70))
    console.log("📊 按 documentId 统计向量分布:")
    
    // 获取所有向量的元数据
    const allVectors = await collection.get({
      include: ['metadatas'],
      limit: countResult > 1000 ? 1000 : countResult  // 限制最多查询1000个
    })

    const docVectorCount = {}
    for (let i = 0; i < allVectors.ids.length; i++) {
      const docId = allVectors.metadatas[i]?.documentId
      if (docId) {
        docVectorCount[docId] = (docVectorCount[docId] || 0) + 1
      }
    }

    console.log(`\n   共发现 ${Object.keys(docVectorCount).length} 个文档的向量`)
    
    // 显示前10个文档的向量数量
    const sortedDocs = Object.entries(docVectorCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)

    for (const [docId, count] of sortedDocs) {
      console.log(`   📄 ${docId}: ${count} 个向量块`)
    }

    // 5. 对比数据库和 Chroma
    console.log("\n\n" + "=".repeat(70))
    console.log("🔗 数据库 vs Chroma 对比检查:")

    // 查询所有 PROJECT_DOC
    const projectDocs = await prisma.document.findMany({
      where: { sourceType: 'PROJECT_DOC' },
      select: { id: true, name: true, status: true, vectorIds: true }
    })

    let consistent = 0
    let missingInChroma = 0
    let missingInDB = 0
    let statusMismatch = 0

    console.log(`\n   检查 ${projectDocs.length} 个 PROJECT_DOC...`)

    for (const doc of projectDocs) {
      const vectorCountInChroma = docVectorCount[doc.id] || 0
      const hasVectorsInDB = doc.vectorIds && doc.vectorIds.length > 0
      
      if (vectorCountInChroma > 0 && !hasVectorsInDB && doc.status !== 'INDEXED') {
        // Chroma 有向量，但 DB 没有 vectorIds 且状态不是 INDEXED
        statusMismatch++
        console.log(`\n   ⚠️  状态不一致!`)
        console.log(`      文档: ${doc.name}`)
        console.log(`      ID: ${doc.id}`)
        console.log(`      DB状态: ${doc.status} (应该是 INDEXED)`)
        console.log(`      DB向量数: ${hasVectorsInDB ? doc.vectorIds.length : 0}`)
        console.log(`      Chroma向量数: ${vectorCountInChroma}`)
        console.log(`      💡 建议: 恢复为 INDEXED 并更新 vectorIds`)
      } else if (vectorCountInChroma > 0 && doc.status === 'INDEXED') {
        consistent++
      } else if (vectorCountInChroma === 0 && hasVectorsInDB) {
        missingInChroma++
      } else if (vectorCountInChroma > 0 && !hasVectorsInDB) {
        missingInDB++
      } else {
        // 都没有向量，可能是 PENDING 状态
      }
    }

    console.log(`\n\n   ✅ 一致: ${consistent}`)
    console.log(`   ⚠️  状态不匹配(应恢复): ${statusMismatch}`)
    console.log(`   ❌ DB有但Chroma无(幽灵): ${missingInChroma}`)
    console.log(`   ⚠️  Chroma有但DB无记录: ${missingInDB}`)

    return { 
      totalVectors: countResult,
      docsChecked: projectDocs.length,
      consistent,
      statusMismatch,
      missingInChroma,
      missingInDB,
      docVectorCount
    }

  } catch (error) {
    console.error("\n❌ 检查失败:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

async function checkDatabaseStatus() {
  console.log("\n\n📊 当前数据库状态:")
  
  const stats = await prisma.document.groupBy({
    by: ['sourceType', 'status'],
    _count: true,
    where: {
      sourceType: { in: ['PROJECT_DOC', 'KNOWLEDGE_UPDATE'] }
    },
    orderBy: { sourceType: 'asc' }
  })

  for (const stat of stats) {
    console.log(`   ${stat.sourceType} - ${stat.status}: ${stat._count} 个`)
  }
}

// 运行检查
checkChromaVectors()
  .then(result => {
    if (result && result.statusMismatch > 0) {
      console.log("\n\n⚠️  发现需要修复的数据！请运行恢复脚本。")
    }
  })
  .catch(console.error)
