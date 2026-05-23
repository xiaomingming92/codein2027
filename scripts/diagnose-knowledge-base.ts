import { prisma } from "../lib/prisma"
import { DocStatus, SourceType } from "@/constants/doc-status"

async function diagnosePendingDocuments() {
  console.log("🔍 诊断知识库文档状态...\n")

  try {
    const allDocs = await prisma.document.findMany({
      where: {
        sourceType: { in: [SourceType.PROJECT_DOC, SourceType.KNOWLEDGE_UPDATE] }
      },
      orderBy: { updatedAt: "desc" }
    })

    console.log(`📊 总文档数: ${allDocs.length}\n`)

    const statusGroups = {
      PENDING: allDocs.filter(d => d.status === DocStatus.PENDING),
      PENDING_INDEX: allDocs.filter(d => d.status === DocStatus.PENDING_INDEX),
      INDEXING: allDocs.filter(d => d.status === DocStatus.INDEXING),
      INDEXED: allDocs.filter(d => d.status === DocStatus.INDEXED),
      ERROR: allDocs.filter(d => d.status === DocStatus.ERROR),
      OUTDATED: allDocs.filter(d => d.status === DocStatus.OUTDATED),
    }

    console.log("📈 状态分布:")
    for (const [status, docs] of Object.entries(statusGroups)) {
      if (docs.length > 0) {
        console.log(`   ${status.padEnd(15)}: ${docs.length} 个文档`)
      }
    }
    console.log("")

    const pendingDocs = [...statusGroups.PENDING, ...statusGroups.PENDING_INDEX]
    if (pendingDocs.length > 0) {
      console.log("⚠️  待索引文档详情:")
      for (const doc of pendingDocs) {
        console.log(`\n   📄 ${doc.name}`)
        console.log(`      类型: ${doc.sourceType}`)
        console.log(`      状态: ${doc.status}`)
        console.log(`      文件路径: ${doc.filePath || "(无)"}`)
        console.log(`      文件存在: ${doc.filePath ? "需要检查" : "无文件路径"}`)
        console.log(`      向量IDs: ${doc.vectorIds?.length || 0} 个`)
        console.log(`      最后更新: ${doc.updatedAt}`)
        
        if (doc.metadata) {
          const meta = doc.metadata as Record<string, unknown>
          console.log(`      元数据:`)
          console.log(`        path: ${meta.path || "(无)"}`)
          console.log(`        isSynced: ${meta.isSynced || false}`)
          console.log(`        size: ${meta.size || "(无)"}`)
          console.log(`        mtime: ${meta.mtime || "(无)"}`)
        }
      }
    }

    const errorDocs = statusGroups.ERROR
    if (errorDocs.length > 0) {
      console.log("\n❌ 错误状态文档:")
      for (const doc of errorDocs) {
        console.log(`\n   📄 ${doc.name}`)
        console.log(`      状态: ERROR`)
        console.log(`      文件路径: ${doc.filePath || "(无)"}`)
      }
    }

    const indexedDocs = statusGroups.INDEXED
    if (indexedDocs.length > 0) {
      console.log(`\n✅ 已索引文档: ${indexedDocs.length} 个`)
      for (const doc of indexedDocs.slice(0, 5)) {
        console.log(`   - ${doc.name} (${doc.vectorIds?.length || 0} 个向量)`)
      }
      if (indexedDocs.length > 5) {
        console.log(`   ... 还有 ${indexedDocs.length - 5} 个`)
      }
    }

    console.log("\n💡 建议:")
    if (pendingDocs.length > 0) {
      console.log("   1. 点击「同步知识库」按钮触发向量化")
      console.log("   2. 检查终端输出是否有错误日志")
      console.log("   3. 确认 ChromaDB 是否正常运行: curl http://localhost:8000/api/v1/heartbeat")
      console.log("   4. 确认 Embedding API 是否可用")
    }
    if (errorDocs.length > 0) {
      console.log("   ⚠️  有文档处于 ERROR 状态，可能需要手动清理")
    }

  } catch (error) {
    console.error("❌ 诊断失败:", error)
  } finally {
    await prisma.$disconnect()
  }
}

diagnosePendingDocuments()
