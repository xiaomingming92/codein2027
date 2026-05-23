const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function fixData() {
  console.log("\n🔧 知识库数据修复工具\n")
  console.log("=".repeat(60))

  try {
    // 1. 查找假索引的 PROJECT_DOC (状态 INDEXED 但 vectorIds 为空)
    console.log("\n📋 步骤1: 查找假索引的 PROJECT_DOC...")
    const allIndexedProjectDocs = await prisma.document.findMany({
      where: {
        sourceType: 'PROJECT_DOC',
        status: 'INDEXED',
      },
      select: { id: true, name: true, status: true, vectorIds: true }
    })

    // 在 JavaScript 中过滤出 vectorIds 为空的文档
    const fakeIndexedProjectDocs = allIndexedProjectDocs.filter(
      doc => !doc.vectorIds || doc.vectorIds.length === 0
    )

    console.log(`   发现 ${fakeIndexedProjectDocs.length} 个假索引文档`)

    if (fakeIndexedProjectDocs.length > 0) {
      for (const doc of fakeIndexedProjectDocs) {
        console.log(`   📄 ${doc.name} (${doc.id})`)
        
        // 将状态改回 PENDING，下次同步时重新向量化
        await prisma.document.update({
          where: { id: doc.id },
          data: { status: 'PENDING' },
        })
        
        console.log(`      ✅ 已重置为 PENDING 状态`)
      }
      console.log(`\n   ✅ 共修复 ${fakeIndexedProjectDocs.length} 个文档`)
    } else {
      console.log("   ✅ 没有发现假索引文档")
    }

    // 2. 统计修复后的数据
    console.log("\n📊 步骤2: 修复后的数据统计:")
    
    const allDocs = await prisma.document.findMany({
      where: {
        sourceType: { in: ['PROJECT_DOC', 'KNOWLEDGE_UPDATE'] }
      },
      select: {
        sourceType: true,
        status: true,
        vectorIds: true,
      }
    })

    const stats = {
      projectDoc: { total: 0, indexed: 0, pending: 0, withVectors: 0 },
      knowledgeUpdate: { total: 0, indexed: 0, pending: 0, withVectors: 0 }
    }

    for (const doc of allDocs) {
      const type = doc.sourceType.toLowerCase()
      stats[type].total++
      
      if (doc.status === 'INDEXED') stats[type].indexed++
      if (['PENDING', 'PENDING_INDEX'].includes(doc.status)) stats[type].pending++
      
      if (doc.vectorIds && doc.vectorIds.length > 0) {
        stats[type].withVectors++
      }
    }

    console.log("\n   PROJECT_DOC:")
    console.log(`      总计: ${stats.projectDoc.total}`)
    console.log(`      已索引(有向量): ${stats.projectDoc.withVectors}/${stats.projectDoc.indexed}`)
    console.log(`      待处理: ${stats.projectDoc.pending}`)

    console.log("\n   KNOWLEDGE_UPDATE:")
    console.log(`      总计: ${stats.knowledgeUpdate.total}`)
    console.log(`      已索引(有向量): ${stats.knowledgeUpdate.withVectors}/${stats.knowledgeUpdate.indexed}`)
    console.log(`      待处理: ${stats.knowledgeUpdate.pending}`)

    console.log("\n" + "=".repeat(60))
    console.log("✅ 数据修复完成！")
    console.log("\n💡 提示:")
    console.log("   - 假索引的 PROJECT_DOC 已重置为 PENDING")
    console.log("   - 下次点击'同步知识库'时会重新向量化这些文档")
    console.log("   - KNOWLEDGE_UPDATE 文档会在同步时被处理")

  } catch (error) {
    console.error("\n❌ 修复失败:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

fixData()
