import { prisma } from "../src/lib/prisma"
import { DocStatus, SourceType } from "@prisma/client"
import { syncKnowledgeBase } from "../src/services/knowledge-sync"
import { deleteKnowledgeVectors, resetChromaClient } from "../src/services/knowledge-indexer"
import { audit, auditPhaseStart, auditPhaseEnd } from "../src/lib/audit-logger"
import { CHROMA_URL, CHROMA_AUTH_TOKEN, CHROMA_COLLECTION } from "../src/config/chroma-config"

class DirectChromaClient {
  private baseUrl: string
  private headers: Record<string, string>

  constructor(baseUrl: string, authToken?: string) {
    this.baseUrl = baseUrl
    this.headers = { "Content-Type": "application/json" }
    if (authToken) {
      this.headers["Authorization"] = `Bearer ${authToken}`
    }
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: { ...this.headers, ...options?.headers },
    })
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Chroma API error: ${response.status} - ${error}`)
    }
    return response.json()
  }

  async deleteCollection(name: string) {
    return this.request(`/api/v1/collections/${name}`, { method: "DELETE" })
  }

  async listCollections() {
    return this.request<Array<{ name: string; id: string }>>("/api/v1/collections")
  }
}

async function main() {
  console.log("═══════════════════════════════════════")
  console.log("  知识库重置工具")
  console.log("═══════════════════════════════════════\n")

  auditPhaseStart("SYNC_START", "知识库重置")

  console.log("[步骤 1/4] 删除 ChromaDB 集合...")
  try {
    const client = new DirectChromaClient(CHROMA_URL, CHROMA_AUTH_TOKEN)
    await client.deleteCollection(CHROMA_COLLECTION)
    audit("SYNC_DONE", `ChromaDB 集合 "${CHROMA_COLLECTION}" 已删除`)
    console.log(`  ✅ 集合 "${CHROMA_COLLECTION}" 已删除\n`)
  } catch (error) {
    audit("SYNC_DONE", `ChromaDB 集合删除失败（可能不存在）: ${error instanceof Error ? error.message : String(error)}`)
    console.log(`  ⚠️ 集合删除失败（可能不存在），继续...\n`)
  }

  resetChromaClient()

  console.log("[步骤 2/4] 重置数据库文档状态...")
  const allDocs = await prisma.document.findMany({
    where: {
      sourceType: { in: [SourceType.PROJECT_DOC, SourceType.KNOWLEDGE_UPDATE] },
    },
    select: { id: true, name: true, status: true, vectorIds: true, sourceType: true },
  })

  console.log(`  找到 ${allDocs.length} 个文档`)

  let resetCount = 0
  for (const doc of allDocs) {
    await prisma.document.update({
      where: { id: doc.id },
      data: {
        status: doc.sourceType === SourceType.PROJECT_DOC ? DocStatus.PENDING : DocStatus.PENDING_INDEX,
        vectorIds: [],
        metadata: {
          ...(doc.sourceType === SourceType.PROJECT_DOC ? {} : {}),
          resetAt: new Date().toISOString(),
        },
      },
    })
    resetCount++
  }
  audit("SYNC_DONE", `数据库: ${resetCount} 个文档状态已重置`)
  console.log(`  ✅ ${resetCount} 个文档状态已重置为 PENDING\n`)

  console.log("[步骤 3/4] 重新同步知识库...")
  const result = await syncKnowledgeBase((message, progress) => {
    console.log(`  [${progress.toString().padStart(3)}%] ${message}`)
  })

  console.log(`\n[步骤 4/4] 验证结果...`)
  const finalDocs = await prisma.document.findMany({
    where: {
      sourceType: { in: [SourceType.PROJECT_DOC, SourceType.KNOWLEDGE_UPDATE] },
    },
    select: { id: true, name: true, status: true, vectorIds: true },
  })

  const indexed = finalDocs.filter((d) => d.status === DocStatus.INDEXED)
  const failed = finalDocs.filter((d) => d.status === DocStatus.ERROR)
  const pending = finalDocs.filter((d) => d.status === DocStatus.PENDING || d.status === DocStatus.PENDING_INDEX)

  console.log(`  ✅ 已索引: ${indexed.length}`)
  console.log(`  ⏳ 待处理: ${pending.length}`)
  console.log(`  ❌ 失败: ${failed.length}`)

  if (failed.length > 0) {
    console.log("\n  失败文档:")
    for (const doc of failed) {
      console.log(`    - ${doc.name} (${doc.id})`)
    }
  }

  auditPhaseEnd("SYNC_START", `重置完成: 已索引 ${indexed.length}, 待处理 ${pending.length}, 失败 ${failed.length}`)

  console.log("\n═══════════════════════════════════════")
  console.log(`  重置${failed.length === 0 ? "成功" : "完成（有失败）"}！`)
  console.log("═══════════════════════════════════════")

  await prisma.$disconnect()
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error("重置失败:", error)
  process.exit(1)
})
