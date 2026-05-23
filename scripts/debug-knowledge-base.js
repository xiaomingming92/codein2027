const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log("\n🔍 排查知识库问题\n")
  console.log("=".repeat(60))

  // 1. 查看所有 KNOWLEDGE_UPDATE 文档的状态分布
  console.log("\n📊 1. KNOWLEDGE_UPDATE 文档状态分布:")
  const knowledgeUpdates = await prisma.document.findMany({
    where: { sourceType: 'KNOWLEDGE_UPDATE' },
    select: { id: true, name: true, status: true, vectorIds: true, createdAt: true }
  })

  const statusCount = {}
  for (const doc of knowledgeUpdates) {
    statusCount[doc.status] = (statusCount[doc.status] || 0) + 1
    if (!statusCount[doc.status + '_examples']) {
      statusCount[doc.status + '_examples'] = []
    }
    if (statusCount[doc.status + '_examples'].length < 2) {
      statusCount[doc.status + '_examples'].push(doc.name)
    }
  }

  for (const [status, count] of Object.entries(statusCount)) {
    if (!isNaN(count)) {
      const examples = statusCount[status + '_examples']
      console.log(`   ${status}: ${count} 个`)
      if (examples && examples.length > 0) {
        console.log(`      示例: ${examples.join(', ')}`)
      }
    }
  }

  // 2. 查看 PROJECT_DOC 文档的状态分布
  console.log("\n📊 2. PROJECT_DOC 文档状态分布:")
  const projectDocs = await prisma.document.findMany({
    where: { sourceType: 'PROJECT_DOC' },
    select: { id: true, name: true, status: true, vectorIds: true, projectId: true }
  })

  const projectStatusCount = {}
  for (const doc of projectDocs) {
    projectStatusCount[doc.status] = (projectStatusCount[doc.status] || 0) + 1
  }

  for (const [status, count] of Object.entries(projectStatusCount)) {
    console.log(`   ${status}: ${count} 个`)
  }

  // 3. 检查有向量的文档 vs 无向量的文档
  console.log("\n📊 3. 向量存储情况:")
  
  const withVectors = knowledgeUpdates.filter(d => d.vectorIds && d.vectorIds.length > 0)
  const withoutVectors = knowledgeUpdates.filter(d => !d.vectorIds || d.vectorIds.length === 0)
  
  console.log(`   KNOWLEDGE_UPDATE - 有向量: ${withVectors.length}, 无向量: ${withoutVectors.length}`)
  
  const projectWithVectors = projectDocs.filter(d => d.vectorIds && d.vectorIds.length > 0)
  const projectWithoutVectors = projectDocs.filter(d => !d.vectorIds || d.vectorIds.length === 0)
  console.log(`   PROJECT_DOC     - 有向量: ${projectWithVectors.length}, 无向量: ${projectWithoutVectors.length}`)

  // 4. 显示几个无向量的 PENDING_INDEX 文档详情
  console.log("\n📋 4. 待处理的用户上传文档（前5个）:")
  const pendingDocs = knowledgeUpdates
    .filter(d => d.status === 'PENDING_INDEX' || d.status === 'PENDING')
    .slice(0, 5)
    
  for (const doc of pendingDocs) {
    console.log(`\n   📄 ${doc.name}`)
    console.log(`      ID: ${doc.id}`)
    console.log(`      状态: ${doc.status}`)
    console.log(`      向量数: ${doc.vectorIds?.length || 0}`)
    console.log(`      上传时间: ${doc.createdAt}`)
  }

  console.log("\n" + "=".repeat(60))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
