/**
 * 审计日志切片导出脚本
 *
 * 从 PostgreSQL AuditLog 表中按维度切片查询并导出为 JSON 文件。
 *
 * 用法:
 *   npm run db:export [选项]
 *
 * 切片维度（可组合）:
 *   --target-type <type>    按 targetType 过滤（如 COMPONENT, DOC, SCHEMA）
 *   --keyword <keyword>     在 action/targetType/targetId/reason 中模糊搜索
 *   --trace-id <id>         按 traceId 精确过滤
 *   --since-hours <n>       仅导出最近 n 小时内的记录
 *   --limit <n>             最大导出条数（默认 1000）
 *   --output <path>         输出文件路径（默认 data/exports/audit-export-{timestamp}.json）
 *
 * 示例:
 *   # 导出所有 COMPONENT 类型的记录
 *   npm run db:export -- --target-type COMPONENT
 *
 *   # 按关键词"farm"切片导出最近 48 小时的记录
 *   npm run db:export -- --keyword farm --since-hours 48
 *
 *   # 按 traceId 导出完整调用链
 *   npm run db:export -- --trace-id trace-abc123
 */

import * as fs from "fs/promises"
import * as path from "path"
import { prisma } from "../src/lib/prisma"

const EXPORT_DIR = path.join(process.cwd(), "data", "exports")

interface ExportMeta {
  exportedAt: string
  filters: {
    targetType?: string
    keyword?: string
    traceId?: string
    sinceHours?: number
    limit: number
  }
  totalCount: number
}

interface ExportData {
  meta: ExportMeta
  logs: Array<{
    id: string
    userId: string
    action: string
    targetType: string
    targetId: string
    traceId: string | null
    reason: string | null
    beforeState: unknown
    afterState: unknown
    createdAt: string
  }>
}

function parseArgs(): {
  targetType?: string
  keyword?: string
  traceId?: string
  sinceHours?: number
  limit: number
  output?: string
} {
  const args = process.argv.slice(2)
  const result: ReturnType<typeof parseArgs> = { limit: 1000 }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--target-type":
        result.targetType = args[++i]
        break
      case "--keyword":
        result.keyword = args[++i]
        break
      case "--trace-id":
        result.traceId = args[++i]
        break
      case "--since-hours":
        result.sinceHours = parseInt(args[++i], 10)
        break
      case "--limit":
        result.limit = parseInt(args[++i], 10)
        break
      case "--output":
        result.output = args[++i]
        break
      case "--help":
        console.log(`用法: npm run db:export -- [选项]

切片维度（可组合）:
  --target-type <type>    按 targetType 过滤（如 COMPONENT, DOC, SCHEMA）
  --keyword <keyword>     在 action/targetType/targetId/reason 中模糊搜索
  --trace-id <id>         按 traceId 精确过滤
  --since-hours <n>       仅导出最近 n 小时内的记录
  --limit <n>             最大导出条数（默认 1000）
  --output <path>         输出文件路径（默认自动生成）

示例:
  # 导出"Round 8"相关的所有变更
  npm run db:export -- --keyword "Round 8"

  # 导出最近 24 小时 COMPONENT 变更
  npm run db:export -- --target-type COMPONENT --since-hours 24

  # 按 traceId 导出完整调用链
  npm run db:export -- --trace-id trace-abc123`)
        process.exit(0)
    }
  }

  return result
}

async function buildWhereClause(args: ReturnType<typeof parseArgs>): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = {}
  const AND: Record<string, unknown>[] = []

  if (args.targetType) {
    AND.push({ targetType: args.targetType })
  }

  if (args.traceId) {
    AND.push({ traceId: args.traceId })
  }

  if (args.keyword) {
    const kw = args.keyword
    AND.push({
      OR: [
        { action: { contains: kw } },
        { targetType: { contains: kw } },
        { targetId: { contains: kw } },
        { reason: { contains: kw } },
      ],
    })
  }

  if (args.sinceHours) {
    const since = new Date(Date.now() - args.sinceHours * 60 * 60 * 1000)
    AND.push({ createdAt: { gte: since } })
  }

  if (AND.length > 0) {
    where.AND = AND
  }

  return where
}

async function main() {
  const args = parseArgs()

  console.log("🔍 审计日志切片导出")
  console.log("筛选条件:", JSON.stringify({
    targetType: args.targetType || "(不限)",
    keyword: args.keyword || "(不限)",
    traceId: args.traceId || "(不限)",
    sinceHours: args.sinceHours || "(不限)",
    limit: args.limit,
  }, null, 2))
  console.log("")

  const where = await buildWhereClause(args)

  type LogRecord = Awaited<ReturnType<typeof prisma.auditLog.findMany>>[number]

  const [totalCount, records] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: args.limit,
    }),
  ])

  if (records.length === 0) {
    console.log("⚠️  没有匹配的审计记录。尝试放宽过滤条件或检查数据库是否正常运行。")
    await prisma.$disconnect()
    return
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const outputPath = args.output || path.join(EXPORT_DIR, `audit-export-${timestamp}.json`)

  await fs.mkdir(EXPORT_DIR, { recursive: true })

  const exportData: ExportData = {
    meta: {
      exportedAt: new Date().toISOString(),
      filters: {
        targetType: args.targetType,
        keyword: args.keyword,
        traceId: args.traceId,
        sinceHours: args.sinceHours,
        limit: args.limit,
      },
      totalCount,
    },
    logs: records.map((r: LogRecord) => ({
      id: r.id,
      userId: r.userId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      traceId: r.traceId,
      reason: r.reason,
      beforeState: r.beforeState,
      afterState: r.afterState,
      createdAt: r.createdAt.toISOString(),
    })),
  }

  await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), "utf-8")

  console.log(`✅ 导出完成`)
  console.log(`   总匹配: ${totalCount} 条`)
  console.log(`   已导出: ${records.length} 条 (limit=${args.limit})`)
  console.log(`   文件: ${outputPath}`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error("❌ 导出失败:", err)
  await prisma.$disconnect()
  process.exit(1)
})
