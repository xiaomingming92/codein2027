const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function analyzeData() {
  console.log("\n🔍 详细分析数据库中的文档状态\n")
  console.log("=".repeat(70))

  try {
    // 1. 查看 PROJECT_DOC 的详细情况
    console.log("\n📋 1. 所有 PROJECT_DOC 文档详情:")
    const projectDocs = await prisma.document.findMany({
      where: { sourceType: 'PROJECT_DOC' },
      select: {
        id: true,
        name: true,
        status: true,
        vectorIds: true,
        createdAt: true,
        updatedAt: true,
        metadata: true
      },
      orderBy: { updatedAt: 'desc' }
    })

    let indexedWithVectors = 0
    let indexedWithoutVectors = 0
    let pendingDocs = []
    
    for (const doc of projectDocs) {
      const hasVectors = doc.vectorIds && doc.vectorIds.length > 0
      const meta = doc.metadata || {}
      
      if (doc.status === 'INDEXED') {
        if (hasVectors) {
          indexedWithVectors++
          console.log(`\n   ✅ ${doc.name}`)
          console.log(`      状态: ${doc.status} | 向量数: ${doc.vectorIds.length} | 更新时间: ${doc.updatedAt}`)
        } else {
          indexedWithoutVectors++
          console.log(`\n   ⚠️  ${doc.name}`)
          console.log(`      状态: ${doc.status} 但 vectorIds 为空!`)
          console.log(`      更新时间: ${doc.updatedAt}`)
          console.log(`      metadata.path: ${meta.path || 'N/A'}`)
        }
      } else if (['PENDING', 'PENDING_INDEX'].includes(doc.status)) {
        pendingDocs.push(doc)
        console.log(`\n   ⏳ ${doc.name}`)
        console.log(`      状态: ${doc.status} | 向量数: ${hasVectors ? doc.vectorIds.length : 0}`)
        console.log(`      创建时间: ${doc.createdAt} | 更新时间: ${doc.updatedAt}`)
        
        // 检查是否有向量化相关的元数据
        if (meta.isSynced) {
          console.log(`      ⚠️  metadata.isSynced = true (说明曾被同步过)`)
        }
        if (meta.vectorCount) {
          console.log(`      ⚠️  metadata.vectorCount = ${meta.vectorCount} (可能有历史向量)`)
        }
      }
    }

    console.log("\n\n" + "-".repeat(70))
    console.log("📊 PROJECT_DOC 统计:")
    console.log(`   ✅ INDEXED 且有向量: ${indexedWithVectors}`)
    console.log(`   ⚠️  INDEXED 但无向量(假索引): ${indexedWithoutVectors}`)
    console.log(`   ⏳ PENDING/PENDING_INDEX: ${pendingDocs.length}`)

    // 2. 查看 KNOWLEDGE_UPDATE 的详细情况
    console.log("\n\n" + "=".repeat(70))
    console.log("\n📋 2. 所有 KNOWLEDGE_UPDATE 文档详情:")
    
    const knowledgeUpdates = await prisma.document.findMany({
      where: { sourceType: 'KNOWLEDGE_UPDATE' },
      select: {
        id: true,
        name: true,
        status: true,
        vectorIds: true,
        createdAt: true,
        updatedAt: true,
        filePath: true
      },
      orderBy: { createdAt: 'asc' }
    })

    for (const doc of knowledgeUpdates) {
      const hasVectors = doc.vectorIds && doc.vectorIds.length > 0
      
      console.log(`\n   ${doc.status === 'INDEXED' ? '✅' : '⏳'} ${doc.name}`)
      console.log(`      状态: ${doc.status} | 向量数: ${hasVectors ? doc.vectorIds.length : 0}`)
      console.log(`      上传时间: ${doc.createdAt} | 更新时间: ${doc.updatedAt}`)
    }

    // 3. 关键问题诊断
    console.log("\n\n" + "=".repeat(70))
    console.log("\n🔍 3. 问题诊断:")

    if (pendingDocs.length > 0) {
      console.log(`\n   发现 ${pendingDocs.length} 个 PROJECT_DOC 处于 PENDING 状态:`)
      
      // 检查这些文档是否应该被恢复
      for (const doc of pendingDocs.slice(0, 5)) {
        const timeDiff = Date.now() - new Date(doc.updatedAt).getTime()
        const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60))
        
        console.log(`\n   📄 ${doc.name}`)
        console.log(`      最后更新: ${hoursAgo} 小时前`)
        console.log(`      ID: ${doc.id}`)
        
        if (hoursAgo < 1) {
          console.log(`      💡 刚刚被修改，可能是误操作导致的重置！`)
        }
      }

      console.log("\n\n   ⚠️  建议:")
      console.log("   这些静态文档如果之前已经向量化成功过，应该恢复为 INDEXED 状态。")
      console.log("   但由于 Chroma 服务未运行，无法验证向量是否真实存在。")
      console.log("   建议操作:")
      console.log("   1. 启动 Chroma 服务后重新验证")
      console.log("   2. 或者直接重新同步一次知识库（会重新向量化）")
    }

  } catch (error) {
    console.error("\n❌ 分析失败:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

analyzeData()
