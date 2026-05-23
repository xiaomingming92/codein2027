import { syncKnowledgeBase, getSyncStats } from "../src/services/knowledge-sync"

async function main() {
  console.log("开始同步文件系统知识库...\n")

  const stats = await getSyncStats()
  console.log(`当前状态: 总计 ${stats.total} 个文档`)
  console.log(`  - 已索引: ${stats.indexed}`)
  console.log(`  - 待处理(PROJECT_DOC): ${stats.pending}`)
  console.log(`  - 待索引(KNOWLEDGE_UPDATE): ${stats.pendingIndex}`)
  console.log(`  - 错误: ${stats.errors}\n`)

  const result = await syncKnowledgeBase((message, progress) => {
    console.log(`[${progress.toString().padStart(3)}%] ${message}`)
  })

  console.log("\n同步结果:")
  console.log(`  - 项目文档新增: ${result.projectDocAdded}`)
  console.log(`  - 项目文档更新: ${result.projectDocUpdated}`)
  console.log(`  - 项目文档删除: ${result.projectDocDeleted}`)
  console.log(`  - 项目文档未变: ${result.projectDocUnchanged}`)
  console.log(`  - 上传文档已索引: ${result.knowledgeUpdateIndexed}`)
  console.log(`  - 上传文档错误: ${result.knowledgeUpdateErrors}`)

  if (result.errors.length > 0) {
    console.log("\n错误列表:")
    result.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`)
    })
  }

  console.log(`\n同步${result.success ? "成功" : "完成（有错误）"}`)

  process.exit(result.success ? 0 : 1)
}

main().catch((error) => {
  console.error("同步失败:", error)
  process.exit(1)
})
